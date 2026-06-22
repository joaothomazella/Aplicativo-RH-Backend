const express = require("express");
const pool = require("../../db/pool");
const { resolvePeriodo, diasEntre } = require("../../utils/funcionariosDatas");

const router = express.Router();

function buildFuncionarioFiltro(query, prefix = "") {
  const col = (name) => (prefix ? `${prefix}.${name}` : name);
  const where = [];
  const params = [];
  if (query.setor) {
    where.push(`${col("setor")} = ?`);
    params.push(query.setor);
  }
  if (query.status) {
    where.push(`${col("status")} = ?`);
    params.push(query.status);
  }
  if (query.tipo_contrato) {
    where.push(`${col("tipo_contrato")} = ?`);
    params.push(query.tipo_contrato);
  }
  return { sql: where.length ? `AND ${where.join(" AND ")}` : "", params };
}

router.get("/lista", async (req, res, next) => {
  try {
    const { sql: filtroSql, params: filtroParams } = buildFuncionarioFiltro(req.query);
    const [rows] = await pool.query(
      `SELECT
        nome_completo, setor, cargo_atual, status, tipo_contrato,
        data_admissao, data_desligamento, convenio_unimed, cartao_alimentacao,
        telefone, email
      FROM rh_funcionarios
      WHERE 1 = 1 ${filtroSql}
      ORDER BY nome_completo ASC`,
      filtroParams
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/aniversariantes", async (req, res, next) => {
  try {
    const mes = Number(req.query.mes) || new Date().getMonth() + 1;
    if (mes < 1 || mes > 12) {
      return res.status(400).json({ success: false, error: "Mês inválido." });
    }
    const { sql: filtroSql, params: filtroParams } = buildFuncionarioFiltro(req.query);
    const [rows] = await pool.query(
      `SELECT nome_completo, cargo_atual, setor, data_nascimento
      FROM rh_funcionarios
      WHERE data_nascimento IS NOT NULL AND MONTH(data_nascimento) = ? ${filtroSql}
      ORDER BY DAY(data_nascimento) ASC`,
      [mes, ...filtroParams]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/treinamentos", async (req, res, next) => {
  try {
    const tipo = req.query.tipo === "proximos" ? "proximos" : "vencidos";
    const { sql: filtroSql, params: filtroParams } = buildFuncionarioFiltro(req.query, "f");
    const condicao =
      tipo === "vencidos"
        ? "t.data_validade IS NOT NULL AND t.data_validade < CURDATE()"
        : "t.data_validade BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)";
    const [rows] = await pool.query(
      `SELECT f.nome_completo, f.setor, t.nome_treinamento, t.data_validade
      FROM rh_funcionarios_treinamentos t
      JOIN rh_funcionarios f ON f.id = t.funcionario_id
      WHERE ${condicao} ${filtroSql}
      ORDER BY t.data_validade ASC`,
      filtroParams
    );
    const hoje = new Date();
    const data = rows.map((row) => ({
      ...row,
      ...(tipo === "vencidos"
        ? { dias_vencidos: -diasEntre(hoje, row.data_validade) }
        : { dias_restantes: diasEntre(hoje, row.data_validade) }),
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/ferias", async (req, res, next) => {
  try {
    const { sql: filtroSql, params: filtroParams } = buildFuncionarioFiltro(req.query, "f");
    const [rows] = await pool.query(
      `SELECT f.nome_completo, f.setor, fe.periodo_aquisitivo_inicio, fe.periodo_aquisitivo_fim,
        fe.gozo_inicio, fe.gozo_fim, fe.dias_ferias, fe.status
      FROM rh_funcionarios_ferias fe
      JOIN rh_funcionarios f ON f.id = fe.funcionario_id
      WHERE fe.status = 'programada' ${filtroSql}
      ORDER BY fe.gozo_inicio ASC`,
      filtroParams
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/atestados", async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = resolvePeriodo({ ...req.query, periodo: req.query.periodo || "ano_atual" });
    const { sql: filtroSql, params: filtroParams } = buildFuncionarioFiltro(req.query, "f");
    const [rows] = await pool.query(
      `SELECT f.nome_completo, f.setor, a.data_inicio, a.data_fim, a.quantidade_dias, a.tipo
      FROM rh_funcionarios_atestados a
      JOIN rh_funcionarios f ON f.id = a.funcionario_id
      WHERE a.data_inicio BETWEEN ? AND ? ${filtroSql}
      ORDER BY a.data_inicio DESC`,
      [dataInicio, dataFim, ...filtroParams]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
