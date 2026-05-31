/** Ponto 2D em coordenadas de tela (CSS px) ou de mundo, conforme o contexto. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Limites de zoom para evitar inversões/explosões numéricas. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5;

/**
 * Câmera 2D que mapeia coordenadas de "mundo" para a tela via uma translação
 * (`pan`, em CSS px) e uma escala uniforme (`zoom`).
 *
 *   screen = world * zoom + pan
 *   world  = (screen - pan) / zoom
 *
 * A câmera é pura (sem dependência de DOM/Canvas), o que a torna testável.
 */
export class Camera {
  pan: Vec2;
  zoom: number;

  constructor(pan: Vec2 = { x: 0, y: 0 }, zoom = 1) {
    this.pan = { ...pan };
    this.zoom = clampZoom(zoom);
  }

  worldToScreen(world: Vec2): Vec2 {
    return {
      x: world.x * this.zoom + this.pan.x,
      y: world.y * this.zoom + this.pan.y,
    };
  }

  screenToWorld(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.pan.x) / this.zoom,
      y: (screen.y - this.pan.y) / this.zoom,
    };
  }

  /** Desloca a câmera por um delta em pixels de tela. */
  panBy(dx: number, dy: number): void {
    this.pan.x += dx;
    this.pan.y += dy;
  }

  /**
   * Aplica zoom multiplicativo mantendo fixo o ponto de tela `anchor`
   * (tipicamente o cursor ou o centro de uma pinça).
   */
  zoomAt(anchor: Vec2, factor: number): void {
    const world = this.screenToWorld(anchor);
    this.zoom = clampZoom(this.zoom * factor);
    // Recoloca o `pan` para que `world` continue exatamente sob `anchor`.
    this.pan.x = anchor.x - world.x * this.zoom;
    this.pan.y = anchor.y - world.y * this.zoom;
  }
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
