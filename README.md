# AgriImpact AI — Backend

Backend complet : webhook WhatsApp, API web (diagnostic, conseiller, marketplace), et module B2B (dashboard partenaires).

Ce guide part du principe que tu débutes. Chaque étape est dans l'ordre, fais-les une par une.

---

## 0. Ce qu'il te faut avant de commencer

- Un ordinateur avec [Node.js](https://nodejs.org) installé (version 18 ou plus récente)
- Un compte [GitHub](https://github.com) (gratuit)
- Un compte [Render.com](https://render.com) (gratuit, pour héberger le serveur)
- Un compte développeur [Meta for Developers](https://developers.facebook.com) (gratuit, pour WhatsApp)
- Une clé API Anthropic, sur [console.anthropic.com](https://console.anthropic.com)

---

## 1. Tester en local (sur ton ordinateur)

```bash
cd agriimpact-backend
npm install
cp .env.example .env
```

Ouvre le fichier `.env` et remplis au minimum `ANTHROPIC_API_KEY` et `JWT_SECRET` (n'importe quelle longue chaîne aléatoire). Les variables WhatsApp peuvent rester vides pour l'instant.

```bash
npm run init-db
npm start
```

Si tout va bien, tu verras :
```
🌾 AgriImpact AI backend démarré sur le port 3000
```

Ouvre `http://localhost:3000/health` dans ton navigateur — tu dois voir `{"status":"ok"}`.

---

## 2. Mettre le code sur GitHub

```bash
git init
git add .
git commit -m "Premier commit AgriImpact backend"
```

Crée un nouveau repository sur GitHub (par exemple `agriimpact-backend`), puis :

```bash
git remote add origin https://github.com/TON_PSEUDO/agriimpact-backend.git
git branch -M main
git push -u origin main
```

**Important** : vérifie que le fichier `.env` n'est PAS sur GitHub (il contient tes clés secrètes). Le fichier `.gitignore` fourni s'en occupe déjà.

---

## 3. Déployer sur Render.com (gratuit)

1. Va sur [render.com](https://render.com), connecte-toi avec GitHub
2. Clique "New +" → "Web Service"
3. Choisis ton repository `agriimpact-backend`
4. Configure :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
5. Dans l'onglet "Environment", ajoute toutes les variables de ton fichier `.env` (sauf `PORT`, Render le gère seul)
6. Clique "Create Web Service"

Après quelques minutes, Render te donne une URL du type :
`https://agriimpact-backend.onrender.com`

**Attention au tier gratuit de Render** : le serveur "s'endort" après 15 minutes d'inactivité et prend ~30 secondes à se réveiller au premier message suivant. Pour un vrai lancement avec des utilisateurs, passe au tier payant (7$/mois) pour éviter ce délai — sinon le premier message WhatsApp de chaque session sera lent.

**Persistance de la base SQLite sur Render** : le disque de Render gratuit n'est PAS persistant entre les redéploiements. Pour garder tes données, ajoute un "Disk" payant (1$/mois pour 1GB, largement suffisant au début) dans les paramètres du service, monté sur `/data`, et mets `DATABASE_PATH=/data/agriimpact.db` dans tes variables d'environnement.

---

## 4. Configurer WhatsApp Cloud API

### 4.1 Créer l'app Meta

1. Va sur [developers.facebook.com](https://developers.facebook.com) → "Mes apps" → "Créer une app"
2. Choisis le type "Entreprise"
3. Une fois l'app créée, dans le tableau de bord, ajoute le produit "WhatsApp"
4. Meta te donne automatiquement un **numéro de test** et un **token temporaire** (valable 24h, pour tester seulement)

### 4.2 Récupérer tes identifiants

Dans App Dashboard → WhatsApp → Configuration, note :
- **Phone Number ID**
- **WhatsApp Business Account ID (WABA ID)**

### 4.3 Générer un token permanent

Le token temporaire expire en 24h, inutile en production. Pour un token permanent :
1. Va dans Meta Business Suite → Paramètres de l'entreprise → Utilisateurs système
2. Crée un "Utilisateur système" (System User)
3. Assigne-lui ton app WhatsApp avec les permissions `whatsapp_business_messaging` et `whatsapp_business_management`
4. Génère un token pour cet utilisateur système — choisis "ne jamais expirer"

Mets ce token dans `WHATSAPP_TOKEN` sur Render.

### 4.4 Configurer le webhook

1. Dans App Dashboard → WhatsApp → Configuration, section "Webhook"
2. URL de rappel : `https://TON-APP.onrender.com/webhook/whatsapp`
3. Jeton de vérification : la même valeur que `WHATSAPP_VERIFY_TOKEN` dans ton `.env`
4. Clique "Vérifier et enregistrer"
5. Abonne-toi au champ webhook **messages**

### 4.5 Tester

Ajoute ton propre numéro comme destinataire de test (dans la section sandbox du dashboard WhatsApp), puis envoie un message "Bonjour" depuis WhatsApp vers le numéro de test. Tu devrais recevoir le menu automatiquement.

### 4.6 Passer en production (numéro réel, plus de limite sandbox)

Ça demande une **vérification d'entreprise** par Meta (Business Verification), qui peut prendre de quelques jours à plusieurs semaines. Tu peux commencer à développer et tester en mode sandbox en attendant — ne bloque pas le développement sur cette étape.

---

## 5. Panneau Manager — ton espace de contrôle

Le panneau Manager (`/manager`) est réservé à toi, propriétaire de la plateforme. Il est complètement séparé du dashboard B2B (`/dashboard`, réservé aux organisations partenaires) — un partenaire B2B ne peut jamais y accéder.

### 5.1 Créer ton accès

Une seule fois, après le déploiement :

```bash
# Dans ton .env, définis MANAGER_EMAIL et MANAGER_PASSWORD (8 caractères minimum)
npm run create-manager
```

Connecte-toi ensuite sur `https://TON-APP.onrender.com/manager`.

### 5.2 Ce que tu peux faire depuis le panneau

| Onglet | Ce que ça permet |
|---|---|
| **Vue d'ensemble** | Nombre d'agriculteurs inscrits/actifs, diagnostics réalisés, problèmes agricoles les plus fréquents |
| **Contenus du bot** | Modifier le message d'accueil WhatsApp et les conseils du jour, dans chaque langue, sans toucher au code ni redéployer |
| **Marketplace** | Voir toutes les annonces actives, marquer "vendu" ou retirer une annonce abusive |
| **Utilisateurs** | Consulter la liste des agriculteurs inscrits, exporter en CSV |
| **Partenaires B2B** | Activer, suspendre, ou changer le plan d'une organisation inscrite |
| **Journal d'audit** | Historique de toutes les actions effectuées depuis ce panneau (qui a fait quoi, quand) |

### 5.3 Comment fonctionne l'édition de contenu

Les textes modifiables (comme le message d'accueil WhatsApp) sont stockés en base de données, pas dans le code. Quand tu modifies un texte dans l'onglet "Contenus du bot" et cliques "Enregistrer", le changement est immédiat — le prochain agriculteur qui écrit au bot verra le nouveau texte, sans redéploiement.

Pour ajouter d'autres textes éditables (au-delà du message d'accueil et du conseil du jour fournis par défaut), modifie la liste `EDITABLE_CONTENTS` dans `public/manager/dashboard.html`, et fais lire la valeur correspondante via `managerModel.getContent(cle, langue)` dans le code qui génère ce texte (voir l'exemple dans `whatsappWebhook.js`, fonction `sendMainMenu`).

---

## 6. Coûts réels à prévoir

| Poste | Coût |
|---|---|
| Render.com (serveur) | Gratuit pour tester, ~7$/mois pour un vrai lancement |
| Render.com (disque persistant) | ~1$/mois |
| WhatsApp Cloud API | Gratuit jusqu'à 1000 conversations de service/mois, ensuite quelques centimes par conversation |
| Anthropic API (Claude) | Facturé à l'usage, quelques centimes par diagnostic/question — prévoir un budget de test avant un vrai lancement |
| Nom de domaine (optionnel) | ~10$/an si tu veux un domaine perso plutôt que `.onrender.com` |

---

## 7. Structure du projet

```
agriimpact-backend/
├── src/
│   ├── server.js              ← point d'entrée
│   ├── db/
│   │   ├── init.js             ← création des tables SQLite
│   │   ├── connection.js
│   │   ├── seedManager.js      ← crée ton compte manager (npm run create-manager)
│   │   └── models/             ← accès aux données (users, conversations, listings, b2b, manager)
│   ├── routes/
│   │   ├── whatsappWebhook.js  ← cœur de l'intégration WhatsApp (FR/EN/Fon/Bariba/Dendi/Yoruba)
│   │   ├── diagnosticRoutes.js ← API diagnostic photo (frontend web)
│   │   ├── chatRoutes.js       ← API conseiller (frontend web)
│   │   ├── marketRoutes.js     ← API marketplace
│   │   ├── b2bRoutes.js        ← API + auth dashboard B2B (partenaires)
│   │   └── managerRoutes.js    ← API + auth panneau Manager (toi)
│   ├── services/
│   │   ├── claudeService.js    ← appels à l'API Anthropic
│   │   └── whatsappService.js  ← appels à la WhatsApp Cloud API
│   └── middleware/
│       ├── authB2B.js
│       └── authManager.js
└── public/
    ├── dashboard/               ← dashboard B2B (HTML statique, pour les partenaires)
    └── manager/                 ← panneau Manager (HTML statique, pour toi uniquement)
```

---

## 8. Prochaines étapes suggérées

- Brancher le fichier `agriimpact-ai.html` (frontend) sur ces routes API au lieu d'appeler Claude directement
- Ajouter l'envoi d'images dans les annonces marketplace (actuellement texte seul)
- Passer de SQLite à PostgreSQL quand tu dépasses quelques milliers d'utilisateurs (SQLite tient largement au démarrage)
- Étendre la liste `EDITABLE_CONTENTS` du panneau Manager pour couvrir plus de textes du bot
- Ajouter un deuxième compte manager si quelqu'un t'aide à gérer la plateforme (actuellement un seul compte par email, mais la table `manager_users` supporte déjà plusieurs comptes)
