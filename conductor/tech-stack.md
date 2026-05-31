# Stack Tecnológica — From NAND to CPU

## Linguagem

- **TypeScript** (modo strict). Tipagem estática para dar segurança à lógica de simulação
  e à manipulação de estruturas de circuitos, facilitando refatorações conforme o projeto
  cresce de portas NAND até uma CPU.

## Frontend

- **Vanilla TS + Canvas** — sem framework de UI. A renderização do editor de circuitos é
  feita diretamente em `<canvas>`, garantindo máximo controle e performance para a
  simulação em tempo real e o desenho dos nós e conectores.
- Interface baseada em **nós e conectores** (diagrama de circuito).
- Suporte a **toque e mouse** para execução em smartphones e tablets.

## Persistência

- **IndexedDB** como banco de dados local no browser, adequado para armazenar circuitos e
  componentes estruturados e maiores.
- **Export/Import em JSON** — permitir que o usuário exporte e importe projetos como
  arquivos, facilitando backup e compartilhamento.
- Sem backend: a aplicação é totalmente client-side.

## Backend

- **Nenhum.** Aplicação 100% no browser, sem servidor.

## Infraestrutura / Deploy

- **Ainda não decidido.** Como é uma SPA estática sem backend, candidatos naturais
  incluem hospedagem estática (ex.: GitHub Pages, Vercel, Netlify). A definir.

## Considerações de Performance

- Renderização e loop de simulação otimizados para Canvas.
- Evitar dependências pesadas; priorizar tempo de carregamento e fluidez.
- Manter responsividade em dispositivos móveis.
