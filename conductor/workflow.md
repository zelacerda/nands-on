# Workflow — From NAND to CPU

## Política de TDD

**Flexível.** Testes são recomendados especialmente para a **lógica complexa** — como o
motor de simulação de circuitos, propagação de sinais e serialização/deserialização de
componentes. Para código de UI/renderização e protótipos, testes não são obrigatórios.
Escreva testes onde a correção é crítica e difícil de verificar manualmente.

## Estratégia de Commits

**Conventional Commits.** Use prefixos padronizados:

- `feat:` — nova funcionalidade
- `fix:` — correção de bug
- `refactor:` — refatoração sem mudança de comportamento
- `test:` — adição/ajuste de testes
- `docs:` — documentação
- `chore:` — tarefas de manutenção/infra

## Code Review

**Auto-review / opcional.** Por ser um projeto pessoal, a revisão própria é suficiente.
Recomenda-se revisar o próprio diff antes de commitar, mas não há bloqueio formal de
revisão por terceiros.

## Checkpoints de Verificação

**Apenas ao concluir o track.** A verificação manual é exigida somente no encerramento do
track completo, não a cada fase ou tarefa. Durante o desenvolvimento, o progresso flui sem
checkpoints obrigatórios intermediários.

## Ciclo de Vida da Tarefa

1. **Pendente** — tarefa definida no plano do track.
2. **Em progresso** — implementação em andamento (com testes para lógica complexa).
3. **Concluída** — implementada e commitada seguindo Conventional Commits.
4. **Verificada** — validada manualmente no fechamento do track.
