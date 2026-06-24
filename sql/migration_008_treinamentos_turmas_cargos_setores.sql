-- Migration 008: Treinamentos em turma + cadastros auxiliares de Cargos e Setores
--
-- ATENÇÃO: Esta migration NÃO deve ser executada automaticamente.
-- Rodar manualmente em ambiente controlado, com backup do banco antes.
--
-- Não apaga dados existentes. Não altera o tipo das colunas
-- rh_funcionarios.setor / rh_funcionarios.cargo_atual / rh_funcionarios_alteracoes_cargo.setor_novo / cargo_novo,
-- que continuam VARCHAR (texto livre) por compatibilidade. As novas tabelas
-- rh_funcionarios_setores / rh_funcionarios_cargos servem apenas como origem
-- das opções exibidas nos selects do frontend.

START TRANSACTION;

-- 1. Cadastro auxiliar de Setores (lista suspensa, mesmo padrão de Motivo)
CREATE TABLE IF NOT EXISTS rh_funcionarios_setores (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rh_funcionarios_setores_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Cadastro auxiliar de Cargos (lista suspensa, mesmo padrão de Motivo)
CREATE TABLE IF NOT EXISTS rh_funcionarios_cargos (
  id INT NOT NULL AUTO_INCREMENT,
  nome VARCHAR(150) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rh_funcionarios_cargos_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Seed de Setores (ignora se já existir, não duplica)
INSERT INTO rh_funcionarios_setores (nome, ativo) VALUES
  ('Produção', 1),
  ('Laboratório', 1),
  ('Colorística', 1),
  ('Envase', 1),
  ('Expedição', 1),
  ('Administrativo', 1),
  ('Financeiro', 1),
  ('Comercial', 1),
  ('RH', 1),
  ('Departamento Pessoal', 1),
  ('Qualidade', 1),
  ('PCP', 1),
  ('Compras', 1),
  ('Manutenção', 1),
  ('Diretoria', 1),
  ('Outro', 1)
ON DUPLICATE KEY UPDATE nome = nome;

-- 4. Seed de Cargos (ignora se já existir, não duplica)
INSERT INTO rh_funcionarios_cargos (nome, ativo) VALUES
  ('Auxiliar de Produção', 1),
  ('Operador de Produção', 1),
  ('Supervisor de Produção', 1),
  ('Encarregado', 1),
  ('Auxiliar de Laboratório', 1),
  ('Técnico de Laboratório', 1),
  ('Colorista', 1),
  ('Analista de Qualidade', 1),
  ('Auxiliar Administrativo', 1),
  ('Assistente Administrativo', 1),
  ('Analista Administrativo', 1),
  ('Auxiliar de RH', 1),
  ('Assistente de RH', 1),
  ('Analista de RH', 1),
  ('Auxiliar de Expedição', 1),
  ('Motorista', 1),
  ('Representante Comercial', 1),
  ('Gerente', 1),
  ('Diretor', 1),
  ('Outro', 1)
ON DUPLICATE KEY UPDATE nome = nome;

-- 5. Turmas de treinamento (cadastro de treinamento em grupo)
CREATE TABLE IF NOT EXISTS rh_treinamentos_turmas (
  id INT NOT NULL AUTO_INCREMENT,
  nome_treinamento VARCHAR(180) NOT NULL,
  tipo_id INT NULL,
  categoria VARCHAR(80) NULL,
  instituicao_instrutor VARCHAR(180) NULL,
  data_realizacao DATE NOT NULL,
  data_validade DATE NULL,
  carga_horaria DECIMAL(6,2) NULL,
  status ENUM('valido','vencido','proximo_vencimento','sem_validade') NOT NULL DEFAULT 'valido',
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rh_treinamentos_turmas_tipo (tipo_id),
  CONSTRAINT fk_rh_treinamentos_turmas_tipo
    FOREIGN KEY (tipo_id) REFERENCES rh_funcionarios_tipos_treinamento(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FK opcional para rh_usuarios, só criada se a tabela existir
SET @fk_usuarios_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rh_usuarios'
);

SET @fk_usuarios_turmas_sql = IF(
  @fk_usuarios_exists > 0,
  'ALTER TABLE rh_treinamentos_turmas ADD CONSTRAINT fk_rh_treinamentos_turmas_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk_usuarios_turmas FROM @fk_usuarios_turmas_sql;
EXECUTE stmt_fk_usuarios_turmas;
DEALLOCATE PREPARE stmt_fk_usuarios_turmas;

-- 6. Participantes da turma (vincula funcionário + registro individual de treinamento)
CREATE TABLE IF NOT EXISTS rh_treinamentos_turma_participantes (
  id INT NOT NULL AUTO_INCREMENT,
  turma_id INT NOT NULL,
  funcionario_id INT NOT NULL,
  treinamento_funcionario_id INT NULL,
  status_participacao ENUM('participou','ausente','cancelado') NOT NULL DEFAULT 'participou',
  observacoes MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rh_turma_participantes_turma_funcionario (turma_id, funcionario_id),
  KEY idx_rh_turma_participantes_funcionario (funcionario_id),
  KEY idx_rh_turma_participantes_treinamento (treinamento_funcionario_id),
  CONSTRAINT fk_rh_turma_participantes_turma
    FOREIGN KEY (turma_id) REFERENCES rh_treinamentos_turmas(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_turma_participantes_funcionario
    FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_turma_participantes_treinamento
    FOREIGN KEY (treinamento_funcionario_id) REFERENCES rh_funcionarios_treinamentos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Liga o histórico individual de treinamento à turma de origem (coluna opcional)
SET @turma_id_col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rh_funcionarios_treinamentos'
    AND COLUMN_NAME = 'turma_id'
);

SET @add_turma_id_sql = IF(
  @turma_id_col_exists = 0,
  'ALTER TABLE rh_funcionarios_treinamentos ADD COLUMN turma_id INT NULL AFTER funcionario_id',
  'SELECT 1'
);
PREPARE stmt_add_turma_id FROM @add_turma_id_sql;
EXECUTE stmt_add_turma_id;
DEALLOCATE PREPARE stmt_add_turma_id;

SET @fk_turma_id_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rh_funcionarios_treinamentos'
    AND CONSTRAINT_NAME = 'fk_rh_funcionarios_treinamentos_turma'
);

SET @add_fk_turma_id_sql = IF(
  @fk_turma_id_exists = 0,
  'ALTER TABLE rh_funcionarios_treinamentos ADD CONSTRAINT fk_rh_funcionarios_treinamentos_turma FOREIGN KEY (turma_id) REFERENCES rh_treinamentos_turmas(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_add_fk_turma_id FROM @add_fk_turma_id_sql;
EXECUTE stmt_add_fk_turma_id;
DEALLOCATE PREPARE stmt_add_fk_turma_id;

COMMIT;
