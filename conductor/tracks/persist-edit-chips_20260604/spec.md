# Specification: Persistência Local e Edição de Chips

**Track ID:** persist-edit-chips_20260604
**Type:** Feature
**Created:** 2026-06-04
**Status:** Draft

## Summary

Persistir a biblioteca de chips no browser (IndexedDB) para que sobreviva a recargas
da página, e permitir editar um chip já criado — abrindo seu circuito interno no espaço,
salvando as alterações e propagando-as para todas as instâncias.

## Context

O produto é um simulador de lógica digital 100% no browser, sem backend, com persistência
local prevista via IndexedDB (ver `conductor/tech-stack.md`). Hoje a biblioteca de chips
(`ChipLibrary`) vive apenas em memória e é perdida ao recarregar a página
(`src/chip.ts:50-52`). A paleta no topo (`#palette`) lista os chips criados como botões
(`src/main.ts:234-244`); o simulador resolve a topologia interna de cada instância **por
referência**, buscando `def.internal` pelo `defId` em tempo de simulação
(`src/main.ts:120-121`). Não existe hoje fluxo para reabrir e editar um chip já criado.

## User Story

Como usuário do simulador, quero que meus chips criados sejam salvos automaticamente e
possa reabri-los para editar sua lógica e seu nome, para construir blocos progressivamente
sem perder trabalho e sem recriar componentes do zero.

## Acceptance Criteria

- [ ] A biblioteca de chips é persistida em **IndexedDB** e restaurada ao recarregar a
      página (a paleta volta a exibir os chips criados anteriormente).
- [ ] Clicar (toque/click simples) no botão de um chip na barra superior (paleta) revela
      um botão **"Editar"** associado àquele chip.
- [ ] Clicar em "Editar" abre o circuito interno do chip no espaço de trabalho para edição;
      o conteúdo que estava no espaço é preservado temporariamente e restaurado ao concluir
      a edição.
- [ ] Ao salvar a edição, a definição do chip é atualizada **no lugar** (mesmo `id`/nome) e
      as mudanças se propagam para **todas as instâncias**, inclusive as aninhadas dentro de
      outras definições.
- [ ] Quando o número de entradas/saídas do chip muda na edição, as instâncias são
      **reconciliadas por índice/id de pino**: fios de pinos que sobrevivem são mantidos,
      fios de pinos eliminados são removidos e pinos novos ficam sem conexão.
- [ ] **Duplo clique** no botão do chip na barra superior permite **editar o nome** do chip
      (validando vazio/duplicata, como no fluxo "Fazer").
- [ ] Renomear um chip não quebra a referência das instâncias (a resolução é por `defId`,
      não por nome).
- [ ] Existe um botão para **limpar o banco** (IndexedDB), recarregando a aplicação em
      estado vazio. Por enquanto ele fica **sempre visível, inclusive no deploy**, para
      facilitar testes em outros dispositivos (afordância temporária, a revisitar depois).

## Dependencies

- Depende do código existente: `ChipLibrary` (`src/chip.ts`), `CircuitStore`
  (`src/store.ts`), modelo de dados (`src/model.ts`), fluxo "Fazer" e resolução de chip
  (`src/main.ts`). Nenhuma dependência de track incompleto.

## Out of Scope

- Persistência do **espaço de trabalho** atual (somente a biblioteca de chips é persistida;
  o espaço começa vazio a cada carga).
- Export/Import de projetos em JSON (item de track futuro).
- Reconciliação por rótulo/label de pino (optou-se por índice/id).
- Bloqueio/aviso ao salvar quando há instâncias e o I/O mudou (optou-se por reconciliar).
- Versionamento/undo de definições de chip e migração de schema do IndexedDB entre versões.
- Excluir um chip da biblioteca pela UI (apenas limpar todo o banco em dev).

## Technical Notes

- **Propagação por referência (já existente):** como `resolveChip` busca `def.internal`
  pelo `defId` em tempo de simulação, atualizar a definição no lugar propaga a lógica
  automaticamente para todas as instâncias **enquanto o nº de I/O não muda**. O que precisa
  de reconciliação explícita são os **pinos congelados** das instâncias quando o I/O muda.
- **Reconciliação de instâncias:** ao salvar uma edição que altera `inputCount`/
  `outputCount`, percorrer (a) os nós do espaço atual e (b) o `internal` de **todas** as
  definições, regenerando os pinos das instâncias daquele `defId` via
  `chipInstancePins(newDef)` e removendo fios cujos `pinId` deixaram de existir. Manter os
  ids de pino estáveis (`in0..inN`, `out0..outM`) garante que os fios dos índices
  sobreviventes permaneçam válidos.
- **Identidade estável:** a edição deve atualizar a definição **mantendo o mesmo `id`**
  (`chipN`), pois as instâncias referenciam por `defId`. Renomear altera apenas `name`.
- **Persistência (IndexedDB):** armazenar as `ChipDefinition` serializadas (já são
  estruturas JSON-serializáveis via `CircuitState`). Carregar no boot, antes de montar a
  paleta. Salvar de forma assíncrona após cada mutação da biblioteca (add/update/rename).
  A geração de `seq` para novos ids deve ser restaurada/avançada a partir dos ids
  persistidos para evitar colisão de `chipN`.
- **Botão de limpar banco:** ação que apaga o object store do IndexedDB e recarrega. Por
  ora exibido **sempre** (inclusive em produção/deploy) para permitir testes em outros
  dispositivos; é uma afordância temporária a ser ocultada/gated futuramente.

---

_Generated by Conductor. Review and edit as needed._
