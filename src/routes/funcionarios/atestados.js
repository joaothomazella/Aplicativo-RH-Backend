const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

function diffDaysInclusive(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rh_funcionarios_atestados WHERE funcionario_id = ? ORDER BY data_inicio DESC, id DESC",
      [req.params.id]
    );
    const [[{ total_dias_ano_atual } = { total_dias_ano_atual: 0 }]] = await pool.query(
      "SELECT COALESCE(SUM(quantidade_dias), 0) AS total_dias_ano_atual FROM rh_funcionarios_atestados WHERE funcionario_id = ? AND ano = ?",
      [req.params.id, new Date().getFullYear()]
    );
    res.json({ success: true, data: rows, totalDiasAnoAtual: Number(total_dias_ano_atual) });
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

    const { data_inicio, data_fim, quantidade_dias, ano, tipo, cid, observacoes } = req.body;
    if (!data_inicio) {
      return res.status(400).json({ success: false, error: "Campo 'data_inicio' é obrigatório." });
    }
    if (data_fim && new Date(data_fim) < new Date(data_inicio)) {
      return res.status(400).json({ success: false, error: "Data fim não pode ser anterior à data início." });
    }

    const quantidadeDiasFinal =
      quantidade_dias !== undefined && quantidade_dias !== null && quantidade_dias !== ""
        ? Math.max(1, Number(quantidade_dias))
        : data_fim
          ? diffDaysInclusive(data_inicio, data_fim)
          : 1;

    const anoFinal = ano || new Date(data_inicio).getFullYear();

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_atestados
        (funcionario_id, ano, data_inicio, data_fim, quantidade_dias, tipo, cid, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        anoFinal,
        data_inicio,
        data_fim || null,
        quantidadeDiasFinal,
        tipo || null,
        cid || null,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_atestados WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_atestado",
      entidadeId: result.insertId,
      acao: "criar_atestado",
      descricao: `Atestado criado para funcionário #${req.params.id}.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:atestadoId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_atestados WHERE id = ? AND funcionario_id = ?",
      [req.params.atestadoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Atestado não encontrado." });
    }
    const existing = existingRows[0];
    const { data_inicio, data_fim, quantidade_dias, ano, tipo, cid, observacoes } = req.body;

    const dataInicioFinal = data_inicio || existing.data_inicio;
    const dataFimFinal = data_fim !== undefined ? data_fim || null : existing.data_fim;
    if (dataFimFinal && new Date(dataFimFinal) < new Date(dataInicioFinal)) {
      return res.status(400).json({ success: false, error: "Data fim não pode ser anterior à data início." });
    }

    const quantidadeDiasFinal =
      quantidade_dias !== undefined && quantidade_dias !== null && quantidade_dias !== ""
        ? Math.max(1, Number(quantidade_dias))
        : dataFimFinal
          ? diffDaysInclusive(dataInicioFinal, dataFimFinal)
          : existing.quantidade_dias;

    await pool.query(
      `UPDATE rh_funcionarios_atestados
       SET ano = ?, data_inicio = ?, data_fim = ?, quantidade_dias = ?, tipo = ?, cid = ?, observacoes = ?
       WHERE id = ?`,
      [
        ano || new Date(dataInicioFinal).getFullYear(),
        dataInicioFinal,
        dataFimFinal,
        quantidadeDiasFinal,
        tipo !== undefined ? tipo || null : existing.tipo,
        cid !== undefined ? cid || null : existing.cid,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.atestadoId,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_atestados WHERE id = ?", [req.params.atestadoId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:atestadoId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT id FROM rh_funcionarios_atestados WHERE id = ? AND funcionario_id = ?",
      [req.params.atestadoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Atestado não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_atestados WHERE id = ?", [req.params.atestadoId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
