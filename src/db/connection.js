// src/db/connection.js
// Connexion partagée à la base PostgreSQL (Render), utilisée par toutes les routes.

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
