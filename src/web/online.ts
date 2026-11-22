// Online access page (docs/online-access.md): Google sign-in, then the
// server says the caller's role. Admins manage invitations here. The game
// itself (and the owner's content) is not part of this page.

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig, functionsRegion } from './firebase-config';

type Role = 'master' | 'admin' | 'player';
type MemberRow = { email: string; role: 'admin' | 'player'; invitedBy: string; invitedAt: number };

const ROLE_LABEL: Record<Role, string> = { master: 'amministratore principale', admin: 'amministratore', player: 'giocatore' };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fns = getFunctions(app, functionsRegion);
const call = <Req, Res>(name: string) => async (data?: Req) => (await httpsCallable<Req, Res>(fns, name)(data as Req)).data;
const whoAmI = call<void, { email: string; role: Role | null }>('whoAmI');
const listMembers = call<void, { master: string; members: MemberRow[] }>('listMembers');
const setMember = call<{ email: string; role: 'admin' | 'player' }, MemberRow>('setMember');
const removeMember = call<{ email: string }, { email: string }>('removeMember');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
let myRole: Role | null = null;
let myEmail = '';

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
    const me = await whoAmI();
    myRole = me.role;
    myEmail = me.email;
    if (!me.role) {
      $('who').textContent = me.email;
      show(status, `Questo indirizzo non è invitato. Chiedi a un amministratore di aggiungere ${me.email}.`, 'err');
      return;
    }
    $('who').innerHTML = `${escape(me.email)} · <b>${ROLE_LABEL[me.role]}</b>`;
    show(status, 'Accesso consentito. La partita online arriverà qui.', 'ok');
    if (me.role === 'master' || me.role === 'admin') {
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
  const email = $<HTMLInputElement>('invite-email').value;
  const role = $<HTMLSelectElement>('invite-role').value as 'admin' | 'player';
  await act(async () => {
    const r = await setMember({ email, role });
    $<HTMLInputElement>('invite-email').value = '';
    return `${r.email} invitato come ${ROLE_LABEL[r.role]}.`;
  });
});

async function refresh(): Promise<void> {
  const { master, members } = await listMembers();
  const rows = [`<tr><td>${escape(master)}</td><td>${ROLE_LABEL.master}</td><td></td></tr>`];
  for (const m of members) {
    const canEdit = m.email !== myEmail && (myRole === 'master' || m.role === 'player');
    const other = m.role === 'admin' ? 'player' : 'admin';
    const buttons = !canEdit
      ? ''
      : `${myRole === 'master' ? `<button type="button" data-set="${escape(m.email)}" data-role="${other}">rendi ${ROLE_LABEL[other]}</button>` : ''}
         <button type="button" data-remove="${escape(m.email)}">togli accesso</button>`;
    rows.push(`<tr><td>${escape(m.email)}</td><td>${ROLE_LABEL[m.role]}</td><td class="actions">${buttons}</td></tr>`);
  }
  $('members').innerHTML = rows.join('');
}

$('members').addEventListener('click', async (ev) => {
  const b = (ev.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.set) {
    const email = b.dataset.set;
    const role = b.dataset.role as 'admin' | 'player';
    await act(async () => (await setMember({ email, role }), `${email} ora è ${ROLE_LABEL[role]}.`));
  } else if (b.dataset.remove) {
    const email = b.dataset.remove;
    if (!confirm(`Togliere l’accesso a ${email}?`)) return;
    await act(async () => (await removeMember({ email }), `Accesso tolto a ${email}.`));
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
  return e instanceof Error ? e.message.replace(/^Firebase: /, '') : String(e);
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
