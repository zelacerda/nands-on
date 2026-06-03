# Specification: Simulação de Circuitos Sequenciais (Realimentação)

**Track ID:** sequential-sim_20260602
**Type:** Bug
**Created:** 2026-06-02
**Status:** Draft

## Summary

O motor de simulação é puramente combinacional e não suporta loops de
realimentação, então circuitos sequenciais como o SR Latch (duas portas NOR
realimentadas) não reproduzem sua tabela-verdade. Este track expande o motor
para preservar estado entre avaliações e convergir realimentações de forma
determinística.

## Context

O **From NAND to CPU** tem como objetivo construir, progressivamente, blocos
cada vez mais complexos partindo da NAND até uma CPU. A memória (latches,
flip-flops, registradores) é um pré-requisito fundamental nesse caminho, e ela
depende inteiramente de circuitos **sequenciais com realimentação**. O motor
atual (`src/simulator.ts`), implementado no track `chip-logic_20260531`, declara
explicitamente os ciclos como "fora de escopo" (comentário na linha 28). Sem
suporte a realimentação, o roadmap rumo à CPU fica bloqueado.

## Problem Description

Ao montar um **SR Latch** com duas portas NOR realimentadas (a saída de cada
NOR alimenta uma entrada da outra), o circuito não reproduz a tabela-verdade
esperada. Especificamente, com ambos os inputs desligados (R=0, S=0), o circuito
deveria manter o estado anterior, com **um** dos outputs ligado — mas isso não
acontece.

### Passos para reproduzir (cenário relatado)

1. Criar uma **NOT** a partir de uma NAND, com um IN ligado nas duas entradas e
   uma saída.
2. Criar uma **OR** com três NANDs.
3. Criar uma **NOR** ligando uma OR a uma NOT.
4. Montar um **SR Latch** com duas NORs realimentadas.
5. Acionar os inputs seguindo a tabela-verdade do SR Latch.

### Causa raiz (confirmada por análise de código)

`src/simulator.ts` apresenta duas limitações que, juntas, quebram qualquer
circuito sequencial:

1. **Estado não preservado entre frames** (`simulator.ts:44-45`): toda avaliação
   reinicia todos os pinos em `false`. Um latch é memória — o estado de "hold"
   depende de lembrar o valor anterior; sem isso não há como escolher qual dos
   dois estados estáveis manter.
2. **Atualização paralela oscila em realimentação** (`simulator.ts:63-71`): o
   motor recalcula todas as saídas e só então propaga pelos fios. Num SR Latch
   com R=S=0 partindo de tudo `false`, os outputs alternam entre `1,1` e `0,0` a
   cada iteração, oscilando até o teto `maxIter` cortar — resultado indefinido.

## Expected vs Actual Behavior

**Esperado** — o SR Latch (NOR) deve respeitar sua tabela-verdade:

| S | R | Q (após)        | Q̄ (após)       |
| - | - | --------------- | -------------- |
| 0 | 0 | mantém anterior | mantém anterior |
| 0 | 1 | 0               | 1              |
| 1 | 0 | 1               | 0              |
| 1 | 1 | 0               | 0 (proibido)   |

Em especial, com S=0 e R=0 após um Set/Reset, o latch deve **manter** o estado,
com um dos outputs ligado.

**Atual** — o circuito oscila / produz resultado indefinido; o estado de "hold"
não é mantido e a tabela-verdade não é reproduzível.

## Acceptance Criteria

- [ ] O motor preserva o estado dos sinais entre avaliações sucessivas (memória
      de runtime).
- [ ] Loops de realimentação convergem de forma determinística, sem oscilar
      indefinidamente nem depender do teto de iterações para "parar".
- [ ] Um SR Latch montado com duas NORs reproduz integralmente a tabela-verdade
      acima, incluindo o estado de "hold" (S=0, R=0) com um output ligado.
- [ ] Circuitos puramente combinacionais (NAND, NOT, OR, NOR, etc.) continuam
      avaliando corretamente, sem regressão.
- [ ] Chips aninhados (resolvidos via `resolveChip`) que contenham realimentação
      interna também funcionam.
- [ ] Há testes cobrindo a convergência da realimentação e a tabela-verdade do
      SR Latch (lógica crítica, conforme `workflow.md`).

## Dependencies

Depende do código existente do motor de simulação (`src/simulator.ts`,
`src/model.ts`), entregue no track `chip-logic_20260531`.

## Out of Scope

- **Clock explícito / disparo por borda** — componente de clock dedicado e
  flip-flops edge-triggered ficam para um track futuro; aqui cobrimos apenas
  latches por realimentação.
- **Detecção de condição de corrida / metaestabilidade na UI** — o motor só
  precisa convergir de forma determinística; não há aviso de instabilidade.
- **Persistência do estado sequencial** — o estado de memória dos latches vive
  apenas em runtime, não é salvo no IndexedDB entre sessões.
- **Visualização de timing** — sem gráficos de forma de onda ou diagramas
  temporais.

## Technical Notes

- A abordagem candidata é o modelo "com atraso de propagação" (à la
  Digital-Logic-Sim do Lague): preservar o estado dos pinos/fios entre frames e,
  a cada avaliação, calcular o próximo estado a partir do estado anterior. A
  realimentação então "memoriza" naturalmente e o latch estabiliza ao longo de
  alguns frames, em vez de oscilar dentro de um único frame.
- A `SignalState` (ou um estado persistente equivalente) precisa ser carregada
  entre chamadas de `simulate`, em vez de recriada do zero.
- Atenção à recursão de chips: cada instância de chip com realimentação interna
  precisa manter seu próprio estado entre frames.

---

_Generated by Conductor. Review and edit as needed._
