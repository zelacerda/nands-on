# Specification: Motor de simulação event-driven

**Track ID:** event-driven-sim_20260606
**Type:** Refactor
**Created:** 2026-06-06
**Status:** Draft

## Summary

Substituir o motor de simulação atual (relaxação até ponto fixo, com re-expansão
recursiva de chips a cada frame) por um motor **event-driven**: o netlist é
**achatado/compilado** uma única vez quando a topologia muda, a propagação modela
**atraso de porta** e recomputa apenas as portas cuja entrada mudou, e o **clock vira
fonte de pulso/edge** em vez de nível amostrado por frame.

## Context

O `product.md` define como objetivo-chave "**Performance fluida — simulação em tempo
real responsiva mesmo com muitos componentes**" e a meta de progredir "da porta NAND até
uma CPU". O motor atual (`src/simulator.ts`) tem teto baixo de escala: a cada frame ele
(1) re-serializa e reavalia o circuito **inteiro**, independente de atividade, e (2)
re-expande recursivamente os internos de **cada instância de chip** a cada passo de
relaxação — custo super-linear com aninhamento e nº de instâncias. Além disso, o modelo
de clock como nível largo amostrado por frame impede flip-flops level-triggered mínimos
(o JK de 4 portas trava num ponto fixo, conforme verificado).

A costura de saída já é limpa: apenas `render.ts` consome o resultado, e somente via
`SignalState.pinValues` (por `pinKey`) e `SignalState.wireValues` (por id de fio). Isso
permite trocar o motor por trás desse contrato sem mexer na renderização.

## User Story

Como **estudante/entusiasta montando circuitos cada vez mais complexos**, quero que a
simulação continue fluida à medida que o circuito cresce (e que flip-flops montados a
partir de portas se comportem como no hardware real), para conseguir construir blocos
grandes — até uma CPU — sem perder responsividade.

## Acceptance Criteria

- [ ] Existe um passo de **compilação de netlist** que achata a hierarquia de chips num
      conjunto plano de primitivas, computado uma vez por mudança de topologia (não por
      frame), com mapeamento de volta para pinos/fios de topo (para renderização).
- [ ] Existe um **motor event-driven stateful** com atraso de porta (fila de eventos por
      tempo simulado) que recomputa apenas portas afetadas e converge em laços de
      realimentação (tratamento de delta-cycles / guarda contra oscilação).
- [ ] O motor produz um `SignalState` (`pinValues` + `wireValues`) consumível pelo
      `render.ts` **sem alterações no `render.ts`**.
- [ ] **Clock é nível (onda quadrada ~1Hz):** entradas em modo CLK oscilam com o tempo,
      acionando lógica combinacional (acompanha o blink) e flip-flops mestre-escravo/
      edge-triggered. O **JK level-triggered mínimo oscila** enquanto o clock fica alto —
      fiel ao hardware — e é **exibido como instável** (ver visualização de oscilação).
      _(Revisão: a abordagem de "clock por pulso para alternar o JK mínimo" foi abandonada
      durante a Fase 3 — nenhuma forma de onda concilia, no mesmo fio, acionar combinacional
      visivelmente e impedir a oscilação do JK mínimo; o nível é a escolha fiel e didática.)_
- [ ] Circuitos sequenciais já suportados continuam corretos: SR Latch e JK
      mestre-escravo mantêm memória entre frames e respondem como esperado.
- [ ] A integração no `main.ts` constrói/reconstrói o simulador **apenas quando a
      topologia muda** (via sinal de mudança no `store`), empurra alterações de
      entrada/clock como eventos e avança o tempo simulado a cada frame.
- [ ] A simulação permanece **qualitativamente fluida** em circuitos maiores do que o
      motor atual aguenta (sem alvo numérico fixo; avaliação por inspeção).

## Dependencies

- Depende do código atual de modelo/simulação: `src/model.ts`, `src/simulator.ts`,
  `src/store.ts`, `src/main.ts`, `src/render.ts`, `src/chip.ts` (resolução/expansão de
  chips). Nenhuma dependência de track incompleto.

## Out of Scope

- **Não** há garantia de equivalência bit-a-bit com o motor de relaxação atual; onde fizer
  sentido (notadamente o clock, que passa a ser pulso/edge em todo lugar), o comportamento
  observável **pode mudar**.
- **Não** inclui novas primitivas ou tipos de porta além das já existentes (NAND, I/O,
  chip), nem novos recursos de UI/editor.
- **Não** inclui alvo numérico formal de performance (fps × nº de portas) nem benchmark
  automatizado — a avaliação de fluidez é qualitativa neste track.
- **Não** inclui mudanças de persistência/serialização do circuito (IndexedDB/JSON).
- Clock configurável (largura de pulso/período pela UI) fica fora; o período segue o
  `CLOCK_PERIOD_MS` atual, com o clock emitindo pulso/edge.

## Technical Notes

- **Contrato-costura:** manter `SignalState { pinValues: Map<pinKey,boolean>,
  wireValues: Map<wireId,boolean> }` como fronteira estável entre motor e render. O
  `chipStates` atual é interno e some na nova arquitetura (a hierarquia é achatada).
- **Estratégia incremental sugerida:** introduzir um `Simulator` stateful atrás de uma
  função que ainda devolve `SignalState`, permitindo conviver/alternar com o motor antigo
  durante a transição.
- **Acoplamento novo:** o `store` hoje não tem notificação de mudança (`main.ts` re-lê
  tudo todo frame). Será preciso um contador de versão / dirty flag no `store` para o
  `main` saber quando recompilar o netlist.
- **Pontos de atenção do event-driven:** loops combinacionais de atraso-zero (resolver
  com atraso unitário por porta + teto de delta-cycles), pinos de entrada sem fio devem
  propagar `false` (como hoje), e remoção de fio/nó deve invalidar e recompilar.
- **Mapeamento de saída:** o netlist plano precisa reter o mapa pino-de-topo → net e
  fio-de-topo → net de origem, para reconstruir o `SignalState` que o `render.ts` espera.

---

_Generated by Conductor. Review and edit as needed._
