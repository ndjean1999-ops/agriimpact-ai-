// src/db/init.js
// Initialise la base de données PostgreSQL (Render) avec toutes les tables nécessaires.

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone_number TEXT UNIQUE,
      whatsapp_name TEXT,
      full_name TEXT,
      location_name TEXT,
      latitude REAL,
      longitude REAL,
      preferred_language TEXT DEFAULT 'fr',
      crop_types TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_active_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      channel TEXT DEFAULT 'whatsapp',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS diagnostics (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      channel TEXT DEFAULT 'whatsapp',
      image_path TEXT,
      diagnostic_label TEXT,
      confidence TEXT,
      causes TEXT,
      treatment_bio TEXT,
      treatment_conventional TEXT,
      prevention TEXT,
      raw_response TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      price_amount REAL,
      price_unit TEXT,
      currency TEXT DEFAULT 'FCFA',
      description TEXT,
      location_name TEXT,
      latitude REAL,
      longitude REAL,
      quantity_available TEXT,
      image_path TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS listing_inquiries (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL REFERENCES listings(id),
      buyer_user_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS b2b_organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      org_type TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      plan TEXT DEFAULT 'decouverte',
      region_focus TEXT,
      api_key TEXT UNIQUE,
      status TEXT DEFAULT 'prospect',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS b2b_admin_users (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES b2b_organizations(id),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS manager_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_settings (
      id SERIAL PRIMARY KEY,
      content_key TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'fr',
      content_value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      updated_by TEXT,
      UNIQUE(content_key, lang)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_diagnostics_user ON diagnostics(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category, status);
    CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_content_key ON content_settings(content_key, lang);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);

  console.log('Schema PostgreSQL initialise avec succes.');
}

initSchema()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Erreur lors de initialisation:', err);
    pool.end();
  });

module.exports = pool;
