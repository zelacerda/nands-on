import './style.css';
import { Camera, type Vec2 } from './camera';
import { drawGrid } from './grid';
import {
  NODE_SIZE,
  type ChipDefinition,
  type CircuitNode,
  type CircuitState,
  type PinRef,
  type PrimitiveType,
  chipInstancePins,
  chipSize,
  createPins,
  nodeSize,
} from './model';
import { CircuitStore } from './store';
import { ChipLibrary, captureDefinition, reconcileInstances, validateChipName } from './chip';
import { clearChips, loadChips, saveChips } from './persistence';
import {
  drawCircuit,
  drawGhostWire,
  drawNode,
  drawNodeHighlight,
  drawWireHighlight,
} from './render';
import { hitNode, hitPin, hitWire } from './hittest';
import { type ChipResolver, type SignalState, simulate } from './simulator';
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
/** Último toque simples sobre um nó, para detectar duplo clique/toque. */
let lastTap: { time: number; pos: Vec2; nodeId: string } | null = null;

/** Janela (ms) e folga (px de tela) para caracterizar um toque/clique duplo. */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 24;

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
// Qualquer mutação da biblioteca (criar/editar/renomear chip) é persistida no
// IndexedDB de forma assíncrona.
library.onMutate = (defs) => void saveChips(defs);
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
  store.addChipInstance(
    def,
    centeredTopLeft(
      world,
      chipSize(def.inputCount, def.outputCount, def.name, def.inputLabels, def.outputLabels),
    ),
  );
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
    pos: centeredTopLeft(
      world,
      chipSize(def.inputCount, def.outputCount, def.name, def.inputLabels, def.outputLabels),
    ),
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

// --- Seleção e edição de chip na paleta ----------------------------------

const editChipBtn = document.querySelector<HTMLButtonElement>('#edit-chip')!;
/** Definição do chip selecionado na paleta (cujo "Editar" está visível), ou `null`. */
let selectedChipDef: ChipDefinition | null = null;
/** Último toque simples sobre um botão de chip, para detectar duplo clique/toque. */
let lastChipTap: { defId: string; time: number } | null = null;

/** Marca o botão `btn` como selecionado e revela "Editar"; limpa os demais. */
function selectChip(def: ChipDefinition, btn: HTMLElement): void {
  selectedChipDef = def;
  palette.querySelectorAll('button.chip-btn.selected').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
  editChipBtn.hidden = false;
}

/** Limpa a seleção de chip na paleta e esconde "Editar". */
function clearChipSelection(): void {
  selectedChipDef = null;
  palette.querySelectorAll('button.chip-btn.selected').forEach((b) => b.classList.remove('selected'));
  editChipBtn.hidden = true;
}

/**
 * Toque/clique simples num botão de chip: o primeiro seleciona (revela "Editar");
 * um segundo toque rápido no mesmo chip abre a renomeação.
 */
function onChipTap(def: ChipDefinition, btn: HTMLElement): void {
  const now = performance.now();
  const isDouble =
    lastChipTap !== null && lastChipTap.defId === def.id && now - lastChipTap.time <= DOUBLE_TAP_MS;
  if (isDouble) {
    lastChipTap = null;
    openNameDialog({ kind: 'rename', def });
    return;
  }
  lastChipTap = { defId: def.id, time: now };
  selectChip(def, btn);
}

