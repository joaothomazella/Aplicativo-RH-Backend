// Busca um nome em todas as tabelas de pessoas do sistema.
// Uso: node src/scripts/buscar-pessoa.js rogerio
const pool = require("../db/pool");

const termo = process.argv[2];
if (!termo) {
  console.error("Informe o nome a buscar. Ex: node src/scripts/buscar-pessoa.js rogerio");
  process.exit(1);
}

// Busca sem acento tambem: o collation utf8mb4_unicode_ci ja ignora acento e
// caixa, mas a variante explicita cobre bancos com collation diferente.
const like = `%${termo}%`;
const semAcento = `%${termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}%`;

(async () => {
  const [usuarios] = await pool.query(
    `SELECT id, nome, usuario, perfil, ativo FROM rh_usuarios
     WHERE nome LIKE ? OR nome LIKE ? OR usuario LIKE ? OR usuario LIKE ? ORDER BY id`,
    [like, semAcento, like, semAcento]
  );
  console.log(`\n== rh_usuarios (logins do sistema): ${usuarios.length} ==`);
  if (usuarios.length) console.table(usuarios);

  const [funcionarios] = await pool.query(
    `SELECT id, nome_completo, setor, cargo_atual, status FROM rh_funcionarios
     WHERE nome_completo LIKE ? OR nome_completo LIKE ? ORDER BY nome_completo`,
    [like, semAcento]
  );
  console.log(`\n== rh_funcionarios: ${funcionarios.length} ==`);
  if (funcionarios.length) console.table(funcionarios);

  const [candidatos] = await pool.query(
    `SELECT id, nome, email, telefone FROM rh_candidatos
     WHERE nome LIKE ? OR nome LIKE ? ORDER BY nome`,
    [like, semAcento]
  );
  console.log(`\n== rh_candidatos: ${candidatos.length} ==`);
  if (candidatos.length) console.table(candidatos);

  const total = usuarios.length + funcionarios.length + candidatos.length;
  console.log(`\nTotal de registros encontrados para "${termo}": ${total}`);

  const [todosLogins] = await pool.query(
    "SELECT id, nome, usuario, perfil, ativo FROM rh_usuarios ORDER BY id"
  );
  console.log(`\n== todos os logins cadastrados: ${todosLogins.length} ==`);
  console.table(todosLogins);

  await pool.end();
})().catch((err) => {
  console.error("ERRO:", err.message);
  process.exit(1);
});
