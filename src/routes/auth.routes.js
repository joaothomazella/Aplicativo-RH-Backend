const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { authMiddleware, JWT_SECRET } = require("../middleware/auth.middleware");

const router = express.Router();

function toPublicUser(row) {
  return { id: row.id, nome: row.nome, usuario: row.usuario, perfil: row.perfil };
}

router.post("/login", async (req, res, next) => {
  try {
    const { usuario, senha } = req.body || {};

    if (!usuario || !senha) {
      return res.status(400).json({ error: "Informe usuário e senha." });
    }

    const [rows] = await pool.query(
      "SELECT * FROM rh_usuarios WHERE usuario = ? AND ativo = 1 LIMIT 1",
      [usuario]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    await pool.query("UPDATE rh_usuarios SET ultimo_login = NOW() WHERE id = ?", [user.id]);

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, perfil: user.perfil, nome: user.nome },
      JWT_SECRET || "dev-secret-inseguro",
      { expiresIn: "7d" }
    );

    res.json({ success: true, token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rh_usuarios WHERE id = ? AND ativo = 1 LIMIT 1",
      [req.user.id]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado ou inativo." });
    }

    res.json({ success: true, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  res.json({ success: true });
});

module.exports = router;
