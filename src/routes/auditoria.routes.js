const express = require("express");
const pool = require("../db/pool");
const { requireRole } = require("../middleware/permissions.middleware");

const router = express.Router();

router.use(requireRole("admin"));

router.get("/", async (req, res, next) => {
  try {
    const { usuario_id, entidade, acao, data_inicio, data_fim } = req.query;

    const where = [];
    const params = [];

    if (usuario_id) {
      where.push("usuario_id = ?");
      params.push(usuario_id);
    }
    if (entidade) {
      where.push("entidade = ?");
      params.push(entidade);
    }
    if (acao) {
      where.push("acao = ?");
      params.push(acao);
    }
    if (data_inicio) {
      where.push("created_at >= ?");
      params.push(`${data_inicio} 00:00:00`);
    }
    if (data_fim) {
      where.push("created_at <= ?");
      params.push(`${data_fim} 23:59:59`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT * FROM rh_auditoria ${whereSql} ORDER BY created_at DESC LIMIT 500`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
