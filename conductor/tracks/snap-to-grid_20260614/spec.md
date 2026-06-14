# Specification: Snap to Grid com Conectores nos Cruzamentos

**Track ID:** snap-to-grid_20260614
**Type:** Feature
**Created:** 2026-06-14
**Status:** Draft

## Summary

Implementar _snap to grid_ no editor de circuitos de modo que componentes e,
principalmente, seus **conectores (pinos)** se alinhem aos cruzamentos das linhas da
grade ao serem criados ou movidos.

## Context

O NANDS-ON é um simulador de lógica digital em Vanilla TS + Canvas, voltado a estudantes
e entusiastas que montam circuitos a partir de portas elementares. O alinhamento à grade
torna os circuitos mais organizados, os fios mais legíveis e prepara o terreno para um
futuro roteamento ortogonal de fios.

## User Story

Como usuário montando circuitos, quero que os componentes e conectores se alinhem
automaticamente à grade, para que o circuito fique organizado e os fios fiquem retos e
legíveis.

## Decisões de Design (acordadas)

A grade e a geometria dos componentes são redefinidas para que **todo pino caia em um
cruzamento** da grade quando o componente está snapado:

1. **`GRID_SIZE`: 32 → 16** (unidades de mundo).
2. **Espaçamento vertical entre pinos fixo em 32** (= 2 células de grade), centralizado
   no corpo do componente.
3. **Largura fixa de 128** para todos os corpos retangulares (NAND e chips). Isso previne
   estouro por nomes extensos (que passarão a ser truncados visualmente).
4. **Altura = `max(nIn, nOut) × 32`** (mínimo 1 linha). Exemplos:
   - NAND (2 in, 1 out) → **128×64** (inputs em y=16, 48; output em y=32).
   - NOT/buffer (1 in, 1 out) → **128×32**.
   - Chip 2 in / 3 out → **128×96** (inputs em y=32, 64; outputs em y=16, 48, 80).
5. **Nós de I/O do circuito** (toggles): mantêm **40×40 redondos**. O snap deles se dá
   **pelo conector** — a posição do nó é ajustada para que o pino caia no cruzamento (não
   o canto).
6. **Snap sempre ativo** (sem liga/desliga).
7. **Sem migração** de dados: dimensões já são recalculadas ao carregar; posições antigas
   só se alinham quando o usuário move o nó.
8. **Raio das bordas arredondadas reduzido** — o corpo dos componentes hoje usa raio 8
   (`render.ts:207`); reduzir para um valor menor (ex.: 4–5) para um visual mais "quadrado"
   e coerente com a grade. Ajustar também o realce de seleção (raio 10 em `render.ts:326`)
   proporcionalmente.
9. **Efeitos sonoros de clique** — tocar um som curto de "clique" em dois eventos:
   (a) ao soltar (drop) um componente no grid e (b) ao criar uma conexão (fio) válida.
   Implementação leve via **Web Audio API** (cliques sintéticos, sem arquivos de áudio),
   para não pesar no carregamento. Respeitar interação inicial do usuário (o `AudioContext`
   só inicia após o primeiro gesto, conforme política dos navegadores).

### Garantia matemática

Com `PIN_SPACING = 32` centralizado e `h = max(nIn, nOut) × 32`, o primeiro pino de cada
lado começa em `(max − count + 1) × 16` e os seguintes a cada 32 — todos múltiplos de 16.
Largura 128 e x ∈ {0, 128} também são múltiplos de 16. Logo, com o canto snapado a um
múltiplo de 16, **todos os pinos caem em cruzamentos**.

## Acceptance Criteria

- [ ] `GRID_SIZE` passa a 16; a grade é desenhada com o novo espaçamento.
- [ ] NAND mede 128×64 com pinos em y = 16, 48 (entradas) e 32 (saída).
- [ ] Chips têm largura fixa 128 e altura `max(nIn, nOut) × 32`, com pinos espaçados de 32
      e centralizados; todos os offsets de pino são múltiplos de 16.
- [ ] Ao **criar** um componente (tap ou arrastar da paleta), ele nasce snapado e seus
      conectores caem em cruzamentos.
- [ ] Ao **mover** um componente retangular, o canto snapa ao grid (16) e os conectores
      caem em cruzamentos.
- [ ] Ao **mover** um nó de I/O (40×40), o ajuste leva o **conector** ao cruzamento mais
      próximo, mantendo o tamanho 40×40.
- [ ] Nomes de chip que excedem a largura 128 são truncados visualmente (ex.: reticências)
      sem quebrar o layout dos rótulos de pino.
- [ ] Hit testing (seleção de pino/nó/fio) continua funcionando com a nova geometria.
- [ ] Circuitos salvos anteriormente abrem sem erro; dimensões recalculadas, posições
      antigas preservadas até serem movidas.
- [ ] O raio das bordas arredondadas dos componentes está reduzido (corpo e realce de
      seleção), com aparência consistente em todos os tipos de nó.
- [ ] Um som de clique toca ao soltar um componente no grid.
- [ ] Um som de clique toca ao criar uma conexão (fio) válida.
- [ ] O áudio não dispara erros quando o `AudioContext` ainda não foi habilitado por
      gesto do usuário (degrada silenciosamente).

## Dependencies

Nenhuma dependência externa ou de outro track. Alterações concentradas no código de
modelo/render/interação já existente (`grid.ts`, `model.ts`, `render.ts`, `main.ts`,
`hittest.ts`).

## Out of Scope

- **Roteamento ortogonal de fios (estilo Manhattan):** fios continuam curvos (Bézier).
  Será um track futuro. Esta track deve apenas **preservar a extensibilidade** — garantir
  que os pinos fiquem em cruzamentos da grade (pré-condição do roteamento futuro) e evitar
  decisões que forcem refatoração posterior dos fios.
- Migração/re-snap automático de circuitos já salvos.
- Toggle de liga/desliga do snap.

## Technical Notes

Pontos de código identificados:

- **Grade:** `src/grid.ts` — `GRID_SIZE` (32→16) e `drawGrid()`.
- **Dimensões/pinos:** `src/model.ts` — `NODE_SIZE` (NAND→128×64), `chipSize()` (largura
  fixa 128, altura `max×32`), `createPins()` (offsets do NAND), `chipInstancePins()`
  (espaçamento 32 centralizado). Considerar **função compartilhada** de distribuição de
  pinos entre NAND e chips (`pinYs(count, h)` com `PIN_SPACING = 32`).
- **Snap:** novo helper em `grid.ts` (ex.: `snapToGrid(v)` e `snapNodePos(node)`), com
  duas estratégias — por canto (NAND/chip) e por conector (I/O).
- **Interação:** `src/main.ts` — aplicar snap no `pointermove` de `dragNode`, na criação
  via paleta (`addNodeAt` / `spawnItem`) e no preview (`previewNode`).
- **Render:** `src/render.ts` — truncamento do nome do chip à largura fixa; revisar
  reservas de rótulo de pino (`pinLabelReserve`); reduzir raio do corpo (linha 207) e do
  realce de seleção (linha 326).
- **Hit testing:** `src/hittest.ts` — validar tolerâncias com a nova escala.
- **Áudio (novo módulo):** ex.: `src/audio.ts` — `AudioContext` lazy + função de clique
  sintético; disparar no drop (em `src/main.ts`, no `pointerup` de `dragNode`/criação) e
  na criação de fio válido (após validação em `src/connection.ts` / `main.ts`).

---

_Generated by Conductor. Review and edit as needed._
