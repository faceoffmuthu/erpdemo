import { norm, ref, STAGES, validDate } from '/src/model.mjs';
import { can, h, button, form, field, check, option, note, details, empty, geminiModelOptions, geminiRetryMessage, table } from '/ui.js';
import * as operations from '/pages.js';
import * as compliance from '/compliance-ui.js';
import * as finance from '/finance-ui.js';
import { fabricPage, fabricReportDetail, fabricTechPackReview, loadFabricCalculator, refreshFabricEditor, selectFabricLot } from '/fabric-ui.js';
import * as garments from '/garment-ui.js';
import * as dyeing from '/yarn-dyeing-ui.js';
import * as fibreUi from '/fibre-ui.js';
import * as spinUi from '/spinning-ui.js';
import * as knitUi from '/knitting-ui.js';
import * as weaveUi from '/weaving-ui.js';
import * as fdUi from '/fabric-dyeing-ui.js';
import * as ffUi from '/fabric-finishing-ui.js';
import * as washUi from '/washing-ui.js';
import * as printUi from '/printing-ui.js';
import * as garmentProduction from '/garment-production-ui.js';
import { same } from '/src/claim-scope.mjs';
import { PO_IMPORT_ACTION } from '/src/po-import.mjs';

const app = { user: null, data: null, initialized: true, local: {} };
const root = document.querySelector('#app');
const dialog = document.querySelector('#detail-dialog');
const brands = '<span class="mark" aria-hidden="true">H</span><span>HAPZO<small>ERP + DIGITAL PRODUCT PASSPORT</small></span>';
const pages = new Map([
  ['overview', ['Overview', 'Workspace', operations.overview]],
  ['orders', ['Buyer orders', 'Commercial', operations.orders]],
  ['po-flow', ['PO flowchart', 'Commercial', operations.poFlow]],
  ['fabric', ['Fabric specs', 'Commercial', fabricPage]],
  ['tech-pack', ['Garment tech packs', 'Commercial', garments.garmentPage]],
  ['purchase', ['Planning & purchase', 'Commercial', operations.procurement]],
  ['stock', ['Inventory', 'Manufacturing', operations.stock]],
  ['floor', ['Work orders', 'Manufacturing', operations.floor]],
  ['fibre', ['Ginning & fibre', 'Manufacturing', fibreUi.fibrePage]],
  ['spinning', ['Spinning', 'Manufacturing', spinUi.spinningPage]],
  ['knitting', ['Knitting', 'Manufacturing', knitUi.knittingPage]],
  ['weaving', ['Weaving', 'Manufacturing', weaveUi.weavingPage]],
  ['fabric-dyeing', ['Fabric dyeing', 'Manufacturing', fdUi.fabricDyeingPage]],
  ['fabric-finishing', ['Fabric finishing', 'Manufacturing', ffUi.fabricFinishingPage]],
  ['yarn-dyeing', ['Yarn dyeing', 'Manufacturing', dyeing.yarnDyeing]],
  ['washing', ['Washing', 'Manufacturing', washUi.washingPage]],
  ['printing', ['Printing', 'Manufacturing', printUi.printingPage]],
  ['cutting', ['Cutting', 'Manufacturing', garmentProduction.cuttingPage]],
  ['embroidery', ['Embroidery', 'Manufacturing', printUi.embroideryPage]],
  ['stitching', ['Stitching', 'Manufacturing', garmentProduction.stitchingPage]],
  ['garment-finishing', ['Garment finishing', 'Manufacturing', garmentProduction.garmentFinishingPage]],
  ['quality', ['Quality & lab', 'Manufacturing', operations.quality]],
  ['jobwork', ['Outside job work', 'Manufacturing', operations.jobwork]],
  ['equipment', ['Machines & readings', 'Manufacturing', operations.equipment]],
  ['packing', ['Packing', 'Fulfilment', garmentProduction.packingPage]],
  ['logistics', ['Dispatch & logistics', 'Fulfilment', operations.logistics]],
  ['invoices', ['Invoices & costs', 'Finance', finance.invoices]],
  ['accounts', ['Accounts & vouchers', 'Finance', finance.accounts]],
  ['ledgers', ['Ledgers', 'Finance', finance.ledgers]],
  ['day-book', ['Day book', 'Finance', finance.dayBook]],
  ['reports', ['Financial reports', 'Finance', finance.reports]],
  ['trace', ['Scan & trace', 'Product records', compliance.trace]],
  ['standards', ['Standards & evidence', 'Product records', compliance.standards]],
  ['passports', ['Digital Product Passports', 'Product records', compliance.passports]],
  ['masters', ['Company masters', 'Administration', operations.masters]],
  ['settings', ['Settings & data', 'Administration', compliance.settings]],
  ['buyer', ['My orders', 'Buyer portal', compliance.buyer]],
]);
const allowed = key => app.user.role === 'Buyer' ? ['buyer', 'settings'].includes(key) :
  key !== 'buyer' && (pages.get(key)?.[1] !== 'Finance' || ['Admin', 'Finance'].includes(app.user.role));
let current = '';
let scanStream;
let lastDataRequest = 0;
const pending = new WeakMap();
const cachedUploads = new WeakMap();

class ApiError extends Error {
  constructor(body, status) {
    super(body.error || 'Request failed.');
    this.code = body.code;
    this.status = status;
    this.retry = body.retry;
  }
}

async function api(url, data) {
  const response = await fetch(url, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result, response.status);
  return result;
}
const signed = (url, data = {}) => api(url, { ...data, companyId: app.user.companyId });
const flash = (message = '', error = false) => {
  const el = document.querySelector('#flash');
  if (!el) return;
  el.hidden = !message;
  el.classList.toggle('err', error);
  el.textContent = message;
};
const errorText = err => err instanceof TypeError ? 'HAPZO could not reach its local server. Keep this tab open and retry after restarting the launcher.' : err.message;

function pageFromUrl() {
  const key = window.location.hash.slice(1).split('?')[0];
  return allowed(key) && pages.has(key) ? key : app.user.role === 'Buyer' ? 'buyer' : 'overview';
}

function routeParams() {
  return new URLSearchParams(window.location.hash.split('?')[1] || '');
}

