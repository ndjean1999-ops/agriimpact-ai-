// src/db/init.js
// Initialise la base de données SQLite avec toutes les tables nécessaires.
// SQLite est un seul fichier (.db) — aucun serveur de base de données à gérer,
// idéal pour démarrer. On pourra migrer vers PostgreSQL plus tard sans
// changer la logique métier (juste la couche d'accès aux données).

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DATABASE_PATH || './data/agriimpact.db';
const DB_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // meilleure résistance aux écritures concurrentes

function initSchema() {
  db.exec(`
    -- ===========================================
    -- UTILISATEURS (agriculteurs, via web ou WhatsApp)
    -- ===========================================
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT UNIQUE,           -- format WhatsApp: 22961xxxxxx
      whatsapp_name TEXT,                  -- nom affiché WhatsApp
      full_name TEXT,
      location_name TEXT,                  -- ex: "Parakou, Bénin"
      latitude REAL,
      longitude REAL,
      preferred_language TEXT DEFAULT 'fr', -- fr, en, fon, bariba, dendi, yor
      crop_types TEXT,                     -- JSON array: ["maïs", "soja"]
      created_at TEXT DEFAULT (datetime('now')),
      last_active_at TEXT DEFAULT (datetime('now'))
    );

    -- ===========================================
    -- CONVERSATIONS WhatsApp / Web (historique du conseiller IA)
    -- ===========================================
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT DEFAULT 'whatsapp',     -- whatsapp | web
      role TEXT NOT NULL,                   -- user | assistant
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ===========================================
    -- DIAGNOSTICS (photos analysées)
    -- ===========================================
    CREATE TABLE IF NOT EXISTS diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT DEFAULT 'whatsapp',
      image_path TEXT,                      -- chemin local ou URL média WhatsApp
      diagnostic_label TEXT,
      confidence TEXT,                       -- haute | moyenne | basse
      causes TEXT,
      treatment_bio TEXT,                    -- JSON array
      treatment_conventional TEXT,           -- JSON array
      prevention TEXT,                       -- JSON array
      raw_response TEXT,                     -- JSON complet renvoyé par Claude
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- ===========================================
    -- MARKETPLACE — annonces
    -- ===========================================
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,               -- crops | inputs | equipment | livestock
      price_amount REAL,
      price_unit TEXT,                       -- ex: "sac de 100kg", "kg", "tête"
      currency TEXT DEFAULT 'FCFA',
      description TEXT,
      location_name TEXT,
      latitude REAL,
      longitude REAL,
      quantity_available TEXT,
      image_path TEXT,
      status TEXT DEFAULT 'active',          -- active | sold | expired | removed
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Messages d'intérêt / contact sur une annonce
    CREATE TABLE IF NOT EXISTS listing_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      buyer_user_id INTEGER NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (listing_id) REFERENCES listings(id),
      FOREIGN KEY (buyer_user_id) REFERENCES users(id)
    );

    -- ===========================================
    -- B2B — organisations partenaires (ONG, coopératives, banques, assureurs)
    -- ===========================================
    CREATE TABLE IF NOT EXISTS b2b_organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      org_type TEXT NOT NULL,               -- ong | cooperative | banque | assureur | ministere | autre
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      plan TEXT DEFAULT 'decouverte',        -- decouverte | standard | premium | sur-mesure
      region_focus TEXT,                     -- ex: "Nord-Bénin", "national"
      api_key TEXT UNIQUE,                   -- clé API pour accès programmatique au dashboard
      status TEXT DEFAULT 'prospect',        -- prospect | actif | suspendu
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Utilisateurs admin du dashboard B2B (login web)
    CREATE TABLE IF NOT EXISTS b2b_admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'viewer',             -- viewer | admin
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (organization_id) REFERENCES b2b_organizations(id)
    );

    -- ===========================================
    -- MANAGER — le propriétaire de la plateforme (toi), distinct des partenaires B2B
    -- ===========================================
    CREATE TABLE IF NOT EXISTS manager_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Contenus éditables du bot (textes du menu WhatsApp, conseil du jour, etc.)
    -- sans avoir à toucher au code ni redéployer. Clé/valeur simple, une ligne par
    -- texte * langue, ex: key="home.tip.body", lang="fr"
    CREATE TABLE IF NOT EXISTS content_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_key TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'fr',
      content_value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT,
      UNIQUE(content_key, lang)
    );

    -- Journal d'audit : qui a changé quoi, pour traçabilité (annonces supprimées,
    -- organisations suspendues, contenus modifiés...)
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Index utiles pour les requêtes fréquentes
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_diagnostics_user ON diagnostics(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category, status);
    CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_content_key ON content_settings(content_key, lang);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);

  console.log('✅ Schéma de base de données initialisé avec succès.');
  console.log(`📁 Fichier base de données : ${path.resolve(DB_PATH)}`);
}

initSchema();

module.exports = db;
