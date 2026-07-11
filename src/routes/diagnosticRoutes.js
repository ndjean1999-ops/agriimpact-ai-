const express = require('express');
const router = express.Router();
const claude = require('../services/claudeService');
const userModel = require('../db/models/userModel');
const conversationModel = require('../db/models/conversationModel');

// POST /api/diagnostic
// body: { image_base64: "...", media_type: "image/jpeg", lang: "fr", session_id: "web-xyz" }
router.post('/', async (req, res) => {
  try {
    const { image_base64, media_type, lang, session_id } = req.body;
    if (!image_base64 || !media_type) {
      return res.status(400).json({ error: 'image_base64 et media_type sont requis.' });
    }

    const result = await claude.diagnoseCrop(image_base64, media_type, lang || 'fr');

    if (session_id) {
      const user = await userModel.findOrCreateByPhone(`web:${session_id}`, null);
      await conversationModel.saveDiagnostic(user.id, 'web', null, result);
    }

    res.json(result);
  } catch (err) {
    console.error('Erreur /api/diagnostic:', err.response?.data || err.message);
    res.status(500).json({ error: 'Analyse impossible pour le moment.' });
  }
});

module.exports = router;
