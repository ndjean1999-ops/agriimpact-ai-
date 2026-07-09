// src/middleware/authB2B.js
const jwt = require('jsonwebtoken');

function requireB2BAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.b2bUser = payload; // { adminId, organizationId, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

module.exports = { requireB2BAuth };
