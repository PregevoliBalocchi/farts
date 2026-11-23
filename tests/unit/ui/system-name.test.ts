// System names (src/ui/table/render.ts systemName): the table names a planet by
// its resource and cluster number and a gate by its cluster number, never by id.
import { describe, expect, it } from 'vitest';
import { systemName } from '../../../src/ui/table/render';

const t = (key: string, p: Record<string, string | number> = {}) => `${key}(${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')})`;

describe('systemName', () => {
  it('names a planet by its resource and cluster number', () => {
    expect(systemName({ id: 'c4-p1', cluster: 'c4', kind: 'planet', resource: 'weapons' }, t)).toBe('move.sysPlanet(res=resource.weapons(),n=4)');
  });

  it('names a gate by its cluster number', () => {
    expect(systemName({ id: 'c6-g', cluster: 'c6', kind: 'gate', resource: null }, t)).toBe('move.sysGate(n=6)');
  });

  it('falls back to the id digits when the system is unknown', () => {
    expect(systemName(undefined, t, 'c3-g')).toBe('move.sysGate(n=3)');
  });
});