function go(next) {
  if (window.location.hash === '#' + next) render();
  else window.location.hash = next;
}

async function load(renderPage = true) {
  const latest = ++lastDataRequest;
  const result = await api('/api/state');
  const members = (result.user.role === 'Admin' && window.location.hash === '#settings') ? await api('/api/members') : null;
  if (latest !== lastDataRequest) return;
  const changed = app.user?.companyId !== result.user.companyId;
  if (changed) app.local = {};
  app.user = result.user;
  app.data = result.data;
  if (members) app.local.members = members.members;
  if (renderPage) render();
}

async function handleRoute() {
  if (!app.user) return;
  const next = pageFromUrl();
  if (dialog.open) dialog.close();
  if (next !== current || routeParams().has('batch')) {
    window.scrollTo(0, 0);
  }
  render();
  if (next === 'ledgers' && routeParams().has('ledger')) document.querySelector('#ledger-statement')?.scrollIntoView({ block: 'start' });
  if (next === 'po-flow' && app.local.flowFocus) {
    const target = app.local.flowFocus;
    app.local.flowFocus = '';
    document.querySelector(target)?.focus({ preventScroll: true });
    if (target === '#flow-phase-title') document.querySelector('.po-flow-selection')?.scrollIntoView({ block: 'start' });
  }
  if (next === 'passports' && app.local.focusPassport) {
    app.local.focusPassport = false;
    document.querySelector('#passport-section')?.scrollIntoView({ block: 'start' });
  }
  if (next === 'settings' && app.user.role === 'Admin') {
    const companyId = app.user.companyId;
    try {
      const data = await api('/api/members');
      if (current === 'settings' && app.user?.companyId === companyId) {
        app.local.members = data.members;
        render();
      }
    } catch (err) { await showError(err); }
  }
}

function renderAuth() {
  const initial = !app.initialized;
  const loginFields = initial ? field('Company name', 'companyName', { value: 'HAPZO Decaste' }) +
    field('Your name', 'displayName', { autocomplete: 'name' }) : '';
  root.innerHTML = '<main class="login-layout"><section class="paper"><div class="brand">' + brands + '</div><h1>' +
    (initial ? 'Set up HAPZO Local' : 'Sign in') + '</h1><p class="muted">' +
    (initial ? 'Create the administrator and company that will hold your local ERP records.' : 'Use the login assigned to your company workspace.') +
    '</p><div id="flash" class="flash" role="status" hidden></div>' + form(initial ? 'setup' : 'login',
      loginFields + field('Login', 'login', { autocomplete: 'username' }) +
      field('Password', 'password', { type: 'password', autocomplete: initial ? 'new-password' : 'current-password' }),
      initial ? 'Create workspace' : 'Sign in', initial ? 'Use a password of at least 12 characters.' : '') + '</section></main>';
}

function render() {
  if (!app.user || !app.data) {
    renderAuth();
    return;
  }
  const selected = pageFromUrl();
  current = selected;
  const groups = new Map();
  for (const [key, [label, group]] of pages) {
    if (!allowed(key)) continue;
    const links = groups.get(group) ?? [];
    links.push('<a href="#' + key + '"' + (key === selected ? ' aria-current="page"' : '') + '>' + h(label) + '</a>');
    groups.set(group, links);
  }
  const nav = [...groups].map(([name, links]) => '<div class="nav-group"><small>' + h(name) + '</small>' + links.join('') + '</div>').join('');
  const companies = app.user.companies.map(c => option(c.id, c.name, app.user.companyId)).join('');
  root.innerHTML = '<div class="shell"><aside class="sidebar"><a class="brand" href="#' +
    (app.user.role === 'Buyer' ? 'buyer' : 'overview') + '">' + brands + '</a><nav aria-label="HAPZO modules">' + nav +
    '</nav></aside><main class="main"><header class="topbar"><div><strong>' + h(app.data.settings.name) +
    '</strong><span class="muted">' + h(app.user.name + ' · ' + app.user.role) + '</span></div><div class="workspace">' +
    '<select id="company-select" aria-label="Active company">' + companies + '</select>' +
    button('Reload', 'data-reload="yes"') + button('Sign out', 'data-logout="yes"') +
    '</div></header><div id="flash" class="flash" role="status" hidden></div><div class="container" id="workspace-page">' +
    pages.get(selected)[2](app, routeParams()) + '</div></main></div>';
  for (const editor of root.querySelectorAll('[data-fabric-editor]')) refreshFabricEditor(editor, app);
  const settlement = root.querySelector('form[data-form="account-settle"]');
  if (settlement) finance.refreshSettlement(settlement, app);
}

async function showError(error) {
  if (error.code === 'session') {
    app.user = null;
    app.data = null;
    app.local = {};
    render();
  }
  if (['workspace-changed', 'ai-provider-changed', 'po-reader-changed'].includes(error.code)) {
    await load();
  }
  flash(errorText(error), true);
}

function fileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').at(-1));
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function upload(input, companyId, file = input.files[0]) {
  if (!file) return '';
  const bucket = input.dataset.bucket;
  const existing = cachedUploads.get(file);
  if (existing?.companyId === companyId && existing.bucket === bucket) return existing.result;
  if (file.size > 10_000_000) throw new Error('Choose a supported file up to 10 MB.');
  const mime = /\.xlsx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
    file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg');
  const result = fileContent(file).then(content => api('/api/documents', { companyId, bucket, name: file.name, mime, content })).then(doc => doc.id);
  const uploadState = { companyId, bucket, result };
  cachedUploads.set(file, uploadState);
  try { return await result; }
  catch (error) {
    if (cachedUploads.get(file) === uploadState) cachedUploads.delete(file);
    throw error;
  }
}

const poBuyerFields = { newBuyerName: 'name', newBuyerCurrency: 'currency', newBuyerCountry: 'country', newBuyerTax: 'taxId' };

function setPoSuggestion(control, value) {
  if (!control || control.value.trim() || !value) return false;
  control.value = value;
  if (control.value !== value) return false;
  control.dataset.poSuggestion = value;
  return true;
}

function ensureBuyerOption(selector, buyer) {
  if (![...selector.options].some(item => item.value === buyer.id)) {
    selector.insertAdjacentHTML('beforeend', option(buyer.id, buyer.code + ' · ' + buyer.name));
  }
}

