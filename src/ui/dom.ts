type Child = Node | string | number | null | undefined | false;

/** Tiny hyperscript helper for building DOM UI. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'html') e.innerHTML = String(v);
      else e.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

let tipEl: HTMLElement | null = null;
let tipOwner: unknown = null;

export const tooltip = {
  show(html: string, x: number, y: number, owner: unknown = null, wrap = false) {
    if (!tipEl) tipEl = $('tooltip');
    tipOwner = owner;
    tipEl.className = wrap ? 'compare-wrap' : 'frame';
    tipEl.innerHTML = html;
    tipEl.classList.remove('hidden');
    const r = tipEl.getBoundingClientRect();
    const z = uiZoom();
    let tx = x + 18, ty = y + 14;
    if (tx + r.width > window.innerWidth - 8) tx = x - r.width - 18;
    if (ty + r.height > window.innerHeight - 8) ty = window.innerHeight - r.height - 8;
    // #ui is CSS-zoomed for UI scaling: convert viewport pixels into its local coordinate space
    tipEl.style.left = `${Math.max(4, tx) / z}px`;
    tipEl.style.top = `${Math.max(4, ty) / z}px`;
  },
  hide(owner: unknown = null) {
    if (!tipEl) tipEl = $('tooltip');
    if (owner && owner !== tipOwner) return;
    tipEl.classList.add('hidden');
    tipOwner = null;
  },
};

/** Attach a hover tooltip whose HTML is computed lazily. */
export function tip<E extends HTMLElement>(e: E, html: () => string, wrap = false): E {
  e.addEventListener('mouseenter', (ev) => tooltip.show(html(), ev.clientX, ev.clientY, e, wrap));
  e.addEventListener('mousemove', (ev) => tooltip.show(html(), ev.clientX, ev.clientY, e, wrap));
  e.addEventListener('mouseleave', () => tooltip.hide(e));
  return e;
}

export function uiZoom(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
}
