import { today, ref } from '/src/model.mjs';

export const h = input => String(input ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
export const fmt = n => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 6 });
export const money = (n, currency = 'INR') => Number(n ?? 0).toLocaleString('en-IN', { style: 'currency', currency });
export const can = (app, action) => app.user.actions.includes(action);
export const valueOf = (value, fallback = '—') => value ? h(value) : fallback;
export const showQty = (value, unit) => h(fmt(value) + (unit ? ' ' + unit : ''));
export const badge = (label, kind = '') => '<span class="badge ' + kind + '">' + h(label) + '</span>';
export const txStatus = s => badge(s, ['Pending inspection', 'Draft', 'With processor', 'Part returned', 'Hold', 'Under review', 'Pending verification', 'Rework'].includes(s) ? 'warn' : ['Rejected', 'Suspended', 'Withdrawn', 'Blocked'].includes(s) ? 'bad' : '');
export const button = (label, attrs, kind = 'secondary') => '<button class="button ' + kind + '" type="button" ' + (attrs || '') + '>' + h(label) + '</button>';
export const linkButton = (label, type, data) => '<button type="button" class="link" data-' + type + '="' + h(data) + '">' + h(label) + '</button>';
export const navLink = (label, page) => '<a class="button secondary" href="#' + encodeURIComponent(page) + '">' + h(label) + '</a>';
export const lotLink = id => id ? linkButton(id, 'lot', id) : '—';
export const washLink = (id, label = 'Open wash batch') => '<a href="#washing?batch=' + encodeURIComponent(id) + '">' + h(label) + '</a>';
export const finishBatchLink = (id, label) => '<a href="#fabric-finishing?batch=' + encodeURIComponent(id) + '">' + h(label) + '</a>';
export const printBatchLink = (id, label) => '<a href="#printing?batch=' + encodeURIComponent(id) + '">' + h(label) + '</a>';
export const embroideryBatchLink = (id, label) => '<a href="#embroidery?batch=' + encodeURIComponent(id) + '">' + h(label) + '</a>';
export const docs = d => d?.id ? '<a href="/api/documents/' + encodeURIComponent(d.id) + '">' + h(d.label) + '</a>' : '—';
export const heading = (title, desc, actions = '') => '<div class="heading"><div class="heading-copy"><small class="heading-eyebrow">HAPZO WORKSPACE</small><h1>' + h(title) + '</h1>' + (desc ? '<p>' + h(desc) + '</p>' : '') + '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
export const panel = (title, body) => '<section class="panel"><h2>' + h(title) + '</h2>' + body + '</section>';
export const split = (...items) => '<div class="split">' + items.join('') + '</div>';
export const actions = (...items) => '<div class="actions">' + items.filter(Boolean).join('') + '</div>';
export const note = (text, warn = false) => '<p class="note' + (warn ? ' warn' : '') + '">' + h(text) + '</p>';
export const empty = (text = 'No records yet.') => '<p class="empty">' + h(text) + '</p>';
export const details = (title, body, open = false) => '<details class="panel" ' + (open ? 'open' : '') + '><summary>' + h(title) + '</summary>' + body + '</details>';
export const cards = pairs => '<div class="cards">' + pairs.map(([k, v]) => '<div class="tile"><small>' + h(k) + '</small><strong>' + h(v) + '</strong></div>').join('') + '</div>';
export const facts = rows => '<dl class="facts">' + rows.map(([k, v]) => '<div><dt>' + h(k) + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>';
export function table(cols, rows, noRows) {
  return rows.length ? '<div class="table"><table><thead><tr>' + cols.map(head => '<th scope="col">' + h(head) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(v => '<td>' + (v ?? '—') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : empty(noRows);
}
export const option = (value, label, selected) => '<option value="' + h(value) + '"' + (String(selected ?? '') === String(value) ? ' selected' : '') + '>' + h(label ?? value) + '</option>';
export function select(label, name, values, { required = true, initial = '', blank = 'Select…', hook = '' } = {}) {
  return '<label>' + h(label) + '<select name="' + h(name) + '"' + (required ? ' required' : '') +
    (hook ? ' data-hook="' + h(hook) + '"' : '') + '>' + option('', blank, initial) +
    values.map(x => Array.isArray(x) ? option(x[0], x[1], initial) : option(x, x, initial)).join('') + '</select></label>';
}

const geminiStatuses = { live: 'Live', timeout: 'Timed out', unavailable: 'Unavailable', failed: 'Read failed', untested: 'Untested' };
const geminiChoice = model => model.label + ' · ' + (geminiStatuses[model.status] || geminiStatuses.untested);
export const geminiModelOptions = (models, selected) => option('', 'Automatic', selected) +
  models.map(model => option(model.id, geminiChoice(model), selected)).join('');

export function geminiModelField(models = []) {
  return '<label class="wide">Gemini model<select name="geminiModel">' + geminiModelOptions(models, '') +
    '</select><small class="muted">Status reflects reads in this workspace over the last 15 minutes.</small></label>' +
    '<p class="sub note wide" data-gemini-notice role="status" hidden></p>';
}

export function geminiRetryMessage(retry, pending = false) {
  const reason = retry.status === 'timeout' ? 'timed out' : retry.status === 'unavailable' ? 'was unavailable' : 'could not finish';
  const first = retry.from + ' ' + reason + '. ';
  return first + (pending ? 'Retrying with ' : 'Retried with ') + retry.to + '.';
}
export function field(label, name, { type = 'text', required = true, value = '', placeholder = '', min, step, max, autocomplete, wide } = {}) {
  return '<label' + (wide ? ' class="wide"' : '') + '>' + h(label) + '<input type="' + h(type) + '" name="' + h(name) + '" value="' + h(value) + '"' +
    (required ? ' required' : '') + (placeholder ? ' placeholder="' + h(placeholder) + '"' : '') +
    (min != null ? ' min="' + h(min) + '"' : '') + (max != null ? ' max="' + h(max) + '"' : '') +
    (step ? ' step="' + h(step) + '"' : '') + (autocomplete ? ' autocomplete="' + h(autocomplete) + '"' : '') + '></label>';
}
export const numberField = (label, name, props = {}) => field(label, name, { type: 'number', min: 0, step: 'any', ...props });
export const day = (label = 'Posting date', name = 'date', required = true) => field(label, name, { type: 'date', required, value: required ? today() : '' });
export const text = (label, name, placeholder = '', required = false, value = '') => '<label class="wide">' + h(label) + '<textarea name="' + h(name) + '"' +
  (required ? ' required' : '') + ' placeholder="' + h(placeholder) + '">' + h(value) + '</textarea></label>';
export const check = (label, name) => '<label class="check"><input type="checkbox" name="' + h(name) + '" value="yes"> ' + h(label) + '</label>';
export const file = (label = 'Supporting document', bucket = 'stock', name = 'document', multiple = false,
  { accept = '.pdf,image/png,image/jpeg', required = false } = {}) => '<label class="wide">' + h(label) +
  '<input type="file" name="' + h(name) + '" data-bucket="' + h(bucket) + '" accept="' + h(accept) + '"' +
  (multiple ? ' multiple' : '') + (required ? ' required' : '') + '></label>';
export const hidden = (name, value) => '<input type="hidden" name="' + h(name) + '" value="' + h(value) + '">';
export const form = (action, fields, label, message = '') => '<form data-form="' + h(action) + '"><div class="fields">' + fields + '</div>' +
  (message ? note(message) : '') + '<button class="button">' + h(label) + '</button></form>';
export function editor(app, action, title, fields, label, message, open = false) {
  return can(app, action) ? details(title, form(action, fields, label, message), open) : '';
}
export const choose = (label, name, rows, fn, opts) => select(label, name, rows.map(r => [r.id, fn(r)]), opts);
export const titles = {
  party: p => p.code + ' · ' + p.name,
  item: i => i.code + ' · ' + i.name + ' (' + i.unit + ')',
  location: l => l.code + ' · ' + [l.site, l.warehouse, l.bin].filter(Boolean).join(' / '),
  lot: l => l.id + ' · ' + l.material + ' · ' + fmt(l.qty) + ' ' + l.unit,
  order: o => o.po + ' · ' + o.buyer,
  wo: w => w.number + ' · ' + w.stage,
};
export const lineLabel = (s, l) => (ref(s.orders, l.orderId)?.po || '') + ' · ' + l.lineNo + ' · ' + l.style + ' / ' + l.color + ' / ' + l.size + ' · ' + l.id;
export const shortDate = d => d ? h(String(d).slice(0, 10)) : '—';
export const passportUrl = (app, p) => app.user.publishedOrigin + '/p/' + encodeURIComponent(p.token);