function updateGeminiModels(models) {
  if (!app.user?.poAi || !Array.isArray(models)) return;
  const previous = app.user.poAi.models ?? [];
  app.user.poAi.models = models;
  if (models.length === previous.length && models.every(({ id, label, status }, i) =>
    id === previous[i].id && label === previous[i].label && status === previous[i].status)) return;
  for (const field of root.querySelectorAll('select[name="geminiModel"]')) {
    field.innerHTML = geminiModelOptions(models, field.value);
  }
}

async function readWithGeminiNotice(path, payload, form, isCurrent = () => form.isConnected && app.user?.companyId === payload.companyId) {
  if (payload.provider !== 'gemini') return api(path, payload);
  const companyId = payload.companyId;
  const aiRequestId = crypto.randomUUID();
  const statusUrl = '/api/gemini-models?request=' + aiRequestId;
  const notice = form.querySelector('[data-gemini-notice]');
  const announce = (message = '') => {
    if (!notice || !isCurrent() || notice.textContent === message) return;
    notice.textContent = message;
    notice.hidden = !message;
  };
  announce();
  let polling = false;
  let finished = false;
  const timer = setInterval(async () => {
    if (polling || !isCurrent()) return;
    polling = true;
    try {
      const { models, retry } = await api(statusUrl);
      if (finished || !isCurrent()) return;
      updateGeminiModels(models);
      if (retry) announce(geminiRetryMessage(retry, true));
    } catch { /* The document read can finish while status is unavailable. */ }
    finally { polling = false; }
  }, 1500);
  try {
    const result = await api(path, { ...payload, aiRequestId });
    if (result.retry) announce(geminiRetryMessage(result.retry));
    return result;
  } catch (error) {
    announce(error.retry ? geminiRetryMessage(error.retry) : '');
    throw error;
  } finally {
    finished = true;
    clearInterval(timer);
    if (app.user?.companyId === companyId) {
      api('/api/gemini-models').then(({ models }) => {
        if (app.user?.companyId === companyId) updateGeminiModels(models);
      }).catch(() => {});
    }
  }
}

async function readUploadedBuyer(form, payload, isCurrent) {
  const status = form.querySelector('[data-po-buyer-status]');
  if (!status || !app.user.poAi?.geminiReady) return;
  status.hidden = false;
  status.textContent = 'Gemini is identifying the buyer…';
  try {
    const { buyer, mapping } = await readWithGeminiNotice('/api/po-buyer', {
      ...payload, provider: 'gemini', geminiModel: form.elements.geminiModel?.value,
    }, form, isCurrent);
    if (!isCurrent()) return;
    status.title = buyer.source || '';
    const selector = form.elements.buyerId;
    if (mapping.status === 'matched') {
      const [master] = mapping.candidates;
      if (![...selector.options].some(item => item.value === master.id)) await load(false);
      if (!isCurrent()) return;
      ensureBuyerOption(selector, master);
      const selected = setPoSuggestion(selector, master.id);
      status.textContent = selected || selector.value === master.id ? 'Gemini matched ' + master.name + ' in Company masters.' :
        'Gemini matched ' + master.name + '. The form keeps the buyer you selected.';
      return;
    }
    if (mapping.status === 'ambiguous') {
      status.textContent = 'Several buyer masters match. Choose the correct buyer for this PO.';
      return;
    }
    if (buyer.name) {
      status.textContent = 'Gemini read ' + buyer.name + '. Review the details to add the buyer here.';
      for (const [field, key] of Object.entries(poBuyerFields)) setPoSuggestion(form.elements[field], buyer[key]);
      if (!selector.value) form.querySelector('[data-new-po-buyer]').open = true;
    } else status.textContent = 'Gemini could not identify a buyer. Select or add the buyer from the PO.';
  } catch (error) {
    if (isCurrent()) status.textContent = errorText(error);
  }
}

async function readUploadedPoNumber(form, payload, isCurrent) {
  const status = form.querySelector('[data-po-number-status]');
  try {
    const result = await api('/api/po-number', { ...payload, poNumberReader: form.elements.poNumberReader.value });
    if (!isCurrent()) return;
    status.textContent = garments.poNumberMessage(result);
    if (result.status === 'matched') setPoSuggestion(form.elements.po, result.value);
  } catch (error) {
    if (isCurrent()) status.textContent = errorText(error);
  }
}

function showPoImport(result) {
  app.local.poImport = result;
  if (current !== 'tech-pack') return go('tech-pack?import=1');
  render();
  root.querySelector('form[data-form="' + PO_IMPORT_ACTION + '"]')?.scrollIntoView({ block: 'start' });
}

async function readPoUpload(input) {
  const form = input.form;
  const status = form.querySelector('[data-po-number-status]');
  const buyerStatus = form.querySelector('[data-po-buyer-status]');
  const geminiNotice = form.querySelector('[data-gemini-notice]');
  const file = input.files[0];
  const companyId = app.user?.companyId;
  const isCurrent = () => input.isConnected && input.files[0] === file && app.user?.companyId === companyId;
  for (const control of form.querySelectorAll('[data-po-suggestion]')) {
    if (control.value === control.dataset.poSuggestion) control.value = '';
    delete control.dataset.poSuggestion;
  }
  status.hidden = !file;
  if (buyerStatus) {
    buyerStatus.hidden = true;
    buyerStatus.title = '';
  }
  if (geminiNotice) {
    geminiNotice.hidden = true;
    geminiNotice.textContent = '';
  }
  if (!file) return;
  if (/\.xlsx$/i.test(file.name)) {
    status.textContent = garments.poNumberMessage({ status: 'unsupported' });
    return;
  }
  status.textContent = 'Reading the buyer PO number…';
  try {
    const document = await upload(input, companyId, file);
    if (!isCurrent()) return;
    const payload = { companyId, document };
    if (form.dataset.form === 'buyer-order' && garments.autoReadBuyerPo(app)) {
      status.textContent = 'Reading the order, articles and size quantities…';
      try {
        const result = await readWithGeminiNotice('/api/po-ai-extract', { ...payload, provider: 'gemini',
          geminiModel: form.elements.geminiModel?.value, poNumberReader: form.elements.poNumberReader.value }, form, isCurrent);
        if (isCurrent()) showPoImport(result);
      } catch (error) {
        if (isCurrent()) {
          buyerStatus.hidden = false;
          buyerStatus.textContent = errorText(error);
          await readUploadedPoNumber(form, payload, isCurrent);
        }
      }
      return;
    }
    await Promise.all([readUploadedPoNumber(form, payload, isCurrent), readUploadedBuyer(form, payload, isCurrent)]);
  } catch (error) {
    if (isCurrent()) status.textContent = errorText(error);
  }
}

