// src/db/models/conversationModel.js
const db = require('../connection');

async function addMessage(userId, channel, role, content) {
  await db.query(
    'INSERT INTO conversations (user_id, channel, role, content) VALUES ($1, $2, $3, $4)',
    [userId, channel, role, content]
  );
}

async function getRecentHistory(userId, limit = 12) {
  const result = await db.query(
    'SELECT role, content FROM conversations WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
    [userId, limit]
  );
  return result.rows.reverse().map(r => ({ role: r.role, content: r.content }));
}

async function saveDiagnostic(userId, channel, imagePath, result) {
  await db.query(`
    INSERT INTO diagnostics
      (user_id, channel, image_path, diagnostic_label, confidence, causes, treatment_bio, treatment_conventional, prevention, raw_response)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    userId, channel, imagePath || null,
    result.diagnostic || null, result.confiance || null, result.causes || null,
    JSON.stringify(result.traitement_bio || []),
    JSON.stringify(result.traitement_conventionnel || []),
    JSON.stringify(result.prevention || []),
    JSON.stringify(result)
  ]);
}

async function countDiagnostics() {
  const result = await db.query('SELECT COUNT(*) as count FROM diagnostics');
  return parseInt(result.rows[0].count, 10);
}

async function topDiagnosticLabels(limit = 10) {
  const result = await db.query(
    `SELECT diagnostic_label, COUNT(*) as count
     FROM diagnostics
     WHERE diagnostic_label IS NOT NULL
     GROUP BY diagnostic_label
     ORDER BY count DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

module.exports = { addMessage, getRecentHistory, saveDiagnostic, countDiagnostics, topDiagnosticLabels };
