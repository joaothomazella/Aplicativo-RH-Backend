const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

const LIST_QUERY = `
  SELECT
    ca.id AS candidatura_id,
    ca.etapa,
    ca.mensagem,
    ca.criado_em AS candidatura_criada_em,
    ca.atualizado_em AS candidatura_atualizada_em,
    ca.vaga_id,
    v.titulo AS vaga_titulo,
    c.id AS candidato_id,
    c.nome,
    c.email,
    c.telefone,
    c.whatsapp,
    c.cidade,
    c.estado,
    c.escolaridade,
    c.experiencia,
    c.pretensao_salarial,
    c.curriculo_url
  FROM rh_candidaturas ca
  JOIN rh_candidatos c ON c.id = ca.candidato_id
  LEFT JOIN rh_vagas v ON v.id = ca.vaga_id
`;

router.get("/", async (req, res, next) => {
  try {
    const { etapa, vaga_id } = req.query;
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

    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool.query(`${LIST_QUERY}${where} ORDER BY ca.criado_em DESC`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`${LIST_QUERY} WHERE ca.id = ? LIMIT 1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Candidatura não encontrada" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const {
      nome,
      email,
      telefone,
      whatsapp,
      cidade,
      estado,
      escolaridade,
      experiencia,
      pretensao_salarial,
      curriculo_url,
      vaga_id,
      mensagem,
    } = req.body;

    if (!nome || !email || !telefone) {
      return res.status(400).json({ error: "Campos 'nome', 'email' e 'telefone' são obrigatórios" });
    }

    let vagaIdFinal = null;
    if (vaga_id) {
      const [vagaRows] = await connection.query("SELECT id FROM rh_vagas WHERE id = ? LIMIT 1", [vaga_id]);
      if (vagaRows.length === 0) {
        return res.status(400).json({ error: "Vaga informada não existe" });
      }
      vagaIdFinal = vaga_id;
    }

    await connection.beginTransaction();

    const [candidatoResult] = await connection.query(
      `INSERT INTO rh_candidatos
        (nome, email, telefone, whatsapp, cidade, estado, escolaridade, experiencia, pretensao_salarial, curriculo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome,
        email,
        telefone,
        whatsapp || telefone,
        cidade || null,
        estado || null,
        escolaridade || null,
        experiencia || null,
        pretensao_salarial || null,
        curriculo_url || null,
      ]
    );

    const candidatoId = candidatoResult.insertId;

    const [candidaturaResult] = await connection.query(
      `INSERT INTO rh_candidaturas (candidato_id, vaga_id, etapa, mensagem)
       VALUES (?, ?, ?, ?)`,
      [candidatoId, vagaIdFinal, "novo_curriculo", mensagem || null]
    );

    const candidaturaId = candidaturaResult.insertId;

    await connection.query(
      `INSERT INTO rh_historico (candidatura_id, etapa_anterior, etapa_nova, observacao)
       VALUES (?, NULL, ?, ?)`,
      [candidaturaId, "novo_curriculo", vagaIdFinal ? "Candidatura recebida" : "Cadastro no banco de talentos"]
    );

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

router.patch("/:id/etapa", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { etapa, observacao } = req.body;

    if (!etapa) return res.status(400).json({ error: "Campo 'etapa' é obrigatório" });

    const [rows] = await connection.query("SELECT * FROM rh_candidaturas WHERE id = ? LIMIT 1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Candidatura não encontrada" });
    const etapaAnterior = rows[0].etapa;

    await connection.beginTransaction();

    await connection.query("UPDATE rh_candidaturas SET etapa = ? WHERE id = ?", [etapa, id]);

    await connection.query(
      `INSERT INTO rh_historico (candidatura_id, etapa_anterior, etapa_nova, observacao)
       VALUES (?, ?, ?, ?)`,
      [id, etapaAnterior, etapa, observacao || null]
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

module.exports = router;
