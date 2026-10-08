require("dotenv").config();
const pool = require("../db/pool");

// Troca apenas o perfil de um usuario, sem tocar na senha.
//
//   node src/scripts/alterar-perfil.js sabrina rh
//
// O seed-rh-users.js tambem define perfis, mas ele regrava o hash da senha de
// todo mundo -- usar aquele script para ajustar uma permissao resetaria as
// senhas dos outros usuarios.

const PERFIS = ["admin", "rh", "dp", "gestor"];

const ACESSOS = {
  admin: "Geral, Recrutamento e Selecao, Departamento Pessoal e Administracao",
  rh: "Geral, Recrutamento e Selecao e Departamento Pessoal",
  dp: "Geral e Departamento Pessoal",
  gestor: "Geral e Departamento Pessoal (apenas consulta de funcionarios)",
};

async function run() {
  const [usuario, perfil] = process.argv.slice(2);

  if (!usuario || !perfil) {
    console.error("Uso: node src/scripts/alterar-perfil.js <usuario> <perfil>");
    console.error(`Perfis validos: ${PERFIS.join(", ")}`);
    process.exit(1);
  }

  if (!PERFIS.includes(perfil)) {
    console.error(`Perfil invalido: "${perfil}". Use um destes: ${PERFIS.join(", ")}`);
    process.exit(1);
  }

  const [rows] = await pool.query(
    "SELECT id, nome, usuario, perfil, ativo FROM rh_usuarios WHERE usuario = ? LIMIT 1",
    [usuario]
  );

  if (rows.length === 0) {
    console.error(`Usuario "${usuario}" nao encontrado.`);
    const [todos] = await pool.query("SELECT usuario, perfil FROM rh_usuarios ORDER BY usuario");
    console.error("\nUsuarios cadastrados:");
    for (const u of todos) console.error(`- ${u.usuario} (${u.perfil})`);
    await pool.end();
    process.exit(1);
  }

  const atual = rows[0];

  if (atual.perfil === perfil) {
    console.log(`${atual.nome} (${atual.usuario}) ja esta com o perfil "${perfil}". Nada a fazer.`);
    await pool.end();
    return;
  }

  await pool.query("UPDATE rh_usuarios SET perfil = ? WHERE id = ?", [perfil, atual.id]);

  console.log(`${atual.nome} (${atual.usuario}): ${atual.perfil} -> ${perfil}`);
  console.log(`Acesso agora: ${ACESSOS[perfil]}`);
  if (!atual.ativo) {
    console.log("Atencao: este usuario esta inativo e nao consegue entrar no app.");
  }
  console.log("\nA pessoa precisa sair e entrar de novo no app para o novo acesso valer.");

  await pool.end();
}

run().catch((err) => {
  console.error("Erro ao alterar o perfil:", err);
  process.exit(1);
});
