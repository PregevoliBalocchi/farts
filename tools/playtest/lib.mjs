// Shared core of the simulated playtest (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0).
// One browser window per seat, each pinned to its seat (?seat=N), playing only with the mouse on
// what its screen shows lit or enabled, like a person would. The script stands in for the online
// server: after each move it passes the new state to the other windows (load()).
//
// It returns observations, never verdicts (CLAUDE.md, "Helpers emit observations"): each finding has
// a category and a key. tools/playtest/sim.mjs writes them to disk for a person to read;
// tests/integration/playthrough.spec.ts decides which categories fail the build.

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/** mulberry32: a seeded random source in 32-bit integer maths, so a run can be repeated exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Finding categories, by how a person meets them. */
export const CATEGORIES = {
  pageerror: 'Errore JavaScript nella pagina',
  console: 'Errore in console',
  ledger: 'Cambia un totale che le regole tengono fisso',
  rule: 'Una regola del regolamento non rispettata',
  covered: 'Bersaglio acceso coperto da un altro elemento',
  partly: 'Bersaglio acceso coperto in parte',
  offscreen: 'Bersaglio acceso non del tutto nello schermo',
  tiny: 'Bersaglio cliccabile sotto 24 px',
  raw: 'Testo grezzo o codice interno sullo schermo',
  rawlabel: 'Etichetta accessibile con un codice interno',
  broken: 'Immagine che non si carica',
  cut: 'Testo tagliato dal suo riquadro',
  textpic: 'Parole dove ci si aspetta un’icona o una carta',
  info: 'Area con informazioni utili non visibile',
  empty: 'Scelta accesa senza niente da scegliere',
  stuck: 'Il giocatore di turno non trova come andare avanti',
  drift: 'Gli schermi dei giocatori mostrano stati diversi',
};

/** Acts that do not move the game on (looking around, settings). */
export const META = new Set(['settings', 'log', 'help', 'piles', 'find-mine', 'amb-toggle', 'court-sort', 'map-control', 'map-planets', 'lang', 'skip', 'undo', 'drop-close', 'mine-open', 'text', 'graphics', 'seat', 'players', 'seed', 'new-game', 'calib-back', 'calib-save', 'calib-skip', 'hs-ready', 'mulligan', 'deselect', 'seize', 'mv-drops', 'route-back', 'battle-reset', 'tactical-off', 'mv-then-off', 'menu-close', 'court-close', 'power-close']);

/** Waits for the page to draw what the last input changed (two animation frames). */
export const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

/** Whose screen should act now, as the engine sees it. */
export function actor(s) {
  const ph = s.phase;
  if (ph.type === 'decide') return ph.decision.player;
  if (ph.type === 'actions') return ph.budget.player;
  if (ph.type === 'allocate') return ph.battle.attacker;
  if (ph.type === 'follow') return ph.next;
  if (ph.type === 'draft') return s.draft?.order?.[0] ?? null;
  if (ph.type === 'lead') return s.initiative;
  return null;
}

/** Everything a person could click now on this screen: visible, enabled, and what covers it. */
export function clickables(page) {
  return page.evaluate(() => {
    const out = [];
    const desc = (el) => (el ? `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}` : '');
    const inside = (top, el) => !!top && (top === el || el.contains(top) || top.contains(el));
    for (const el of document.querySelectorAll('[data-act]')) {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) {
        out.push({ act: el.dataset.act, data: { ...el.dataset }, label: '', x: -1, y: -1, covered: false, partly: false, coveredBy: '', onScreen: false, whole: false });
        continue;
      }
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2);
      const top = document.elementFromPoint(x, y);
      const covered = !inside(top, el);
      // Four more points, 20% in from the corners: a target half under a panel is half usable.
      const pts = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]);
      const partly = !covered && pts.some(([px, py]) => px >= 0 && py >= 0 && px < innerWidth && py < innerHeight && !inside(document.elementFromPoint(px, py), el));
      out.push({
        act: el.dataset.act,
        data: { ...el.dataset, pressed: el.getAttribute('aria-pressed') ?? '' },
        label: (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        x, y, covered, partly, coveredBy: covered ? desc(top) : '',
        onScreen: true,
        whole: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        tpick: el.classList.contains('tpick'),
        lit: el.classList.contains('pickable') || el.classList.contains('tpick'),
        foot: !!el.closest('.modal-foot'),
      });
    }
    // Systems lit on the 3D map, where they are on screen (a person sees the glow).
    const b = window.board3d;
    for (const e of document.querySelectorAll('.sys-key.valid')) {
      const id = e.dataset.sys;
      const at = b?.screenOf(id);
      if (!at) continue;
      const onScreen = at.x > 0 && at.y > 0 && at.x < innerWidth && at.y < innerHeight;
      const top = onScreen ? document.elementFromPoint(at.x, at.y) : null;
      const covered = onScreen && !!top && top.tagName !== 'CANVAS';
      out.push({ act: 'map', data: { sys: id }, label: id, x: at.x, y: at.y, covered, partly: false, coveredBy: covered ? desc(top) : '', onScreen, whole: onScreen, tpick: false, lit: true });
    }
    return out;
  });
}

