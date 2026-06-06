# Implementation Plan: Motor de simulação event-driven

**Track ID:** event-driven-sim_20260606
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-06
**Status:** [x] Complete

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

- [x] Task 3.1: Modelar a entrada CLK como fonte de **nível** (onda quadrada ~1Hz via
      `clockValue`): `advanceTo` leva cada net de clock ao nível atual e assenta. _(Revisão
      após smoke test: a abordagem inicial de pulso de borda foi descartada — fazia o clock
      não acionar lógica combinacional visivelmente. Nível concilia combinacional + mestre-
      escravo; o JK mínimo oscila, como no hardware.)_
- [x] Task 3.2: Testes — lógica combinacional acompanha o nível do clock (anti-fase numa
      NAND); gated D latch transparente com CLK alto / segura com baixo; **JK mestre-escravo
      alterna a cada ciclo** sob clock automático.

### Verification

- [x] Combinacional acompanha o clock; mestre-escravo alterna; gated latch transparente.

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

- [x] Task 5.0: Indicação visual de oscilação/metaestabilidade — o motor detecta a
      não-convergência (teto de delta-cycles atingido) e marca os nets instáveis; o
      `SignalState` ganha `oscillating` e o `render.ts` os pinta de vermelho. _(Nota: no
      motor event-driven o JK level-triggered ingênuo **assenta num ponto fixo** (trava,
      não alterna) em vez de oscilar; o indicador captura osciladores reais — anel de
      inversões ímpares / NAND realimentada nela mesma.)_
- [x] Task 5.1: Cobrir casos de borda — circuito vazio, pino de entrada sem fio propaga
      `false`, remoção de fio/nó propaga desligamento e dispara recompilação (via
      `topologyVersion`). Coberto em `engine.edge.test.ts`.
- [x] Task 5.2: Aposentar o caminho de relaxação em `simulator.ts` — confirmado que
      produção (main/render/engine) não usa mais `simulate` (só tipos/primitivas); `simulate`
      fica documentado como **oráculo de referência** dos testes (valida a compilação).
- [x] Task 5.3: Avaliação de fluidez — medição (40 chips × 8 NAND, 300 frames):
      relaxação ≈182ms vs event-driven ≈35ms (~5× mais rápido), e a vantagem cresce com
      aninhamento (a relaxação re-expande chips por iteração/frame).

### Verification

- [x] `npm test` (123) e `npm run build` limpos; lint limpo; smoke test ao vivo OK.

## Final Verification

- [ ] Todos os critérios de aceitação atendidos
- [ ] Testes passando (`npm test`) e build/typecheck limpos (`npm run build`)
- [ ] Verificação manual no editor concluída (clock por pulso, sequencial ao vivo)
- [ ] Pronto para revisão

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
