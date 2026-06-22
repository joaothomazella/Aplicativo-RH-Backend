const express = require("express");
const pool = require("../../db/pool");
const { resolvePeriodo, ultimosMeses } = require("../../utils/funcionariosDatas");

const router = express.Router();

function buildFuncionarioFiltro(query) {
  const where = [];
  const params = [];
  if (query.setor) {
    where.push("f.setor = ?");
    params.push(query.setor);
  }
  if (query.status) {
    where.push("f.status = ?");
    params.push(query.status);
  }
  if (query.tipo_contrato) {
    where.push("f.tipo_contrato = ?");
    params.push(query.tipo_contrato);
  }
  return { sql: where.length ? `AND ${where.join(" AND ")}` : "", params };
}

function calcIdade(dataNascimento) {
  if (!dataNascimento) return null;
  const nascimento = new Date(dataNascimento);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversario =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversario) idade--;
  return idade;
}

function diasAteOuDesde(dataAlvo, hoje) {
  const alvo = new Date(dataAlvo);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function preencherSerieMensal(rows, meses, valueFields) {
  const porChave = new Map(rows.map((r) => [r.chave, r]));
  return meses.map((m) => {
    const row = porChave.get(m.chave);
    const entry = { mes: m.chave };
    for (const field of valueFields) {
      entry[field] = row ? Number(row[field]) || 0 : 0;
    }
    return entry;
  });
}

router.get("/", async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = resolvePeriodo(req.query);
    const { sql: filtroSql, params: filtroParams } = buildFuncionarioFiltro(req.query);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const meses12 = ultimosMeses(12);
    const inicioJanela12Meses = `${meses12[0].ano}-${String(meses12[0].mes).padStart(2, "0")}-01`;

    const [
      [[resumoRow]],
      [[treinamentosResumoRow]],
      [[feriasProgramadasRow]],
      [[atestadosAnoRow]],
      [[reajustesPeriodoRow]],
      porSetorRows,
      porStatusRows,
      cltPjRows,
      admissoesRows,
      desligamentosRows,
      reajustesMesRows,
      atestadosMesRows,
      treinamentosStatusRows,
      feriasStatusRows,
      aniversariantesRows,
      experienciaRows,
      feriasProximasRows,
      feriasVencimentoRows,
      treinamentosVencidosRows,
      treinamentosProximosRows,
      atestadosRecorrentesRows,
      reajustesRecentesRows,
      topSetoresRows,
      topTreinamentosVencidosRows,
      ultimosAdmitidosRows,
      ultimosDesligadosRows,
      ultimosReajustesRows,
      maiorTempoRows,
      menorTempoRows,
      [[documentosResumoRow]],
      [[checklistsResumoRow]],
      auditoriaRecenteRows,
      [[auditoriaExportacoesRow]],
    ] = await Promise.all([
      pool.query(
        `SELECT
          COUNT(*) AS total,
          SUM(status = 'ativo') AS ativos,
          SUM(status = 'afastado') AS afastados,
          SUM(status = 'ferias') AS ferias,
          SUM(status = 'desligado') AS desligados,
          SUM(tipo_contrato = 'CLT') AS clt,
          SUM(tipo_contrato = 'PJ') AS pj,
          SUM(convenio_unimed = 1) AS unimed,
          SUM(cartao_alimentacao = 1) AS cartao_alimentacao,
          SUM(data_admissao BETWEEN ? AND ?) AS admitidos_periodo,
          SUM(data_desligamento BETWEEN ? AND ?) AS desligados_periodo,
          SUM(MONTH(data_nascimento) = MONTH(CURDATE())) AS aniversariantes_mes,
          AVG(DATEDIFF(COALESCE(data_desligamento, CURDATE()), data_admissao)) AS media_dias_empresa
        FROM rh_funcionarios f
        WHERE 1 = 1 ${filtroSql}`,
        [dataInicio, dataFim, dataInicio, dataFim, ...filtroParams]
      ),
      pool.query(
        `SELECT
          SUM(t.data_validade IS NOT NULL AND t.data_validade < CURDATE()) AS vencidos,
          SUM(t.data_validade IS NOT NULL AND t.data_validade BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)) AS proximos
        FROM rh_funcionarios_treinamentos t
        JOIN rh_funcionarios f ON f.id = t.funcionario_id
        WHERE 1 = 1 ${filtroSql}`,
        filtroParams
      ),
      pool.query(
        `SELECT COUNT(*) AS total
        FROM rh_funcionarios_ferias fe
        JOIN rh_funcionarios f ON f.id = fe.funcionario_id
        WHERE fe.status = 'programada' ${filtroSql}`,
        filtroParams
      ),
      pool.query(
        `SELECT SUM(a.quantidade_dias) AS total_dias
        FROM rh_funcionarios_atestados a
        JOIN rh_funcionarios f ON f.id = a.funcionario_id
        WHERE a.ano = YEAR(CURDATE()) ${filtroSql}`,
        filtroParams
      ),
      pool.query(
        `SELECT COUNT(*) AS total, AVG(r.percentual_reajuste) AS percentual_medio
        FROM rh_funcionarios_reajustes_salariais r
        JOIN rh_funcionarios f ON f.id = r.funcionario_id
        WHERE r.data_reajuste BETWEEN ? AND ? ${filtroSql}`,
        [dataInicio, dataFim, ...filtroParams]
      ),
      pool.query(
        `SELECT COALESCE(setor, 'Sem setor') AS setor, COUNT(*) AS total
        FROM rh_funcionarios f WHERE 1 = 1 ${filtroSql} GROUP BY setor ORDER BY total DESC`,
        filtroParams
      ),
      pool.query(
        `SELECT status, COUNT(*) AS total FROM rh_funcionarios f WHERE 1 = 1 ${filtroSql} GROUP BY status`,
        filtroParams
      ),
      pool.query(
        `SELECT tipo_contrato, COUNT(*) AS total FROM rh_funcionarios f WHERE 1 = 1 ${filtroSql} GROUP BY tipo_contrato`,
        filtroParams
      ),
      pool.query(
        `SELECT DATE_FORMAT(data_admissao, '%Y-%m') AS chave, COUNT(*) AS total
        FROM rh_funcionarios f WHERE data_admissao >= ? ${filtroSql} GROUP BY chave`,
        [inicioJanela12Meses, ...filtroParams]
      ),
      pool.query(
        `SELECT DATE_FORMAT(data_desligamento, '%Y-%m') AS chave, COUNT(*) AS total
        FROM rh_funcionarios f WHERE data_desligamento >= ? ${filtroSql} GROUP BY chave`,
        [inicioJanela12Meses, ...filtroParams]
      ),
      pool.query(
        `SELECT DATE_FORMAT(r.data_reajuste, '%Y-%m') AS chave, COUNT(*) AS total, AVG(r.percentual_reajuste) AS percentual_medio
        FROM rh_funcionarios_reajustes_salariais r
        JOIN rh_funcionarios f ON f.id = r.funcionario_id
        WHERE r.data_reajuste >= ? ${filtroSql} GROUP BY chave`,
        [inicioJanela12Meses, ...filtroParams]
      ),
      pool.query(
        `SELECT DATE_FORMAT(a.data_inicio, '%Y-%m') AS chave, COUNT(*) AS total, SUM(a.quantidade_dias) AS dias
        FROM rh_funcionarios_atestados a
        JOIN rh_funcionarios f ON f.id = a.funcionario_id
        WHERE a.data_inicio >= ? ${filtroSql} GROUP BY chave`,
        [inicioJanela12Meses, ...filtroParams]
      ),
      pool.query(
        `SELECT
          SUM(t.data_validade IS NULL) AS sem_validade,
          SUM(t.data_validade IS NOT NULL AND t.data_validade < CURDATE()) AS vencido,
          SUM(t.data_validade IS NOT NULL AND t.data_validade BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)) AS proximo_vencimento,
          SUM(t.data_validade IS NOT NULL AND t.data_validade > DATE_ADD(CURDATE(), INTERVAL 60 DAY)) AS valido
        FROM rh_funcionarios_treinamentos t
        JOIN rh_funcionarios f ON f.id = t.funcionario_id
        WHERE 1 = 1 ${filtroSql}`,
        filtroParams
      ),
      pool.query(
        `SELECT fe.status, COUNT(*) AS total
        FROM rh_funcionarios_ferias fe
        JOIN rh_funcionarios f ON f.id = fe.funcionario_id
        WHERE 1 = 1 ${filtroSql} GROUP BY fe.status`,
        filtroParams
      ),
      pool.query(
        `SELECT id, nome_completo, cargo_atual, setor, data_nascimento
        FROM rh_funcionarios f
        WHERE data_nascimento IS NOT NULL AND MONTH(data_nascimento) = MONTH(CURDATE()) ${filtroSql}
        ORDER BY DAY(data_nascimento) ASC`,
        filtroParams
      ),
      pool.query(
        `SELECT id, nome_completo, data_admissao
        FROM rh_funcionarios f
        WHERE status <> 'desligado' ${filtroSql}`,
        filtroParams
      ),
      pool.query(
        `SELECT fe.id, fe.funcionario_id, f.nome_completo, fe.gozo_inicio, fe.gozo_fim, fe.dias_ferias, fe.status
        FROM rh_funcionarios_ferias fe
        JOIN rh_funcionarios f ON f.id = fe.funcionario_id
        WHERE fe.status = 'programada' AND fe.gozo_inicio BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY) ${filtroSql}
        ORDER BY fe.gozo_inicio ASC`,
        filtroParams
      ),
      pool.query(
        `SELECT fe.id, fe.funcionario_id, f.nome_completo, fe.periodo_aquisitivo_inicio, fe.periodo_aquisitivo_fim, fe.status
        FROM rh_funcionarios_ferias fe
        JOIN rh_funcionarios f ON f.id = fe.funcionario_id
        WHERE fe.status NOT IN ('concluida', 'cancelada')
          AND fe.periodo_aquisitivo_fim <= DATE_ADD(CURDATE(), INTERVAL 90 DAY) ${filtroSql}
        ORDER BY fe.periodo_aquisitivo_fim ASC`,
        filtroParams
      ),
      pool.query(
        `SELECT t.id, t.funcionario_id, f.nome_completo, t.nome_treinamento, t.data_validade
        FROM rh_funcionarios_treinamentos t
        JOIN rh_funcionarios f ON f.id = t.funcionario_id
        WHERE t.data_validade IS NOT NULL AND t.data_validade < CURDATE() ${filtroSql}
        ORDER BY t.data_validade ASC LIMIT 20`,
        filtroParams
      ),
      pool.query(
        `SELECT t.id, t.funcionario_id, f.nome_completo, t.nome_treinamento, t.data_validade
        FROM rh_funcionarios_treinamentos t
        JOIN rh_funcionarios f ON f.id = t.funcionario_id
        WHERE t.data_validade BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY) ${filtroSql}
        ORDER BY t.data_validade ASC LIMIT 20`,
        filtroParams
      ),
      pool.query(
        `SELECT a.funcionario_id, f.nome_completo, COUNT(*) AS quantidade, SUM(a.quantidade_dias) AS dias, a.ano
        FROM rh_funcionarios_atestados a
        JOIN rh_funcionarios f ON f.id = a.funcionario_id
        WHERE a.ano = YEAR(CURDATE()) ${filtroSql}
        GROUP BY a.funcionario_id, a.ano
        HAVING quantidade >= 2 OR dias >= 5
        ORDER BY dias DESC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT r.id, r.funcionario_id, f.nome_completo, r.data_reajuste, r.salario_anterior, r.salario_novo,
          r.percentual_reajuste, COALESCE(mr.nome, r.motivo_texto) AS motivo
        FROM rh_funcionarios_reajustes_salariais r
        JOIN rh_funcionarios f ON f.id = r.funcionario_id
        LEFT JOIN rh_funcionarios_motivos_reajuste mr ON mr.id = r.motivo_id
        WHERE r.data_reajuste BETWEEN ? AND ? ${filtroSql}
        ORDER BY r.data_reajuste DESC LIMIT 10`,
        [dataInicio, dataFim, ...filtroParams]
      ),
      pool.query(
        `SELECT COALESCE(setor, 'Sem setor') AS setor, COUNT(*) AS total
        FROM rh_funcionarios f WHERE 1 = 1 ${filtroSql} GROUP BY setor ORDER BY total DESC LIMIT 5`,
        filtroParams
      ),
      pool.query(
        `SELECT t.funcionario_id, f.nome_completo, COUNT(*) AS quantidade
        FROM rh_funcionarios_treinamentos t
        JOIN rh_funcionarios f ON f.id = t.funcionario_id
        WHERE t.data_validade IS NOT NULL AND t.data_validade < CURDATE() ${filtroSql}
        GROUP BY t.funcionario_id ORDER BY quantidade DESC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT id, nome_completo, data_admissao, cargo_atual, setor
        FROM rh_funcionarios f WHERE 1 = 1 ${filtroSql} ORDER BY data_admissao DESC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT id, nome_completo, data_desligamento, motivo_desligamento
        FROM rh_funcionarios f WHERE status = 'desligado' ${filtroSql} ORDER BY data_desligamento DESC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT r.id, r.funcionario_id, f.nome_completo, r.data_reajuste, r.salario_anterior, r.salario_novo, r.percentual_reajuste
        FROM rh_funcionarios_reajustes_salariais r
        JOIN rh_funcionarios f ON f.id = r.funcionario_id
        WHERE 1 = 1 ${filtroSql}
        ORDER BY r.data_reajuste DESC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT id, nome_completo, data_admissao, cargo_atual, setor,
          DATEDIFF(CURDATE(), data_admissao) AS dias_empresa
        FROM rh_funcionarios f WHERE status <> 'desligado' ${filtroSql}
        ORDER BY dias_empresa DESC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT id, nome_completo, data_admissao, cargo_atual, setor,
          DATEDIFF(CURDATE(), data_admissao) AS dias_empresa
        FROM rh_funcionarios f WHERE status <> 'desligado' ${filtroSql}
        ORDER BY dias_empresa ASC LIMIT 10`,
        filtroParams
      ),
      pool.query(
        `SELECT
          SUM(d.status = 'vencido') AS vencidos,
          SUM(d.status = 'proximo_vencimento') AS proximos_vencimento,
          COUNT(DISTINCT CASE WHEN d.status IN ('vencido', 'proximo_vencimento') THEN d.funcionario_id END) AS funcionarios_com_pendencia
        FROM rh_funcionarios_documentos d
        JOIN rh_funcionarios f ON f.id = d.funcionario_id
        WHERE 1 = 1 ${filtroSql}`,
        filtroParams
      ),
      pool.query(
        `SELECT
          SUM(c.status = 'aberto') AS abertos,
          SUM(c.tipo = 'admissao' AND c.status = 'em_andamento') AS admissao_em_andamento,
          SUM(c.tipo = 'desligamento' AND c.status = 'em_andamento') AS desligamento_em_andamento,
          SUM(c.status = 'concluido' AND c.updated_at BETWEEN ? AND ?) AS concluidos_periodo
        FROM rh_funcionarios_checklists c
        JOIN rh_funcionarios f ON f.id = c.funcionario_id
        WHERE 1 = 1 ${filtroSql}`,
        [dataInicio, dataFim, ...filtroParams]
      ),
      pool.query(
        `SELECT id, usuario_nome, entidade, acao, descricao, created_at
        FROM rh_auditoria ORDER BY created_at DESC LIMIT 10`
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM rh_auditoria
        WHERE acao IN ('visualizar_dados_sensiveis', 'exportar_dados_sensiveis')
          AND created_at BETWEEN ? AND ?`,
        [dataInicio, dataFim]
      ),
    ]);

    const aniversariantes = aniversariantesRows[0].map((row) => ({
      ...row,
      idade: calcIdade(row.data_nascimento),
    }));

    const experiencia = [];
    for (const row of experienciaRows[0]) {
      for (const marco of [45, 90]) {
        const dataMarco = new Date(row.data_admissao);
        dataMarco.setDate(dataMarco.getDate() + marco);
        const diff = diasAteOuDesde(dataMarco, hoje);
        if (diff >= 0 && diff <= 15) {
          experiencia.push({
            funcionario_id: row.id,
            nome_completo: row.nome_completo,
            data_admissao: row.data_admissao,
            marco,
            data_prevista: dataMarco.toISOString().slice(0, 10),
            dias_restantes: diff,
          });
        }
      }
    }
    experiencia.sort((a, b) => a.dias_restantes - b.dias_restantes);

    const feriasVencimento = feriasVencimentoRows[0].map((row) => {
      const dias = diasAteOuDesde(row.periodo_aquisitivo_fim, hoje);
      return { ...row, dias, vencido: dias < 0 };
    });

    const treinamentosVencidos = treinamentosVencidosRows[0].map((row) => ({
      ...row,
      dias_vencido: -diasAteOuDesde(row.data_validade, hoje),
    }));
    const treinamentosProximos = treinamentosProximosRows[0].map((row) => ({
      ...row,
      dias_restantes: diasAteOuDesde(row.data_validade, hoje),
    }));

    const isGestor = req.user?.perfil === "gestor";

    res.json({
      success: true,
      data: {
        periodo: { data_inicio: dataInicio, data_fim: dataFim },
        resumo: {
          total: Number(resumoRow.total) || 0,
          ativos: Number(resumoRow.ativos) || 0,
          afastados: Number(resumoRow.afastados) || 0,
          ferias: Number(resumoRow.ferias) || 0,
          desligados: Number(resumoRow.desligados) || 0,
          clt: Number(resumoRow.clt) || 0,
          pj: Number(resumoRow.pj) || 0,
          unimed: Number(resumoRow.unimed) || 0,
          cartao_alimentacao: Number(resumoRow.cartao_alimentacao) || 0,
          admitidos_periodo: Number(resumoRow.admitidos_periodo) || 0,
          desligados_periodo: Number(resumoRow.desligados_periodo) || 0,
          media_anos_empresa: resumoRow.media_dias_empresa ? Number((resumoRow.media_dias_empresa / 365).toFixed(1)) : 0,
          aniversariantes_mes: Number(resumoRow.aniversariantes_mes) || 0,
          ferias_programadas: Number(feriasProgramadasRow.total) || 0,
          treinamentos_vencidos: Number(treinamentosResumoRow.vencidos) || 0,
          treinamentos_proximos_vencimento: Number(treinamentosResumoRow.proximos) || 0,
          atestados_dias_ano: Number(atestadosAnoRow.total_dias) || 0,
          ...(isGestor
            ? {}
            : {
                reajustes_periodo: Number(reajustesPeriodoRow.total) || 0,
                reajustes_percentual_medio: reajustesPeriodoRow.percentual_medio
                  ? Number(Number(reajustesPeriodoRow.percentual_medio).toFixed(2))
                  : 0,
              }),
        },
        documentos: {
          vencidos: Number(documentosResumoRow.vencidos) || 0,
          proximos_vencimento: Number(documentosResumoRow.proximos_vencimento) || 0,
          funcionarios_com_pendencia: Number(documentosResumoRow.funcionarios_com_pendencia) || 0,
        },
        checklists: {
          abertos: Number(checklistsResumoRow.abertos) || 0,
          admissao_em_andamento: Number(checklistsResumoRow.admissao_em_andamento) || 0,
          desligamento_em_andamento: Number(checklistsResumoRow.desligamento_em_andamento) || 0,
          concluidos_periodo: Number(checklistsResumoRow.concluidos_periodo) || 0,
        },
        auditoria: isGestor
          ? null
          : {
              ultimas_acoes: auditoriaRecenteRows[0],
              exportacoes_dados_sensiveis_periodo: Number(auditoriaExportacoesRow.total) || 0,
            },
        distribuicoes: {
          por_setor: porSetorRows[0].map((r) => ({ setor: r.setor, total: Number(r.total) })),
          por_status: porStatusRows[0].map((r) => ({ status: r.status, total: Number(r.total) })),
          clt_pj: cltPjRows[0].map((r) => ({ tipo_contrato: r.tipo_contrato, total: Number(r.total) })),
          treinamentos_status: (() => {
            const row = treinamentosStatusRows[0][0] || {};
            return [
              { status: "valido", total: Number(row.valido) || 0 },
              { status: "vencido", total: Number(row.vencido) || 0 },
              { status: "proximo_vencimento", total: Number(row.proximo_vencimento) || 0 },
              { status: "sem_validade", total: Number(row.sem_validade) || 0 },
            ];
          })(),
          ferias_status: feriasStatusRows[0].map((r) => ({ status: r.status, total: Number(r.total) })),
        },
        series: {
          admissoes_mes: preencherSerieMensal(admissoesRows[0], meses12, ["total"]),
          desligamentos_mes: preencherSerieMensal(desligamentosRows[0], meses12, ["total"]),
          ...(isGestor ? {} : { reajustes_mes: preencherSerieMensal(reajustesMesRows[0], meses12, ["total", "percentual_medio"]) }),
          atestados_mes: preencherSerieMensal(atestadosMesRows[0], meses12, ["total", "dias"]),
        },
        alertas: {
          aniversariantes,
          experiencia_vencendo: experiencia,
          ferias_proximas: feriasProximasRows[0],
          ferias_vencimento: feriasVencimento,
          treinamentos_vencidos: treinamentosVencidos,
          treinamentos_proximos_vencimento: treinamentosProximos,
          atestados_recorrentes: atestadosRecorrentesRows[0],
          ...(isGestor ? {} : { reajustes_recentes: reajustesRecentesRows[0] }),
        },
        rankings: {
          top_setores: topSetoresRows[0].map((r) => ({ setor: r.setor, total: Number(r.total) })),
          top_atestados: atestadosRecorrentesRows[0],
          top_treinamentos_vencidos: topTreinamentosVencidosRows[0],
          ultimos_admitidos: ultimosAdmitidosRows[0],
          ultimos_desligados: ultimosDesligadosRows[0],
          ...(isGestor ? {} : { ultimos_reajustes: ultimosReajustesRows[0] }),
          maior_tempo_empresa: maiorTempoRows[0],
          menor_tempo_empresa: menorTempoRows[0],
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
