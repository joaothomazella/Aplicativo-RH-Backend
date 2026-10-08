-- Adiciona a etapa "nao_compareceu" ao enum de rh_candidaturas.etapa.
--
-- Coluna do Kanban "Aprovado na triagem, nao compareceu": o candidato passou na
-- triagem mas faltou a entrevista. Antes isso so podia ser registrado como
-- reprovacao, o que misturava quem foi avaliado e recusado com quem nem apareceu.
--
-- NAO e executada automaticamente. Rode uma vez:
--   node src/scripts/migrar-etapa-nao-compareceu.js
-- ou, direto no MySQL:
--   mysql -u usuario -p induscolor_sistema < sql/migration_010_etapa_nao_compareceu.sql
--
-- O app so consegue mover cards para essa etapa depois que a migration rodar;
-- ate la o banco recusa o valor.

ALTER TABLE rh_candidaturas
  MODIFY etapa ENUM(
    'novo_curriculo',
    'triagem',
    'entrevista',
    'nao_compareceu',
    'teste',
    'aprovado',
    'reprovado',
    'banco_talentos'
  ) DEFAULT 'novo_curriculo';
