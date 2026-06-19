const express = require("express");
const pool = require("../db/pool");
const { criarCandidatura, LIST_QUERY } = require("./candidaturas.routes");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { etapa, prioridade, responsavel_rh } = req.query;
    const conditions = [
      `ca.id = (SELECT id FROM rh_candidaturas WHERE candidato_id = c.id ORDER BY created_at DESC LIMIT 1)`,
    ];
    const params = [];

    if (etapa) {
      conditions.push("ca.etapa = ?");
      params.push(etapa);
    }
    if (prioridade) {
      conditions.push("ca.prioridade = ?");
      params.push(prioridade);
    }
    if (responsavel_rh) {
      conditions.push("ca.responsavel_rh = ?");
      params.push(responsavel_rh);
    }

    const where = ` WHERE ${conditions.join(" AND ")}`;
    const [rows] = await pool.query(`${LIST_QUERY}${where} ORDER BY ca.created_at DESC`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `${LIST_QUERY} WHERE c.id = ? ORDER BY ca.created_at DESC LIMIT 1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Candidato não encontrado" });

    const candidatura = rows[0];
    const [historico] = await pool.query(
      "SELECT * FROM rh_historico WHERE candidatura_id = ? ORDER BY created_at ASC",
      [candidatura.candidatura_id]
    );
    const [entrevistas] = await pool.query(
      "SELECT * FROM rh_entrevistas WHERE candidatura_id = ? ORDER BY data_entrevista ASC",
      [candidatura.candidatura_id]
    );
    const [avaliacoes] = await pool.query(
      "SELECT * FROM rh_avaliacoes WHERE candidatura_id = ? ORDER BY created_at DESC",
      [candidatura.candidatura_id]
    );

    res.json({ ...candidatura, historico, entrevistas, avaliacoes });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const candidaturaId = await criarCandidatura(connection, { ...req.body, origem: req.body.origem || "cadastro_rh" });
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
    const [existingRows] = await pool.query("SELECT * FROM rh_candidatos WHERE id = ? LIMIT 1", [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: "Candidato não encontrado" });
    const existing = existingRows[0];

    const {
      nome = existing.nome,
      email = existing.email,
      telefone = existing.telefone,
      whatsapp = existing.whatsapp,
      data_nascimento = existing.data_nascimento,
      cpf = existing.cpf,
      rg = existing.rg,
      cep = existing.cep,
      endereco = existing.endereco,
      bairro = existing.bairro,
      cidade = existing.cidade,
      estado = existing.estado,
      estado_civil = existing.estado_civil,
      cargo_anterior = existing.cargo_anterior,
      empresa_anterior = existing.empresa_anterior,
      tempo_experiencia = existing.tempo_experiencia,
      escolaridade = existing.escolaridade,
      cursos = existing.cursos,
      cnh = existing.cnh,
      disponibilidade_horario = existing.disponibilidade_horario,
      disponibilidade_inicio = existing.disponibilidade_inicio,
      resumo_profissional = existing.resumo_profissional,
      linkedin = existing.linkedin,
      observacoes = existing.observacoes,
    } = req.body;

    await pool.query(
      `UPDATE rh_candidatos SET
        nome = ?, email = ?, telefone = ?, whatsapp = ?, data_nascimento = ?, cpf = ?, rg = ?, cep = ?,
        endereco = ?, bairro = ?, cidade = ?, estado = ?, estado_civil = ?, cargo_anterior = ?,
        empresa_anterior = ?, tempo_experiencia = ?, escolaridade = ?, cursos = ?, cnh = ?,
        disponibilidade_horario = ?, disponibilidade_inicio = ?, resumo_profissional = ?, linkedin = ?,
        observacoes = ?
       WHERE id = ?`,
      [
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
        observacoes,
        id,
      ]
    );

    // Campos de processo (prioridade, responsável, pontos fortes/atenção, etc.) ficam na candidatura mais recente.
    // Usa "candidatura_observacoes" para não colidir com "observacoes" (campo do candidato, já tratado acima).
    const {
      prioridade,
      responsavel_rh,
      pontos_fortes,
      pontos_atencao,
      vaga_desejada,
      pretensao_salarial,
      disponibilidade,
      candidatura_observacoes,
      origem,
    } = req.body;
    if (
      prioridade !== undefined ||
      responsavel_rh !== undefined ||
      pontos_fortes !== undefined ||
      pontos_atencao !== undefined ||
      vaga_desejada !== undefined ||
      pretensao_salarial !== undefined ||
      disponibilidade !== undefined ||
      candidatura_observacoes !== undefined ||
      origem !== undefined
    ) {
      const [candidaturaRows] = await pool.query(
        "SELECT id FROM rh_candidaturas WHERE candidato_id = ? ORDER BY created_at DESC LIMIT 1",
        [id]
      );
      if (candidaturaRows.length > 0) {
        const candidaturaId = candidaturaRows[0].id;
        const [currentRows] = await pool.query("SELECT * FROM rh_candidaturas WHERE id = ?", [candidaturaId]);
        const current = currentRows[0];
        await pool.query(
          `UPDATE rh_candidaturas SET prioridade = ?, responsavel_rh = ?, pontos_fortes = ?, pontos_atencao = ?,
            vaga_desejada = ?, pretensao_salarial = ?, disponibilidade = ?, observacoes = ?, origem = ?
           WHERE id = ?`,
          [
            prioridade ?? current.prioridade,
            responsavel_rh ?? current.responsavel_rh,
            pontos_fortes ?? current.pontos_fortes,
            pontos_atencao ?? current.pontos_atencao,
            vaga_desejada ?? current.vaga_desejada,
            pretensao_salarial ?? current.pretensao_salarial,
            disponibilidade ?? current.disponibilidade,
            candidatura_observacoes ?? current.observacoes,
            origem ?? current.origem,
            candidaturaId,
          ]
        );
      }
    }

    const [rows] = await pool.query(`${LIST_QUERY} WHERE c.id = ? ORDER BY ca.created_at DESC LIMIT 1`, [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
