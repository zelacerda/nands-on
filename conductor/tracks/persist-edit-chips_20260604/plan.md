# Implementation Plan: Persistência Local e Edição de Chips

**Track ID:** persist-edit-chips_20260604
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-04
**Status:** [ ] Not Started

## Overview

Implementação em cinco fases. Começa pela **persistência** da biblioteca em IndexedDB
(fundação), passa pela **interação na barra superior** (revelar "Editar" e renomear por
duplo clique), depois o **modo de edição** (abrir o interno do chip preservando o espaço),
em seguida a parte mais delicada — **salvar com reconciliação de instâncias por índice** —
e por fim o **botão de limpar banco (dev)** e a verificação. Conforme o `workflow.md`
(TDD flexível), há testes para a lógica complexa (serialização/persistência e
reconciliação); a parte de UI é validada manualmente. Commits seguem Conventional Commits.

## Phase 1: Persistência da biblioteca em IndexedDB

Criar uma camada de persistência que salva/carrega as `ChipDefinition` no IndexedDB e
integrá-la ao `ChipLibrary`, restaurando o contador de ids (`seq`) para evitar colisões.

### Tasks

- [x] Task 1.1: Criar `src/persistence.ts` com abertura do banco (object store de chips) e
      funções assíncronas `loadAll()` / `saveAll(defs)` (ou save/delete por chip).
- [x] Task 1.2: Expor no `ChipLibrary` um hook de mutação (add/update) que dispare a
      persistência, e um método para carregar definições iniciais a partir do storage.
- [x] Task 1.3: Restaurar/avançar o contador `seq` de `chip.ts` a partir dos ids carregados
      (ex.: `chip7` → próximo id = `chip8`), evitando colisão de `defId`.
- [x] Task 1.4: No boot (`main.ts`), carregar a biblioteca do IndexedDB **antes** de montar
      a paleta (`refreshPalette`).
- [x] Task 1.5: Testes da serialização/round-trip das definições e da restauração do `seq`
      (mockando IndexedDB ou abstraindo a camada de storage para testar a lógica pura).

### Verification

- [ ] Criar chips, recarregar a página e confirmar que reaparecem na paleta e simulam
      corretamente; testes da Fase 1 passando.

## Phase 2: Barra superior — botão "Editar" e renomear por duplo clique

Adicionar a interação nos botões de chip da paleta: clique simples revela "Editar"; duplo
clique abre a edição do nome.

### Tasks

- [x] Task 2.1: Ao clicar (simples) num botão de chip, revelar um controle **"Editar"**
      associado àquele chip (estado de seleção do botão na paleta).
- [x] Task 2.2: Implementar duplo clique no botão de chip para abrir um campo/diálogo de
      **renomear**, reutilizando `validateChipName` (vazio/duplicata).
- [x] Task 2.3: Atualizar a definição (`name`) no lugar (mantendo `id`), persistir e
      recarregar a paleta; confirmar que instâncias continuam válidas (resolução por
      `defId`).
- [x] Task 2.4: Conciliar os gestos com o drag-para-criar existente (não disparar criação
      ao clicar/duplo-clicar para editar).

### Verification

- [ ] Clicar revela "Editar"; duplo clique renomeia com validação; nome persiste após
      reload e instâncias seguem funcionando.

## Phase 3: Abrir chip para edição (modo edição)

Permitir abrir o circuito interno de um chip no espaço, preservando o conteúdo atual para
restaurá-lo ao final.

### Tasks

- [x] Task 3.1: Introduzir um **estado de "modo edição"** (qual `defId` está sendo editado)
      e snapshot do espaço atual (`store.toJSON()`) para restauração posterior.
- [x] Task 3.2: Ao clicar em "Editar", carregar `def.internal` no `store` (substituindo o
      espaço) e indicar visualmente que se está editando aquele chip.
- [x] Task 3.3: Fornecer ação de **concluir edição** (Salvar) e, opcionalmente, Cancelar —
      ambas restaurando o snapshot do espaço anterior ao sair do modo edição.

### Verification

- [ ] "Editar" carrega o interno do chip; concluir/cancelar restaura o espaço anterior
      intacto.

## Phase 4: Salvar edição com reconciliação de instâncias por índice

Ao concluir a edição, atualizar a definição no lugar e reconciliar todas as instâncias
quando o número de I/O mudar.

### Tasks

- [x] Task 4.1: Recapturar a definição editada via `captureDefinition`, **preservando o
      `id`** original (atualizar `name`, `inputCount`, `outputCount`, labels, `internal`).
- [x] Task 4.2: Implementar função pura de **reconciliação de uma instância** dado o def
      novo: regenerar pinos via `chipInstancePins(newDef)`, manter wires cujos `pinId`
      sobrevivem e remover os de pinos eliminados.
- [x] Task 4.3: Aplicar a reconciliação a (a) todos os nós do espaço atual e (b) o
      `internal` de **todas** as outras definições que contenham instâncias daquele
      `defId`.
- [x] Task 4.4: Persistir todas as definições alteradas e recarregar a paleta; reavaliar a
      simulação.
- [x] Task 4.5: Testes da reconciliação: I/O inalterado (no-op nos fios), aumento de I/O
      (pinos novos livres) e redução de I/O (fios de pinos eliminados removidos), incluindo
      instâncias aninhadas.

### Verification

- [ ] Editar a lógica de um chip propaga para todas as instâncias; mudar o nº de I/O
      reconcilia corretamente os fios; testes da Fase 4 passando.

## Phase 5: Botão de limpar banco e polish

### Tasks

- [x] Task 5.1: Adicionar ação de **limpar o IndexedDB** (apagar object store) e recarregar
      em estado vazio.
- [x] Task 5.2: Exibir o botão **sempre** (inclusive no deploy/produção), para permitir
      testes em outros dispositivos. Tratar como afordância **temporária** (ex.: comentário/
      TODO marcando que deve ser ocultada/gated no futuro).
- [x] Task 5.3: Tratar erros de IndexedDB (indisponível/privado) com degradação graciosa
      (app funciona em memória) e ajustes visuais finais.

### Verification

- [ ] Botão limpar zera a biblioteca e recarrega; presente também no build de deploy; app
      não quebra se o IndexedDB falhar.

## Final Verification

- [ ] Todos os critérios de aceitação atendidos
- [ ] Testes passando (persistência e reconciliação)
- [ ] Verificação manual no fechamento do track (conforme workflow.md)
- [ ] Pronto para review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._
