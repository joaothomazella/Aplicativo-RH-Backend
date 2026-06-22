const SENSITIVE_ROLES = ["admin", "rh"];
const MANAGE_ROLES = ["admin", "rh"];

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.perfil)) {
      return res.status(403).json({ success: false, error: "Você não tem permissão para esta ação." });
    }
    next();
  };
}

function canAccessSensitiveData(req, res, next) {
  if (!SENSITIVE_ROLES.includes(req.user?.perfil)) {
    return res.status(403).json({ success: false, error: "Você não tem permissão para acessar dados sensíveis." });
  }
  next();
}

function canManageFuncionarios(req, res, next) {
  if (!MANAGE_ROLES.includes(req.user?.perfil)) {
    return res.status(403).json({ success: false, error: "Você não tem permissão para esta ação." });
  }
  next();
}

function isAdmin(req) {
  return req.user?.perfil === "admin";
}

function isAdminOrRh(req) {
  return SENSITIVE_ROLES.includes(req.user?.perfil);
}

module.exports = { requireRole, canAccessSensitiveData, canManageFuncionarios, isAdmin, isAdminOrRh };
