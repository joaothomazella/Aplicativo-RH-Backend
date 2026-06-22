const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "documentos");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".xls", ".xlsx"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Formato de arquivo inválido. Envie PDF, PNG, JPG, JPEG, DOC, DOCX, XLS ou XLSX."));
  }
  cb(null, true);
}

const uploadDocumento = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

function documentoUrlFromFile(file) {
  if (!file) return null;
  return `/uploads/documentos/${file.filename}`;
}

module.exports = { uploadDocumento, documentoUrlFromFile, UPLOAD_DIR };
