// The test lab's panel (?lab, local games only): the list of every leader, lore,
// Court card and action card, a search, and a checklist (to try, OK, problem, with
// a note). The checklist is kept in this browser only (localStorage) and can be
// exported as a Markdown file to send on. Display only: picking an item asks the
// table (onPick) to set up a new lab game.

import type { Translate } from '../../i18n';
import type { LabItem, LabKind } from './lab';

/** A checklist mark. */
export type LabMark = 'todo' | 'ok' | 'bug';

/** What the panel needs from the table. */
export interface LabPanelOptions {
  items: LabItem[];
  /** The item's printed name in the table's language. */
  nameOf: (id: string) => string;
  t: Translate;
  current: string;
  /** Where "Esci" goes (the online site's entrance); no link when absent. */
  exit?: string;
  /** Sets up the lab game for this item. */
  onPick: (id: string) => void;
  /** Sets up the current item's game again. */
  onRestart: () => void;
  /** The panel was opened or closed (the stage makes room for it). */
  onToggle: () => void;
}

/** The panel's handle. */
export interface LabPanel {
  setCurrent(id: string): void;
  /** Screen pixels the open panel takes on the right (0 when closed). */
  width(): number;
}

const STORE = 'arcs.lab';
/** Width of the open panel, in screen pixels. */
export const LAB_PANEL_W = 340;
const KINDS: LabKind[] = ['leader', 'lore', 'court', 'action'];

type Checklist = Record<string, { mark: LabMark; note: string }>;

function loadChecklist(): Checklist {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Checklist) : {};
  } catch {
    return {};
  }
}

function saveChecklist(c: Checklist): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(c));
  } catch {
    /* no storage: kept until the page closes */
  }
}

