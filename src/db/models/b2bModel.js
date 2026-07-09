// src/db/models/b2bModel.js
const db = require('../connection');
const crypto = require('crypto');

function createOrganization(data) {
  const apiKey = 'aik_' + crypto.randomBytes(20).toString('hex');
  const result = db.prepare(`
    INSERT INTO b2b_organizations (name, org_type, contact_name, contact_email, contact_phone, plan, region_focus, api_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name, data.org_type, data.contact_name || null, data.contact_email || null,
    data.contact_phone || null, data.plan || 'decouverte', data.region_focus || null, apiKey
  );
  return getOrganizationById(result.lastInsertRowid);
}

function getOrganizationById(id) {
  return db.prepare('SELECT * FROM b2b_organizations WHERE id = ?').get(id);
}

function getOrganizationByApiKey(apiKey) {
  return db.prepare('SELECT * FROM b2b_organizations WHERE api_key = ?').get(apiKey);
}

function createAdminUser(organizationId, email, passwordHash, fullName, role = 'admin') {
  const result = db.prepare(`
    INSERT INTO b2b_admin_users (organization_id, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(organizationId, email, passwordHash, fullName || null, role);
  return getAdminById(result.lastInsertRowid);
}

function getAdminByEmail(email) {
  return db.prepare('SELECT * FROM b2b_admin_users WHERE email = ?').get(email);
}

function getAdminById(id) {
  return db.prepare('SELECT * FROM b2b_admin_users WHERE id = ?').get(id);
}

module.exports = {
  createOrganization, getOrganizationById, getOrganizationByApiKey,
  createAdminUser, getAdminByEmail, getAdminById
};
