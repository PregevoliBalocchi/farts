// Callable functions for invite-only access (docs/online-access.md).
// Sign-in is Google only (Firebase Authentication). Access is decided here,
// server side: the master address comes from the MASTER_ADMIN_EMAIL parameter
// set at deploy time, every other role from Firestore `members/{email}`,
// which only these functions write.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { AccessError, isAdmin, normalizeEmail, removeRefusal, roleOf, setRoleRefusal } from './roles.js';
import type { Member, MemberRole, Role } from './roles.js';

setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const MASTER_ADMIN_EMAIL = defineString('MASTER_ADMIN_EMAIL', {
  description: 'Google address of the master admin (cannot be removed; appoints admins)',
});

initializeApp();
const db = getFirestore();
const members = db.collection('members');

/** The signed-in caller and their role (null = signed in but not invited). */
async function caller(req: CallableRequest): Promise<{ email: string; role: Role | null }> {
  const token = req.auth?.token;
  if (!token) throw new HttpsError('unauthenticated', 'Accedi con Google');
  if (token.firebase?.sign_in_provider !== 'google.com') throw new HttpsError('permission-denied', 'Si accede solo con Google');
  if (!token.email || token.email_verified !== true) throw new HttpsError('permission-denied', 'Account Google senza email verificata');
  const email = normalizeEmail(token.email);
  return { email, role: await roleFor(email) };
}

async function roleFor(email: string): Promise<Role | null> {
  const snap = await members.doc(email).get();
  return roleOf(email, MASTER_ADMIN_EMAIL.value(), snap.exists ? (snap.data() as Member) : undefined);
}

/** Runs `fn`, turning refusals into errors the page can show. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccessError) throw new HttpsError('permission-denied', e.message);
    throw e;
  }
}

/** Who the caller is: `{ email, role }`, role null when not invited. */
export const whoAmI = onCall((req) => guarded(() => caller(req)));

/** Admins: every invited address, master first. */
export const listMembers = onCall((req) =>
  guarded(async () => {
    const me = await caller(req);
    if (!isAdmin(me.role)) throw new AccessError('Solo un amministratore vede gli inviti');
    const snap = await members.get();
    const list = snap.docs.map((d) => ({ email: d.id, ...(d.data() as Member) }));
    list.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'admin' ? -1 : 1));
    return { master: normalizeEmail(MASTER_ADMIN_EMAIL.value()), members: list };
  }),
);

/** Admins: invite an address or change its role. Data: `{ email, role }`. */
export const setMember = onCall((req) =>
  guarded(async () => {
    const me = await caller(req);
    const email = normalizeEmail((req.data as { email?: unknown })?.email);
    const role = (req.data as { role?: unknown })?.role;
    if (role !== 'admin' && role !== 'player') throw new AccessError('Ruolo non valido');
    const ref = members.doc(email);
    const snap = await ref.get();
    const current = roleOf(email, MASTER_ADMIN_EMAIL.value(), snap.exists ? (snap.data() as Member) : undefined);
    const why = setRoleRefusal(me.role, current, role as MemberRole, email === me.email);
    if (why) throw new AccessError(why);
    const now = Date.now();
    const prev = snap.exists ? (snap.data() as Member) : undefined;
    const doc: Member = { role: role as MemberRole, invitedBy: prev?.invitedBy ?? me.email, invitedAt: prev?.invitedAt ?? now, updatedAt: now };
    await ref.set(doc);
    return { email, ...doc };
  }),
);

/** Admins: remove an address's access. Data: `{ email }`. */
export const removeMember = onCall((req) =>
  guarded(async () => {
    const me = await caller(req);
    const email = normalizeEmail((req.data as { email?: unknown })?.email);
    const ref = members.doc(email);
    const snap = await ref.get();
    const current = roleOf(email, MASTER_ADMIN_EMAIL.value(), snap.exists ? (snap.data() as Member) : undefined);
    const why = removeRefusal(me.role, current, email === me.email);
    if (why) throw new AccessError(why);
    await ref.delete();
    return { email };
  }),
);