async function saveBuyerFromPo(button) {
  const form = button.form;
  const companyId = app.user.companyId;
  const elements = form.elements;
  const attachment = elements.document?.files?.[0];
  button.disabled = true;
  try {
    const result = await submitAction(button, 'po-buyer-create', {
      buyer: elements.newBuyerName.value, currency: elements.newBuyerCurrency.value,
      country: elements.newBuyerCountry.value, gstin: elements.newBuyerTax.value,
    }, false);
    if (!form.isConnected || companyId !== app.user?.companyId || elements.document?.files?.[0] !== attachment) return;
    const buyer = ref(app.data.parties, result.id);
    if (!buyer) return;
    ensureBuyerOption(elements.buyerId, buyer);
    elements.buyerId.value = buyer.id;
    delete elements.buyerId.dataset.poSuggestion;
    const newBuyer = form.querySelector('[data-new-po-buyer]');
    newBuyer.open = false;
    if (form.dataset.form === PO_IMPORT_ACTION) newBuyer.hidden = true;
    const status = form.querySelector('[data-po-buyer-status]');
    status.hidden = false;
    status.textContent = 'Added ' + buyer.name + ' to Company masters and selected it for this PO.';
  } finally {
    button.disabled = false;
  }
}

async function fieldsOf(form) {
  const data = Object.fromEntries(new FormData(form));
  const companyId = app.user?.companyId;
  const attachments = [...form.querySelectorAll('input[data-bucket]')].map(input => [input, [...input.files]]);
  for (const [input, files] of attachments) {
    const ids = [];
    for (const file of files) ids.push(await upload(input, companyId, file));
    data[input.name] = ids.join(',');
  }
  return data;
}

async function readFabricTechPacks(form, companyId) {
  const local = app.local;
  if (local.fabricReading) throw new Error('A tech pack read is already running for this workspace.');
  const input = form.elements.document;
  const files = [...input.files];
  if (!files.length) throw new Error('Choose at least one garment tech pack.');
  const provider = form.elements.provider.value;
  let geminiModel = form.elements.geminiModel?.value;
  const status = form.querySelector('[data-fabric-read-status]');
  const currentWorkspace = () => app.local === local && app.user?.companyId === companyId;
  const items = [];
  input.disabled = true;
  local.fabricReading = true;
  status.hidden = false;
  try {
    for (const [index, file] of files.entries()) {
      if (!currentWorkspace()) return;
      status.textContent = 'Reading ' + (index + 1) + ' of ' + files.length + ' files · ' + file.name;
      try {
        const document = await upload(input, companyId, file);
        if (!currentWorkspace()) return;
        const result = await readWithGeminiNotice('/api/fabric-ai-extract', { companyId, document, provider, geminiModel }, form);
        items.push({ result });
        if (geminiModel && result.retry) geminiModel = result.model;
      } catch (error) {
        items.push({ filename: file.name, error: errorText(error), retry: error.retry });
        if (['session', 'workspace-changed', 'ai-provider-changed'].includes(error.code)) throw error;
        if (['ai-busy', 'ai-key', 'ai-quota'].includes(error.code)) break;
      }
    }
  } finally {
    delete local.fabricReading;
    input.disabled = false;
    if (currentWorkspace()) {
      const count = items.filter(item => item.result).length;
      local.fabricTechPacks = count ? items : [...(local.fabricTechPacks ?? []).filter(item => item.result), ...items];
      const output = root.querySelector('[data-fabric-tech-pack-review]');
      if (output) output.innerHTML = fabricTechPackReview(local.fabricTechPacks);
      const notice = form.querySelector('[data-gemini-notice]');
      if (notice) notice.hidden = true;
      const progress = root.querySelector('[data-fabric-read-status]');
      if (progress) {
        progress.hidden = false;
        progress.textContent = 'Read ' + count + ' of ' + files.length + (files.length === 1 ? ' file.' : ' files.');
      }
    }
  }
}

async function submitAction(element, action, input, renderPage = true) {
  const companyId = app.user.companyId;
  const previous = pending.get(element);
  const signature = JSON.stringify(input);
  const requestId = previous?.action === action && previous.signature === signature ? previous.id : crypto.randomUUID();
  pending.set(element, { action, signature, id: requestId });
  try {
    const result = await signed('/api/actions', { revision: app.data.revision, requestId, action, input });
    pending.delete(element);
    if (action === 'passport') app.local.passport = result.id;
    if (action === 'dispatch') app.local.shipItems = '';
    if (action === PO_IMPORT_ACTION && app.user?.companyId === companyId) delete app.local.poImport;
    await load(renderPage);
    if (action === PO_IMPORT_ACTION) {
      if (app.user?.companyId === companyId) go(garments.garmentHash(companyId, result.id));
    }
    else if (action === 'wash-load' && app.user?.companyId === companyId) go('washing?batch=' + encodeURIComponent(result.id));
    else if (action === 'finish-open' && app.user?.companyId === companyId) go('fabric-finishing?batch=' + encodeURIComponent(result.id));
    else if (action === 'print-issue' && app.user?.companyId === companyId) {
      const b = ref(app.data.processBatches, result.id);
      go((b?.process === 'Embroidery' ? 'embroidery' : 'printing') + '?batch=' + encodeURIComponent(result.id));
    }
    else if (['cut-lay', 'garment-issue'].includes(action) && app.user?.companyId === companyId) {
      const b = ref(app.data.processBatches, result.id);
      if (b) go(garmentProduction.garmentBatchHash(b.process, b.id));
    }
    else if (action === 'pack-carton' && app.user?.companyId === companyId) go('trace?lot=' + encodeURIComponent(result.id));
    else if (action === 'master-delete') flash('Master record deleted.');
    else flash(action === 'garment-import-draft' ? 'Saved changes to the editable AI draft.' : 'Posted ' + result.id + '.');
    return result;
  } catch (error) {
    if (error instanceof ApiError) pending.delete(element);
    if (error.code === 'stale') await load(false);
    throw error;
  }
}

