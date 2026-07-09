// src/db/models/userModel.js
const db = require('../connection');

function findByPhone(phoneNumber) {
  return db.prepare('SELECT * FROM users WHERE phone_number = ?').get(phoneNumber);
}

function findOrCreateByPhone(phoneNumber, whatsappName) {
  let user = findByPhone(phoneNumber);
  if (!user) {
    const result = db.prepare(
      'INSERT INTO users (phone_number, whatsapp_name) VALUES (?, ?)'
    ).run(phoneNumber, whatsappName || null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare('UPDATE users SET last_active_at = datetime(\'now\') WHERE id = ?').run(user.id);
  }
  return user;
}

function updateLanguage(userId, lang) {
  db.prepare('UPDATE users SET preferred_language = ? WHERE id = ?').run(lang, userId);
}

function updateLocation(userId, lat, lon, locationName) {
  db.prepare(
    'UPDATE users SET latitude = ?, longitude = ?, location_name = ? WHERE id = ?'
  ).run(lat, lon, locationName, userId);
}

function getById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

function countActiveLast(days) {
  return db.prepare(
    `SELECT COUNT(*) as count FROM users WHERE last_active_at >= datetime('now', '-' || ? || ' days')`
  ).get(days).count;
}

function listForB2B(regionFilter) {
  if (regionFilter) {
    return db.prepare(
      'SELECT id, location_name, latitude, longitude, preferred_language, crop_types, created_at FROM users WHERE location_name LIKE ?'
    ).all(`%${regionFilter}%`);
  }
  return db.prepare(
    'SELECT id, location_name, latitude, longitude, preferred_language, crop_types, created_at FROM users'
  ).all();
}

module.exports = {
  findByPhone, findOrCreateByPhone, updateLanguage, updateLocation,
  getById, countAll, countActiveLast, listForB2B
};
