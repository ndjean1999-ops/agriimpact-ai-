// src/db/models/managerModel.js
const db = require('../connection');

async function getByEmail(email) {
  const result = await db.query('SELECT * FROM manager_users WHERE email = $1', [email]);
  return result.rows[0];
}

async function getContent(key, lang = 'fr') {
  const result = await db.query(
    'SELECT * FROM content_settings WHERE content_key = $1 AND lang = $2',
    [key, lang]
  );
  return result.rows[0];
}

async function getAllContent() {
  const result = await db.query('SELECT * FROM content_settings ORDER BY content_key, lang');
  return result.rows;
}

async function upsertContent(key, lang, value, actorEmail) {
  await db.query(`
    INSERT INTO content_settings (content_key, lang, content_value, updated_by, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (content_key, lang) DO UPDATE SET
      content_value = EXCLUDED.content_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `, [key, lang, value, actorEmail]);
}

async function logAction(actorEmail, action, targetType, targetId, details) {
  await db.query(`
    INSERT INTO audit_log (actor_email, action, target_type, target_id, details)
    VALUES ($1, $2, $3, $4, $5)
  `, [actorEmail, action, targetType || null, targetId ? String(targetId) : null, details ? JSON.stringify(details) : null]);
}

async function getRecentAuditLog(limit = 50) {
  const result = await db.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [limit]);
  return result.rows;
}

module.exports = {
  getByEmail, getContent, getAllContent, upsertContent, logAction, getRecentAuditLog
};
