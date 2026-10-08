require("dotenv").config();
const pool = require("../db/pool");

// Lista candidatos que parecem ser a mesma pessoa cadastrada mais de uma vez.
// Somente leitura: nao altera nem apaga nada.
//
//   node src/scripts/listar-duplicados.js
//
// A partir desta versao o backend ja unifica automaticamente quem se candidata
// de novo (src/routes/candidaturas.routes.js). Este script serve para encontrar
// as duplicatas que entraram ANTES disso -- a exclusao e feita pelo app, na
// lixeira que aparece no card do Kanban.

function somenteDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

function normalizarEmail(valor) {
  const email = String(valor ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.endsWith("@sem-email.com")) return null;
  return email;
}

function chaves(candidato) {
  const resultado = [];

  const cpf = somenteDigitos(candidato.cpf);
  if (cpf.length === 11) resultado.push(`cpf:${cpf}`);

  const email = normalizarEmail(candidato.email);
  if (email) resultado.push(`email:${email}`);

  for (const numero of [candidato.telefone, candidato.whatsapp]) {
    const digitos = somenteDigitos(numero);
    if (digitos.length >= 8) resultado.push(`fone:${digitos.slice(-8)}`);
  }

  return resultado;
}

// Agrupa por qualquer chave em comum: se A e B dividem o telefone e B e C
// dividem o e-mail, os tres caem no mesmo grupo.
function agrupar(candidatos) {
  const grupoDe = new Map();
  const grupos = new Map();
  let proximoGrupo = 0;

  for (const candidato of candidatos) {
    const minhasChaves = chaves(candidato);
    const grupoExistente = minhasChaves.map((k) => grupoDe.get(k)).find((g) => g !== undefined);
    const grupo = grupoExistente ?? proximoGrupo++;

    for (const chave of minhasChaves) grupoDe.set(chave, grupo);
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(candidato);
  }

  return [...grupos.values()].filter((g) => g.length > 1);
}

async function run() {
  const [candidatos] = await pool.query(
    `SELECT c.id, c.nome, c.email, c.telefone, c.whatsapp, c.cpf, c.curriculo_url, c.created_at,
            COUNT(ca.id) AS candidaturas,
            GROUP_CONCAT(CONCAT(ca.id, '|', ca.etapa) ORDER BY ca.created_at SEPARATOR ';') AS cards
       FROM rh_candidatos c
       LEFT JOIN rh_candidaturas ca ON ca.candidato_id = c.id
      GROUP BY c.id
      ORDER BY c.id`
  );

  const duplicados = agrupar(candidatos);

  if (duplicados.length === 0) {
    console.log(`Nenhum candidato repetido encontrado (${candidatos.length} candidatos conferidos).`);
    await pool.end();
    return;
  }

  console.log(`${duplicados.length} pessoa(s) aparentemente cadastrada(s) mais de uma vez:\n`);

  for (const grupo of duplicados) {
    console.log(`=== ${grupo[0].nome} ===`);
    for (const c of grupo) {
      const cards = (c.cards || "")
        .split(";")
        .filter(Boolean)
        .map((card) => {
          const [id, etapa] = card.split("|");
          return `card #${id} em "${etapa}"`;
        })
        .join(", ");
      console.log(`  candidato #${c.id}  ${c.nome}`);
      console.log(`    contato: ${c.email || "sem e-mail"} / ${c.telefone || c.whatsapp || "sem telefone"}`);
      console.log(`    cadastrado em: ${c.created_at ? new Date(c.created_at).toLocaleString("pt-BR") : "?"}`);
      console.log(`    curriculo: ${c.curriculo_url ? "sim" : "nao"}`);
      console.log(`    ${cards || "nenhuma candidatura"}`);
    }
    console.log(
      "  -> Mantenha o cadastro que tem curriculo e esta na etapa mais avancada; exclua o outro pelo\n" +
        "     icone de lixeira no card do Kanban.\n"
    );
  }

  await pool.end();
}

run().catch((err) => {
  console.error("Erro ao listar duplicados:", err);
  process.exit(1);
});
