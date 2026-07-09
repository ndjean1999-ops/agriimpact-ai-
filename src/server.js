// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// S'assure que la base de données existe et a son schéma à jour avant de démarrer.
require('./db/init');

const whatsappWebhook = require('./routes/whatsappWebhook');
const diagnosticRoutes = require('./routes/diagnosticRoutes');
const chatRoutes = require('./routes/chatRoutes');
const marketRoutes = require('./routes/marketRoutes');
const b2bRoutes = require('./routes/b2bRoutes');
const managerRoutes = require('./routes/managerRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' })); // les photos en base64 peuvent être volumineuses

// Sert le dashboard B2B (fichiers statiques HTML/JS/CSS) et l'app frontend si tu les ajoutes ici
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));
app.use('/manager', express.static(path.join(__dirname, '../public/manager')));
app.use('/app', express.static(path.join(__dirname, '../public/app')));

// --- Webhook WhatsApp (Meta appelle cette route) ---
app.use('/webhook/whatsapp', whatsappWebhook);

// --- API pour le frontend web (app.html) ---
app.use('/api/diagnostic', diagnosticRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/market', marketRoutes);

// --- API B2B (ONG, coopératives, banques, assureurs) ---
app.use('/api/b2b', b2bRoutes);

// --- API Manager (toi, propriétaire de la plateforme) ---
app.use('/api/manager', managerRoutes);

// Healthcheck simple, utile pour Render/Railway et pour vérifier que le serveur tourne
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'agriimpact-backend' }));

app.get('/', (req, res) => {
  res.send('AgriImpact AI backend est en ligne. Voir /health, /dashboard, /app.');
});

app.listen(PORT, () => {
  console.log(`🌾 AgriImpact AI backend démarré sur le port ${PORT}`);
  console.log(`   Webhook WhatsApp : /webhook/whatsapp`);
  console.log(`   API web          : /api/diagnostic, /api/chat, /api/market`);
  console.log(`   API B2B          : /api/b2b`);
});
