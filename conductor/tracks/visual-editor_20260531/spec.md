# Specification: Editor Visual de Circuitos (Canvas)

**Track ID:** visual-editor_20260531
**Type:** Feature
**Created:** 2026-05-31
**Status:** Draft

## Summary

Editor visual de circuitos baseado em Canvas 2D para o **From NAND to CPU**: renderização
da porta NAND e de pinos de I/O, posicionamento dos nós, ligação de fios entre pinos,
pan/zoom e interação por mouse e toque (smartphones/tablets). O objetivo deste primeiro
track é validar **visualmente** a montagem e as conexões — **sem lógica de simulação,
sem persistência e sem chips reutilizáveis**.

## Context

O **From NAND to CPU** é uma aplicação web 100% client-side que ensina como uma CPU é
construída a partir de portas NAND. A interação central acontece num modelo visual de
**nós e conectores** (diagrama de circuito). Este track entrega a base de interação do
produto: a tela onde o usuário monta circuitos. Segue os princípios de **performance
primeiro**, **simplicidade acima de recursos** e **confiabilidade**, e deve ser utilizável
tanto em desktop quanto em dispositivos móveis.

## User Story

Como **usuário final** (estudante/entusiasta), quero **arrastar portas NAND e pinos de
I/O para uma tela e conectá-los com fios**, para que **eu possa montar visualmente
circuitos lógicos** — usando mouse no desktop ou toque no celular/tablet.

## Acceptance Criteria

- [ ] É possível adicionar à tela uma porta **NAND** e pinos de I/O (toggle de entrada,
      lâmpada de saída) a partir de uma paleta.
- [ ] Nós podem ser selecionados, movidos (arrastados) e removidos.
- [ ] A NAND é renderizada com seus pinos (2 entradas, 1 saída) em posições corretas e o
      fio acompanha o nó quando ele é movido.
- [ ] É possível ligar um fio de um pino de saída a um pino de entrada; conexões inválidas
      (saída→saída, entrada→entrada, ou pino já ocupado) são rejeitadas com feedback
      visual.
- [ ] Fios podem ser removidos.
- [ ] Pan (deslocar a tela) e zoom funcionam com mouse (scroll/arrasto) e por toque
      (arrasto de um dedo para pan, pinça para zoom).
- [ ] Toda a interação de montagem (adicionar, mover, conectar, pan/zoom) funciona por
      toque em smartphones e tablets.
- [ ] A renderização permanece fluida (alvo ~60 fps) com dezenas de nós e fios na tela.

## Dependencies

- Nenhuma dependência de tracks anteriores (este é o primeiro track de implementação).
- O **motor de simulação** será um track separado e consumirá o modelo de dados (grafo)
  produzido aqui.

## Out of Scope

- **Motor de simulação / propagação de sinais** — este track monta e edita o grafo do
  circuito, mas NÃO executa a lógica (uma NAND não "calcula" sua saída ainda). Fica para
  track próprio.
- **Persistência (IndexedDB) e export/import JSON** — o estado vive apenas em memória
  nesta etapa. Track futuro.
- **Criação de chips reutilizáveis** — encapsular subgrafos em componentes reutilizáveis
  fica para track futuro.
- Biblioteca de portas além de NAND + I/O (AND/OR/NOT/etc. como primitivas) — derivam-se
  depois de NAND ou entram em track futuro.
- Recursos avançados de edição: undo/redo, copiar/colar, alinhamento automático, temas.

## Technical Notes

- **Stack:** TypeScript (strict) + Vanilla TS, sem framework de UI.
- **Renderização:** um único elemento `<canvas>` em *immediate mode*, redesenhado via
  `requestAnimationFrame`. Sistema de coordenadas do "mundo" com transformação de
  pan/zoom (escala + translação) aplicada na hora de desenhar; conversão tela↔mundo para
  hit-testing.
- **Entrada unificada:** usar **Pointer Events** para tratar mouse e toque pelo mesmo
  caminho; gesto de pinça (dois ponteiros) para zoom.
- **Modelo de dados:** grafo de `Node`s (com `Pin`s de entrada/saída tipados por posição)
  e `Wire`s (ligação saída→entrada), mantido **apenas em memória** nesta etapa, mas já
  desenhado de forma serializável para facilitar persistência futura.
- **Hit-testing:** detecção de clique/toque em nós, pinos e fios em coordenadas de mundo.

---

_Gerado pelo Conductor. Revise e edite conforme necessário._
