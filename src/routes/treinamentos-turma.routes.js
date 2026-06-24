const express = require("express");
const pool = require("../db/pool");
const { canManageFuncionarios } = require("../middleware/permissions.middleware");
const { registrarAuditoria } = require("../utils/auditoria");

const router = express.Router();

function computeStatus(dataValidade) {
  if (!dataValidade) return "sem_validade";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade);
  validade.setHours(0, 0, 0, 0);
  if (validade < hoje) return "vencido";
  const diffDias = Math.round((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 60) return "proximo_vencimento";
  return "valido";
}

router.get("/funcionarios-disponiveis", async (req, res, next) => {
  try {
    const { search, setor, cargo } = req.query;
    const conditions = ["status = 'ativo'"];
    const params = [];

    if (search) {
      conditions.push("nome_completo LIKE ?");
      params.push(`%${search}%`);
    }
    if (setor) {
      conditions.push("setor = ?");
      params.push(setor);
    }
    if (cargo) {
      conditions.push("cargo_atual = ?");
      params.push(cargo);
    }

    const [rows] = await pool.query(
      `SELECT id, nome_completo, setor, cargo_atual, status
       FROM rh_funcionarios
       WHERE ${conditions.join(" AND ")}
       ORDER BY nome_completo ASC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const { search, tipo_id, status, data_inicio, data_fim } = req.query;
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(t.nome_treinamento LIKE ? OR t.instituicao_instrutor LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (tipo_id) {
      conditions.push("t.tipo_id = ?");
      params.push(tipo_id);
    }
    if (status) {
      conditions.push("t.status = ?");
      params.push(status);
    }
    if (data_inicio) {
      conditions.push("t.data_realizacao >= ?");
      params.push(data_inicio);
    }
    if (data_fim) {
      conditions.push("t.data_realizacao <= ?");
      params.push(data_fim);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT t.*, ti.nome AS tipo_nome,
              (SELECT COUNT(*) FROM rh_treinamentos_turma_participantes p WHERE p.turma_id = t.id) AS total_participantes
       FROM rh_treinamentos_turmas t
       LEFT JOIN rh_funcionarios_tipos_treinamento ti ON ti.id = t.tipo_id
       ${where}
       ORDER BY t.data_realizacao DESC, t.id DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/", canManageFuncionarios, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const {
      nome_treinamento,
      tipo_id,
      categoria,
      instituicao_instrutor,
      data_realizacao,
      data_validade,
      carga_horaria,
      observacoes,
      funcionario_ids,
    } = req.body;

    if (!nome_treinamento || !nome_treinamento.trim()) {
      return res.status(400).json({ success: false, error: "Campo 'nome_treinamento' é obrigatório." });
    }
    if (!data_realizacao) {
      return res.status(400).json({ success: false, error: "Campo 'data_realizacao' é obrigatório." });
    }
    if (!Array.isArray(funcionario_ids) || funcionario_ids.length === 0) {
      return res.status(400).json({ success: false, error: "Selecione ao menos um participante." });
    }

    const idsUnicos = [...new Set(funcionario_ids.map((id) => Number(id)).filter(Boolean))];
    if (idsUnicos.length === 0) {
      return res.status(400).json({ success: false, error: "Selecione ao menos um participante válido." });
    }

    const status = computeStatus(data_validade || null);

    await connection.beginTransaction();

    const [funcionariosRows] = await connection.query(
      `SELECT id FROM rh_funcionarios WHERE id IN (${idsUnicos.map(() => "?").join(",")})`,
      idsUnicos
    );
    if (funcionariosRows.length !== idsUnicos.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: "Um ou mais funcionários selecionados não foram encontrados." });
    }

    const [turmaResult] = await connection.query(
      `INSERT INTO rh_treinamentos_turmas
        (nome_treinamento, tipo_id, categoria, instituicao_instrutor, data_realizacao, data_validade, carga_horaria,
         status, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome_treinamento.trim(),
        tipo_id || null,
        categoria || null,
        instituicao_instrutor || null,
        data_realizacao,
        data_validade || null,
        carga_horaria || null,
        status,
        observacoes || null,
        req.user?.id || null,
      ]
    );
    const turmaId = turmaResult.insertId;

    for (const funcionarioId of idsUnicos) {
      const [treinamentoResult] = await connection.query(
        `INSERT INTO rh_funcionarios_treinamentos
          (funcionario_id, turma_id, tipo_id, nome_treinamento, categoria, instituicao_instrutor, data_realizacao,
           data_validade, carga_horaria, status, observacoes, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          funcionarioId,
          turmaId,
          tipo_id || null,
          nome_treinamento.trim(),
          categoria || null,
          instituicao_instrutor || null,
          data_realizacao,
          data_validade || null,
          carga_horaria || null,
          status,
          observacoes || null,
          req.user?.id || null,
        ]
      );

      await connection.query(
        `INSERT INTO rh_treinamentos_turma_participantes
          (turma_id, funcionario_id, treinamento_funcionario_id, status_participacao)
         VALUES (?, ?, ?, 'participou')`,
        [turmaId, funcionarioId, treinamentoResult.insertId]
      );
    }

    await connection.commit();

    const [turmaRows] = await pool.query("SELECT * FROM rh_treinamentos_turmas WHERE id = ?", [turmaId]);

    await registrarAuditoria({
      req,
      entidade: "treinamento_turma",
      entidadeId: turmaId,
      acao: "criar",
      descricao: `Criou turma de treinamento "${nome_treinamento.trim()}" com ${idsUnicos.length} participante(s).`,
      dadosDepois: turmaRows[0],
    });

    res.status(201).json({
      success: true,
      data: turmaRows[0],
      message: `Treinamento cadastrado para ${idsUnicos.length} funcionários.`,
    });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [turmaRows] = await pool.query(
      `SELECT t.*, ti.nome AS tipo_nome
       FROM rh_treinamentos_turmas t
       LEFT JOIN rh_funcionarios_tipos_treinamento ti ON ti.id = t.tipo_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (turmaRows.length === 0) {
      return res.status(404).json({ success: false, error: "Turma de treinamento não encontrada." });
    }

    const [participantes] = await pool.query(
      `SELECT p.*, f.nome_completo, f.setor, f.cargo_atual
       FROM rh_treinamentos_turma_participantes p
       JOIN rh_funcionarios f ON f.id = p.funcionario_id
       WHERE p.turma_id = ?
       ORDER BY f.nome_completo ASC`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...turmaRows[0], participantes } });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query("SELECT * FROM rh_treinamentos_turmas WHERE id = ?", [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Turma de treinamento não encontrada." });
    }
    const existing = existingRows[0];
    const {
      nome_treinamento,
      tipo_id,
      categoria,
      instituicao_instrutor,
      data_realizacao,
      data_validade,
      carga_horaria,
      observacoes,
    } = req.body;

    const dataValidadeFinal = data_validade !== undefined ? data_validade || null : existing.data_validade;
    const status = computeStatus(dataValidadeFinal);

    await pool.query(
      `UPDATE rh_treinamentos_turmas
       SET nome_treinamento = ?, tipo_id = ?, categoria = ?, instituicao_instrutor = ?, data_realizacao = ?,
           data_validade = ?, carga_horaria = ?, status = ?, observacoes = ?
       WHERE id = ?`,
      [
        nome_treinamento !== undefined && nome_treinamento.trim() ? nome_treinamento.trim() : existing.nome_treinamento,
        tipo_id !== undefined ? tipo_id || null : existing.tipo_id,
        categoria !== undefined ? categoria || null : existing.categoria,
        instituicao_instrutor !== undefined ? instituicao_instrutor || null : existing.instituicao_instrutor,
        data_realizacao || existing.data_realizacao,
        dataValidadeFinal,
        carga_horaria !== undefined ? carga_horaria || null : existing.carga_horaria,
        status,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.id,
      ]
    );

    // Mantém os registros individuais de treinamento vinculados a esta turma em sincronia
    await pool.query(
      `UPDATE rh_funcionarios_treinamentos
       SET nome_treinamento = ?, tipo_id = ?, categoria = ?, instituicao_instrutor = ?, data_realizacao = ?,
           data_validade = ?, carga_horaria = ?, status = ?
       WHERE turma_id = ?`,
      [
        nome_treinamento !== undefined && nome_treinamento.trim() ? nome_treinamento.trim() : existing.nome_treinamento,
        tipo_id !== undefined ? tipo_id || null : existing.tipo_id,
        categoria !== undefined ? categoria || null : existing.categoria,
        instituicao_instrutor !== undefined ? instituicao_instrutor || null : existing.instituicao_instrutor,
        data_realizacao || existing.data_realizacao,
        dataValidadeFinal,
        carga_horaria !== undefined ? carga_horaria || null : existing.carga_horaria,
        status,
        req.params.id,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_treinamentos_turmas WHERE id = ?", [req.params.id]);

    await registrarAuditoria({
      req,
      entidade: "treinamento_turma",
      entidadeId: req.params.id,
      acao: "editar",
      descricao: `Editou turma de treinamento "${rows[0].nome_treinamento}".`,
      dadosAntes: existing,
      dadosDepois: rows[0],
    });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/participantes", canManageFuncionarios, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { funcionario_id } = req.body;
    if (!funcionario_id) {
      return res.status(400).json({ success: false, error: "Campo 'funcionario_id' é obrigatório." });
    }

    await connection.beginTransaction();

    const [turmaRows] = await connection.query("SELECT * FROM rh_treinamentos_turmas WHERE id = ?", [req.params.id]);
    if (turmaRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: "Turma de treinamento não encontrada." });
    }
    const turma = turmaRows[0];

    const [funcionarioRows] = await connection.query("SELECT id FROM rh_funcionarios WHERE id = ?", [funcionario_id]);
    if (funcionarioRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const [duplicateRows] = await connection.query(
      "SELECT id FROM rh_treinamentos_turma_participantes WHERE turma_id = ? AND funcionario_id = ?",
      [req.params.id, funcionario_id]
    );
    if (duplicateRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, error: "Este funcionário já é participante desta turma." });
    }

    const [treinamentoResult] = await connection.query(
      `INSERT INTO rh_funcionarios_treinamentos
        (funcionario_id, turma_id, tipo_id, nome_treinamento, categoria, instituicao_instrutor, data_realizacao,
         data_validade, carga_horaria, status, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        funcionario_id,
        req.params.id,
        turma.tipo_id,
        turma.nome_treinamento,
        turma.categoria,
        turma.instituicao_instrutor,
        turma.data_realizacao,
        turma.data_validade,
        turma.carga_horaria,
        turma.status,
        turma.observacoes,
        req.user?.id || null,
      ]
    );

    await connection.query(
      `INSERT INTO rh_treinamentos_turma_participantes
        (turma_id, funcionario_id, treinamento_funcionario_id, status_participacao)
       VALUES (?, ?, ?, 'participou')`,
      [req.params.id, funcionario_id, treinamentoResult.insertId]
    );

    await connection.commit();

    await registrarAuditoria({
      req,
      entidade: "treinamento_turma",
      entidadeId: req.params.id,
      acao: "adicionar_participante",
      descricao: `Adicionou funcionário #${funcionario_id} à turma de treinamento "${turma.nome_treinamento}".`,
    });

    const [rows] = await pool.query(
      `SELECT p.*, f.nome_completo, f.setor, f.cargo_atual
       FROM rh_treinamentos_turma_participantes p
       JOIN rh_funcionarios f ON f.id = p.funcionario_id
       WHERE p.turma_id = ? AND p.funcionario_id = ?`,
      [req.params.id, funcionario_id]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

router.put("/:id/participantes/:participanteId", canManageFuncionarios, async (req, res, next) => {
  try {
    const { status_participacao, observacoes } = req.body;
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_treinamentos_turma_participantes WHERE id = ? AND turma_id = ?",
      [req.params.participanteId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Participante não encontrado nesta turma." });
    }
    const existing = existingRows[0];
    const statusValido = ["participou", "ausente", "cancelado"];
    if (status_participacao !== undefined && !statusValido.includes(status_participacao)) {
      return res.status(400).json({ success: false, error: "Status de participação inválido." });
    }

    await pool.query(
      "UPDATE rh_treinamentos_turma_participantes SET status_participacao = ?, observacoes = ? WHERE id = ?",
      [
        status_participacao !== undefined ? status_participacao : existing.status_participacao,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.participanteId,
      ]
    );

    await registrarAuditoria({
      req,
      entidade: "treinamento_turma",
      entidadeId: req.params.id,
      acao: "editar_participante",
      descricao: `Atualizou participação do funcionário #${existing.funcionario_id} na turma #${req.params.id}.`,
      dadosAntes: existing,
    });

    const [rows] = await pool.query(
      `SELECT p.*, f.nome_completo, f.setor, f.cargo_atual
       FROM rh_treinamentos_turma_participantes p
       JOIN rh_funcionarios f ON f.id = p.funcionario_id
       WHERE p.id = ?`,
      [req.params.participanteId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/participantes/:participanteId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_treinamentos_turma_participantes WHERE id = ? AND turma_id = ?",
      [req.params.participanteId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Participante não encontrado nesta turma." });
    }
    const existing = existingRows[0];

    // Remove o vínculo com a turma, mas preserva o histórico individual do funcionário
    if (existing.treinamento_funcionario_id) {
      await pool.query("UPDATE rh_funcionarios_treinamentos SET turma_id = NULL WHERE id = ?", [
        existing.treinamento_funcionario_id,
      ]);
    }
    await pool.query("DELETE FROM rh_treinamentos_turma_participantes WHERE id = ?", [req.params.participanteId]);

    await registrarAuditoria({
      req,
      entidade: "treinamento_turma",
      entidadeId: req.params.id,
      acao: "remover_participante",
      descricao: `Removeu funcionário #${existing.funcionario_id} da turma de treinamento #${req.params.id}.`,
      dadosAntes: existing,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query("SELECT * FROM rh_treinamentos_turmas WHERE id = ?", [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Turma de treinamento não encontrada." });
    }

    // Não exclui o histórico individual de treinamento dos funcionários: apenas desvincula da turma.
    await pool.query("UPDATE rh_funcionarios_treinamentos SET turma_id = NULL WHERE turma_id = ?", [req.params.id]);
    await pool.query("DELETE FROM rh_treinamentos_turmas WHERE id = ?", [req.params.id]);

    await registrarAuditoria({
      req,
      entidade: "treinamento_turma",
      entidadeId: req.params.id,
      acao: "excluir",
      descricao: `Excluiu turma de treinamento "${existingRows[0].nome_treinamento}" (histórico individual preservado).`,
      dadosAntes: existingRows[0],
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
