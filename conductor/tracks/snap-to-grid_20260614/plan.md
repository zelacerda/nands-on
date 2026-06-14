# Implementation Plan: Snap to Grid com Conectores nos Cruzamentos

**Track ID:** snap-to-grid_20260614
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-14
**Status:** [ ] Not Started

## Overview

A implementação parte da **geometria** (redefinir grade e dimensões/pinos para que tudo
seja múltiplo de 16) e só então aplica a **lógica de snap** sobre essa base — assim o snap
do canto já posiciona os conectores nos cruzamentos. Em seguida vêm os **ajustes visuais**
(raio das bordas, truncamento de nome) e o **feedback sonoro**. Testes cobrem a lógica
geométrica e de snap (correção crítica e difícil de verificar a olho); UI/áudio são
verificados manualmente. Conforme o workflow, a verificação formal ocorre só no
encerramento do track.

## Phase 1: Geometria Base (grade, dimensões e pinos)

Redefinir a escala e a geometria dos componentes para que todos os offsets de pino sejam
múltiplos de 16, garantindo a queda nos cruzamentos.

### Tasks

- [x] Task 1.1: Reduzir `GRID_SIZE` de 32 para 16 em `src/grid.ts` e conferir `drawGrid()`
      (linhas major/minor continuam coerentes com `MAJOR_EVERY`).
- [x] Task 1.2: Atualizar `NODE_SIZE.nand` para 128×64 em `src/model.ts` (input/output
      permanecem 40×40).
- [x] Task 1.3: Introduzir `PIN_SPACING = 32` e uma função compartilhada de distribuição
      vertical de pinos (ex.: `pinYs(count, h)`) que centraliza `count` pinos espaçados de
      32 dentro da altura `h`.
- [x] Task 1.4: Reescrever `createPins('nand')` para usar `pinYs` (entradas em y=16, 48;
      saída em y=32) em vez dos fatores 0.3/0.7/0.5.
- [x] Task 1.5: Reescrever `chipSize()` para **largura fixa 128** e **altura
      `max(nIn, nOut, 1) × 32`**; simplificar/aposentar constantes de largura por caractere
      que deixarem de ser usadas (`CHIP_MIN_W`, `CHIP_PAD_X`, `CHIP_NAME_CHAR_W`, etc.).
- [x] Task 1.6: Atualizar `chipInstancePins()` para usar `pinYs` (espaçamento 32
      centralizado) no lugar da distribuição uniforme `(h*(i+1))/(count+1)`.
- [x] Task 1.7: Escrever testes (vitest) verificando que, para NAND e chips de várias
      combinações de in/out, todos os offsets de pino (x e y) são múltiplos de 16 e a
      altura é `max(nIn, nOut) × 32`.

### Verification

- [x] Testes de geometria passam; abrir a app e conferir visualmente NAND/chips com a nova
      proporção e pinos alinhados.

## Phase 2: Lógica de Snap

Aplicar o snap na criação e na movimentação, com as duas estratégias acordadas (por canto
para retangulares; pelo conector para I/O).

### Tasks

- [x] Task 2.1: Criar helpers em `src/grid.ts`: `snapToGrid(v)` (arredonda para múltiplos
      de `GRID_SIZE`) e `snapNodePos(node)` que escolhe a estratégia — canto para
      `nand`/`chip`, conector para `input`/`output` (ajusta `pos` para o pino cair no
      cruzamento, mantendo 40×40).
- [x] Task 2.2: Aplicar snap no arraste de nó (`src/main.ts`, `pointermove` do modo
      `dragNode`) e ao finalizar o arraste.
- [x] Task 2.3: Aplicar snap na criação via paleta (`addNodeAt`/`spawnItem`) e no
      `previewNode` (preview já aparece alinhado ao alvo).
- [x] Task 2.4: Escrever testes da lógica de snap: canto de retangular arredonda a 16;
      conector de I/O cai em cruzamento para posições arbitrárias.

### Verification

- [x] Testes passam; mover/criar componentes na app confirma conectores nos cruzamentos
      (retangulares e I/O).

## Phase 3: Ajustes Visuais e Robustez

### Tasks

- [x] Task 3.1: Reduzir o raio das bordas do corpo em `src/render.ts:207` (8 → ~4–5) e
      ajustar o realce de seleção (`:326`) proporcionalmente. Feito via constante
      `BODY_CORNER_RADIUS = 4` (corpo) e `+2` no realce.
- [x] Task 3.2: Garantir truncamento do nome do chip à largura fixa 128 (reticências) —
      já coberto por `drawLabel`/`fitText`, que trunca o nome dentro de `centerMax` (largura
      menos as reservas laterais de rótulo de pino), sem sobreposição.
- [x] Task 3.3: Revisar hit testing (`src/hittest.ts`) e tolerâncias (`hitPx`/`worldTol`
      em `main.ts`) — o espaçamento de pino aumentou (22→32), reduzindo ambiguidade;
      `PIN_RADIUS`/tolerâncias seguem adequados e os testes de `hittest` passam.

### Verification

- [x] Inspeção visual: bordas mais discretas, nomes longos truncados sem quebrar layout,
      seleção precisa no mouse e no toque.

## Phase 4: Feedback Sonoro

### Tasks

- [x] Task 4.1: Criar módulo `src/audio.ts` com `AudioContext` lazy (inicializado no
      primeiro gesto) e uma função de clique sintético (oscilador/envelope curto); degradar
      silenciosamente quando o contexto não estiver disponível.
- [x] Task 4.2: Disparar o clique no **drop** de um componente no grid (`src/main.ts`) —
      em `spawnItem` (criação) e ao soltar após reposicionar (arrasto real).
- [x] Task 4.3: Disparar o clique na **criação de conexão válida** (após a validação em
      `src/connection.ts`/`main.ts`).

### Verification

- [x] Sons tocam nos dois eventos; nenhum erro de console quando o áudio ainda não foi
      habilitado por gesto.

## Final Verification

- [x] Critérios de aceitação cobertos por testes atendidos (geometria, snap, offsets
      múltiplos de 16, altura `max×32`); critérios visuais/sonoros pendentes de validação
      manual do usuário.
- [x] `npm run test` (131 testes) e `npm run build` (tsc + vite build) passam.
- [ ] Verificação manual na app (desktop e toque): snap, conectores nos cruzamentos,
      visual das bordas, truncamento de nomes e sons. **Pendente — usuário.**
- [x] Extensibilidade preservada para roteamento ortogonal futuro (pinos em cruzamentos;
      fios não refatorados).
- [ ] README atualizado, se aplicável.
- [ ] Pronto para revisão.

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
