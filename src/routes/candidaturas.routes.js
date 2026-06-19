const express = require("express");
const pool = require("../db/pool");

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

async function criarCandidatura(connection, body) {
  const {
    nome,
    email,
    telefone,
    whatsapp,
    data_nascimento,
    cpf,
    rg,
    cep,
    endereco,
    bairro,
    cidade,
    estado,
    estado_civil,
    cargo_anterior,
    empresa_anterior,
    tempo_experiencia,
    escolaridade,
    cursos,
    cnh,
    disponibilidade_horario,
    disponibilidade_inicio,
    resumo_profissional,
    linkedin,
    curriculo_url,
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

  if (!nome || !email || !telefone) {
    const err = new Error("Campos 'nome', 'email' e 'telefone' são obrigatórios");
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

  const [candidatoResult] = await connection.query(
    `INSERT INTO rh_candidatos
      (nome, email, telefone, whatsapp, data_nascimento, cpf, rg, cep, endereco, bairro, cidade, estado,
       estado_civil, cargo_anterior, empresa_anterior, tempo_experiencia, escolaridade, cursos, cnh,
       disponibilidade_horario, disponibilidade_inicio, resumo_profissional, linkedin, curriculo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nome,
      email,
      telefone,
      whatsapp || null,
      data_nascimento || null,
      cpf || null,
      rg || null,
      cep || null,
      endereco || null,
      bairro || null,
      cidade || null,
      estado || null,
      estado_civil || null,
      cargo_anterior || null,
      empresa_anterior || null,
      tempo_experiencia || null,
      escolaridade || null,
      cursos || null,
      cnh || null,
      disponibilidade_horario || null,
      disponibilidade_inicio || null,
      resumo_profissional || null,
      linkedin || null,
      curriculo_url || null,
    ]
  );

  const candidatoId = candidatoResult.insertId;

  const [candidaturaResult] = await connection.query(
    `INSERT INTO rh_candidaturas
      (candidato_id, vaga_id, vaga_desejada, origem, etapa, pretensao_salarial, disponibilidade, observacoes,
       prioridade, responsavel_rh)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      candidatoId,
      vagaIdFinal,
      vaga_desejada || null,
      origem || "site_induscolor",
      "novo_curriculo",
      pretensao_salarial || null,
      disponibilidade || null,
      observacoes || mensagem || null,
      prioridade || "media",
      responsavel_rh || null,
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

router.post("/", async (req, res, next) => {
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

router.patch("/:id", async (req, res, next) => {
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

router.patch("/:id/etapa", async (req, res, next) => {
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

module.exports = { router, criarCandidatura, LIST_QUERY };
