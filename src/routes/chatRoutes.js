// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const claude = require('../services/claudeService');
const userModel = require('../db/models/userModel');
const conversationModel = require('../db/models/conversationModel');

// POST /api/chat
// body: { message: "...", lang: "fr", session_id: "web-xyz" }
// Le serveur garde l'historique en base (par session_id), donc le frontend
// n'a plus besoin d'envoyer tout l'historique à chaque fois.
router.post('/', async (req, res) => {
  try {
    const { message, lang, session_id } = req.body;
    if (!message || !session_id) {
      return res.status(400).json({ error: 'message et session_id sont requis.' });
    }

    const user = userModel.findOrCreateByPhone(`web:${session_id}`, null);
    conversationModel.addMessage(user.id, 'web', 'user', message);

    const history = conversationModel.getRecentHistory(user.id, 16);
    const reply = await claude.askAdvisor(history, lang || 'fr');

    conversationModel.addMessage(user.id, 'web', 'assistant', reply);
    res.json({ reply });
  } catch (err) {
    console.error('Erreur /api/chat:', err.response?.data || err.message);
    res.status(500).json({ error: 'Réponse impossible pour le moment.' });
  }
});

module.exports = router;
