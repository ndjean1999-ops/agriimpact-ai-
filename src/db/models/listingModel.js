// src/db/models/listingModel.js
const db = require('../connection');

async function create(userId, data) {
  const result = await db.query(`
    INSERT INTO listings
      (user_id, title, category, price_amount, price_unit, currency, description, location_name, latitude, longitude, quantity_available, image_path)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
    userId, data.title, data.category, data.price_amount || null, data.price_unit || null,
    data.currency || 'FCFA', data.description || null, data.location_name || null,
    data.latitude || null, data.longitude || null, data.quantity_available || null, data.image_path || null
  ]);
  return getById(result.rows[0].id);
}

async function getById(id) {
  const result = await db.query('SELECT * FROM listings WHERE id = $1', [id]);
  return result.rows[0];
}

async function list({ category, query, status = 'active', limit = 50 } = {}) {
  let sql = 'SELECT listings.*, users.whatsapp_name, users.phone_number FROM listings JOIN users ON users.id = listings.user_id WHERE listings.status = $1';
  const params = [status];
  let paramIndex = 2;

  if (category && category !== 'all') {
    sql += ` AND listings.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }
  if (query) {
    sql += ` AND (listings.title LIKE $${paramIndex} OR listings.location_name LIKE $${paramIndex + 1})`;
    params.push(`%${query}%`, `%${query}%`);
    paramIndex += 2;
  }
  sql += ` ORDER BY listings.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await db.query(sql, params);
  return result.rows;
}

async function listByUser(userId) {
  const result = await db.query('SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows;
}

async function updateStatus(id, status) {
  await db.query('UPDATE listings SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
}

async function addInquiry(listingId, buyerUserId, message) {
  await db.query(
    'INSERT INTO listing_inquiries (listing_id, buyer_user_id, message) VALUES ($1, $2, $3)',
    [listingId, buyerUserId, message || null]
  );
}

async function countActive() {
  const result = await db.query(`SELECT COUNT(*) as count FROM listings WHERE status = 'active'`);
  return parseInt(result.rows[0].count, 10);
}

module.exports = { create, getById, list, listByUser, updateStatus, addInquiry, countActive };
