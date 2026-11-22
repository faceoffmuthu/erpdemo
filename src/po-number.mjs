import { positionText, readDocumentPages } from './document-text.mjs';
import { norm } from './model.mjs';

const hostedEndpoint = 'https://free-oxr.somark.ai/api/v1/parse/sync';
const textBlocks = new Set(['Title', 'Text', 'Page-header', 'Page-footer', 'Table', 'Caption', 'Footnote']);
const extensions = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' };
const pendingReads = new Map();
const label = /\b(?:(?:buyer|customer|client)(?:['’]s)?[ ]+)?(?:purchase[ ]+order|(?:buyer|customer)[ ]+order|p[. /]*o\.?)(?![\p{L}\p{N}])[ ]*(?:number\b|no\b\.?|ref(?:erence)?\b\.?|id\b|#)/giu;
const issuerLabel = /\b([A-Z]{2,8})[ ]+order[ ]*(?:number\b|no\b\.?|#)/gi;
const clientLabel = /\border[ ]*(?:number\b|no\b\.?)[ ]+(?:cli[eë]nt|customer)\b/gi;
const title = /^(?:(?:buyer|customer|client)(?:['’]s)?[ ]+)?(?:purchase[ ]+order|p[. /]*o\.?)(?:[ ]*[:#][ ]*|[ ]+)(?=\S)/i;
const valueStart = /^[\s:#=–—-]*/u;
const identifier = /^[\p{L}\p{N}][\p{L}\p{N}._/‐‑‒–−-]{0,79}(?=$|[\s,;|])/u;
const spacedIdentifier = /^[A-Z]{1,8}[ ]+\d[\p{L}\p{N}._/‐‑‒–−-]{0,65}(?=$|[\s,;|])/u;
const unrelated = /^(?:date|dated|order|number|invoice|terms|line|page|revision|rev|customer|buyer|supplier|vendor|delivery|ship|reference|ref|subtotal|total|details|pending|none|n\/a)$/i;
const dateCode = /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:\d{2}|\d{4}))$/;

function candidate(value, explicit, adjacent = false) {
  const text = value.replace(valueStart, '').replace(/(?<=\w)[ ]*([/‐‑–-])[ ]*(?=\w)/g, '$1');
  const match = text.match(spacedIdentifier) ?? text.match(identifier);
  if (!match || unrelated.test(match[0]) || (adjacent || !explicit) && dateCode.test(match[0])) return '';
  const code = match[0];
  const tail = text.slice(code.length);
  if (/^,\d/.test(tail) || adjacent && tail.trim()) return '';
  if (/\p{N}/u.test(code)) return explicit || code.length >= 3 ? code.replace(/ +/g, ' ') : '';
  return explicit && code.length >= 3 && code === code.toUpperCase() && code === text.trim() ? code : '';
}

function labelledValue(cell, end, following) {
  const remainder = cell.text.slice(end);
  const given = candidate(remainder, true);
  if (given) return { value: given, confidence: cell.confidence };
  if (remainder.replace(valueStart, '').trim()) return null;
  for (const next of following) {
    const value = next && candidate(next.text, true, true);
    if (value) return { value, confidence: next.confidence };
  }
  return null;
}

function labelledNumbers({ text, rows: positioned }) {
  const rows = positioned ?? text.replace(/[\u00A0\u202F]/g, ' ').replace(/\*\*/g, '').split(/\r?\n/)
    .map(line => line.split(/\t| {3,}/).map(cell => ({ text: cell.trim() }))).filter(cells => cells.some(cell => cell.text));
  const found = [];
  rows.forEach((cells, rowIndex) => {
    cells.forEach((cell, column) => {
      const following = [cells[column + 1], rows[rowIndex + 1]?.[column]];
      for (const match of cell.text.matchAll(label)) {
        if (/\b(?:supplier|vendor|internal|previous|prior)[ ]*$/i.test(cell.text.slice(0, match.index))) continue;
        const number = labelledValue(cell, match.index + match[0].length, following);
        if (number) found.push({ ...number, priority: 2 });
      }
      for (const match of cell.text.matchAll(issuerLabel)) {
        const issuer = match[1];
        if (issuer !== issuer.toUpperCase() || unrelated.test(issuer) || /^(?:INTERNAL|PREVIOUS|PRIOR)$/i.test(issuer)) continue;
        const number = labelledValue(cell, match.index + match[0].length, following);
        if (number && norm(number.value.slice(0, issuer.length)) === norm(issuer) && /^[ ._/-]*\d/.test(number.value.slice(issuer.length))) {
          found.push({ ...number, priority: 2 });
        }
      }
      for (const match of cell.text.matchAll(clientLabel)) {
        const number = labelledValue(cell, match.index + match[0].length, following);
        if (number) found.push({ ...number, priority: 0 });
      }
      const heading = cell.text.match(title);
      const value = heading && candidate(cell.text.slice(heading[0].length), false);
      if (value) found.push({ value, confidence: cell.confidence, priority: 1 });
    });
  });
  return found;
}

function readNumber(pages) {
  const numbers = pages.flatMap(page => labelledNumbers(page).map(row => ({ ...row, page: page.page, method: page.method, confidence: row.confidence ?? page.confidence })));
  const priority = numbers.reduce((max, row) => Math.max(max, row.priority), -1);
  const unique = new Map();
  for (const item of numbers.filter(row => row.priority === priority)) {
    const { value, page, method, confidence } = item;
    const key = norm(value).replaceAll(' ', '');
    const previous = unique.get(key);
    if (!previous || (confidence ?? 100) > (previous.confidence ?? 100)) unique.set(key, { value, page, method, confidence });
  }
  const candidates = [...unique.values()];
  if (candidates.length !== 1) return { status: candidates.length ? 'ambiguous' : 'missing', candidates: candidates.slice(0, 10) };
  const [number] = candidates;
  return priority === 0 || number.confidence != null && number.confidence < 70 ?
    { status: 'review', candidates } : { status: 'matched', ...number };
}

function oxrPageText(blocks) {
  return blocks.filter(block => textBlocks.has(block?.type) && typeof block.content === 'string').map(block => {
    if (block.format !== 'html') return block.content;
    return block.content.replace(/<\/t[dh]\s*>/gi, '\t').replace(/<\/(?:tr|p)\s*>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&#(?:35|x23);/gi, '#')
      .replace(/&amp;/gi, '&').replace(/&colon;|&#58;/gi, ':');
  }).join('\n');
}

function localOXR() {
  const base = new URL(process.env.HAPZO_OXR_URL || 'http://127.0.0.1:8000/v1');
  if (!['http:', 'https:'].includes(base.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
    base.username || base.password || base.search || base.hash) throw new Error('Invalid local OXR address');
  return base.toString().replace(/\/+$/, '') + '/parse/sync';
}

async function oxrPages(doc, hosted) {
  const extension = extensions[doc.mime];
  const filename = /\.(?:pdf|jpe?g|png)$/i.test(doc.label) ? doc.label : doc.label + extension;
  const form = new FormData();
  form.set('file', new Blob([doc.bytes], { type: doc.mime }), filename);
  form.set('api_key', 'dummy');
  form.set('output_formats', 'json');
  form.set('feature_config', JSON.stringify({ keep_header_footer: true }));
  form.set('element_formats', JSON.stringify({ image: 'none', table: 'html' }));
  const response = await fetch(hosted ? hostedEndpoint : localOXR(), {
    method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error('OXR request failed');
  const result = await response.json();
  const pages = result?.data?.result?.outputs?.json?.pages;
  if (result?.code !== 0 || !Array.isArray(pages) || !pages.length || !pages.every(page => Array.isArray(page?.blocks))) {
    throw new Error('OXR returned no pages');
  }
  return pages.map((row, index) => ({
    page: Number.isInteger(row.page_num) && row.page_num >= 0 ? row.page_num + 1 : index + 1,
    text: oxrPageText(row.blocks), method: hosted ? 'Hosted SoMark OXR' : 'Local SoMark OXR',
  }));
}

export async function readLocalDocumentLayout(doc) {
  if (!Object.hasOwn(extensions, doc.mime)) return [];
  try {
    const layout = await oxrPages(doc, false);
    if (layout.some(page => page.text.trim())) return layout;
  } catch {}
  try {
    const pages = await readDocumentPages(doc, { formatText: positionText });
    return pages.map(({ page, text, method }) => ({ page, text, method }));
  } catch { return []; }
}

async function readPdfOrImage(doc, reader) {
  let notice = '';
  let suggestion;
  let layout = [];
  if (reader !== 'local-ocr') {
    try {
      layout = await oxrPages(doc, reader === 'hosted-oxr');
      const result = readNumber(layout);
      if (['matched', 'ambiguous'].includes(result.status)) return { number: result, layout };
      if (result.status === 'review') suggestion = result;
      notice = 'OXR could not confirm the buyer PO number. HAPZO checked with its built-in reader.';
    } catch (error) {
      if (reader === 'local-oxr') {
        notice = error.cause?.code === 'ECONNREFUSED' ? 'The local OXR service is offline. HAPZO used its built-in reader.' :
          'The local OXR service could not read this file. HAPZO used its built-in reader.';
      } else notice = 'Hosted OXR could not read this file. HAPZO used its built-in reader.';
    }
  }
  try {
    const pages = await readDocumentPages(doc, {
      formatText: positionText,
      needsOcr: (text, page) => !labelledNumbers({ text }).some(row => row.priority > 0) && (page <= 2 || text.trim().length < 60),
      refineOcr: page => page.confidence < 70 || !labelledNumbers(page).some(row => row.priority > 0),
    });
    const result = readNumber(pages);
    if (!layout.some(page => page.text.trim())) layout = pages.map(({ page, text, method }) => ({ page, text, method }));
    return { number: { ...(result.status === 'missing' && suggestion ? suggestion : result), notice }, layout };
  } catch {
    const number = suggestion ? { ...suggestion, notice } : { status: 'unreadable', notice: 'The document could not be read. Check the file or enter the PO number.' };
    return { number, layout };
  }
}

export function inspectPoDocument(doc, reader) {
  if (!Object.hasOwn(extensions, doc.mime)) return Promise.resolve({ number: { status: 'unsupported' }, layout: [] });
  const key = [doc.company_id, doc.sha256, reader].join('|');
  const cached = pendingReads.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  if (pendingReads.size >= 60) pendingReads.delete(pendingReads.keys().next().value);
  const entry = { until: Infinity };
  entry.result = readPdfOrImage(doc, reader).then(result => {
    entry.until = Date.now() + (result.number.notice ? 30_000 : 10 * 60_000);
    return result;
  });
  pendingReads.set(key, entry);
  return entry.result;
}

export async function inspectPoNumber(doc, reader) {
  return (await inspectPoDocument(doc, reader)).number;
}

export function applyPoNumber(extracted, recognition) {
  const previous = extracted.order.po;
  if (recognition.status === 'matched') {
    extracted.order.po = recognition.value;
    if (previous && norm(previous) !== norm(recognition.value)) {
      extracted.review.unshift('The AI draft suggested PO ' + previous + '. Check the number read from the buyer document.');
    }
  } else if (recognition.status === 'ambiguous' || recognition.status === 'review') {
    extracted.order.po = '';
  }
  return { ...extracted, poNumber: recognition };
}
