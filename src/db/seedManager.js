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
    console.error('Definis MANAGER_EMAIL et MANAGER_PASSWORD dans ton .env avant de lancer ce script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Le mot de passe manager doit faire au moins 8 caracteres.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existingResult = await db.query('SELECT id FROM manager_users WHERE email = $1', [email]);
  const existing = existingResult.rows[0];

  if (existing) {
    await db.query(
      'UPDATE manager_users SET password_hash = $1, full_name = $2 WHERE id = $3',
      [passwordHash, fullName, existing.id]
    );
    console.log(`Mot de passe mis a jour pour le manager ${email}`);
  } else {
    await db.query(
      'INSERT INTO manager_users (email, password_hash, full_name) VALUES ($1, $2, $3)',
      [email, passwordHash, fullName]
    );
    console.log(`Compte manager cree : ${email}`);
  }
  console.log('   Tu peux maintenant te connecter sur /manager');
  await db.end();
}

seedManager();
