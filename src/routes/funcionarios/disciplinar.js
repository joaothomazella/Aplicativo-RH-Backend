const express = require("express");
const pool = require("../../db/pool");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, t.nome AS tipo_nome
       FROM rh_funcionarios_historico_disciplinar d
       LEFT JOIN rh_funcionarios_tipos_disciplinar t ON t.id = d.tipo_id
       WHERE d.funcionario_id = ?
       ORDER BY d.data_registro DESC, d.id DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const [funcionarioRows] = await pool.query("SELECT id FROM rh_funcionarios WHERE id = ?", [req.params.id]);
    if (funcionarioRows.length === 0) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const { tipo_id, data_registro, tipo, motivo, descricao, medida_tomada, observacoes } = req.body;
    if (!data_registro) {
      return res.status(400).json({ success: false, error: "Campo 'data_registro' é obrigatório." });
    }
    if (!tipo_id && !tipo) {
      return res.status(400).json({ success: false, error: "Informe o tipo do registro." });
    }
    if (!descricao && !motivo) {
      return res.status(400).json({ success: false, error: "Informe a descrição ou o motivo do registro." });
    }

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_historico_disciplinar
        (funcionario_id, tipo_id, data_registro, tipo, motivo, descricao, medida_tomada, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        tipo_id || null,
        data_registro,
        tipo || null,
        motivo || null,
        descricao || null,
        medida_tomada || null,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_historico_disciplinar WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_disciplinar",
      entidadeId: result.insertId,
      acao: "criar_historico_disciplinar",
      descricao: `Registro disciplinar criado para funcionário #${req.params.id}.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:registroId", async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_historico_disciplinar WHERE id = ? AND funcionario_id = ?",
      [req.params.registroId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Registro não encontrado." });
    }
    const existing = existingRows[0];
    const { tipo_id, data_registro, tipo, motivo, descricao, medida_tomada, observacoes } = req.body;

    await pool.query(
      `UPDATE rh_funcionarios_historico_disciplinar
       SET tipo_id = ?, data_registro = ?, tipo = ?, motivo = ?, descricao = ?, medida_tomada = ?, observacoes = ?
       WHERE id = ?`,
      [
        tipo_id !== undefined ? tipo_id || null : existing.tipo_id,
        data_registro || existing.data_registro,
        tipo !== undefined ? tipo || null : existing.tipo,
        motivo !== undefined ? motivo || null : existing.motivo,
        descricao !== undefined ? descricao || null : existing.descricao,
        medida_tomada !== undefined ? medida_tomada || null : existing.medida_tomada,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.registroId,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_historico_disciplinar WHERE id = ?", [req.params.registroId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:registroId", async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT id FROM rh_funcionarios_historico_disciplinar WHERE id = ? AND funcionario_id = ?",
      [req.params.registroId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Registro não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_historico_disciplinar WHERE id = ?", [req.params.registroId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
