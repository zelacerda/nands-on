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
import { applyStrings, t } from './strings';
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
import { isWelcomeDismissed, setWelcomeDismissed, shouldAutoShowWelcome } from './welcome';
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

// Preenche os textos estáticos da UI a partir do módulo central de strings.
applyStrings();

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
 * subir sem caracterizar arrasto, o clique avança o estado do input no ciclo
 * (OFF → ON → CLK → OFF) em vez de apenas movê-lo/selecioná-lo.
 */
let toggleCandidateId: string | null = null;
/** Último toque simples sobre um nó, para detectar duplo clique/toque. */
let lastTap: { time: number; pos: Vec2; nodeId: string; cycled: boolean } | null = null;

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
    openChipNameEdit(def, btn);
    return;
  }
  lastChipTap = { defId: def.id, time: now };
  selectChip(def, btn);
}

/** Confirma a renomeação in-place de um chip; ignora nome vazio/duplicado. */
function commitChipRename(def: ChipDefinition, raw: string): void {
  const check = validateChipName(library, raw, def.id);
  if (!check.ok) return; // nome inválido: mantém o nome atual, sem travar
  propagateChipName(def.id, check.name);
  library.rename(def.id, check.name);
  refreshPalette();
}

/** Abre a edição in-place do nome de um chip, logo abaixo do seu botão na paleta. */
function openChipNameEdit(def: ChipDefinition, btn: HTMLElement): void {
  const rect = btn.getBoundingClientRect();
  openInlineEditor({
    value: def.name,
    left: rect.left + rect.width / 2,
    top: rect.bottom,
    transform: 'translate(-50%, 8px)',
    onCommit: (value) => commitChipRename(def, value),
  });
}

/** Reconstrói os botões de chip na paleta a partir da biblioteca. */
function refreshPalette(): void {
  palette.querySelectorAll('button.chip-btn').forEach((b) => b.remove());
  clearChipSelection();
  for (const def of library.list()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.dataset.chipId = def.id;
    btn.textContent = def.name;
    attachPaletteDrag(btn, { kind: 'chip', def }, () => onChipTap(def, btn));
    palette.insertBefore(btn, editChipBtn);
  }
}

document.querySelectorAll<HTMLButtonElement>('#palette button[data-add]').forEach((btn) => {
  attachPaletteDrag(btn, { kind: 'primitive', type: btn.dataset.add as PrimitiveType });
});
deleteBtn.addEventListener('click', deleteSelection);

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
  setSelection(null);
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
  setSelection(null);
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

/** Abre o editor in-place em (left, top) da tela, com o `transform` de ancoragem. */
function openInlineEditor(opts: {
  value: string;
  left: number;
  top: number;
  transform: string;
  onCommit: (value: string) => void;
}): void {
  inlineCommit = opts.onCommit;
  renameInput.value = opts.value;
  autoSizeInlineEditor();
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

/** Abre a edição in-place do rótulo de um nó I/O, sobre o próprio nó. */
function openRenameOverlay(node: CircuitNode): void {
  const { w, h } = nodeSize(node);
  const rect = canvas!.getBoundingClientRect();
  // Por padrão flutua acima do nó; se houver pouco espaço no topo, cai abaixo
  // para não sair da tela (útil em mobile com o teclado virtual).
  const above = camera.worldToScreen({ x: node.pos.x + w / 2, y: node.pos.y });
  const flipBelow = above.y < 72;
  const anchor = flipBelow
    ? camera.worldToScreen({ x: node.pos.x + w / 2, y: node.pos.y + h })
    : above;
  // Pré-preenche com o nome atual ou, se ainda não renomeado, com o padrão
  // (IN/OUT) para deixar claro que é o rótulo a editar.
  openInlineEditor({
    value: node.name ?? defaultIoLabel(node),
    left: rect.left + anchor.x,
    top: rect.top + anchor.y,
    transform: flipBelow ? 'translate(-50%, 20%)' : 'translate(-50%, -120%)',
    onCommit: (value) => store.setNodeName(node.id, value),
  });
}

renameInput.addEventListener('input', autoSizeInlineEditor);
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
        // Duplo toque sobre entrada/saída: abre a edição in-place do rótulo. A
        // intenção é editar, não ciclar — então desfaz o avanço de estado que o 1º
        // toque tenha aplicado a um input já selecionado. Como o ciclo tem três
        // estados (OFF→ON→CLK→OFF), dois avanços equivalem a recuar um.
        const wasCycled = lastTap?.cycled ?? false;
        lastTap = null;
        const node = store.getNode(dragNodeId);
        if (node && (node.type === 'input' || node.type === 'output')) {
          if (wasCycled && node.type === 'input') {
            store.cycleInputState(node.id);
            store.cycleInputState(node.id);
          }
          openRenameOverlay(node);
        }
      } else {
        // Toque simples sobre um input já selecionado avança seu estado no ciclo.
        let cycled = false;
        if (toggleCandidateId) {
          store.cycleInputState(toggleCandidateId);
          cycled = true;
        }
        lastTap = { time: now, pos: up, nodeId: dragNodeId, cycled };
      }
    }
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
  // circuitos sequenciais (com realimentação) preservem sua memória. O instante
  // atual alimenta os nós `clock`, que oscilam com o tempo.
  signalState = simulate(store.toJSON(), resolveChip, signalState, performance.now());
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

  // Tutorial: avalia o passo atual contra o estado e avança quando concluído.
  updateTutorial();

  requestAnimationFrame(render);
}

