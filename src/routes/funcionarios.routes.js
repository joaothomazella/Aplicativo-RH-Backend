const express = require("express");
const pool = require("../db/pool");
const configRoutes = require("./funcionarios/config");
const reajustesRoutes = require("./funcionarios/reajustes");
const cargosRoutes = require("./funcionarios/cargos");
const feriasRoutes = require("./funcionarios/ferias");
const atestadosRoutes = require("./funcionarios/atestados");
const treinamentosRoutes = require("./funcionarios/treinamentos");
const disciplinarRoutes = require("./funcionarios/disciplinar");
const metricasRoutes = require("./funcionarios/metricas");
const relatoriosRoutes = require("./funcionarios/relatorios");
const fichaRoutes = require("./funcionarios/ficha");
const documentosRoutes = require("./funcionarios/documentos");
const checklistsRoutes = require("./funcionarios/checklists");
const importacaoRoutes = require("./funcionarios/importacao");
const { canManageFuncionarios, canAccessSensitiveData } = require("../middleware/permissions.middleware");
const { registrarAuditoria } = require("../utils/auditoria");

const router = express.Router();

router.use("/config", configRoutes);
router.use("/metricas", metricasRoutes);
router.use("/relatorios", relatoriosRoutes);
router.use("/importar", importacaoRoutes);
router.use("/", fichaRoutes);
router.use("/:id/reajustes", canAccessSensitiveData, reajustesRoutes);
router.use("/:id/cargos", cargosRoutes);
router.use("/:id/ferias", feriasRoutes);
router.use("/:id/atestados", atestadosRoutes);
router.use("/:id/treinamentos", treinamentosRoutes);
router.use("/:id/historico-disciplinar", canAccessSensitiveData, disciplinarRoutes);
router.use("/:id/documentos", documentosRoutes);
router.use("/:id/checklists", checklistsRoutes);

const STATUSES = ["ativo", "afastado", "ferias", "desligado"];
const TIPOS_CONTRATO = ["CLT", "PJ"];

