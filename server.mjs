import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';
import { Store, DATABASE_PATH } from './src/store.mjs';
import { DomainError, ensure, ref, req as requiredText } from './src/model.mjs';
import { permitted } from './src/actions.mjs';
import { demo } from './src/demo.mjs';
import { analyseEvidence } from './src/certificates.mjs';
import { matchPoBuyer, PO_IMPORT_ACTION, poAnnexIds, poNumberReader } from './src/po-import.mjs';
import { extractBuyerPo, extractFabricTechPack, extractPoBuyer, geminiModels, poAiStatus, setPoAiKey } from './src/po-ai.mjs';
import { inspectPoNumber } from './src/po-number.mjs';

const local = '127.0.0.1';
const port = Number(process.env.HAPZO_PORT || '4380');
ensure(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Choose a port between 1024 and 65535.');
const origin = 'http://' + local + ':' + port;
const publishedOrigin = process.env.HAPZO_PUBLIC_URL ? new URL(process.env.HAPZO_PUBLIC_URL).origin : origin;
ensure(/^https?:\/\//.test(publishedOrigin), 'Use an HTTP or HTTPS origin in HAPZO_PUBLIC_URL.');
const acceptedHosts = new Set([new URL(origin).host, 'localhost:' + port, new URL(publishedOrigin).host]);
const require = createRequire(import.meta.url);
const assets = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/ui.js', ['public/ui.js', 'text/javascript; charset=utf-8']],
  ['/fabric-ui.js', ['public/fabric-ui.js', 'text/javascript; charset=utf-8']],
  ['/garment-ui.js', ['public/garment-ui.js', 'text/javascript; charset=utf-8']],
  ['/pages.js', ['public/pages.js', 'text/javascript; charset=utf-8']],
  ['/finance-ui.js', ['public/finance-ui.js', 'text/javascript; charset=utf-8']],
  ['/compliance-ui.js', ['public/compliance-ui.js', 'text/javascript; charset=utf-8']],
  ['/yarn-dyeing-ui.js', ['public/yarn-dyeing-ui.js', 'text/javascript; charset=utf-8']],
  ['/washing-ui.js', ['public/washing-ui.js', 'text/javascript; charset=utf-8']],
  ['/printing-ui.js', ['public/printing-ui.js', 'text/javascript; charset=utf-8']],
  ['/garment-production-ui.js', ['public/garment-production-ui.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/src/model.mjs', ['src/model.mjs', 'text/javascript; charset=utf-8']],
  ['/src/fabric.mjs', ['src/fabric.mjs', 'text/javascript; charset=utf-8']],
  ['/src/garment.mjs', ['src/garment.mjs', 'text/javascript; charset=utf-8']],
  ['/src/po-import.mjs', ['src/po-import.mjs', 'text/javascript; charset=utf-8']],
  ['/src/po-process.mjs', ['src/po-process.mjs', 'text/javascript; charset=utf-8']],
  ['/src/claim-scope.mjs', ['src/claim-scope.mjs', 'text/javascript; charset=utf-8']],
  ['/src/commerce.mjs', ['src/commerce.mjs', 'text/javascript; charset=utf-8']],
  ['/src/finance.mjs', ['src/finance.mjs', 'text/javascript; charset=utf-8']],
  ['/src/standards.mjs', ['src/standards.mjs', 'text/javascript; charset=utf-8']],
  ['/src/passports.mjs', ['src/passports.mjs', 'text/javascript; charset=utf-8']],
  ['/src/fulfilment.mjs', ['src/fulfilment.mjs', 'text/javascript; charset=utf-8']],
  ['/src/stock.mjs', ['src/stock.mjs', 'text/javascript; charset=utf-8']],
  ['/src/routes.mjs', ['src/routes.mjs', 'text/javascript; charset=utf-8']],
  ['/src/yarn-dyeing.mjs', ['src/yarn-dyeing.mjs', 'text/javascript; charset=utf-8']],
  ['/src/process-batch.mjs', ['src/process-batch.mjs', 'text/javascript; charset=utf-8']],
  ['/src/process-materials.mjs', ['src/process-materials.mjs', 'text/javascript; charset=utf-8']],
  ['/src/printing.mjs', ['src/printing.mjs', 'text/javascript; charset=utf-8']],
  ['/src/fibre.mjs', ['src/fibre.mjs', 'text/javascript; charset=utf-8']],
  ['/src/spinning.mjs', ['src/spinning.mjs', 'text/javascript; charset=utf-8']],
  ['/src/yarn-allocation.mjs', ['src/yarn-allocation.mjs', 'text/javascript; charset=utf-8']],
  ['/src/knitting.mjs', ['src/knitting.mjs', 'text/javascript; charset=utf-8']],
  ['/src/weaving.mjs', ['src/weaving.mjs', 'text/javascript; charset=utf-8']],
  ['/src/fabric-dyeing.mjs', ['src/fabric-dyeing.mjs', 'text/javascript; charset=utf-8']],
  ['/fabric-dyeing-ui.js', ['public/fabric-dyeing-ui.js', 'text/javascript; charset=utf-8']],
  ['/src/fabric-finishing.mjs', ['src/fabric-finishing.mjs', 'text/javascript; charset=utf-8']],
  ['/fabric-finishing-ui.js', ['public/fabric-finishing-ui.js', 'text/javascript; charset=utf-8']],
  ['/weaving-ui.js', ['public/weaving-ui.js', 'text/javascript; charset=utf-8']],
  ['/knitting-ui.js', ['public/knitting-ui.js', 'text/javascript; charset=utf-8']],
  ['/spinning-ui.js', ['public/spinning-ui.js', 'text/javascript; charset=utf-8']],
  ['/process-ui.js', ['public/process-ui.js', 'text/javascript; charset=utf-8']],
  ['/fibre-ui.js', ['public/fibre-ui.js', 'text/javascript; charset=utf-8']],
  ['/qr-reader.js', [require.resolve('jsqr'), 'text/javascript; charset=utf-8']],
]);
const store = new Store();
const attempts = new Map();
const activeImports = new Map();

function readCookie(req) {
  return req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('hapzo_session='))?.slice(14) || '';
}
function sessionCookie(response, req, content, age = 43200) {
  const secure = publishedOrigin.startsWith('https:') && req.headers.host === new URL(publishedOrigin).host;
  response.setHeader('Set-Cookie', 'hapzo_session=' + content + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + (secure ? '; Secure' : ''));
}
function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
}
function reply(res, status, type, data) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(data);
}
function json(res, status, body) { reply(res, status, 'application/json; charset=utf-8', JSON.stringify(body)); }
function sessionInfo(session) {
  const companies = store.companies(session.user_id);
  const actions = permitted(session.role);
  return {
    login: session.login, name: session.display_name, role: session.role, companyId: session.company_id,
    companies, actions, publishedOrigin, ...(actions.includes(PO_IMPORT_ACTION) ? { poAi: poAiStatus(session) } : {}),
  };
}
function configuredPoReader(session, expected) {
  const reader = poNumberReader(store.readState(session.company_id).settings);
  ensure(expected === reader || expected === undefined && reader !== 'hosted-oxr',
    'The buyer PO reader changed. Review the current reader before uploading again.', 409, 'po-reader-changed');
  return reader;
}

