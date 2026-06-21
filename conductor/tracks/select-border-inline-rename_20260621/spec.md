# Specification: Borda de Seleção Alinhada e Renomeação In-Place

**Track ID:** select-border-inline-rename_20260621
**Type:** Improvement
**Created:** 2026-06-21
**Status:** Draft

## Summary

Dois ajustes pequenos e relacionados na UI do editor:

1. **Borda de seleção da paleta:** o anel laranja que marca o chip selecionado
   deve coincidir exatamente com a borda do componente — hoje aparece um pouco
   menor/recuado.
2. **Renomeação in-place:** ao renomear um chip (na paleta) ou um nó de I/O (no
   espaço), a edição deve acontecer **diretamente sobre o próprio componente**,
   sem um campo de edição extra flutuando ao lado/abaixo.

## Context

- A paleta (`#palette-list`) lista botões de chip (`button.chip-btn`). Selecionar
  um chip aplica a classe `.selected`, estilizada em `src/style.css:177-181`.
- A renomeação usa um editor in-place reutilizável: um overlay flutuante
  (`#rename-overlay` + `#rename-input` em `index.html`, estilo em
  `src/style.css:426-459`), aberto por `openInlineEditor()` em `src/main.ts:619`.
  - Para chips: `openChipNameEdit()` (`main.ts:427`) posiciona o overlay **abaixo**
    do botão (`transform: translate(-50%, 8px)`).
  - Para I/O: `openRenameOverlay()` (`main.ts:653`) posiciona o overlay **acima**
    do nó (ou abaixo, se faltar espaço no topo), nunca sobre o nó.

## Problem Description

### Problema 1 — Borda de seleção não coincide com a borda do componente

**Atual:** O estado selecionado usa `border-color: #e0af68` (borda de 1px na
aresta) **mais** um `box-shadow: 0 0 0 2px rgba(224, 175, 104, 0.45)` (anel
translúcido externo). O anel translúcido é difuso e a borda nítida de 1px é fina,
de modo que o indicador laranja parece recuado/menor que o contorno visual do
botão.

**Esperado:** O indicador laranja de seleção deve coincidir com a borda
arredondada do botão (mesma posição da aresta e mesmo `border-radius`), nítido e
claramente visível, sem dar a impressão de estar "menor" que o componente.

### Problema 2 — Campo de edição extra ao renomear

**Atual:** Renomear abre um overlay separado (uma caixa com input) deslocado para
fora do componente (abaixo do botão do chip; acima/abaixo do nó de I/O). Há,
portanto, um "campo de edição extra" visualmente desacoplado do componente.

**Esperado:** A edição do nome deve ocorrer **no lugar do próprio componente**:
- **Chip na paleta:** o input substitui o rótulo do botão, ocupando a mesma área
  (mesma posição e dimensões do botão), como se o usuário digitasse dentro do
  próprio botão.
- **Nó de I/O no canvas:** o input aparece sobre o retângulo do nó (mesma posição
  e largura na tela, respeitando o zoom da câmera), em vez de flutuar acima/abaixo.

## Acceptance Criteria

- [ ] AC1: O anel laranja do chip selecionado coincide com a borda do botão —
      mesma aresta arredondada, sem recuo perceptível, e claramente visível.
- [ ] AC2: A borda de seleção não causa "salto"/deslocamento de layout dos demais
      botões da paleta ao selecionar/desselecionar.
- [ ] AC3: Ao renomear um chip, o input ocupa a área do próprio botão na paleta
      (sem caixa de edição extra deslocada), com o texto pré-selecionado.
- [ ] AC4: Ao renomear um nó de I/O, o input aparece sobre o próprio nó no canvas
      (posição/largura acompanham o nó e o zoom), sem caixa flutuante deslocada.
- [ ] AC5: Confirmar (Enter / clicar fora) e cancelar (Esc) continuam funcionando;
      nomes vazios/duplicados de chip continuam sendo rejeitados sem travar.
- [ ] AC6: A renomeação por toque/duplo-toque e pela barra de ações (Rename)
      continua funcionando em mouse e touch.

## Out of Scope

- Mudanças na lógica de validação de nomes (`validateChipName`) ou de propagação
  de nome para instâncias (`propagateChipName`).
- Redesenho da barra de ações ou de outros estados visuais da paleta.

## Dependencies

- Nenhuma dependência externa nova. Mantém-se Vanilla TS + Canvas.
