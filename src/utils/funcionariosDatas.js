const PERIODOS = ["mes_atual", "ultimos_3_meses", "ultimos_6_meses", "ano_atual", "personalizado"];

function toSqlDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// Resolve um intervalo [data_inicio, data_fim] a partir dos query params do dashboard.
// Aceita um período pré-definido (?periodo=) ou datas explícitas (?data_inicio=&data_fim=).
// Sem nenhum parâmetro, usa o mês atual como padrão.
function resolvePeriodo(query) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (query.data_inicio && query.data_fim) {
    return { dataInicio: query.data_inicio, dataFim: query.data_fim };
  }

  const periodo = PERIODOS.includes(query.periodo) ? query.periodo : "mes_atual";

  if (periodo === "ano_atual") {
    return { dataInicio: `${hoje.getFullYear()}-01-01`, dataFim: toSqlDate(endOfMonth(new Date(hoje.getFullYear(), 11, 1))) };
  }
  if (periodo === "ultimos_3_meses") {
    const inicio = startOfMonth(new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1));
    return { dataInicio: toSqlDate(inicio), dataFim: toSqlDate(hoje) };
  }
  if (periodo === "ultimos_6_meses") {
    const inicio = startOfMonth(new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1));
    return { dataInicio: toSqlDate(inicio), dataFim: toSqlDate(hoje) };
  }
  // mes_atual (default)
  return { dataInicio: toSqlDate(startOfMonth(hoje)), dataFim: toSqlDate(endOfMonth(hoje)) };
}

function diasEntre(dataA, dataB) {
  const a = new Date(dataA);
  a.setHours(0, 0, 0, 0);
  const b = new Date(dataB);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function computeTreinamentoStatus(dataValidade, hoje = new Date()) {
  if (!dataValidade) return "sem_validade";
  const ref = new Date(hoje);
  ref.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade);
  validade.setHours(0, 0, 0, 0);
  if (validade < ref) return "vencido";
  const diffDias = Math.round((validade.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias <= 60) return "proximo_vencimento";
  return "valido";
}

// Últimos N meses (incluindo o atual), do mais antigo para o mais recente.
function ultimosMeses(n) {
  const hoje = new Date();
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
  }
  return meses;
}

module.exports = {
  resolvePeriodo,
  diasEntre,
  computeTreinamentoStatus,
  ultimosMeses,
  toSqlDate,
};
