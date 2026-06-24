require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");

const USUARIOS = [
  { usuario: "marcela", senha: "100503", perfil: "rh", nome: "Marcela" },
  { usuario: "gil", senha: "GIL005", perfil: "admin", nome: "Gil" },
  { usuario: "heverton", senha: "332799", perfil: "admin", nome: "Heverton" },
  { usuario: "Thomazella", senha: "THOMAZELLA04", perfil: "admin", nome: "Thomazella" },
  { usuario: "sabrina", senha: "2908SA", perfil: "dp", nome: "Sabrina" },
];

async function run() {
  const resultados = [];

  for (const { usuario, senha, perfil, nome } of USUARIOS) {
    const senha_hash = await bcrypt.hash(senha, 10);

    await pool.query(
      `INSERT INTO rh_usuarios (nome, usuario, senha_hash, perfil, ativo)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE nome = ?, senha_hash = ?, perfil = ?, ativo = 1`,
      [nome, usuario, senha_hash, perfil, nome, senha_hash, perfil]
    );

    resultados.push({ usuario, perfil });
  }

  console.log("Usuários RH criados/atualizados:");
  for (const { usuario, perfil } of resultados) {
    console.log(`- ${usuario} — ${perfil}`);
  }

  await pool.end();
}

run().catch((err) => {
  console.error("Erro ao criar/atualizar usuários:", err);
  process.exit(1);
});
