import './style.css';
import { Camera } from './camera';
import { drawGrid } from './grid';

const canvas = document.querySelector<HTMLCanvasElement>('#editor');
if (!canvas) {
  throw new Error('Canvas #editor não encontrado.');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Contexto 2D indisponível.');
}

const camera = new Camera();

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

// --- Interação: pan por arrasto e zoom por scroll ------------------------

let isPanning = false;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener('pointerdown', (e) => {
  isPanning = true;
  lastPointer = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  camera.panBy(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
  lastPointer = { x: e.clientX, y: e.clientY };
});

function endPan(e: PointerEvent): void {
  isPanning = false;
  if (canvas!.hasPointerCapture(e.pointerId)) {
    canvas!.releasePointerCapture(e.pointerId);
  }
}
canvas.addEventListener('pointerup', endPan);
canvas.addEventListener('pointercancel', endPan);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // deltaY > 0 (scroll p/ baixo) → afasta; < 0 → aproxima.
    const factor = Math.exp(-e.deltaY * 0.0015);
    camera.zoomAt(anchor, factor);
  },
  { passive: false },
);

// --- Render loop ---------------------------------------------------------

function render(): void {
  const dpr = window.devicePixelRatio || 1;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.clearRect(0, 0, viewWidth, viewHeight);
  drawGrid(ctx!, camera, viewWidth, viewHeight);
  requestAnimationFrame(render);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(render);
