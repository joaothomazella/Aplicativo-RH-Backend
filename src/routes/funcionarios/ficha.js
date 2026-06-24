const express = require("express");
const pool = require("../../db/pool");
const { registrarAuditoria } = require("../../utils/auditoria");

const router = express.Router({ mergeParams: true });

router.get("/:id/ficha", async (req, res, next) => {
  try {
    const { id } = req.params;
    const sensiveisSolicitado = req.query.sensiveis === "true";
    const podeVerSensiveis = ["admin", "rh", "dp"].includes(req.user?.perfil);
    const incluirSensiveis = sensiveisSolicitado && podeVerSensiveis;

    if (sensiveisSolicitado && !incluirSensiveis) {
      return res.status(403).json({ success: false, error: "Você não tem permissão para acessar dados sensíveis." });
    }

    const [[funcionario]] = await pool.query("SELECT * FROM rh_funcionarios WHERE id = ?", [id]);
    if (!funcionario) {
      return res.status(404).json({ success: false, error: "Funcionário não encontrado." });
    }

    const [[ultimoReajuste]] = await pool.query(
      `SELECT data_reajuste, salario_anterior, salario_novo, percentual_reajuste
      FROM rh_funcionarios_reajustes_salariais WHERE funcionario_id = ? ORDER BY data_reajuste DESC LIMIT 1`,
      [id]
    );
    const [[ultimaAlteracaoCargo]] = await pool.query(
      `SELECT data_alteracao, cargo_anterior, cargo_novo, setor_anterior, setor_novo
      FROM rh_funcionarios_alteracoes_cargo WHERE funcionario_id = ? ORDER BY data_alteracao DESC LIMIT 1`,
      [id]
    );
    const [proximasFerias] = await pool.query(
      `SELECT periodo_aquisitivo_inicio, periodo_aquisitivo_fim, gozo_inicio, gozo_fim, dias_ferias, status
      FROM rh_funcionarios_ferias WHERE funcionario_id = ? AND status IN ('programada', 'em_andamento')
      ORDER BY gozo_inicio ASC LIMIT 5`,
      [id]
    );
    const [[treinamentosVencidosRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM rh_funcionarios_treinamentos
      WHERE funcionario_id = ? AND data_validade IS NOT NULL AND data_validade < CURDATE()`,
      [id]
    );
    const [[atestadosAnoRow]] = await pool.query(
      `SELECT COUNT(*) AS quantidade, SUM(quantidade_dias) AS dias
      FROM rh_funcionarios_atestados WHERE funcionario_id = ? AND ano = YEAR(CURDATE())`,
      [id]
    );

    const dadosPessoais = {
      nome_completo: funcionario.nome_completo,
      data_nascimento: funcionario.data_nascimento,
      estado_civil: funcionario.estado_civil,
      telefone: funcionario.telefone,
      email: funcionario.email,
      endereco: funcionario.endereco,
      bairro: funcionario.bairro,
      contato_emergencia_nome: funcionario.contato_emergencia_nome,
      contato_emergencia_parentesco: funcionario.contato_emergencia_parentesco,
      telefone_emergencia: funcionario.telefone_emergencia,
      ...(incluirSensiveis
        ? {
            cpf: funcionario.cpf,
            rg: funcionario.rg,
            pis: funcionario.pis,
            titulo_eleitor: funcionario.titulo_eleitor,
          }
        : {}),
    };

    const dadosProfissionais = {
      setor: funcionario.setor,
      cargo_atual: funcionario.cargo_atual,
      data_admissao: funcionario.data_admissao,
      data_desligamento: funcionario.data_desligamento,
      status: funcionario.status,
      tipo_contrato: funcionario.tipo_contrato,
      jornada_trabalho: funcionario.jornada_trabalho,
      horario_trabalho: funcionario.horario_trabalho,
      centro_custo: funcionario.centro_custo,
      escolaridade: funcionario.escolaridade,
    };

    const beneficios = {
      convenio_unimed: Boolean(funcionario.convenio_unimed),
      cartao_alimentacao: Boolean(funcionario.cartao_alimentacao),
      ...(podeVerSensiveis ? { salario_atual: funcionario.salario_atual } : {}),
    };

    if (incluirSensiveis) {
      await registrarAuditoria({
        req,
        entidade: "funcionario_ficha",
        entidadeId: id,
        acao: "visualizar_dados_sensiveis",
        descricao: `Dados sensíveis da ficha do funcionário "${funcionario.nome_completo}" visualizados.`,
      });
    }

    res.json({
      success: true,
      data: {
        dados_pessoais: dadosPessoais,
        dados_profissionais: dadosProfissionais,
        beneficios,
        historico_resumido: {
          ultimo_reajuste: podeVerSensiveis ? ultimoReajuste || null : null,
          ultima_alteracao_cargo: ultimaAlteracaoCargo || null,
          proximas_ferias: proximasFerias,
          treinamentos_vencidos: Number(treinamentosVencidosRow.total) || 0,
          atestados_ano: {
            quantidade: Number(atestadosAnoRow.quantidade) || 0,
            dias: Number(atestadosAnoRow.dias) || 0,
          },
        },
        observacoes: funcionario.observacoes,
        inclui_documentos_sensiveis: incluirSensiveis,
        inclui_dados_salariais: podeVerSensiveis,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
