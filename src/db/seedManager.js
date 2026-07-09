// src/db/seedManager.js
//
// Crée (ou met à jour le mot de passe d') le compte manager principal.
// À exécuter une seule fois après le déploiement : `npm run create-manager`
// Utilise des variables d'environnement pour ne jamais committer de mot de passe en clair.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./connection');

async function seedManager() {
  const email = process.env.MANAGER_EMAIL;
  const password = process.env.MANAGER_PASSWORD;
  const fullName = process.env.MANAGER_NAME || 'Administrateur AgriImpact';

  if (!email || !password) {
    console.error('❌ Définis MANAGER_EMAIL et MANAGER_PASSWORD dans ton .env avant de lancer ce script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Le mot de passe manager doit faire au moins 8 caractères.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = db.prepare('SELECT id FROM manager_users WHERE email = ?').get(email);

  if (existing) {
    db.prepare('UPDATE manager_users SET password_hash = ?, full_name = ? WHERE id = ?')
      .run(passwordHash, fullName, existing.id);
    console.log(`✅ Mot de passe mis à jour pour le manager ${email}`);
  } else {
    db.prepare('INSERT INTO manager_users (email, password_hash, full_name) VALUES (?, ?, ?)')
      .run(email, passwordHash, fullName);
    console.log(`✅ Compte manager créé : ${email}`);
  }
  console.log('   Tu peux maintenant te connecter sur /manager');
}

seedManager();
