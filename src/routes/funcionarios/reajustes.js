const express = require("express");
const pool = require("../../db/pool");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

async function getFuncionario(funcionarioId) {
  const [rows] = await pool.query("SELECT id, salario_atual FROM rh_funcionarios WHERE id = ?", [funcionarioId]);
  return rows[0] || null;
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, m.nome AS motivo_nome
       FROM rh_funcionarios_reajustes_salariais r
       LEFT JOIN rh_funcionarios_motivos_reajuste m ON m.id = r.motivo_id
       WHERE r.funcionario_id = ?
       ORDER BY r.data_reajuste DESC, r.id DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const funcionario = await getFuncionario(req.params.id);
    if (!funcionario) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const { data_reajuste, salario_novo, motivo_id, motivo_texto, observacoes } = req.body;
    if (!data_reajuste) {
      return res.status(400).json({ success: false, error: "Campo 'data_reajuste' é obrigatório." });
    }
    const salarioNovoNum = Number(salario_novo);
    if (!salario_novo || Number.isNaN(salarioNovoNum) || salarioNovoNum <= 0) {
      return res.status(400).json({ success: false, error: "Campo 'salario_novo' é obrigatório e deve ser maior que zero." });
    }

    const salarioAnterior = funcionario.salario_atual !== null ? Number(funcionario.salario_atual) : null;
    const percentual =
      salarioAnterior && salarioAnterior > 0
        ? Math.round(((salarioNovoNum - salarioAnterior) / salarioAnterior) * 10000) / 100
        : null;

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_reajustes_salariais
        (funcionario_id, data_reajuste, salario_anterior, salario_novo, percentual_reajuste, motivo_id, motivo_texto, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        data_reajuste,
        salarioAnterior,
        salarioNovoNum,
        percentual,
        motivo_id || null,
        motivo_texto || null,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    await pool.query("UPDATE rh_funcionarios SET salario_atual = ? WHERE id = ?", [salarioNovoNum, req.params.id]);

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_reajustes_salariais WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_reajuste",
      entidadeId: result.insertId,
      acao: "criar_reajuste_salarial",
      descricao: `Reajuste salarial criado para funcionário #${req.params.id}.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:reajusteId", async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_reajustes_salariais WHERE id = ? AND funcionario_id = ?",
      [req.params.reajusteId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Reajuste não encontrado." });
    }
    const existing = existingRows[0];
    const { data_reajuste, salario_novo, motivo_id, motivo_texto, observacoes } = req.body;

    const salarioNovoNum = salario_novo !== undefined ? Number(salario_novo) : Number(existing.salario_novo);
    if (Number.isNaN(salarioNovoNum) || salarioNovoNum <= 0) {
      return res.status(400).json({ success: false, error: "Campo 'salario_novo' deve ser maior que zero." });
    }
    const salarioAnterior = existing.salario_anterior !== null ? Number(existing.salario_anterior) : null;
    const percentual =
      salarioAnterior && salarioAnterior > 0
        ? Math.round(((salarioNovoNum - salarioAnterior) / salarioAnterior) * 10000) / 100
        : null;

    await pool.query(
      `UPDATE rh_funcionarios_reajustes_salariais
       SET data_reajuste = ?, salario_novo = ?, percentual_reajuste = ?, motivo_id = ?, motivo_texto = ?, observacoes = ?
       WHERE id = ?`,
      [
        data_reajuste || existing.data_reajuste,
        salarioNovoNum,
        percentual,
        motivo_id !== undefined ? motivo_id || null : existing.motivo_id,
        motivo_texto !== undefined ? motivo_texto || null : existing.motivo_texto,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.reajusteId,
      ]
    );

    const [mostRecent] = await pool.query(
      "SELECT id, salario_novo FROM rh_funcionarios_reajustes_salariais WHERE funcionario_id = ? ORDER BY data_reajuste DESC, id DESC LIMIT 1",
      [req.params.id]
    );
    if (mostRecent.length > 0 && Number(mostRecent[0].id) === Number(req.params.reajusteId)) {
      await pool.query("UPDATE rh_funcionarios SET salario_atual = ? WHERE id = ?", [salarioNovoNum, req.params.id]);
    }

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_reajustes_salariais WHERE id = ?", [req.params.reajusteId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_reajuste",
      entidadeId: req.params.reajusteId,
      acao: "editar_reajuste_salarial",
      descricao: `Reajuste salarial #${req.params.reajusteId} editado.`,
      dadosAntes: existing,
      dadosDepois: rows[0],
    });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:reajusteId", async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_reajustes_salariais WHERE id = ? AND funcionario_id = ?",
      [req.params.reajusteId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Reajuste não encontrado." });
    }
    const existing = existingRows[0];

    await pool.query("DELETE FROM rh_funcionarios_reajustes_salariais WHERE id = ?", [req.params.reajusteId]);

    const [remaining] = await pool.query(
      "SELECT salario_novo FROM rh_funcionarios_reajustes_salariais WHERE funcionario_id = ? ORDER BY data_reajuste DESC, id DESC LIMIT 1",
      [req.params.id]
    );
    if (remaining.length > 0) {
      await pool.query("UPDATE rh_funcionarios SET salario_atual = ? WHERE id = ?", [remaining[0].salario_novo, req.params.id]);
    }

    await registrarAuditoria({
      req,
      entidade: "funcionario_reajuste",
      entidadeId: req.params.reajusteId,
      acao: "excluir_reajuste_salarial",
      descricao: `Reajuste salarial #${req.params.reajusteId} excluído.`,
      dadosAntes: existing,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
