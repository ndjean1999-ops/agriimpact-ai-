// src/db/models/conversationModel.js
const db = require('../connection');

function addMessage(userId, channel, role, content) {
  db.prepare(
    'INSERT INTO conversations (user_id, channel, role, content) VALUES (?, ?, ?, ?)'
  ).run(userId, channel, role, content);
}

function getRecentHistory(userId, limit = 12) {
  const rows = db.prepare(
    'SELECT role, content FROM conversations WHERE user_id = ? ORDER BY id DESC LIMIT ?'
  ).all(userId, limit);
  return rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

function saveDiagnostic(userId, channel, imagePath, result) {
  db.prepare(`
    INSERT INTO diagnostics
      (user_id, channel, image_path, diagnostic_label, confidence, causes, treatment_bio, treatment_conventional, prevention, raw_response)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, channel, imagePath || null,
    result.diagnostic || null, result.confiance || null, result.causes || null,
    JSON.stringify(result.traitement_bio || []),
    JSON.stringify(result.traitement_conventionnel || []),
    JSON.stringify(result.prevention || []),
    JSON.stringify(result)
  );
}

function countDiagnostics() {
  return db.prepare('SELECT COUNT(*) as count FROM diagnostics').get().count;
}

function topDiagnosticLabels(limit = 10) {
  return db.prepare(
    `SELECT diagnostic_label, COUNT(*) as count
     FROM diagnostics
     WHERE diagnostic_label IS NOT NULL
     GROUP BY diagnostic_label
     ORDER BY count DESC
     LIMIT ?`
  ).all(limit);
}

module.exports = { addMessage, getRecentHistory, saveDiagnostic, countDiagnostics, topDiagnosticLabels };
