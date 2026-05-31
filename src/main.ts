import './style.css';
import { Camera, type Vec2 } from './camera';
import { drawGrid } from './grid';
import { NODE_SIZE, type NodeType, type PinRef } from './model';
import { CircuitStore } from './store';
import {
  drawCircuit,
  drawGhostWire,
  drawNodeHighlight,
  drawWireHighlight,
} from './render';
import { hitNode, hitPin, hitWire } from './hittest';
import { validateConnection } from './connection';

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

type Mode = 'idle' | 'pan' | 'dragNode' | 'wire';
type Selection = { kind: 'node' | 'wire'; id: string } | null;

let mode: Mode = 'idle';
let selection: Selection = null;

let lastPointer: Vec2 = { x: 0, y: 0 }; // tela
let dragNodeId: string | null = null;
let dragOffset: Vec2 = { x: 0, y: 0 }; // mundo: ponteiro − pos do nó
let wireStart: PinRef | null = null;
let ghostEnd: Vec2 = { x: 0, y: 0 }; // mundo
let ghostValid = false;

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

function addNodeAtCenter(type: NodeType): void {
  const center = camera.screenToWorld({ x: viewWidth / 2, y: viewHeight / 2 });
  const { w, h } = NODE_SIZE[type];
  store.addNode(type, { x: center.x - w / 2, y: center.y - h / 2 });
}

document.querySelectorAll<HTMLButtonElement>('#palette button[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => addNodeAtCenter(btn.dataset.add as NodeType));
});
deleteBtn.addEventListener('click', deleteSelection);

// --- Ponteiro: decide o modo a partir do que foi atingido ----------------

canvas.addEventListener('pointerdown', (e) => {
  const screen = pointerScreen(e);
  const world = camera.screenToWorld(screen);
  lastPointer = screen;
  canvas.setPointerCapture(e.pointerId);

  const pin = hitPin(store, world, worldTol(8));
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
    setSelection({ kind: 'node', id: nodeId });
    return;
  }

  const wireId = hitWire(store, world, worldTol(6));
  if (wireId) {
    setSelection({ kind: 'wire', id: wireId });
    mode = 'idle';
    return;
  }

  setSelection(null);
  mode = 'pan';
});

canvas.addEventListener('pointermove', (e) => {
  const screen = pointerScreen(e);
  const world = camera.screenToWorld(screen);

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
    const target = hitPin(store, world, worldTol(8));
    ghostValid = target !== null && validateConnection(store, wireStart, target).ok;
  }
});

function endPointer(e: PointerEvent): void {
  if (mode === 'wire' && wireStart) {
    const world = camera.screenToWorld(pointerScreen(e));
    const target = hitPin(store, world, worldTol(8));
    if (target) {
      const res = validateConnection(store, wireStart, target);
      if (res.ok) store.addWire(res.from, res.to);
    }
  }
  mode = 'idle';
  dragNodeId = null;
  wireStart = null;
  if (canvas!.hasPointerCapture(e.pointerId)) {
    canvas!.releasePointerCapture(e.pointerId);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

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

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.clearRect(0, 0, viewWidth, viewHeight);

  drawGrid(ctx!, camera, viewWidth, viewHeight);
  drawCircuit(ctx!, camera, store);

  // Realce da seleção.
  if (selection?.kind === 'node') {
    const node = store.getNode(selection.id);
    if (node) drawNodeHighlight(ctx!, camera, node);
  } else if (selection?.kind === 'wire') {
    const wire = store.listWires().find((w) => w.id === selection!.id);
    const from = wire && store.pinPos(wire.from);
    const to = wire && store.pinPos(wire.to);
    if (from && to) drawWireHighlight(ctx!, camera.worldToScreen(from), camera.worldToScreen(to));
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
