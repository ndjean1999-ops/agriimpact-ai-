// src/routes/managerRoutes.js
//
// Panneau de contrôle réservé au propriétaire de la plateforme (toi).
// Permet de :
// - éditer les textes du bot (menu WhatsApp, conseils du jour) sans toucher au code
// - modérer le marketplace (supprimer une annonce abusive, marquer vendu)
// - consulter et exporter les données utilisateurs
// - gérer les organisations B2B (activer, suspendre, changer de plan)
// - consulter le journal d'audit de toutes les actions effectuées ici

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const managerModel = require('../db/models/managerModel');
const userModel = require('../db/models/userModel');
const listingModel = require('../db/models/listingModel');
const conversationModel = require('../db/models/conversationModel');
const b2bModel = require('../db/models/b2bModel');
const db = require('../db/connection');
const { requireManagerAuth } = require('../middleware/authManager');

// -----------------------------------------------------------
// LOGIN
// -----------------------------------------------------------
// POST /api/manager/login   body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const manager = managerModel.getByEmail(email);
    if (!manager) return res.status(401).json({ error: 'Identifiants incorrects.' });

    const valid = await bcrypt.compare(password, manager.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects.' });

    const token = jwt.sign(
      { managerId: manager.id, email: manager.email, scope: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, manager: { email: manager.email, full_name: manager.full_name } });
  } catch (err) {
    console.error('Erreur /api/manager/login:', err.message);
    res.status(500).json({ error: 'Connexion impossible pour le moment.' });
  }
});

// Tout ce qui suit nécessite d'être connecté en manager.
router.use(requireManagerAuth);

// -----------------------------------------------------------
// VUE D'ENSEMBLE
// -----------------------------------------------------------
// GET /api/manager/overview
router.get('/overview', (req, res) => {
  res.json({
    total_farmers: userModel.countAll(),
    active_last_30_days: userModel.countActiveLast(30),
    active_last_7_days: userModel.countActiveLast(7),
    total_diagnostics: conversationModel.countDiagnostics(),
    active_listings: listingModel.countActive(),
    top_issues: conversationModel.topDiagnosticLabels(8)
  });
});

// -----------------------------------------------------------
// UTILISATEURS — lecture et export, jamais de suppression destructive directe
// -----------------------------------------------------------
// GET /api/manager/users?limit=100
router.get('/users', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const rows = db.prepare(`
    SELECT id, phone_number, whatsapp_name, location_name, preferred_language, created_at, last_active_at
    FROM users ORDER BY last_active_at DESC LIMIT ?
  `).all(limit);
  res.json(rows);
});

// GET /api/manager/users/export — export CSV simple
router.get('/users/export', (req, res) => {
  const rows = db.prepare(`
    SELECT id, phone_number, whatsapp_name, location_name, preferred_language, created_at, last_active_at
    FROM users ORDER BY created_at DESC
  `).all();

  const header = 'id,phone_number,whatsapp_name,location_name,preferred_language,created_at,last_active_at';
  const lines = rows.map(r => [
    r.id, csvSafe(r.phone_number), csvSafe(r.whatsapp_name), csvSafe(r.location_name),
    r.preferred_language, r.created_at, r.last_active_at
  ].join(','));

  const csv = [header, ...lines].join('\n');
  managerModel.logAction(req.managerUser.email, 'export_users', 'users', null, { count: rows.length });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="agriimpact-utilisateurs.csv"');
  res.send(csv);
});

function csvSafe(value) {
  if (value == null) return '';
  const str = String(value).replace(/"/g, '""');
  return /[,"\n]/.test(str) ? `"${str}"` : str;
}

// -----------------------------------------------------------
// MARKETPLACE — modération
// -----------------------------------------------------------
// GET /api/manager/listings?status=active
router.get('/listings', (req, res) => {
  const { status } = req.query;
  const listings = listingModel.list({ status: status || 'active', limit: 200 });
  res.json(listings);
});

// PATCH /api/manager/listings/:id/status   body: { status: "removed" }
router.patch('/listings/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'sold', 'expired', 'removed'].includes(status)) {
    return res.status(400).json({ error: 'status invalide.' });
  }
  listingModel.updateStatus(req.params.id, status);
  managerModel.logAction(req.managerUser.email, 'update_listing_status', 'listing', req.params.id, { status });
  res.json({ ok: true });
});

// -----------------------------------------------------------
// DIAGNOSTICS — audit qualité (lecture seule)
// -----------------------------------------------------------
// GET /api/manager/diagnostics/recent
router.get('/diagnostics/recent', (req, res) => {
  const rows = db.prepare(`
    SELECT diagnostics.id, diagnostics.diagnostic_label, diagnostics.confidence, diagnostics.created_at,
           diagnostics.channel, users.location_name
    FROM diagnostics JOIN users ON users.id = diagnostics.user_id
    ORDER BY diagnostics.id DESC LIMIT 50
  `).all();
  res.json(rows);
});

// -----------------------------------------------------------
// CONTENUS ÉDITABLES — textes du bot, sans toucher au code
// -----------------------------------------------------------
// GET /api/manager/content
router.get('/content', (req, res) => {
  res.json(managerModel.getAllContent());
});

// PUT /api/manager/content   body: { content_key, lang, content_value }
router.put('/content', (req, res) => {
  const { content_key, lang, content_value } = req.body;
  if (!content_key || !lang || content_value == null) {
    return res.status(400).json({ error: 'content_key, lang et content_value sont requis.' });
  }
  managerModel.upsertContent(content_key, lang, content_value, req.managerUser.email);
  managerModel.logAction(req.managerUser.email, 'update_content', 'content_settings', content_key, { lang });
  res.json({ ok: true });
});

// -----------------------------------------------------------
// ORGANISATIONS B2B — activation, suspension, changement de plan
// -----------------------------------------------------------
// GET /api/manager/b2b/organizations
router.get('/b2b/organizations', (req, res) => {
  const rows = db.prepare('SELECT * FROM b2b_organizations ORDER BY created_at DESC').all();
  res.json(rows);
});

// PATCH /api/manager/b2b/organizations/:id   body: { status, plan }
router.patch('/b2b/organizations/:id', (req, res) => {
  const { status, plan } = req.body;
  const validStatus = ['prospect', 'actif', 'suspendu'];
  const validPlan = ['decouverte', 'standard', 'premium', 'sur-mesure'];

  const updates = [];
  const params = [];
  if (status) {
    if (!validStatus.includes(status)) return res.status(400).json({ error: 'status invalide.' });
    updates.push('status = ?'); params.push(status);
  }
  if (plan) {
    if (!validPlan.includes(plan)) return res.status(400).json({ error: 'plan invalide.' });
    updates.push('plan = ?'); params.push(plan);
  }
  if (!updates.length) return res.status(400).json({ error: 'Rien à mettre à jour.' });

  params.push(req.params.id);
  db.prepare(`UPDATE b2b_organizations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  managerModel.logAction(req.managerUser.email, 'update_b2b_organization', 'b2b_organization', req.params.id, { status, plan });
  res.json({ ok: true });
});

// -----------------------------------------------------------
// JOURNAL D'AUDIT
// -----------------------------------------------------------
// GET /api/manager/audit-log
router.get('/audit-log', (req, res) => {
  res.json(managerModel.getRecentAuditLog(100));
});

module.exports = router;
