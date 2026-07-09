// src/db/connection.js
// Connexion partagée à la base SQLite, utilisée par toutes les routes.
// On suppose que `npm run init-db` a déjà créé les tables.

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DATABASE_PATH || './data/agriimpact.db';
const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');

module.exports = db;