/** The checklist as Markdown: one row per item, with the counts on top. */
export function checklistMarkdown(items: LabItem[], c: Checklist, nameOf: (id: string) => string, t: Translate, date: string): string {
  const cell = (s: string) => s.replace(/\|/g, '/').replace(/\r?\n/g, ' ');
  const rows = items.map((x) => {
    const e = c[x.id];
    return `| ${t(`lab.kind.${x.kind}`)} | ${x.id} | ${cell(nameOf(x.id))} | ${x.set} | ${t(`lab.mark.${e?.mark ?? 'todo'}`)} | ${cell(e?.note ?? '')} |`;
  });
  const count = (m: LabMark) => items.filter((x) => (c[x.id]?.mark ?? 'todo') === m).length;
  return [
    `# ${t('lab.title')} — ${date}`,
    '',
    `${t('lab.mark.ok')}: ${count('ok')} · ${t('lab.mark.bug')}: ${count('bug')} · ${t('lab.mark.todo')}: ${count('todo')}`,
    '',
    `| ${t('lab.col.kind')} | id | ${t('lab.col.name')} | ${t('lab.col.set')} | ${t('lab.col.mark')} | ${t('lab.col.note')} |`,
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

/** Mounts the panel into `parent` (beside the stage, fixed on the right). */
export function mountLabPanel(parent: HTMLElement, o: LabPanelOptions): LabPanel {
  const { t } = o;
  let current = o.current;
  let open = true;
  let query = '';
  const checklist = loadChecklist();

  const el = document.createElement('aside');
  el.className = 'lab-panel';
  el.setAttribute('aria-label', t('lab.title'));
  parent.appendChild(el);

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'lab-tab';
  parent.appendChild(tab);
  tab.addEventListener('click', () => {
    open = !open;
    draw();
    o.onToggle();
  });

  function setMark(id: string, mark: LabMark): void {
    checklist[id] = { mark, note: checklist[id]?.note ?? '' };
    saveChecklist(checklist);
    draw();
  }

  function exportFile(): void {
    const date = new Date().toISOString().slice(0, 10);
    const md = checklistMarkdown(o.items, checklist, o.nameOf, t, date);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = `lab-${date}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function draw(): void {
    el.hidden = !open;
    tab.textContent = open ? '›' : t('lab.title');
    tab.title = open ? t('lab.close') : t('lab.open');
    tab.classList.toggle('shut', !open);
    if (!open) return;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.labFocus ?? null;
    el.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'lab-head';
    const h = document.createElement('h2');
    h.textContent = t('lab.title');
    const done = o.items.filter((x) => (checklist[x.id]?.mark ?? 'todo') !== 'todo').length;
    const count = document.createElement('span');
    count.className = 'lab-count';
    count.textContent = t('lab.progress', { n: done, total: o.items.length });
    head.append(h, count);
    if (o.exit) {
      const out = document.createElement('a');
      out.className = 'lab-exit';
      out.href = o.exit;
      out.textContent = t('lab.exit');
      head.appendChild(out);
    }

    // The current item: its name, its mark and note, a fresh start and the export.
    const cur = document.createElement('div');
    cur.className = 'lab-current';
    const curName = document.createElement('div');
    curName.className = 'lab-cur-name';
    curName.textContent = o.nameOf(current);
    const marks = document.createElement('div');
    marks.className = 'lab-marks';
    for (const m of ['ok', 'bug', 'todo'] as LabMark[]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lab-mark m-${m}`;
      b.textContent = t(`lab.mark.${m}`);
      b.setAttribute('aria-pressed', String((checklist[current]?.mark ?? 'todo') === m));
      b.addEventListener('click', () => setMark(current, m));
      marks.appendChild(b);
    }
    const note = document.createElement('textarea');
    note.className = 'lab-note';
    note.rows = 3;
    note.placeholder = t('lab.note');
    note.value = checklist[current]?.note ?? '';
    note.dataset.labFocus = 'note';
    note.addEventListener('input', () => {
      checklist[current] = { mark: checklist[current]?.mark ?? 'todo', note: note.value };
      saveChecklist(checklist);
    });
    const tools = document.createElement('div');
    tools.className = 'lab-tools';
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'lab-btn';
    again.textContent = t('lab.restart');
    again.addEventListener('click', () => o.onRestart());
    const exp = document.createElement('button');
    exp.type = 'button';
    exp.className = 'lab-btn';
    exp.textContent = t('lab.export');
    exp.addEventListener('click', exportFile);
    tools.append(again, exp);
    cur.append(curName, marks, note, tools);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'lab-search';
    search.placeholder = t('lab.search');
    search.setAttribute('aria-label', t('lab.search'));
    search.value = query;
    search.dataset.labFocus = 'search';
    search.addEventListener('input', () => {
      query = search.value;
      draw();
    });

    const list = document.createElement('div');
    list.className = 'lab-list';
    const q = query.trim().toLowerCase();
    for (const kind of KINDS) {
      const rows = o.items.filter((x) => x.kind === kind && (!q || o.nameOf(x.id).toLowerCase().includes(q) || x.id.includes(q)));
      if (!rows.length) continue;
      const gh = document.createElement('h3');
      gh.textContent = `${t(`lab.kind.${kind}`)} (${rows.length})`;
      list.appendChild(gh);
      for (const x of rows) {
        const mark = checklist[x.id]?.mark ?? 'todo';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `lab-item mk-${mark}`;
        if (x.id === current) b.classList.add('on');
        if (x.id === current) b.setAttribute('aria-current', 'true');
        b.dataset.lab = x.id;
        const dot = document.createElement('span');
        dot.className = 'lab-dot';
        dot.title = t(`lab.mark.${mark}`);
        const name = document.createElement('span');
        name.className = 'lab-name';
        name.textContent = o.nameOf(x.id);
        b.append(dot, name);
        if (x.set !== 'base') {
          const tag = document.createElement('span');
          tag.className = 'lab-set';
          tag.textContent = t(`lab.set.${x.set}`);
          b.appendChild(tag);
        }
        b.addEventListener('click', () => o.onPick(x.id));
        list.appendChild(b);
      }
    }
    el.append(head, cur, search, list);
    if (focused === 'search') {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    } else if (focused === 'note') note.focus();
    list.querySelector('.lab-item.on')?.scrollIntoView({ block: 'nearest' });
  }

  draw();
  return {
    setCurrent(id: string) {
      current = id;
      draw();
    },
    width: () => (open ? LAB_PANEL_W : 0),
  };
}