function showDialog(content, print = false, closeLabel = 'Close') {
  if (dialog.open) dialog.close();
  dialog.innerHTML = '<div class="toolbar">' + (print ? button('Print', 'data-print="yes"') : '') +
    button(closeLabel, 'data-close="yes"') + '</div>' + content;
  dialog.showModal();
}

function findLot(query) {
  const input = String(query || '').trim();
  if (!input) throw new Error('Enter a lot ID or scan a QR label.');
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (![window.location.origin, app.user.publishedOrigin].includes(url.origin) || !/^\/p\/[\w-]{32}$/.test(url.pathname)) {
      throw new Error('This QR is outside the configured HAPZO address.');
    }
    showDialog('<p><a href="' + h(url.origin + url.pathname) + '" target="_blank" rel="noopener">Open published passport</a></p>');
    return;
  }
  const lot = input.replace(/^HZ:LOT:/i, '');
  app.local.trace = app.data.lots.find(l => norm(l.id) === norm(lot))?.id || lot;
  if (dialog.open) dialog.close();
  go('trace?lot=' + encodeURIComponent(app.local.trace));
}

async function switchCompany(companyId) {
  const result = await api('/api/switch', { companyId });
  if (dialog.open) dialog.close();
  app.user = result.user;
  app.data = result.data;
  app.local = {};
  go(app.user.role === 'Buyer' ? 'buyer' : 'overview');
  render();
}

async function createCompany(input) {
  const result = await signed('/api/company', input);
  await switchCompany(result.id);
  flash('Opened ' + app.data.settings.name + '.');
}

root.addEventListener('submit', async e => {
  const el = e.target.closest('form[data-form]');
  if (!el) return;
  e.preventDefault();
  if (el.dataset.busy) return;
  el.dataset.busy = 'yes';
  const goButton = e.submitter || el.querySelector('button:not([type="button"])');
  if (goButton) goButton.disabled = true;
  flash();
  const action = el.dataset.form;
  const reading = ['read-buyer-po', 'read-fabric-tech-pack'].includes(action);
  const companyId = app.user?.companyId;
  const buttonText = goButton?.textContent;
  try {
    if (reading) {
      if (!app.user.poAi?.ready) throw new Error('Configure the Gemini key in HAPZO’s .env file and restart HAPZO.');
      if (goButton) goButton.textContent = action === 'read-buyer-po' ? 'Reading buyer PO…' : 'Reading tech packs…';
    }
    if (action === 'read-fabric-tech-pack') return await readFabricTechPacks(el, companyId);
    const input = await fieldsOf(el);
    if (action === 'setup' || action === 'login') {
      await api('/api/' + action, input);
      app.initialized = true;
      await load();
      return;
    }
    if (action === 'lookup') return findLot(input.query);
    if (action === 'tech-pack-filter') return go(garments.garmentHash(app.user.companyId, input.lineId));
    if (action === 'read-buyer-po') {
      if (app.user?.companyId !== companyId) return;
      const result = await readWithGeminiNotice('/api/po-ai-extract', { ...input, companyId }, el);
      if (app.user?.companyId !== companyId) return;
      if (current === 'tech-pack') showPoImport(result);
      else app.local.poImport = result;
      return;
    }
    if (action === PO_IMPORT_ACTION) return await submitAction(el, action, garments.poImportInput(el, input, app.local.poImport));
    if (action === 'garment-spec') {
      const posting = e.submitter?.hasAttribute('data-tech-save-draft') ? 'garment-import-draft' : action;
      return await submitAction(el, posting, { lineId: input.lineId, specRev: input.specRev, draftToken: input.draftToken || '',
        notes: input.techApprovalNote || '', document: input.document, techPack: JSON.stringify(garments.techPackInput(el)) });
    }
    if (action === 'quality') input.techInspection = garments.techInspectionInput(el);
    if (action === 'new-company') return await createCompany(input);
    if (action === 'member') {
      await signed('/api/members', input);
      await load();
      return flash('Workspace membership saved.');
    }
    if (action === 'password') {
      await signed('/api/password', input);
      el.reset();
      return flash('Password changed.');
    }
    if (action === 'component-route') return await submitAction(el, action, dyeing.routeInput(input));
    if (['dye-reverse', 'gin-reverse', 'blend-reverse', 'spin-reverse', 'knit-reverse', 'warp-reverse', 'size-reverse', 'loom-reverse', 'fdye-reverse'].includes(action)) return await submitAction(el, action, dyeing.reverseInput(input));
    if (action === 'blend-issue') {
      const result = await submitAction(el, action, input);
      app.local.blendIssueDraft = '';
      render();
      flash('Posted ' + result.id + '.');
      return result;
    }
    if (action === 'stock-search') app.local.stockSearch = input.search;
    else if (action === 'fibre-scan') {
      app.local.fibreScan = String(input.query || '').trim();
      app.local.fibreTarget = input.target || '';
    } else if (action === 'fd-job') app.local.fdJob = input.job || '';
    else if (action === 'fd-history') app.local.fdLot = String(input.lotId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'weave-trace') app.local.weaveRoll = String(input.rollId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'weave-history') app.local.weaveLot = String(input.lotId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'knit-trace') app.local.knitRoll = String(input.rollId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'knit-history') app.local.knitLot = String(input.lotId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'yarn-scan') app.local.yarnScan = String(input.query || '').trim();
    else if (action === 'spin-history') app.local.spinLot = String(input.lotId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'fibre-history') app.local.fibreLot = String(input.lotId || '').trim().replace(/^HZ:LOT:/i, '');
    else if (action === 'dye-history') {
      app.local.dyeLot = String(input.lotId || '').trim().replace(/^HZ:LOT:/i, '');
      return go('yarn-dyeing?tab=history' + (input.batchView ? '&batch=' + encodeURIComponent(input.batchView) : ''));
    }
    else if (action === 'cost-search') app.local.costLot = input.lotId;
    else if (['report-filter', 'ledger-filter', 'day-book-filter'].includes(action)) {
      if (!validDate(input.end) || input.start && (!validDate(input.start) || input.start > input.end)) throw new Error('Enter a valid report period.');
      if (action === 'ledger-filter') {
        app.local.ledgerPeriod = input;
        return go(finance.ledgerHash(input.ledger));
      }
      if (action === 'day-book-filter') app.local.dayPeriod = input;
      else app.local.period = input;
    } else return await submitAction(el, action, finance.accountingInput(el, input));
    render();
  } catch (err) { await showError(err); }
  finally {
    if (goButton) {
      goButton.disabled = false;
      if (reading) goButton.textContent = buttonText;
    }
    delete el.dataset.busy;
  }
});

