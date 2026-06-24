const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router();

const RESOURCES = {
  "motivos-reajuste": "rh_funcionarios_motivos_reajuste",
  "motivos-cargo": "rh_funcionarios_motivos_cargo",
  "tipos-treinamento": "rh_funcionarios_tipos_treinamento",
  "tipos-disciplinar": "rh_funcionarios_tipos_disciplinar",
  setores: "rh_funcionarios_setores",
  cargos: "rh_funcionarios_cargos",
};

const AUDITORIA_ENTIDADES = {
  setores: "funcionarios_setor",
  cargos: "funcionarios_cargo",
};

function registerLookupRoutes(path, table) {
  const entidadeAuditoria = AUDITORIA_ENTIDADES[path];
  const checkDuplicates = Boolean(entidadeAuditoria);

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
      if (checkDuplicates) {
        const [existing] = await pool.query(`SELECT id FROM ${table} WHERE nome = ?`, [nome.trim()]);
        if (existing.length > 0) {
          return res.status(409).json({ success: false, error: "Já existe um registro com esse nome." });
        }
      }
      const [result] = await pool.query(`INSERT INTO ${table} (nome, descricao) VALUES (?, ?)`, [
        nome.trim(),
        descricao || null,
      ]);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [result.insertId]);
      if (entidadeAuditoria) {
        await registrarAuditoria({
          req,
          entidade: entidadeAuditoria,
          entidadeId: result.insertId,
          acao: "criar",
          descricao: `Criou ${path === "setores" ? "setor" : "cargo"} "${rows[0].nome}"`,
          dadosDepois: rows[0],
        });
      }
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
      if (checkDuplicates && nome !== undefined && nome.trim() && nome.trim() !== existing.nome) {
        const [duplicate] = await pool.query(`SELECT id FROM ${table} WHERE nome = ? AND id <> ?`, [
          nome.trim(),
          req.params.itemId,
        ]);
        if (duplicate.length > 0) {
          return res.status(409).json({ success: false, error: "Já existe um registro com esse nome." });
        }
      }
      await pool.query(`UPDATE ${table} SET nome = ?, descricao = ?, ativo = ? WHERE id = ?`, [
        nome !== undefined && nome.trim() ? nome.trim() : existing.nome,
        descricao !== undefined ? descricao || null : existing.descricao,
        ativo !== undefined ? (ativo ? 1 : 0) : existing.ativo,
        req.params.itemId,
      ]);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.itemId]);
      if (entidadeAuditoria) {
        await registrarAuditoria({
          req,
          entidade: entidadeAuditoria,
          entidadeId: req.params.itemId,
          acao: "editar",
          descricao: `Editou ${path === "setores" ? "setor" : "cargo"} "${rows[0].nome}"`,
          dadosAntes: existing,
          dadosDepois: rows[0],
        });
      }
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
