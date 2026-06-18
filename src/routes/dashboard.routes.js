const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const [[{ totalVagasAbertas }]] = await pool.query(
      "SELECT COUNT(*) AS totalVagasAbertas FROM rh_vagas WHERE status = 'aberta'"
    );
    const [[{ totalCandidatos }]] = await pool.query("SELECT COUNT(*) AS totalCandidatos FROM rh_candidatos");
    const [[{ totalCandidaturas }]] = await pool.query("SELECT COUNT(*) AS totalCandidaturas FROM rh_candidaturas");
    const [porEtapa] = await pool.query(
      "SELECT etapa, COUNT(*) AS total FROM rh_candidaturas GROUP BY etapa ORDER BY total DESC"
    );
    const [[{ entrevistasAgendadas }]] = await pool.query(
      "SELECT COUNT(*) AS entrevistasAgendadas FROM rh_entrevistas WHERE status = 'agendada'"
    );

    res.json({
      totalVagasAbertas,
      totalCandidatos,
      totalCandidaturas,
      porEtapa,
      entrevistasAgendadas,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
