import './style.css';
import { Camera, type Vec2 } from './camera';
import { drawGrid, snapNodePos, snapScalar, snapToGrid } from './grid';
import {
  NODE_SIZE,
  type ChipDefinition,
  type CircuitNode,
  type CircuitState,
  type PinRef,
  type PrimitiveType,
  type Wire,
  chipInstancePins,
  chipSize,
  createPins,
  ioNodeForPin,
  nodeSize,
} from './model';
import { CircuitStore } from './store';
import { ChipLibrary, captureDefinition, reconcileInstances, validateChipName } from './chip';
import { clearChips, loadChips, saveChips } from './persistence';
import { applyStrings, t } from './strings';
import { applyIcons } from './icons';
import {
  NAND_KEY,
  loadPaletteOrder,
  moveItem,
  reconcileOrder,
  savePaletteOrder,
} from './paletteOrder';
import {
  drawCircuit,
  drawGhostWire,
  drawMarquee,
  drawNode,
  drawNodeHighlight,
  drawWireHighlight,
} from './render';
import { nodesInRect, rectFromCorners } from './marquee';
import { hitNode, hitPin, hitWire, hitWireBar } from './hittest';
import { wirePath } from './wire';
import { type ChipResolver, type SignalState } from './simulator';
import { compile } from './netlist';
import { Simulator } from './engine';
import { validateConnection } from './connection';
import { playConnect, playDrop } from './audio';
import { type PinchSample, pinchDelta, samplePinch } from './gesture';
import { centeredTopLeft, isDrag } from './palette';
import { isWelcomeDismissed, setWelcomeDismissed, shouldAutoShowWelcome } from './welcome';
import { serializeLibrary } from './transfer';
import {
  NOT_TUTORIAL_STEPS,
  type TutorialState,
  type StepStartSnapshot,
  advanceIfComplete,
  captureStepStart,
  currentStep,
} from './tutorial';

const canvas = document.querySelector<HTMLCanvasElement>('#editor');
if (!canvas) {
  throw new Error('Canvas #editor não encontrado.');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Contexto 2D indisponível.');
}

// Preenche os textos estáticos da UI a partir do módulo central de strings,
// depois injeta os ícones SVG nos elementos marcados com `data-icon`.
applyStrings();
applyIcons();

const camera = new Camera();
const store = new CircuitStore();

/** Dimensões da viewport em CSS px (atualizadas no resize). */
let viewWidth = 0;
let viewHeight = 0;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  viewWidth = canvas!.clientWidth;
  viewHeight = canvas!.clientHeight;
  canvas!.width = Math.round(viewWidth * dpr);
  canvas!.height = Math.round(viewHeight * dpr);
}

// --- Estado de interação -------------------------------------------------

type Mode = 'idle' | 'pan' | 'dragNode' | 'wire' | 'pinch' | 'dragWaypoint' | 'marquee';

let mode: Mode = 'idle';
/**
 * Nós selecionados (multi-seleção via retângulo ou clique). Mutuamente exclusiva
 * com {@link selectedWire}: selecionar nós limpa o fio e vice-versa.
 */
const selectedNodes = new Set<string>();
/** Fio selecionado (seleção única), ou `null`. */
let selectedWire: string | null = null;

/** Ponteiros ativos (id → posição de tela), para pan e pinça. */
const pointers = new Map<number, Vec2>();

let lastPointer: Vec2 = { x: 0, y: 0 }; // tela (ponteiro único)
let dragNodeId: string | null = null;
/** Posição inicial (mundo) do ponteiro ao começar a arrastar um grupo de nós. */
let groupDragStart: Vec2 = { x: 0, y: 0 };
/** Posições iniciais (mundo) dos nós do grupo em arraste, por id. */
let groupStartPos = new Map<string, Vec2>();
/** Cantos (mundo) do retângulo de seleção enquanto `mode === 'marquee'`. */
let marqueeStart: Vec2 = { x: 0, y: 0 };
let marqueeEnd: Vec2 = { x: 0, y: 0 };
let wireStart: PinRef | null = null;
let ghostEnd: Vec2 = { x: 0, y: 0 }; // mundo
let ghostValid = false;
let pinchPrev: PinchSample | null = null;
/** Arraste da barra de um fio: id do fio e eixo do ajuste (`x` no Z, `y` no S). */
let dragBar: { wireId: string; axis: 'x' | 'y' } | null = null;
/**
 * Caso (Z/S) de cada fio conectado ao nó em arraste, capturado ao iniciar o
 * arraste. Ao recalcular durante o movimento, se o caso de um fio inverter, seu
 * ajuste manual (`barOffset`) é resetado.
 */
let dragNodeWireShapes: Map<string, 'Z' | 'S'> = new Map();
/**
 * Nó `input` que já estava selecionado ao iniciar este gesto. Se o ponteiro
 * subir sem caracterizar arrasto, um toque (tap) alterna seu estado entre
 * OFF e ON; um long press sobre ele ativa o modo CLK.
 */
let toggleCandidateId: string | null = null;

/** Duração (ms) de pressionar-e-segurar para caracterizar um long press. */
const LONG_PRESS_MS = 500;
/** Timer do long press em andamento (ativa o CLK ao disparar), ou `null`. */
let longPressTimer: number | null = null;
/** Marca que o long press já disparou neste gesto, suprimindo o toggle no pointerup. */
let longPressFired = false;

