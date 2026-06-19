require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");

const usuario = process.env.SEED_USUARIO || "marcela";
const senha = process.env.SEED_SENHA || "100503";
const nome = process.env.SEED_NOME || "Marcela";
const perfil = process.env.SEED_PERFIL || "admin";

async function run() {
  const senha_hash = await bcrypt.hash(senha, 10);

  await pool.query(
    `INSERT INTO rh_usuarios (nome, usuario, senha_hash, perfil, ativo)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE nome = ?, senha_hash = ?, perfil = ?, ativo = 1`,
    [nome, usuario, senha_hash, perfil, nome, senha_hash, perfil]
  );

  console.log(`Usuário "${usuario}" criado/atualizado com sucesso (perfil: ${perfil}).`);
  await pool.end();
}

run().catch((err) => {
  console.error("Erro ao criar usuário:", err);
  process.exit(1);
});
