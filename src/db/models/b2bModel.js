// src/db/models/b2bModel.js
const db = require('../connection');
const crypto = require('crypto');

async function createOrganization(data) {
  const apiKey = 'aik_' + crypto.randomBytes(20).toString('hex');
  const result = await db.query(`
    INSERT INTO b2b_organizations (name, org_type, contact_name, contact_email, contact_phone, plan, region_focus, api_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `, [
    data.name, data.org_type, data.contact_name || null, data.contact_email || null,
    data.contact_phone || null, data.plan || 'decouverte', data.region_focus || null, apiKey
  ]);
  return getOrganizationById(result.rows[0].id);
}

async function getOrganizationById(id) {
  const result = await db.query('SELECT * FROM b2b_organizations WHERE id = $1', [id]);
  return result.rows[0];
}

async function getOrganizationByApiKey(apiKey) {
  const result = await db.query('SELECT * FROM b2b_organizations WHERE api_key = $1', [apiKey]);
  return result.rows[0];
}

async function createAdminUser(organizationId, email, passwordHash, fullName, role = 'admin') {
  const result = await db.query(`
    INSERT INTO b2b_admin_users (organization_id, email, password_hash, full_name, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [organizationId, email, passwordHash, fullName || null, role]);
  return getAdminById(result.rows[0].id);
}

async function getAdminByEmail(email) {
  const result = await db.query('SELECT * FROM b2b_admin_users WHERE email = $1', [email]);
  return result.rows[0];
}

async function getAdminById(id) {
  const result = await db.query('SELECT * FROM b2b_admin_users WHERE id = $1', [id]);
  return result.rows[0];
}

module.exports = {
  createOrganization, getOrganizationById, getOrganizationByApiKey,
  createAdminUser, getAdminByEmail, getAdminById
};
