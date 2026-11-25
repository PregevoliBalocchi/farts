// Redraws the table's stage without rebuilding what did not change (production/base-fixes.md #43).
// The stage's markup is still produced from the game state at every redraw, as a list of parts (one per
// region); a part whose markup is the same as last time, and whose nodes nobody has touched since, keeps
// its nodes: it is not parsed again, its pictures are not reloaded and the keyboard focus stays in it.

/** One part of the last redraw: its markup, its nodes on screen, and a copy of them as they were drawn. */
interface Drawn {
  html: string;
  nodes: Node[];
  pristine: Node[];
}

const drawn = new WeakMap<Element, Drawn[]>();

/** The nodes a part's markup makes (text that is only white space left out). */
function parse(doc: Document, html: string): Node[] {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  return [...tpl.content.childNodes].filter((n) => n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() !== '');
}

/** True when the part on screen can stay: same markup, every node still in `host` and unchanged since drawn. */
function unchanged(host: Element, prev: Drawn | undefined, html: string): prev is Drawn {
  return !!prev && prev.html === html && prev.nodes.every((n, i) => n.parentNode === host && n.isEqualNode(prev.pristine[i]));
}

/**
 * Makes `host`'s children the nodes of `parts`, in order. A part drawn last time with the same markup
 * whose nodes are still as they were drawn (a node a handler changed afterwards, a class or a shown
 * hover card, counts as changed) keeps its nodes; every other part is parsed again. Anything else in
 * `host` (menus and windows added after the last redraw) is removed. The result is the same DOM as
 * `host.innerHTML = parts.join('')`, less the white space between the parts.
 */
export function patchChildren(host: Element, parts: readonly string[]): void {
  const doc = host.ownerDocument;
  const before = drawn.get(host) ?? [];
  const now: Drawn[] = parts.map((html, i) => {
    const prev = before[i];
    if (unchanged(host, prev, html)) return prev;
    const nodes = parse(doc, html);
    return { html, nodes, pristine: nodes.map((n) => n.cloneNode(true)) };
  });
  const keep = new Set(now.flatMap((d) => d.nodes));
  for (const child of [...host.childNodes]) if (!keep.has(child)) child.remove();
  // Put each node in its place; a kept node already there is not moved.
  let at: ChildNode | null = host.firstChild;
  for (const node of now.flatMap((d) => d.nodes)) {
    if (node === at) at = at.nextSibling;
    else host.insertBefore(node, at);
  }
  drawn.set(host, now);
}
