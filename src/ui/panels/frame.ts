import { h } from '../dom';
import type { UI } from '../ui';

export interface PanelDef {
  render(ui: UI, arg: unknown): HTMLElement;
  /** blocks world input (movement/combat) while open */
  modal?: boolean;
  /** periodic refresh; when `sig` is provided, refresh only when it changes */
  live?: boolean;
  sig?: (ui: UI, arg: unknown) => string;
}

export function panelFrame(ui: UI, title: string, body: HTMLElement | HTMLElement[], opts: { width?: number; cls?: string; actions?: HTMLElement[] } = {}): HTMLElement {
  return h('div', { class: `frame panel ${opts.cls ?? ''}`, style: { width: opts.width ? `${opts.width}px` : undefined } },
    h('header', null, h('h2', { class: 'title' }, title), h('div', { class: 'row' }, ...(opts.actions ?? []), h('button', { class: 'close', onclick: () => ui.closePanel() }, '✕'))),
    h('div', { class: 'body' }, ...(Array.isArray(body) ? body : [body])),
  );
}
