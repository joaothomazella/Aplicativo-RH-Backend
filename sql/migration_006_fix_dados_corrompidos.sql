-- Correções pontuais para registros já gravados com encoding quebrado
-- (ex.: "Produ��o" em vez de "Produção", "demiss�o" em vez de "demissão").
--
-- ATENÇÃO: todo UPDATE abaixo está COMENTADO de propósito. Rode primeiro os
-- SELECTs de diagnóstico para ver exatamente quais linhas estão quebradas no
-- seu banco, confira o texto correto e só então descomente e ajuste o UPDATE
-- correspondente antes de executar. Não há substituição automática em massa.
--
-- Nenhum comando deste arquivo é executado pela aplicação — é só para você
-- rodar manualmente, linha por linha, com calma.

-- =========================================================================
-- 1) Diagnóstico geral de charset/collation
-- =========================================================================

SHOW VARIABLES LIKE 'character_set%';
SHOW VARIABLES LIKE 'collation%';

SHOW CREATE TABLE rh_funcionarios;
SHOW CREATE TABLE rh_candidatos;
SHOW CREATE TABLE rh_candidaturas;

-- =========================================================================
-- 2) Localizar linhas com o caractere de substituição Unicode (�) ou outros
--    sinais comuns de corrupção, antes de decidir o que corrigir
-- =========================================================================

SELECT id, nome_completo, setor, cargo_atual, motivo_desligamento
FROM rh_funcionarios
WHERE nome_completo LIKE '%�%'
   OR setor LIKE '%�%'
   OR cargo_atual LIKE '%�%'
   OR motivo_desligamento LIKE '%�%'
LIMIT 50;

-- Caso o cliente MySQL usado não aceite � na cláusula LIKE, use o caractere
-- literal copiado diretamente do resultado quebrado, por exemplo:
-- SELECT id, setor FROM rh_funcionarios WHERE setor LIKE '%Produ??o%' LIMIT 50;
-- (ajuste '??' para o padrão exato que aparecer no seu cliente SQL)

SELECT id, nome_completo, setor, cargo_atual, motivo_desligamento
FROM rh_funcionarios
LIMIT 20;

-- Repita a mesma inspeção nas demais tabelas com texto livre, se necessário:
-- SELECT id, nome, cidade, resumo_profissional, observacoes FROM rh_candidatos LIMIT 50;
-- SELECT id, motivo_reprovacao, avaliacao_rh, observacoes FROM rh_candidaturas LIMIT 50;
-- SELECT id, descricao, requisitos, beneficios FROM rh_vagas LIMIT 50;

-- =========================================================================
-- 3) Exemplos de correção pontual (COMENTADOS — confira e ajuste antes de
--    descomentar). Sempre rode o SELECT equivalente antes do UPDATE para
--    confirmar quais ids serão afetados.
-- =========================================================================

-- SELECT id, setor FROM rh_funcionarios WHERE setor = 'Produ??o';
-- UPDATE rh_funcionarios SET setor = 'Produção' WHERE id = 1;

-- SELECT id, motivo_desligamento FROM rh_funcionarios WHERE motivo_desligamento LIKE '%demiss?o%';
-- UPDATE rh_funcionarios SET motivo_desligamento = 'Pedido de demissão' WHERE id = 1;

-- Outros padrões comuns que podem aparecer no seu banco (ajuste caso a caso,
-- nunca em massa com REPLACE genérico, pois o mesmo símbolo quebrado pode
-- corresponder a letras diferentes dependendo da palavra original):
-- UPDATE rh_funcionarios SET cargo_atual = 'Operador de Produção' WHERE id = <id_especifico>;
-- UPDATE rh_funcionarios_historico_disciplinar SET descricao = '<texto corrigido>' WHERE id = <id_especifico>;
-- UPDATE rh_candidatos SET cidade = '<texto corrigido>' WHERE id = <id_especifico>;

-- =========================================================================
-- 4) Depois de corrigir, valide que a linha ficou correta
-- =========================================================================

-- SELECT id, setor, motivo_desligamento FROM rh_funcionarios WHERE id = 1;
