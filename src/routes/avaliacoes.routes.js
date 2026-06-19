const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

function classificar(media) {
  if (media >= 8.5) return "Forte candidato";
  if (media >= 7) return "Bom candidato";
  if (media >= 5) return "Em análise";
  return "Reprovado";
}

router.get("/candidatura/:candidaturaId", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rh_avaliacoes WHERE candidatura_id = ? ORDER BY created_at DESC",
      [req.params.candidaturaId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const {
      candidatura_id,
      nota_comunicacao = 0,
      nota_experiencia = 0,
      nota_tecnica = 0,
      nota_postura = 0,
      nota_comportamental = 0,
      nota_pontualidade = 0,
      nota_compatibilidade = 0,
      nota_interesse = 0,
      nota_estabilidade = 0,
      nota_potencial = 0,
      parecer_final,
      recomendacao,
    } = req.body;

    if (!candidatura_id) return res.status(400).json({ error: "Campo 'candidatura_id' é obrigatório" });

    const [candidaturaRows] = await pool.query("SELECT id FROM rh_candidaturas WHERE id = ? LIMIT 1", [candidatura_id]);
    if (candidaturaRows.length === 0) return res.status(400).json({ error: "Candidatura informada não existe" });

    const notas = [
      nota_comunicacao,
      nota_experiencia,
      nota_tecnica,
      nota_postura,
      nota_comportamental,
      nota_pontualidade,
      nota_compatibilidade,
      nota_interesse,
      nota_estabilidade,
      nota_potencial,
    ].map(Number);
    const media = Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
    const classificacao = classificar(media);

    const [result] = await pool.query(
      `INSERT INTO rh_avaliacoes
        (candidatura_id, nota_comunicacao, nota_experiencia, nota_tecnica, nota_postura, nota_comportamental,
         nota_pontualidade, nota_compatibilidade, nota_interesse, nota_estabilidade, nota_potencial, media,
         classificacao, parecer_final, recomendacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [candidatura_id, ...notas, media, classificacao, parecer_final || null, recomendacao || null]
    );

    const [rows] = await pool.query("SELECT * FROM rh_avaliacoes WHERE id = ?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
