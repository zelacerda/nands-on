import type { Vec2 } from './camera';

/** Amostra de um gesto de pinça: ponto médio e distância entre dois dedos. */
export interface PinchSample {
  mid: Vec2;
  dist: number;
}

/** Calcula o ponto médio e a distância entre dois pontos de tela. */
export function samplePinch(a: Vec2, b: Vec2): PinchSample {
  return {
    mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    // Evita divisão por zero ao usar como denominador de fator de zoom.
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
  };
}

/** Delta entre duas amostras de pinça: fator de zoom, translação e âncora. */
export interface PinchDelta {
  factor: number;
  dx: number;
  dy: number;
  anchor: Vec2;
}

export function pinchDelta(prev: PinchSample, curr: PinchSample): PinchDelta {
  return {
    factor: curr.dist / prev.dist,
    dx: curr.mid.x - prev.mid.x,
    dy: curr.mid.y - prev.mid.y,
    anchor: curr.mid,
  };
}