/** What this player clicks next, by what is on screen; null when nothing moves the game on. */
export function choose(cs, s, rand) {
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const by = (act) => cs.filter((c) => c.act === act);
  const any = (...acts) => cs.filter((c) => acts.includes(c.act));
  // Windows first: a choice asked of this player.
  if (by('keep-toggle').length) {
    if (by('keep-confirm').length) return by('keep-confirm')[0];
    const free = by('keep-toggle').filter((c) => c.data.pressed !== 'true');
    return pick(free.length ? free : by('keep-toggle'));
  }
  for (const a of ['gift-pick', 'draft-pick', 'decide-pick', 'power-pick']) if (by(a).length) return pick(by(a));
  if (by('pass-confirm').length) return by('pass-confirm')[0];
  // The window's own button (its backdrop also closes it, but a person clicks the button).
  if (by('close-modal').length) return by('close-modal').find((c) => c.foot) ?? by('close-modal')[0];
  if (s.phase.type === 'decide') {
    const tp = cs.filter((c) => c.tpick);
    if (tp.length && rand() < 0.8) return pick(tp);
    if (by('decide-open').length) return by('decide-open')[0];
    if (by('decline').length) return by('decline')[0];
  }
  // Battle: reroll asks, hits, raid, dice.
  if (by('reroll-skip').length) return rand() < 0.4 && by('reroll-go').length ? by('reroll-go')[0] : by('reroll-skip')[0];
  if (s.phase.type === 'allocate') {
    if (by('allocate').length) {
      if (by('raid').length && rand() < 0.5) return pick(by('raid'));
      return by('allocate')[0];
    }
    if (by('battle-auto').length) return by('battle-auto')[0];
  }
  if (by('do-battle').length) return by('do-battle')[0];
  if (by('die-step').length) {
    const plus = by('die-step').filter((c) => c.data.d === '1');
    if (plus.length) return pick(plus);
  }
  if (by('do-move').length && rand() < 0.85) return by('do-move')[0];
  // A menu beside a system or a Court card.
  for (const a of ['menu-do', 'court-do', 'spend-as', 'mv-then', 'tactical', 'pre-hit']) if (by(a).length && (a === 'menu-do' || a === 'court-do' || rand() < 0.3)) return pick(by(a));
  // Lead and follow.
  if (s.phase.type === 'lead' || s.phase.type === 'follow') {
    const hand = by('hand');
    const plays = any('lead', 'follow');
    const declare = by('lead-declare');
    if (declare.length && rand() < 0.3) return pick(declare);
    if (plays.length && rand() < 0.85) return pick(plays);
    const fresh = hand.filter((c) => c.data.pressed !== 'true');
    if (fresh.length) return pick(fresh);
    if (by('pass').length) return by('pass')[0];
    return null;
  }
  if (s.phase.type === 'actions') {
    // Court cards are always buttons (a click zooms them): only the lit ones act.
    const places = any('map', 'court').filter((c) => c.act === 'map' || c.lit);
    if (places.length && rand() < 0.9) return pick(places);
    const r = rand();
    if (by('power-card').length && r < 0.12) return pick(by('power-card'));
    if (by('spend').length && r < 0.25) return pick(by('spend'));
    if (by('kind').length && r < 0.9) return pick(by('kind'));
    if (by('end-turn').length) return by('end-turn')[0];
    if (by('cancel').length) return by('cancel')[0];
  }
  return null;
}

