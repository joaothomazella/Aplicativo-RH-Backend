-- Etapa 4 do módulo de Funcionários: documentos/anexos, auditoria de alterações
-- e checklists de admissão/desligamento.
-- Execute este arquivo inteiro no banco induscolor_sistema:
-- `mysql -u usuario -p induscolor_sistema < migration_005_funcionarios_documentos_auditoria.sql`
--
-- Não usa Prisma. CREATE TABLE IF NOT EXISTS em tudo, nada é apagado ou alterado.
-- Compatível com rh_funcionarios e rh_usuarios já existentes (foreign keys com
-- ON DELETE CASCADE/SET NULL). Índices criados dentro do CREATE TABLE para que
-- o script possa ser executado novamente sem erro de índice duplicado.

-- 1) Documentos/anexos do funcionário

CREATE TABLE IF NOT EXISTS rh_funcionarios_documentos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  tipo VARCHAR(120) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  descricao MEDIUMTEXT NULL,
  data_documento DATE NULL,
  data_validade DATE NULL,
  status ENUM('valido','vencido','proximo_vencimento','arquivado') NOT NULL DEFAULT 'valido',
  arquivo_nome VARCHAR(255) NULL,
  arquivo_url VARCHAR(500) NULL,
  arquivo_tipo VARCHAR(120) NULL,
  arquivo_tamanho INT NULL,
  observacoes MEDIUMTEXT NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_documentos_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_documentos_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL,
  INDEX idx_rh_documentos_funcionario (funcionario_id),
  INDEX idx_rh_documentos_tipo (tipo),
  INDEX idx_rh_documentos_status (status),
  INDEX idx_rh_documentos_validade (data_validade)
);

-- 2) Auditoria de alterações importantes

CREATE TABLE IF NOT EXISTS rh_auditoria (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NULL,
  usuario_nome VARCHAR(150) NULL,
  entidade VARCHAR(120) NOT NULL,
  entidade_id INT NULL,
  acao VARCHAR(80) NOT NULL,
  descricao VARCHAR(255) NULL,
  dados_antes JSON NULL,
  dados_depois JSON NULL,
  ip VARCHAR(80) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_auditoria_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL,
  INDEX idx_rh_auditoria_usuario (usuario_id),
  INDEX idx_rh_auditoria_entidade (entidade, entidade_id),
  INDEX idx_rh_auditoria_acao (acao),
  INDEX idx_rh_auditoria_created_at (created_at)
);

-- 3) Checklists de admissão/desligamento

CREATE TABLE IF NOT EXISTS rh_funcionarios_checklists (
  id INT PRIMARY KEY AUTO_INCREMENT,
  funcionario_id INT NOT NULL,
  tipo ENUM('admissao','desligamento','outro') NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  status ENUM('aberto','em_andamento','concluido','cancelado') NOT NULL DEFAULT 'aberto',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_checklists_funcionario FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  INDEX idx_rh_checklists_funcionario (funcionario_id),
  INDEX idx_rh_checklists_tipo (tipo),
  INDEX idx_rh_checklists_status (status)
);

CREATE TABLE IF NOT EXISTS rh_funcionarios_checklist_itens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  checklist_id INT NOT NULL,
  descricao VARCHAR(255) NOT NULL,
  obrigatorio TINYINT(1) NOT NULL DEFAULT 0,
  concluido TINYINT(1) NOT NULL DEFAULT 0,
  concluido_em DATETIME NULL,
  concluido_por INT NULL,
  observacoes MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rh_checklist_itens_checklist FOREIGN KEY (checklist_id) REFERENCES rh_funcionarios_checklists(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_checklist_itens_usuario FOREIGN KEY (concluido_por) REFERENCES rh_usuarios(id) ON DELETE SET NULL,
  INDEX idx_rh_checklist_itens_checklist (checklist_id)
);
