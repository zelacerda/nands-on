# From NAND to CPU

Simulador de lógica digital no browser — do **NAND** à **CPU**. Aplicação web 100%
client-side, sem backend e sem instalação, inspirada na
[versão 0 do Digital-Logic-Sim](https://github.com/SebLague/Digital-Logic-Sim/tree/Version-0)
de Sebastian Lague.

> Estado atual: **editor visual + simulação em tempo real**. Permite montar e conectar
> uma porta NAND e pinos de I/O (com pan/zoom, mouse e toque), encapsular circuitos em
> **chips reutilizáveis** e ver os sinais propagarem ao vivo. A simulação roda num
> **motor event-driven** que compila a hierarquia de chips num netlist plano e reavalia
> só o que muda a cada frame (escala com a atividade, não com o tamanho do circuito).

## Stack

- **TypeScript** (modo strict), sem framework de UI
- Renderização em **Canvas 2D** (immediate mode, `requestAnimationFrame`)
- **Pointer Events** unificando mouse e toque
- **Vite** (dev/build) · **Vitest** (testes) · **ESLint/Prettier**

## Como rodar

```bash
npm install        # instala as dependências

npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve o build de produção

npm test           # roda os testes uma vez
npm run test:watch # testes em watch mode
npm run lint       # ESLint
npm run format     # Prettier --write
npm run typecheck  # tsc --noEmit
```

## Como usar o editor

- **Paleta** (canto superior esquerdo): **arraste** `Entrada`, `Saída`, `NAND` (ou um chip
  criado) para o ponto do editor onde quiser soltá-lo. No canvas, `Entrada`/`Saída` têm uma
  cor distinta dos componentes lógicos (`NAND` e chips), que compartilham a mesma cor.
- **Mover**: arraste um nó.
- **Conectar**: arraste de um pino de **saída** até um pino de **entrada**. O fio fantasma
  fica **verde** (conexão válida) ou **vermelho** (inválida — saída↔saída, entrada↔entrada
  ou entrada já ocupada).
- **Selecionar**: clique num nó ou fio.
- **Remover**: tecla `Delete`/`Backspace` ou o botão **Excluir** (aparece quando há seleção).
- **Pan**: arraste no espaço vazio. **Zoom**: scroll do mouse ou **pinça** (dois dedos),
  ancorado no cursor/centro dos dedos.

### Simulação

- **Entradas**: toque numa `Entrada` selecionada para ciclar **OFF → ON → CLK**. No modo
  **CLK** ela vira um clock (onda quadrada ~1Hz) que pisca e aciona a lógica.
- **Sinais**: pinos e fios acendem em **amarelo** quando transportam `1`. Nets que **não
  convergem** (oscilando/metaestáveis — ex.: um anel de inversões ímpares) aparecem em
  **vermelho**.
- **Memória**: circuitos com realimentação (latches/flip-flops) preservam estado entre
  frames; o motor só recompila quando a **topologia** muda, então alternar uma entrada
  não zera a memória. Flip-flops **mestre-escravo/edge-triggered** funcionam; um latch
  level-triggered "ingênuo" não alterna de forma limpa (fiel ao hardware).

## Arquitetura (`src/`)

| Módulo | Responsabilidade |
| ------ | ---------------- |
| `camera.ts` | Câmera 2D pura: pan/zoom e conversões `screenToWorld`/`worldToScreen`. |
| `model.ts` | Tipos serializáveis do circuito: `Pin`, `CircuitNode`, `Wire`; geometria dos pinos. |
| `store.ts` | `CircuitStore` em memória: adicionar/remover nós e fios, consultas, snapshot JSON e `topologyVersion`. |
| `netlist.ts` | `compile()` achata a hierarquia de chips num netlist plano; `liftSignal()` traduz os sinais de volta ao topo. |
| `engine.ts` | `Simulator` event-driven: nets, fila de eventos com atraso de porta, clock por nível e detecção de oscilação. |
| `simulator.ts` | Tipos/primitivas de sinal (`SignalState`, `pinKey`, `clockValue`); `simulate` (relaxação) é oráculo de referência dos testes. |
| `render.ts` | Desenho em Canvas: nós (NAND/I/O), fios (Bézier), sinais (aceso/oscilando), realces e fio fantasma. |
| `grid.ts` | Grid de fundo no espaço de mundo. |
| `hittest.ts` | Hit-testing de nós, pinos e fios em coordenadas de mundo. |
| `connection.ts` | Regras de validação de conexão entre pinos. |
| `gesture.ts` | Matemática de pinça (ponto médio, distância, fator de zoom). |
| `main.ts` | Orquestração: entrada (Pointer Events), modos de interação e render loop. |

Os módulos de lógica pura (`camera`, `model`/`store`, `hittest`, `connection`, `gesture`)
e os de simulação (`netlist`, `engine`, `simulator`) são cobertos por testes em
`src/*.test.ts`.

## Projeto

Gerenciado com [Conductor](https://github.com/anthropics/claude-code). O contexto do
produto, a stack e o workflow estão em `conductor/`, e os tracks de trabalho em
`conductor/tracks/`.