/**
 * Screen checks: raw text where a picture or a name belongs (and raw ids in accessible labels),
 * broken pictures, text cut by its box, targets under 24 px, words where a picture is expected,
 * and the areas a player needs in sight. Returns `[category, key, detail]` triples.
 */
export async function scan(page, lang) {
  return page.evaluate((lang) => {
    const out = [];
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && b.bottom > 0 && b.top < innerHeight;
    };
    const where = (el) => el.closest('[data-region]')?.getAttribute('data-region') ?? String(el.closest('[class]')?.className ?? '?').split(' ')[0];
    const RAW = /\b(court|lore|leader|suit[A-D]|administration|aggression|construction|mobilization)-\d+\b|\bundefined\b|\bNaN\b|\[object|\{[a-zA-Z]+\}|^[a-z]+(\.[a-zA-Z0-9]+){1,3}$|\bP\d\b/;
    // Engine names that only reach an Italian screen raw (in English some are plain words).
    const ENGINE = /\b(battle|collectDice|onDeclare|whenSecured|onAcquire|afterDefending|afterBattle)\b/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const txt = n.textContent.trim();
      if (!txt || !n.parentElement || !vis(n.parentElement)) continue;
      if (n.parentElement.closest('script,style,.sys-key')) continue;
      if (RAW.test(txt) || (lang === 'it' && ENGINE.test(txt))) out.push(['raw', `${where(n.parentElement)}: "${txt.slice(0, 70)}"`]);
    }
    for (const el of document.querySelectorAll('[aria-label],[title]')) {
      if (!vis(el)) continue;
      const lab = `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`.trim();
      if (RAW.test(lab)) out.push(['rawlabel', `${where(el)}: ${el.dataset.act ?? el.tagName.toLowerCase()} "${lab.slice(0, 60)}"`]);
    }
    for (const img of document.querySelectorAll('img')) if (vis(img) && img.complete && img.naturalWidth === 0) out.push(['broken', `${where(img)}: ${img.getAttribute('src')?.slice(0, 60)}`]);
    for (const el of document.querySelectorAll('button, .kb-name, .mo-name, .hint, .menu-kind span, .ctx-title')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none') continue;
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 3) out.push(['cut', `${where(el)}: "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`]);
    }
    // The area a press reaches: the box, grown by an invisible ::after hit area (base-fixes #42).
    const hitBox = (el) => {
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      if (a.content === 'none' || a.position !== 'absolute') return { w: r.width, h: r.height };
      const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const px = (v) => (String(v).endsWith('px') ? parseFloat(v) * k : 0);
      const left = Math.min(r.left, r.left + px(a.left)), right = Math.max(r.right, r.right - px(a.right));
      const top = Math.min(r.top, r.top + px(a.top)), bottom = Math.max(r.bottom, r.bottom - px(a.bottom));
      return { w: right - left, h: bottom - top };
    };
    for (const el of document.querySelectorAll('[data-act]')) {
      if (!vis(el) || el.disabled) continue;
      const b = hitBox(el);
      if (b.w < 24 || b.h < 24) out.push(['tiny', `${where(el)}: ${el.dataset.act} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`, `${Math.round(b.w)}×${Math.round(b.h)}`]);
    }
    // A picture slot showing words instead of a picture.
    for (const el of document.querySelectorAll('.mo-pic, .well, .rd-card, .bt-die, .dr-card')) {
      if (!vis(el)) continue;
      if (!el.querySelector('img,svg,canvas,.cface') && getComputedStyle(el).backgroundImage === 'none' && (el.textContent || '').trim().length > 1) out.push(['textpic', `${where(el)}: "${el.textContent.trim().slice(0, 40)}"`]);
    }
    // Areas a player needs in sight at all times.
    const need = { 'colonna ambizioni': '.abox', mano: '.hand-cards', Corte: '[data-act="court"]' };
    for (const [name, sel] of Object.entries(need)) {
      const el = document.querySelector(sel);
      if (!el) out.push(['info', `${name}: assente`]);
      else {
        const b = el.getBoundingClientRect();
        if (b.width < 2 || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) out.push(['info', `${name}: fuori dallo schermo`]);
      }
    }
    return out;
  }, lang);
}

