// src/db/models/userModel.js
const db = require('../connection');

async function findByPhone(phoneNumber) {
  const result = await db.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber]);
  return result.rows[0];
}

async function findOrCreateByPhone(phoneNumber, whatsappName) {
  let user = await findByPhone(phoneNumber);
  if (!user) {
    const result = await db.query(
      'INSERT INTO users (phone_number, whatsapp_name) VALUES ($1, $2) RETURNING *',
      [phoneNumber, whatsappName || null]
    );
    user = result.rows[0];
  } else {
    await db.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [user.id]);
  }
  return user;
}

async function updateLanguage(userId, lang) {
  await db.query('UPDATE users SET preferred_language = $1 WHERE id = $2', [lang, userId]);
}

async function updateLocation(userId, lat, lon, locationName) {
  await db.query(
    'UPDATE users SET latitude = $1, longitude = $2, location_name = $3 WHERE id = $4',
    [lat, lon, locationName, userId]
  );
}

async function getById(userId) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

async function countAll() {
  const result = await db.query('SELECT COUNT(*) as count FROM users');
  return parseInt(result.rows[0].count, 10);
}

async function countActiveLast(days) {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM users WHERE last_active_at >= NOW() - ($1 || ' days')::interval`,
    [days]
  );
  return parseInt(result.rows[0].count, 10);
}

async function listForB2B(regionFilter) {
  if (regionFilter) {
    const result = await db.query(
      'SELECT id, location_name, latitude, longitude, preferred_language, crop_types, created_at FROM users WHERE location_name LIKE $1',
      [`%${regionFilter}%`]
    );
    return result.rows;
  }
  const result = await db.query(
    'SELECT id, location_name, latitude, longitude, preferred_language, crop_types, created_at FROM users'
  );
  return result.rows;
}

module.exports = {
  findByPhone, findOrCreateByPhone, updateLanguage, updateLocation,
  getById, countAll, countActiveLast, listForB2B
};
