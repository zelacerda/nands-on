import './style.css';
import { Camera, type Vec2 } from './camera';
import { drawGrid } from './grid';
import {
  NODE_SIZE,
  type ChipDefinition,
  type CircuitNode,
  type PinRef,
  type PrimitiveType,
  chipInstancePins,
  chipSize,
  createPins,
  nodeSize,
} from './model';
import { CircuitStore } from './store';
import { ChipLibrary, captureDefinition, validateChipName } from './chip';
import {
  drawCircuit,
  drawGhostWire,
  drawNode,
  drawNodeHighlight,
  drawWireHighlight,
} from './render';
import { hitNode, hitPin, hitWire } from './hittest';
import { type ChipResolver, simulate } from './simulator';
import { validateConnection } from './connection';
import { type PinchSample, pinchDelta, samplePinch } from './gesture';
import { centeredTopLeft, isDrag } from './palette';

const canvas = document.querySelector<HTMLCanvasElement>('#editor');
if (!canvas) {
  throw new Error('Canvas #editor não encontrado.');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Contexto 2D indisponível.');
}

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

type Mode = 'idle' | 'pan' | 'dragNode' | 'wire' | 'pinch';
type Selection = { kind: 'node' | 'wire'; id: string } | null;

let mode: Mode = 'idle';
let selection: Selection = null;

/** Ponteiros ativos (id → posição de tela), para pan e pinça. */
const pointers = new Map<number, Vec2>();

let lastPointer: Vec2 = { x: 0, y: 0 }; // tela (ponteiro único)
let dragNodeId: string | null = null;
let dragOffset: Vec2 = { x: 0, y: 0 }; // mundo: ponteiro − pos do nó
let wireStart: PinRef | null = null;
let ghostEnd: Vec2 = { x: 0, y: 0 }; // mundo
let ghostValid = false;
let pinchPrev: PinchSample | null = null;
/**
 * Nó `input` que já estava selecionado ao iniciar este gesto. Se o ponteiro
 * subir sem caracterizar arrasto, o clique alterna o estado do input em vez de
 * apenas movê-lo/selecioná-lo.
 */
let toggleCandidateId: string | null = null;

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

const deleteBtn = document.querySelector<HTMLButtonElement>('#delete')!;
function setSelection(next: Selection): void {
  selection = next;
  deleteBtn.hidden = next === null;
}

function deleteSelection(): void {
  if (!selection) return;
  if (selection.kind === 'node') store.removeNode(selection.id);
  else store.removeWire(selection.id);
  setSelection(null);
}

// --- Paleta --------------------------------------------------------------

const library = new ChipLibrary();
const palette = document.querySelector<HTMLElement>('#palette')!;

/** Resolve a topologia interna de um nó `chip` para a simulação recursiva. */
const resolveChip: ChipResolver = (node) =>
  node.defId ? library.list().find((d) => d.id === node.defId)?.internal : undefined;

/** Cria uma primitiva centrada no ponto de mundo `world`. */
function addNodeAt(type: PrimitiveType, world: Vec2): void {
  store.addNode(type, centeredTopLeft(world, NODE_SIZE[type]));
}

/** Cria uma instância de chip centrada no ponto de mundo `world`. */
function addChipInstanceAt(def: ChipDefinition, world: Vec2): void {
  store.addChipInstance(def, centeredTopLeft(world, chipSize(def.inputCount, def.outputCount)));
}

/** Componente que um botão da paleta cria: uma primitiva ou uma instância de chip. */
type PaletteItem =
  | { kind: 'primitive'; type: PrimitiveType }
  | { kind: 'chip'; def: ChipDefinition };

/** Cria no `store` a instância correspondente ao item, centrada em `world`. */
function spawnItem(item: PaletteItem, world: Vec2): void {
  if (item.kind === 'primitive') addNodeAt(item.type, world);
  else addChipInstanceAt(item.def, world);
}

