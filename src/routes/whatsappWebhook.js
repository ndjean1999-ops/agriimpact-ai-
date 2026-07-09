// src/routes/whatsappWebhook.js
//
// C'est le coeur de l'intégration WhatsApp. Meta envoie ici (en POST) chaque
// message reçu par ton numéro WhatsApp Business. On répond toujours 200 OK
// immédiatement (sinon Meta réessaie pendant 7 jours), puis on traite le
// message de façon asynchrone.
//
// Doc officielle : https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/

const express = require('express');
const router = express.Router();

const whatsapp = require('../services/whatsappService');
const claude = require('../services/claudeService');
const userModel = require('../db/models/userModel');
const conversationModel = require('../db/models/conversationModel');
const listingModel = require('../db/models/listingModel');
const managerModel = require('../db/models/managerModel');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// -----------------------------------------------------------
// 1. VÉRIFICATION DU WEBHOOK (GET)
// Meta appelle cette route une seule fois, quand tu configures le webhook
// dans le dashboard. Il faut renvoyer exactement le "challenge" reçu.
// -----------------------------------------------------------
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook WhatsApp vérifié avec succès.');
    return res.status(200).send(challenge);
  }
  console.warn('⚠️ Échec de vérification du webhook (token incorrect).');
  return res.sendStatus(403);
});

// -----------------------------------------------------------
// 2. RÉCEPTION DES MESSAGES (POST)
// -----------------------------------------------------------
router.post('/', async (req, res) => {
  // Répondre 200 immédiatement : Meta n'attend pas le traitement complet.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return; // ex: notification de statut (lu/livré), pas un message entrant

    const fromPhone = message.from; // ex: "22961234567"
    const waName = value.contacts?.[0]?.profile?.name;
    const user = userModel.findOrCreateByPhone(fromPhone, waName);

    await whatsapp.markAsRead(message.id).catch(() => {}); // best-effort, ne bloque pas le flux

    await routeMessage(user, message);
  } catch (err) {
    console.error('Erreur traitement webhook WhatsApp:', err.response?.data || err.message);
  }
});

// -----------------------------------------------------------
// ROUTAGE DES MESSAGES — petite machine à états par utilisateur
// -----------------------------------------------------------

// État en mémoire simple : quel "mode" l'utilisateur est en train d'utiliser.
// Pour une vraie échelle, ceci devrait être en base ou en cache (Redis),
// mais pour démarrer une Map en mémoire suffit (elle se réinitialise au redémarrage du serveur).
const userSessions = new Map();

function getSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { mode: 'menu' });
  }
  return userSessions.get(userId);
}

async function routeMessage(user, message) {
  const session = getSession(user.id);
  const lang = user.preferred_language || 'fr';

  // --- Premier contact jamais vu : on propose le choix de langue avant tout ---
  if (!user.preferred_language && message.type !== 'interactive') {
    return sendLanguagePicker(user.phone_number);
  }

  // --- Image reçue : on lance toujours le diagnostic, peu importe le mode ---
  if (message.type === 'image') {
    return handleImageDiagnosis(user, message, lang);
  }

  // --- Réponse à un bouton ou une liste interactive ---
  if (message.type === 'interactive') {
    const selectionId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
    if (selectionId?.startsWith('lang_')) {
      return handleLanguageSelection(user, selectionId);
    }
    if (selectionId) return handleMenuSelection(user, selectionId, lang);
  }

  // --- Message texte ---
  if (message.type === 'text') {
    const text = message.text.body.trim();
    const lower = text.toLowerCase();

    // Commande globale : changer de langue à tout moment
    if (['langue', 'language', 'lang'].includes(lower)) {
      return sendLanguagePicker(user.phone_number);
    }

    // Commandes globales, toujours actives
    if (['menu', 'bonjour', 'salut', 'hi', 'hello', 'start'].includes(lower)) {
      session.mode = 'menu';
      return sendMainMenu(user.phone_number, lang);
    }

    if (session.mode === 'chat') {
      return handleAdvisorChat(user, text, lang);
    }

    if (session.mode === 'market_search') {
      return handleMarketSearch(user, text, lang);
    }

    // Par défaut : on traite comme une question au conseiller (le plus utile par défaut)
    session.mode = 'chat';
    return handleAdvisorChat(user, text, lang);
  }
}

