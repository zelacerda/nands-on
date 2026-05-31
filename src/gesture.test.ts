import { describe, expect, it } from 'vitest';
import { pinchDelta, samplePinch } from './gesture';

describe('samplePinch', () => {
  it('calcula ponto médio e distância', () => {
    const s = samplePinch({ x: 0, y: 0 }, { x: 4, y: 3 });
    expect(s.mid).toEqual({ x: 2, y: 1.5 });
    expect(s.dist).toBeCloseTo(5, 6);
  });

  it('evita distância zero', () => {
    const s = samplePinch({ x: 10, y: 10 }, { x: 10, y: 10 });
    expect(s.dist).toBe(1);
  });
});

describe('pinchDelta', () => {
  it('deriva fator de zoom e translação do ponto médio', () => {
    const prev = samplePinch({ x: 0, y: 0 }, { x: 10, y: 0 }); // dist 10, mid (5,0)
    const curr = samplePinch({ x: 0, y: 0 }, { x: 20, y: 0 }); // dist 20, mid (10,0)
    const d = pinchDelta(prev, curr);
    expect(d.factor).toBeCloseTo(2, 6);
    expect(d.dx).toBeCloseTo(5, 6);
    expect(d.dy).toBeCloseTo(0, 6);
    expect(d.anchor).toEqual({ x: 10, y: 0 });
  });
});