/** Nó transitório (não persistido) usado apenas para a pré-visualização do arrasto. */
function previewNode(item: PaletteItem, world: Vec2): CircuitNode {
  if (item.kind === 'primitive') {
    return {
      id: '__preview__',
      type: item.type,
      pos: centeredTopLeft(world, NODE_SIZE[item.type]),
      pins: createPins(item.type),
    };
  }
  const { def } = item;
  return {
    id: '__preview__',
    type: 'chip',
    pos: centeredTopLeft(world, chipSize(def.inputCount, def.outputCount)),
    pins: chipInstancePins(def),
    defId: def.id,
    name: def.name,
  };
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

function attachPaletteDrag(btn: HTMLElement, item: PaletteItem): void {
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
    if (!isDrag(drag.start, end)) return; // clique simples: reservado para edição futura
    const world = clientToWorldOnCanvas(end);
    if (world) spawnItem(drag.item, world);
  });
  btn.addEventListener('pointercancel', (e) => {
    if (paletteDrag?.pointerId !== e.pointerId) return;
    if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    paletteDrag = null;
  });
}

/** Reconstrói os botões de chip na paleta a partir da biblioteca. */
function refreshPalette(): void {
  palette.querySelectorAll('button.chip-btn').forEach((b) => b.remove());
  for (const def of library.list()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.textContent = def.name;
    attachPaletteDrag(btn, { kind: 'chip', def });
    palette.insertBefore(btn, deleteBtn);
  }
}

document.querySelectorAll<HTMLButtonElement>('#palette button[data-add]').forEach((btn) => {
  attachPaletteDrag(btn, { kind: 'primitive', type: btn.dataset.add as PrimitiveType });
});
deleteBtn.addEventListener('click', deleteSelection);

// --- Fluxo "Fazer": empacota o espaço em um chip nomeado -----------------

const makeBtn = document.querySelector<HTMLButtonElement>('#make')!;
const nameDialog = document.querySelector<HTMLDivElement>('#name-dialog')!;
const nameInput = document.querySelector<HTMLInputElement>('#chip-name')!;
const nameError = document.querySelector<HTMLParagraphElement>('#name-error')!;
const nameConfirm = document.querySelector<HTMLButtonElement>('#name-confirm')!;
const nameCancel = document.querySelector<HTMLButtonElement>('#name-cancel')!;

/** "Fazer" só é possível com ao menos uma entrada e uma saída no espaço. */
function canMake(): boolean {
  return store.countByType('input') >= 1 && store.countByType('output') >= 1;
}

function openNameDialog(): void {
  nameInput.value = '';
  nameError.hidden = true;
  nameDialog.hidden = false;
  nameInput.focus();
}

function closeNameDialog(): void {
  nameDialog.hidden = true;
}

/** Centro (mundo) da bounding box de todos os nós do espaço, ou `null` se vazio. */
function nodesCenter(): Vec2 | null {
  const nodes = store.listNodes();
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const { w, h } = nodeSize(node);
    minX = Math.min(minX, node.pos.x);
    minY = Math.min(minY, node.pos.y);
    maxX = Math.max(maxX, node.pos.x + w);
    maxY = Math.max(maxY, node.pos.y + h);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function confirmMake(): void {
  const check = validateChipName(library, nameInput.value);
  if (!check.ok) {
    nameError.textContent = check.reason;
    nameError.hidden = false;
    return;
  }
  // Captura o espaço como definição (preserva chips aninhados) e registra na biblioteca.
  const center = nodesCenter();
  const def = captureDefinition(store.toJSON(), check.name);
  library.add(def);
  refreshPalette();
  // Substitui o espaço por uma única instância do chip criado, centrada onde os
  // componentes originais estavam.
  store.clear();
  if (center) addChipInstanceAt(def, center);
  setSelection(null);
  closeNameDialog();
}

makeBtn.addEventListener('click', () => {
  if (canMake()) openNameDialog();
});
nameConfirm.addEventListener('click', confirmMake);
nameCancel.addEventListener('click', closeNameDialog);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmMake();
  else if (e.key === 'Escape') closeNameDialog();
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

// --- Ponteiro: decide o modo a partir do que foi atingido ----------------

canvas.addEventListener('pointerdown', (e) => {
  const screen = pointerScreen(e);
  pointers.set(e.pointerId, screen);
  canvas.setPointerCapture(e.pointerId);

  if (pointers.size >= 2) {
    beginPinch();
    return;
  }

  const world = camera.screenToWorld(screen);
  lastPointer = screen;
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
    dragOffset = { x: world.x - node.pos.x, y: world.y - node.pos.y };
    // Clicar num input já selecionado (sem arrastar) alterna seu estado; clicar
    // num input ainda não selecionado apenas o seleciona (comportamento atual).
    const wasSelected = selection?.kind === 'node' && selection.id === nodeId;
    toggleCandidateId = wasSelected && node.type === 'input' ? nodeId : null;
    setSelection({ kind: 'node', id: nodeId });
    return;
  }

  const wireId = hitWire(store, world, worldTol(hitPx(e.pointerType)));
  if (wireId) {
    setSelection({ kind: 'wire', id: wireId });
    mode = 'idle';
    return;
  }

  setSelection(null);
  mode = 'pan';
});