// -----------------------------------------------------------
// CHOIX DE LANGUE — liste interactive, affichée au premier contact
// et accessible à tout moment via la commande "langue" / "language"
// -----------------------------------------------------------
const LANGUAGE_OPTIONS = [
  { id: 'lang_fr', title: 'Français', description: '🇧🇯 Langue par défaut' },
  { id: 'lang_en', title: 'English', description: '🇬🇧 English' },
  { id: 'lang_fon', title: 'Fɔngbè (Fon)', description: 'Glesi Fɔngbè mɛ' },
  { id: 'lang_bariba', title: 'Baatonu (Bariba)', description: 'Sɛnsi Baatonu mɛ' },
  { id: 'lang_dendi', title: 'Dendi', description: 'Faami Dendi mɛ' },
  { id: 'lang_yor', title: 'Yorùbá', description: 'Olùbáwí ní Yorùbá' }
];

async function sendLanguagePicker(phone) {
  await whatsapp.sendListMessage(
    phone,
    '🌍 Bonjour ! Choisis ta langue / Choose your language :',
    'Choisir',
    [{ title: 'Langues disponibles', rows: LANGUAGE_OPTIONS }]
  );
}

async function handleLanguageSelection(user, selectionId) {
  const langCode = selectionId.replace('lang_', '');
  const validCodes = ['fr', 'en', 'fon', 'bariba', 'dendi', 'yor'];
  const lang = validCodes.includes(langCode) ? langCode : 'fr';

  userModel.updateLanguage(user.id, lang);
  const session = getSession(user.id);
  session.mode = 'menu';

  return sendMainMenu(user.phone_number, lang);
}

async function sendMainMenu(phone, lang) {
  const t = MENU_TEXT[lang] || MENU_TEXT.fr;
  // Le texte d'accueil peut être surchargé depuis le panneau Manager
  // (clé "whatsapp.greeting", par langue) sans toucher au code ni redéployer.
  const override = managerModel.getContent('whatsapp.greeting', lang);
  const greeting = override ? override.content_value : t.greeting;

  await whatsapp.sendButtonsMessage(phone, greeting, [
    { id: 'menu_diag', title: t.btnDiag },
    { id: 'menu_chat', title: t.btnChat },
    { id: 'menu_market', title: t.btnMarket }
  ]);
}


async function handleMenuSelection(user, buttonId, lang) {
  const session = getSession(user.id);
  const t = MENU_TEXT[lang] || MENU_TEXT.fr;

  if (buttonId === 'menu_diag') {
    session.mode = 'diag';
    return whatsapp.sendTextMessage(user.phone_number, t.askPhoto);
  }
  if (buttonId === 'menu_chat') {
    session.mode = 'chat';
    return whatsapp.sendTextMessage(user.phone_number, t.askQuestion);
  }
  if (buttonId === 'menu_market') {
    session.mode = 'market_search';
    const listings = listingModel.list({ limit: 5 });
    await whatsapp.sendTextMessage(user.phone_number, formatListings(listings, t));
  }
}

async function handleImageDiagnosis(user, message, lang) {
  const t = MENU_TEXT[lang] || MENU_TEXT.fr;
  try {
    await whatsapp.sendTextMessage(user.phone_number, t.analyzing);
    const { base64, mimeType } = await whatsapp.downloadMedia(message.image.id);
    const result = await claude.diagnoseCrop(base64, mimeType, lang);

    conversationModel.saveDiagnostic(user.id, 'whatsapp', message.image.id, result);
    await whatsapp.sendTextMessage(user.phone_number, formatDiagnosisForWhatsApp(result, t));
  } catch (err) {
    console.error('Erreur diagnostic image:', err.response?.data || err.message);
    await whatsapp.sendTextMessage(user.phone_number, t.error);
  }
}

async function handleAdvisorChat(user, text, lang) {
  const t = MENU_TEXT[lang] || MENU_TEXT.fr;
  try {
    conversationModel.addMessage(user.id, 'whatsapp', 'user', text);
    const history = conversationModel.getRecentHistory(user.id, 12);
    const reply = await claude.askAdvisor(history, lang);
    conversationModel.addMessage(user.id, 'whatsapp', 'assistant', reply);
    await whatsapp.sendTextMessage(user.phone_number, reply);
  } catch (err) {
    console.error('Erreur chat conseiller:', err.response?.data || err.message);
    await whatsapp.sendTextMessage(user.phone_number, t.error);
  }
}