/** Cancela um long press pendente, se houver. */
function cancelLongPress(): void {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

/** Folga de acerto, em px de tela, maior para toque. */
function hitPx(pointerType: string): number {
  return pointerType === 'touch' ? 16 : 8;
}

/** Tolerância de acerto (mundo) a partir de uma folga em px de tela. */
function worldTol(px: number): number {
  return px / camera.zoom;
}

/** Converte coordenadas de cliente de um evento para tela locais ao canvas. */
function pointerScreen(e: { clientX: number; clientY: number }): Vec2 {
  const rect = canvas!.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Barra de ações contextual (inferior-centro): EDIT / RENAME / DELETE conforme o
// que está selecionado (chip na paleta, nó I/O, outro nó ou fio).
const actionBar = document.querySelector<HTMLDivElement>('#action-bar')!;
const actionEditBtn = document.querySelector<HTMLButtonElement>('#action-edit')!;
const actionRenameBtn = document.querySelector<HTMLButtonElement>('#action-rename')!;
const actionDeleteBtn = document.querySelector<HTMLButtonElement>('#action-delete')!;

/**
 * Atualiza a barra de ações para refletir a seleção atual, exibindo apenas as
 * ações aplicáveis ao contexto:
 * - chip na paleta → Edit / Rename / Delete (a definição na biblioteca);
 * - nó de entrada/saída no canvas → Rename / Delete;
 * - demais nós/fios no canvas → Delete.
 */
function updateActionBar(): void {
  if (selectedChipDef) {
    actionEditBtn.hidden = false;
    actionRenameBtn.hidden = false;
    actionDeleteBtn.hidden = false;
    actionBar.hidden = false;
    return;
  }
  if (selectedNodes.size > 0) {
    // "Rename" só faz sentido para um único nó de I/O; com vários selecionados
    // (ou um nó que não seja I/O) o botão fica oculto.
    const single = selectedNodes.size === 1 ? store.getNode(firstSelectedNode()!) : undefined;
    const isIo = !!single && (single.type === 'input' || single.type === 'output');
    actionEditBtn.hidden = true;
    actionRenameBtn.hidden = !isIo;
    actionDeleteBtn.hidden = false;
    actionBar.hidden = false;
    return;
  }
  if (selectedWire) {
    actionEditBtn.hidden = true;
    actionRenameBtn.hidden = true;
    actionDeleteBtn.hidden = false;
    actionBar.hidden = false;
    return;
  }
  actionBar.hidden = true;
}

/** Conta os elementos selecionados (nós + eventual fio). */
function selectionCount(): number {
  return selectedNodes.size + (selectedWire ? 1 : 0);
}

/** Primeiro id do conjunto de nós selecionados, ou `null` se vazio. */
function firstSelectedNode(): string | null {
  for (const id of selectedNodes) return id;
  return null;
}

/**
 * Seleção no canvas e na paleta são mutuamente exclusivas: ao selecionar algo no
 * canvas, limpa o foco de chip na paleta.
 */
function clearPaletteFocusForCanvas(): void {
  selectedChipDef = null;
  palette.querySelectorAll('button.chip-btn.selected').forEach((b) => b.classList.remove('selected'));
}

/** Limpa toda a seleção do canvas (nós e fio). */
function clearSelection(): void {
  selectedNodes.clear();
  selectedWire = null;
  updateActionBar();
}

/** Define a seleção como um único nó (limpa fio e demais nós). */
function selectSingleNode(id: string): void {
  selectedNodes.clear();
  selectedNodes.add(id);
  selectedWire = null;
  clearPaletteFocusForCanvas();
  updateActionBar();
}

/** Define o conjunto de nós selecionados (limpa fio). */
function selectNodeSet(ids: Iterable<string>): void {
  selectedNodes.clear();
  for (const id of ids) selectedNodes.add(id);
  selectedWire = null;
  if (selectedNodes.size > 0) clearPaletteFocusForCanvas();
  updateActionBar();
}

/** Define a seleção como um único fio (limpa os nós). */
function selectWire(id: string): void {
  selectedNodes.clear();
  selectedWire = id;
  clearPaletteFocusForCanvas();
  updateActionBar();
}

/** Remove todos os elementos selecionados (nós em grupo ou o fio). */
function deleteSelection(): void {
  if (selectedNodes.size > 0) {
    // Remover um nó já apaga em cascata os fios conectados (store.removeNode).
    for (const id of selectedNodes) store.removeNode(id);
    clearSelection();
    return;
  }
  if (selectedWire) {
    store.removeWire(selectedWire);
    clearSelection();
  }
}

// --- Paleta --------------------------------------------------------------

const library = new ChipLibrary();
// Qualquer mutação da biblioteca (criar/editar/renomear chip) é persistida no
// IndexedDB de forma assíncrona.
library.onMutate = (defs) => void saveChips(defs);
const palette = document.querySelector<HTMLElement>('#palette')!;
const paletteList = document.querySelector<HTMLDivElement>('#palette-list')!;
const nandBtn = paletteList.querySelector<HTMLButtonElement>('button[data-add="nand"]')!;
const scrollUpBtn = document.querySelector<HTMLButtonElement>('#palette-scroll-up')!;
const scrollDownBtn = document.querySelector<HTMLButtonElement>('#palette-scroll-down')!;

/**
 * Ordem de exibição dos itens reordenáveis da paleta (NAND + ids de chips).
 * Carregada de `localStorage` e reconciliada com a biblioteca a cada render.
 */
let paletteOrder: string[] = loadPaletteOrder();

/** Passo de rolagem (px) ao tocar os controles ▲/▼ da barra de componentes. */
const PALETTE_SCROLL_STEP = 100;

/** Exibe os controles de scroll apenas quando a lista de componentes transborda. */
function updatePaletteScroll(): void {
  const overflow = paletteList.scrollHeight > paletteList.clientHeight + 1;
  scrollUpBtn.hidden = !overflow;
  scrollDownBtn.hidden = !overflow;
}

scrollUpBtn.addEventListener('click', () => paletteList.scrollBy({ top: -PALETTE_SCROLL_STEP }));
scrollDownBtn.addEventListener('click', () => paletteList.scrollBy({ top: PALETTE_SCROLL_STEP }));
window.addEventListener('resize', updatePaletteScroll);

/** Resolve a topologia interna de um nó `chip` para a simulação recursiva. */
const resolveChip: ChipResolver = (node) =>
  node.defId ? library.list().find((d) => d.id === node.defId)?.internal : undefined;

/** Aplica o snap à grade na posição do nó recém-criado. */
function snapNode(node: CircuitNode): void {
  const p = snapNodePos(node);
  node.pos.x = p.x;
  node.pos.y = p.y;
}

/** Cria uma primitiva centrada no ponto de mundo `world`, alinhada à grade. */
function addNodeAt(type: PrimitiveType, world: Vec2): void {
  snapNode(store.addNode(type, centeredTopLeft(world, NODE_SIZE[type])));
}

/** Cria uma instância de chip centrada no ponto de mundo `world`, alinhada à grade. */
function addChipInstanceAt(def: ChipDefinition, world: Vec2): void {
  snapNode(store.addChipInstance(def, centeredTopLeft(world, chipSize(def.inputCount, def.outputCount))));
}

/**
 * Cria um IN/OUT a partir do arraste de um pino de componente solto no espaço
 * vazio (`source` = pino de origem; `world` = ponto de soltura). O tipo e o nome
 * herdado vêm de {@link ioNodeForPin}. Arrastar de uma entrada já conectada é um
 * gesto inválido (uma conexão por entrada) e não cria nada. Retorna `true` se um
 * nó foi criado e conectado.
 */
function createIoFromPinDrag(source: PinRef, world: Vec2): boolean {
  const node = store.getNode(source.nodeId);
  const pin = store.getPin(source);
  if (!node || !pin) return false;
  // Entrada já ocupada: nada a fazer (regra de uma conexão por entrada).
  if (pin.kind === 'in' && store.isInputOccupied(source)) return false;

  const { type, name } = ioNodeForPin(node, pin);
  const io = store.addNode(type, centeredTopLeft(world, NODE_SIZE[type]));
  snapNode(io);
  if (name) store.setNodeName(io.id, name);

  const ioPin: PinRef = { nodeId: io.id, pinId: type === 'input' ? 'out' : 'in' };
  const res = validateConnection(store, source, ioPin);
  if (!res.ok) {
    // Não deveria ocorrer (acabamos de criar o pino), mas desfaz por segurança.
    store.removeNode(io.id);
    return false;
  }
  store.addWire(res.from, res.to);
  playConnect();
  return true;
}

/** Componente que um botão da paleta cria: uma primitiva ou uma instância de chip. */
type PaletteItem =
  | { kind: 'primitive'; type: PrimitiveType }
  | { kind: 'chip'; def: ChipDefinition };

/** Cria no `store` a instância correspondente ao item, centrada em `world`. */
function spawnItem(item: PaletteItem, world: Vec2): void {
  if (item.kind === 'primitive') addNodeAt(item.type, world);
  else addChipInstanceAt(item.def, world);
  playDrop();
}

/** Nó transitório (não persistido) usado apenas para a pré-visualização do arrasto. */
function previewNode(item: PaletteItem, world: Vec2): CircuitNode {
  if (item.kind === 'primitive') {
    const node: CircuitNode = {
      id: '__preview__',
      type: item.type,
      pos: centeredTopLeft(world, NODE_SIZE[item.type]),
      pins: createPins(item.type),
    };
    snapNode(node);
    return node;
  }
  const { def } = item;
  const node: CircuitNode = {
    id: '__preview__',
    type: 'chip',
    pos: centeredTopLeft(world, chipSize(def.inputCount, def.outputCount)),
    pins: chipInstancePins(def),
    defId: def.id,
    name: def.name,
  };
  snapNode(node);
  return node;
}

/** Converte coordenadas de cliente para mundo, ou `null` se o ponto não está sobre o canvas. */
function clientToWorldOnCanvas(client: Vec2): Vec2 | null {
  if (document.elementFromPoint(client.x, client.y) !== canvas) return null;
  const rect = canvas!.getBoundingClientRect();
  return camera.screenToWorld({ x: client.x - rect.left, y: client.y - rect.top });
}

/**
 * Arrasto a partir de um botão da paleta para criar uma instância no ponto solto.
 * Usa Pointer Events + captura para rastrear o gesto que começa no botão (HTML) e
 * termina sobre o canvas, exibindo um ghost do componente sob o ponteiro. Clique
 * simples (abaixo do limiar) não cria nada; soltar fora do editor também é no-op.
 */
let paletteDrag: {
  pointerId: number;
  start: Vec2;
  item: PaletteItem;
  /** Ponto de mundo do ghost; `null` enquanto for clique ou estiver fora do canvas. */
  previewWorld: Vec2 | null;
} | null = null;

/**
 * Liga um botão da paleta ao arrasto-para-criar. `onTap` é chamado quando o
 * gesto termina sem caracterizar arrasto (clique/toque simples) — usado pelos
 * botões de chip para revelar "Editar" / renomear, sem criar instância.
 */
function attachPaletteDrag(btn: HTMLElement, item: PaletteItem, onTap?: () => void): void {
  btn.addEventListener('pointerdown', (e) => {
    if (paletteDrag) return; // já há um arrasto em andamento; ignora ponteiros extras
    e.preventDefault();
    paletteDrag = {
      pointerId: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      item,
      previewWorld: null,
    };
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (paletteDrag?.pointerId !== e.pointerId) return;
    const client = { x: e.clientX, y: e.clientY };
    // O ghost só aparece quando o gesto já se qualifica como arrasto e está sobre o canvas.
    paletteDrag.previewWorld = isDrag(paletteDrag.start, client)
      ? clientToWorldOnCanvas(client)
      : null;
  });
  btn.addEventListener('pointerup', (e) => {
    if (paletteDrag?.pointerId !== e.pointerId) return;
    const drag = paletteDrag;
    paletteDrag = null;
    if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);

    const end = { x: e.clientX, y: e.clientY };
    if (!isDrag(drag.start, end)) {
      onTap?.(); // clique simples: edição (chips), no-op para primitivas
      return;
    }
    const world = clientToWorldOnCanvas(end);
    if (world) spawnItem(drag.item, world);
  });
  btn.addEventListener('pointercancel', (e) => {
    if (paletteDrag?.pointerId !== e.pointerId) return;
    if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    paletteDrag = null;
  });
}

// --- Reordenação da paleta por arrastar (alça) ---------------------------

/** Espaçamento vertical entre itens da paleta (igual ao `gap` do `#palette-list`). */
const PALETTE_GAP = 8;

/** Estado do arrasto de reordenação em andamento, ou `null`. */
let paletteReorder: {
  pointerId: number;
  btn: HTMLElement;
  /** Índice do item arrastado entre os reordenáveis (ordem original). */
  fromIndex: number;
  /** `clientY` no início do gesto, para o item seguir o ponteiro. */
  startY: number;
  /** "Pegada" do item arrastado (altura + gap): o quanto os vizinhos deslocam. */
  footprint: number;
  /** Itens reordenáveis na ordem original e seus retângulos (alvo estável). */
  items: HTMLElement[];
  rects: DOMRect[];
  /** Índice de destino atual (posição entre os demais itens). */
  target: number;
} | null = null;

/** Botões reordenáveis (NAND + chips) na ordem atual do DOM. */
function reorderableButtons(): HTMLElement[] {
  return [...paletteList.querySelectorAll<HTMLElement>(':scope > button')];
}

/** Chave de ordem de um botão da paleta (NAND_KEY ou id do chip). */
function buttonKey(btn: HTMLElement): string {
  return btn.dataset.add === 'nand' ? NAND_KEY : btn.dataset.chipId!;
}

/** Reordena os botões existentes no DOM para refletir `keys` (sem recriá-los). */
function applyDomOrder(keys: readonly string[]): void {
  const byKey = new Map(reorderableButtons().map((b) => [buttonKey(b), b] as const));
  for (const key of keys) {
    const btn = byKey.get(key);
    if (btn) paletteList.appendChild(btn);
  }
}

/**
 * Índice de destino conforme a posição vertical do ponteiro, medido contra os
 * retângulos ORIGINAIS (capturados no início): conta quantos outros itens têm o
 * centro acima do ponteiro. Usar posições originais mantém o alvo estável mesmo
 * enquanto os vizinhos deslizam, evitando oscilação.
 */
function reorderTarget(clientY: number, drag: NonNullable<typeof paletteReorder>): number {
  let index = 0;
  drag.items.forEach((_btn, i) => {
    if (i === drag.fromIndex) return;
    const r = drag.rects[i]!;
    if (clientY > r.top + r.height / 2) index++;
  });
  return index;
}

/** Posiciona os vizinhos para abrir espaço no destino e o item arrastado sob o ponteiro. */
function paintReorder(clientY: number, drag: NonNullable<typeof paletteReorder>): void {
  drag.btn.style.transform = `translateY(${clientY - drag.startY}px)`;
  drag.items.forEach((btn, i) => {
    if (i === drag.fromIndex) return;
    const othersIndex = i < drag.fromIndex ? i : i - 1;
    let shift = 0;
    if (i > drag.fromIndex && othersIndex < drag.target) shift = -drag.footprint;
    else if (i < drag.fromIndex && othersIndex >= drag.target) shift = drag.footprint;
    btn.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}

/** Limpa os transforms aplicados durante o arrasto. */
function clearReorderStyles(items: HTMLElement[]): void {
  for (const btn of items) btn.style.transform = '';
}

/**
 * Liga a alça de um item da paleta ao arrasto de reordenação. O item arrastado
 * segue o ponteiro e os vizinhos deslizam (transição CSS) para abrir espaço; a
 * ordem só é gravada no `pointerup`. O gesto na alça é isolado (`stopPropagation`)
 * para não acionar o arrasto-para-criar do corpo.
 */
function attachReorderDrag(handle: HTMLElement, btn: HTMLElement): void {
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (paletteReorder) return;
    const items = reorderableButtons();
    const fromIndex = items.indexOf(btn);
    if (fromIndex === -1) return;
    paletteReorder = {
      pointerId: e.pointerId,
      btn,
      fromIndex,
      startY: e.clientY,
      footprint: btn.offsetHeight + PALETTE_GAP,
      items,
      rects: items.map((b) => b.getBoundingClientRect()),
      target: fromIndex,
    };
    handle.setPointerCapture(e.pointerId);
    paletteList.classList.add('reordering-active');
    btn.classList.add('reordering');
  });
  handle.addEventListener('pointermove', (e) => {
    if (paletteReorder?.pointerId !== e.pointerId) return;
    paletteReorder.target = reorderTarget(e.clientY, paletteReorder);
    paintReorder(e.clientY, paletteReorder);
  });
  const finish = (e: PointerEvent, commit: boolean): void => {
    const drag = paletteReorder;
    if (drag?.pointerId !== e.pointerId) return;
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    paletteReorder = null;
    paletteList.classList.remove('reordering-active');
    btn.classList.remove('reordering');
    clearReorderStyles(drag.items);
    if (commit) {
      paletteOrder = moveItem(drag.items.map(buttonKey), drag.fromIndex, drag.target);
      savePaletteOrder(paletteOrder);
      applyDomOrder(paletteOrder);
    }
  };
  handle.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    finish(e, true);
  });
  handle.addEventListener('pointercancel', (e) => finish(e, false));
}

