// Access roles for the online game (docs/online-access.md).
// Pure rules, no Firebase: the page uses them to show what each role may do,
// and firestore.rules enforces the same rules on the database (keep in step).
//
//   master — one Google account, stored by the owner in Firestore config/access;
//            cannot be changed or removed; appoints and removes admins.
//   admin  — invites and removes players.
//   player — plays; sees only their own access.
// Anyone else signs in with Google but gets no access.

/** A role a member can hold. The master is not a member document. */
export type MemberRole = 'admin' | 'player';

/** Every role, the master included. */
export type Role = 'master' | MemberRole;

/** Stored per invited Google address (document id = normalized email). */
export interface Member {
  role: MemberRole;
  invitedBy: string;
  invitedAt: number;
  updatedAt?: number;
}

/** Lower-case, trimmed email; throws on something that is not an address. */
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw new AccessError('Indirizzo email mancante');
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e)) throw new AccessError(`Indirizzo non valido: ${raw}`);
  return e;
}

/** The role of an address: master by configuration, else its member document, else none. */
export function roleOf(email: string, masterEmail: string, member: Pick<Member, 'role'> | undefined): Role | null {
  if (masterEmail && email === masterEmail.trim().toLowerCase()) return 'master';
  return member?.role ?? null;
}

/** True for the roles that may open the administration page. */
export function isAdmin(role: Role | null): boolean {
  return role === 'master' || role === 'admin';
}

/**
 * Why `actor` cannot give `newRole` to an address that currently has
 * `targetRole` (null = not invited yet), or null if allowed.
 */
export function setRoleRefusal(actor: Role | null, targetRole: Role | null, newRole: MemberRole, isSelf: boolean): string | null {
  if (!isAdmin(actor)) return 'Solo un amministratore può invitare o cambiare ruoli';
  if (targetRole === 'master') return "L'amministratore principale non si può modificare";
  if (isSelf) return 'Non puoi cambiare il tuo ruolo';
  if (actor !== 'master' && (newRole === 'admin' || targetRole === 'admin')) return "Solo l'amministratore principale gestisce gli amministratori";
  return null;
}

/** Why `actor` cannot remove an address with `targetRole`, or null if allowed. */
export function removeRefusal(actor: Role | null, targetRole: Role | null, isSelf: boolean): string | null {
  if (!isAdmin(actor)) return 'Solo un amministratore può togliere un accesso';
  if (targetRole === null) return 'Questo indirizzo non è invitato';
  if (targetRole === 'master') return "L'amministratore principale non si può togliere";
  if (isSelf) return 'Non puoi togliere il tuo accesso';
  if (actor !== 'master' && targetRole === 'admin') return "Solo l'amministratore principale toglie un amministratore";
  return null;
}

/** A refused access operation (the message is shown to the user). */
export class AccessError extends Error {}