async function handleMarketSearch(user, text, lang) {
  const t = MENU_TEXT[lang] || MENU_TEXT.fr;
  const listings = listingModel.list({ query: text, limit: 5 });
  await whatsapp.sendTextMessage(user.phone_number, formatListings(listings, t));
}

function formatListings(listings, t) {
  if (!listings.length) return t.noListings;
  const lines = listings.map(l =>
    `🌾 *${l.title}*\n💰 ${l.price_amount ? l.price_amount + ' ' + l.currency : '—'} ${l.price_unit ? '/ ' + l.price_unit : ''}\n📍 ${l.location_name || '—'}\n📞 ${l.phone_number}`
  );
  return t.listingsHeader + '\n\n' + lines.join('\n\n');
}

function formatDiagnosisForWhatsApp(result, t) {
  let msg = `🔎 *${result.diagnostic || '—'}*\n${t.confidence}: ${result.confiance || '—'}\n\n`;
  msg += `${t.causes}:\n${result.causes || '—'}\n\n`;
  if (result.traitement_bio?.length) {
    msg += `🌿 ${t.bio}:\n` + result.traitement_bio.map(x => `• ${x}`).join('\n') + '\n\n';
  }
  if (result.traitement_conventionnel?.length) {
    msg += `🧪 ${t.conventional}:\n` + result.traitement_conventionnel.map(x => `• ${x}`).join('\n') + '\n\n';
  }
  if (result.prevention?.length) {
    msg += `🛡️ ${t.prevention}:\n` + result.prevention.map(x => `• ${x}`).join('\n');
  }
  return msg.trim();
}

