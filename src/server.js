require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const pool = require("./db/pool");
const vagasRoutes = require("./routes/vagas.routes");
const { router: candidaturasRoutes } = require("./routes/candidaturas.routes");
const candidatosRoutes = require("./routes/candidatos.routes");
const entrevistasRoutes = require("./routes/entrevistas.routes");
const avaliacoesRoutes = require("./routes/avaliacoes.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const funcionariosRoutes = require("./routes/funcionarios.routes");
const auditoriaRoutes = require("./routes/auditoria.routes");
const publicRoutes = require("./routes/public.routes");
const authRoutes = require("./routes/auth.routes");
const { authMiddleware } = require("./middleware/auth.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/rh/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/rh/db-health", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ status: "ok", db: rows[0] });
  } catch (err) {
    next(err);
  }
});

app.use("/api/auth", authRoutes);

app.use("/api/rh/vagas", authMiddleware, vagasRoutes);
app.use("/api/rh/candidaturas", authMiddleware, candidaturasRoutes);
app.use("/api/rh/candidatos", authMiddleware, candidatosRoutes);
app.use("/api/rh/entrevistas", authMiddleware, entrevistasRoutes);
app.use("/api/rh/avaliacoes", authMiddleware, avaliacoesRoutes);
app.use("/api/rh/dashboard", authMiddleware, dashboardRoutes);
app.use("/api/rh/funcionarios", authMiddleware, funcionariosRoutes);
app.use("/api/rh/auditoria", authMiddleware, auditoriaRoutes);
app.use("/api/rh/public", publicRoutes);
app.use("/uploads/curriculos", express.static(path.join(__dirname, "..", "uploads", "curriculos")));

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.use((err, req, res, next) => {
  console.error(err);
  const isMulterError = err.name === "MulterError";
  const status = err.status || (isMulterError ? 400 : 500);
  res.status(status).json({ error: err.message || "Erro interno do servidor" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend RH rodando na porta ${PORT}`);
});
