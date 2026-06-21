# Implementation Plan: Borda de Seleção Alinhada e Renomeação In-Place

**Track ID:** select-border-inline-rename_20260621
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-21
**Status:** [ ] Pending

## Overview

Dois ajustes de UI, sem alterar lógica de simulação nem validação de nomes:

1. **Borda de seleção (CSS only):** trocar a combinação `border-color` + `box-shadow`
   translúcido por um indicador laranja sólido que coincide com a aresta do botão.
2. **Renomeação in-place:** reposicionar/redimensionar o editor existente
   (`#rename-overlay`/`#rename-input`) para ocupar a área do próprio componente —
   sobre o botão do chip na paleta e sobre o retângulo do nó de I/O no canvas —
   em vez de flutuar deslocado.

Por ser tudo UI/render, segue-se o TDD flexível do projeto (sem testes
obrigatórios); a verificação é manual, no fechamento do track, via dev server.

## Phase 1: Borda de seleção alinhada

Ajustar o estado `.selected` do chip na paleta para que o anel laranja coincida
com a borda do botão.

### Tasks

- [x] Task 1.1: Em `src/style.css` (regra `#palette button.chip-btn.selected`,
      linhas ~177-181), substituir o `box-shadow` translúcido difuso por um
      indicador laranja sólido alinhado à aresta do botão (ex.: `box-shadow:
      0 0 0 2px #e0af68` nítido, ou `outline`/`border` equivalente), mantendo o
      `border-radius` do botão e sem encolher visualmente o contorno.
- [x] Task 1.2: Garantir que o estado selecionado não cause deslocamento de
      layout (usar `box-shadow`/`outline`, que não afetam o fluxo; se mexer na
      espessura de `border`, compensar para não empurrar vizinhos).

### Verification

- [ ] App compila (`tsc`/build) sem erros.

## Phase 2: Renomeação in-place do chip (paleta)

Fazer o editor de nome do chip ocupar a área do próprio botão.

### Tasks

- [x] Task 2.1: Generalizar `openInlineEditor()` (`src/main.ts:619`) para aceitar,
      além de `left/top/transform`, uma geometria opcional de "caixa" (largura e
      altura alvo) que faça o input ocupar a área do componente em vez do
      auto-size por `size`.
- [x] Task 2.2: Reescrever `openChipNameEdit()` (`main.ts:427`) para posicionar o
      overlay exatamente sobre o botão do chip (usando `getBoundingClientRect()`:
      mesma `left/top/width/height`), sem o deslocamento `translate(-50%, 8px)`.
- [x] Task 2.3: Ajustar o estilo do `#rename-overlay`/`#rename-input`
      (`src/style.css:426-459`) para, no modo "sobre o componente", o input
      preencher a caixa (sem o padding/gap do overlay flutuante empurrarem o
      campo para fora da área do botão).

### Verification

- [ ] Build sem erros; o input do chip cobre o botão na paleta (validar na fase
      de teste manual).

## Phase 3: Renomeação in-place do nó de I/O (canvas)

Fazer o editor de nome do nó de I/O aparecer sobre o próprio nó no canvas.

### Tasks

- [ ] Task 3.1: Reescrever `openRenameOverlay()` (`main.ts:653`) para posicionar o
      input sobre o retângulo do nó: converter `node.pos`/`nodeSize(node)` para
      coordenadas de tela via `camera.worldToScreen()` e aplicar zoom à largura,
      ocupando a área do nó (sem o flip acima/abaixo deslocado).
- [ ] Task 3.2: Tratar o caso do teclado virtual em mobile (o nó pode ficar sob o
      teclado): manter o input visível (ex.: garantir `scrollIntoView`/foco com
      `preventScroll`) sem reintroduzir uma caixa flutuante deslocada.

### Verification

- [ ] Build sem erros; o input do I/O cobre o nó no canvas (validar na fase de
      teste manual).

## Phase 4: Verificação final

### Tasks

- [ ] Task 4.1: Rodar build/typecheck e revisar o próprio diff.
- [ ] Task 4.2: Subir o dev server (`npm run dev`) e fornecer roteiro de teste
      manual cobrindo AC1–AC6 do `spec.md`.

### Verification

- [ ] Todos os critérios de aceitação (AC1–AC6) validados manualmente pelo usuário.
