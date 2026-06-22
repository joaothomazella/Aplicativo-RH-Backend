const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

const STATUSES = ["programada", "em_andamento", "concluida", "cancelada"];

function diffDaysInclusive(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : null;
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rh_funcionarios_ferias WHERE funcionario_id = ? ORDER BY periodo_aquisitivo_inicio DESC, id DESC",
      [req.params.id]
    );
    res.json({ success: true, data: rows });
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
      periodo_aquisitivo_inicio,
      periodo_aquisitivo_fim,
      gozo_inicio,
      gozo_fim,
      dias_ferias,
      abono_inicio,
      abono_fim,
      dias_abono,
      status,
      observacoes,
    } = req.body;

    if (!periodo_aquisitivo_inicio || !periodo_aquisitivo_fim) {
      return res.status(400).json({ success: false, error: "Período aquisitivo (início e fim) é obrigatório." });
    }
    if (gozo_inicio && gozo_fim && new Date(gozo_fim) < new Date(gozo_inicio)) {
      return res.status(400).json({ success: false, error: "Data fim do gozo não pode ser anterior à data início." });
    }
    const statusFinal = status && STATUSES.includes(status) ? status : "programada";

    const diasFeriasFinal =
      dias_ferias !== undefined && dias_ferias !== null && dias_ferias !== ""
        ? Number(dias_ferias)
        : gozo_inicio && gozo_fim
          ? diffDaysInclusive(gozo_inicio, gozo_fim)
          : null;

    const diasAbonoFinal =
      dias_abono !== undefined && dias_abono !== null && dias_abono !== ""
        ? Number(dias_abono)
        : abono_inicio && abono_fim
          ? diffDaysInclusive(abono_inicio, abono_fim)
          : null;

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_ferias
        (funcionario_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim, gozo_inicio, gozo_fim, dias_ferias,
         abono_inicio, abono_fim, dias_abono, status, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        periodo_aquisitivo_inicio,
        periodo_aquisitivo_fim,
        gozo_inicio || null,
        gozo_fim || null,
        diasFeriasFinal,
        abono_inicio || null,
        abono_fim || null,
        diasAbonoFinal,
        statusFinal,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_ferias WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_ferias",
      entidadeId: result.insertId,
      acao: "criar_ferias",
      descricao: `Registro de férias criado para funcionário #${req.params.id}.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:feriasId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query("SELECT * FROM rh_funcionarios_ferias WHERE id = ? AND funcionario_id = ?", [
      req.params.feriasId,
      req.params.id,
    ]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Registro de férias não encontrado." });
    }
    const existing = existingRows[0];
    const {
      periodo_aquisitivo_inicio,
      periodo_aquisitivo_fim,
      gozo_inicio,
      gozo_fim,
      dias_ferias,
      abono_inicio,
      abono_fim,
      dias_abono,
      status,
      observacoes,
    } = req.body;

    const gozoInicioFinal = gozo_inicio !== undefined ? gozo_inicio || null : existing.gozo_inicio;
    const gozoFimFinal = gozo_fim !== undefined ? gozo_fim || null : existing.gozo_fim;
    if (gozoInicioFinal && gozoFimFinal && new Date(gozoFimFinal) < new Date(gozoInicioFinal)) {
      return res.status(400).json({ success: false, error: "Data fim do gozo não pode ser anterior à data início." });
    }
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: "Status inválido." });
    }

    const abonoInicioFinal = abono_inicio !== undefined ? abono_inicio || null : existing.abono_inicio;
    const abonoFimFinal = abono_fim !== undefined ? abono_fim || null : existing.abono_fim;

    const diasFeriasFinal =
      dias_ferias !== undefined && dias_ferias !== null && dias_ferias !== ""
        ? Number(dias_ferias)
        : gozoInicioFinal && gozoFimFinal
          ? diffDaysInclusive(gozoInicioFinal, gozoFimFinal)
          : existing.dias_ferias;

    const diasAbonoFinal =
      dias_abono !== undefined && dias_abono !== null && dias_abono !== ""
        ? Number(dias_abono)
        : abonoInicioFinal && abonoFimFinal
          ? diffDaysInclusive(abonoInicioFinal, abonoFimFinal)
          : existing.dias_abono;

    await pool.query(
      `UPDATE rh_funcionarios_ferias
       SET periodo_aquisitivo_inicio = ?, periodo_aquisitivo_fim = ?, gozo_inicio = ?, gozo_fim = ?, dias_ferias = ?,
           abono_inicio = ?, abono_fim = ?, dias_abono = ?, status = ?, observacoes = ?
       WHERE id = ?`,
      [
        periodo_aquisitivo_inicio || existing.periodo_aquisitivo_inicio,
        periodo_aquisitivo_fim || existing.periodo_aquisitivo_fim,
        gozoInicioFinal,
        gozoFimFinal,
        diasFeriasFinal,
        abonoInicioFinal,
        abonoFimFinal,
        diasAbonoFinal,
        status !== undefined ? status : existing.status,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.feriasId,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_ferias WHERE id = ?", [req.params.feriasId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:feriasId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query("SELECT id FROM rh_funcionarios_ferias WHERE id = ? AND funcionario_id = ?", [
      req.params.feriasId,
      req.params.id,
    ]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Registro de férias não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_ferias WHERE id = ?", [req.params.feriasId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
