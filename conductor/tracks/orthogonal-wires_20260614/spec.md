# Specification: Roteamento Ortogonal de Fios

**Track ID:** orthogonal-wires_20260614
**Type:** Feature
**Created:** 2026-06-14
**Status:** Draft

## Summary

Substituir as curvas Bézier dos fios por **caminhos ortogonais alinhados à grade**
(estilo Manhattan), onde cada fio tem uma única "barra" intermediária ajustável pelo
usuário.

## Context

O NANDS-ON é um simulador de lógica digital em Vanilla TS + Canvas. Após o track
[snap-to-grid](../snap-to-grid_20260614/spec.md), todos os pinos caem em cruzamentos da
grade (`GRID_SIZE = 16`), o que é a pré-condição natural para fios ortogonais. Hoje o
`Wire` é minimalista (`{ id, from, to }`) e desenhado como Bézier cúbica horizontal
(`render.ts: drawWireSegment`); o hit-testing usa distância a um único segmento.

## User Story

Como usuário montando circuitos, quero que os fios sigam caminhos ortogonais alinhados à
grade, para que o diagrama fique mais limpo, legível e parecido com um esquemático real.

## Decisões de Design (acordadas)

Cada fio tem **uma única barra intermediária** cujo formato e eixo de ajuste dependem da
posição relativa dos pinos:

### Caso A — saída à esquerda da entrada (`out.x < in.x`): caminho em **Z** (3 segmentos)

```
 out ─────┐  ← barra VERTICAL (ajuste horizontal ◄►)
          │
          └───── in
```

- Segmentos: H (out → x_barra), V (out.y → in.y), H (x_barra → in).
- A barra é o segmento vertical em `x = x_barra`, **ajustável horizontalmente**, em passos
  de grade, entre `out.x` e `in.x`.
- Padrão: `x_barra` no meio horizontal, snapado à grade.

### Caso B — saída à direita/alinhada à entrada (`out.x ≥ in.x`): caminho em **S** (5 segmentos)

```
        ┌──── out    ← sai exatamente 1 grid
        │
 ───────┘  ← barra HORIZONTAL (ajuste vertical ▲▼)
 │
 └──── (entra 1 grid) ── in
```

- Segmentos: H de 1 grid saindo de `out`, V, H (a barra, em `y = y_barra`), V, H de 1 grid
  entrando em `in`.
- Os trechos junto aos pinos têm **exatamente 1 grid (16)** de comprimento.
- A barra é o segmento horizontal do meio em `y = y_barra`, **ajustável verticalmente**, em
  passos de grade.
- Padrão: `y_barra` no meio vertical, snapado à grade.

### Comportamento

- **Ajuste persistente relativo:** o deslocamento da barra é guardado como **offset
  relativo** ao caminho padrão. Ao mover um nó conectado, o caminho recalcula preservando o
  offset. Se a topologia inverter (Z ↔ S), o offset **reseta** ao padrão do novo caso.
- **Edição por mouse e toque:** arrastar a barra funciona com mouse e com o dedo (tolerância
  maior no toque).
- **Snap:** posição da barra sempre em múltiplos de `GRID_SIZE` (16).

## Acceptance Criteria

- [ ] Fios são desenhados como caminhos ortogonais (sem Bézier): Z (3 segmentos) quando
      `out.x < in.x`, S (5 segmentos) quando `out.x ≥ in.x`.
- [ ] No caso S, os trechos junto aos dois pinos têm exatamente 1 grid de comprimento.
- [ ] A barra do Z é ajustável horizontalmente; a do S, verticalmente — ambas em passos de
      grade, dentro de limites coerentes.
- [ ] O ajuste da barra é preservado (offset relativo) ao mover nós conectados; reseta ao
      padrão se o caso Z/S inverter.
- [ ] A barra é arrastável por mouse e por toque.
- [ ] O fio fantasma (durante a criação) já aparece com o traçado ortogonal e o padrão da
      barra, mantendo o feedback de validade (verde/vermelho).
- [ ] As cores por estado (desligado/ligado/oscilando) continuam funcionando no novo
      traçado.
- [ ] Hit-testing de fio considera todos os segmentos (seleção/exclusão do fio continua
      precisa).
- [ ] O offset da barra é serializado junto do `Wire` (chips capturados preservam o
      traçado ajustado).

## Dependencies

Depende da geometria alinhada à grade entregue em
[snap-to-grid_20260614](../snap-to-grid_20260614/spec.md) (pinos em cruzamentos,
`GRID_SIZE`, `snapToGrid`). Sem dependências externas.

## Out of Scope

- **Pathfinding com desvio de componentes (A*/BFS):** os fios podem cruzar componentes;
  não há contorno automático de obstáculos.
- **Múltiplos waypoints por fio:** apenas a barra única descrita acima.
- **Roteamento que evita sobreposição entre fios.**
- Persistência do espaço de trabalho entre sessões (continua não persistido; o offset da
  barra só persiste dentro de definições de chip, via `CircuitState`).

## Technical Notes

- **Modelo (`model.ts`):** adicionar ao `Wire` um campo opcional de ajuste — p.ex.
  `barOffset?: number` (deslocamento relativo ao padrão, em unidades de mundo/grade;
  interpretado no eixo X para o caso Z e no eixo Y para o caso S). `undefined` = padrão.
- **Geometria (novo helper):** função pura que, dados `from`/`to` (mundo) e o `barOffset`,
  retorna a lista de vértices do caminho (3 ou 5 pontos) — reutilizada por render e
  hit-testing. Determina o caso por `out.x < in.x`.
- **Render (`render.ts`):** substituir `drawWireSegment` (Bézier) por um traçado de
  polilinha ortogonal a partir dos vértices; aplicar a fios reais e ao fantasma
  (`drawGhostWire`). Manter cores/tracejado.
- **Hit-testing (`hittest.ts`):** `hitWire` passa a medir distância à polilinha (mínimo
  entre segmentos). Adicionar detecção específica da **barra** para iniciar seu arraste.
- **Interação (`main.ts`):** novo modo (ex.: `dragWaypoint`) — `pointerdown` sobre a barra
  inicia o arraste; `pointermove` atualiza `barOffset` com snap; tolerância maior no toque
  (`hitPx`). Recalcular o caminho ao mover nós, preservando o offset relativo.
- **Serialização:** transparente via `CircuitState`/`store.toJSON()` — basta o novo campo
  no `Wire`.
- **Casos de borda:** pinos na mesma altura (Z degenera em reta horizontal); pinos muito
  próximos no caso S (trechos de 1 grid podem colidir — clampar/encolher com coerência);
  garantir reset do offset ao inverter Z↔S.

---

_Generated by Conductor. Review and edit as needed._
