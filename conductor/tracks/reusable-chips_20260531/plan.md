# Implementation Plan: Chips Reutilizáveis

**Track ID:** reusable-chips_20260531
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-31
**Status:** [ ] Not Started

## Overview

Estender o editor visual para suportar chips reutilizáveis no modelo "build-and-package".
O trabalho parte do código do track `visual-editor_20260531`: primeiro generalizamos o
modelo para um tipo de nó `chip` com dimensão e pinos dinâmicos derivados de uma
`ChipDefinition`, e criamos a biblioteca em memória e a captura do espaço; depois
renderizamos/instanciamos chips e tornamos a paleta dinâmica; por fim ligamos o fluxo
"Fazer" → nomear (validado) → limpar o espaço, incluindo aninhamento.

Conforme o `workflow.md`: TDD **flexível** (testes na lógica pura — captura, ordenação de
pinos, biblioteca, derivação de pinos da instância), **Conventional Commits**, e
verificação manual **apenas ao concluir o track**.

## Phase 1: Modelo de Chips, Captura e Biblioteca

Generalizar o modelo e implementar a lógica pura de definição/captura/biblioteca.

### Tasks

- [x] Task 1.1: Estender `model.ts`: adicionar o tipo de nó `chip`, o tipo
      `ChipDefinition` (`{ id, name, inputCount, outputCount, internal: CircuitState }`)
      e um campo opcional `defId` no `CircuitNode`.
- [x] Task 1.2: Introduzir `nodeSize(node)` (dimensão dinâmica para `chip` a partir do nº
      de pinos) e `chipInstancePins(def)` (N entradas à esquerda, M saídas à direita,
      ordenadas de cima para baixo). Manter os tamanhos fixos das primitivas.
- [x] Task 1.3: Implementar `captureDefinition(state, name)`: a partir de um `CircuitState`,
      coletar nós `input`/`output` ordenados por `pos.y` e montar a `ChipDefinition`
      (preservando a topologia interna, incluindo nós `chip` aninhados).
- [x] Task 1.4: Implementar `ChipLibrary` em memória (`add`, `get`, `has`, `list`) com
      **unicidade de nome** (rejeitar duplicado).
- [x] Task 1.5 (teste): Testes de `captureDefinition` (ordenação vertical dos pinos,
      contagem in/out), `chipInstancePins`/`nodeSize` e unicidade da biblioteca.

### Verification

- [x] Testes da lógica de captura, derivação de pinos e biblioteca passando; typecheck,
      lint e build verdes. _(Inclui a migração de `NODE_SIZE[node.type]` → `nodeSize(node)`
      em render/hittest, necessária para compilar — antecipa parte da Task 2.3.)_

## Phase 2: Renderização e Instanciação de Chips

Desenhar e inserir chips como caixas colapsadas, integrando com o editor existente.

### Tasks

- [ ] Task 2.1: Adicionar à store a criação de instância de chip (`addChipInstance(def, pos)`),
      gerando os pinos a partir da definição; garantir que `removeNode`/`pinPos` funcionem
      para nós `chip`.
- [ ] Task 2.2: Renderizar o nó `chip` em `render.ts`: caixa única com o **nome** centralizado
      e os pinos externos (entradas à esquerda, saídas à direita).
- [ ] Task 2.3: Atualizar os consumidores de tamanho de nó para usar `nodeSize(node)`:
      `hittest.ts` (retângulo do nó) e `main.ts` (`addNodeAtCenter`/centralização).
- [ ] Task 2.4: Tornar a **paleta dinâmica**: além de NAND/Entrada/Saída, listar os chips
      da biblioteca; clicar insere uma instância centralizada na viewport.
- [ ] Task 2.5 (teste): Testes da instância de chip (contagem/posição dos pinos a partir
      da definição; `nodeSize` coerente; remoção limpa os fios conectados).

### Verification

- [ ] Com uma definição "semeada" via console/teste, é possível inserir o chip pela paleta;
      ele aparece como caixa com os pinos certos e pode ser movido, conectado e removido.

## Phase 3: Fluxo "Fazer", Nomeação e Limpeza

Ligar a ponta a ponta a criação de chips a partir do espaço de trabalho.

### Tasks

- [ ] Task 3.1: Adicionar o botão **"Fazer"** (overlay) cuja visibilidade depende de o
      espaço ter ≥1 nó `input` **e** ≥1 nó `output` (atualizada conforme o circuito muda).
- [ ] Task 3.2: Criar a **UI de nomeação inline** (campo de input no overlay, sem
      `window.prompt`), com confirmar/cancelar.
- [ ] Task 3.3: Implementar o handler de "Fazer": validar nome (não-vazio e único, com
      mensagem em caso de duplicado), chamar `captureDefinition`, adicionar à `ChipLibrary`,
      registrar na paleta e **limpar o espaço**.
- [ ] Task 3.4: Suportar **aninhamento**: garantir que capturar um espaço que contém
      instâncias de chips inclua esses nós `chip` na definição e que tudo siga funcionando.
- [ ] Task 3.5 (teste): Teste de integração da lógica de "Fazer" (validação de nome,
      bloqueio de duplicado, biblioteca recebe a definição; captura com chip aninhado).

### Verification

- [ ] Ponta a ponta: montar IN→NAND→OUT, clicar "Fazer", nomear, ver o espaço limpar e o
      chip surgir na paleta; inserir o chip; criar um segundo chip que usa o primeiro
      (aninhamento). Nome duplicado é bloqueado.

## Final Verification

- [ ] Todos os critérios de aceitação da spec atendidos.
- [ ] Testes (captura, pinos, biblioteca, instância, fluxo "Fazer") passando.
- [ ] Verificação manual em desktop (mouse) concluída.
- [ ] Pronto para revisão.

---

_Gerado pelo Conductor. As tarefas serão marcadas como [~] em progresso e [x] concluídas._
