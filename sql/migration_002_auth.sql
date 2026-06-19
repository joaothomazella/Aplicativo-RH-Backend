-- Autenticação do painel interno do RH (login em /login, JWT validado pelo backend).
-- Execute este arquivo inteiro no banco induscolor_sistema antes de fazer deploy
-- do backend com as rotas /api/auth/* e do middleware de proteção:
-- `mysql -u usuario -p induscolor_sistema < migration_002_auth.sql`
--
-- A senha NUNCA é gravada em texto puro: senha_hash guarda um hash bcrypt.
-- Use o script `node src/scripts/seed-rh-user.js` (depois desta migration) para
-- criar o usuário inicial "marcela" com o hash gerado em tempo de execução.

CREATE TABLE IF NOT EXISTS rh_usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(150) NOT NULL,
  usuario VARCHAR(100) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil ENUM('admin','rh','gestor') NOT NULL DEFAULT 'rh',
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_rh_usuarios_usuario UNIQUE (usuario)
);
