-- Etapa: correção de encoding/acentuação (ex.: "Produ��o" em vez de "Produção").
--
-- O que este arquivo FAZ:
--   - Garante que o charset/collation default do banco seja utf8mb4/utf8mb4_unicode_ci.
--   - Converte (CONVERT TO CHARACTER SET) as tabelas do módulo de RH/Funcionários e
--     do módulo de Recrutamento (candidatos/vagas/entrevistas/avaliações) para
--     utf8mb4 COLLATE utf8mb4_unicode_ci.
--
-- O que este arquivo NÃO FAZ:
--   - Não apaga dados.
--   - Não recria tabelas (usa ALTER TABLE ... CONVERT TO, que reescreve apenas a
--     codificação das colunas de texto, preservando linhas e índices).
--   - Não remove nem recria foreign keys.
--   - Não corrige valores já corrompidos (isso é feito, linha a linha e sob
--     conferência manual, no arquivo migration_006_fix_dados_corrompidos.sql).
--
-- Importante sobre a causa raiz: CONVERT TO CHARACTER SET resolve casos em que a
-- coluna foi declarada com um charset diferente de utf8mb4 (ex.: latin1) e por
-- isso trunca/perde acentos a cada novo INSERT/UPDATE. Ele NÃO desfaz corrupção
-- que já está gravada nos bytes de linhas antigas (para isso, ver o arquivo de
-- correções pontuais). Mesmo que a tabela já esteja em utf8mb4, é seguro rodar
-- este script de novo — ele é idempotente.
--
-- Como executar:
--   mysql -u <usuario> -p induscolor_sistema < migration_006_charset_utf8mb4.sql

-- 1) Default do banco (afeta apenas tabelas novas criadas a partir de agora)
ALTER DATABASE induscolor_sistema CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) Módulo de Funcionários (Etapas 1-4)
ALTER TABLE rh_funcionarios
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_motivos_reajuste
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_motivos_cargo
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_tipos_treinamento
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_tipos_disciplinar
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_reajustes_salariais
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_alteracoes_cargo
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_ferias
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_atestados
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_treinamentos
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_historico_disciplinar
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_documentos
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_checklists
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_funcionarios_checklist_itens
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_auditoria
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) Usuários do painel (nomes podem ter acentos; senha_hash não é afetado por
--    CONVERT TO pois é tratado como dado binário/hash, não texto acentuado)
ALTER TABLE rh_usuarios
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) Módulo de Recrutamento (candidatos, vagas, entrevistas, avaliações, histórico)
ALTER TABLE rh_vagas
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_candidatos
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_candidaturas
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_entrevistas
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_avaliacoes
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE rh_historico
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
