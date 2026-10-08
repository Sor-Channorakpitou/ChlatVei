import { wilsonInterval } from './wilson';

describe('wilsonInterval', () => {
  it('returns zeros when there is no data', () => {
    expect(wilsonInterval(0, 0)).toEqual({ rate: 0, low: 0, high: 0 });
  });

  it('matches a known reference value (8 of 10, 95%)', () => {
    // Reference: Wilson interval for 8/10 is about [0.490, 0.943]
    const r = wilsonInterval(8, 10);
    expect(r.rate).toBe(0.8);
    expect(r.low).toBeCloseTo(0.49, 2);
    expect(r.high).toBeCloseTo(0.943, 2);
  });

  it('ranks a well-supported rate above a small-sample perfect rate', () => {
    const tiny = wilsonInterval(2, 2); // 100% from 2 responses
    const solid = wilsonInterval(40, 50); // 80% from 50 responses
    expect(solid.low).toBeGreaterThan(tiny.low);
  });

  it('stays within [0, 1]', () => {
    for (const [s, n] of [[0, 5], [5, 5], [1, 1000]]) {
      const r = wilsonInterval(s, n);
      expect(r.low).toBeGreaterThanOrEqual(0);
      expect(r.high).toBeLessThanOrEqual(1);
      expect(r.low).toBeLessThanOrEqual(r.high);
    }
  });
});