// --- Seleção e edição de chip na paleta ----------------------------------

/** Definição do chip selecionado na paleta, ou `null`. */
let selectedChipDef: ChipDefinition | null = null;

/** Marca o botão `btn` como o chip selecionado; limpa os demais e a seleção do canvas. */
function selectChip(def: ChipDefinition, btn: HTMLElement): void {
  clearSelection(); // canvas e paleta são mutuamente exclusivos
  selectedChipDef = def;
  palette.querySelectorAll('button.chip-btn.selected').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
  updateActionBar();
}

/** Limpa a seleção de chip na paleta. */
function clearChipSelection(): void {
  selectedChipDef = null;
  palette.querySelectorAll('button.chip-btn.selected').forEach((b) => b.classList.remove('selected'));
  updateActionBar();
}

/** Confirma a renomeação in-place de um chip; ignora nome vazio/duplicado. */
function commitChipRename(def: ChipDefinition, raw: string): void {
  const check = validateChipName(library, raw, def.id);
  if (!check.ok) return; // nome inválido: mantém o nome atual, sem travar
  propagateChipName(def.id, check.name);
  library.rename(def.id, check.name);
  refreshPalette();
}

/** Abre a edição in-place do nome de um chip, sobre o próprio botão na paleta. */
function openChipNameEdit(def: ChipDefinition, btn: HTMLElement): void {
  const rect = btn.getBoundingClientRect();
  openInlineEditor({
    value: def.name,
    left: rect.left,
    top: rect.top,
    transform: 'none',
    box: { width: rect.width, height: rect.height },
    onCommit: (value) => commitChipRename(def, value),
  });
}

