// src/db/models/listingModel.js
const db = require('../connection');

function create(userId, data) {
  const result = db.prepare(`
    INSERT INTO listings
      (user_id, title, category, price_amount, price_unit, currency, description, location_name, latitude, longitude, quantity_available, image_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, data.title, data.category, data.price_amount || null, data.price_unit || null,
    data.currency || 'FCFA', data.description || null, data.location_name || null,
    data.latitude || null, data.longitude || null, data.quantity_available || null, data.image_path || null
  );
  return getById(result.lastInsertRowid);
}

function getById(id) {
  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
}

function list({ category, query, status = 'active', limit = 50 } = {}) {
  let sql = 'SELECT listings.*, users.whatsapp_name, users.phone_number FROM listings JOIN users ON users.id = listings.user_id WHERE listings.status = ?';
  const params = [status];
  if (category && category !== 'all') {
    sql += ' AND listings.category = ?';
    params.push(category);
  }
  if (query) {
    sql += ' AND (listings.title LIKE ? OR listings.location_name LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }
  sql += ' ORDER BY listings.created_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

function listByUser(userId) {
  return db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function updateStatus(id, status) {
  db.prepare('UPDATE listings SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
}

function addInquiry(listingId, buyerUserId, message) {
  db.prepare(
    'INSERT INTO listing_inquiries (listing_id, buyer_user_id, message) VALUES (?, ?, ?)'
  ).run(listingId, buyerUserId, message || null);
}

function countActive() {
  return db.prepare('SELECT COUNT(*) as count FROM listings WHERE status = \'active\'').get().count;
}

module.exports = { create, getById, list, listByUser, updateStatus, addInquiry, countActive };
