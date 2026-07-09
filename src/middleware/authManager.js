// src/middleware/authManager.js
const jwt = require('jsonwebtoken');

function requireManagerAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.scope !== 'manager') {
      return res.status(403).json({ error: 'Accès réservé au manager.' });
    }
    req.managerUser = payload; // { managerId, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

module.exports = { requireManagerAuth };
