# Diretrizes do Produto — From NAND to CPU

## Voz e Tom

**Conciso e direto.** Textos da interface e da documentação devem ir direto ao ponto,
sem rodeios. Mensagens curtas, claras e objetivas, respeitando o caráter didático do
produto sem se tornar prolixas.

## Princípios de Design

- **Performance primeiro** — a fluidez da simulação em tempo real é prioridade; decisões
  de design não devem comprometer a responsividade, inclusive em dispositivos móveis.
- **Confiabilidade** — a simulação deve ser correta e determinística, e os dados do
  usuário (circuitos e componentes) devem ser persistidos com segurança no browser.
- **Simplicidade acima de recursos** — manter o núcleo enxuto e fácil de entender;
  resistir à tentação de adicionar funcionalidades que aumentem a complexidade sem
  ganho didático claro.
- **Interface baseada em nós e conectores** — a interação central acontece por meio de
  nós (portas/componentes) conectados por fios, num modelo visual de diagrama de
  circuito intuitivo e direto.

## Implicações Práticas

- Priorizar interações por toque e mouse de forma equivalente (suporte a touch para
  tablets e smartphones).
- Evitar dependências pesadas que prejudiquem o tempo de carregamento e a performance.
- Feedback visual imediato para ações de conexão, simulação e criação de componentes.
