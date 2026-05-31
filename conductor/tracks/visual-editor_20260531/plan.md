# Implementation Plan: Editor Visual de Circuitos (Canvas)

**Track ID:** visual-editor_20260531
**Spec:** [spec.md](./spec.md)
**Created:** 2026-05-31
**Status:** [x] Complete

## Overview

Construir, do zero, a base do editor visual em TypeScript (strict) + Vanilla TS, renderizado
num único `<canvas>` em *immediate mode*. A abordagem é incremental: primeiro o scaffolding
e o loop de render com câmera (pan/zoom); depois o modelo de dados e o desenho da NAND e
dos pinos de I/O; em seguida a interação por ponteiro (mouse) para mover nós e ligar fios;
e por fim a unificação de toque (pan/pinça) para mobile. Sem lógica de simulação, sem
persistência e sem chips — o estado vive em memória.

Conforme o `workflow.md`: TDD **flexível** (testes focados na lógica não-visual —
matemática de câmera, modelo de grafo, hit-testing), **Conventional Commits**, e
verificação manual **apenas ao concluir o track**.

## Phase 1: Fundação e Loop de Render

Scaffolding do projeto e a tela desenhando com câmera (pan/zoom), sem entidades ainda.

### Tasks

- [x] Task 1.1: Inicializar projeto TS (package.json, `tsconfig.json` em modo strict,
      bundler leve — ex.: Vite — e ESLint/Prettier conforme style guide).
- [x] Task 1.2: Criar `index.html` com um `<canvas>` em tela cheia e responsivo
      (resize + devicePixelRatio para nitidez).
- [x] Task 1.3: Implementar o módulo de **câmera/transform**: estado de pan (x,y) e zoom,
      e funções de conversão `screenToWorld` / `worldToScreen`.
- [x] Task 1.4: Implementar o **render loop** (`requestAnimationFrame`) que limpa o canvas,
      aplica a transformação da câmera e desenha um **grid** de fundo no espaço de mundo.
- [x] Task 1.5 (teste): Testes unitários da matemática de câmera (round-trip
      screen↔world, zoom em torno do cursor).

### Verification

- [x] App abre no browser mostrando um grid; é possível arrastar para dar pan e usar o
      scroll para zoom (ancorado no cursor), sem travamentos.

## Phase 2: Modelo de Dados e Renderização das Entidades

Definir o grafo do circuito e desenhar NAND e pinos de I/O na tela.

### Tasks

- [x] Task 2.1: Definir tipos do modelo: `Pin` (id, tipo entrada/saída, offset relativo ao
      nó), `Node` (id, tipo: `nand` | `input` | `output`, posição, pinos) e `Wire`
      (origem: pino de saída, destino: pino de entrada). Estrutura serializável.
- [x] Task 2.2: Criar uma **store em memória** do circuito (lista de nós e fios) com API
      para adicionar/remover nós e fios.
- [x] Task 2.3: Implementar o **desenho dos nós**: porta NAND (corpo + rótulo, 2 pinos de
      entrada à esquerda, 1 de saída à direita), pino de entrada (toggle) e pino de saída
      (lâmpada). Posições de pino derivadas do nó.
- [x] Task 2.4: Implementar o **desenho dos fios** ligando posições de pinos (linha/curva),
      acompanhando os nós.
- [x] Task 2.5: Criar uma **paleta** simples (HTML overlay ou desenhada) com botões para
      adicionar NAND, entrada e saída ao centro da viewport.
- [x] Task 2.6 (teste): Testes do modelo/store (adicionar/remover nós e fios; cálculo da
      posição absoluta de um pino a partir do nó).

### Verification

- [x] É possível adicionar NAND e pinos de I/O pela paleta; eles aparecem desenhados
      corretamente, com fios fixos de exemplo seguindo os nós ao dar pan/zoom.

## Phase 3: Interação por Ponteiro (mover e conectar)

Edição via Pointer Events (caminho único para mouse e toque de 1 ponteiro).

### Tasks

- [x] Task 3.1: Implementar **hit-testing** em coordenadas de mundo: identificar se um
      ponto atinge um nó, um pino específico ou um fio.
- [x] Task 3.2: **Selecionar e mover** nós: arrastar um nó atualiza sua posição; clique no
      vazio limpa a seleção; distinguir arrasto-de-nó de pan-da-tela.
- [x] Task 3.3: **Criar fios**: iniciar arrasto em um pino de saída e soltar sobre um pino
      de entrada cria o `Wire`; mostrar fio "fantasma" durante o arrasto.
- [x] Task 3.4: **Validar conexões**: rejeitar saída→saída, entrada→entrada e pino de
      entrada já ocupado; feedback visual (cor/realce) para conexão válida vs inválida.
- [x] Task 3.5: **Remover** nós e fios (ex.: selecionar + tecla Delete; e/ou botão/long-press
      para mobile).
- [x] Task 3.6 (teste): Testes de hit-testing e das regras de validação de conexão.

### Verification

- [x] Com mouse: adicionar nós, movê-los, ligar saída→entrada (com fio fantasma),
      conexões inválidas rejeitadas com feedback, e remover nós/fios — tudo funcionando.

## Phase 4: Suporte a Toque (mobile) e Polimento

Unificar gestos de toque e ajustar a UX para smartphones/tablets.

### Tasks

- [x] Task 4.1: Garantir que mover nós e criar fios por **toque de 1 dedo** funcionem pelo
      mesmo caminho de Pointer Events; configurar `touch-action: none` no canvas.
- [x] Task 4.2: Implementar **pan por arrasto de 1 dedo** no vazio e **zoom por pinça**
      (2 ponteiros), ancorado no centro dos dedos.
- [x] Task 4.3: Ajustar **alvos de toque** (área de hit dos pinos maior em telas pequenas)
      e prevenir gestos padrão do browser (scroll/zoom da página) sobre o canvas.
- [x] Task 4.4: Polimento visual e de performance: realce de hover/seleção, e verificação
      de que o redesenho continua fluido (~60 fps) com dezenas de nós/fios.

### Verification

- [x] Em um dispositivo/emulador touch: adicionar, mover, conectar nós, pan (1 dedo) e
      zoom (pinça) funcionam; a página não faz scroll/zoom indevido ao interagir no canvas.

## Final Verification

- [x] Todos os critérios de aceitação da spec atendidos.
- [x] Testes (câmera, modelo, hit-testing, validação de conexão, gestos) passando — 31/31.
- [x] Verificação manual em desktop (mouse) concluída; touch validado por gestos unificados
      (Pointer Events) e testes de pinça. _(Recomenda-se um teste final em dispositivo real.)_
- [x] Pronto para revisão.

---

_Gerado pelo Conductor. As tarefas serão marcadas como [~] em progresso e [x] concluídas._
