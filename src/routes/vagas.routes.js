const express = require("express");
const pool = require("../db/pool");
const { slugify } = require("../utils/slugify");

const router = express.Router();

async function uniqueSlug(titulo, ignoreId) {
  const base = slugify(titulo);
  let slug = base;
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = ignoreId ? [slug, ignoreId] : [slug];
    const query = ignoreId
      ? "SELECT id FROM rh_vagas WHERE slug = ? AND id != ? LIMIT 1"
      : "SELECT id FROM rh_vagas WHERE slug = ? LIMIT 1";
    const [rows] = await pool.query(query, params);
    if (rows.length === 0) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rh_vagas ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rh_vagas WHERE id = ? LIMIT 1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Vaga não encontrada" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get("/slug/:slug", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rh_vagas WHERE slug = ? LIMIT 1", [req.params.slug]);
    if (rows.length === 0) return res.status(404).json({ error: "Vaga não encontrada" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { titulo, descricao, requisitos, beneficios, setor, tipo_contrato, localizacao, status } = req.body;

    if (!titulo) return res.status(400).json({ error: "Campo 'titulo' é obrigatório" });

    const slug = await uniqueSlug(titulo);

    const [result] = await pool.query(
      `INSERT INTO rh_vagas
        (titulo, slug, descricao, requisitos, beneficios, setor, tipo_contrato, localizacao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        titulo,
        slug,
        descricao || null,
        requisitos || null,
        beneficios || null,
        setor || null,
        tipo_contrato || null,
        localizacao || null,
        status || "aberta",
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_vagas WHERE id = ?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [existingRows] = await pool.query("SELECT * FROM rh_vagas WHERE id = ?", [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: "Vaga não encontrada" });
    const existing = existingRows[0];

    const {
      titulo = existing.titulo,
      descricao = existing.descricao,
      requisitos = existing.requisitos,
      beneficios = existing.beneficios,
      setor = existing.setor,
      tipo_contrato = existing.tipo_contrato,
      localizacao = existing.localizacao,
      status = existing.status,
    } = req.body;

    const slug = titulo !== existing.titulo ? await uniqueSlug(titulo, id) : existing.slug;

    await pool.query(
      `UPDATE rh_vagas SET
        titulo = ?, slug = ?, descricao = ?, requisitos = ?, beneficios = ?,
        setor = ?, tipo_contrato = ?, localizacao = ?, status = ?
       WHERE id = ?`,
      [titulo, slug, descricao, requisitos, beneficios, setor, tipo_contrato, localizacao, status, id]
    );

    const [rows] = await pool.query("SELECT * FROM rh_vagas WHERE id = ?", [id]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM rh_vagas WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Vaga não encontrada" });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
