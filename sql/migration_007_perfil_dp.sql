-- Adiciona o perfil "dp" (Departamento Pessoal) ao enum de rh_usuarios.perfil.
-- NÃO execute automaticamente: rode manualmente quando estiver pronto:
-- `mysql -u usuario -p induscolor_sistema < migration_007_perfil_dp.sql`
--
-- Depois de rodar, usuários existentes que devem ser DP precisam ter o campo
-- `perfil` atualizado manualmente para 'dp' (ex.: UPDATE rh_usuarios SET perfil='dp' WHERE usuario='...').
-- O código do app já está preparado para o perfil "dp" mesmo antes desta migration ser
-- executada (usuários "dp" simplesmente não existirão até o enum ser ampliado e os
-- registros forem atualizados).

ALTER TABLE rh_usuarios
  MODIFY perfil ENUM('admin','rh','dp','gestor') NOT NULL DEFAULT 'rh';