/** Cria o botão de um chip na paleta (alça de reordenar + arrasto-para-criar + seleção). */
function createChipButton(def: ChipDefinition): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip-btn';
  btn.dataset.chipId = def.id;

  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.dataset.icon = 'drag-vertical';
  handle.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'palette-label';
  label.textContent = def.name;

  btn.append(handle, label);
  applyIcons(btn); // injeta o SVG da alça no [data-icon]
  attachReorderDrag(handle, btn);

  // Clique/toque simples seleciona o chip (revela a barra de ações); o arrasto
  // pelo corpo cria uma instância no canvas.
  attachPaletteDrag(btn, { kind: 'chip', def }, () => selectChip(def, btn));
  return btn;
}

/**
 * Reconstrói a lista da paleta (NAND + chips) na ordem persistida. A ordem é
 * reconciliada com a biblioteca a cada render — chips novos entram no fim e os
 * removidos saem — e re-salva, mantendo `localStorage` em dia sem hooks extras.
 */
function refreshPalette(): void {
  paletteList.querySelectorAll('button.chip-btn').forEach((b) => b.remove());
  clearChipSelection();

  const defs = library.list();
  paletteOrder = reconcileOrder(
    paletteOrder,
    defs.map((d) => d.id),
  );
  savePaletteOrder(paletteOrder);

  const defById = new Map(defs.map((d) => [d.id, d]));
  // `appendChild` move o NAND (elemento existente) e insere os chips na ordem.
  for (const key of paletteOrder) {
    if (key === NAND_KEY) {
      paletteList.appendChild(nandBtn);
    } else {
      const def = defById.get(key);
      if (def) paletteList.appendChild(createChipButton(def));
    }
  }
  updatePaletteScroll();
}

document.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((btn) => {
  attachPaletteDrag(btn, { kind: 'primitive', type: btn.dataset.add as PrimitiveType });
});

// O NAND participa da reordenação pela sua alça (botão estático no HTML).
const nandHandle = nandBtn.querySelector<HTMLElement>('.drag-handle');
if (nandHandle) attachReorderDrag(nandHandle, nandBtn);

// --- Fluxo "Make": empacota o espaço em um chip e abre a edição do nome ------

const makeBtn = document.querySelector<HTMLButtonElement>('#make')!;

/** "Make" só é possível com ao menos uma entrada e uma saída no espaço. */
function canMake(): boolean {
  return store.countByType('input') >= 1 && store.countByType('output') >= 1;
}

/**
 * Propaga o novo nome de um chip para o rótulo exibido em todas as suas
 * instâncias — tanto no espaço atual quanto nas aninhadas em outras definições —
 * de modo que a renomeação seja visível em todo lugar (a simulação continua
 * resolvendo por `defId`, não pelo nome).
 */
function propagateChipName(defId: string, newName: string): void {
  for (const node of store.listNodes()) if (node.defId === defId) node.name = newName;
  for (const other of library.list()) {
    for (const node of other.internal.nodes) if (node.defId === defId) node.name = newName;
  }
}

/** Primeiro nome padrão livre no formato `Chip N` (N ≥ 1). */
function defaultChipName(): string {
  let n = 1;
  while (library.get(`Chip ${n}`)) n += 1;
  return `Chip ${n}`;
}

makeBtn.addEventListener('click', () => {
  if (!canMake()) return;
  // Captura o espaço como definição (preserva chips aninhados) com um nome padrão
  // e registra na biblioteca.
  const def = captureDefinition(store.toJSON(), defaultChipName());
  library.add(def);
  refreshPalette();
  // Esvazia o espaço de trabalho: o conteúdo virou a definição do chip (na paleta).
  // Nenhuma instância é recriada — o usuário arrasta o chip da paleta quando quiser.
  store.clear();
  clearSelection();
  // Abre a edição in-place do nome no botão recém-criado, para o usuário nomeá-lo.
  const btn = palette.querySelector<HTMLButtonElement>(`button.chip-btn[data-chip-id="${def.id}"]`);
  if (btn) openChipNameEdit(def, btn);
});

// --- Editar um chip existente --------------------------------------------

const editBar = document.querySelector<HTMLDivElement>('#edit-bar')!;
const editLabel = document.querySelector<HTMLSpanElement>('#edit-label')!;
const finishEditBtn = document.querySelector<HTMLButtonElement>('#finish-edit')!;
const cancelEditBtn = document.querySelector<HTMLButtonElement>('#cancel-edit')!;

/**
 * Edição em andamento, ou `null`. Guarda o id e o nome do chip editado e um
 * snapshot do espaço de trabalho anterior, restaurado ao concluir/cancelar.
 */
let editing: { defId: string; name: string; snapshot: CircuitState } | null = null;

/** Abre o circuito interno de um chip no espaço para edição. */
function openChipForEdit(def: ChipDefinition): void {
  if (editing) return;
  editing = { defId: def.id, name: def.name, snapshot: structuredClone(store.toJSON()) };
  store.loadState(def.internal);
  clearSelection();
  clearChipSelection();
  editLabel.textContent = t('editBar.editing', { name: def.name });
  editBar.hidden = false;
}

/** Sai do modo edição, restaurando o espaço de trabalho guardado. */
function exitEdit(): void {
  if (!editing) return;
  store.loadState(editing.snapshot);
  editing = null;
  editBar.hidden = true;
  clearSelection();
}

/**
 * Conclui a edição: recaptura o espaço como a definição do chip, **preservando o
 * id** (para não quebrar as instâncias) e atualiza a biblioteca. A nova lógica
 * propaga automaticamente (a simulação resolve por `defId`); além disso, as
 * instâncias têm os pinos reconciliados — no espaço a ser restaurado e dentro
 * das outras definições — de modo que mudanças no nº/rótulo de I/O fiquem
 * refletidas e fios para pinos removidos sejam descartados.
 */
function finishEdit(): void {
  if (!editing) return;
  const def = captureDefinition(structuredClone(store.toJSON()), editing.name, editing.defId);
  reconcileInstances(editing.snapshot, def);
  for (const other of library.list()) {
    if (other.id !== def.id) reconcileInstances(other.internal, def);
  }
  library.update(def);
  refreshPalette();
  exitEdit();
}

finishEditBtn.addEventListener('click', finishEdit);
cancelEditBtn.addEventListener('click', exitEdit);

// --- Ações da barra contextual (Edit / Rename / Delete) ------------------

