-- Referência do schema assumido pelo backend (induscolor_sistema).
-- As tabelas já existem e foram criadas/testadas manualmente no MySQL remoto.
-- Este arquivo NÃO é executado pela aplicação — serve apenas de documentação
-- para manter as queries em sync com as colunas reais. Ajuste aqui e nas
-- rotas se os nomes reais das colunas forem diferentes.

CREATE TABLE IF NOT EXISTS rh_vagas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  area VARCHAR(120),
  descricao TEXT,
  requisitos TEXT,
  diferenciais TEXT,
  beneficios TEXT,
  localizacao VARCHAR(120),
  horario VARCHAR(120),
  tipo_contratacao VARCHAR(60),
  status ENUM('publicada', 'pausada', 'encerrada') NOT NULL DEFAULT 'publicada',
  data_encerramento DATE NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rh_candidatos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(30),
  whatsapp VARCHAR(30),
  cidade VARCHAR(120),
  estado VARCHAR(2),
  escolaridade VARCHAR(120),
  experiencia TEXT,
  pretensao_salarial VARCHAR(60),
  curriculo_url VARCHAR(255),
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rh_candidaturas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidato_id INT NOT NULL,
  vaga_id INT NULL,
  etapa VARCHAR(60) NOT NULL DEFAULT 'novo_curriculo',
  mensagem TEXT,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_candidaturas_candidato FOREIGN KEY (candidato_id) REFERENCES rh_candidatos(id),
  CONSTRAINT fk_candidaturas_vaga FOREIGN KEY (vaga_id) REFERENCES rh_vagas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rh_historico (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidatura_id INT NOT NULL,
  etapa_anterior VARCHAR(60),
  etapa_nova VARCHAR(60) NOT NULL,
  observacao VARCHAR(255),
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_historico_candidatura FOREIGN KEY (candidatura_id) REFERENCES rh_candidaturas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rh_entrevistas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidatura_id INT NOT NULL,
  data_hora DATETIME,
  tipo VARCHAR(40),
  status VARCHAR(40) NOT NULL DEFAULT 'agendada',
  observacoes TEXT,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_entrevistas_candidatura FOREIGN KEY (candidatura_id) REFERENCES rh_candidaturas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
