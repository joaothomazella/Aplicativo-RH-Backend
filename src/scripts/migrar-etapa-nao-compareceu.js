require("dotenv").config();
const pool = require("../db/pool");

// Aplica a migration 010: acrescenta a etapa "nao_compareceu" ao enum de
// rh_candidaturas.etapa.
//
//   node src/scripts/migrar-etapa-nao-compareceu.js
//
// Pode rodar mais de uma vez sem problema: se a etapa ja existir, o script nao
// altera nada. A nova etapa entra depois de "entrevista" e antes de "teste",
// que e a ordem em que a coluna aparece no Kanban.

const NOVA_ETAPA = "nao_compareceu";
const DEPOIS_DE = "entrevista";

function valoresDoEnum(tipo) {
  // O MySQL devolve algo como: enum('novo_curriculo','triagem',...)
  const dentroDosParenteses = tipo.slice(tipo.indexOf("(") + 1, tipo.lastIndexOf(")"));
  return dentroDosParenteses
    .split(",")
    .map((valor) => valor.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
}

async function run() {
  const [colunas] = await pool.query("SHOW COLUMNS FROM rh_candidaturas LIKE 'etapa'");

  if (colunas.length === 0) {
    throw new Error("A coluna 'etapa' nao existe em rh_candidaturas.");
  }

  const coluna = colunas[0];

  if (!/^enum\(/i.test(coluna.Type)) {
    throw new Error(`A coluna 'etapa' nao e um ENUM (tipo atual: ${coluna.Type}).`);
  }

  const atuais = valoresDoEnum(coluna.Type);

  if (atuais.includes(NOVA_ETAPA)) {
    console.log(`A etapa "${NOVA_ETAPA}" ja existe. Nada a fazer.`);
    await pool.end();
    return;
  }

  const posicao = atuais.indexOf(DEPOIS_DE);
  const novos = [...atuais];
  novos.splice(posicao >= 0 ? posicao + 1 : novos.length, 0, NOVA_ETAPA);

  // Preserva a nulidade e o padrao que a coluna ja tinha, para a migration nao
  // mudar nada alem da lista de valores.
  const nulidade = coluna.Null === "NO" ? " NOT NULL" : "";
  const padrao = coluna.Default === null ? "" : ` DEFAULT ${pool.escape(coluna.Default)}`;
  const lista = novos.map((valor) => pool.escape(valor)).join(",");

  console.log(`Etapas antes:  ${atuais.join(", ")}`);
  await pool.query(`ALTER TABLE rh_candidaturas MODIFY etapa ENUM(${lista})${nulidade}${padrao}`);
  console.log(`Etapas depois: ${novos.join(", ")}`);
  console.log('\nPronto. A coluna "Aprovado na triagem, nao compareceu" ja funciona no Kanban.');

  await pool.end();
}

run().catch((err) => {
  console.error("Erro ao aplicar a migration:", err);
  process.exit(1);
});