const LIST_FIELDS =
  "id, nome_completo, setor, cargo_atual, telefone, email, tipo_contrato, status, data_admissao, convenio_unimed, cartao_alimentacao, created_at, updated_at";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toBit(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function validateFuncionarioInput(body) {
  if (!body.nome_completo || !String(body.nome_completo).trim()) {
    return "O nome completo é obrigatório.";
  }
  if (!body.data_admissao) {
    return "A data de admissão é obrigatória.";
  }
  if (!body.tipo_contrato || !TIPOS_CONTRATO.includes(body.tipo_contrato)) {
    return "O tipo de contrato deve ser CLT ou PJ.";
  }
  if (body.status && !STATUSES.includes(body.status)) {
    return "Status inválido.";
  }
  if (body.email && !isValidEmail(body.email)) {
    return "Informe um e-mail válido.";
  }
  return null;
}

router.get("/", async (req, res, next) => {
  try {
    const {
      search,
      setor,
      cargo,
      status,
      tipo_contrato,
      convenio_unimed,
      cartao_alimentacao,
      admitido_de,
      admitido_ate,
      aniversario_mes,
      treinamento_vencido,
      ferias_programada,
    } = req.query;

    const where = [];
    const params = [];

    if (search) {
      where.push("(nome_completo LIKE ? OR cpf LIKE ? OR telefone LIKE ? OR cargo_atual LIKE ? OR setor LIKE ?)");
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }
    if (setor) {
      where.push("setor = ?");
      params.push(setor);
    }
    if (cargo) {
      where.push("cargo_atual = ?");
      params.push(cargo);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (tipo_contrato) {
      where.push("tipo_contrato = ?");
      params.push(tipo_contrato);
    }
    if (convenio_unimed !== undefined) {
      where.push("convenio_unimed = ?");
      params.push(toBit(convenio_unimed));
    }
    if (cartao_alimentacao !== undefined) {
      where.push("cartao_alimentacao = ?");
      params.push(toBit(cartao_alimentacao));
    }
    if (admitido_de) {
      where.push("data_admissao >= ?");
      params.push(admitido_de);
    }
    if (admitido_ate) {
      where.push("data_admissao <= ?");
      params.push(admitido_ate);
    }
    if (aniversario_mes) {
      where.push("MONTH(data_nascimento) = ?");
      params.push(Number(aniversario_mes));
    }
    if (treinamento_vencido !== undefined) {
      const existe = toBit(treinamento_vencido)
        ? "EXISTS"
        : "NOT EXISTS";
      where.push(
        `${existe} (SELECT 1 FROM rh_funcionarios_treinamentos t WHERE t.funcionario_id = rh_funcionarios.id AND t.data_validade IS NOT NULL AND t.data_validade < CURDATE())`
      );
    }
    if (ferias_programada !== undefined) {
      const existe = toBit(ferias_programada) ? "EXISTS" : "NOT EXISTS";
      where.push(
        `${existe} (SELECT 1 FROM rh_funcionarios_ferias fe WHERE fe.funcionario_id = rh_funcionarios.id AND fe.status = 'programada')`
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT ${LIST_FIELDS} FROM rh_funcionarios ${whereSql} ORDER BY nome_completo ASC`,
      params
    );

    const [[metricsRow]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(status = 'ativo') AS ativos,
        SUM(status = 'afastado') AS afastados,
        SUM(status = 'ferias') AS ferias,
        SUM(status = 'desligado') AS desligados,
        SUM(tipo_contrato = 'CLT') AS clt,
        SUM(tipo_contrato = 'PJ') AS pj,
        SUM(convenio_unimed = 1) AS unimed,
        SUM(cartao_alimentacao = 1) AS cartaoAlimentacao,
        SUM(MONTH(data_nascimento) = MONTH(CURDATE())) AS aniversariantesMes
      FROM rh_funcionarios`
    );
    const [[treinamentosVencidosRow]] = await pool.query(
      `SELECT COUNT(DISTINCT funcionario_id) AS total
      FROM rh_funcionarios_treinamentos
      WHERE data_validade IS NOT NULL AND data_validade < CURDATE()`
    );

    res.json({
      success: true,
      data: rows,
      metrics: {
        total: Number(metricsRow.total) || 0,
        ativos: Number(metricsRow.ativos) || 0,
        afastados: Number(metricsRow.afastados) || 0,
        ferias: Number(metricsRow.ferias) || 0,
        desligados: Number(metricsRow.desligados) || 0,
        clt: Number(metricsRow.clt) || 0,
        pj: Number(metricsRow.pj) || 0,
        unimed: Number(metricsRow.unimed) || 0,
        cartaoAlimentacao: Number(metricsRow.cartaoAlimentacao) || 0,
        aniversariantesMes: Number(metricsRow.aniversariantesMes) || 0,
        treinamentosVencidos: Number(treinamentosVencidosRow.total) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/aniversariantes", async (req, res, next) => {
  try {
    const mes = req.query.mes ? Number(req.query.mes) : new Date().getMonth() + 1;
    const [rows] = await pool.query(
      `SELECT id, nome_completo, setor, cargo_atual, data_nascimento
      FROM rh_funcionarios
      WHERE status = 'ativo' AND data_nascimento IS NOT NULL AND MONTH(data_nascimento) = ?
      ORDER BY DAY(data_nascimento) ASC`,
      [mes]
    );
    res.json({ success: true, data: rows, mes });
  } catch (err) {
    next(err);
  }
});

const CAMPOS_SENSIVEIS_GESTOR = ["cpf", "rg", "pis", "titulo_eleitor", "salario_atual"];

function ocultarCamposSensiveis(funcionario, req) {
  if (req.user?.perfil !== "gestor") return funcionario;
  const filtrado = { ...funcionario };
  for (const campo of CAMPOS_SENSIVEIS_GESTOR) {
    delete filtrado[campo];
  }
  return filtrado;
}

router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rh_funcionarios WHERE id = ?", [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }
    res.json({ success: true, data: ocultarCamposSensiveis(rows[0], req) });
  } catch (err) {
    next(err);
  }
});

router.post("/", canManageFuncionarios, async (req, res, next) => {
  try {
    const body = req.body;
    const validationError = validateFuncionarioInput(body);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    if (body.cpf) {
      const [existing] = await pool.query("SELECT id FROM rh_funcionarios WHERE cpf = ?", [body.cpf]);
      if (existing.length) {
        return res.status(409).json({ success: false, error: "Já existe um funcionário cadastrado com esse CPF." });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios (
        nome_completo, endereco, bairro, email, estado_civil, telefone, telefone_emergencia,
        contato_emergencia_nome, contato_emergencia_parentesco, data_nascimento, nome_pai, nome_mae,
        cpf, pis, rg, titulo_eleitor, tipo_sanguineo,
        setor, cargo_atual, data_admissao, tipo_contrato, jornada_trabalho, horario_trabalho,
        status, data_desligamento, motivo_desligamento, centro_custo,
        convenio_unimed, cartao_alimentacao,
        escolaridade, tamanho_uniforme, tamanho_calcado, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.nome_completo,
        body.endereco || null,
        body.bairro || null,
        body.email || null,
        body.estado_civil || null,
        body.telefone || null,
        body.telefone_emergencia || null,
        body.contato_emergencia_nome || null,
        body.contato_emergencia_parentesco || null,
        body.data_nascimento || null,
        body.nome_pai || null,
        body.nome_mae || null,
        body.cpf || null,
        body.pis || null,
        body.rg || null,
        body.titulo_eleitor || null,
        body.tipo_sanguineo || null,
        body.setor || null,
        body.cargo_atual || null,
        body.data_admissao,
        body.tipo_contrato,
        body.jornada_trabalho || null,
        body.horario_trabalho || null,
        body.status || "ativo",
        body.data_desligamento || null,
        body.motivo_desligamento || null,
        body.centro_custo || null,
        toBit(body.convenio_unimed),
        toBit(body.cartao_alimentacao),
        body.escolaridade || null,
        body.tamanho_uniforme || null,
        body.tamanho_calcado || null,
        body.observacoes || null,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario",
      entidadeId: result.insertId,
      acao: "criar_funcionario",
      descricao: `Funcionário "${rows[0].nome_completo}" cadastrado.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, error: "Já existe um funcionário cadastrado com esse CPF." });
    }
    next(err);
  }
});

router.put("/:id", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query("SELECT * FROM rh_funcionarios WHERE id = ?", [req.params.id]);
    if (!existingRows.length) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }
    const existing = existingRows[0];
    const body = req.body;

    const merged = {
      nome_completo: body.nome_completo ?? existing.nome_completo,
      endereco: body.endereco ?? existing.endereco,
      bairro: body.bairro ?? existing.bairro,
      email: body.email ?? existing.email,
      estado_civil: body.estado_civil ?? existing.estado_civil,
      telefone: body.telefone ?? existing.telefone,
      telefone_emergencia: body.telefone_emergencia ?? existing.telefone_emergencia,
      contato_emergencia_nome: body.contato_emergencia_nome ?? existing.contato_emergencia_nome,
      contato_emergencia_parentesco: body.contato_emergencia_parentesco ?? existing.contato_emergencia_parentesco,
      data_nascimento: body.data_nascimento ?? existing.data_nascimento,
      nome_pai: body.nome_pai ?? existing.nome_pai,
      nome_mae: body.nome_mae ?? existing.nome_mae,
      cpf: body.cpf ?? existing.cpf,
      pis: body.pis ?? existing.pis,
      rg: body.rg ?? existing.rg,
      titulo_eleitor: body.titulo_eleitor ?? existing.titulo_eleitor,
      tipo_sanguineo: body.tipo_sanguineo ?? existing.tipo_sanguineo,
      setor: body.setor ?? existing.setor,
      cargo_atual: body.cargo_atual ?? existing.cargo_atual,
      data_admissao: body.data_admissao ?? existing.data_admissao,
      tipo_contrato: body.tipo_contrato ?? existing.tipo_contrato,
      jornada_trabalho: body.jornada_trabalho ?? existing.jornada_trabalho,
      horario_trabalho: body.horario_trabalho ?? existing.horario_trabalho,
      status: body.status ?? existing.status,
      data_desligamento: body.data_desligamento ?? existing.data_desligamento,
      motivo_desligamento: body.motivo_desligamento ?? existing.motivo_desligamento,
      centro_custo: body.centro_custo ?? existing.centro_custo,
      convenio_unimed: body.convenio_unimed !== undefined ? toBit(body.convenio_unimed) : existing.convenio_unimed,
      cartao_alimentacao:
        body.cartao_alimentacao !== undefined ? toBit(body.cartao_alimentacao) : existing.cartao_alimentacao,
      escolaridade: body.escolaridade ?? existing.escolaridade,
      tamanho_uniforme: body.tamanho_uniforme ?? existing.tamanho_uniforme,
      tamanho_calcado: body.tamanho_calcado ?? existing.tamanho_calcado,
      observacoes: body.observacoes ?? existing.observacoes,
    };

    const validationError = validateFuncionarioInput(merged);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    if (merged.cpf && merged.cpf !== existing.cpf) {
      const [duplicate] = await pool.query("SELECT id FROM rh_funcionarios WHERE cpf = ? AND id <> ?", [
        merged.cpf,
        req.params.id,
      ]);
      if (duplicate.length) {
        return res.status(409).json({ success: false, error: "Já existe um funcionário cadastrado com esse CPF." });
      }
    }

    await pool.query(
      `UPDATE rh_funcionarios SET
        nome_completo = ?, endereco = ?, bairro = ?, email = ?, estado_civil = ?, telefone = ?, telefone_emergencia = ?,
        contato_emergencia_nome = ?, contato_emergencia_parentesco = ?, data_nascimento = ?, nome_pai = ?, nome_mae = ?,
        cpf = ?, pis = ?, rg = ?, titulo_eleitor = ?, tipo_sanguineo = ?,
        setor = ?, cargo_atual = ?, data_admissao = ?, tipo_contrato = ?, jornada_trabalho = ?, horario_trabalho = ?,
        status = ?, data_desligamento = ?, motivo_desligamento = ?, centro_custo = ?,
        convenio_unimed = ?, cartao_alimentacao = ?,
        escolaridade = ?, tamanho_uniforme = ?, tamanho_calcado = ?, observacoes = ?
      WHERE id = ?`,
      [
        merged.nome_completo,
        merged.endereco,
        merged.bairro,
        merged.email,
        merged.estado_civil,
        merged.telefone,
        merged.telefone_emergencia,
        merged.contato_emergencia_nome,
        merged.contato_emergencia_parentesco,
        merged.data_nascimento,
        merged.nome_pai,
        merged.nome_mae,
        merged.cpf,
        merged.pis,
        merged.rg,
        merged.titulo_eleitor,
        merged.tipo_sanguineo,
        merged.setor,
        merged.cargo_atual,
        merged.data_admissao,
        merged.tipo_contrato,
        merged.jornada_trabalho,
        merged.horario_trabalho,
        merged.status,
        merged.data_desligamento,
        merged.motivo_desligamento,
        merged.centro_custo,
        merged.convenio_unimed,
        merged.cartao_alimentacao,
        merged.escolaridade,
        merged.tamanho_uniforme,
        merged.tamanho_calcado,
        merged.observacoes,
        req.params.id,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios WHERE id = ?", [req.params.id]);

    await registrarAuditoria({
      req,
      entidade: "funcionario",
      entidadeId: req.params.id,
      acao: "editar_funcionario",
      descricao: `Funcionário "${rows[0].nome_completo}" editado.`,
      dadosAntes: existing,
      dadosDepois: rows[0],
    });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, error: "Já existe um funcionário cadastrado com esse CPF." });
    }
    next(err);
  }
});

router.delete("/:id", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query("SELECT * FROM rh_funcionarios WHERE id = ?", [req.params.id]);
    if (!existingRows.length) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }
    const existing = existingRows[0];

    const dataDesligamento = existing.data_desligamento || new Date().toISOString().slice(0, 10);
    const motivo = req.body?.motivo_desligamento || "Desligado pelo sistema";

    await pool.query(
      "UPDATE rh_funcionarios SET status = 'desligado', data_desligamento = ?, motivo_desligamento = ? WHERE id = ?",
      [dataDesligamento, motivo, req.params.id]
    );

    await registrarAuditoria({
      req,
      entidade: "funcionario",
      entidadeId: req.params.id,
      acao: "desligar_funcionario",
      descricao: `Funcionário "${existing.nome_completo}" desligado. Motivo: ${motivo}.`,
      dadosAntes: existing,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
