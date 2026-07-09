// src/services/whatsappService.js
// Wrapper autour de la WhatsApp Cloud API (Meta Graph API).
// Doc officielle : https://developers.facebook.com/docs/whatsapp/cloud-api

const axios = require('axios');

const GRAPH_VERSION = 'v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

function graphUrl(pathSuffix) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${pathSuffix}`;
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
}

/**
 * Envoie un message texte simple à un numéro WhatsApp.
 * @param {string} toPhoneNumber - format international sans "+", ex: "22961234567"
 * @param {string} text
 */
async function sendTextMessage(toPhoneNumber, text) {
  // WhatsApp limite ~4096 caractères par message ; on découpe si besoin.
  const chunks = splitMessage(text, 4000);
  for (const chunk of chunks) {
    await axios.post(graphUrl(`${PHONE_NUMBER_ID}/messages`), {
      messaging_product: 'whatsapp',
      to: toPhoneNumber,
      type: 'text',
      text: { body: chunk, preview_url: false }
    }, { headers: authHeaders() });
  }
}

/**
 * Envoie un message avec des boutons rapides (max 3 boutons, WhatsApp impose cette limite).
 * Utile pour les menus (ex: choisir une langue, choisir Diagnostic/Conseil/Météo).
 */
async function sendButtonsMessage(toPhoneNumber, bodyText, buttons) {
  // buttons: [{ id: 'menu_diag', title: '📷 Diagnostic' }, ...] max 3 items, title max 20 caractères
  await axios.post(graphUrl(`${PHONE_NUMBER_ID}/messages`), {
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) }
        }))
      }
    }
  }, { headers: authHeaders() });
}

/**
 * Envoie une liste déroulante interactive (plus de 3 options possibles, ex: choix de langue).
 */
async function sendListMessage(toPhoneNumber, bodyText, buttonLabel, sections) {
  // sections: [{ title: 'Langues', rows: [{ id:'lang_fr', title:'Français' }, ...] }]
  await axios.post(graphUrl(`${PHONE_NUMBER_ID}/messages`), {
    messaging_product: 'whatsapp',
    to: toPhoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: { button: buttonLabel, sections }
    }
  }, { headers: authHeaders() });
}

/**
 * Marque un message reçu comme "lu" (coche bleue).
 */
async function markAsRead(messageId) {
  await axios.post(graphUrl(`${PHONE_NUMBER_ID}/messages`), {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId
  }, { headers: authHeaders() });
}

/**
 * Récupère l'URL temporaire d'un média (photo envoyée par l'utilisateur), puis le télécharge en base64.
 * @param {string} mediaId - fourni dans le webhook (message.image.id)
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
async function downloadMedia(mediaId) {
  const metaRes = await axios.get(graphUrl(mediaId), { headers: authHeaders() });
  const mediaUrl = metaRes.data.url;
  const mimeType = metaRes.data.mime_type;

  const fileRes = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    responseType: 'arraybuffer'
  });

  const base64 = Buffer.from(fileRes.data).toString('base64');
  return { base64, mimeType };
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

module.exports = {
  sendTextMessage,
  sendButtonsMessage,
  sendListMessage,
  markAsRead,
  downloadMedia
};
