# Implementation Plan: Entrada de Clock (CLK) e Botões de I/O Circulares

**Track ID:** clock-input_20260604
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-04
**Status:** [x] Complete

## Overview

A feature se apoia no fato de o motor já re-avaliar o circuito a cada frame. A
estratégia é: (1) modelar `'clock'` como uma nova primitiva e derivar seu valor do
tempo **dentro do simulador**, para que clocks aninhados em chips também oscilem;
(2) renderizar o nó e expor o botão na paleta, ligando o `now` real ao loop; (3)
padronizar os botões de I/O como círculos. A lógica de simulação (crítica e difícil
de verificar à mão) é coberta por testes; o restante é validado visualmente no app.

## Phase 1: Modelo e Simulação do Clock (TDD)

Adiciona a primitiva `'clock'` ao modelo e a avaliação baseada em tempo ao motor,
com testes garantindo o ciclo correto e o funcionamento dentro de chips.

### Tasks

- [x] Task 1.1: Em `model.ts`, adicionar `'clock'` a `PrimitiveType`, registrar
      `clock: { w: 40, h: 40 }` em `NODE_SIZE` e o caso `'clock'` em `createPins`
      (pino único `out` à direita, como o `input`).
- [x] Task 1.2: Em `simulator.ts`, adicionar `CLOCK_PERIOD_MS = 1000` (meio-ciclo
      500 ms) e fazer `simulate`/`simulateWith` aceitarem um `now: number`
      (timestamp). No caso `'clock'` de `computeNodeOutputs`, setar o pino `out`
      como `Math.floor(now / 500) % 2 === 0`.
- [x] Task 1.3: Propagar `now` na avaliação recursiva de chips
      (`computeChipOutputs` → `simulateWith`), de modo que um CLK encapsulado oscile
      como fonte interna.
- [x] Task 1.4: Escrever testes em `simulator.test.ts`: clock ON para `now` no 1º
      meio-ciclo, OFF no 2º, ON de novo após 1s; e um CLK dentro de um chip
      comutando uma saída ao longo do tempo.

### Verification

- [ ] `npm test` (simulator) passa e `npm run build` compila sem erros de tipo.

## Phase 2: Render, Paleta e Integração

Faz o CLK aparecer, oscilar e propagar no app real: render do nó, botão na paleta,
ligação do `now` ao loop e proteção contra contar o clock como entrada.

### Tasks

- [x] Task 2.1: Em `render.ts`, tratar `'clock'` como nó não-lógico (círculo):
      `nodeLabel` → `"CLK"` e `nodeLit` aceso quando o pino `out` está em 1.
- [x] Task 2.2: Em `main.ts`, passar `performance.now()` ao `simulate(...)` no loop
      de render.
- [x] Task 2.3: Em `index.html`, adicionar o botão `data-add="clock"`
      (`data-i18n="palette.clock"`) ao lado de IN/OUT; em `strings.ts`, adicionar
      `palette.clock: "CLK"`. O `attachPaletteDrag` genérico já cobre a criação.
- [x] Task 2.4: Garantir que o clock **não** seja tratado como entrada — confirmar
      `canMake` (conta `type === 'input'`), a captura de chip (não vira pino
      externo) e o toggle por toque (só `'input'`); ajustar se algo destoar.
      _Verificado: correto por construção, sem alteração de código._

### Verification

- [ ] No app: arrastar um CLK para o canvas, vê-lo oscilar 0,5s ON / 0,5s OFF;
      ligá-lo a uma NAND/flip-flop e ver o sinal propagar; encapsular em chip e
      confirmar que continua oscilando.

## Phase 3: Botões Circulares de I/O

Padroniza visualmente os botões de IN/OUT/CLK como círculos, com a borda na cor do
conector.

### Tasks

- [x] Task 3.1: Em `style.css`, tornar os botões `data-add="input|output|clock"`
      circulares (dimensão fixa igual, `border-radius: 50%`, texto centrado),
      mantendo alvo de toque ≥ 40 px.
- [x] Task 3.2: Definir a cor da borda por papel: IN e CLK em laranja (`#e0af68`),
      OUT em azul claro (`#7aa2f7`).

### Verification

- [ ] No app: os três botões aparecem como círculos legíveis, com as cores corretas
      e confortáveis ao toque.

## Final Verification

- [x] Todos os critérios de aceitação atendidos (lógicos/de build)
- [x] Testes passando (`npm test` — 93 testes) e build sem erros (`npm run build`)
- [~] Teste manual visual (oscilação animada + botões circulares): pendente —
      extensão do browser indisponível na sessão; dev server deixado no ar para
      conferência (`http://localhost:5174/`)
- [x] Pronto para revisão

## Revisão pós-implementação (2026-06-04)

Após teste de uso, o design do clock mudou: em vez de um **tipo primitivo** `'clock'`
com **botão próprio** na paleta, o clock virou um **estado da entrada**, ciclado por
toque (**OFF → ON → CLK → OFF**). Mudanças aplicadas sobre o que já estava feito:

- Removido o `PrimitiveType` `'clock'`, o botão `data-add="clock"` e a string
  `palette.clock`; `CircuitNode` ganhou `clock?: boolean`.
- `store.cycleInputState` substituiu `toggleNodeValue`; o toque na entrada cicla os
  três estados (e o duplo-toque de renomear desfaz o avanço).
- O simulador avalia `input` em modo clock por `clockValue(now)`; `captureDefinition`
  e `computeChipOutputs` excluem entradas em modo clock dos pinos externos.
- Render: entrada em modo clock mostra "CLK" e pisca pelo pino de saída.
- Os botões circulares passaram a valer só para IN/OUT (CLK não é mais um botão).
- A infraestrutura de tempo da Fase 1 (`clockValue`, `CLOCK_PERIOD_MS`, threading de
  `now`) foi **mantida** — só a representação do clock mudou.

Testes atualizados (entrada em modo clock no lugar do tipo `'clock'`); 93 testes
passando e build limpo.

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