/** Reconstrói os botões de chip na paleta a partir da biblioteca. */
function refreshPalette(): void {
  palette.querySelectorAll('button.chip-btn').forEach((b) => b.remove());
  clearChipSelection();
  for (const def of library.list()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.textContent = def.name;
    attachPaletteDrag(btn, { kind: 'chip', def }, () => onChipTap(def, btn));
    palette.insertBefore(btn, editChipBtn);
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

/**
 * O diálogo de nome serve tanto para **criar** um chip (fluxo "Fazer") quanto
 * para **renomear** um chip existente (duplo clique na paleta). O modo decide o
 * texto pré-preenchido, o rótulo do botão e a ação ao confirmar.
 */
type NameDialogMode = { kind: 'create' } | { kind: 'rename'; def: ChipDefinition };
let nameDialogMode: NameDialogMode = { kind: 'create' };

function openNameDialog(mode: NameDialogMode): void {
  nameDialogMode = mode;
  nameInput.value = mode.kind === 'rename' ? mode.def.name : '';
  nameConfirm.textContent = mode.kind === 'rename' ? 'Salvar' : 'Criar';
  nameError.hidden = true;
  nameDialog.hidden = false;
  nameInput.focus();
  nameInput.select();
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

function confirmName(): void {
  const mode = nameDialogMode;
  const excludeId = mode.kind === 'rename' ? mode.def.id : undefined;
  const check = validateChipName(library, nameInput.value, excludeId);
  if (!check.ok) {
    nameError.textContent = check.reason;
    nameError.hidden = false;
    return;
  }

  if (mode.kind === 'rename') {
    // Atualiza os rótulos das instâncias antes de renomear, para que o save
    // disparado por `rename` (onMutate) já persista as definições atualizadas.
    propagateChipName(mode.def.id, check.name);
    library.rename(mode.def.id, check.name);
    refreshPalette();
    closeNameDialog();
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
  if (canMake()) openNameDialog({ kind: 'create' });
});
nameConfirm.addEventListener('click', confirmName);
nameCancel.addEventListener('click', closeNameDialog);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmName();
  else if (e.key === 'Escape') closeNameDialog();
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
  setSelection(null);
  clearChipSelection();
  editLabel.textContent = `Editando: ${def.name}`;
  editBar.hidden = false;
}

/** Sai do modo edição, restaurando o espaço de trabalho guardado. */
function exitEdit(): void {
  if (!editing) return;
  store.loadState(editing.snapshot);
  editing = null;
  editBar.hidden = true;
  setSelection(null);
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

editChipBtn.addEventListener('click', () => {
  if (selectedChipDef) openChipForEdit(selectedChipDef);
});
finishEditBtn.addEventListener('click', finishEdit);
cancelEditBtn.addEventListener('click', exitEdit);

// --- Renomear entrada/saída (duplo clique / toque duplo) -----------------

const renameOverlay = document.querySelector<HTMLDivElement>('#rename-overlay')!;
const renameInput = document.querySelector<HTMLInputElement>('#rename-input')!;

/** Id do nó em edição, ou `null` se o overlay está fechado. */
let renameNodeId: string | null = null;

/** Rótulo padrão de um nó I/O ainda não renomeado. */
function defaultIoLabel(node: CircuitNode): string {
  return node.type === 'output' ? 'OUT' : 'IN';
}

/** Abre o overlay de renomear posicionado sobre o topo do nó I/O dado. */
function openRenameOverlay(node: CircuitNode): void {
  renameNodeId = node.id;
  // Pré-preenche com o nome atual ou, se ainda não renomeado, com o padrão
  // (IN/OUT) para deixar claro que é o rótulo a editar.
  renameInput.value = node.name ?? defaultIoLabel(node);
  const { w, h } = nodeSize(node);
  const rect = canvas!.getBoundingClientRect();
  // Por padrão flutua acima do nó; se houver pouco espaço no topo, cai abaixo
  // para não sair da tela (útil em mobile com o teclado virtual).
  const above = camera.worldToScreen({ x: node.pos.x + w / 2, y: node.pos.y });
  const flipBelow = above.y < 72;
  const anchor = flipBelow
    ? camera.worldToScreen({ x: node.pos.x + w / 2, y: node.pos.y + h })
    : above;
  renameOverlay.style.left = `${rect.left + anchor.x}px`;
  renameOverlay.style.top = `${rect.top + anchor.y}px`;
  renameOverlay.style.transform = flipBelow ? 'translate(-50%, 20%)' : 'translate(-50%, -120%)';
  renameOverlay.hidden = false;
  renameInput.focus();
  renameInput.select();
}

function closeRenameOverlay(): void {
  renameOverlay.hidden = true;
  renameNodeId = null;
}

/** Grava o nome digitado no nó e fecha o overlay. */
function commitRename(): void {
  if (renameNodeId) store.setNodeName(renameNodeId, renameInput.value);
  closeRenameOverlay();
}

renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitRename();
  else if (e.key === 'Escape') closeRenameOverlay();
});
// Sair do campo (tocar fora, etc.) confirma o nome — exceto se já foi fechado
// por Enter/Esc (overlay oculto).
renameInput.addEventListener('blur', () => {
  if (!renameOverlay.hidden) commitRename();
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
  // Interagir com o canvas tira o foco do chip selecionado na paleta.
  clearChipSelection();

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
  } else if (mode === 'dragNode' && dragNodeId) {
    const up = pointerScreen(e);
    // Só conta como toque (não arrasto) se o ponteiro mal se moveu.
    if (!isDrag(lastPointer, up)) {
      const now = performance.now();
      const isDouble =
        lastTap !== null &&
        lastTap.nodeId === dragNodeId &&
        now - lastTap.time <= DOUBLE_TAP_MS &&
        Math.hypot(up.x - lastTap.pos.x, up.y - lastTap.pos.y) <= DOUBLE_TAP_DIST;
      if (isDouble) {
        // Duplo toque sobre entrada/saída: abre a edição de nome (sem alternar valor).
        lastTap = null;
        const node = store.getNode(dragNodeId);
        if (node && (node.type === 'input' || node.type === 'output')) openRenameOverlay(node);
      } else {
        lastTap = { time: now, pos: up, nodeId: dragNodeId };
        // Toque simples sobre um input já selecionado alterna o estado.
        if (toggleCandidateId) store.toggleNodeValue(toggleCandidateId);
      }
    }
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
  // Enquanto se digita num campo de texto (renomear I/O, nomear chip), Backspace
  // edita o texto — não deve excluir o nó/fio selecionado.
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
    e.preventDefault();
    deleteSelection();
  }
});

