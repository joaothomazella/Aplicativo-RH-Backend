const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router();

router.use(canManageFuncionarios);

const STATUSES = ["ativo", "afastado", "ferias", "desligado"];
const TIPOS_CONTRATO = ["CLT", "PJ"];

const CAMPOS = [
  "nome_completo",
  "setor",
  "cargo_atual",
  "data_admissao",
  "tipo_contrato",
  "status",
  "cpf",
  "rg",
  "pis",
  "telefone",
  "email",
  "data_nascimento",
  "endereco",
  "bairro",
  "convenio_unimed",
  "cartao_alimentacao",
  "jornada_trabalho",
  "horario_trabalho",
];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function toBit(value) {
  if (value === undefined || value === null || value === "") return 0;
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true" ? 1 : 0;
}

function normalizarCpf(cpf) {
  return cpf ? String(cpf).replace(/\D/g, "") : "";
}

function validarLinha(row, index, cpfsNoArquivo) {
  const erros = [];
  const nome = String(row.nome_completo || "").trim();
  const dataAdmissao = String(row.data_admissao || "").trim();
  const tipoContrato = String(row.tipo_contrato || "").trim();
  const status = String(row.status || "").trim();
  const email = String(row.email || "").trim();
  const cpf = normalizarCpf(row.cpf);

  if (!nome) erros.push("Nome completo é obrigatório.");
  if (!dataAdmissao) erros.push("Data de admissão é obrigatória.");
  else if (!isValidDate(dataAdmissao)) erros.push("Data de admissão deve estar no formato AAAA-MM-DD.");
  if (!tipoContrato) erros.push("Tipo de contrato é obrigatório.");
  else if (!TIPOS_CONTRATO.includes(tipoContrato)) erros.push("Tipo de contrato deve ser CLT ou PJ.");
  if (status && !STATUSES.includes(status)) erros.push("Status inválido.");
  if (email && !isValidEmail(email)) erros.push("E-mail inválido.");
  if (row.data_nascimento && !isValidDate(String(row.data_nascimento).trim())) {
    erros.push("Data de nascimento deve estar no formato AAAA-MM-DD.");
  }
  if (cpf && cpfsNoArquivo.get(cpf)?.length > 1 && cpfsNoArquivo.get(cpf)[0] !== index) {
    erros.push("CPF duplicado dentro do próprio arquivo importado.");
  }

  return erros;
}

async function processarLinhas(rows) {
  const cpfsNoArquivo = new Map();
  rows.forEach((row, index) => {
    const cpf = normalizarCpf(row.cpf);
    if (!cpf) return;
    if (!cpfsNoArquivo.has(cpf)) cpfsNoArquivo.set(cpf, []);
    cpfsNoArquivo.get(cpf).push(index);
  });

  const cpfsValidos = [...cpfsNoArquivo.keys()].filter(Boolean);
  let existentesPorCpf = new Map();
  if (cpfsValidos.length > 0) {
    const [existentes] = await pool.query(
      `SELECT id, nome_completo, cpf FROM rh_funcionarios WHERE cpf IN (${cpfsValidos.map(() => "?").join(",")})`,
      cpfsValidos
    );
    existentesPorCpf = new Map(existentes.map((f) => [normalizarCpf(f.cpf), f]));
  }

  const resultado = rows.map((row, index) => {
    const erros = validarLinha(row, index, cpfsNoArquivo);
    const cpf = normalizarCpf(row.cpf);
    const existente = cpf ? existentesPorCpf.get(cpf) : null;
    return {
      linha: index + 1,
      dados: row,
      erros,
      valida: erros.length === 0,
      cpf_duplicado: Boolean(existente),
      funcionario_existente: existente ? { id: existente.id, nome_completo: existente.nome_completo } : null,
    };
  });

  return resultado;
}

