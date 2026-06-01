# Implementation Plan: Lógica de Simulação dos Chips

**Track ID:** chip-logic_20260531
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-31
**Status:** [x] Complete

## Overview

A implementação adiciona um motor de simulação combinacional ao simulador, sem
alterar a topologia estática já existente. O fluxo é: (1) estender o modelo para
carregar valor booleano nos inputs; (2) construir um `simulator.ts` puro e
testável que, dado um `CircuitState` e os valores das entradas, devolve um estado
de sinal; (3) suportar avaliação recursiva de chips; (4) ligar o toggle de input
na camada de interação; e (5) refletir o estado de sinal na renderização (inputs
acesos, outputs acesos, fios coloridos). A política de TDD é flexível, mas a
lógica do motor (propagação NAND, recursão de chips) é crítica e será coberta por
testes com vitest antes da implementação.

## Phase 1: Modelo e Estado de Sinal

Preparar as estruturas de dados que carregam o valor booleano das entradas e o
resultado da simulação, sem ainda calcular nada.

### Tasks

- [x] Task 1.1: Adicionar `value?: boolean` a `CircuitNode` em `src/model.ts`
      (usado apenas por nós `input`), com default `false`.
- [x] Task 1.2: Definir a interface de estado de sinal em `src/simulator.ts`
      (ex.: `SignalState` com `wireValues: Map<string, boolean>` e
      `pinValues`/`nodeValues` para inputs/outputs).
- [x] Task 1.3: Adicionar em `src/store.ts` o método `toggleNodeValue(nodeId)`
      (e/ou `setNodeValue`) que alterna `value` apenas para nós `input`.

### Verification

- [x] Projeto compila em modo strict (`tsc --noEmit`) sem erros após as mudanças
      de modelo/store.

## Phase 2: Motor de Simulação Combinacional (NAND)

Implementar o núcleo da propagação para circuitos planos (sem chips), com a NAND
como única primitiva. Fase guiada por testes.

### Tasks

- [x] Task 2.1: Escrever testes (`src/simulator.test.ts`) para a avaliação de um
      circuito plano: input→output direto, NAND com tabela-verdade completa,
      input não conectado = `false`, e estabilização de cadeias de NANDs.
- [x] Task 2.2: Implementar `evaluate(state, inputValues)` em `src/simulator.ts`:
      propagação iterativa (relaxation) até estabilizar, com limite máximo de
      iterações para evitar loop infinito.
- [x] Task 2.3: Implementar a lógica da NAND (`out = !(in0 && in1)`) e a
      transferência de valor pelos fios (`from.out → to.in`), populando
      `SignalState` (valores de fios e de pinos de input/output).

### Verification

- [x] Todos os testes de `simulator.test.ts` passam (`vitest run`).

## Phase 3: Avaliação Recursiva de Chips

Estender o motor para avaliar instâncias de chip a partir de sua topologia
interna. Fase guiada por testes.

### Tasks

- [x] Task 3.1: Escrever testes para chips: chip simples (ex.: NOT a partir de
      NAND) produzindo a saída correta, e chip aninhado (chip dentro de chip).
- [x] Task 3.2: Implementar a avaliação de nó `chip`: mapear pinos externos de
      entrada → inputs internos, avaliar `ChipDefinition.internal`
      recursivamente, mapear outputs internos → pinos externos de saída.
- [x] Task 3.3: Garantir resolução da `ChipDefinition` via `defId`/`ChipLibrary`
      durante a avaliação recursiva.

### Verification

- [x] Testes de chips (incl. aninhamento) passam (`vitest run`).

## Phase 4: Interação — Toggle de Input

Conectar o gesto de clique ao toggle de estado do input, preservando a seleção
atual.

### Tasks

- [x] Task 4.1: Em `src/main.ts`, detectar no fluxo de pointer o clique sobre um
      nó `input` que **já está selecionado** e chamar `toggleNodeValue`.
- [x] Task 4.2: Garantir que clicar num input **não selecionado** apenas o
      seleciona (comportamento atual), sem alternar o valor.
- [x] Task 4.3: Recalcular a simulação quando o valor de um input muda (ou a cada
      frame do loop de render, conforme integração da Fase 5).

### Verification

- [x] Verificação manual: primeiro clique seleciona o input; segundo clique
      alterna ligado/desligado. _(a confirmar no checkpoint do usuário)_

## Phase 5: Renderização do Estado de Sinal

Refletir visualmente o resultado da simulação: inputs acesos, outputs acesos e
fios coloridos por estado.

### Tasks

- [x] Task 5.1: Integrar a simulação ao loop de render em `src/main.ts`,
      passando o `SignalState` para as funções de desenho.
- [x] Task 5.2: Em `src/render.ts`, colorir nós `input`/`output` conforme o valor
      (aceso vs. apagado) com indicação visual clara.
- [x] Task 5.3: Em `src/render.ts`, colorir fios/pinos conforme o estado do sinal
      (ligado vs. desligado).

### Verification

- [x] Verificação manual: montar input→NAND→output, alternar entradas e observar
      saída e fios mudando de cor em tempo real.
- [x] **Checkpoint do usuário (obrigatório):** ao concluir a Fase 5, pausar para
      o usuário testar e validar pessoalmente as decisões de interface (toggle de
      input, indicação de aceso/apagado, cores de fios e pinos) antes de seguir
      para a verificação final. Ajustar conforme o feedback.
      _Ajustes pós-feedback: cor de sinal verde → amarelo; fios/contornos/pinos
      mais grossos; IN/OUT redondos; borda de seleção atrás dos conectores._

## Final Verification

- [x] Todos os critérios de aceitação atendidos.
- [x] Testes passando (`vitest run`) e projeto compilando (`tsc --noEmit`).
- [x] Verificação manual no browser: circuito combinacional e chip reutilizável
      avaliando corretamente.
- [x] Pronto para revisão.

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
