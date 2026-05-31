# From NAND to CPU

Simulador de lógica digital no browser — do **NAND** à **CPU**. Aplicação web 100%
client-side, sem backend e sem instalação, inspirada na
[versão 0 do Digital-Logic-Sim](https://github.com/SebLague/Digital-Logic-Sim/tree/Version-0)
de Sebastian Lague.

> Estado atual: **editor visual de circuitos**. Permite montar e conectar visualmente
> uma porta NAND e pinos de I/O, com pan/zoom e suporte a mouse e toque. A **lógica de
> simulação** (propagação de sinais) ainda não foi implementada — é o próximo passo.

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

- **Paleta** (canto superior esquerdo): adiciona `NAND`, `Entrada` e `Saída` ao centro da tela.
- **Mover**: arraste um nó.
- **Conectar**: arraste de um pino de **saída** até um pino de **entrada**. O fio fantasma
  fica **verde** (conexão válida) ou **vermelho** (inválida — saída↔saída, entrada↔entrada
  ou entrada já ocupada).
- **Selecionar**: clique num nó ou fio.
- **Remover**: tecla `Delete`/`Backspace` ou o botão **Excluir** (aparece quando há seleção).
- **Pan**: arraste no espaço vazio. **Zoom**: scroll do mouse ou **pinça** (dois dedos),
  ancorado no cursor/centro dos dedos.

## Arquitetura (`src/`)

| Módulo | Responsabilidade |
| ------ | ---------------- |
| `camera.ts` | Câmera 2D pura: pan/zoom e conversões `screenToWorld`/`worldToScreen`. |
| `model.ts` | Tipos serializáveis do circuito: `Pin`, `CircuitNode`, `Wire`; geometria dos pinos. |
| `store.ts` | `CircuitStore` em memória: adicionar/remover nós e fios, consultas e snapshot JSON. |
| `render.ts` | Desenho em Canvas: nós (NAND/I/O), fios (Bézier), realces e fio fantasma. |
| `grid.ts` | Grid de fundo no espaço de mundo. |
| `hittest.ts` | Hit-testing de nós, pinos e fios em coordenadas de mundo. |
| `connection.ts` | Regras de validação de conexão entre pinos. |
| `gesture.ts` | Matemática de pinça (ponto médio, distância, fator de zoom). |
| `main.ts` | Orquestração: entrada (Pointer Events), modos de interação e render loop. |

Os módulos de lógica pura (`camera`, `model`/`store`, `hittest`, `connection`, `gesture`)
são cobertos por testes em `src/*.test.ts`.

## Projeto

Gerenciado com [Conductor](https://github.com/anthropics/claude-code). O contexto do
produto, a stack e o workflow estão em `conductor/`, e os tracks de trabalho em
`conductor/tracks/`.
