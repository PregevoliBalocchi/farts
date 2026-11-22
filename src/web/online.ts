// Online access page (docs/online-access.md): Google sign-in, then the
// caller's role from Firestore. Admins manage invitations here. Access is
// enforced by firestore.rules; the checks below only explain refusals.
// The game itself (and the owner's content) is not part of this page.

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { isAdmin, normalizeEmail, removeRefusal, roleOf, setRoleRefusal } from '../online/roles';
import type { Member, MemberRole, Role } from '../online/roles';
import { auth, createGame, db, loadContent, myGames, uploadContent } from './games';

const ROLE_LABEL: Record<Role, string> = { master: 'amministratore principale', admin: 'amministratore', player: 'giocatore' };


const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
let me = { email: '', role: null as Role | null, master: '' };
let members: (Member & { email: string })[] = [];

$('sign-in').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    show(status, `Accesso non riuscito: ${message(e)}`, 'err');
  }
});
$('sign-out').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  $('admin').hidden = true;
  $('lobby').hidden = true;
  $('content-admin').hidden = true;
  if (!user) {
    $('signed-out').hidden = false;
    $('signed-in').hidden = true;
    show(status, 'Non hai effettuato l’accesso.', 'muted');
    return;
  }
  $('signed-out').hidden = true;
  $('signed-in').hidden = false;
  show(status, 'Controllo l’invito…', 'muted');
  try {
    const email = normalizeEmail(user.email);
    const config = await getDoc(doc(db, 'config', 'access'));
    const master = String(config.data()?.master ?? '').trim().toLowerCase();
    if (!master) throw new Error('manca l’amministratore principale (config/access) nel database');
    let mine: Member | undefined;
    try {
      const snap = await getDoc(doc(db, 'members', email));
      mine = snap.exists() ? (snap.data() as Member) : undefined;
    } catch {
      mine = undefined;
    }
    me = { email, role: roleOf(email, master, mine), master };
    if (!me.role) {
      $('who').textContent = email;
      show(status, `Questo indirizzo non è invitato. Chiedi a un amministratore di aggiungere ${email}.`, 'err');
      return;
    }
    $('who').innerHTML = `${escape(email)} · <b>${ROLE_LABEL[me.role]}</b>`;
    show(status, 'Accesso consentito.', 'ok');
    $('lobby').hidden = false;
    $('content-admin').hidden = me.role !== 'master';
    await refreshGames();
    if (isAdmin(me.role)) {
      // Only the master appoints admins.
      $<HTMLSelectElement>('invite-role').querySelector<HTMLOptionElement>('option[value="admin"]')!.hidden = me.role !== 'master';
      $('admin').hidden = false;
      await refresh();
    }
  } catch (e) {
    show(status, `Errore: ${message(e)}`, 'err');
  }
});

$('invite').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const raw = $<HTMLInputElement>('invite-email').value;
  const role = $<HTMLSelectElement>('invite-role').value as MemberRole;
  await act(async () => {
    const email = normalizeEmail(raw);
    await writeMember(email, role);
    $<HTMLInputElement>('invite-email').value = '';
    return `${email} invitato come ${ROLE_LABEL[role]}.`;
  });
});

// ---------- games ----------

const VARIANT_LABEL = { base: 'base', leaders: 'personaggi e lore' } as const;

async function refreshGames(): Promise<void> {
  const list = await myGames(me.email);
  $('games').innerHTML = list.length
    ? list
        .map((g) => {
          const others = g.players.filter((p) => p !== me.email).map(escape).join(', ');
          const when = new Date(g.createdAt).toLocaleString('it-IT');
          const phase = g.status === 'over' ? 'finita' : `capitolo ${g.state.chapter}`;
          return `<li><a href="play.html?id=${encodeURIComponent(g.id)}">Partita del ${when}</a> · con ${others} · ${VARIANT_LABEL[g.variant]} · ${phase}</li>`;
        })
        .join('')
    : '<li class="muted">Nessuna partita.</li>';
}