// --- Render loop ---------------------------------------------------------

let lastCanMake: boolean | null = null;

// Estado de sinal preservado entre frames — dá memória de runtime aos
// circuitos sequenciais (ex.: SR Latch mantém o estado de hold).
let signalState: SignalState | undefined;

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

  // Avalia o circuito a cada frame, reaproveitando o estado anterior para que
  // circuitos sequenciais (com realimentação) preservem sua memória.
  signalState = simulate(store.toJSON(), resolveChip, signalState);
  drawCircuit(ctx!, camera, store, signalState);

  // Atualiza a visibilidade do botão "Fazer" apenas quando muda. Durante a edição
  // de um chip o botão fica oculto (a barra de edição ocupa o canto).
  const able = canMake() && editing === null;
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
      drawGhostWire(ctx!, camera.worldToScreen(start), camera.worldToScreen(ghostEnd), ghostValid);
    }
  }

  requestAnimationFrame(render);
}

// --- Limpar banco (afordância temporária de desenvolvimento) -------------
// Sempre visível, inclusive no deploy, para facilitar testes em outros
// dispositivos. TODO: ocultar/gated quando a feature amadurecer.
const clearDbBtn = document.querySelector<HTMLButtonElement>('#clear-db')!;
clearDbBtn.addEventListener('click', async () => {
  if (!confirm('Limpar o banco local? Todos os chips salvos serão removidos.')) return;
  await clearChips();
  location.reload();
});

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(render);

// Restaura a biblioteca de chips persistida e repovoa a paleta. Assíncrono: o
// editor já está utilizável; os chips salvos aparecem assim que carregam.
void loadChips().then((defs) => {
  if (defs.length === 0) return;
  library.load(defs);
  refreshPalette();
});