// --- Limpar banco (afordância temporária de desenvolvimento) -------------
// Sempre visível, inclusive no deploy, para facilitar testes em outros
// dispositivos. TODO: ocultar/gated quando a feature amadurecer.
const clearDbBtn = document.querySelector<HTMLButtonElement>('#clear-db')!;
clearDbBtn.addEventListener('click', async () => {
  if (!confirm(t('clearDb.confirm'))) return;
  await clearChips();
  location.reload();
});

// --- Painel "Sobre" / boas-vindas ----------------------------------------

const aboutBtn = document.querySelector<HTMLButtonElement>('#about-btn')!;
const aboutOverlay = document.querySelector<HTMLDivElement>('#about-overlay')!;
const aboutPanel = document.querySelector<HTMLDivElement>('#about-panel')!;
const aboutClose = document.querySelector<HTMLButtonElement>('#about-close')!;
const aboutDontShow = document.querySelector<HTMLInputElement>('#about-dont-show')!;

/** Modo do painel: "about" (aberto pelo "?") ou "welcome" (auto no 1º acesso). */
let aboutMode: 'about' | 'welcome' = 'about';

function openAbout(mode: 'about' | 'welcome' = 'about'): void {
  aboutMode = mode;
  // O checkbox reflete a preferência atual ao abrir.
  aboutDontShow.checked = isWelcomeDismissed();
  // No 1º acesso, o botão primário convida a iniciar o tutorial; via "?", só fecha.
  aboutClose.textContent = mode === 'welcome' ? t('tutorial.start') : t('about.close');
  aboutOverlay.hidden = false;
}

function closeAbout(): void {
  // Ao fechar, persiste a escolha do checkbox: controla se as boas-vindas voltam a
  // abrir sozinhas no próximo acesso.
  setWelcomeDismissed(aboutDontShow.checked);
  aboutOverlay.hidden = true;
}

aboutBtn.addEventListener('click', () => openAbout('about'));
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

// --- Tutorial (walkthrough) ----------------------------------------------

const tutorialCallout = document.querySelector<HTMLDivElement>('#tutorial-callout')!;
const tutorialProgress = document.querySelector<HTMLDivElement>('#tutorial-progress')!;
const tutorialText = document.querySelector<HTMLParagraphElement>('#tutorial-text')!;
const tutorialExit = document.querySelector<HTMLButtonElement>('#tutorial-exit')!;

let tutorialState: TutorialState = { active: false, index: 0 };
let tutorialStepStart: StepStartSnapshot = captureStepStart([], 0);

/** Aplica (ou limpa) o destaque visual do alvo do passo atual. */
function setTutorialHighlight(selector?: string): void {
  document
    .querySelectorAll('.tutorial-highlight')
    .forEach((el) => el.classList.remove('tutorial-highlight'));
  if (selector) document.querySelector(selector)?.classList.add('tutorial-highlight');
}

/** Atualiza o callout para refletir o passo atual (ou a tela de conclusão). */
function renderTutorialStep(): void {
  const step = currentStep(NOT_TUTORIAL_STEPS, tutorialState);
  if (!step) {
    // Concluído: mensagem final; o botão "Exit" passa a apenas fechar.
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
  setSelection(null);
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
}

tutorialExit.addEventListener('click', exitTutorial);

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
