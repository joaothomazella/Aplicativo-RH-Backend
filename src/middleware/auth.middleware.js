const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "[auth] JWT_SECRET não definido. Configure essa variável de ambiente no Railway antes de ir para produção."
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET || "dev-secret-inseguro");
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