function downloadCsv(csv, filename = 'HAPZO-voucher-lines.csv') {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const detailsBy = {
  line: ['lines', operations.orderLineDetail],
  shipment: ['shipments', operations.shipmentDetail],
  invoice: ['invoices', finance.invoiceDetail],
  workOrder: ['workOrders', operations.workDetail],
  voucher: ['vouchers', finance.voucherDetail],
  fabricReport: ['events', fabricReportDetail],
  techInspection: ['events', garments.garmentInspectionDetail],
};
async function analyse(button) {
  const el = button.closest('form');
  const inputs = [...el.querySelectorAll('input[data-bucket="evidence"]')];
  if (!inputs.some(input => input.files.length)) throw new Error('Choose the certificate or annex files first.');
  const output = el.querySelector('[data-analysis]');
  output.innerHTML = note('Reading the certificate and annexes on this computer…');
  button.disabled = true;
  try {
    const companyId = app.user.companyId;
    const results = [];
    const scopeLists = { scopeText: [], scopeRefs: [], operations: [], materials: [] };
    const analysisFlags = [];
    const labels = { scheme: 'Programme', programmeVersion: 'Version', kind: 'Evidence type', number: 'Reference', issuer: 'Issuer',
      party: 'Holder', site: 'Facility', issue: 'Issue date', from: 'Valid from', until: 'Expiry', operations: 'Operations',
      materials: 'Materials', criteria: 'Criteria', scopeText: 'Scope', scopeRefs: 'Exact scope codes',
      txSeller: 'Seller', txBuyer: 'Buyer', txShipment: 'Shipment', txMaterial: 'Material code' };
    for (const input of inputs) for (const file of input.files) {
      const doc = await upload(input, companyId, file);
      const result = await api('/api/certificate-analysis', { companyId, document: doc });
      const warnings = [...result.warnings];
      const master = ref(app.data.parties, el.elements.partyId.value);
      const picks = [];
      for (const [key, suggestion] of Object.entries(result.suggestions)) {
        const { value, page } = suggestion;
        const target = el.elements.namedItem(key);
        const selected = key === 'party' && master ? master.name : target?.value;
        if ((key === 'party' || key === 'site') && selected && !same(selected, value)) {
          warnings.push((labels[key] || key) + ' on page ' + page + ' differs from the selected record. Confirm the match.');
        }
        if (Object.hasOwn(scopeLists, key)) scopeLists[key].push(value);
        else if (target && !target.value && (target.tagName !== 'SELECT' || [...target.options].some(option => option.value === value))) target.value = value;
        picks.push([h(labels[key] || key), h(value), h((suggestion.pages ?? [page]).join(', '))]);
      }
      const missing = result.annexExpected && !el.elements.annex.files.length;
      if (missing) {
        el.elements.annexRequired.checked = true;
        warnings.push('This document references an annex. Confirm the complete scope and add the annex before verification.');
      }
      analysisFlags.push(...warnings.map(warning => file.name + ' · ' + warning));
      const listing = table(['Suggested field', 'Value', 'Source page'], picks, 'No labelled fields were matched. Review the extracted pages.');
      results.push(details(file.name, listing + warnings.map(warning => note(warning, true)).join('') +
        result.pages.map(p => details('Page ' + p.page + ' · ' + p.method, '<pre>' + h(p.text) + '</pre>')).join(''), true));
    }
    for (const [key, values] of Object.entries(scopeLists)) {
      if (el.elements[key].value) continue;
      const separator = key === 'operations' || key === 'materials' ? ', ' : '\n';
      el.elements[key].value = [...new Set(values.flatMap(value => value.split(separator)))].join(separator).slice(0, 7900);
    }
    el.elements.analysisWarnings.value = analysisFlags.join('\n').slice(0, 7900);
    output.innerHTML = results.join('');
  } catch (err) {
    output.innerHTML = note(errorText(err), true);
    throw err;
  } finally { button.disabled = false; }
}

function decodeFrame(source, width, height) {
  if (!window.jsQR) throw new Error('The QR reader did not load. Reload HAPZO or enter the printed lot ID.');
  const scale = Math.min(1, 1300 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data;
}

async function camera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('The camera is unavailable at this address. Use a QR image or a scanner.');
  showDialog('<h2>Scan a HAPZO label</h2><p class="muted">Hold a single QR inside the camera preview.</p><video aria-label="QR camera preview" autoplay playsinline muted></video><p id="scan-status" role="status"></p>');
  const video = dialog.querySelector('video');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  if (!dialog.open || !video.isConnected) {
    stream.getTracks().forEach(t => t.stop());
    return;
  }
  scanStream = stream;
  video.srcObject = stream;
  await video.play();
  const detect = () => {
    if (scanStream !== stream || !video.isConnected) return;
    try {
      const result = video.videoWidth ? decodeFrame(video, video.videoWidth, video.videoHeight) : '';
      if (result) {
        findLot(result);
        return;
      }
    } catch (err) {
      const status = dialog.querySelector('#scan-status');
      if (status) status.textContent = err.message;
    }
    setTimeout(detect, 240);
  };
  detect();
}

dialog.addEventListener('close', () => {
  if (scanStream) scanStream.getTracks().forEach(t => t.stop());
  scanStream = null;
});

document.addEventListener('click', async e => {
  const flowLink = e.target.closest('a[data-order-flow]');
  if (flowLink) {
    if (dialog.open) dialog.close();
    if (flowLink.classList.contains('po-flow-card') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      const narrow = window.matchMedia('(max-width: 760px)').matches;
      if (narrow && flowLink.hash === window.location.hash) {
        e.preventDefault();
        document.querySelector('#flow-phase-title')?.focus({ preventScroll: true });
        document.querySelector('.po-flow-selection')?.scrollIntoView({ block: 'start' });
      } else if (flowLink.hash !== window.location.hash) {
        app.local.flowFocus = narrow ? '#flow-phase-title' : '.po-flow-card[aria-current="step"]';
      }
    }
    return;
  }
  const clicked = e.target.closest('button');
  if (!clicked || !app.user) return;
  const d = clicked.dataset;
  try {
    if (d.logout) {
      await signed('/api/logout');
      app.user = null;
      app.data = null;
      app.local = {};
      window.location.hash = '';
      return render();
    }
    if (d.reload) { await load(); return flash('Workspace updated.'); }
    if (d.flowTop) {
      document.querySelector('.po-flow-card[aria-current="step"]')?.focus({ preventScroll: true });
      return document.querySelector('.po-flow-chart')?.scrollIntoView({ block: 'start' });
    }
    if (d.demo) return await createCompany({ name: 'HAPZO Training Mill', demo: 'yes' });
    if (d.close) return dialog.close();
    if (d.print) {
      document.body.classList.add('printing');
      try { window.print(); } finally { document.body.classList.remove('printing'); }
      return;
    }
    if (d.lot) return findLot(d.lot);
    if (d.blendAdd) {
      fibreUi.addToBlendDraft(app, d.blendAdd);
      return go('fibre?tab=blend' + (app.local.fibreTarget ? '&batch=' + encodeURIComponent(app.local.fibreTarget) : ''));
    }
    if (d.fibreBatch) {
      const batch = ref(app.data.processBatches, d.fibreBatch);
      return go((batch?.process === 'Yarn dyeing' ? 'yarn-dyeing?tab=history' : batch?.process === 'Ginning' ? 'fibre?tab=gin' : 'fibre?tab=blend') + '&batch=' + encodeURIComponent(d.fibreBatch));
    }
    if (d.camera) return await camera();
    if (d.analyse) return await analyse(clicked);
    if (d.shipLot) {
      const lot = ref(app.data.lots, d.shipLot);
      const lines = lot.allocationBalance.map(a => [lot.id, a.lineId, a.qty].join(','));
      const draft = document.querySelector('form[data-form="dispatch"] textarea[name="items"]');
      for (const line of lines) {
        if (!draft.value.split('\n').includes(line)) draft.value = [draft.value.trim(), line].filter(Boolean).join('\n');
      }
      draft.closest('details').open = true;
      draft.focus();
      return;
    }
    if (d.passport) {
      app.local.passport = d.passport;
      app.local.focusPassport = true;
      const target = 'passports?draft=' + encodeURIComponent(d.passport);
      if (location.hash !== '#' + target) return go(target);
      return document.querySelector('#passport-section')?.scrollIntoView({ block: 'start' });
    }
    if (d.labelLot || d.labelPass) {
      const lot = ref(app.data.lots, d.labelLot);
      const p = ref(app.data.passports, d.labelPass);
      const params = new URLSearchParams(lot ? { lot: lot.id } : { passport: p.id });
      showDialog('<h2>' + h(lot ? lot.id + ' · ' + lot.material : p.lotId + ' · Digital Product Passport') + '</h2>' +
        '<img class="label-image" alt="QR for ' + h(lot?.id || p.lotId) + '" src="/api/qr?' + h(params.toString()) + '">' +
        '<p><code>' + h(lot ? 'HZ:LOT:' + lot.id : app.user.publishedOrigin + '/p/' + p.token) + '</code></p>', true);
      return;
    }
    if (d.addLedgerLine) return finance.addLedgerLine(clicked.closest('form'));
    if (d.createPoBuyer) return await saveBuyerFromPo(clicked);
    if (d.deleteMaster) return showDialog(operations.masterDeletePrompt(app, d.deleteMaster, d.masterId), false, 'Cancel');
    if (d.confirmDeleteMaster) {
      clicked.disabled = true;
      try {
        await submitAction(clicked, 'master-delete', { kind: d.confirmDeleteMaster, id: d.masterId });
      } finally {
        clicked.disabled = false;
        if (clicked.isConnected && dialog.open) dialog.close();
      }
      return;
    }
    if (d.loadFabricComponent) {
      const selection = clicked.closest('[data-fabric-tech-pack-review]').querySelector('[name="fabricComponent"]').value;
      const [fileIndex, fabricIndex] = selection.split(':').map(Number);
      const result = app.local.fabricTechPacks?.[fileIndex]?.result;
      if (!result?.fabrics[fabricIndex]) throw new Error('Choose a fabric component to load.');
      return loadFabricCalculator(root.querySelector('[data-fabric-calculator]'), result, fabricIndex, app);
    }
    if (d.clearPoImport) {
      delete app.local.poImport;
      return go('tech-pack?import=1');
    }
    if (d.techAdd) return garments.addTechPackRow(clicked.closest('form'), d.techAdd, app);
    if (d.techRemove) return clicked.closest('[data-tech-row]').remove();
    if (d.techPreview) return garments.previewGarmentPack(clicked.closest('form'), app);
    if (d.printTech) return showDialog(garments.printableGarmentPack(app, d.printTech, d.techRevision), true);
    if (d.voucherExport) return downloadCsv(finance.voucherCsv(app, d.voucherExport),
      d.voucherExport === 'day-book' ? 'HAPZO-day-book.csv' : 'HAPZO-voucher-lines.csv');
    if (d.ledgerExport) return downloadCsv(finance.ledgerCsv(app, d.ledgerExport), 'HAPZO-ledger-statement.csv');
    for (const [key, [collection, screen]] of Object.entries(detailsBy)) {
      if (!d[key]) continue;
      const row = ref(app.data[collection] ?? [], d[key]);
      if (row) showDialog(screen(app, row), ['invoice', 'shipment', 'workOrder', 'voucher'].includes(key));
      return;
    }
  } catch (err) { await showError(err); }
});

document.addEventListener('input', e => {
  if (e.target.dataset.billId) finance.showAppliedTotal(e.target.form);
  if (e.target.dataset.poSuggestion) delete e.target.dataset.poSuggestion;
  const target = e.target;
  const editor = target.closest('[data-fabric-editor]') ??
    (['yarnSystems', 'yarnRepeatCells'].includes(target.name) ? target.closest('[data-tech-row="fabrics"]')?.querySelector('[data-fabric-editor]') : null);
  if (editor) refreshFabricEditor(editor, app);
});

document.addEventListener('change', async e => {
  const el = e.target;
  try {
    if (el.id === 'company-select') return await switchCompany(el.value);
    if (el.name === 'document' && el.dataset.bucket === 'buyer-po' && el.form?.querySelector('[data-po-number-status]')) return await readPoUpload(el);
    if (el.name === 'buyerId' && el.form?.dataset.form === PO_IMPORT_ACTION) {
      const newBuyer = el.form.querySelector('[data-new-po-buyer]');
      if (newBuyer) newBuyer.hidden = Boolean(el.value);
      el.form.querySelector('[data-po-buyer-status]').hidden = true;
    }
    if (el.form?.dataset.form === 'account-settle' && ['settlementLedger', 'date'].includes(el.name)) finance.refreshSettlement(el.form, app);
    if (el.dataset.hook === 'fabric-lot') {
      garments.refreshGarmentInspection(el.form, app, true);
      return selectFabricLot(el, app);
    }
    if (el.form?.dataset.form === 'quality' && el.name === 'techTarget') {
      garments.refreshGarmentInspection(el.form, app);
      return selectFabricLot(el.form.elements.lotId, app);
    }
    if (el.dataset.hook === 'tech-work-line') {
      const line = ref(app.data.lines, el.value);
      el.form.elements.techComponent.innerHTML = option('', 'Use product or stock item') +
        (line?.garmentSpec?.fabrics ?? []).map(fabric => option(fabric.code, fabric.code + ' · ' + fabric.role)).join('');
    }
    if (el.dataset.hook === 'wash-work') return washUi.selectWashWork(el.form, app.data);
    if (el.dataset.hook === 'print-work') return printUi.selectPrintWork(el.form, app.data);
    if (el.dataset.hook === 'print-artwork') {
      const artwork = ref(app.data.processSetups, el.value);
      el.form.elements.unit.value = artwork?.stage === 'Fabric printing' ? 'm' : 'pcs';
      return;
    }
    if (el.dataset.hook === 'finish-work') {
      const work = ref(app.data.workOrders, el.value);
      if (work?.finishPlanId) el.form.elements.recipeId.value = work.finishPlanId;
      return;
    }
    if (el.dataset.hook === 'process-input-lot' && el.value) {
      const inputs = el.form.elements.inputs;
      inputs.value = (inputs.value.trimEnd() ? inputs.value.trimEnd() + '\n' : '') + el.value + ',';
      el.value = '';
      inputs.focus();
      inputs.setSelectionRange(inputs.value.length, inputs.value.length);
    }
    if (el.dataset.hook === 'evidence-source') {
      const row = ref(app.data.evidence, el.value);
      el.form.querySelector('[data-evidence-source]').innerHTML = row ? compliance.evidenceSourceLinks(row.scheme, row.scopeType) +
        (row.analysisWarnings ? '<p class="note warn evidence-excerpt">' + h(row.analysisWarnings) + '</p>' : '') : '';
    }
    if (el.name === 'route') {
      const editor = el.form?.querySelector('[data-fabric-editor]');
      if (editor) refreshFabricEditor(editor, app);
    }
    if (el.dataset.hook === 'flow-order' || el.dataset.hook === 'flow-line') {
      const chooseOrder = el.dataset.hook === 'flow-order';
      const params = routeParams();
      const orderId = chooseOrder ? el.value : document.querySelector('select[name="flowOrder"]')?.value;
      const lineId = chooseOrder ? '' : el.value;
      app.local.flowFocus = 'select[name="' + (chooseOrder ? 'flowOrder' : 'flowLine') + '"]';
      return go(operations.orderFlowHash(app.user.companyId, orderId, lineId, params.get('phase') || '').slice(1));
    }
    if (el.id === 'scanImage' && el.files[0]) {
      const bitmap = await createImageBitmap(el.files[0]);
      try {
        const find = decodeFrame(bitmap, bitmap.width, bitmap.height);
        if (!find) throw new Error('No readable QR found. Try a clear image or type the lot ID.');
        findLot(find);
      } finally { bitmap.close(); el.value = ''; }
      return;
    }
    if (el.dataset.hook === 'revision') {
      app.local.revise = el.value;
      render();
    }
    if (el.dataset.hook === 'purchase') {
      const purchase = ref(app.data.purchases, el.value);
      el.form.elements.purchaseLineId.innerHTML = option('', 'Select…') + (purchase?.lines || []).filter(l => l.received < l.qty).map(l =>
        option(l.id, l.id + ' · ' + l.label + ' · ' + (l.qty - l.received) + ' ' + l.unit + ' open')).join('');
      el.form.elements.purchaseLineId.required = Boolean(purchase);
      if (purchase) el.form.elements.locationId.value = purchase.shipTo;
    }
    if (el.dataset.hook === 'stage') {
      el.form.elements.unit.value = STAGES[el.value]?.count ? 'pcs' : 'kg';
    }
    if (el.dataset.hook === 'work') {
      const work = ref(app.data.workOrders, el.value);
      if (work) el.form.elements.locationId.value = work.locationId;
    }
    if (el.dataset.hook === 'passport-point') {
      const p = ref(app.data.passports, el.form.elements.passportId.value);
      const row = p.points[Number(el.value) - 1];
      if (!row) return;
      for (const key of ['value', 'applicability', 'visibility', 'source', 'reason']) el.form.elements.namedItem(key).value = row[key] || '';
      el.form.elements.verified.checked = row.verified;
    }
  } catch (err) { await showError(err); }
});

window.addEventListener('hashchange', handleRoute);
try {
  const { initialized, user } = await api('/api/session');
  app.initialized = initialized;
  if (user) await load();
  else render();
} catch (error) {
  root.innerHTML = '<main class="login-layout"><section class="paper"><h1>HAPZO Local</h1>' + note(errorText(error), true) + '</section></main>';
}
