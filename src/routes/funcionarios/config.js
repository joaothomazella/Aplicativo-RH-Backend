const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");

const router = express.Router();

const RESOURCES = {
  "motivos-reajuste": "rh_funcionarios_motivos_reajuste",
  "motivos-cargo": "rh_funcionarios_motivos_cargo",
  "tipos-treinamento": "rh_funcionarios_tipos_treinamento",
  "tipos-disciplinar": "rh_funcionarios_tipos_disciplinar",
};

function registerLookupRoutes(path, table) {
  router.get(`/${path}`, async (req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY ativo DESC, nome ASC`);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post(`/${path}`, canManageFuncionarios, async (req, res, next) => {
    try {
      const { nome, descricao } = req.body;
      if (!nome || !nome.trim()) {
        return res.status(400).json({ success: false, error: "Campo 'nome' é obrigatório." });
      }
      const [result] = await pool.query(`INSERT INTO ${table} (nome, descricao) VALUES (?, ?)`, [
        nome.trim(),
        descricao || null,
      ]);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.put(`/${path}/:itemId`, canManageFuncionarios, async (req, res, next) => {
    try {
      const { nome, descricao, ativo } = req.body;
      const [existingRows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.itemId]);
      if (existingRows.length === 0) {
        return res.status(404).json({ success: false, error: "Registro não encontrado." });
      }
      const existing = existingRows[0];
      await pool.query(`UPDATE ${table} SET nome = ?, descricao = ?, ativo = ? WHERE id = ?`, [
        nome !== undefined && nome.trim() ? nome.trim() : existing.nome,
        descricao !== undefined ? descricao || null : existing.descricao,
        ativo !== undefined ? (ativo ? 1 : 0) : existing.ativo,
        req.params.itemId,
      ]);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.itemId]);
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      next(err);
    }
  });
}

for (const [path, table] of Object.entries(RESOURCES)) {
  registerLookupRoutes(path, table);
}

module.exports = router;
