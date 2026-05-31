import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, centeredTopLeft, isDrag } from './palette';

describe('isDrag', () => {
  it('trata deslocamento abaixo do limiar como clique', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
  });

  it('trata deslocamento no limiar como arrasto', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX, y: 0 })).toBe(true);
  });

  it('usa distância euclidiana (diagonal acima do limiar)', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true); // ~7.07 px
  });

  it('respeita um limiar customizado', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 10, y: 0 }, 20)).toBe(false);
  });
});

describe('centeredTopLeft', () => {
  it('desloca o ponto pela metade das dimensões', () => {
    expect(centeredTopLeft({ x: 100, y: 50 }, { w: 40, h: 20 })).toEqual({ x: 80, y: 40 });
  });

  it('aceita coordenadas negativas', () => {
    expect(centeredTopLeft({ x: 0, y: 0 }, { w: 72, h: 56 })).toEqual({ x: -36, y: -28 });
  });
});