/** Remove da biblioteca o chip selecionado na paleta. */
function deleteSelectedChip(): void {
  if (!selectedChipDef) return;
  library.remove(selectedChipDef.id);
  // Instâncias já colocadas que referenciem este chip ficam inertes (o netlist
  // ignora chips sem definição); a limpeza de instâncias órfãs fica fora desta track.
  refreshPalette(); // limpa a seleção e atualiza a barra
}

actionEditBtn.addEventListener('click', () => {
  if (selectedChipDef) openChipForEdit(selectedChipDef);
});
actionRenameBtn.addEventListener('click', () => {
  if (selectedChipDef) {
    const btn = palette.querySelector<HTMLButtonElement>(
      `button.chip-btn[data-chip-id="${selectedChipDef.id}"]`,
    );
    if (btn) openChipNameEdit(selectedChipDef, btn);
    return;
  }
  if (selectedNodes.size === 1) {
    const node = store.getNode(firstSelectedNode()!);
    if (node && (node.type === 'input' || node.type === 'output')) openRenameOverlay(node);
  }
});
actionDeleteBtn.addEventListener('click', () => {
  if (selectedChipDef) deleteSelectedChip();
  else deleteSelection();
});

// --- Renomear entrada/saída (duplo clique / toque duplo) -----------------

const renameOverlay = document.querySelector<HTMLDivElement>('#rename-overlay')!;
const renameInput = document.querySelector<HTMLInputElement>('#rename-input')!;

/**
 * Editor de texto in-place: um único overlay reutilizado para renomear tanto nós
 * de I/O (no canvas) quanto chips (na paleta). `inlineCommit` guarda a ação a
 * executar com o valor digitado ao confirmar; `null` enquanto o editor está
 * fechado.
 */
let inlineCommit: ((value: string) => void) | null = null;

/** Rótulo padrão de um nó I/O ainda não renomeado. */
function defaultIoLabel(node: CircuitNode): string {
  return node.type === 'output' ? 'OUT' : 'IN';
}

/** Largura mínima (em caracteres) do editor in-place, para caber rótulos curtos. */
const INLINE_EDITOR_MIN_CHARS = 3;

/** Dimensiona o campo conforme o conteúdo, mantendo-o centralizado sobre o alvo. */
function autoSizeInlineEditor(): void {
  renameInput.size = Math.max(renameInput.value.length, INLINE_EDITOR_MIN_CHARS);
}

/**
 * Abre o editor in-place em (left, top) da tela, com o `transform` de ancoragem.
 * Se `box` for informado, o editor ocupa exatamente essa área (modo "sobre o
 * componente"); caso contrário, dimensiona-se pelo conteúdo via `size`.
 */
function openInlineEditor(opts: {
  value: string;
  left: number;
  top: number;
  transform: string;
  onCommit: (value: string) => void;
  box?: { width: number; height: number };
}): void {
  inlineCommit = opts.onCommit;
  renameInput.value = opts.value;
  if (opts.box) {
    renameOverlay.classList.add('inplace');
    renameOverlay.style.width = `${opts.box.width}px`;
    renameOverlay.style.height = `${opts.box.height}px`;
  } else {
    renameOverlay.classList.remove('inplace');
    renameOverlay.style.width = '';
    renameOverlay.style.height = '';
    autoSizeInlineEditor();
  }
  renameOverlay.style.left = `${opts.left}px`;
  renameOverlay.style.top = `${opts.top}px`;
  renameOverlay.style.transform = opts.transform;
  renameOverlay.hidden = false;
  // `preventScroll` evita o salto da viewport ao focar perto do teclado virtual.
  renameInput.focus({ preventScroll: true });
  renameInput.select();
}

function closeInlineEditor(): void {
  renameOverlay.hidden = true;
  inlineCommit = null;
}

/** Confirma a edição: dispara `onCommit` com o valor atual e fecha o editor. */
function commitInlineEditor(): void {
  const commit = inlineCommit;
  const value = renameInput.value;
  closeInlineEditor();
  commit?.(value);
}

/** Largura/altura mínima (px de tela) do editor sobre um nó, para o texto caber
 *  legível mesmo em nós pequenos (I/O tem só 40×40 no mundo). */
const INLINE_EDITOR_MIN_BOX = { w: 96, h: 36 };

/** Abre a edição in-place do rótulo de um nó I/O, centrada sobre o próprio nó. */
function openRenameOverlay(node: CircuitNode): void {
  const { w, h } = nodeSize(node);
  const rect = canvas!.getBoundingClientRect();
  // Centraliza o editor no centro do nó (o rótulo do nó também é centrado),
  // ocupando a área do nó com um mínimo legível para nós pequenos.
  const center = camera.worldToScreen({ x: node.pos.x + w / 2, y: node.pos.y + h / 2 });
  // Pré-preenche com o nome atual ou, se ainda não renomeado, com o padrão
  // (IN/OUT) para deixar claro que é o rótulo a editar.
  openInlineEditor({
    value: node.name ?? defaultIoLabel(node),
    left: rect.left + center.x,
    top: rect.top + center.y,
    transform: 'translate(-50%, -50%)',
    box: {
      width: Math.max(w * camera.zoom, INLINE_EDITOR_MIN_BOX.w),
      height: Math.max(h * camera.zoom, INLINE_EDITOR_MIN_BOX.h),
    },
    onCommit: (value) => store.setNodeName(node.id, value),
  });
}

renameInput.addEventListener('input', () => {
  // No modo "sobre o componente" a largura é fixa (100% da caixa); não auto-dimensiona.
  if (!renameOverlay.classList.contains('inplace')) autoSizeInlineEditor();
});
renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitInlineEditor();
  else if (e.key === 'Escape') closeInlineEditor();
});
// Sair do campo (tocar fora, etc.) confirma o nome — exceto se já foi fechado
// por Enter/Esc (overlay oculto).
renameInput.addEventListener('blur', () => {
  if (!renameOverlay.hidden) commitInlineEditor();
});

// --- Pinça (dois ponteiros) ----------------------------------------------

function beginPinch(): void {
  // Cancela qualquer arrasto/fio em andamento para não "pular" ao iniciar a pinça.
  mode = 'pinch';
  dragNodeId = null;
  wireStart = null;
  const [a, b] = [...pointers.values()];
  if (a && b) pinchPrev = samplePinch(a, b);
}

function updatePinch(): void {
  const [a, b] = [...pointers.values()];
  if (!a || !b || !pinchPrev) return;
  const curr = samplePinch(a, b);
  const d = pinchDelta(pinchPrev, curr);
  camera.zoomAt(d.anchor, d.factor);
  camera.panBy(d.dx, d.dy);
  pinchPrev = curr;
}

/**
 * Prepara o arraste em grupo: registra a posição inicial (mundo) do ponteiro e
 * de cada nó selecionado, além do caso (Z/S) dos fios conectados a qualquer nó
 * do grupo (para resetar o ajuste manual da barra se o caminho inverter).
 */
function beginGroupDrag(world: Vec2): void {
  groupDragStart = world;
  groupStartPos = new Map();
  dragNodeWireShapes = new Map();
  for (const id of selectedNodes) {
    const n = store.getNode(id);
    if (n) groupStartPos.set(id, { x: n.pos.x, y: n.pos.y });
    for (const w of wiresOfNode(id)) {
      const s = wireShape(w);
      if (s) dragNodeWireShapes.set(w.id, s);
    }
  }
}

// --- Ponteiro: decide o modo a partir do que foi atingido ----------------

