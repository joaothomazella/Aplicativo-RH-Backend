const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

async function getFuncionario(funcionarioId) {
  const [rows] = await pool.query("SELECT id, cargo_atual, setor FROM rh_funcionarios WHERE id = ?", [funcionarioId]);
  return rows[0] || null;
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, m.nome AS motivo_nome
       FROM rh_funcionarios_alteracoes_cargo c
       LEFT JOIN rh_funcionarios_motivos_cargo m ON m.id = c.motivo_id
       WHERE c.funcionario_id = ?
       ORDER BY c.data_alteracao DESC, c.id DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", canManageFuncionarios, async (req, res, next) => {
  try {
    const funcionario = await getFuncionario(req.params.id);
    if (!funcionario) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const { data_alteracao, cargo_novo, setor_novo, motivo_id, motivo_texto, observacoes } = req.body;
    if (!data_alteracao) {
      return res.status(400).json({ success: false, error: "Campo 'data_alteracao' é obrigatório." });
    }
    if (!cargo_novo || !cargo_novo.trim()) {
      return res.status(400).json({ success: false, error: "Campo 'cargo_novo' é obrigatório." });
    }

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_alteracoes_cargo
        (funcionario_id, data_alteracao, cargo_anterior, cargo_novo, setor_anterior, setor_novo, motivo_id, motivo_texto, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        data_alteracao,
        funcionario.cargo_atual || null,
        cargo_novo.trim(),
        funcionario.setor || null,
        setor_novo || null,
        motivo_id || null,
        motivo_texto || null,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    const updates = ["cargo_atual = ?"];
    const updateParams = [cargo_novo.trim()];
    if (setor_novo) {
      updates.push("setor = ?");
      updateParams.push(setor_novo);
    }
    updateParams.push(req.params.id);
    await pool.query(`UPDATE rh_funcionarios SET ${updates.join(", ")} WHERE id = ?`, updateParams);

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_alteracoes_cargo WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_cargo",
      entidadeId: result.insertId,
      acao: "criar_alteracao_cargo",
      descricao: `Alteração de cargo criada para funcionário #${req.params.id}: "${cargo_novo.trim()}".`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:cargoId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_alteracoes_cargo WHERE id = ? AND funcionario_id = ?",
      [req.params.cargoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Registro não encontrado." });
    }
    const existing = existingRows[0];
    const { data_alteracao, cargo_novo, setor_novo, motivo_id, motivo_texto, observacoes } = req.body;

    await pool.query(
      `UPDATE rh_funcionarios_alteracoes_cargo
       SET data_alteracao = ?, cargo_novo = ?, setor_novo = ?, motivo_id = ?, motivo_texto = ?, observacoes = ?
       WHERE id = ?`,
      [
        data_alteracao || existing.data_alteracao,
        cargo_novo !== undefined && cargo_novo.trim() ? cargo_novo.trim() : existing.cargo_novo,
        setor_novo !== undefined ? setor_novo || null : existing.setor_novo,
        motivo_id !== undefined ? motivo_id || null : existing.motivo_id,
        motivo_texto !== undefined ? motivo_texto || null : existing.motivo_texto,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.cargoId,
      ]
    );

    const [mostRecent] = await pool.query(
      "SELECT id, cargo_novo, setor_novo FROM rh_funcionarios_alteracoes_cargo WHERE funcionario_id = ? ORDER BY data_alteracao DESC, id DESC LIMIT 1",
      [req.params.id]
    );
    if (mostRecent.length > 0 && Number(mostRecent[0].id) === Number(req.params.cargoId)) {
      const updates = ["cargo_atual = ?"];
      const updateParams = [mostRecent[0].cargo_novo];
      if (mostRecent[0].setor_novo) {
        updates.push("setor = ?");
        updateParams.push(mostRecent[0].setor_novo);
      }
      updateParams.push(req.params.id);
      await pool.query(`UPDATE rh_funcionarios SET ${updates.join(", ")} WHERE id = ?`, updateParams);
    }

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_alteracoes_cargo WHERE id = ?", [req.params.cargoId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:cargoId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_alteracoes_cargo WHERE id = ? AND funcionario_id = ?",
      [req.params.cargoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Registro não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_alteracoes_cargo WHERE id = ?", [req.params.cargoId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
