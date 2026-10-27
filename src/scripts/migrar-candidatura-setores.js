require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");

// Aplica a migration 011: cria rh_candidatura_setores, a tabela que liga uma
// candidatura aos setores para onde ela foi destinada.
//
//   node src/scripts/migrar-candidatura-setores.js
//
// Pode rodar mais de uma vez: a migration usa CREATE TABLE IF NOT EXISTS.

const ARQUIVO = path.join(__dirname, "..", "..", "sql", "migration_011_candidatura_setores.sql");

async function run() {
  const [antes] = await pool.query("SHOW TABLES LIKE 'rh_candidatura_setores'");

  if (antes.length > 0) {
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM rh_candidatura_setores");
    console.log(`A tabela rh_candidatura_setores ja existe (${total} destinacao(oes) gravadas). Nada a fazer.`);
    await pool.end();
    return;
  }

  // O arquivo tem um unico comando; os comentarios '--' o MySQL ignora.
  const sql = fs.readFileSync(ARQUIVO, "utf8");
  await pool.query(sql);

  const [depois] = await pool.query("SHOW TABLES LIKE 'rh_candidatura_setores'");
  if (depois.length === 0) {
    throw new Error("A tabela nao foi criada. Confira as permissoes do usuario do banco.");
  }

  const [setores] = await pool.query(
    "SELECT nome FROM rh_funcionarios_setores WHERE ativo = 1 ORDER BY nome"
  );

  console.log("Tabela rh_candidatura_setores criada.");
  console.log(`\nQuadros que vao aparecer no Kanban: Geral, ${setores.map((s) => s.nome).join(", ")}`);
  console.log("Para acrescentar ou tirar setores, use Funcionarios > Configuracoes > Setores.");

  await pool.end();
}

run().catch((err) => {
  console.error("Erro ao aplicar a migration:", err);
  process.exit(1);
});