canvas.addEventListener('pointerdown', (e) => {
  const screen = pointerScreen(e);
  pointers.set(e.pointerId, screen);
  canvas.setPointerCapture(e.pointerId);
  // Interagir com o canvas tira o foco do chip selecionado na paleta.
  clearChipSelection();
  lastPointer = screen;

  if (pointers.size >= 2) {
    cancelLongPress();
    beginPinch();
    return;
  }

  // Pan com o botão do meio (1) ou direito (2) do mouse: não interage com
  // elementos nem altera a seleção. O toque continua usando dois dedos (pinça).
  if (e.pointerType !== 'touch' && (e.button === 1 || e.button === 2)) {
    e.preventDefault(); // suprime o auto-scroll do botão do meio
    mode = 'pan';
    return;
  }

  const world = camera.screenToWorld(screen);
  const tol = worldTol(hitPx(e.pointerType));

  const pin = hitPin(store, world, tol);
  if (pin) {
    mode = 'wire';
    wireStart = pin;
    ghostEnd = world;
    ghostValid = false;
    return;
  }

  const nodeId = hitNode(store, world);
  if (nodeId) {
    mode = 'dragNode';
    dragNodeId = nodeId;
    const node = store.getNode(nodeId)!;
    const wasSelected = selectedNodes.has(nodeId);
    // Toque simples sobre um input previamente selecionado *sozinho* alterna seu
    // estado; não se aplica quando ele faz parte de uma multi-seleção.
    toggleCandidateId =
      wasSelected && selectedNodes.size === 1 && node.type === 'input' ? nodeId : null;
    // Long press sobre um input já selecionado *sozinho* ativa o modo CLK. O timer
    // é cancelado se o gesto virar arrasto (pointermove) ou terminar antes (tap).
    longPressFired = false;
    if (toggleCandidateId) {
      const id = toggleCandidateId;
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        longPressFired = true;
        store.setInputClock(id);
      }, LONG_PRESS_MS);
    }
    // Arrastar um nó que já pertence à seleção move o grupo inteiro; arrastar um
    // nó fora da seleção primeiro o torna a seleção única.
    if (!wasSelected) selectSingleNode(nodeId);
    beginGroupDrag(world);
    return;
  }

  // Barra ajustável de um fio: inicia o arraste da barra (antes da seleção geral).
  const bar = hitWireBar(store, world, worldTol(hitPx(e.pointerType)));
  if (bar) {
    dragBar = bar;
    mode = 'dragWaypoint';
    selectWire(bar.wireId);
    return;
  }

  const wireId = hitWire(store, world, worldTol(hitPx(e.pointerType)));
  if (wireId) {
    selectWire(wireId);
    mode = 'idle';
    return;
  }

  // Área vazia (botão esquerdo do mouse ou um dedo): inicia o retângulo de
  // seleção. A seleção só é definida ao soltar; um clique sem arrasto a limpa.
  clearSelection();
  marqueeStart = world;
  marqueeEnd = world;
  mode = 'marquee';
});

/** Caso (Z/S) atual de um fio, ou `null` se algum pino sumiu. */
function wireShape(wire: Wire): 'Z' | 'S' | null {
  const from = store.pinPos(wire.from);
  const to = store.pinPos(wire.to);
  if (!from || !to) return null;
  return wirePath(from, to).shape;
}

/** Fios conectados a um nó (como origem ou destino). */
function wiresOfNode(nodeId: string): Wire[] {
  return store.listWires().filter((w) => w.from.nodeId === nodeId || w.to.nodeId === nodeId);
}

/** Atualiza o cursor no hover (apenas mouse). */
function updateHoverCursor(world: Vec2): void {
  if (hitPin(store, world, worldTol(8))) canvas!.style.cursor = 'crosshair';
  else if (hitNode(store, world)) canvas!.style.cursor = 'move';
  else {
    const bar = hitWireBar(store, world, worldTol(8));
    if (bar) canvas!.style.cursor = bar.axis === 'x' ? 'ew-resize' : 'ns-resize';
    // Área vazia: arraste com o botão esquerdo desenha o retângulo de seleção
    // (o pan ficou no botão do meio/direito), então o cursor padrão é a seta.
    else canvas!.style.cursor = 'default';
  }
}

canvas.addEventListener('pointermove', (e) => {
  const screen = pointerScreen(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, screen);
  const world = camera.screenToWorld(screen);

  // Mover além do limiar de arrasto descaracteriza o long press (vira arrasto do nó).
  if (longPressTimer !== null && isDrag(lastPointer, screen)) cancelLongPress();

  if (mode === 'pinch') {
    updatePinch();
    return;
  }

  if (mode === 'pan') {
    camera.panBy(screen.x - lastPointer.x, screen.y - lastPointer.y);
    lastPointer = screen;
  } else if (mode === 'dragNode' && dragNodeId) {
    // Translação rígida do grupo: o delta do ponteiro é snapado à grade e somado
    // à posição inicial de cada nó. Como os nós já estavam alinhados, o grupo
    // permanece no grid e suas posições relativas são preservadas.
    const delta = snapToGrid({ x: world.x - groupDragStart.x, y: world.y - groupDragStart.y });
    for (const [id, start] of groupStartPos) {
      const node = store.getNode(id);
      if (!node) continue;
      node.pos.x = start.x + delta.x;
      node.pos.y = start.y + delta.y;
    }
    // Se um fio conectado a qualquer nó do grupo inverteu de caso (Z↔S), reseta
    // seu ajuste manual de barra.
    for (const [wid, oldShape] of dragNodeWireShapes) {
      const w = store.listWires().find((x) => x.id === wid);
      if (!w) continue;
      const cur = wireShape(w);
      if (cur && cur !== oldShape) {
        w.barOffset = undefined;
        dragNodeWireShapes.set(wid, cur);
      }
    }
  } else if (mode === 'marquee') {
    marqueeEnd = world;
  } else if (mode === 'dragWaypoint' && dragBar) {
    const w = store.listWires().find((x) => x.id === dragBar!.wireId);
    const from = w && store.pinPos(w.from);
    const to = w && store.pinPos(w.to);
    if (w && from && to) {
      const def = wirePath(from, to, 0).bar;
      w.barOffset =
        dragBar.axis === 'x' ? snapScalar(world.x) - def.a.x : snapScalar(world.y) - def.a.y;
    }
  } else if (mode === 'wire' && wireStart) {
    ghostEnd = world;
    const target = hitPin(store, world, worldTol(hitPx(e.pointerType)));
    ghostValid = target !== null && validateConnection(store, wireStart, target).ok;
  } else if (mode === 'idle' && e.pointerType === 'mouse') {
    updateHoverCursor(world);
  }
});

