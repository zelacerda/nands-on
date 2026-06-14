import type { CircuitNode, Wire } from './model';
import type { StringKey } from './strings';

/**
 * Walkthrough interativo "construir um NOT a partir do NAND". O motor é
 * declarativo: cada passo traz um texto e um predicado de conclusão avaliado
 * contra o estado atual do circuito. A detecção é feita por *polling* no loop de
 * render (sem instrumentar o `CircuitStore` com eventos): a cada frame, se o
 * tutorial está ativo, o predicado do passo corrente é checado e, ao satisfazer,
 * avança-se para o próximo.
 */

/** Foto leve tirada ao ENTRAR num passo, para detectar mudanças relativas. */
export interface StepStartSnapshot {
  /** Quantidade de chips na biblioteca no início do passo (detecta "Make"). */
  libraryCount: number;
  /** `value` de cada nó `input` no início do passo, por id (detecta toggle). */
  inputValues: Map<string, boolean>;
}

/** Contexto avaliado pelos predicados de conclusão de passo. */
export interface TutorialContext {
  nodes: CircuitNode[];
  wires: Wire[];
  libraryCount: number;
  stepStart: StepStartSnapshot;
}

/** Um passo do tutorial: texto, alvo opcional de destaque e predicado de conclusão. */
export interface TutorialStep {
  id: string;
  textKey: StringKey;
  /** Seletor CSS de um elemento (ex.: botão da paleta) a destacar neste passo. */
  highlightSelector?: string;
  isComplete: (ctx: TutorialContext) => boolean;
}

/** Estado serializável do tutorial em andamento. */
export interface TutorialState {
  active: boolean;
  index: number;
}

const countType = (nodes: CircuitNode[], type: CircuitNode['type']): number =>
  nodes.reduce((n, node) => (node.type === type ? n + 1 : n), 0);

/** Existe um fio de (fromNode, fromPin) para (toNode, toPin)? */
function hasWire(
  wires: Wire[],
  fromNodeId: string,
  fromPin: string,
  toNodeId: string,
  toPin: string,
): boolean {
  return wires.some(
    (w) =>
      w.from.nodeId === fromNodeId &&
      w.from.pinId === fromPin &&
      w.to.nodeId === toNodeId &&
      w.to.pinId === toPin,
  );
}

/** Há um NAND com `in0` e `in1` ligados à saída de um MESMO nó `input`? (= NOT) */
function inputDrivesBothNandInputs(nodes: CircuitNode[], wires: Wire[]): boolean {
  const inputs = nodes.filter((n) => n.type === 'input');
  const nands = nodes.filter((n) => n.type === 'nand');
  return nands.some((nand) =>
    inputs.some(
      (inp) =>
        hasWire(wires, inp.id, 'out', nand.id, 'in0') &&
        hasWire(wires, inp.id, 'out', nand.id, 'in1'),
    ),
  );
}

/** Há um fio da saída de algum NAND para a entrada de alguma saída? */
function nandDrivesOutput(nodes: CircuitNode[], wires: Wire[]): boolean {
  const nands = nodes.filter((n) => n.type === 'nand');
  const outputs = nodes.filter((n) => n.type === 'output');
  return nands.some((nand) =>
    outputs.some((out) => hasWire(wires, nand.id, 'out', out.id, 'in')),
  );
}

/** Alguma entrada teve seu estado (`value`) alterado em relação ao início do passo? */
function inputStateChanged(ctx: TutorialContext): boolean {
  return ctx.nodes.some(
    (n) =>
      n.type === 'input' &&
      (n.value ?? false) !== (ctx.stepStart.inputValues.get(n.id) ?? false),
  );
}

/** Sequência de passos do tutorial do NOT. */
export const NOT_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'add-input',
    textKey: 'tutorial.step.addInput',
    highlightSelector: '#io-box button[data-add="input"]',
    isComplete: (ctx) => countType(ctx.nodes, 'input') >= 1,
  },
  {
    id: 'add-nand',
    textKey: 'tutorial.step.addNand',
    highlightSelector: '#palette button[data-add="nand"]',
    isComplete: (ctx) => countType(ctx.nodes, 'nand') >= 1,
  },
  {
    id: 'add-output',
    textKey: 'tutorial.step.addOutput',
    highlightSelector: '#io-box button[data-add="output"]',
    isComplete: (ctx) => countType(ctx.nodes, 'output') >= 1,
  },
  {
    id: 'wire-input',
    textKey: 'tutorial.step.wireInput',
    isComplete: (ctx) => inputDrivesBothNandInputs(ctx.nodes, ctx.wires),
  },
  {
    id: 'wire-output',
    textKey: 'tutorial.step.wireOutput',
    isComplete: (ctx) => nandDrivesOutput(ctx.nodes, ctx.wires),
  },
  {
    id: 'toggle-input',
    textKey: 'tutorial.step.toggle',
    isComplete: inputStateChanged,
  },
  {
    id: 'rename-io',
    textKey: 'tutorial.step.rename',
    isComplete: (ctx) =>
      ctx.nodes.some((n) => (n.type === 'input' || n.type === 'output') && !!n.name),
  },
  {
    id: 'make',
    textKey: 'tutorial.step.make',
    isComplete: (ctx) => ctx.libraryCount > ctx.stepStart.libraryCount,
  },
];

/** Captura a foto inicial de um passo a partir do estado atual. */
export function captureStepStart(nodes: CircuitNode[], libraryCount: number): StepStartSnapshot {
  const inputValues = new Map<string, boolean>();
  for (const node of nodes) {
    if (node.type === 'input') inputValues.set(node.id, node.value ?? false);
  }
  return { libraryCount, inputValues };
}

/** Passo atual, ou `undefined` se o índice já passou do fim (tutorial concluído). */
export function currentStep(
  steps: TutorialStep[],
  state: TutorialState,
): TutorialStep | undefined {
  return state.active ? steps[state.index] : undefined;
}

/** Verdadeiro quando o índice chegou ao fim da lista (todos os passos concluídos). */
export function isFinished(steps: TutorialStep[], state: TutorialState): boolean {
  return state.index >= steps.length;
}

/**
 * Avança o índice **se** o passo corrente estiver completo, devolvendo o novo
 * estado (função pura). No-op se inativo, sem passo corrente ou ainda incompleto.
 */
export function advanceIfComplete(
  steps: TutorialStep[],
  state: TutorialState,
  ctx: TutorialContext,
): TutorialState {
  if (!state.active) return state;
  const step = steps[state.index];
  if (!step || !step.isComplete(ctx)) return state;
  return { ...state, index: state.index + 1 };
}
