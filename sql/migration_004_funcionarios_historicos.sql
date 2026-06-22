-- Etapa 2 do módulo de Funcionários: históricos (salário, cargo, férias, atestados,
-- treinamentos, disciplinar/reconhecimentos) e cadastros auxiliares (motivos/tipos).
-- Execute este arquivo inteiro no banco induscolor_sistema:
-- `mysql -u usuario -p induscolor_sistema < migration_004_funcionarios_historicos.sql`
--
-- Não usa Prisma. CREATE TABLE IF NOT EXISTS em tudo, nada é apagado. Compatível
-- com a tabela rh_funcionarios e rh_usuarios já existentes (foreign keys com
-- ON DELETE CASCADE/SET NULL, sem afetar os dados já cadastrados na Etapa 1).

-- 0) salario_atual em rh_funcionarios (criado apenas se ainda não existir)
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rh_funcionarios' AND COLUMN_NAME = 'salario_atual'
);
SET @sql_add_salario = IF(
  @col_exists = 0,
  'ALTER TABLE rh_funcionarios ADD COLUMN salario_atual DECIMAL(12,2) NULL AFTER horario_trabalho',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_salario;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1) Cadastros auxiliares (motivos/tipos)

CREATE TABLE IF NOT EXISTS rh_funcionarios_motivos_reajuste (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rh_funcionarios_motivos_reajuste (nome)
SELECT nome FROM (
  SELECT 'Mérito' AS nome UNION ALL SELECT 'Promoção' UNION ALL SELECT 'Dissídio' UNION ALL
  SELECT 'Ajuste de mercado' UNION ALL SELECT 'Mudança de função' UNION ALL SELECT 'Efetivação' UNION ALL
  SELECT 'Correção salarial' UNION ALL SELECT 'Acordo individual' UNION ALL SELECT 'Outro'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM rh_funcionarios_motivos_reajuste WHERE rh_funcionarios_motivos_reajuste.nome = seed.nome);

CREATE TABLE IF NOT EXISTS rh_funcionarios_motivos_cargo (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rh_funcionarios_motivos_cargo (nome)
SELECT nome FROM (
  SELECT 'Promoção' AS nome UNION ALL SELECT 'Transferência de setor' UNION ALL SELECT 'Reestruturação interna' UNION ALL
  SELECT 'Mudança de função' UNION ALL SELECT 'Adequação operacional' UNION ALL SELECT 'Substituição' UNION ALL SELECT 'Outro'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM rh_funcionarios_motivos_cargo WHERE rh_funcionarios_motivos_cargo.nome = seed.nome);

CREATE TABLE IF NOT EXISTS rh_funcionarios_tipos_treinamento (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rh_funcionarios_tipos_treinamento (nome)
SELECT nome FROM (
  SELECT 'NR-06' AS nome UNION ALL SELECT 'NR-10' UNION ALL SELECT 'NR-12' UNION ALL SELECT 'NR-18' UNION ALL
  SELECT 'NR-33' UNION ALL SELECT 'NR-35' UNION ALL SELECT 'Brigada de Incêndio' UNION ALL
  SELECT 'Integração' UNION ALL SELECT 'Qualidade' UNION ALL SELECT 'Segurança do Trabalho' UNION ALL SELECT 'Outro'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM rh_funcionarios_tipos_treinamento WHERE rh_funcionarios_tipos_treinamento.nome = seed.nome);

CREATE TABLE IF NOT EXISTS rh_funcionarios_tipos_disciplinar (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(255) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rh_funcionarios_tipos_disciplinar (nome)
SELECT nome FROM (
  SELECT 'Advertência verbal' AS nome UNION ALL SELECT 'Advertência escrita' UNION ALL SELECT 'Suspensão' UNION ALL
  SELECT 'Elogio formal' UNION ALL SELECT 'Reconhecimento' UNION ALL SELECT 'Ocorrência interna' UNION ALL SELECT 'Outro'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM rh_funcionarios_tipos_disciplinar WHERE rh_funcionarios_tipos_disciplinar.nome = seed.nome);

-- 2) Histórico salarial

CREATE TABLE IF NOT EXISTS rh_funcionarios_reajustes_salariais (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  data_reajuste DATE NOT NULL,
  salario_anterior DECIMAL(12,2) NULL,
  salario_novo DECIMAL(12,2) NOT NULL,
  percentual_reajuste DECIMAL(8,2) NULL,
  motivo_id INT NULL,
  motivo_texto VARCHAR(150) NULL,
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_reajustes_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_reajustes_motivo FOREIGN KEY (motivo_id) REFERENCES rh_funcionarios_motivos_reajuste(id) ON DELETE SET NULL,
  CONSTRAINT fk_rh_reajustes_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_rh_reajustes_funcionario ON rh_funcionarios_reajustes_salariais (funcionario_id);
CREATE INDEX idx_rh_reajustes_data ON rh_funcionarios_reajustes_salariais (data_reajuste);
CREATE INDEX idx_rh_reajustes_motivo ON rh_funcionarios_reajustes_salariais (motivo_id);

-- 3) Histórico de alterações de cargo

CREATE TABLE IF NOT EXISTS rh_funcionarios_alteracoes_cargo (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  data_alteracao DATE NOT NULL,
  cargo_anterior VARCHAR(150) NULL,
  cargo_novo VARCHAR(150) NOT NULL,
  setor_anterior VARCHAR(120) NULL,
  setor_novo VARCHAR(120) NULL,
  motivo_id INT NULL,
  motivo_texto VARCHAR(150) NULL,
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_cargos_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_cargos_motivo FOREIGN KEY (motivo_id) REFERENCES rh_funcionarios_motivos_cargo(id) ON DELETE SET NULL,
  CONSTRAINT fk_rh_cargos_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_rh_cargos_funcionario ON rh_funcionarios_alteracoes_cargo (funcionario_id);
CREATE INDEX idx_rh_cargos_data ON rh_funcionarios_alteracoes_cargo (data_alteracao);
CREATE INDEX idx_rh_cargos_motivo ON rh_funcionarios_alteracoes_cargo (motivo_id);

-- 4) Férias

CREATE TABLE IF NOT EXISTS rh_funcionarios_ferias (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  periodo_aquisitivo_inicio DATE NOT NULL,
  periodo_aquisitivo_fim DATE NOT NULL,
  gozo_inicio DATE NULL,
  gozo_fim DATE NULL,
  dias_ferias INT NULL,
  abono_inicio DATE NULL,
  abono_fim DATE NULL,
  dias_abono INT NULL,
  status ENUM('programada', 'em_andamento', 'concluida', 'cancelada') NOT NULL DEFAULT 'programada',
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_ferias_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_ferias_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_rh_ferias_funcionario ON rh_funcionarios_ferias (funcionario_id);
CREATE INDEX idx_rh_ferias_periodo_inicio ON rh_funcionarios_ferias (periodo_aquisitivo_inicio);
CREATE INDEX idx_rh_ferias_periodo_fim ON rh_funcionarios_ferias (periodo_aquisitivo_fim);
CREATE INDEX idx_rh_ferias_gozo_inicio ON rh_funcionarios_ferias (gozo_inicio);
CREATE INDEX idx_rh_ferias_status ON rh_funcionarios_ferias (status);

-- 5) Atestados

CREATE TABLE IF NOT EXISTS rh_funcionarios_atestados (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  ano INT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NULL,
  quantidade_dias INT NOT NULL DEFAULT 1,
  tipo VARCHAR(120) NULL,
  cid VARCHAR(30) NULL,
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_atestados_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_atestados_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_rh_atestados_funcionario ON rh_funcionarios_atestados (funcionario_id);
CREATE INDEX idx_rh_atestados_ano ON rh_funcionarios_atestados (ano);
CREATE INDEX idx_rh_atestados_data_inicio ON rh_funcionarios_atestados (data_inicio);

-- 6) Treinamentos

CREATE TABLE IF NOT EXISTS rh_funcionarios_treinamentos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  tipo_id INT NULL,
  nome_treinamento VARCHAR(180) NOT NULL,
  categoria VARCHAR(80) NULL,
  instituicao_instrutor VARCHAR(180) NULL,
  data_realizacao DATE NOT NULL,
  data_validade DATE NULL,
  carga_horaria DECIMAL(6,2) NULL,
  status ENUM('valido', 'vencido', 'proximo_vencimento', 'sem_validade') NOT NULL DEFAULT 'valido',
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_treinamentos_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_treinamentos_tipo FOREIGN KEY (tipo_id) REFERENCES rh_funcionarios_tipos_treinamento(id) ON DELETE SET NULL,
  CONSTRAINT fk_rh_treinamentos_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_rh_treinamentos_funcionario ON rh_funcionarios_treinamentos (funcionario_id);
CREATE INDEX idx_rh_treinamentos_tipo ON rh_funcionarios_treinamentos (tipo_id);
CREATE INDEX idx_rh_treinamentos_data_realizacao ON rh_funcionarios_treinamentos (data_realizacao);
CREATE INDEX idx_rh_treinamentos_data_validade ON rh_funcionarios_treinamentos (data_validade);
CREATE INDEX idx_rh_treinamentos_status ON rh_funcionarios_treinamentos (status);

-- 7) Histórico disciplinar e reconhecimentos

CREATE TABLE IF NOT EXISTS rh_funcionarios_historico_disciplinar (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  tipo_id INT NULL,
  data_registro DATE NOT NULL,
  tipo VARCHAR(120) NULL,
  motivo VARCHAR(180) NULL,
  descricao MEDIUMTEXT NULL,
  medida_tomada MEDIUMTEXT NULL,
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_disciplinar_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_disciplinar_tipo FOREIGN KEY (tipo_id) REFERENCES rh_funcionarios_tipos_disciplinar(id) ON DELETE SET NULL,
  CONSTRAINT fk_rh_disciplinar_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_rh_disciplinar_funcionario ON rh_funcionarios_historico_disciplinar (funcionario_id);
CREATE INDEX idx_rh_disciplinar_tipo ON rh_funcionarios_historico_disciplinar (tipo_id);
CREATE INDEX idx_rh_disciplinar_data ON rh_funcionarios_historico_disciplinar (data_registro);