/** Atualiza o cursor no hover (apenas mouse). */
function updateHoverCursor(world: Vec2): void {
  if (hitPin(store, world, worldTol(8))) canvas!.style.cursor = 'crosshair';
  else if (hitNode(store, world)) canvas!.style.cursor = 'move';
  else canvas!.style.cursor = 'grab';
}

canvas.addEventListener('pointermove', (e) => {
  const screen = pointerScreen(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, screen);
  const world = camera.screenToWorld(screen);

  if (mode === 'pinch') {
    updatePinch();
    return;
  }

  if (mode === 'pan') {
    camera.panBy(screen.x - lastPointer.x, screen.y - lastPointer.y);
    lastPointer = screen;
  } else if (mode === 'dragNode' && dragNodeId) {
    const node = store.getNode(dragNodeId);
    if (node) {
      node.pos.x = world.x - dragOffset.x;
      node.pos.y = world.y - dragOffset.y;
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
  if (mode === 'wire' && wireStart) {
    const world = camera.screenToWorld(pointerScreen(e));
    const target = hitPin(store, world, worldTol(hitPx(e.pointerType)));
    if (target) {
      const res = validateConnection(store, wireStart, target);
      if (res.ok) store.addWire(res.from, res.to);
    }
  } else if (mode === 'dragNode' && toggleCandidateId) {
    // Soltar sem arrastar sobre um input já selecionado: alterna o estado.
    if (!isDrag(lastPointer, pointerScreen(e))) store.toggleNodeValue(toggleCandidateId);
  }

  pointers.delete(e.pointerId);
  if (canvas!.hasPointerCapture(e.pointerId)) {
    canvas!.releasePointerCapture(e.pointerId);
  }

  if (mode === 'pinch' && pointers.size < 2) {
    // Sai da pinça; não retoma pan com o dedo restante para evitar saltos.
    pinchPrev = null;
    mode = 'idle';
  } else if (mode !== 'pinch') {
    mode = 'idle';
    dragNodeId = null;
    wireStart = null;
    toggleCandidateId = null;
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
  if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
    e.preventDefault();
    deleteSelection();
  }
});

// --- Render loop ---------------------------------------------------------

let lastCanMake: boolean | null = null;

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.clearRect(0, 0, viewWidth, viewHeight);

  drawGrid(ctx!, camera, viewWidth, viewHeight);

  // Realce do nó selecionado é desenhado antes do circuito, para que os
  // conectores (pinos) e o corpo fiquem por cima da borda de seleção.
  if (selection?.kind === 'node') {
    const node = store.getNode(selection.id);
    if (node) drawNodeHighlight(ctx!, camera, node);
  }

  // Avalia o circuito a cada frame (combinacional) e desenha com o estado de sinal.
  const signal = simulate(store.toJSON(), resolveChip);
  drawCircuit(ctx!, camera, store, signal);

  // Atualiza a visibilidade do botão "Fazer" apenas quando muda.
  const able = canMake();
  if (able !== lastCanMake) {
    makeBtn.hidden = !able;
    lastCanMake = able;
  }

  // Realce de fio selecionado fica por cima do circuito.
  if (selection?.kind === 'wire') {
    const wire = store.listWires().find((w) => w.id === selection!.id);
    const from = wire && store.pinPos(wire.from);
    const to = wire && store.pinPos(wire.to);
    if (from && to) drawWireHighlight(ctx!, camera.worldToScreen(from), camera.worldToScreen(to));
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
      drawGhostWire(
        ctx!,
        camera.worldToScreen(start),
        camera.worldToScreen(ghostEnd),
        ghostValid,
      );
    }
  }

  requestAnimationFrame(render);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(render);
