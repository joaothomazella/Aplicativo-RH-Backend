require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db/pool");
const vagasRoutes = require("./routes/vagas.routes");
const candidaturasRoutes = require("./routes/candidaturas.routes");
const dashboardRoutes = require("./routes/dashboard.routes");

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

app.use("/api/rh/vagas", vagasRoutes);
app.use("/api/rh/candidaturas", candidaturasRoutes);
app.use("/api/rh/dashboard", dashboardRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erro interno do servidor" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend RH rodando na porta ${PORT}`);
});
