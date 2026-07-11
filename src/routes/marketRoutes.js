const express = require('express');
const router = express.Router();
const listingModel = require('../db/models/listingModel');
const userModel = require('../db/models/userModel');

// GET /api/market/listings?category=crops&query=maïs
router.get('/listings', async (req, res) => {
  try {
    const { category, query } = req.query;
    const listings = await listingModel.list({ category, query, limit: 50 });
    res.json(listings.map(publicListing));
  } catch (err) {
    console.error('Erreur GET /api/market/listings:', err.message);
    res.status(500).json({ error: 'Impossible de charger les annonces.' });
  }
});

// POST /api/market/listings
router.post('/listings', async (req, res) => {
  try {
    const { session_id, title, category } = req.body;
    if (!session_id || !title || !category) {
      return res.status(400).json({ error: 'session_id, title et category sont requis.' });
    }
    const user = await userModel.findOrCreateByPhone(`web:${session_id}`, null);
    const listing = await listingModel.create(user.id, req.body);
    res.status(201).json(publicListing(listing));
  } catch (err) {
    console.error('Erreur POST /api/market/listings:', err.message);
    res.status(500).json({ error: 'Impossible de créer l\'annonce.' });
  }
});

// GET /api/market/my-listings?session_id=xyz
router.get('/my-listings', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id requis.' });
    const user = await userModel.findByPhone(`web:${session_id}`);
    if (!user) return res.json([]);
    const listings = await listingModel.listByUser(user.id);
    res.json(listings.map(publicListing));
  } catch (err) {
    console.error('Erreur GET /api/market/my-listings:', err.message);
    res.status(500).json({ error: 'Impossible de charger tes annonces.' });
  }
});

// PATCH /api/market/listings/:id/status
router.patch('/listings/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'sold', 'expired', 'removed'].includes(status)) {
      return res.status(400).json({ error: 'status invalide.' });
    }
    await listingModel.updateStatus(req.params.id, status);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erreur PATCH /api/market/listings/:id/status:', err.message);
    res.status(500).json({ error: 'Mise à jour impossible.' });
  }
});

// POST /api/market/listings/:id/inquiry
router.post('/listings/:id/inquiry', async (req, res) => {
  try {
    const { session_id, message } = req.body;
    const user = await userModel.findOrCreateByPhone(`web:${session_id}`, null);
    await listingModel.addInquiry(req.params.id, user.id, message);

    const listing = await listingModel.getById(req.params.id);
    res.json({ ok: true, seller_contact: listing ? listing.phone_number : null });
  } catch (err) {
    console.error('Erreur POST /api/market/listings/:id/inquiry:', err.message);
    res.status(500).json({ error: 'Impossible d\'envoyer le message.' });
  }
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
