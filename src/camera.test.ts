import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM, clampZoom } from './camera';

describe('Camera', () => {
  it('mapeia mundo→tela com pan e zoom', () => {
    const cam = new Camera({ x: 100, y: 50 }, 2);
    expect(cam.worldToScreen({ x: 10, y: 5 })).toEqual({ x: 120, y: 60 });
  });

  it('faz round-trip tela↔mundo preservando o ponto', () => {
    const cam = new Camera({ x: -37, y: 81 }, 1.75);
    const screen = { x: 640, y: 360 };
    const back = cam.worldToScreen(cam.screenToWorld(screen));
    expect(back.x).toBeCloseTo(screen.x, 6);
    expect(back.y).toBeCloseTo(screen.y, 6);
  });

  it('panBy acumula o deslocamento', () => {
    const cam = new Camera({ x: 0, y: 0 }, 1);
    cam.panBy(15, -5);
    cam.panBy(5, 5);
    expect(cam.pan).toEqual({ x: 20, y: 0 });
  });

  it('zoomAt mantém fixo o ponto de tela ancorado', () => {
    const cam = new Camera({ x: 200, y: 120 }, 1);
    const anchor = { x: 300, y: 240 };
    const worldBefore = cam.screenToWorld(anchor);

    cam.zoomAt(anchor, 1.5);

    expect(cam.zoom).toBeCloseTo(1.5, 6);
    const worldAfter = cam.screenToWorld(anchor);
    // O mesmo ponto de tela continua apontando para o mesmo ponto de mundo.
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it('limita o zoom aos extremos permitidos', () => {
    const cam = new Camera({ x: 0, y: 0 }, 1);
    cam.zoomAt({ x: 0, y: 0 }, 1000);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.zoomAt({ x: 0, y: 0 }, 0.0001);
    expect(cam.zoom).toBe(MIN_ZOOM);
  });

  it('clampZoom respeita os limites', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it('centerOn coloca o ponto de mundo no centro da viewport', () => {
    const cam = new Camera({ x: 0, y: 0 }, 1);
    cam.centerOn({ x: 0, y: 0 }, 800, 600);
    // A origem do mundo passa a cair no centro da tela.
    expect(cam.worldToScreen({ x: 0, y: 0 })).toEqual({ x: 400, y: 300 });
  });

  it('centerOn respeita o zoom atual sem alterá-lo', () => {
    const cam = new Camera({ x: 123, y: -7 }, 2);
    cam.centerOn({ x: 50, y: 20 }, 800, 600);
    expect(cam.zoom).toBe(2);
    const c = cam.worldToScreen({ x: 50, y: 20 });
    expect(c.x).toBeCloseTo(400, 6);
    expect(c.y).toBeCloseTo(300, 6);
  });
});
