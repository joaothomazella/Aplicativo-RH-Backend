const fs = require("fs");
const path = require("path");
const express = require("express");
const pool = require("../../db/pool");
const { canAccessSensitiveData } = require("../../middleware/permissions.middleware");
const { uploadDocumento, documentoUrlFromFile, UPLOAD_DIR } = require("../../middleware/uploadDocumentos");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

const TIPOS = [
  "Documento pessoal",
  "Contrato",
  "Atestado",
  "Certificado de treinamento",
  "Ficha de EPI",
  "Recibo",
  "Exame admissional",
  "Exame periódico",
  "Exame demissional",
  "Comprovante de residência",
  "Outro",
];

router.use(canAccessSensitiveData);

function computeStatus(dataValidade, requestedStatus) {
  if (requestedStatus === "arquivado") return "arquivado";
  if (!dataValidade) return "valido";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade);
  validade.setHours(0, 0, 0, 0);
  const diffDias = Math.round((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return "vencido";
  if (diffDias <= 60) return "proximo_vencimento";
  return "valido";
}

async function getFuncionario(funcionarioId) {
  const [rows] = await pool.query("SELECT id, nome_completo FROM rh_funcionarios WHERE id = ?", [funcionarioId]);
  return rows[0] || null;
}

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, u.nome AS usuario_nome
       FROM rh_funcionarios_documentos d
       LEFT JOIN rh_usuarios u ON u.id = d.usuario_id
       WHERE d.funcionario_id = ?
       ORDER BY d.data_validade IS NULL, d.data_validade ASC, d.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows, tipos: TIPOS });
  } catch (err) {
    next(err);
  }
});

router.post("/", uploadDocumento.single("arquivo"), async (req, res, next) => {
  try {
    const funcionario = await getFuncionario(req.params.id);
    if (!funcionario) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const { tipo, titulo, descricao, data_documento, data_validade, status, observacoes, arquivo_url } = req.body;

    if (!tipo || !String(tipo).trim()) {
      return res.status(400).json({ success: false, error: "O tipo do documento é obrigatório." });
    }
    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ success: false, error: "O título do documento é obrigatório." });
    }

    const statusFinal = computeStatus(data_validade || null, status);
    const arquivoUrl = req.file ? documentoUrlFromFile(req.file) : arquivo_url || null;
    const arquivoNome = req.file ? req.file.originalname : null;
    const arquivoTipo = req.file ? req.file.mimetype : null;
    const arquivoTamanho = req.file ? req.file.size : null;

    const [result] = await pool.query(
      `INSERT INTO rh_funcionarios_documentos
        (funcionario_id, tipo, titulo, descricao, data_documento, data_validade, status,
         arquivo_nome, arquivo_url, arquivo_tipo, arquivo_tamanho, observacoes, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        tipo.trim(),
        titulo.trim(),
        descricao || null,
        data_documento || null,
        data_validade || null,
        statusFinal,
        arquivoNome,
        arquivoUrl,
        arquivoTipo,
        arquivoTamanho,
        observacoes || null,
        req.user?.id || null,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_documentos WHERE id = ?", [result.insertId]);

    await registrarAuditoria({
      req,
      entidade: "funcionario_documento",
      entidadeId: result.insertId,
      acao: "criar_documento",
      descricao: `Documento "${titulo.trim()}" (${tipo.trim()}) cadastrado para ${funcionario.nome_completo}.`,
      dadosDepois: rows[0],
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.put("/:documentoId", uploadDocumento.single("arquivo"), async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_documentos WHERE id = ? AND funcionario_id = ?",
      [req.params.documentoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Documento não encontrado." });
    }
    const existing = existingRows[0];
    const { tipo, titulo, descricao, data_documento, data_validade, status, observacoes, arquivo_url } = req.body;

    if (tipo !== undefined && !String(tipo).trim()) {
      return res.status(400).json({ success: false, error: "O tipo do documento é obrigatório." });
    }
    if (titulo !== undefined && !String(titulo).trim()) {
      return res.status(400).json({ success: false, error: "O título do documento é obrigatório." });
    }

    const dataValidadeFinal = data_validade !== undefined ? data_validade || null : existing.data_validade;
    const statusFinal = computeStatus(dataValidadeFinal, status !== undefined ? status : existing.status);

    const arquivoUrlFinal = req.file ? documentoUrlFromFile(req.file) : arquivo_url !== undefined ? arquivo_url || null : existing.arquivo_url;
    const arquivoNomeFinal = req.file ? req.file.originalname : existing.arquivo_nome;
    const arquivoTipoFinal = req.file ? req.file.mimetype : existing.arquivo_tipo;
    const arquivoTamanhoFinal = req.file ? req.file.size : existing.arquivo_tamanho;

    await pool.query(
      `UPDATE rh_funcionarios_documentos SET
        tipo = ?, titulo = ?, descricao = ?, data_documento = ?, data_validade = ?, status = ?,
        arquivo_nome = ?, arquivo_url = ?, arquivo_tipo = ?, arquivo_tamanho = ?, observacoes = ?
       WHERE id = ?`,
      [
        tipo !== undefined ? tipo.trim() : existing.tipo,
        titulo !== undefined ? titulo.trim() : existing.titulo,
        descricao !== undefined ? descricao || null : existing.descricao,
        data_documento !== undefined ? data_documento || null : existing.data_documento,
        dataValidadeFinal,
        statusFinal,
        arquivoNomeFinal,
        arquivoUrlFinal,
        arquivoTipoFinal,
        arquivoTamanhoFinal,
        observacoes !== undefined ? observacoes || null : existing.observacoes,
        req.params.documentoId,
      ]
    );

    const [rows] = await pool.query("SELECT * FROM rh_funcionarios_documentos WHERE id = ?", [req.params.documentoId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete("/:documentoId", async (req, res, next) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM rh_funcionarios_documentos WHERE id = ? AND funcionario_id = ?",
      [req.params.documentoId, req.params.id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, error: "Documento não encontrado." });
    }
    const existing = existingRows[0];

    await pool.query("DELETE FROM rh_funcionarios_documentos WHERE id = ?", [req.params.documentoId]);

    if (existing.arquivo_url && existing.arquivo_url.startsWith("/uploads/documentos/")) {
      const filePath = path.join(UPLOAD_DIR, path.basename(existing.arquivo_url));
      fs.unlink(filePath, () => {});
    }

    await registrarAuditoria({
      req,
      entidade: "funcionario_documento",
      entidadeId: existing.id,
      acao: "excluir_documento",
      descricao: `Documento "${existing.titulo}" (${existing.tipo}) excluído.`,
      dadosAntes: existing,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