function endPointer(e: PointerEvent): void {
  // O ponteiro subiu/cancelou: encerra qualquer long press pendente. Se já disparou,
  // o flag `longPressFired` suprime o toggle de tap abaixo.
  cancelLongPress();

  // Libera a captura do ponteiro antes de qualquer foco programático: no touch, o
  // teclado virtual só abre se o canvas não estiver mais capturando este ponteiro.
  if (canvas!.hasPointerCapture(e.pointerId)) {
    canvas!.releasePointerCapture(e.pointerId);
  }

  if (mode === 'wire' && wireStart) {
    const world = camera.screenToWorld(pointerScreen(e));
    const target = hitPin(store, world, worldTol(hitPx(e.pointerType)));
    if (target) {
      const res = validateConnection(store, wireStart, target);
      if (res.ok) {
        store.addWire(res.from, res.to);
        playConnect();
      }
    } else {
      // Soltou no vazio: cria um IN/OUT herdando o rótulo do pino de origem.
      createIoFromPinDrag(wireStart, world);
    }
  } else if (mode === 'dragNode' && dragNodeId) {
    const up = pointerScreen(e);
    // Só conta como toque (não arrasto) se o ponteiro mal se moveu.
    if (isDrag(lastPointer, up)) {
      playDrop();
      // Mover um nó único "assenta" e limpa a seleção (comportamento atual);
      // mover um grupo preserva a seleção para ações subsequentes (mover de novo,
      // excluir em conjunto).
      if (selectedNodes.size <= 1) clearSelection();
    } else if (toggleCandidateId && !longPressFired) {
      // Toque simples sobre um input já selecionado alterna OFF ↔ ON (e sai do CLK,
      // se estiver). O long press, quando dispara, já ativou o CLK e suprime o tap.
      store.cycleInputState(toggleCandidateId);
    }
  } else if (mode === 'marquee') {
    const up = pointerScreen(e);
    if (isDrag(lastPointer, up)) {
      // Arraste real: seleciona os nós contidos no retângulo.
      selectNodeSet(nodesInRect(store.listNodes(), rectFromCorners(marqueeStart, marqueeEnd)));
    }
    // Clique sem arrasto em área vazia já limpou a seleção no pointerdown.
  }

  pointers.delete(e.pointerId);

  if (mode === 'pinch' && pointers.size < 2) {
    // Sai da pinça; não retoma pan com o dedo restante para evitar saltos.
    pinchPrev = null;
    mode = 'idle';
  } else if (mode !== 'pinch') {
    mode = 'idle';
    dragNodeId = null;
    wireStart = null;
    toggleCandidateId = null;
    longPressFired = false;
    dragBar = null;
    dragNodeWireShapes = new Map();
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Evita o menu de contexto (long-press) sobre o canvas em toque/desktop.
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const screen = pointerScreen(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    camera.zoomAt(screen, factor);
  },
  { passive: false },
);

// --- Teclado: remover seleção --------------------------------------------

window.addEventListener('keydown', (e) => {
  // Enquanto se digita num campo de texto (renomear I/O, nomear chip), Backspace
  // edita o texto — não deve excluir o nó/fio selecionado.
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectionCount() > 0) {
    e.preventDefault();
    deleteSelection();
  }
});

// --- Render loop ---------------------------------------------------------

let lastCanMake: boolean | null = null;

// Estado de sinal do frame, produzido pelo motor event-driven.
let signalState: SignalState | undefined;

// Motor de simulação stateful. É reconstruído apenas quando a **topologia** muda
// (nós/fios), recompilando o netlist achatado; alternâncias de entrada/modo de
// clock são empurradas como eventos, preservando a memória de runtime (latches).
let sim: Simulator | undefined;
let simVersion = -1;

/**
 * Garante que o motor reflete a topologia atual e sincroniza o estado das
 * entradas, então avança o tempo simulado até `now` (ms) e devolve o snapshot.
 */
function evaluate(now: number): SignalState {
  if (sim === undefined || simVersion !== store.topologyVersion) {
    sim = new Simulator(compile(store.toJSON(), resolveChip));
    simVersion = store.topologyVersion;
  }
  for (const node of store.listNodes()) {
    if (node.type !== 'input') continue;
    sim.setClock(node.id, node.clock === true);
    if (!node.clock) sim.setInput(node.id, node.value === true);
  }
  sim.advanceTo(now);
  return sim.snapshot();
}

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.clearRect(0, 0, viewWidth, viewHeight);

  drawGrid(ctx!, camera, viewWidth, viewHeight);

  // Realce dos nós selecionados é desenhado antes do circuito, para que os
  // conectores (pinos) e o corpo fiquem por cima da borda de seleção.
  for (const id of selectedNodes) {
    const node = store.getNode(id);
    if (node) drawNodeHighlight(ctx!, camera, node);
  }

  // Avalia o circuito a cada frame pelo motor event-driven (stateful): só
  // recompila quando a topologia muda; o clock avança com o tempo atual.
  signalState = evaluate(performance.now());
  drawCircuit(ctx!, camera, store, signalState);

  // Atualiza a visibilidade do botão "Fazer" apenas quando muda. Durante a edição
  // de um chip o botão fica oculto (a barra de edição ocupa o canto).
  const able = canMake() && editing === null;
  if (able !== lastCanMake) {
    makeBtn.hidden = !able;
    lastCanMake = able;
  }

  // Realce de fio selecionado fica por cima do circuito.
  if (selectedWire) {
    const wire = store.listWires().find((w) => w.id === selectedWire);
    const from = wire && store.pinPos(wire.from);
    const to = wire && store.pinPos(wire.to);
    if (from && to) drawWireHighlight(ctx!, camera, from, to, wire!.barOffset);
  }

  // Retângulo de seleção durante o arraste em área vazia.
  if (mode === 'marquee') {
    drawMarquee(ctx!, camera, marqueeStart, marqueeEnd);
  }

  // Ghost do componente sendo arrastado da paleta para o canvas.
  if (paletteDrag?.previewWorld) {
    ctx!.save();
    ctx!.globalAlpha = 0.55;
    drawNode(ctx!, camera, previewNode(paletteDrag.item, paletteDrag.previewWorld));
    ctx!.restore();
  }

  // Fio fantasma durante a criação de conexão.
  if (mode === 'wire' && wireStart) {
    const start = store.pinPos(wireStart);
    if (start) {
      // `wirePath` assume `from` = saída (coto sai à direita) e `to` = entrada
      // (coto entra à esquerda). Ao arrastar de um pino de entrada, orientamos o
      // fantasma com o ponto livre como origem, para o coto deixar o pino pela
      // esquerda — coerente com o lado do conector.
      const fromInput = store.getPin(wireStart)?.kind === 'in';
      if (fromInput) drawGhostWire(ctx!, camera, ghostEnd, start, ghostValid);
      else drawGhostWire(ctx!, camera, start, ghostEnd, ghostValid);
    }
  }

  // Tutorial: avalia o passo atual contra o estado e avança quando concluído.
  updateTutorial();

  requestAnimationFrame(render);
}

// --- Menu de comandos (≡) ------------------------------------------------

const menuBtn = document.querySelector<HTMLButtonElement>('#menu-btn')!;
const commandsMenu = document.querySelector<HTMLDivElement>('#commands-menu')!;

function setMenuOpen(open: boolean): void {
  commandsMenu.hidden = !open;
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(commandsMenu.hidden);
});
// Clicar fora do menu o fecha.
document.addEventListener('click', (e) => {
  if (commandsMenu.hidden) return;
  const target = e.target as Node;
  if (!commandsMenu.contains(target) && target !== menuBtn) setMenuOpen(false);
});

