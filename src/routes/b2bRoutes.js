// src/routes/b2bRoutes.js
//
// Module B2B : permet à une ONG, coopérative, banque agricole ou assureur de :
// 1. S'inscrire comme organisation partenaire
// 2. Se connecter à un dashboard
// 3. Consulter des statistiques agrégées et anonymisées : nombre d'agriculteurs
//    actifs, répartition géographique, problèmes agricoles les plus fréquents,
//    activité du marketplace.
//
// IMPORTANT : toutes les données renvoyées ici sont agrégées ou anonymisées.
// On ne renvoie jamais le numéro de téléphone ou le nom d'un agriculteur
// individuel à une organisation B2B — uniquement des statistiques globales.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const b2bModel = require('../db/models/b2bModel');
const userModel = require('../db/models/userModel');
const conversationModel = require('../db/models/conversationModel');
const listingModel = require('../db/models/listingModel');
const { requireB2BAuth } = require('../middleware/authB2B');

// -----------------------------------------------------------
// INSCRIPTION D'UNE ORGANISATION (devient un "prospect" jusqu'à activation manuelle)
// -----------------------------------------------------------
// POST /api/b2b/register
// body: { org_name, org_type, contact_name, contact_email, contact_phone, region_focus, admin_email, admin_password }
router.post('/register', async (req, res) => {
  try {
    const { org_name, org_type, contact_name, contact_email, contact_phone, region_focus, admin_email, admin_password } = req.body;

    if (!org_name || !org_type || !admin_email || !admin_password) {
      return res.status(400).json({ error: 'org_name, org_type, admin_email et admin_password sont requis.' });
    }
    if (b2bModel.getAdminByEmail(admin_email)) {
      return res.status(409).json({ error: 'Cet email administrateur existe déjà.' });
    }

    const org = b2bModel.createOrganization({
      name: org_name, org_type, contact_name, contact_email, contact_phone, region_focus
    });

    const passwordHash = await bcrypt.hash(admin_password, 10);
    const admin = b2bModel.createAdminUser(org.id, admin_email, passwordHash, contact_name, 'admin');

    res.status(201).json({
      message: 'Organisation créée. Un statut "prospect" lui est attribué ; contacte l\'équipe AgriImpact pour activer le plan payant.',
      organization: { id: org.id, name: org.name, status: org.status, api_key: org.api_key },
      admin: { id: admin.id, email: admin.email }
    });
  } catch (err) {
    console.error('Erreur /api/b2b/register:', err.message);
    res.status(500).json({ error: 'Inscription impossible pour le moment.' });
  }
});

// -----------------------------------------------------------
// LOGIN
// -----------------------------------------------------------
// POST /api/b2b/login   body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = b2bModel.getAdminByEmail(email);
    if (!admin) return res.status(401).json({ error: 'Identifiants incorrects.' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects.' });

    const token = jwt.sign(
      { adminId: admin.id, organizationId: admin.organization_id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const org = b2bModel.getOrganizationById(admin.organization_id);
    res.json({ token, organization: { id: org.id, name: org.name, plan: org.plan, status: org.status } });
  } catch (err) {
    console.error('Erreur /api/b2b/login:', err.message);
    res.status(500).json({ error: 'Connexion impossible pour le moment.' });
  }
});

// -----------------------------------------------------------
// DASHBOARD — toutes les routes ci-dessous nécessitent un token valide
// -----------------------------------------------------------

// GET /api/b2b/dashboard/overview
router.get('/dashboard/overview', requireB2BAuth, (req, res) => {
  const org = b2bModel.getOrganizationById(req.b2bUser.organizationId);
  const regionFilter = org.region_focus && org.region_focus !== 'national' ? org.region_focus : null;

  res.json({
    organization: { name: org.name, plan: org.plan, region_focus: org.region_focus, status: org.status },
    metrics: {
      total_farmers: userModel.countAll(),
      active_last_30_days: userModel.countActiveLast(30),
      active_last_7_days: userModel.countActiveLast(7),
      total_diagnostics: conversationModel.countDiagnostics(),
      active_listings: listingModel.countActive()
    }
  });
});

// GET /api/b2b/dashboard/map — points géolocalisés des agriculteurs (anonymisés, pas de nom/téléphone)
router.get('/dashboard/map', requireB2BAuth, (req, res) => {
  const org = b2bModel.getOrganizationById(req.b2bUser.organizationId);
  const regionFilter = org.region_focus && org.region_focus !== 'national' ? org.region_focus : null;
  const users = userModel.listForB2B(regionFilter);

  const points = users
    .filter(u => u.latitude && u.longitude)
    .map(u => ({
      latitude: u.latitude,
      longitude: u.longitude,
      location_name: u.location_name,
      crop_types: safeParseJSON(u.crop_types, [])
    }));

  res.json({ points });
});

// GET /api/b2b/dashboard/crop-issues — problèmes agricoles les plus fréquents (utile pour alerte précoce)
router.get('/dashboard/crop-issues', requireB2BAuth, (req, res) => {
  const top = conversationModel.topDiagnosticLabels(10);
  res.json({ top_issues: top });
});

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;
