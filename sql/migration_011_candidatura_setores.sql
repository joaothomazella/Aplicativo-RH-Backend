-- Migration 011: destina uma candidatura a um ou mais setores.
--
-- O Kanban passa a ter um quadro por setor (Producao, Laboratorio,
-- Administrativo, ...) alem do quadro Geral. O Geral e a caixa de entrada: so
-- mostra quem ainda nao foi destinado a nenhum setor, e vai ate a etapa de
-- entrevista. Ao destinar, o card sai do Geral e aparece no quadro de cada
-- setor escolhido.
--
-- A lista de setores e a mesma do modulo de Funcionarios
-- (rh_funcionarios_setores, cadastrada em Funcionarios > Configuracoes), para a
-- empresa nao manter duas listas que podem divergir.
--
-- NAO e executada automaticamente. Rode uma vez:
--   node src/scripts/migrar-candidatura-setores.js
-- ou, direto no MySQL:
--   mysql -u usuario -p induscolor_sistema < sql/migration_011_candidatura_setores.sql

CREATE TABLE IF NOT EXISTS rh_candidatura_setores (
  candidatura_id INT NOT NULL,
  setor_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (candidatura_id, setor_id),
  KEY idx_rh_candidatura_setores_setor (setor_id),
  CONSTRAINT fk_rh_candidatura_setores_candidatura
    FOREIGN KEY (candidatura_id) REFERENCES rh_candidaturas (id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_candidatura_setores_setor
    FOREIGN KEY (setor_id) REFERENCES rh_funcionarios_setores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
