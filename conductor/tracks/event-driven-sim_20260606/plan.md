# Implementation Plan: Motor de simulação event-driven

**Track ID:** event-driven-sim_20260606
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-06
**Status:** [ ] Not Started

## Overview

A migração é incremental e mantém `SignalState` (`pinValues` + `wireValues`) como
fronteira estável, para que `render.ts` não mude. Primeiro extrai-se um **netlist
compilado** (achatamento da hierarquia de chips), depois constrói-se o **motor
event-driven** sobre esse netlist, em seguida o **clock vira fonte de pulso/edge**, e por
fim liga-se tudo no `main.ts`/`store` e aposenta-se o motor de relaxação. Conforme o
`workflow.md`, testes acompanham a lógica complexa (compilação e propagação) e a
verificação manual ocorre só no fechamento do track. Commits seguem Conventional Commits.

## Phase 1: Compilação do netlist (achatamento da hierarquia)

Transformar `CircuitState` + definições de chip num netlist plano de primitivas,
computado uma vez por mudança de topologia, com mapeamento de volta para os pinos/fios de
topo (necessário para reconstruir o `SignalState`).

### Tasks

- [x] Task 1.1: Definir as estruturas do netlist compilado (porta primitiva com nets de
      entrada/saída; tabela de nets; mapa `pinKey`-de-topo → net e `wireId`-de-topo → net
      de origem) num novo módulo (ex.: `src/netlist.ts`).
- [x] Task 1.2: Implementar `compile(state, resolveChip) -> CompiledNetlist`, achatando
      recursivamente instâncias de chip em primitivas (reutilizando a ordenação de
      pinos por posição já usada em `computeChipOutputs`).
- [x] Task 1.3: Tratar arestas do achatamento: pino de entrada sem fio → net constante
      `false`; chips aninhados em vários níveis; nomes/ids de nets estáveis.
- [x] Task 1.4: Escrever testes de compilação — tabelas-verdade combinacionais (NAND,
      OR, NOT, NOR) avaliadas sobre o netlist plano conferem com o esperado; chip aninhado
      achata para o mesmo comportamento da versão hierárquica.

### Verification

- [x] `npm test` passa para os testes de compilação; `npm run build` (typecheck) limpo.

## Phase 2: Núcleo do motor event-driven

Construir o `Simulator` stateful sobre o netlist compilado, com atraso de porta e fila de
eventos, recomputando apenas portas afetadas.

### Tasks

- [x] Task 2.1: Implementar a classe/escopo `Simulator` a partir de um `CompiledNetlist`:
      valores correntes por net, fila de eventos por tempo simulado, atraso unitário por
      porta, e laço de processamento de eventos.
- [x] Task 2.2: Implementar `setInput(nodeId, value)` (agenda evento na fonte) e
      `advanceTo(now)` (processa eventos até o instante), com tratamento de
      delta-cycles e teto de iterações como guarda contra oscilação (loops de atraso-zero
      e estados metaestáveis, ex.: SR latch em S=R=1→0,0).
- [x] Task 2.3: Implementar `snapshot() -> SignalState`, reconstruindo `pinValues` (por
      `pinKey` de topo) e `wireValues` (por `wireId`) a partir dos nets via os mapas da
      Fase 1.
- [x] Task 2.4: Testes do motor — combinacional (paridade com tabelas-verdade) e
      sequencial (SR Latch mantém memória; JK mestre-escravo faz hold/set/reset/toggle),
      reproduzindo os cenários já cobertos pelo `simulator.test.ts` atual.

### Verification

- [x] Testes de combinacional e sequencial passam; `npm run build` limpo.

## Phase 3: Clock como pulso/edge

Tornar as entradas em modo CLK fontes de eventos periódicos, habilitando flip-flops
level-triggered mínimos.

### Tasks

- [x] Task 3.1: Modelar a entrada CLK como fonte que agenda eventos de pulso/edge no tempo
      simulado, derivando o período de `CLOCK_PERIOD_MS` (pulso curto relativo ao atraso
      do laço de realimentação). Decisão: o pino CLK exibe nível (blink ~1Hz) enquanto a
      lógica recebe um pulso estreito na borda de subida (semântica edge-triggered).
      Largura calibrada empiricamente: `CLOCK_PULSE_TICKS=2` (JK mínimo alterna com ≤2,
      trava com ≥3; mestre-escravo e latch robustos para qualquer largura).
- [x] Task 3.2: Teste-chave — o **JK level-triggered mínimo (2 NAND3 decompostas + 2
      NAND)** alterna corretamente (`0101…`) sob o clock por pulso; gated SR/D latch
      respondem na borda esperada.

### Verification

- [x] O JK mínimo alterna por ciclo no teste; nenhum estado preso/oscilação descontrolada.

## Phase 4: Integração (store + main; render intocado)

Ligar o motor novo ao loop da aplicação, recompilando só quando a topologia muda.

### Tasks

- [x] Task 4.1: Adicionar ao `store` um contador de versão (topologia) e marcação de
      "sujou" nas mutações relevantes (`addNode`/`addWire`/`removeNode`/`removeWire`/
      `loadState`/`clear`), e separar as mudanças de entrada (`setNodeValue`/
      `cycleInputState`) como eventos de input. Implementado como `topologyVersion`, que
      bumpa só em mudanças estruturais — preserva a memória dos latches ao alternar entradas.
- [x] Task 4.2: Atualizar `main.ts` (atual chamada única em `simulate(...)` por frame)
      para construir/reconstruir o `Simulator` quando a versão de topologia muda, empurrar
      mudanças de entrada/clock como eventos, avançar para `performance.now()` e usar
      `snapshot()` no `render`. Implementado via `evaluate(now)`; `setClock()` sincroniza
      modo-clock sem rebuild.
- [x] Task 4.3: Confirmar que `render.ts` permanece inalterado (consome `pinValues`/
      `wireValues` exatamente como antes). Confirmado via git (sem modificação em render.ts).

### Verification

- [x] Checks automatizados verdes (build/typecheck + 117 testes + lint); `render.ts` intocado.
- [ ] Smoke test ao vivo (`npm run dev`) — deferido ao fechamento do track (workflow:
      verificação manual no encerramento).

## Phase 5: Polish e aposentadoria do motor antigo

### Tasks

- [ ] Task 5.1: Cobrir casos de borda — circuito vazio, pino de entrada sem fio propaga
      `false`, remoção de fio/nó propaga desligamento e dispara recompilação.
- [ ] Task 5.2: Aposentar o caminho de relaxação em `simulator.ts` (remover ou manter
      atrás de flag de transição) e migrar/atualizar `simulator.test.ts` para o motor novo.
- [ ] Task 5.3: Avaliação qualitativa de fluidez com um circuito grande (muitas instâncias
      de chip) comparado ao comportamento anterior.

### Verification

- [ ] `npm test` e `npm run build` limpos; sem regressões observáveis no editor.

## Final Verification

- [ ] Todos os critérios de aceitação atendidos
- [ ] Testes passando (`npm test`) e build/typecheck limpos (`npm run build`)
- [ ] Verificação manual no editor concluída (clock por pulso, sequencial ao vivo)
- [ ] Pronto para revisão

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
