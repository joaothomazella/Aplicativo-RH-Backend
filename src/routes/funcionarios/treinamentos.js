const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

function computeStatus(dataValidade) {
  if (!dataValidade) return "sem_validade";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade);
  validade.setHours(0, 0, 0, 0);
  if (validade < hoje) return "vencido";
  const diffDias = Math.round((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 60) return "proximo_vencimento";
  return "valido";
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*, ti.nome AS tipo_nome
       FROM rh_funcionarios_treinamentos t
       LEFT JOIN rh_funcionarios_tipos_treinamento ti ON ti.id = t.tipo_id
       WHERE t.funcionario_id = ?
       ORDER BY t.data_realizacao DESC, t.id DESC`,
      [req.params.id]
    );

    const data = rows.map((row) => ({ ...row, status: computeStatus(row.data_validade) }));
    const changed = data.filter((row, index) => row.status !== rows[index].status);
    for (const row of changed) {
      await pool.query("UPDATE rh_funcionarios_treinamentos SET status = ? WHERE id = ?", [row.status, row.id]);
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/", canManageFuncionarios, async (req, res, next) => {
  try {
    const [funcionarioRows] = await pool.query("SELECT id FROM rh_funcionarios WHERE id = ?", [req.params.id]);
    if (funcionarioRows.length === 0) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const {
      tipo_id,
      nome_treinamento,
      categoria,
      instituicao_instrutor,
      data_realizacao,
      data_validade,
      carga_horaria,
      observacoes,
    } = req.body;

    if (!nome_treinamento || !nome_treinamento.trim()) {
      return res.status(400).json({ success: false, error: "Campo 'nome_treinamento' é obrigatório." });
    }
    if (!data_realizacao) {
      return res.status(400).json({ success: false, error: "Campo 'data_realizacao' é obrigatório." });
    }

    const status = computeStatus(data_validade || null);

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_treinamentos
        (funcionario_id, tipo_id, nome_treinamento, categoria, instituicao_instrutor, data_realizacao, data_validade,
         carga_horaria, status, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        tipo_id || null,
        nome_treinamento.trim(),
        categoria || null,
        instituicao_instrutor || null,
        data_realizacao,
        data_validade || null,
        carga_horaria || null,
        status,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_treinamentos WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_treinamento",
      entidadeId: result.insertId,
      acao: "criar_treinamento",
      descricao: `Treinamento "${nome_treinamento.trim()}" criado para funcionário #${req.params.id}.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:treinamentoId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_treinamentos WHERE id = ? AND funcionario_id = ?",
      [req.params.treinamentoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Treinamento não encontrado." });
    }
    const existing = existingRows[0];
    const {
      tipo_id,
      nome_treinamento,
      categoria,
      instituicao_instrutor,
      data_realizacao,
      data_validade,
      carga_horaria,
      observacoes,
    } = req.body;

    const dataValidadeFinal = data_validade !== undefined ? data_validade || null : existing.data_validade;
    const status = computeStatus(dataValidadeFinal);

    await pool.query(
      `UPDATE rh_funcionarios_treinamentos
       SET tipo_id = ?, nome_treinamento = ?, categoria = ?, instituicao_instrutor = ?, data_realizacao = ?,
           data_validade = ?, carga_horaria = ?, status = ?, observacoes = ?
       WHERE id = ?`,
      [
        tipo_id !== undefined ? tipo_id || null : existing.tipo_id,
        nome_treinamento !== undefined && nome_treinamento.trim() ? nome_treinamento.trim() : existing.nome_treinamento,
        categoria !== undefined ? categoria || null : existing.categoria,
        instituicao_instrutor !== undefined ? instituicao_instrutor || null : existing.instituicao_instrutor,
        data_realizacao || existing.data_realizacao,
        dataValidadeFinal,
        carga_horaria !== undefined ? carga_horaria || null : existing.carga_horaria,
        status,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.treinamentoId,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_treinamentos WHERE id = ?", [req.params.treinamentoId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:treinamentoId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT id FROM rh_funcionarios_treinamentos WHERE id = ? AND funcionario_id = ?",
      [req.params.treinamentoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Treinamento não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_treinamentos WHERE id = ?", [req.params.treinamentoId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
