const jwt = require('jsonwebtoken');

const roleAliases = {
  employee: 'employee',
  manager: 'manager',
  sm: 'senior_authority',
  senior_authority: 'senior_authority',
  performance_officer: 'performance_officer',
  board_member: 'board_member',
  admin: 'admin',
};

function normalizeRole(role) {
  if (!role) return role;
  return roleAliases[role] || role;
}

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1]; // format: "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: 'Invalid token format' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    decoded.role = normalizeRole(decoded.role);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
    const userRole = normalizeRole(req.user && req.user.role);

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole, normalizeRole };