// Export: serializa a biblioteca de chips e dispara o download de um .json.
document.querySelector<HTMLButtonElement>('#cmd-export')!.addEventListener('click', () => {
  setMenuOpen(false);
  const json = serializeLibrary(library.list());
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nands-on-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Import: placeholder — implementado na Phase 3 desta track.
document.querySelector<HTMLButtonElement>('#cmd-import')!.addEventListener('click', () => {
  setMenuOpen(false);
});

// Limpar banco — afordância temporária de desenvolvimento, agora dentro do menu.
const clearDbBtn = document.querySelector<HTMLButtonElement>('#clear-db')!;
clearDbBtn.addEventListener('click', async () => {
  setMenuOpen(false);
  if (!confirm(t('clearDb.confirm'))) return;
  await clearChips();
  location.reload();
});

// --- Painel "Sobre" / boas-vindas ----------------------------------------

const aboutMenuItem = document.querySelector<HTMLButtonElement>('#cmd-about')!;
const aboutOverlay = document.querySelector<HTMLDivElement>('#about-overlay')!;
const aboutPanel = document.querySelector<HTMLDivElement>('#about-panel')!;
const aboutClose = document.querySelector<HTMLButtonElement>('#about-close')!;
const aboutCloseLabel = aboutClose.querySelector<HTMLSpanElement>('.about-close-label')!;
const aboutDontShow = document.querySelector<HTMLInputElement>('#about-dont-show')!;

/** Modo do painel: "about" (aberto pelo "?") ou "welcome" (auto no 1º acesso). */
let aboutMode: 'about' | 'welcome' = 'about';

function openAbout(mode: 'about' | 'welcome' = 'about'): void {
  aboutMode = mode;
  // O checkbox reflete a preferência atual ao abrir.
  aboutDontShow.checked = isWelcomeDismissed();
  // No 1º acesso, o botão primário convida a iniciar o tutorial; via "?", só fecha.
  // Escreve no rótulo (span), preservando o ícone injetado no botão.
  aboutCloseLabel.textContent = mode === 'welcome' ? t('tutorial.start') : t('about.close');
  aboutOverlay.hidden = false;
}

function closeAbout(): void {
  // Ao fechar, persiste a escolha do checkbox: controla se as boas-vindas voltam a
  // abrir sozinhas no próximo acesso.
  setWelcomeDismissed(aboutDontShow.checked);
  aboutOverlay.hidden = true;
}

aboutMenuItem.addEventListener('click', () => {
  setMenuOpen(false);
  openAbout('about');
});
// O botão primário sempre fecha; em modo boas-vindas, também inicia o tutorial.
aboutClose.addEventListener('click', () => {
  const startTut = aboutMode === 'welcome';
  closeAbout();
  if (startTut) startTutorial();
});
// Clique no fundo (fora do painel) fecha sem iniciar o tutorial; dentro, não.
aboutOverlay.addEventListener('click', (e) => {
  if (!aboutPanel.contains(e.target as Node)) closeAbout();
});
// Esc fecha o painel (sem iniciar) ou, se o tutorial estiver ativo, sai dele.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!aboutOverlay.hidden) closeAbout();
  else if (tutorialState.active) exitTutorial();
});

// Primeiro acesso (sem a flag de dispensa): abre as boas-vindas automaticamente.
if (shouldAutoShowWelcome(isWelcomeDismissed())) openAbout('welcome');

// --- Painel "Help" (resumo das funcionalidades) --------------------------

const helpMenuItem = document.querySelector<HTMLButtonElement>('#cmd-help')!;
const helpOverlay = document.querySelector<HTMLDivElement>('#help-overlay')!;
const helpPanel = document.querySelector<HTMLDivElement>('#help-panel')!;
const helpClose = document.querySelector<HTMLButtonElement>('#help-close')!;

function openHelp(): void {
  helpOverlay.hidden = false;
}

function closeHelp(): void {
  helpOverlay.hidden = true;
}

helpMenuItem.addEventListener('click', () => {
  setMenuOpen(false);
  openHelp();
});
helpClose.addEventListener('click', closeHelp);
// Clique no fundo (fora do painel) fecha o Help.
helpOverlay.addEventListener('click', (e) => {
  if (!helpPanel.contains(e.target as Node)) closeHelp();
});
// Esc fecha o Help quando aberto.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpOverlay.hidden) closeHelp();
});

// --- Tutorial (walkthrough) ----------------------------------------------

const tutorialCallout = document.querySelector<HTMLDivElement>('#tutorial-callout')!;
const tutorialProgress = document.querySelector<HTMLDivElement>('#tutorial-progress')!;
const tutorialText = document.querySelector<HTMLParagraphElement>('#tutorial-text')!;
const tutorialExit = document.querySelector<HTMLButtonElement>('#tutorial-exit')!;
const tutorialHighlight = document.querySelector<HTMLDivElement>('#tutorial-highlight')!;

let tutorialState: TutorialState = { active: false, index: 0 };
let tutorialStepStart: StepStartSnapshot = captureStepStart([], 0);
/** Elemento-alvo do destaque do passo atual (null quando não há destaque). */
let tutorialHighlightTarget: HTMLElement | null = null;

/** Define (ou limpa) o alvo do destaque do passo atual e reposiciona o overlay. */
function setTutorialHighlight(selector?: string): void {
  tutorialHighlightTarget = selector
    ? document.querySelector<HTMLElement>(selector)
    : null;
  positionTutorialHighlight();
}

/**
 * Posiciona o overlay de destaque sobre o alvo atual a partir do seu
 * getBoundingClientRect (coordenadas de viewport, casando com position: fixed).
 * Oculta o overlay quando não há alvo ou quando o alvo está fora de tela.
 */
function positionTutorialHighlight(): void {
  const target = tutorialHighlightTarget;
  if (!target) {
    tutorialHighlight.hidden = true;
    return;
  }
  const rect = target.getBoundingClientRect();
  // Alvo sem dimensões (oculto/display:none): nada a destacar.
  if (rect.width === 0 && rect.height === 0) {
    tutorialHighlight.hidden = true;
    return;
  }
  tutorialHighlight.style.left = `${rect.left}px`;
  tutorialHighlight.style.top = `${rect.top}px`;
  tutorialHighlight.style.width = `${rect.width}px`;
  tutorialHighlight.style.height = `${rect.height}px`;
  // Herda o raio do alvo para o halo casar com a forma (círculo do I/O vs chip).
  tutorialHighlight.style.borderRadius = getComputedStyle(target).borderRadius;
  tutorialHighlight.hidden = false;
}

/** Atualiza o callout para refletir o passo atual (ou a tela de conclusão). */
function renderTutorialStep(): void {
  const step = currentStep(NOT_TUTORIAL_STEPS, tutorialState);
  if (!step) {
    // Concluído: mensagem final (o "×" continua fechando o callout).
    setTutorialHighlight(undefined);
    tutorialProgress.textContent = t('tutorial.doneTitle');
    tutorialText.textContent = t('tutorial.done');
    return;
  }
  tutorialProgress.textContent = t('tutorial.progress', {
    n: tutorialState.index + 1,
    total: NOT_TUTORIAL_STEPS.length,
  });
  tutorialText.textContent = t(step.textKey);
  setTutorialHighlight(step.highlightSelector);
}

function startTutorial(): void {
  // Começa de um espaço limpo, para os predicados refletirem só o que o usuário
  // fizer durante o tutorial.
  store.clear();
  clearSelection();
  tutorialState = { active: true, index: 0 };
  tutorialStepStart = captureStepStart(store.listNodes(), library.list().length);
  renderTutorialStep();
  tutorialCallout.hidden = false;
}

function exitTutorial(): void {
  tutorialState = { active: false, index: 0 };
  setTutorialHighlight(undefined);
  tutorialCallout.hidden = true;
}

/** Checagem por frame: avança o passo quando sua condição é satisfeita. */
function updateTutorial(): void {
  if (!tutorialState.active) return;
  const before = tutorialState.index;
  tutorialState = advanceIfComplete(NOT_TUTORIAL_STEPS, tutorialState, {
    nodes: store.listNodes(),
    wires: store.listWires(),
    libraryCount: library.list().length,
    stepStart: tutorialStepStart,
  });
  if (tutorialState.index !== before) {
    tutorialStepStart = captureStepStart(store.listNodes(), library.list().length);
    renderTutorialStep();
  }
  // Acompanha o alvo a cada frame (scroll da paleta, resize, mudanças de layout).
  positionTutorialHighlight();
}

tutorialExit.addEventListener('click', exitTutorial);

window.addEventListener('resize', resize);
resize();
// No boot, centraliza a câmera na origem do mundo: como as definições de chip
// são salvas centradas em {0,0}, isso faz o conteúdo aparecer no centro da tela.
// Só no carregamento — resizes posteriores do usuário não reposicionam o pan.
camera.centerOn({ x: 0, y: 0 }, viewWidth, viewHeight);
updatePaletteScroll();
requestAnimationFrame(render);

// Restaura a biblioteca de chips persistida e repovoa a paleta. Assíncrono: o
// editor já está utilizável; os chips salvos aparecem assim que carregam.
void loadChips().then((defs) => {
  if (defs.length === 0) return;
  library.load(defs);
  refreshPalette();
});