// -----------------------------------------------------------
// Textes du menu, par langue (sous-ensemble — étendre selon besoin)
// -----------------------------------------------------------
const MENU_TEXT = {
  fr: {
    greeting: 'Bonjour 🌾 ! Je suis AgriImpact AI, ton conseiller agricole. Que veux-tu faire ?',
    btnDiag: '📷 Diagnostic', btnChat: '💬 Conseiller', btnMarket: '🛒 Marché',
    askPhoto: 'Envoie-moi une photo nette de ta plante (feuille, fruit ou tige touchée).',
    askQuestion: 'Pose-moi ta question sur tes cultures, ton élevage ou la météo.',
    analyzing: '🔍 Analyse de ta photo en cours, un instant...',
    error: 'Désolé, une erreur est survenue. Réessaie dans un instant, ou écris "menu" pour revenir au menu.',
    confidence: 'Confiance', causes: 'Causes probables', bio: 'Traitement biologique',
    conventional: 'Traitement conventionnel', prevention: 'Prévention',
    listingsHeader: '🛒 Annonces disponibles :', noListings: 'Aucune annonce trouvée pour le moment.'
  },
  en: {
    greeting: 'Hello 🌾! I\'m AgriImpact AI, your farming advisor. What would you like to do?',
    btnDiag: '📷 Diagnosis', btnChat: '💬 Advisor', btnMarket: '🛒 Market',
    askPhoto: 'Send me a clear photo of your plant (affected leaf, fruit or stem).',
    askQuestion: 'Ask me about your crops, livestock or the weather.',
    analyzing: '🔍 Analyzing your photo, one moment...',
    error: 'Sorry, something went wrong. Try again, or type "menu" to go back.',
    confidence: 'Confidence', causes: 'Likely causes', bio: 'Biological treatment',
    conventional: 'Conventional treatment', prevention: 'Prevention',
    listingsHeader: '🛒 Available listings:', noListings: 'No listings found right now.'
  },
  fon: {
    greeting: 'Kú àfɔ 🌾 ! Nyɛ wɛ nyí AgriImpact AI, glesigan aklunɔ towe. Etɛ a jló na wà?',
    btnDiag: '📷 Nukúnkún', btnChat: '💬 Aklunɔ', btnMarket: '🛒 Axi',
    askPhoto: 'Wɛ̀n foto towe ɖò atín towe jí (aflɔ́, sínsɛ́n alǒ atín sín azɔn).',
    askQuestion: 'Kàn nu byɔ dó nuvivɛ́ towe, kanlin towe alǒ jɔhɔn jí.',
    analyzing: '🔍 É ɖò foto towe kpɔ́n wɛ́, kpɔ́n cí kpɔ́...',
    error: 'Mí kɛn nu, hwɛ ɖé jɛ. Lɛ̀ tɛnkpɔ́n, alǒ wlán "menu" bo lɛ́ kɔ wá menu ɔ jí.',
    confidence: 'Jiɖiɖe', causes: 'Hwɛjijɔ e sixu nyí', bio: 'Azɔnyiyi bio tɔn',
    conventional: 'Azɔnyiyi nukɔn tɔn', prevention: 'Yiyi gbɛ́ ɖò nukɔn',
    listingsHeader: '🛒 Nu e ɖò axi jí lɛ :', noListings: 'Nu ɖěbǔ ma ɖè ǎ dìn.'
  },
  bariba: {
    greeting: 'Bonjour 🌾 ! N nyi AgriImpact AI, sɛnsi karamɔ towe. Ba a yi wa?',
    btnDiag: '📷 Kparibu', btnChat: '💬 Karamɔ', btnMarket: '🛒 Sɛɛ',
    askPhoto: 'Ko foto ganji n yi alaa atin towe yi tɔn (aflɔ, sinsɛn alaa atin sin azɔn).',
    askQuestion: 'Sun woru sɛnsi towe, kanlin towe alaa du jí.',
    analyzing: '🔍 Foto towe kparibu ɖò wuru, kpɔn cí kpɔ...',
    error: 'Wahala ɖe jɛ. Lɛ tɛnkpɔn, alaa wla "menu" ka lɛ wa menu ɔ jí.',
    confidence: 'Jiɖiɖe', causes: 'Wahala bibu', bio: 'Wárá bio tɔn',
    conventional: 'Wárá kpari tɔn', prevention: 'Gudu kpɔnkpɔn',
    listingsHeader: '🛒 Nu bibi sɛɛ jí :', noListings: 'Nu ɖebu ma ɖe dìn.'
  },
  dendi: {
    greeting: 'Fofo 🌾 ! N nyi AgriImpact AI, faami karamɔ towe. Ba a yi wa?',
    btnDiag: '📷 Kparibu', btnChat: '💬 Karamɔ', btnMarket: '🛒 Sɛɛ',
    askPhoto: 'Ko foto ganji n yi alaa atin towe yi tɔn (aflɔ, sinsɛn alaa atin sin azɔn).',
    askQuestion: 'Sun woru faami towe, kanlin towe alaa jɔhɔn jí.',
    analyzing: '🔍 Foto towe kparibu ɖò wuru, kpɔn cí kpɔ...',
    error: 'Wahala ɖe jɛ. Lɛ tɛnkpɔn, alaa wla "menu" ka lɛ wa menu ɔ jí.',
    confidence: 'Jiɖiɖe', causes: 'Wahala bibu', bio: 'Wárá bio tɔn',
    conventional: 'Wárá kpari tɔn', prevention: 'Gudu kpɔnkpɔn',
    listingsHeader: '🛒 Nu bibi sɛɛ jí :', noListings: 'Nu ɖebu ma ɖe dìn.'
  },
  yor: {
    greeting: 'Báwo 🌾 ! Èmi ni AgriImpact AI, olùbáwí àgbẹ̀ rẹ. Kí ni o fẹ́ ṣe?',
    btnDiag: '📷 Àyẹ̀wò', btnChat: '💬 Olùbáwí', btnMarket: '🛒 Ọjà',
    askPhoto: 'Fi fọ́tò tó ṣe kedere ti ọgbìn rẹ ránṣẹ́ (ewé, èso tàbí igi tí ó kan).',
    askQuestion: 'Béèrè lọ́wọ́ mi nípa ọgbìn rẹ, ẹran ọ̀sìn rẹ tàbí ojú ọjọ́.',
    analyzing: '🔍 Ń ṣàyẹ̀wò fọ́tò rẹ, dúró ní ìṣẹ́jú kan...',
    error: 'Má bínú, àṣìṣe kan ṣẹlẹ̀. Gbìyànjú lẹ́ẹ̀kan sí i, tàbí kọ "menu" láti padà sí àtòjọ.',
    confidence: 'Ìgbẹ́kẹ̀lé', causes: 'Àwọn ìdí tó ṣeéṣe', bio: 'Ìtọ́jú onípilẹ̀ṣẹ̀',
    conventional: 'Ìtọ́jú ìbílẹ̀', prevention: 'Ìdènà',
    listingsHeader: '🛒 Àwọn ọjà tó wà:', noListings: 'A kò rí ọjà kankan lọ́wọ́lọ́wọ́.'
  }
};

module.exports = router;
