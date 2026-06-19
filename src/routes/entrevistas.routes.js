const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

const LIST_QUERY = `
  SELECT
    e.*,
    ca.candidato_id,
    ca.vaga_id,
    ca.vaga_desejada,
    c.nome AS candidato_nome,
    v.titulo AS vaga_titulo
  FROM rh_entrevistas e
  JOIN rh_candidaturas ca ON ca.id = e.candidatura_id
  JOIN rh_candidatos c ON c.id = ca.candidato_id
  LEFT JOIN rh_vagas v ON v.id = ca.vaga_id
`;

router.get("/", async (req, res, next) => {
  try {
    const { data_de, data_ate, status, entrevistador } = req.query;
    const conditions = [];
    const params = [];

    if (data_de) {
      conditions.push("e.data_entrevista >= ?");
      params.push(data_de);
    }
    if (data_ate) {
      conditions.push("e.data_entrevista <= ?");
      params.push(data_ate);
    }
    if (status) {
      conditions.push("e.status = ?");
      params.push(status);
    }
    if (entrevistador) {
      conditions.push("e.entrevistador = ?");
      params.push(entrevistador);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool.query(`${LIST_QUERY}${where} ORDER BY e.data_entrevista ASC`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const {
      candidatura_id,
      data_entrevista,
      entrevistador,
      tipo,
      link_reuniao,
      status,
    } = req.body;

    if (!candidatura_id || !data_entrevista) {
      return res.status(400).json({ error: "Campos 'candidatura_id' e 'data_entrevista' são obrigatórios" });
    }

    const [candidaturaRows] = await pool.query("SELECT id FROM rh_candidaturas WHERE id = ? LIMIT 1", [candidatura_id]);
    if (candidaturaRows.length === 0) return res.status(400).json({ error: "Candidatura informada não existe" });

    const [result] = await pool.query(
      `INSERT INTO rh_entrevistas (candidatura_id, data_entrevista, entrevistador, tipo, link_reuniao, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [candidatura_id, data_entrevista, entrevistador || null, tipo || "presencial", link_reuniao || null, status || "agendada"]
    );

    await pool.query(
      `INSERT INTO rh_historico (candidatura_id, acao, etapa_anterior, etapa_nova, observacao)
       VALUES (?, 'entrevista_agendada', NULL, NULL, ?)`,
      [candidatura_id, `Entrevista agendada para ${data_entrevista}`]
    );

    const [rows] = await pool.query(`${LIST_QUERY} WHERE e.id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existingRows] = await pool.query("SELECT * FROM rh_entrevistas WHERE id = ? LIMIT 1", [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: "Entrevista não encontrada" });
    const existing = existingRows[0];

    const {
      data_entrevista = existing.data_entrevista,
      entrevistador = existing.entrevistador,
      tipo = existing.tipo,
      link_reuniao = existing.link_reuniao,
      status = existing.status,
      parecer = existing.parecer,
      nota_comportamental = existing.nota_comportamental,
      nota_tecnica = existing.nota_tecnica,
      impressao_geral = existing.impressao_geral,
      pontos_positivos = existing.pontos_positivos,
      pontos_negativos = existing.pontos_negativos,
      perfil_comportamental = existing.perfil_comportamental,
      comunicacao = existing.comunicacao,
      postura = existing.postura,
      experiencia_tecnica = existing.experiencia_tecnica,
      compatibilidade_vaga = existing.compatibilidade_vaga,
      nivel_interesse = existing.nivel_interesse,
      disponibilidade_entrevista = existing.disponibilidade_entrevista,
      resultado_preliminar = existing.resultado_preliminar,
    } = req.body;

    await pool.query(
      `UPDATE rh_entrevistas SET
        data_entrevista = ?, entrevistador = ?, tipo = ?, link_reuniao = ?, status = ?, parecer = ?,
        nota_comportamental = ?, nota_tecnica = ?, impressao_geral = ?, pontos_positivos = ?,
        pontos_negativos = ?, perfil_comportamental = ?, comunicacao = ?, postura = ?,
        experiencia_tecnica = ?, compatibilidade_vaga = ?, nivel_interesse = ?,
        disponibilidade_entrevista = ?, resultado_preliminar = ?
       WHERE id = ?`,
      [
        data_entrevista,
        entrevistador,
        tipo,
        link_reuniao,
        status,
        parecer,
        nota_comportamental,
        nota_tecnica,
        impressao_geral,
        pontos_positivos,
        pontos_negativos,
        perfil_comportamental,
        comunicacao,
        postura,
        experiencia_tecnica,
        compatibilidade_vaga,
        nivel_interesse,
        disponibilidade_entrevista,
        resultado_preliminar,
        id,
      ]
    );

    const [rows] = await pool.query(`${LIST_QUERY} WHERE e.id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
