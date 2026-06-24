-- Migration 009: Certificados de treinamento por turma
--
-- ATENÇÃO: Esta migration NÃO deve ser executada automaticamente.
-- Rodar manualmente em ambiente controlado, com backup do banco antes.
--
-- Não apaga dados existentes. Cria apenas a nova tabela rh_certificados_treinamentos,
-- que guarda um "snapshot" dos dados da turma/funcionário no momento da emissão
-- (nome, treinamento, carga horária, datas) para que o certificado já emitido não
-- mude de conteúdo caso a turma seja editada depois.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS rh_certificados_treinamentos (
  id INT NOT NULL AUTO_INCREMENT,
  turma_id INT NOT NULL,
  funcionario_id INT NOT NULL,
  participante_id INT NOT NULL,
  codigo VARCHAR(40) NOT NULL,
  nome_funcionario_snapshot VARCHAR(180) NOT NULL,
  nome_treinamento_snapshot VARCHAR(180) NOT NULL,
  instituicao_instrutor_snapshot VARCHAR(180) NULL,
  carga_horaria_snapshot DECIMAL(6,2) NULL,
  data_realizacao_snapshot DATE NOT NULL,
  data_emissao DATE NOT NULL,
  baixado_em DATETIME NULL,
  usuario_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rh_certificados_turma_funcionario (turma_id, funcionario_id),
  UNIQUE KEY uq_rh_certificados_codigo (codigo),
  KEY idx_rh_certificados_funcionario (funcionario_id),
  KEY idx_rh_certificados_participante (participante_id),
  CONSTRAINT fk_rh_certificados_turma
    FOREIGN KEY (turma_id) REFERENCES rh_treinamentos_turmas(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_certificados_funcionario
    FOREIGN KEY (funcionario_id) REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_certificados_participante
    FOREIGN KEY (participante_id) REFERENCES rh_treinamentos_turma_participantes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FK opcional para rh_usuarios, só criada se a tabela existir (mesmo padrão da migration 008)
SET @fk_usuarios_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rh_usuarios'
);

SET @fk_usuarios_certificados_sql = IF(
  @fk_usuarios_exists > 0,
  'ALTER TABLE rh_certificados_treinamentos ADD CONSTRAINT fk_rh_certificados_usuario FOREIGN KEY (usuario_id) REFERENCES rh_usuarios(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk_usuarios_certificados FROM @fk_usuarios_certificados_sql;
EXECUTE stmt_fk_usuarios_certificados;
DEALLOCATE PREPARE stmt_fk_usuarios_certificados;

COMMIT;
