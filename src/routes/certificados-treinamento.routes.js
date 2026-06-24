const express = require("express");
const pool = require("../db/pool");
const { registrarAuditoria } = require("../utils/auditoria");

const router = express.Router();

router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, f.nome_completo, f.cargo_atual, f.setor, t.nome_treinamento, t.data_realizacao
       FROM rh_certificados_treinamentos c
       JOIN rh_funcionarios f ON f.id = c.funcionario_id
       JOIN rh_treinamentos_turmas t ON t.id = c.turma_id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Certificado não encontrado." });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:id/marcar-baixado", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rh_certificados_treinamentos WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Certificado não encontrado." });
    }

    await pool.query("UPDATE rh_certificados_treinamentos SET baixado_em = NOW() WHERE id = ?", [req.params.id]);

    await registrarAuditoria({
      req,
      entidade: "certificado_treinamento",
      entidadeId: req.params.id,
      acao: "baixar",
      descricao: `Baixou o certificado "${rows[0].codigo}" de "${rows[0].nome_funcionario_snapshot}".`,
    });

    const [updatedRows] = await pool.query("SELECT * FROM rh_certificados_treinamentos WHERE id = ?", [req.params.id]);
    res.json({ success: true, data: updatedRows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
