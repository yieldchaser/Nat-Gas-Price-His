// Minimal DOM helpers: escaping, element creation and the shared controls
// (segmented buttons, selects, chips) used by every view.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tagged template that escapes interpolations unless wrapped in raw(). */
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => {
    if (i >= vals.length) return out + s;
    const v = vals[i];
    const str = Array.isArray(v) ? v.map(x => (x && x.__raw ? x.html : esc(x))).join('')
      : v && v.__raw ? v.html : esc(v);
    return out + s + str;
  }, '');
}
export const raw = s => ({ __raw: true, html: String(s ?? '') });

export function el(tag, attrs = {}, inner = '') {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === false || v == null) return;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  });
  if (inner) e.innerHTML = inner;
  return e;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Segmented control. options: [{value, label, title?}]
 * Returns HTML; wire with bindSegments(root, name, onChange).
 */
export function segmented(name, options, value, { label } = {}) {
  return html`<div class="ctl">${label ? raw(`<span class="ctl-label">${esc(label)}</span>`) : ''}<div class="seg" role="group" data-seg="${name}">${options.map(o =>
    raw(html`<button type="button" class="${String(o.value) === String(value) ? 'on' : ''}" data-value="${o.value}" ${raw(o.title ? `title="${esc(o.title)}"` : '')} ${raw(o.disabled ? 'disabled' : '')}>${o.label}</button>`))}</div></div>`;
}

export function select(name, options, value, { label } = {}) {
  return html`<label class="ctl">${label ? raw(`<span class="ctl-label">${esc(label)}</span>`) : ''}<select data-sel="${name}">${options.map(o =>
    raw(html`<option value="${o.value}" ${raw(String(o.value) === String(value) ? 'selected' : '')}>${o.label}</option>`))}</select></label>`;
}

/** Delegate clicks/changes for segmented controls and selects inside root. */
export function bindControls(root, handlers) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-seg] button');
    if (!b || b.disabled) return;
    const name = b.parentElement.dataset.seg;
    if (!handlers[name]) return;
    $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b));
    handlers[name](b.dataset.value);
  });
  root.addEventListener('change', e => {
    const s = e.target.closest('[data-sel]');
    if (s && handlers[s.dataset.sel]) handlers[s.dataset.sel](s.value);
  });
}

/** KPI tile. tone: 'pos' | 'neg' | 'flat' | 'warn' */
export function kpi({ label, value, sub = '', tone = '', title = '' }) {
  return html`<div class="kpi" ${raw(title ? `title="${esc(title)}"` : '')}><div class="kpi-l">${label}</div><div class="kpi-v ${tone}">${raw(value)}</div>${raw(sub ? `<div class="kpi-s">${sub}</div>` : '')}</div>`;
}

/**
 * Panel shell. `id` gets a body element `#id-body`; `controls` is HTML.
 */
export function panel({ id, title, sub = '', controls = '', body = '', note = '', cls = '' }) {
  return html`<section class="panel ${cls}" id="${id}">
    <header class="panel-h"><div class="panel-t"><h2>${title}</h2>${raw(sub ? `<p>${sub}</p>` : '')}</div>${raw(controls ? `<div class="panel-c">${controls}</div>` : '')}</header>
    <div class="panel-b" id="${id}-body">${raw(body)}</div>
    ${raw(note ? `<footer class="panel-n">${note}</footer>` : '')}
  </section>`;
}

export function empty(msg) {
  return `<div class="empty">${esc(msg)}</div>`;
}
