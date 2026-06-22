-- Etapa 1 do módulo de Funcionários (cadastro/gestão de colaboradores da Induscolor).
-- Execute este arquivo inteiro no banco induscolor_sistema antes de fazer deploy
-- do backend com as rotas /api/rh/funcionarios:
-- `mysql -u usuario -p induscolor_sistema < migration_003_funcionarios_base.sql`
--
-- Não usa Prisma nem ORM: tabela única, acessada via mysql2/promise (pool.query).
-- CPF é UNIQUE e aceita NULL: no MySQL (InnoDB), múltiplos valores NULL em uma
-- coluna UNIQUE não violam a restrição (cada NULL é considerado distinto), então
-- vários funcionários sem CPF cadastrado podem coexistir sem erro.

CREATE TABLE IF NOT EXISTS rh_funcionarios (
  id INT PRIMARY KEY AUTO_INCREMENT,

  -- Dados pessoais
  nome_completo VARCHAR(150) NOT NULL,
  endereco VARCHAR(255) NULL,
  bairro VARCHAR(100) NULL,
  email VARCHAR(150) NULL,
  estado_civil VARCHAR(30) NULL,
  telefone VARCHAR(20) NULL,
  telefone_emergencia VARCHAR(20) NULL,
  contato_emergencia_nome VARCHAR(150) NULL,
  contato_emergencia_parentesco VARCHAR(50) NULL,
  data_nascimento DATE NULL,
  nome_pai VARCHAR(150) NULL,
  nome_mae VARCHAR(150) NULL,
  cpf VARCHAR(20) NULL,
  pis VARCHAR(20) NULL,
  rg VARCHAR(20) NULL,
  titulo_eleitor VARCHAR(30) NULL,
  tipo_sanguineo VARCHAR(5) NULL,

  -- Dados profissionais
  setor VARCHAR(100) NULL,
  cargo_atual VARCHAR(100) NULL,
  data_admissao DATE NOT NULL,
  tipo_contrato ENUM('CLT', 'PJ') NOT NULL DEFAULT 'CLT',
  jornada_trabalho VARCHAR(100) NULL,
  horario_trabalho MEDIUMTEXT NULL,
  status ENUM('ativo', 'afastado', 'ferias', 'desligado') NOT NULL DEFAULT 'ativo',
  data_desligamento DATE NULL,
  motivo_desligamento VARCHAR(255) NULL,
  centro_custo VARCHAR(100) NULL,

  -- Benefícios
  convenio_unimed TINYINT(1) NOT NULL DEFAULT 0,
  cartao_alimentacao TINYINT(1) NOT NULL DEFAULT 0,

  -- Extras
  escolaridade VARCHAR(50) NULL,
  tamanho_uniforme VARCHAR(10) NULL,
  tamanho_calcado VARCHAR(10) NULL,
  observacoes MEDIUMTEXT NULL,

  -- Controle
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT uq_rh_funcionarios_cpf UNIQUE (cpf)
);

CREATE INDEX idx_rh_funcionarios_nome ON rh_funcionarios (nome_completo);
CREATE INDEX idx_rh_funcionarios_setor ON rh_funcionarios (setor);
CREATE INDEX idx_rh_funcionarios_cargo ON rh_funcionarios (cargo_atual);
CREATE INDEX idx_rh_funcionarios_status ON rh_funcionarios (status);
CREATE INDEX idx_rh_funcionarios_tipo_contrato ON rh_funcionarios (tipo_contrato);
CREATE INDEX idx_rh_funcionarios_data_admissao ON rh_funcionarios (data_admissao);
