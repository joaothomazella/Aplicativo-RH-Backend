const express = require("express");
const pool = require("../db/pool");
const { requireRole } = require("../middleware/permissions.middleware");

const router = express.Router();

const LIST_QUERY = `
  SELECT
    ca.id AS candidatura_id,
    ca.etapa,
    ca.status,
    ca.origem,
    ca.vaga_desejada,
    ca.motivo_reprovacao,
    ca.avaliacao_rh,
    ca.pretensao_salarial,
    ca.disponibilidade,
    ca.prioridade,
    ca.responsavel_rh,
    ca.pontos_fortes,
    ca.pontos_atencao,
    ca.ultimo_contato,
    ca.data_aprovacao,
    ca.data_reprovacao,
    ca.observacoes AS candidatura_observacoes,
    ca.created_at AS candidatura_created_at,
    ca.updated_at AS candidatura_updated_at,
    ca.vaga_id,
    v.titulo AS vaga_titulo,
    v.setor AS vaga_setor,
    v.status AS vaga_status,
    c.id AS candidato_id,
    c.nome,
    c.email,
    c.telefone,
    c.whatsapp,
    c.data_nascimento,
    c.cpf,
    c.rg,
    c.cep,
    c.endereco,
    c.bairro,
    c.cidade,
    c.estado,
    c.estado_civil,
    c.cargo_anterior,
    c.empresa_anterior,
    c.tempo_experiencia,
    c.escolaridade,
    c.cursos,
    c.cnh,
    c.disponibilidade_horario,
    c.disponibilidade_inicio,
    c.resumo_profissional,
    c.linkedin,
    c.curriculo_url,
    c.observacoes AS candidato_observacoes
  FROM rh_candidaturas ca
  JOIN rh_candidatos c ON c.id = ca.candidato_id
  LEFT JOIN rh_vagas v ON v.id = ca.vaga_id
`;

