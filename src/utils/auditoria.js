const pool = require("../db/pool");

async function registrarAuditoria({ req, entidade, entidadeId, acao, descricao, dadosAntes, dadosDepois }) {
  try {
    await pool.query(
      `INSERT INTO rh_auditoria
        (usuario_id, usuario_nome, entidade, entidade_id, acao, descricao, dados_antes, dados_depois, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user?.id || null,
        req.user?.nome || null,
        entidade,
        entidadeId ?? null,
        acao,
        descricao || null,
        dadosAntes !== undefined ? JSON.stringify(dadosAntes) : null,
        dadosDepois !== undefined ? JSON.stringify(dadosDepois) : null,
        req.ip || null,
        req.headers["user-agent"] || null,
      ]
    );
  } catch (err) {
    console.error("[auditoria] Falha ao registrar auditoria:", err.message);
  }
}

module.exports = { registrarAuditoria };
