// src/routes/marketRoutes.js
const express = require('express');
const router = express.Router();
const listingModel = require('../db/models/listingModel');
const userModel = require('../db/models/userModel');

// GET /api/market/listings?category=crops&query=maïs
router.get('/listings', (req, res) => {
  const { category, query } = req.query;
  const listings = listingModel.list({ category, query, limit: 50 });
  res.json(listings.map(publicListing));
});

// POST /api/market/listings
// body: { session_id, title, category, price_amount, price_unit, currency, description, location_name, latitude, longitude, quantity_available }
router.post('/listings', (req, res) => {
  const { session_id, title, category } = req.body;
  if (!session_id || !title || !category) {
    return res.status(400).json({ error: 'session_id, title et category sont requis.' });
  }
  const user = userModel.findOrCreateByPhone(`web:${session_id}`, null);
  const listing = listingModel.create(user.id, req.body);
  res.status(201).json(publicListing(listing));
});

// GET /api/market/my-listings?session_id=xyz
router.get('/my-listings', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id requis.' });
  const user = userModel.findByPhone(`web:${session_id}`);
  if (!user) return res.json([]);
  res.json(listingModel.listByUser(user.id).map(publicListing));
});

// PATCH /api/market/listings/:id/status   body: { status: "sold" }
router.patch('/listings/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'sold', 'expired', 'removed'].includes(status)) {
    return res.status(400).json({ error: 'status invalide.' });
  }
  listingModel.updateStatus(req.params.id, status);
  res.json({ ok: true });
});

// POST /api/market/listings/:id/inquiry   body: { session_id, message }
router.post('/listings/:id/inquiry', (req, res) => {
  const { session_id, message } = req.body;
  const user = userModel.findOrCreateByPhone(`web:${session_id}`, null);
  listingModel.addInquiry(req.params.id, user.id, message);

  const listing = listingModel.getById(req.params.id);
  res.json({ ok: true, seller_contact: listing ? listing.phone_number : null });
});

function publicListing(l) {
  return {
    id: l.id, title: l.title, category: l.category,
    price_amount: l.price_amount, price_unit: l.price_unit, currency: l.currency,
    description: l.description, location_name: l.location_name,
    latitude: l.latitude, longitude: l.longitude,
    quantity_available: l.quantity_available, status: l.status,
    seller_name: l.whatsapp_name || null,
    seller_phone: l.phone_number && !l.phone_number.startsWith('web:') ? l.phone_number : null,
    created_at: l.created_at
  };
}

module.exports = router;
