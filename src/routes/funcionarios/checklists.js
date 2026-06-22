const express = require("express");
const pool = require("../../db/pool");
const { canManageFuncionarios } = require("../../middleware/permissions.middleware");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

const ITENS_PADRAO = {
  admissao: [
    "Receber documentos pessoais",
    "Cadastrar funcionário no sistema",
    "Assinar contrato",
    "Entregar uniforme",
    "Entregar EPI",
    "Fazer integração",
    "Cadastrar benefícios",
    "Criar acesso interno, se houver",
    "Exame admissional",
    "Arquivar documentos",
  ],
  desligamento: [
    "Conferir aviso prévio",
    "Recolher uniforme/EPI",
    "Encerrar acessos",
    "Exame demissional",
    "Conferir pendências",
    "Baixar benefícios",
    "Arquivar documentação",
    "Registrar data de desligamento",
  ],
};

async function getFuncionario(funcionarioId) {
  const [rows] = await pool.query("SELECT id, nome_completo FROM rh_funcionarios WHERE id = ?", [funcionarioId]);
  return rows[0] || null;
}

async function getChecklistComItens(checklistId) {
  const [[checklist]] = await pool.query("SELECT * FROM rh_funcionarios_checklists WHERE id = ?", [checklistId]);
  if (!checklist) return null;
  const [itens] = await pool.query(
    "SELECT * FROM rh_funcionarios_checklist_itens WHERE checklist_id = ? ORDER BY id ASC",
    [checklistId]
  );
  const total = itens.length;
  const concluidos = itens.filter((i) => i.concluido).length;
  return {
    ...checklist,
    itens,
    progresso: total > 0 ? Math.round((concluidos / total) * 100) : 0,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const [checklists] = await pool.query(
      "SELECT * FROM rh_funcionarios_checklists WHERE funcionario_id = ? ORDER BY created_at DESC",
      [req.params.id]
    );
    const data = await Promise.all(checklists.map((c) => getChecklistComItens(c.id)));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/", canManageFuncionarios, async (req, res, next) => {
  try {
    const funcionario = await getFuncionario(req.params.id);
    if (!funcionario) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const { tipo, titulo, itens } = req.body;
    if (!tipo || !["admissao", "desligamento", "outro"].includes(tipo)) {
      return res.status(400).json({ success: false, error: "Informe um tipo válido (admissao, desligamento ou outro)." });
    }
    const tituloFinal =
      titulo && String(titulo).trim()
        ? String(titulo).trim()
        : tipo === "admissao"
          ? "Checklist de admissão"
          : tipo === "desligamento"
            ? "Checklist de desligamento"
            : "Checklist";

    const [result] = await pool.query(
      "INSERT INTO rh_funcionarios_checklists (funcionario_id, tipo, titulo) VALUES (?, ?, ?)",
      [req.params.id, tipo, tituloFinal]
    );
    const checklistId = result.insertId;

    const itensIniciais = Array.isArray(itens) && itens.length > 0 ? itens.map((i) => String(i)) : ITENS_PADRAO[tipo] || [];
    for (const descricao of itensIniciais) {
      await pool.query(
        "INSERT INTO rh_funcionarios_checklist_itens (checklist_id, descricao, obrigatorio) VALUES (?, ?, 1)",
        [checklistId, descricao]
      );
    }

    const data = await getChecklistComItens(checklistId);

    await registrarAuditoria({
      req,
      entidade: "funcionario_checklist",
      entidadeId: checklistId,
      acao: "criar_checklist",
      descricao: `Checklist de ${tipo} "${tituloFinal}" criado para ${funcionario.nome_completo}.`,
      dadosDepois: data,
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put("/:checklistId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_checklists WHERE id = ? AND funcionario_id = ?",
      [req.params.checklistId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Checklist não encontrado." });
    }
    const existing = existingRows[0];
    const { titulo, status } = req.body;
    if (status !== undefined && !["aberto", "em_andamento", "concluido", "cancelado"].includes(status)) {
      return res.status(400).json({ success: false, error: "Status inválido." });
    }

    await pool.query("UPDATE rh_funcionarios_checklists SET titulo = ?, status = ? WHERE id = ?", [
      titulo !== undefined && String(titulo).trim() ? String(titulo).trim() : existing.titulo,
      status !== undefined ? status : existing.status,
      req.params.checklistId,
    ]);

    const data = await getChecklistComItens(req.params.checklistId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete("/:checklistId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_checklists WHERE id = ? AND funcionario_id = ?",
      [req.params.checklistId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Checklist não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_checklists WHERE id = ?", [req.params.checklistId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:checklistId/itens", canManageFuncionarios, async (req, res, next) => {
  try {
    const [checklistRows] = await pool.query(
      "SELECT id FROM rh_funcionarios_checklists WHERE id = ? AND funcionario_id = ?",
      [req.params.checklistId, req.params.id]
    );
    if (checklistRows.length === 0) {
      return res.status(404).json({ success: false, error: "Checklist não encontrado." });
    }

    const { descricao, obrigatorio } = req.body;
    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ success: false, error: "A descrição do item é obrigatória." });
    }

    await pool.query(
      "INSERT INTO rh_funcionarios_checklist_itens (checklist_id, descricao, obrigatorio) VALUES (?, ?, ?)",
      [req.params.checklistId, String(descricao).trim(), obrigatorio ? 1 : 0]
    );

    const data = await getChecklistComItens(req.params.checklistId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put("/:checklistId/itens/:itemId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [itemRows] = await pool.query(
      `SELECT i.* FROM rh_funcionarios_checklist_itens i
       JOIN rh_funcionarios_checklists c ON c.id = i.checklist_id
       WHERE i.id = ? AND i.checklist_id = ? AND c.funcionario_id = ?`,
      [req.params.itemId, req.params.checklistId, req.params.id]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ success: false, error: "Item não encontrado." });
    }
    const existing = itemRows[0];
    const { descricao, obrigatorio, concluido, observacoes } = req.body;

    const concluidoFinal = concluido !== undefined ? (concluido ? 1 : 0) : existing.concluido;
    const concluidoMudou = Boolean(concluidoFinal) !== Boolean(existing.concluido);

    await pool.query(
      `UPDATE rh_funcionarios_checklist_itens SET
        descricao = ?, obrigatorio = ?, concluido = ?, concluido_em = ?, concluido_por = ?, observacoes = ?
       WHERE id = ?`,
      [
        descricao !== undefined && String(descricao).trim() ? String(descricao).trim() : existing.descricao,
        obrigatorio !== undefined ? (obrigatorio ? 1 : 0) : existing.obrigatorio,
        concluidoFinal,
        concluidoFinal ? (concluidoMudou ? new Date() : existing.concluido_em) : null,
        concluidoFinal ? (concluidoMudou ? req.user?.id || null : existing.concluido_por) : null,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.itemId,
      ]
    );

    const data = await getChecklistComItens(req.params.checklistId);

    if (data.progresso === 100 && data.status !== "concluido") {
      await pool.query("UPDATE rh_funcionarios_checklists SET status = 'concluido' WHERE id = ?", [req.params.checklistId]);
      data.status = "concluido";
    } else if (data.progresso > 0 && data.progresso < 100 && data.status === "aberto") {
      await pool.query("UPDATE rh_funcionarios_checklists SET status = 'em_andamento' WHERE id = ?", [req.params.checklistId]);
      data.status = "em_andamento";
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete("/:checklistId/itens/:itemId", canManageFuncionarios, async (req, res, next) => {
  try {
    const [itemRows] = await pool.query(
      `SELECT i.id FROM rh_funcionarios_checklist_itens i
       JOIN rh_funcionarios_checklists c ON c.id = i.checklist_id
       WHERE i.id = ? AND i.checklist_id = ? AND c.funcionario_id = ?`,
      [req.params.itemId, req.params.checklistId, req.params.id]
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ success: false, error: "Item não encontrado." });
    }
    await pool.query("DELETE FROM rh_funcionarios_checklist_itens WHERE id = ?", [req.params.itemId]);
    const data = await getChecklistComItens(req.params.checklistId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
