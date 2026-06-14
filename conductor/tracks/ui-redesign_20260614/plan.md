# Implementation Plan: Reorganização da UI do Editor

**Track ID:** ui-redesign_20260614
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-14
**Status:** [x] Complete

## Overview

A reorganização é puramente de UI: muda estrutura HTML, CSS de layout e a fiação de
eventos em `src/main.ts`, reaproveitando toda a lógica de interação existente
(drag-to-create, seleção, make, edição de chip, tutorial, persistência). O trabalho é
quebrado por região da tela, do esqueleto para os detalhes, deixando os controles
condicionais (scroll, ações contextuais) por último. Validação final via `npm run build`.

## Phase 1: Fundação — Textos e Esqueleto de Layout

Preparar strings i18n e o esqueleto HTML/CSS das novas regiões sem ainda mover
comportamento, para isolar o risco de regressão.

### Tasks

- [x] Task 1.1: Adicionar novos textos em `src/strings.ts` (`commands`, `import`,
      `export`, `edit`, `rename`, `delete`) mantendo a base de i18n (`data-i18n`).
- [x] Task 1.2: Definir a estrutura HTML das novas regiões em `index.html`: caixa de I/O,
      barra vertical de componentes, container do menu ≡, barra de ações contextual.
- [x] Task 1.3: Esboçar o CSS de posicionamento dessas regiões em `src/style.css`
      (topo-esquerda I/O + barra vertical; topo-direita menu; inferior-central ações).

### Verification

- [x] `npm run build` passa; as novas regiões aparecem na posição correta (ainda que
      sem comportamento completo) sem quebrar o canvas/paleta atual.

## Phase 2: Caixa de I/O e Barra de Componentes Vertical

Migrar IN/OUT para a caixa dedicada e transformar a paleta horizontal numa barra vertical
com o MAKE embutido.

### Tasks

- [x] Task 2.1: Mover os botões circulares IN/OUT para a caixa dedicada, preservando o
      `attachPaletteDrag` (arrastar-para-criar).
- [x] Task 2.2: Converter a paleta para coluna vertical, listando NAND e chips criados
      (ajustar `refreshPalette` e o CSS de `#palette`).
- [x] Task 2.3: Mover o botão MAKE (verde) para dentro da barra vertical, mantendo a
      condição `canMake()` (≥1 IN e ≥1 OUT) e o ocultamento durante edição de chip.

### Verification

- [x] `npm run build` passa; criar IN/OUT/NAND/chips por arrasto continua funcionando e o
      MAKE aparece/some conforme a condição.

## Phase 3: Controles de Scroll da Barra

Adicionar scroll condicional (▲/▽) à barra de componentes para escalar com muitos chips.

### Tasks

- [x] Task 3.1: Implementar área rolável da barra (overflow) com os indicadores ▲/▽.
- [x] Task 3.2: Exibir os controles de scroll **apenas** quando o conteúdo excede a
      altura disponível; ocultar caso contrário.

### Verification

- [x] Com poucos chips, ▲/▽ ficam ocultos; com muitos, aparecem e rolam a lista. Build OK.

## Phase 4: Menu de Comandos (≡)

Consolidar comandos no menu hambúrguer e migrar CLEAR DB e ABOUT para dentro dele.

### Tasks

- [x] Task 4.1: Implementar o botão ≡ e o painel COMMANDS (abrir/fechar) no topo-direita.
- [x] Task 4.2: Mover CLEAR DB e ABOUT para itens do menu, preservando seus comportamentos
      atuais (confirmação + limpar IndexedDB; painel Sobre/boas-vindas).
- [x] Task 4.3: Adicionar IMPORT e EXPORT como itens **placeholder** (sem lógica de
      serialização nesta track), com CLEAR DB em destaque (laranja).

### Verification

- [x] `npm run build` passa; menu abre/fecha; CLEAR DB e ABOUT funcionam como antes;
      IMPORT/EXPORT visíveis como placeholders.

## Phase 5: Barra de Ações Contextual e Remoção do Duplo-Toque

Introduzir a barra inferior EDIT/RENAME/DELETE sensível ao contexto e remover o renomear
por duplo-toque.

### Tasks

- [x] Task 5.1: Implementar a barra inferior-central que aparece quando há item
      selecionado, mostrando apenas as ações aplicáveis:
      chip da barra → EDIT/RENAME/DELETE; nó I/O → RENAME/DELETE; outros nós/fios → DELETE.
- [x] Task 5.2: Religar EDIT (abrir circuito interno), DELETE (nó/fio e chip) e RENAME
      (rótulo de I/O e nome de chip) à nova barra, reaproveitando os handlers existentes.
- [x] Task 5.3: Remover o gatilho de renomear por duplo-toque/duplo-clique (I/O e chips),
      mantendo o overlay de edição de nome acionado agora pelo RENAME.

### Verification

- [x] `npm run build` passa; selecionar chip/nó/fio mostra as ações corretas; renomear só
      via RENAME; duplo-toque não dispara mais renomear.

## Phase 6: Reposicionamento do Tutorial e Polimento

Mover o callout do tutorial e revisar a experiência em desktop e touch.

### Tasks

- [x] Task 6.1: Reposicionar o callout "Step X of N" para o topo-central (CSS), garantindo
      que o realce dos alvos do tutorial continue apontando para os elementos certos.
- [x] Task 6.2: Revisar layout e usabilidade em telas pequenas (touch) e desktop;
      ajustar espaçamentos/sobreposições.

### Verification

- [x] Tutorial completo (8 passos) flui com o callout no topo; UI utilizável em mobile e
      desktop. Build OK.

## Final Verification

- [x] Todos os critérios de aceitação atendidos
- [x] `npm run build` passa sem erros de tipo
- [x] Comportamento de simulação/interação inalterado (verificação manual no fechamento)
- [x] Documentação atualizada (se aplicável)
- [x] Pronto para review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
