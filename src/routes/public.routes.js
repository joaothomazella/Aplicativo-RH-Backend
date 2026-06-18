const express = require("express");
const pool = require("../db/pool");
const { upload, curriculoUrlFromFile } = require("../middleware/upload");
const { criarCandidatura, LIST_QUERY } = require("./candidaturas.routes");

const router = express.Router();

router.get("/vagas", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rh_vagas WHERE status = 'aberta' AND publicada_site = 1 ORDER BY ordem ASC, created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/vagas/:slug", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM rh_vagas WHERE slug = ? AND status = 'aberta' AND publicada_site = 1 LIMIT 1",
      [req.params.slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Vaga não encontrada" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/candidaturas", upload.single("curriculo"), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const curriculo_url = curriculoUrlFromFile(req.file);
    const candidaturaId = await criarCandidatura(connection, { ...req.body, curriculo_url });

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

module.exports = router;
