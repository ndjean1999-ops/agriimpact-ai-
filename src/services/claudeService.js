// src/services/claudeService.js
// Centralise tous les appels à l'API Anthropic (Claude) :
// - diagnostic photo des cultures
// - conseiller agricole conversationnel
// Utilisé à la fois par le webhook WhatsApp et par l'API web.

const axios = require('axios');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const LANG_NAMES = {
  fr: 'français', en: 'English', fon: 'Fon (Fɔngbè)',
  bariba: 'Bariba (Baatonu)', dendi: 'Dendi', yor: 'Yoruba'
};

function anthropicHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  };
}

/**
 * Analyse une photo de culture et retourne un diagnostic structuré.
 * @param {string} base64Image - image encodée en base64 (sans préfixe data:...)
 * @param {string} mediaType - ex: "image/jpeg"
 * @param {string} lang - code langue (fr, en, fon, bariba, dendi, yor)
 * @returns {Promise<object>} diagnostic structuré
 */
async function diagnoseCrop(base64Image, mediaType, lang = 'fr') {
  const langName = LANG_NAMES[lang] || 'français';

  const systemPrompt = `Tu es un agronome expert spécialisé dans les cultures d'Afrique de l'Ouest (maïs, soja, manioc, coton, légumes maraîchers) et l'élevage local. Réponds en ${langName}. Analyse l'image envoyée par un agriculteur et réponds UNIQUEMENT en JSON valide (sans markdown, sans backticks), structure exacte :
{
  "diagnostic": "nom court du problème (maladie, ravageur, carence, stress hydrique, ou plante saine)",
  "confiance": "haute" | "moyenne" | "basse",
  "causes": "explication courte, 2-3 phrases",
  "traitement_bio": ["2-4 actions biologiques/naturelles"],
  "traitement_conventionnel": ["2-4 actions conventionnelles si pertinent, sinon liste vide"],
  "prevention": ["2-3 mesures préventives"]
}
Tout le texte doit être en ${langName}. Sois concret, adapté au contexte rural ouest-africain.`;

  const response = await axios.post(ANTHROPIC_API_URL, {
    model: MODEL,
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
        { type: 'text', text: 'Analyse cette photo et donne ton diagnostic au format JSON demandé.' }
      ]
    }]
  }, { headers: anthropicHeaders() });

  const textBlock = (response.data.content || []).find(b => b.type === 'text');
  const cleaned = (textBlock ? textBlock.text : '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Génère une réponse du conseiller agricole, avec historique de conversation.
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {string} lang
 * @returns {Promise<string>} réponse texte
 */
async function askAdvisor(messages, lang = 'fr') {
  const langName = LANG_NAMES[lang] || 'français';

  const systemPrompt = `Tu es le Conseiller Agricole IA d'AgriImpact AI, pour les agriculteurs et éleveurs du Bénin et d'Afrique de l'Ouest francophone. Tu connais les cultures locales (maïs, soja, manioc, coton, riz, maraîchage, arachide), l'élevage (volaille, petits ruminants, bovins), la gestion des ravageurs, la fertilisation, l'irrigation à moyens limités, la transformation post-récolte et la commercialisation.
Réponds en ${langName}, dans un style simple, direct et concret, adapté à une lecture sur WhatsApp (pas de mise en forme markdown, phrases courtes). Réponses courtes (3-6 phrases) sauf si la question demande plus de détail.`;

  const response = await axios.post(ANTHROPIC_API_URL, {
    model: MODEL,
    max_tokens: 700,
    system: systemPrompt,
    messages
  }, { headers: anthropicHeaders() });

  const textBlock = (response.data.content || []).find(b => b.type === 'text');
  return textBlock ? textBlock.text : '...';
}

module.exports = { diagnoseCrop, askAdvisor };