/**
 * Plays one game. `ledger(state)` counts the pieces (src/game/engine/ledger.ts); `onFinding(page,
 * finding)` is told of each new observation (to save a screenshot). Returns the findings, the moves
 * and the final state.
 */
export async function runGame({ browser, players, variant = 'base', seed = 7, steps = 500, w = 1920, h = 1080, lang = 'it', ledger, rules, onFinding = async () => {}, log: say = () => {} }) {
  const rand = mulberry32(seed * 9973 + players * 31 + (variant === 'leaders' ? 7 : 0));
  const findings = new Map();
  const moves = [];
  const pages = [];
  let step = 0;

  async function note(page, category, key, detail = '') {
    const k = `${category}:${key}`;
    const f = findings.get(k);
    if (f) {
      f.count++;
      return;
    }
    const entry = { category, key: k, what: CATEGORIES[category], detail, count: 1, step, seat: page ? pages.indexOf(page) : null, phase: shared ? JSON.parse(shared).phase.type : null };
    findings.set(k, entry);
    say(`[${step}] P${entry.seat ?? '-'} ${entry.what}: ${key}${detail ? ` — ${detail}` : ''}`);
    await onFinding(page, entry);
  }

  let shared = null;
  const base = pathToFileURL(resolve('dist-single/index.html')).href;
  for (let seat = 0; seat < players; seat++) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => note(page, 'pageerror', String(e.message).slice(0, 80), String(e.message)));
    page.on('console', (m) => {
      if (m.type() === 'error') note(page, 'console', m.text().slice(0, 80), m.text());
    });
    await page.goto(`${base}?view=table&lang=${lang}&motion=off&debug=perf&players=${players}&seed=${seed}&seat=${seat}${variant === 'leaders' ? '&variant=leaders' : ''}`);
    await page.waitForFunction(() => typeof window.game?.send === 'function' && !!window.board3d, null, { timeout: 60000 });
    pages.push(page);
  }
  for (const p of pages) await settle(p);

  const stateOf = (page) => page.evaluate(() => JSON.stringify(window.game.state));
  shared = await stateOf(pages[0]);
  // Every window starts from the same game (the "server" copy).
  for (const p of pages.slice(1)) await p.evaluate((s) => window.game.load(JSON.parse(s)), shared);
  for (const p of pages) await settle(p);
  const flat = (l) => [...l.pieces.flatMap((c, i) => Object.entries(c).map(([k, v]) => [`P${i} ${k}`, v])), ['risorse', l.resources]];
  let lastTotals = flat(ledger(JSON.parse(shared)));

  /** Passes a new state from the window that made it to every other window, then checks the ledger. */
  async function sync(from, what) {
    const next = await stateOf(from);
    if (next === shared) return false;
    const s = JSON.parse(next);
    const t = flat(ledger(s));
    for (const [i, [k, v]] of t.entries()) {
      const before = lastTotals[i]?.[1];
      if (before !== undefined && before !== v) {
        const last = (s.log ?? []).slice(-3).map((l) => l.text ?? JSON.stringify(l)).join(' | ');
        shared = next;
        await note(from, 'ledger', `${k} ${before}>${v}`, `dopo: ${last}`);
      }
    }
    lastTotals = t;
    // The rulebook's checks between the state before and after this move (src/game/engine/rulecheck.ts).
    if (rules) for (const b of rules(JSON.parse(shared), s)) await note(from, 'rule', `${b.rule}: ${b.detail.slice(0, 70)}`, b.detail);
    shared = next;
    for (const p of pages) if (p !== from) await p.evaluate((x) => window.game.load(JSON.parse(x)), next);
    for (const p of pages) if (p !== from) await settle(p);
    moves.push({ step, seat: pages.indexOf(from), phase: s.phase.type, click: what });
    return true;
  }

  /** One click, as a person: the mouse moves there and clicks; what hides a target is noted. */
  async function click(page, c) {
    if (!c.onScreen) await note(page, 'offscreen', `${c.act}:${c.label.slice(0, 20)}`, 'del tutto fuori');
    else if (!c.whole) await note(page, 'offscreen', `${c.act}:${c.label.slice(0, 20)}`, 'in parte fuori');
    if (c.partly) await note(page, 'partly', `${c.act}:${c.label.slice(0, 20)}`);
    if (c.covered) {
      await note(page, 'covered', `${c.act}:${c.label.slice(0, 20)}`, `a ${Math.round(c.x)},${Math.round(c.y)}, sotto ${c.coveredBy}`);
      // A person looks for another way: here, the keyboard (the system's focus, then Enter).
      if (c.act === 'map') {
        await page.focus(`[data-sys="${c.data.sys}"]`).catch(() => {});
        await page.keyboard.press('Enter');
        await settle(page);
        return;
      }
    }
    if (!c.onScreen) return;
    await page.mouse.move(c.x, c.y, { steps: 4 });
    await page.mouse.click(c.x, c.y);
    await settle(page);
  }

  const live = async (page) => (await clickables(page)).filter((x) => !META.has(x.act));
  let sameState = 0;
  let stuckCount = 0;
  const stuckStates = [];
  while (step < steps) {
    step++;
    const s = JSON.parse(shared);
    if (s.phase.type === 'gameOver') break;
    const who = actor(s);
    const order = who === null || who === undefined || !pages[who] ? pages.map((_, i) => i) : [who, ...pages.map((_, i) => i).filter((i) => i !== who)];
    let moved = false;
    for (const seat of order) {
      const page = pages[seat];
      let c = choose(await live(page), s, rand);
      if (!c) continue;
      const first = `${c.act} ${c.label}`;
      // A move may take several clicks on the same screen (a card, then Lead; an action, a system, a menu).
      for (let k = 0; k < 8 && c; k++) {
        const opened = c.act === 'decide-open';
        await click(page, c);
        if (await sync(page, first)) {
          moved = true;
          break;
        }
        const now = await live(page);
        if (opened && !now.some((x) => x.act === 'decide-pick' || x.act === 'keep-toggle')) await note(page, 'empty', `${s.phase.decision?.card}:${s.phase.decision?.effect}`, 'Scegli apre una scelta senza opzioni');
        c = choose(now, s, rand);
      }
      if (moved) break;
      // The clicks went nowhere: a person backs out (Cancel, or the menu's ×), so the next try starts clean.
      const out = (await clickables(page)).find((x) => ['cancel', 'menu-close', 'court-close', 'power-close'].includes(x.act));
      if (out) await click(page, out);
      if (seat === who) break;
    }
    // Screen checks on the seat that should act, every step.
    const now = JSON.parse(shared);
    const w2 = actor(now);
    if (w2 !== null && w2 !== undefined && pages[w2]) for (const [cat, key, detail] of await scan(pages[w2], lang)) await note(pages[w2], cat, key, detail);
    if (moved) {
      sameState = 0;
      continue;
    }
    if (++sameState < 6) continue;
    // Nothing moved the game on for a while: what does the screen of the seat that should act offer?
    const p = pages[who] ?? pages[0];
    const offer = [...new Set((await live(p)).map((x) => x.act))].sort();
    stuckStates.push({ step, state: shared });
    await note(p, 'stuck', `${s.phase.type}:${offer.join(',')}`, `fase ${s.phase.type}, giocatore ${who}; comandi accesi: ${offer.join(', ') || 'nessuno'}`);
    const exit = (await clickables(p)).find((x) => ['end-turn', 'pass', 'pass-confirm', 'decline', 'close-modal'].includes(x.act));
    if (exit) {
      await click(p, exit);
      await sync(p, `${exit.act} (via d'uscita)`);
    }
    sameState = 0;
    if (++stuckCount > 20) break;
  }

  const states = await Promise.all(pages.map(stateOf));
  if (states.some((x) => x !== states[0])) await note(null, 'drift', 'schermi', 'stati diversi a fine partita');
  return { findings: [...findings.values()], moves, final: JSON.parse(shared), steps: step, pages, stuckStates };
}
