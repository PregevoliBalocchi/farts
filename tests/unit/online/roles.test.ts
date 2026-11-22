// Invite-only roles (docs/online-access.md): who may invite, promote and remove.
import { describe, expect, it } from 'vitest';
import { AccessError, isAdmin, normalizeEmail, removeRefusal, roleOf, setRoleRefusal } from '../../../src/online/roles';

const MASTER = 'master@example.com';

describe('roles', () => {
  it('the configured address is the master whatever the members list says', () => {
    expect(roleOf(MASTER, ' Master@Example.com ', undefined)).toBe('master');
    expect(roleOf(MASTER, MASTER, { role: 'player' })).toBe('master');
  });

  it('other addresses take their invitation role, or none', () => {
    expect(roleOf('a@example.com', MASTER, { role: 'admin' })).toBe('admin');
    expect(roleOf('b@example.com', MASTER, undefined)).toBeNull();
    expect(isAdmin('player')).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('addresses are compared lower-case and trimmed; junk is refused', () => {
    expect(normalizeEmail('  Ric@Example.COM ')).toBe('ric@example.com');
    expect(() => normalizeEmail('not an address')).toThrow(AccessError);
    expect(() => normalizeEmail(undefined)).toThrow(AccessError);
  });
});

describe('inviting and changing roles', () => {
  it('only admins invite', () => {
    expect(setRoleRefusal('player', null, 'player', false)).toMatch(/Solo un amministratore/);
    expect(setRoleRefusal(null, null, 'player', false)).toMatch(/Solo un amministratore/);
    expect(setRoleRefusal('admin', null, 'player', false)).toBeNull();
  });

  it('only the master appoints or demotes admins', () => {
    expect(setRoleRefusal('admin', null, 'admin', false)).toMatch(/principale gestisce/);
    expect(setRoleRefusal('admin', 'admin', 'player', false)).toMatch(/principale gestisce/);
    expect(setRoleRefusal('master', null, 'admin', false)).toBeNull();
    expect(setRoleRefusal('master', 'admin', 'player', false)).toBeNull();
  });

  it('nobody changes the master or their own role', () => {
    expect(setRoleRefusal('master', 'master', 'player', true)).toMatch(/non si può modificare/);
    expect(setRoleRefusal('admin', 'admin', 'player', true)).toMatch(/tuo ruolo/);
  });
});

describe('removing access', () => {
  it('admins remove players; only the master removes admins', () => {
    expect(removeRefusal('admin', 'player', false)).toBeNull();
    expect(removeRefusal('admin', 'admin', false)).toMatch(/principale toglie/);
    expect(removeRefusal('master', 'admin', false)).toBeNull();
  });

  it('the master, yourself and uninvited addresses cannot be removed', () => {
    expect(removeRefusal('master', 'master', true)).toMatch(/non si può togliere/);
    expect(removeRefusal('admin', 'admin', true)).toMatch(/principale toglie|tuo accesso/);
    expect(removeRefusal('master', null, false)).toMatch(/non è invitato/);
    expect(removeRefusal('player', 'player', false)).toMatch(/Solo un amministratore/);
  });
});