router.post("/validar", async (req, res, next) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: "Envie uma lista de linhas para validar." });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ success: false, error: "Limite máximo de 1000 linhas por importação." });
    }

    const resultado = await processarLinhas(rows);
    const validas = resultado.filter((r) => r.valida);
    const invalidas = resultado.filter((r) => !r.valida);

    res.json({
      success: true,
      data: {
        total: resultado.length,
        validas: validas.length,
        invalidas: invalidas.length,
        com_cpf_duplicado: resultado.filter((r) => r.cpf_duplicado).length,
        linhas: resultado,
        campos_esperados: CAMPOS,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/confirmar", async (req, res, next) => {
  try {
    const { rows, cpf_duplicado_acao } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: "Envie uma lista de linhas para importar." });
    }
    const acaoDuplicado = ["ignorar", "atualizar", "erro"].includes(cpf_duplicado_acao) ? cpf_duplicado_acao : "erro";

    const resultado = await processarLinhas(rows);

    let importados = 0;
    let atualizados = 0;
    let ignorados = 0;
    let erros = 0;
    const detalhes = [];

    for (const linha of resultado) {
      if (!linha.valida) {
        erros++;
        detalhes.push({ linha: linha.linha, status: "erro", motivo: linha.erros.join(" ") });
        continue;
      }

      if (linha.cpf_duplicado) {
        if (acaoDuplicado === "ignorar") {
          ignorados++;
          detalhes.push({ linha: linha.linha, status: "ignorado", motivo: "CPF já cadastrado." });
          continue;
        }
        if (acaoDuplicado === "erro") {
          erros++;
          detalhes.push({ linha: linha.linha, status: "erro", motivo: "CPF já cadastrado." });
          continue;
        }
      }

      const row = linha.dados;
      try {
        if (linha.cpf_duplicado && acaoDuplicado === "atualizar") {
          await pool.query(
            `UPDATE rh_funcionarios SET
              nome_completo = ?, setor = ?, cargo_atual = ?, data_admissao = ?, tipo_contrato = ?, status = ?,
              rg = ?, pis = ?, telefone = ?, email = ?, data_nascimento = ?, endereco = ?, bairro = ?,
              convenio_unimed = ?, cartao_alimentacao = ?, jornada_trabalho = ?, horario_trabalho = ?
            WHERE id = ?`,
            [
              row.nome_completo,
              row.setor || null,
              row.cargo_atual || null,
              row.data_admissao,
              row.tipo_contrato,
              row.status || "ativo",
              row.rg || null,
              row.pis || null,
              row.telefone || null,
              row.email || null,
              row.data_nascimento || null,
              row.endereco || null,
              row.bairro || null,
              toBit(row.convenio_unimed),
              toBit(row.cartao_alimentacao),
              row.jornada_trabalho || null,
              row.horario_trabalho || null,
              linha.funcionario_existente.id,
            ]
          );
          atualizados++;
          detalhes.push({ linha: linha.linha, status: "atualizado", funcionario_id: linha.funcionario_existente.id });
        } else {
          const [result] = await pool.query(
            `INSERT INTO rh_funcionarios
              (nome_completo, setor, cargo_atual, data_admissao, tipo_contrato, status, cpf, rg, pis, telefone, email,
               data_nascimento, endereco, bairro, convenio_unimed, cartao_alimentacao, jornada_trabalho, horario_trabalho)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.nome_completo,
              row.setor || null,
              row.cargo_atual || null,
              row.data_admissao,
              row.tipo_contrato,
              row.status || "ativo",
              row.cpf || null,
              row.rg || null,
              row.pis || null,
              row.telefone || null,
              row.email || null,
              row.data_nascimento || null,
              row.endereco || null,
              row.bairro || null,
              toBit(row.convenio_unimed),
              toBit(row.cartao_alimentacao),
              row.jornada_trabalho || null,
              row.horario_trabalho || null,
            ]
          );
          importados++;
          detalhes.push({ linha: linha.linha, status: "importado", funcionario_id: result.insertId });
        }
      } catch (err) {
        erros++;
        detalhes.push({ linha: linha.linha, status: "erro", motivo: err.code === "ER_DUP_ENTRY" ? "CPF duplicado." : "Erro ao salvar." });
      }
    }

    await registrarAuditoria({
      req,
      entidade: "funcionario_importacao",
      acao: "importar_funcionarios",
      descricao: `Importação em massa: ${importados} criado(s), ${atualizados} atualizado(s), ${ignorados} ignorado(s), ${erros} erro(s).`,
      dadosDepois: { importados, atualizados, ignorados, erros, total: resultado.length },
    });

    res.json({
      success: true,
      data: { total: resultado.length, importados, atualizados, ignorados, erros, detalhes },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
