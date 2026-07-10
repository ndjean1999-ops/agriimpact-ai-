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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const manager = await managerModel.getByEmail(email);
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

router.use(requireManagerAuth);

router.get('/overview', async (req, res) => {
  try {
    res.json({
      total_farmers: await userModel.countAll(),
      active_last_30_days: await userModel.countActiveLast(30),
      active_last_7_days: await userModel.countActiveLast(7),
      total_diagnostics: await conversationModel.countDiagnostics(),
      active_listings: await listingModel.countActive(),
      top_issues: await conversationModel.topDiagnosticLabels(8)
    });
  } catch (err) {
    console.error('Erreur /api/manager/overview:', err.message);
    res.status(500).json({ error: 'Impossible de charger la vue d ensemble.' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await db.query(`
      SELECT id, phone_number, whatsapp_name, location_name, preferred_language, created_at, last_active_at
      FROM users ORDER BY last_active_at DESC LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur /api/manager/users:', err.message);
    res.status(500).json({ error: 'Impossible de charger les utilisateurs.' });
  }
});

router.get('/users/export', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, phone_number, whatsapp_name, location_name, preferred_language, created_at, last_active_at
      FROM users ORDER BY created_at DESC
    `);
    const rows = result.rows;

    const header = 'id,phone_number,whatsapp_name,location_name,preferred_language,created_at,last_active_at';
    const lines = rows.map(r => [
      r.id, csvSafe(r.phone_number), csvSafe(r.whatsapp_name), csvSafe(r.location_name),
      r.preferred_language, r.created_at, r.last_active_at
    ].join(','));

    const csv = [header, ...lines].join('\n');
    await managerModel.logAction(req.managerUser.email, 'export_users', 'users', null, { count: rows.length });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="agriimpact-utilisateurs.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Erreur /api/manager/users/export:', err.message);
    res.status(500).json({ error: 'Export impossible.' });
  }
});

function csvSafe(value) {
  if (value == null) return '';
  const str = String(value).replace(/"/g, '""');
  return /[,"\n]/.test(str) ? `"${str}"` : str;
}

router.get('/listings', async (req, res) => {
  try {
    const { status } = req.query;
    const listings = await listingModel.list({ status: status || 'active', limit: 200 });
    res.json(listings);
  } catch (err) {
    console.error('Erreur /api/manager/listings:', err.message);
    res.status(500).json({ error: 'Impossible de charger les annonces.' });
  }
});

router.patch('/listings/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'sold', 'expired', 'removed'].includes(status)) {
      return res.status(400).json({ error: 'status invalide.' });
    }
    await listingModel.updateStatus(req.params.id, status);
    await managerModel.logAction(req.managerUser.email, 'update_listing_status', 'listing', req.params.id, { status });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur PATCH /api/manager/listings/:id/status:', err.message);
    res.status(500).json({ error: 'Mise a jour impossible.' });
  }
});

router.get('/diagnostics/recent', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT diagnostics.id, diagnostics.diagnostic_label, diagnostics.confidence, diagnostics.created_at,
             diagnostics.channel, users.location_name
      FROM diagnostics JOIN users ON users.id = diagnostics.user_id
      ORDER BY diagnostics.id DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur /api/manager/diagnostics/recent:', err.message);
    res.status(500).json({ error: 'Impossible de charger les diagnostics.' });
  }
});

router.get('/content', async (req, res) => {
  try {
    res.json(await managerModel.getAllContent());
  } catch (err) {
    console.error('Erreur /api/manager/content:', err.message);
    res.status(500).json({ error: 'Impossible de charger les contenus.' });
  }
});

router.put('/content', async (req, res) => {
  try {
    const { content_key, lang, content_value } = req.body;
    if (!content_key || !lang || content_value == null) {
      return res.status(400).json({ error: 'content_key, lang et content_value sont requis.' });
    }
    await managerModel.upsertContent(content_key, lang, content_value, req.managerUser.email);
    await managerModel.logAction(req.managerUser.email, 'update_content', 'content_settings', content_key, { lang });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur PUT /api/manager/content:', err.message);
    res.status(500).json({ error: 'Mise a jour impossible.' });
  }
});

router.get('/b2b/organizations', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM b2b_organizations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur /api/manager/b2b/organizations:', err.message);
    res.status(500).json({ error: 'Impossible de charger les organisations.' });
  }
});

router.patch('/b2b/organizations/:id', async (req, res) => {
  try {
    const { status, plan } = req.body;
    const validStatus = ['prospect', 'actif', 'suspendu'];
    const validPlan = ['decouverte', 'standard', 'premium', 'sur-mesure'];

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      if (!validStatus.includes(status)) return res.status(400).json({ error: 'status invalide.' });
      updates.push(`status = $${paramIndex}`); params.push(status); paramIndex++;
    }
    if (plan) {
      if (!validPlan.includes(plan)) return res.status(400).json({ error: 'plan invalide.' });
      updates.push(`plan = $${paramIndex}`); params.push(plan); paramIndex++;
    }
    if (!updates.length) return res.status(400).json({ error: 'Rien a mettre a jour.' });

    params.push(req.params.id);
    await db.query(`UPDATE b2b_organizations SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
    await managerModel.logAction(req.managerUser.email, 'update_b2b_organization', 'b2b_organization', req.params.id, { status, plan });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur PATCH /api/manager/b2b/organizations/:id:', err.message);
    res.status(500).json({ error: 'Mise a jour impossible.' });
  }
});

router.get('/audit-log', async (req, res) => {
  try {
    res.json(await managerModel.getRecentAuditLog(100));
  } catch (err) {
    console.error('Erreur /api/manager/audit-log:', err.message);
    res.status(500).json({ error: 'Impossible de charger le journal d audit.' });
  }
});

module.exports = router;
