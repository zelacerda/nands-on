# Specification: Chips Reutilizáveis

**Track ID:** reusable-chips_20260531
**Type:** Feature
**Created:** 2026-05-31
**Status:** Draft

## Summary

Permitir empacotar todo o circuito do espaço de trabalho em um **chip reutilizável**: ao
clicar em **"Fazer"** e dar um nome, as entradas e saídas presentes no espaço viram os
pinos externos do novo componente, que passa a ficar disponível no menu para ser inserido
em outros circuitos como uma peça única.

## Context

O **From NAND to CPU** ensina como uma CPU é construída a partir de portas NAND. A
abstração hierárquica — compor peças simples em blocos cada vez mais complexos — é o
coração dessa progressão. Este track adiciona essa capacidade ao editor visual entregue
no track `visual-editor_20260531`, no modelo "build-and-package" inspirado no
Digital-Logic-Sim: o usuário monta um circuito no próprio espaço e o "sela" como um chip.

## User Story

Como **usuário final**, quero **transformar o circuito que montei em um componente
nomeado e reutilizável**, para que **eu possa reaproveitá-lo como uma única peça** e ir
construindo blocos cada vez mais complexos (de NAND até uma CPU).

## Fluxo Principal

1. O usuário monta um circuito no espaço usando Entradas, Saídas e portas (NAND e/ou
   chips já criados).
2. Quando há **pelo menos uma Entrada e uma Saída** no espaço, o botão **"Fazer"** fica
   visível.
3. Ao clicar em "Fazer", o usuário informa um **nome** para o componente.
4. O circuito do espaço é capturado como a **definição** do chip: cada nó de Entrada vira
   um pino de entrada externo e cada nó de Saída vira um pino de saída externo, **ordenados
   de cima para baixo** conforme a posição vertical em que estavam.
5. O componente passa a aparecer no **menu/paleta** e o **espaço é limpo**, pronto para a
   próxima montagem.
6. O usuário pode **inserir** o chip no espaço; ele aparece como uma **caixa única**
   (colapsada) com o nome e os pinos externos, e se comporta como qualquer outro nó
   (mover, conectar, remover).

## Acceptance Criteria

- [ ] O botão "Fazer" só fica visível quando o espaço contém ≥1 Entrada **e** ≥1 Saída.
- [ ] Ao clicar em "Fazer", é solicitado um nome; nome vazio ou **já existente** é
      bloqueado com mensagem, pedindo outro.
- [ ] Após nomear, o circuito do espaço vira uma definição de chip e o **espaço é limpo**.
- [ ] A ordem dos pinos externos (entradas à esquerda, saídas à direita) segue a
      **disposição vertical** dos nós de I/O no momento da criação.
- [ ] O chip criado aparece no menu/paleta e pode ser **inserido** no espaço como uma
      caixa única com o nome e os pinos corretos (N entradas, M saídas).
- [ ] Um chip inserido é um nó normal: pode ser movido, conectado (seus pinos seguem as
      regras de validação existentes) e removido.
- [ ] É possível **aninhar**: criar um chip a partir de um circuito que contém instâncias
      de outros chips já criados.
- [ ] A topologia interna do chip é preservada na definição (em memória), pronta para a
      simulação futura, mesmo que aqui ainda não seja executada.

## Dependencies

- **Depende de código existente** do track `visual-editor_20260531`: modelo
  (`model.ts`), store (`store.ts`), renderização (`render.ts`), hit-testing
  (`hittest.ts`), paleta e orquestração (`main.ts`).

## Out of Scope

- **Motor de simulação / propagação de sinais** — a definição guarda a topologia, mas o
  chip não "calcula" nada ainda. Track próprio.
- **Persistência da biblioteca de chips** — a biblioteca vive **apenas em memória** e é
  perdida ao recarregar a página. Será coberta no track de persistência (IndexedDB +
  export/import JSON).
- **Editar/abrir a definição de um chip já criado** (entrar no chip, alterar e refletir
  nas instâncias), **renomear** ou **excluir** chips da biblioteca.
- **Nomear pinos externos** ou exibir rótulos por pino.
- Aparência avançada (cores por chip, ícones) — além de um estilo de caixa com nome.

## Technical Notes

- **Modelo:** introduzir o tipo de nó `chip` com referência a uma `ChipDefinition`
  (`{ id, name, inputs, outputs, internal: CircuitState }`). Generalizar o tamanho do nó
  (`nodeSize(node)`) pois chips têm dimensão variável conforme o número de pinos; os pinos
  de uma instância são derivados da definição (N entradas à esquerda, M saídas à direita,
  ordenadas de cima para baixo).
- **Captura:** `captureDefinition(store, name)` faz o snapshot do `CircuitState` atual,
  coleta os nós `input`/`output` ordenados por `pos.y`, e monta a definição. Em seguida o
  store é limpo.
- **Biblioteca:** `ChipLibrary` em memória (mapa `name → definition`), com checagem de
  unicidade de nome. A paleta é montada dinamicamente a partir da biblioteca.
- **Nomeação:** usar uma UI inline (campo de input no overlay), evitando `window.prompt`
  bloqueante; validar nome não-vazio e único.
- **Aninhamento:** a definição capturada inclui eventuais nós `chip` (com seu `defId`),
  preservando a hierarquia para a simulação futura.

---

_Gerado pelo Conductor. Revise e edite conforme necessário._