function checkPoSession(token, session) {
  const signed = store.session(token);
  ensure(signed && signed.company_id === session.company_id && permitted(signed.role).includes(PO_IMPORT_ACTION),
    'The workspace changed during the document read. Open the original workspace and retry.', 409, 'workspace-changed');
}

async function trackAiRead(session, input, read) {
  const company = session.company_id;
  ensure(!activeImports.has(company), 'An AI document read is already running for this workspace.', 409, 'ai-busy');
  const job = { id: /^[\w-]{12,80}$/.test(input.aiRequestId ?? '') ? input.aiRequestId : '', retry: null };
  activeImports.set(company, job);
  try {
    return await read({ geminiModel: input.geminiModel, onRetry: retry => { job.retry = retry; } });
  } catch (error) {
    if (job.retry && error instanceof DomainError) error.retry = job.retry;
    throw error;
  } finally {
    activeImports.delete(company);
  }
}
async function body(req, limit = 250_000) {
  ensure(req.headers['content-type']?.split(';')[0].trim() === 'application/json', 'Use a JSON request.', 415, 'media-type');
  ensure(!req.headers.origin || [origin, 'http://localhost:' + port, publishedOrigin].includes(req.headers.origin), 'Cross origin posting is not supported.', 403, 'origin');
  if (req.headers['sec-fetch-site']) ensure(['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'Cross origin posting is not supported.', 403, 'origin');
  ensure(Number(req.headers['content-length'] || 0) <= limit, 'Request is too large.', 413, 'size');
  const data = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    ensure(size <= limit, 'Request is too large.', 413, 'size');
    data.push(chunk);
  }
  let result;
  try { result = JSON.parse(Buffer.concat(data).toString('utf8')); } catch { throw new DomainError('Invalid JSON.', 400, 'json'); }
  ensure(result && typeof result === 'object' && !Array.isArray(result), 'Use a JSON object.', 400, 'json');
  return result;
}
function throttle(key) {
  for (const [k, v] of attempts) if (v.until <= Date.now()) attempts.delete(k);
  const count = attempts.get(key) ?? { n: 0, until: Date.now() + 5 * 60 * 1000 };
  ensure(count.n < 25, 'Too many sign-in attempts. Try again in five minutes.', 429, 'rate');
  count.n++;
  attempts.set(key, count);
}
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function passportPage(p) {
  const available = p?.state === 'Published';
  const content = available
    ? '<p class="muted">Batch ' + esc(p.batch) + ' · Version ' + esc(p.version) + ' · ' + esc(p.published) + '</p><h2>' + esc(p.profile) + '</h2><dl class="public-fields">' +
      p.fields.map(f => '<div><dt>' + esc(f.name) + '</dt><dd>' + esc(f.value) + '</dd></div>').join('') + '</dl>'
    : '<p>' + (p ? 'This passport is suspended.' : 'There is no published passport at this address.') + '</p>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>HAPZO Digital Product Passport</title><link rel="stylesheet" href="/style.css"></head><body class="public-page">' +
    '<article class="paper"><div class="brand"><span class="mark">H</span><span>HAPZO</span></div><h1>Digital Product Passport</h1>' + content + '</article></body></html>';
}
function filename(label) {
  return encodeURIComponent(label).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function download(res, name) {
  res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + filename(name));
}

const server = createServer(async (req, res) => {
  headers(res);
  try {
    ensure(acceptedHosts.has(req.headers.host), 'Open the configured HAPZO address.', 403, 'host');
    const url = new URL(req.url, origin);
    const path = url.pathname;
    if (req.method === 'GET' && assets.has(path)) {
      const [file, type] = assets.get(path);
      return reply(res, 200, type, await readFile(file === require.resolve('jsqr') ? file : new URL(file, import.meta.url)));
    }
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { service: 'hapzo-local', ready: true });
    if (req.method === 'GET' && /^\/p\/[\w-]{32}$/.test(path)) {
      const p = store.publicPassport(path.slice(3));
      return reply(res, p ? 200 : 404, 'text/html; charset=utf-8', passportPage(p));
    }
    if (req.method === 'GET' && /^\/api\/public\/[\w-]{32}$/.test(path)) {
      const p = store.publicPassport(path.slice(12));
      return json(res, p ? 200 : 404, p || { state: 'Unpublished' });
    }
    const cookie = readCookie(req);
    let session = store.session(cookie);
    if (req.method === 'GET' && path === '/api/session') {
      return json(res, 200, { initialized: store.initialized(), user: session ? sessionInfo(session) : null });
    }
    if (req.method === 'POST' && ['/api/setup', '/api/login'].includes(path)) {
      const data = await body(req);
      const key = path + ':' + req.socket.remoteAddress;
      throttle(key);
      const signed = path === '/api/setup' ? store.bootstrap(data) : store.signIn(data);
      attempts.delete(key);
      sessionCookie(res, req, signed);
      return json(res, 200, { user: sessionInfo(store.session(signed)) });
    }
    ensure(session, 'Sign in to your HAPZO workspace.', 401, 'session');
    if (req.method === 'GET' && path === '/api/state') {
      return json(res, 200, { user: sessionInfo(session), data: store.view(session) });
    }
    if (req.method === 'GET' && path === '/api/gemini-models') {
      ensure(permitted(session.role).includes(PO_IMPORT_ACTION), 'This action requires the merchandising role.', 403, 'role');
      const job = activeImports.get(session.company_id);
      return json(res, 200, { models: geminiModels(session), retry: job?.id && job.id === url.searchParams.get('request') ? job.retry : null });
    }
    if (req.method === 'GET' && path === '/api/members') return json(res, 200, { members: store.listMembers(session) });
    if (req.method === 'GET' && path === '/api/export') {
      store.requireAdmin(session);
      download(res, 'HAPZO-company-records.json');
      return json(res, 200, { format: 'hapzo-local-data-1', ...store.readState(session.company_id), audit: store.readAudit(session.company_id) });
    }
    if (req.method === 'GET' && /^\/api\/documents\/[\w-]{22}$/.test(path)) {
      const doc = store.ownedDocument(session, path.slice(15));
      download(res, doc.label);
      return reply(res, 200, doc.mime, doc.bytes);
    }
    if (req.method === 'GET' && path === '/api/qr') {
      const state = store.view(session);
      const lotId = url.searchParams.get('lot');
      const passportId = url.searchParams.get('passport');
      let value;
      if (passportId) {
        const p = ref(state.passports, passportId);
        ensure(p?.status === 'Published', 'Published passport not found.', 404, 'not-found');
        value = publishedOrigin + '/p/' + p.token;
      } else {
        const lot = ref(state.lots ?? [], lotId);
        ensure(lot, 'Lot not found.', 404, 'not-found');
        value = 'HZ:LOT:' + lot.id;
      }
      return reply(res, 200, 'image/png', await QRCode.toBuffer(value, { errorCorrectionLevel: 'M', width: 240, margin: 4 }));
    }
    if (req.method === 'POST') {
      const data = await body(req, path === '/api/documents' ? 14_200_000 : undefined);
      session = store.session(cookie);
      ensure(session, 'Sign in to your HAPZO workspace.', 401, 'session');
      if (path === '/api/logout') {
        store.removeSession(cookie);
        sessionCookie(res, req, '', 0);
        return json(res, 200, { ok: true });
      }
      if (path === '/api/switch') {
        store.switchCompany(session, data.companyId);
        const switched = store.session(cookie);
        return json(res, 200, { user: sessionInfo(switched), data: store.view(switched) });
      }
      // A second tab may switch the selected workspace during a document upload.
      ensure(data.companyId === session.company_id, 'The selected workspace changed. Reload before posting.', 409, 'workspace-changed');
      if (path === '/api/actions') return json(res, 200, store.post(session, data));
      if (path === '/api/documents') return json(res, 201, store.addDocument(session, data));
      if (path === '/api/po-ai-key') {
        store.requireAdmin(session);
        ensure([new URL(origin).host, 'localhost:' + port].includes(req.headers.host), 'Configure the AI provider key on this computer at ' + origin + '.', 403, 'host');
        return json(res, 200, { poAi: setPoAiKey(session, data) });
      }
      if (path === '/api/po-number') {
        ensure(permitted(session.role).includes('buyer-order'), 'This action requires the merchandising role.', 403, 'role');
        const reader = configuredPoReader(session, data.poNumberReader);
        const original = store.ownedDocument(session, requiredText(data.document, 'Buyer PO document', 100));
        ensure(original.bucket === 'buyer-po', 'Choose the original buyer PO.');
        const recognition = await inspectPoNumber(original, reader);
        checkPoSession(cookie, session);
        return json(res, 200, recognition);
      }
      if (path === '/api/po-buyer') {
        ensure(permitted(session.role).includes('buyer-order'), 'This action requires the merchandising role.', 403, 'role');
        const original = store.ownedDocument(session, requiredText(data.document, 'Buyer PO document', 100));
        ensure(original.bucket === 'buyer-po', 'Choose the original buyer PO.');
        const result = await trackAiRead(session, data, options => extractPoBuyer(session, original, options));
        checkPoSession(cookie, session);
        return json(res, 200, { ...result, mapping: matchPoBuyer(store.readState(session.company_id).parties, result.buyer) });
      }
      if (path === '/api/po-ai-extract') {
        ensure(permitted(session.role).includes(PO_IMPORT_ACTION), 'This action requires the merchandising role.', 403, 'role');
        const reader = configuredPoReader(session, data.poNumberReader);
        const original = store.ownedDocument(session, requiredText(data.document || data.savedDocument, 'Buyer PO document', 100));
        ensure(original.bucket === 'buyer-po', 'Choose the original buyer PO.');
        const annexes = [];
        const documents = [{ doc: original, name: 'Buyer purchase order' }];
        let bytes = original.bytes.length;
        for (const id of poAnnexIds(data.annex)) {
          const annex = store.ownedDocument(session, requiredText(id, 'Technical annex', 100));
          ensure(annex.bucket === 'tech-pack', 'Choose uploaded technical sheets or annexes.');
          bytes += annex.bytes.length;
          ensure(bytes <= 50_000_000, 'Choose a buyer PO and supporting files up to 50 MB combined.', 413, 'ai-files-size');
          documents.push({ doc: annex, name: 'Buyer technical annex' });
          annexes.push(store.documentMeta(session, annex));
        }
        const extracted = await trackAiRead(session, data, options => extractBuyerPo(session, documents, data.provider, reader, options));
        checkPoSession(cookie, session);
        return json(res, 200, { ...extracted,
          document: store.documentMeta(session, original), annex: annexes[0] ?? null, annexes });
      }
      if (path === '/api/fabric-ai-extract') {
        ensure(permitted(session.role).includes(PO_IMPORT_ACTION), 'This action requires the merchandising role.', 403, 'role');
        const original = store.ownedDocument(session, requiredText(data.document, 'Garment tech pack', 100));
        ensure(original.bucket === 'tech-pack', 'Choose a garment tech pack.');
        const extracted = await trackAiRead(session, data, options => extractFabricTechPack(session, original, data.provider, options));
        checkPoSession(cookie, session);
        return json(res, 200, { ...extracted, document: store.documentMeta(session, original) });
      }
      if (path === '/api/certificate-analysis') {
        ensure(['Admin', 'Compliance'].includes(session.role), 'This action requires the compliance role.', 403, 'role');
        const doc = store.ownedDocument(session, requiredText(data.document, 'Document', 100));
        return json(res, 200, await analyseEvidence(doc));
      }
      if (path === '/api/company') {
        store.requireAdmin(session);
        const cid = store.transaction(() => store.newCompany({ id: session.user_id, login: session.login }, data.name, data.demo === 'yes' ? demo : null));
        return json(res, 201, { id: cid, companies: store.companies(session.user_id) });
      }
      if (path === '/api/members') return json(res, 200, store.assignMember(session, data));
      if (path === '/api/password') {
        sessionCookie(res, req, store.changePassword(session, data));
        return json(res, 200, { ok: true });
      }
    }
    return json(res, 404, { error: 'Page or action not found.' });
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    if (error instanceof DomainError) return json(res, error.status, { error: error.message, code: error.code, retry: error.retry });
    console.error(error);
    return json(res, 500, { error: 'HAPZO could not complete this request. See the local server log.', code: 'internal' });
  }
});

server.requestTimeout = 120_000;
server.listen(port, local, () => {
  console.log('HAPZO Local · ' + origin);
  console.log('Database · ' + DATABASE_PATH);
  if (process.argv.includes('--open')) {
    const browser = process.platform === 'win32'
      ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', origin], { windowsHide: true, detached: true, stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [origin], { detached: true, stdio: 'ignore' });
    browser.on('error', () => console.log('Open ' + origin + ' in your browser.'));
    browser.unref();
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.db.close(); process.exit(0); }));
