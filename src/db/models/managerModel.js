// src/db/models/managerModel.js
const db = require('../connection');

function getByEmail(email) {
  return db.prepare('SELECT * FROM manager_users WHERE email = ?').get(email);
}

// --- Contenus éditables (textes du bot, conseils du jour, etc.) ---

function getContent(key, lang = 'fr') {
  return db.prepare('SELECT * FROM content_settings WHERE content_key = ? AND lang = ?').get(key, lang);
}

function getAllContent() {
  return db.prepare('SELECT * FROM content_settings ORDER BY content_key, lang').all();
}

function upsertContent(key, lang, value, actorEmail) {
  db.prepare(`
    INSERT INTO content_settings (content_key, lang, content_value, updated_by, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(content_key, lang) DO UPDATE SET
      content_value = excluded.content_value,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(key, lang, value, actorEmail);
}

// --- Journal d'audit ---

function logAction(actorEmail, action, targetType, targetId, details) {
  db.prepare(`
    INSERT INTO audit_log (actor_email, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(actorEmail, action, targetType || null, targetId ? String(targetId) : null, details ? JSON.stringify(details) : null);
}

function getRecentAuditLog(limit = 50) {
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = {
  getByEmail, getContent, getAllContent, upsertContent, logAction, getRecentAuditLog
};
