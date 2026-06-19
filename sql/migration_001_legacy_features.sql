-- Migração para trazer ao MySQL (induscolor_sistema) tudo que hoje só existe no
-- Prisma/SQLite legado (/rh/candidatos, /rh/candidatos/[id], /rh/candidatos/novo,
-- /rh/candidatos/[id]/editar, /rh/agenda, /rh/talent-pool, /rh/reports), sem perder
-- nenhuma função: edição de candidato, prioridade/responsável, agenda com data/hora,
-- avaliação por critérios, pontos fortes/atenção, datas de aprovação/reprovação.
--
-- Execute este arquivo inteiro de uma vez (ex: via MySQL Workbench, DBeaver, ou
-- `mysql -u usuario -p induscolor_sistema < migration_001_legacy_features.sql`).
-- Todas as colunas novas são NULL/DEFAULT, então não quebra nada que já existe.

-- 1) rh_candidaturas: prioridade, responsável, pontos fortes/atenção, datas de decisão
ALTER TABLE rh_candidaturas
  ADD COLUMN prioridade ENUM('baixa','media','alta') DEFAULT 'media' AFTER etapa,
  ADD COLUMN responsavel_rh VARCHAR(150) NULL AFTER prioridade,
  ADD COLUMN pontos_fortes MEDIUMTEXT NULL,
  ADD COLUMN pontos_atencao MEDIUMTEXT NULL,
  ADD COLUMN ultimo_contato DATETIME NULL,
  ADD COLUMN data_aprovacao DATETIME NULL,
  ADD COLUMN data_reprovacao DATETIME NULL;

-- 2) rh_entrevistas: campos detalhados de entrevista (hoje só existe parecer genérico)
ALTER TABLE rh_entrevistas
  ADD COLUMN link_reuniao VARCHAR(255) NULL,
  ADD COLUMN impressao_geral MEDIUMTEXT NULL,
  ADD COLUMN pontos_positivos MEDIUMTEXT NULL,
  ADD COLUMN pontos_negativos MEDIUMTEXT NULL,
  ADD COLUMN perfil_comportamental VARCHAR(150) NULL,
  ADD COLUMN comunicacao VARCHAR(150) NULL,
  ADD COLUMN postura VARCHAR(150) NULL,
  ADD COLUMN experiencia_tecnica VARCHAR(150) NULL,
  ADD COLUMN compatibilidade_vaga VARCHAR(150) NULL,
  ADD COLUMN nivel_interesse VARCHAR(150) NULL,
  ADD COLUMN disponibilidade_entrevista VARCHAR(150) NULL,
  ADD COLUMN resultado_preliminar VARCHAR(150) NULL;

-- 3) Avaliações por critério (substitui o model Evaluation do Prisma)
CREATE TABLE IF NOT EXISTS rh_avaliacoes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  candidatura_id INT NOT NULL,
  nota_comunicacao DECIMAL(4,2) DEFAULT 0,
  nota_experiencia DECIMAL(4,2) DEFAULT 0,
  nota_tecnica DECIMAL(4,2) DEFAULT 0,
  nota_postura DECIMAL(4,2) DEFAULT 0,
  nota_comportamental DECIMAL(4,2) DEFAULT 0,
  nota_pontualidade DECIMAL(4,2) DEFAULT 0,
  nota_compatibilidade DECIMAL(4,2) DEFAULT 0,
  nota_interesse DECIMAL(4,2) DEFAULT 0,
  nota_estabilidade DECIMAL(4,2) DEFAULT 0,
  nota_potencial DECIMAL(4,2) DEFAULT 0,
  media DECIMAL(4,2) DEFAULT 0,
  classificacao VARCHAR(50) NULL,
  parecer_final MEDIUMTEXT NULL,
  recomendacao MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_avaliacoes_candidatura FOREIGN KEY (candidatura_id)
    REFERENCES rh_candidaturas(id) ON DELETE CASCADE
);

-- Observação importante sobre etapas:
-- O fluxo antigo (Prisma) tinha 7 etapas: novo_curriculo, triagem, entrevista_agendada,
-- entrevistado, aprovado, reprovado, banco_talentos.
-- O fluxo atual no MySQL (já usado pelo Kanban/Vagas em produção) também tem 7,
-- mas com nomes diferentes no meio: novo_curriculo, triagem, entrevista, teste,
-- aprovado, reprovado, banco_talentos.
-- Para não duplicar taxonomias e não exigir alterar o ENUM `etapa`, o app vai
-- unificar tudo no fluxo que já está em produção (entrevista/teste). Nenhuma
-- coluna nova é necessária para isso.