router.get("/", async (req, res, next) => {
  try {
    const { etapa, vaga_id, prioridade, responsavel_rh, origem, data_de, data_ate } = req.query;
    const conditions = [];
    const params = [];

    if (etapa) {
      conditions.push("ca.etapa = ?");
      params.push(etapa);
    }
    if (vaga_id) {
      conditions.push("ca.vaga_id = ?");
      params.push(vaga_id);
    }
    if (prioridade) {
      conditions.push("ca.prioridade = ?");
      params.push(prioridade);
    }
    if (responsavel_rh) {
      conditions.push("ca.responsavel_rh = ?");
      params.push(responsavel_rh);
    }
    if (origem) {
      conditions.push("ca.origem = ?");
      params.push(origem);
    }
    if (data_de) {
      conditions.push("ca.created_at >= ?");
      params.push(data_de);
    }
    if (data_ate) {
      conditions.push("ca.created_at <= ?");
      params.push(`${data_ate} 23:59:59`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool.query(`${LIST_QUERY}${where} ORDER BY ca.created_at DESC`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${LIST_QUERY} WHERE ca.id = ? LIMIT 1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Candidatura não encontrada" });

    const [historico] = await pool.query(
      "SELECT * FROM rh_historico WHERE candidatura_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );
    const [entrevistas] = await pool.query(
      "SELECT * FROM rh_entrevistas WHERE candidatura_id = ? ORDER BY data_entrevista ASC",
      [req.params.id]
    );
    const [avaliacoes] = await pool.query(
      "SELECT * FROM rh_avaliacoes WHERE candidatura_id = ? ORDER BY created_at DESC",
      [req.params.id]
    );

    res.json({ ...rows[0], historico, entrevistas, avaliacoes });
  } catch (err) {
    next(err);
  }
});

// Separadores que aparecem em CPF e telefone digitados a mao. Usa REPLACE
// aninhado em vez de REGEXP_REPLACE para funcionar tambem no MySQL 5.7.
function sqlSomenteDigitos(coluna) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${coluna}, ' ', ''), '(', ''), ')', ''), '-', ''), '.', ''), '+', '')`;
}

function somenteDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

function normalizarEmail(valor) {
  const email = String(valor ?? "").trim().toLowerCase();
  // O cadastro manual antigo gravava um e-mail falso quando o campo ficava
  // vazio; esses nunca devem servir de chave para reconhecer a pessoa.
  if (!email || !email.includes("@") || email.endsWith("@sem-email.com")) return null;
  return email;
}

function valorOuNulo(valor) {
  if (valor === undefined || valor === null) return null;
  const limpo = typeof valor === "string" ? valor.trim() : valor;
  return limpo === "" ? null : limpo;
}

const COLUNAS_CANDIDATO = [
  "nome",
  "email",
  "telefone",
  "whatsapp",
  "data_nascimento",
  "cpf",
  "rg",
  "cep",
  "endereco",
  "bairro",
  "cidade",
  "estado",
  "estado_civil",
  "cargo_anterior",
  "empresa_anterior",
  "tempo_experiencia",
  "escolaridade",
  "cursos",
  "cnh",
  "disponibilidade_horario",
  "disponibilidade_inicio",
  "resumo_profissional",
  "linkedin",
  "curriculo_url",
];

// Etapas finais: quem ja foi aprovado ou reprovado e se candidata de novo
// comeca um processo novo. Nas outras etapas a candidatura ainda esta em
// andamento, e reaproveita-la evita o card duplicado no Kanban.
const ETAPAS_ENCERRADAS = ["aprovado", "reprovado"];

// Reconhece quem ja esta na base, do identificador mais confiavel para o menos
// confiavel. Sem isso a mesma pessoa que manda o curriculo duas vezes (pelo
// site e pelo cadastro manual, por exemplo) vira dois candidatos e dois cards.
async function encontrarCandidatoExistente(connection, { email, cpf, telefone, whatsapp }) {
  const cpfDigitos = somenteDigitos(cpf);
  if (cpfDigitos.length === 11) {
    const [rows] = await connection.query(
      `SELECT * FROM rh_candidatos WHERE ${sqlSomenteDigitos("cpf")} = ? ORDER BY id ASC LIMIT 1`,
      [cpfDigitos]
    );
    if (rows.length > 0) return rows[0];
  }

  const emailNormalizado = normalizarEmail(email);
  if (emailNormalizado) {
    const [rows] = await connection.query(
      "SELECT * FROM rh_candidatos WHERE LOWER(TRIM(email)) = ? ORDER BY id ASC LIMIT 1",
      [emailNormalizado]
    );
    if (rows.length > 0) return rows[0];
  }

  // Compara apenas os 8 ultimos digitos: o DDD e o nono digito do celular
  // entram de formas diferentes no formulario do site e no cadastro manual.
  for (const numero of [telefone, whatsapp]) {
    const digitos = somenteDigitos(numero);
    if (digitos.length < 8) continue;
    const final = digitos.slice(-8);
    const [rows] = await connection.query(
      `SELECT * FROM rh_candidatos
        WHERE RIGHT(${sqlSomenteDigitos("telefone")}, 8) = ?
           OR RIGHT(${sqlSomenteDigitos("whatsapp")}, 8) = ?
        ORDER BY id ASC LIMIT 1`,
      [final, final]
    );
    if (rows.length > 0) return rows[0];
  }

  return null;
}

// Completa o cadastro que ja existe com o que veio de novo, sem apagar nada do
// que estava preenchido. O curriculo e a excecao: vale sempre o mais recente.
async function atualizarCandidatoExistente(connection, existente, body) {
  const atribuicoes = [];
  const valores = [];

  for (const coluna of COLUNAS_CANDIDATO) {
    const novo = valorOuNulo(body[coluna]);
    if (novo === null) continue;

    const atual = existente[coluna];
    const estavaVazio = atual === null || atual === undefined || String(atual).trim() === "";
    if (!estavaVazio && coluna !== "curriculo_url") continue;

    atribuicoes.push(`${coluna} = ?`);
    valores.push(novo);
  }

  if (atribuicoes.length === 0) return;

  valores.push(existente.id);
  await connection.query(`UPDATE rh_candidatos SET ${atribuicoes.join(", ")} WHERE id = ?`, valores);
}

async function criarCandidatura(connection, body) {
  const {
    vaga_id,
    vaga_desejada,
    origem,
    pretensao_salarial,
    disponibilidade,
    observacoes,
    mensagem,
    prioridade,
    responsavel_rh,
  } = body;

  const nome = valorOuNulo(body.nome);
  const telefone = valorOuNulo(body.telefone) || valorOuNulo(body.whatsapp);

  // O e-mail deixou de ser obrigatorio: no cadastro manual muita gente chega so
  // com telefone, e o placeholder que era gravado no lugar dele atrapalhava o
  // reconhecimento de candidato repetido.
  if (!nome || !telefone) {
    const err = new Error("Campos 'nome' e 'telefone' são obrigatórios");
    err.status = 400;
    throw err;
  }

  let vagaIdFinal = null;
  if (vaga_id) {
    const [vagaRows] = await connection.query("SELECT id FROM rh_vagas WHERE id = ? LIMIT 1", [vaga_id]);
    if (vagaRows.length === 0) {
      const err = new Error("Vaga informada não existe");
      err.status = 400;
      throw err;
    }
    vagaIdFinal = vaga_id;
  }

  const dadosCandidato = { ...body, nome, telefone };
  const existente = await encontrarCandidatoExistente(connection, dadosCandidato);

  let candidatoId;
  if (existente) {
    candidatoId = existente.id;
    await atualizarCandidatoExistente(connection, existente, dadosCandidato);

    // Candidatura ainda em andamento: reaproveita o card existente em vez de
    // criar outro, registrando no historico que a pessoa se candidatou de novo.
    const [emAndamento] = await connection.query(
      `SELECT id, etapa FROM rh_candidaturas
        WHERE candidato_id = ? AND etapa NOT IN (?, ?)
        ORDER BY created_at DESC LIMIT 1`,
      [candidatoId, ...ETAPAS_ENCERRADAS]
    );

    if (emAndamento.length > 0) {
      const candidaturaId = emAndamento[0].id;
      await connection.query(
        `UPDATE rh_candidaturas
          SET vaga_id = COALESCE(?, vaga_id), vaga_desejada = COALESCE(?, vaga_desejada), ultimo_contato = NOW()
         WHERE id = ?`,
        [vagaIdFinal, valorOuNulo(vaga_desejada), candidaturaId]
      );
      await connection.query(
        `INSERT INTO rh_historico (candidatura_id, acao, etapa_anterior, etapa_nova, observacao)
         VALUES (?, ?, ?, ?, ?)`,
        [
          candidaturaId,
          "candidatura_reenviada",
          emAndamento[0].etapa,
          emAndamento[0].etapa,
          `Candidatura reenviada (${origem || "site_induscolor"}) e unificada neste cadastro`,
        ]
      );
      return candidaturaId;
    }
  } else {
    const [candidatoResult] = await connection.query(
      `INSERT INTO rh_candidatos (${COLUNAS_CANDIDATO.join(", ")})
       VALUES (${COLUNAS_CANDIDATO.map(() => "?").join(", ")})`,
      COLUNAS_CANDIDATO.map((coluna) => valorOuNulo(dadosCandidato[coluna]))
    );
    candidatoId = candidatoResult.insertId;
  }

  const [candidaturaResult] = await connection.query(
    `INSERT INTO rh_candidaturas
      (candidato_id, vaga_id, vaga_desejada, origem, etapa, pretensao_salarial, disponibilidade, observacoes,
       prioridade, responsavel_rh)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      candidatoId,
      vagaIdFinal,
      valorOuNulo(vaga_desejada),
      origem || "site_induscolor",
      "novo_curriculo",
      pretensao_salarial || null,
      valorOuNulo(disponibilidade),
      valorOuNulo(observacoes) || valorOuNulo(mensagem),
      prioridade || "media",
      valorOuNulo(responsavel_rh),
    ]
  );

  const candidaturaId = candidaturaResult.insertId;

  await connection.query(
    `INSERT INTO rh_historico (candidatura_id, acao, etapa_anterior, etapa_nova, observacao)
     VALUES (?, ?, NULL, ?, ?)`,
    [
      candidaturaId,
      "candidatura_recebida",
      "novo_curriculo",
      vagaIdFinal ? "Candidatura recebida" : "Cadastro no banco de talentos",
    ]
  );

  return candidaturaId;
}