$('new-game').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('game-msg');
  try {
    const others = $<HTMLInputElement>('new-players').value.split(/[\s,;]+/).filter(Boolean).map(normalizeEmail);
    const players = [me.email, ...others.filter((e) => e !== me.email)];
    const variant = $<HTMLSelectElement>('new-variant').value as 'base' | 'leaders';
    show(msg, 'Creo la partita…', 'muted');
    const id = await createGame(await loadContent(), players, variant, me.email);
    location.href = `play.html?id=${encodeURIComponent(id)}`;
  } catch (e) {
    show(msg, message(e), 'err');
  }
});

$('content-file').addEventListener('change', async () => {
  const msg = $('content-msg');
  const file = $<HTMLInputElement>('content-file').files?.[0];
  if (!file) return;
  try {
    show(msg, 'Controllo e carico…', 'muted');
    const warnings = await uploadContent(await file.text(), me.email);
    show(msg, `Contenuti caricati${warnings.length ? ` (${warnings.length} avvisi: effetti da risolvere a mano)` : ''}.`, 'ok');
  } catch (e) {
    show(msg, `Non caricati: ${message(e)}`, 'err');
  }
});

/** Invites an address or changes its role (the rules check it again). */
async function writeMember(email: string, role: MemberRole): Promise<void> {
  const prev = members.find((m) => m.email === email);
  const current = roleOf(email, me.master, prev);
  const why = setRoleRefusal(me.role, current, role, email === me.email);
  if (why) throw new Error(why);
  const now = Date.now();
  const data: Member = { role, invitedBy: prev?.invitedBy ?? me.email, invitedAt: prev?.invitedAt ?? now, updatedAt: now };
  await setDoc(doc(db, 'members', email), data);
}

async function refresh(): Promise<void> {
  const snap = await getDocs(collection(db, 'members'));
  members = snap.docs.map((d) => ({ email: d.id, ...(d.data() as Member) }));
  members.sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'admin' ? -1 : 1));
  const rows = [`<tr><td>${escape(me.master)}</td><td>${ROLE_LABEL.master}</td><td></td></tr>`];
  for (const m of members) {
    const canRemove = removeRefusal(me.role, m.role, m.email === me.email) === null;
    const other: MemberRole = m.role === 'admin' ? 'player' : 'admin';
    const canSwitch = setRoleRefusal(me.role, m.role, other, m.email === me.email) === null;
    const buttons = [
      canSwitch ? `<button type="button" data-set="${escape(m.email)}" data-role="${other}">rendi ${ROLE_LABEL[other]}</button>` : '',
      canRemove ? `<button type="button" data-remove="${escape(m.email)}">togli accesso</button>` : '',
    ].join('');
    rows.push(`<tr><td>${escape(m.email)}</td><td>${ROLE_LABEL[m.role]}</td><td class="actions">${buttons}</td></tr>`);
  }
  $('members').innerHTML = rows.join('');
}

$('members').addEventListener('click', async (ev) => {
  const b = (ev.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.set) {
    const email = b.dataset.set;
    const role = b.dataset.role as MemberRole;
    await act(async () => (await writeMember(email, role), `${email} ora è ${ROLE_LABEL[role]}.`));
  } else if (b.dataset.remove) {
    const email = b.dataset.remove;
    if (!confirm(`Togliere l’accesso a ${email}?`)) return;
    await act(async () => {
      const why = removeRefusal(me.role, roleOf(email, me.master, members.find((m) => m.email === email)), email === me.email);
      if (why) throw new Error(why);
      await deleteDoc(doc(db, 'members', email));
      return `Accesso tolto a ${email}.`;
    });
  }
});

/** Runs an admin action, shows its outcome and reloads the list. */
async function act(fn: () => Promise<string>): Promise<void> {
  const msg = $('admin-msg');
  try {
    show(msg, await fn(), 'ok');
    await refresh();
  } catch (e) {
    show(msg, message(e), 'err');
  }
}

function show(el: HTMLElement, text: string, cls: 'ok' | 'err' | 'muted'): void {
  el.textContent = text;
  el.className = cls;
}

function message(e: unknown): string {
  const text = e instanceof Error ? e.message.replace(/^Firebase: /, '') : String(e);
  return /insufficient permissions/i.test(text) ? 'Operazione non permessa per il tuo ruolo.' : text;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