router.post("/", requireRole("admin", "rh"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const candidaturaId = await criarCandidatura(connection, req.body);
    await connection.commit();

    const [rows] = await pool.query(`${LIST_QUERY} WHERE ca.id = ?`, [candidaturaId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

router.patch("/:id", requireRole("admin", "rh"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existingRows] = await pool.query("SELECT * FROM rh_candidaturas WHERE id = ? LIMIT 1", [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: "Candidatura não encontrada" });
    const existing = existingRows[0];

    const {
      vaga_desejada = existing.vaga_desejada,
      origem = existing.origem,
      prioridade = existing.prioridade,
      responsavel_rh = existing.responsavel_rh,
      pontos_fortes = existing.pontos_fortes,
      pontos_atencao = existing.pontos_atencao,
      pretensao_salarial = existing.pretensao_salarial,
      disponibilidade = existing.disponibilidade,
      observacoes = existing.observacoes,
      ultimo_contato = existing.ultimo_contato,
    } = req.body;

    await pool.query(
      `UPDATE rh_candidaturas SET
        vaga_desejada = ?, origem = ?, prioridade = ?, responsavel_rh = ?,
        pontos_fortes = ?, pontos_atencao = ?, pretensao_salarial = ?,
        disponibilidade = ?, observacoes = ?, ultimo_contato = ?
       WHERE id = ?`,
      [
        vaga_desejada,
        origem,
        prioridade,
        responsavel_rh,
        pontos_fortes,
        pontos_atencao,
        pretensao_salarial,
        disponibilidade,
        observacoes,
        ultimo_contato,
        id,
      ]
    );

    const [rows] = await pool.query(`${LIST_QUERY} WHERE ca.id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/etapa", requireRole("admin", "rh"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { etapa, observacao, usuario, motivo_reprovacao } = req.body;

    if (!etapa) return res.status(400).json({ error: "Campo 'etapa' é obrigatório" });

    const [rows] = await connection.query("SELECT * FROM rh_candidaturas WHERE id = ? LIMIT 1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Candidatura não encontrada" });
    const etapaAnterior = rows[0].etapa;

    await connection.beginTransaction();

    if (etapa === "reprovado") {
      await connection.query(
        "UPDATE rh_candidaturas SET etapa = ?, motivo_reprovacao = ?, data_reprovacao = NOW(), ultimo_contato = NOW() WHERE id = ?",
        [etapa, motivo_reprovacao || observacao || null, id]
      );
    } else if (etapa === "aprovado") {
      await connection.query(
        "UPDATE rh_candidaturas SET etapa = ?, data_aprovacao = NOW(), ultimo_contato = NOW() WHERE id = ?",
        [etapa, id]
      );
    } else {
      await connection.query("UPDATE rh_candidaturas SET etapa = ?, ultimo_contato = NOW() WHERE id = ?", [etapa, id]);
    }

    await connection.query(
      `INSERT INTO rh_historico (candidatura_id, acao, etapa_anterior, etapa_nova, observacao, usuario)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, "mudanca_etapa", etapaAnterior, etapa, observacao || motivo_reprovacao || null, usuario || null]
    );

    await connection.commit();

    const [updatedRows] = await pool.query(`${LIST_QUERY} WHERE ca.id = ?`, [id]);
    res.json(updatedRows[0]);
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

router.delete("/:id", requireRole("admin", "rh"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const [rows] = await connection.query("SELECT candidato_id FROM rh_candidaturas WHERE id = ? LIMIT 1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Candidatura não encontrada" });
    const candidatoId = rows[0].candidato_id;

    await connection.beginTransaction();

    // As tabelas filhas saem antes da candidatura: nem todas as chaves
    // estrangeiras foram criadas com ON DELETE CASCADE.
    await connection.query("DELETE FROM rh_avaliacoes WHERE candidatura_id = ?", [id]);
    await connection.query("DELETE FROM rh_entrevistas WHERE candidatura_id = ?", [id]);
    await connection.query("DELETE FROM rh_historico WHERE candidatura_id = ?", [id]);
    await connection.query("DELETE FROM rh_candidaturas WHERE id = ?", [id]);

    // Candidato sem nenhuma candidatura nao aparece em nenhuma tela do app;
    // deixa-lo na base seria so um registro orfao.
    const [restantes] = await connection.query(
      "SELECT COUNT(*) AS total FROM rh_candidaturas WHERE candidato_id = ?",
      [candidatoId]
    );
    const candidatoRemovido = Number(restantes[0].total) === 0;
    if (candidatoRemovido) {
      await connection.query("DELETE FROM rh_candidatos WHERE id = ?", [candidatoId]);
    }

    await connection.commit();

    res.json({
      success: true,
      candidatura_id: Number(id),
      candidato_id: candidatoId,
      candidato_removido: candidatoRemovido,
    });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

module.exports = { router, criarCandidatura, LIST_QUERY };
