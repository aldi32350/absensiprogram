/**
 * Server Node — menjalankan kode .gs dengan tiruan layanan Apps Script
 * (SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, HtmlService).
 * Data disimpan di satu file JSON (DATA_DIR/db.json).
 *
 *   node dev/server.js            → http://localhost:8787 (mode pengembangan, hot reload)
 *   node dev/server.js --reset    → hapus database lokal lalu jalankan
 *
 * Mode produksi (VPS, lihat Dockerfile): NODE_ENV=production
 *   - hanya fungsi publik di src/*.gs yang bisa dipanggil lewat /api (allowlist)
 *   - rute /__dev/* & /__export/* dimatikan, kode .gs dimuat sekali
 *   - penyimpanan atomik + cadangan harian di DATA_DIR/backup (14 hari)
 *   Env: PORT, DATA_DIR, APP_URL (mis. https://absensiprogram.web.id)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 8787);
const SRC = path.join(__dirname, '..', 'src');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const APP_URL = String(process.env.APP_URL || 'http://localhost:' + PORT).replace(/\/+$/, '');
let CURRENT_URL = '';   // alamat halaman yang sedang diminta (domain / alamat cadangan) → dipakai tautan antar-halaman
const MAX_BODY = 4 * 1024 * 1024;   // foto WebP ±160 KB; import data jamaah bisa lebih besar

if (!PROD && process.argv.includes('--reset') && fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- Penyimpanan ---------------- */
let DB = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { sheets: {}, props: {} };
let saveTimer = null;
/** Tulis ke file sementara lalu rename → file tidak pernah setengah tertulis bila server mati mendadak. */
function writeDbNow() {
  clearTimeout(saveTimer); saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, PROD ? JSON.stringify(DB) : JSON.stringify(DB, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeDbNow, 50);
}
/** Cadangan harian db.json (simpan 14 hari terakhir). */
function backupHarian() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    const dir = path.join(DATA_DIR, 'backup'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'db-' + new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) + '.json');
    if (!fs.existsSync(f)) fs.copyFileSync(DB_FILE, f);
    fs.readdirSync(dir).filter(n => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().slice(0, -14)
      .forEach(n => fs.unlinkSync(path.join(dir, n)));
  } catch (e) { console.error('backup gagal:', e.message); }
}
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, () => { try { if (saveTimer) writeDbNow(); } finally { process.exit(0); } }));

/* ---------------- Tiruan Sheets ---------------- */
// Metode yang tidak ditiru (format, lebar kolom, dll.) → no-op yang bisa dirangkai.
function chainable(obj) {
  const p = new Proxy(obj, { get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined; return () => p; } });
  return p;
}
function makeRange(store, sheetName, r, c, nr, nc) {
  const grid = () => store.sheets[sheetName];
  const range = chainable({
    getValues() {
      const g = grid(); const out = [];
      for (let i = 0; i < nr; i++) {
        const row = g[r - 1 + i] || []; const o = [];
        for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
        out.push(o);
      }
      return out;
    },
    setValues(vals) {
      const g = grid();
      for (let i = 0; i < vals.length; i++) {
        const ri = r - 1 + i;
        while (g.length <= ri) g.push([]);
        for (let j = 0; j < vals[i].length; j++) g[ri][c - 1 + j] = vals[i][j];
      }
      store.persist(); return range;
    },
    setValue(v) { return range.setValues([[v]]); },
    getValue() { return range.getValues()[0][0]; },
    clearContent() {
      const g = grid();
      for (let i = 0; i < nr; i++) { const row = g[r - 1 + i]; if (!row) continue; for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; }
      store.persist(); return range;
    }
  });
  return range;
}
function makeSheet(store, name) {
  const sh = chainable({
    getName: () => name,
    setName(n) { store.sheets[n] = store.sheets[name]; delete store.sheets[name]; name = n; store.persist(); return sh; },
    getLastRow() {
      const g = store.sheets[name];
      for (let i = g.length - 1; i >= 0; i--) if ((g[i] || []).some(v => v !== '' && v !== undefined && v !== null)) return i + 1;
      return 0;
    },
    getLastColumn: () => store.sheets[name].reduce((m, r) => { let n = (r || []).length; while (n > 0 && (r[n - 1] === '' || r[n - 1] == null)) n--; return Math.max(m, n); }, 0),
    getMaxColumns: () => 26, getMaxRows: () => Math.max(1000, store.sheets[name].length),
    getRange: (r, c, nr = 1, nc = 1) => makeRange(store, name, r, c, nr, nc),
    deleteRow(r) { store.sheets[name].splice(r - 1, 1); store.persist(); }
  });
  return sh;
}
function makeSpreadsheet(store, id, url) {
  return chainable({
    getId: () => id, getUrl: () => url,
    getSheetByName: n => (store.sheets[n] ? makeSheet(store, n) : null),
    insertSheet(n) { store.sheets[n] = []; store.persist(); return makeSheet(store, n); },
    getSheets: () => Object.keys(store.sheets).map(n => makeSheet(store, n)),
    deleteSheet(sh) { delete store.sheets[sh.getName()]; store.persist(); }
  });
}
const mainStore = { get sheets() { return DB.sheets; }, persist };
const spreadsheet = makeSpreadsheet(mainStore, 'LOCAL', 'file://' + DB_FILE);
const EXPORTS = {};   // spreadsheet hasil SpreadsheetApp.create() — terpisah dari database
function createSpreadsheet(name) {
  const id = 'EXP' + crypto.randomBytes(12).toString('hex');
  const store = { sheets: { Sheet1: [] }, persist() {}, name };
  EXPORTS[id] = store;
  return makeSpreadsheet(store, id, APP_URL + '/__export/' + id);
}

/* ---------------- Tiruan layanan lain ---------------- */
const cache = new Map();
function pad(n) { return String(n).padStart(2, '0'); }
function formatDate(d, tz, fmt) {
  const j = new Date(d.getTime() + 7 * 3600 * 1000); // Asia/Jakarta UTC+7
  const map = { yyyy: j.getUTCFullYear(), MM: pad(j.getUTCMonth() + 1), dd: pad(j.getUTCDate()),
    HH: pad(j.getUTCHours()), mm: pad(j.getUTCMinutes()), ss: pad(j.getUTCSeconds()) };
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, k => map[k]);
}
function propsStore() {
  return {
    getProperty: k => (k in DB.props ? DB.props[k] : null),
    setProperty(k, v) { DB.props[k] = String(v); persist(); },
    deleteProperty(k) { delete DB.props[k]; persist(); },
    getProperties: () => Object.assign({}, DB.props),
    setProperties(o) { Object.assign(DB.props, o); persist(); }
  };
}

function compileTemplate(src) {
  // <?!= raw ?>, <?= escaped ?>, <? code ?>
  let code = 'let __o="";\n';
  const re = /<\?(!=|=)?([\s\S]*?)\?>/g; let last = 0, m;
  while ((m = re.exec(src))) {
    code += '__o+=' + JSON.stringify(src.slice(last, m.index)) + ';\n';
    if (m[1] === '!=') code += '__o+=String(' + m[2] + ');\n';
    else if (m[1] === '=') code += '__o+=__esc(' + m[2] + ');\n';
    else code += m[2] + '\n';
    last = re.lastIndex;
  }
  code += '__o+=' + JSON.stringify(src.slice(last)) + ';\nreturn __o;';
  return code;
}
function readSrc(name) { return fs.readFileSync(path.join(SRC, name + '.html'), 'utf8'); }

function htmlOutput(content) {
  let head = '';
  const o = { getContent: () => content.replace('<head>', '<head>' + head) };
  o.addMetaTag = (n, c) => { head += '<meta name="' + n + '" content="' + c + '">'; return o; };
  o.setTitle = t => { head += '<title>' + t + '</title>'; return o; };
  ['setXFrameOptionsMode', 'setFaviconUrl', 'setSandboxMode'].forEach(k => { o[k] = () => o; });
  return o;
}

const ctx = {
  console, JSON, Math, Date, Object, Array, String, Number, RegExp, Error, parseInt, parseFloat, isNaN,
  SpreadsheetApp: {
    openById: () => spreadsheet, getActiveSpreadsheet: () => spreadsheet, create: createSpreadsheet, flush() {},
    getUi() { throw new Error('no ui'); }
  },
  PropertiesService: { getScriptProperties: propsStore },
  CacheService: { getScriptCache: () => ({
    get: k => { const e = cache.get(k); if (!e || e.exp < Date.now()) return null; return e.v; },
    put: (k, v, s = 600) => cache.set(k, { v: String(v), exp: Date.now() + s * 1000 }),
    remove: k => cache.delete(k)
  }) },
  DriveApp: (() => {
    // File tiruan disimpan di dev/.data/drive/ (tidak di-commit).
    const DIR = path.join(DATA_DIR, 'drive'); fs.mkdirSync(DIR, { recursive: true });
    const meta = f => path.join(DIR, f + '.json');
    const folder = { getId: () => 'FOLDER', getUrl: () => APP_URL + '/__export/',
      createFile: (blob) => {
        const id = 'DEVFILE' + crypto.randomBytes(12).toString('hex');
        if (blob && blob.bytes) fs.writeFileSync(meta(id), JSON.stringify({ type: blob.type, b64: Buffer.from(blob.bytes.map(b => b & 255)).toString('base64') }));
        return chainable({ getUrl: () => APP_URL + '/__export/pdf', getId: () => id });
      } };
    const fileObj = id => chainable({
      moveTo() {}, getAs: () => ({}),
      setTrashed() { try { fs.unlinkSync(meta(id)); } catch (e) {} },
      getBlob: () => { const m = JSON.parse(fs.readFileSync(meta(id), 'utf8')); const buf = Buffer.from(m.b64, 'base64');
        return { getContentType: () => m.type, getBytes: () => Array.from(buf).map(b => (b > 127 ? b - 256 : b)) }; }
    });
    return { getFolderById: () => folder, createFolder: () => folder,
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      getFileById: fileObj };
  })(),
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
  Session: { getScriptTimeZone: () => 'Asia/Jakarta',
    getActiveUser: () => ({ getEmail: () => (global.__DEV_AS_OWNER ? 'owner@dev' : '') }),
    getEffectiveUser: () => ({ getEmail: () => 'owner@dev' }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => Array.from(Buffer.from(String(s), 'base64')),
    base64Encode: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64'),
    newBlob: (bytes, type, name) => ({ bytes, type, name }),
    formatDate,
    sleep: () => {}
  },
  ScriptApp: {
    getService: () => ({ getUrl: () => (CURRENT_URL || APP_URL + '/') }),
    getProjectTriggers: () => [],
    newTrigger: () => { const t = { timeBased: () => t, everyHours: () => t, everyDays: () => t, atHour: () => t, create: () => t }; return t; }
  },
  HtmlService: {
    XFrameOptionsMode: { DEFAULT: 0, ALLOWALL: 1 },
    createHtmlOutputFromFile: n => htmlOutput(readSrc(n)),
    createHtmlOutput: s => htmlOutput(String(s || '')),
    createTemplateFromFile(n) {
      const src = readSrc(n);
      const tpl = {
        evaluate() {
          const vars = Object.assign({}, tpl); delete vars.evaluate;
          const names = Object.keys(vars);
          const fn = vm.runInContext('(function(' + ['__esc'].concat(names).join(',') + '){' + compileTemplate(src) + '})', ctx);
          const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          return htmlOutput(fn.apply(null, [esc].concat(names.map(k => vars[k]))));
        }
      };
      return tpl;
    }
  }
};
vm.createContext(ctx);

function loadGs() {
  fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });
}
loadGs();

/* Fungsi yang boleh dipanggil dari browser (mode produksi): fungsi tingkat atas di src/*.gs,
   bukan helper (berakhiran _), bukan fungsi pemeliharaan pemilik (memanggil guardOwner_), dan bukan fungsi internal. */
const DENY = new Set(['doGet', 'include', 'onOpen', 'cleanupTokens', 'exportKeDrive']);
const PUBLIC_API = new Set();
fs.readdirSync(SRC).filter(f => f.endsWith('.gs')).forEach(f => {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  const re = /^function (\w+)\s*\(/gm; const list = []; let m;
  while ((m = re.exec(s))) list.push({ n: m[1], i: m.index });
  list.forEach((x, k) => {
    const body = s.slice(x.i, k + 1 < list.length ? list[k + 1].i : s.length);
    if (!x.n.endsWith('_') && !DENY.has(x.n) && !/guardOwner_\(\)/.test(body)) PUBLIC_API.add(x.n);
  });
});

// Database lokal kosong → jalankan setupAll otomatis.
if (!DB.sheets.ADMIN) { global.__DEV_AS_OWNER = true; console.log(vm.runInContext('setupAll()', ctx)); global.__DEV_AS_OWNER = false; }
// Jalankan fungsi pemeliharaan sebagai pemilik (mis. dari editor): node dev/server.js --run=setupAll
const runArg = process.argv.find(a => a.startsWith('--run='));
if (runArg) { global.__DEV_AS_OWNER = true; console.log(vm.runInContext(runArg.slice(6) + '()', ctx)); global.__DEV_AS_OWNER = false; }

/* ---------------- Shim google.script.run ---------------- */
const SHIM = `<script>
window.google = { script: { run: (function mk(ok, fail) {
  return new Proxy({}, { get: function (_, k) {
    if (k === 'withSuccessHandler') return function (h) { return mk(h, fail); };
    if (k === 'withFailureHandler') return function (h) { return mk(ok, h); };
    if (k === 'withUserObject') return function () { return mk(ok, fail); };
    return function () {
      var args = Array.prototype.slice.call(arguments);
      if (window.__DEV_OFFLINE) { setTimeout(function(){ fail && fail(new Error('NetworkError (simulasi offline)')); }, 200); return; }
      fetch('/api/' + k, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.__error) { fail && fail(new Error(j.__error)); } else { ok && ok(j.result); } })
        .catch(function (e) { fail && fail(e); });
    };
  } });
})() } };
</script>`;

/* ---------------- HTTP ---------------- */
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = '';
    let size = 0, tooBig = false;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { tooBig = true; req.destroy(); } else body += c; });
    req.on('end', () => {
      if (tooBig) return;
      const fn = url.pathname.slice(5);
      res.setHeader('Content-Type', 'application/json');
      try {
        if (!PROD) loadGs(); // hot reload: perubahan .gs langsung terpakai
        if (fn === 'exportKeDrive' && PROD) throw new Error('Simpan ke Drive tidak tersedia di server ini. Gunakan unduh Excel / CSV / PDF.');
        if (fn.endsWith('_') || typeof ctx[fn] !== 'function' || (PROD && !PUBLIC_API.has(fn))) throw new Error('Fungsi server tidak ditemukan: ' + fn);
        const args = JSON.parse(body || '[]');
        const result = ctx[fn].apply(null, args);
        res.end(JSON.stringify({ result: result === undefined ? null : result }));
      } catch (e) {
        if (!PROD || !/tidak ditemukan/.test(e.message)) console.error(e);
        res.end(JSON.stringify({ __error: e.message }));
      }
    });
    return;
  }
  if (url.pathname === '/healthz') { res.setHeader('Content-Type', 'text/plain'); return res.end('ok'); }
  if (PROD && (url.pathname.startsWith('/__dev/') || url.pathname.startsWith('/__export/'))) { res.statusCode = 404; return res.end('not found'); }
  if (req.method === 'POST' && url.pathname.startsWith('/__dev/run/')) {   // jalankan fungsi pemeliharaan sebagai pemilik (dev saja)
    res.setHeader('Content-Type', 'application/json');
    try { loadGs(); global.__DEV_AS_OWNER = true; const out = ctx[url.pathname.slice(11)](); res.end(JSON.stringify({ result: out })); }
    catch (e) { res.end(JSON.stringify({ __error: e.message })); } finally { global.__DEV_AS_OWNER = false; }
    return;
  }
  if (url.pathname === '/__dev/import-test.xlsx') {   // file uji lokal (dev/.data, tidak di-commit)
    const f = path.join(DATA_DIR, 'import-test.xlsx');
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.end(fs.readFileSync(f));
  }
  if (url.pathname.startsWith('/__export/')) {
    const st = EXPORTS[url.pathname.split('/')[2]];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(st ? { name: st.name, sheets: st.sheets } : { info: 'dev: file export tiruan' }, null, 1));
  }
  if (url.pathname !== '/') { res.statusCode = 404; return res.end('not found'); }
  try {
    if (!PROD) loadGs();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
    CURRENT_URL = /^[a-z0-9.-]+(:\d+)?$/i.test(host) && /^https?$/.test(proto) ? proto + '://' + host + '/' : '';
    const parameter = Object.fromEntries(url.searchParams);
    let html = ctx.doGet({ parameter }).getContent();
    html = html.replace('<head>', '<head>' + SHIM);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (e) {
    console.error(e);
    res.statusCode = 500; res.end(PROD ? 'Terjadi kesalahan server.' : '<pre>' + e.stack + '</pre>');
  }
}).listen(PORT, () => console.log((PROD ? 'Server produksi' : 'Dev server') + ': ' + APP_URL + '  (admin: ?page=admin) · port ' + PORT));

// Bersihkan token kedaluwarsa tiap 6 jam & cadangan harian.
setInterval(() => { try { ctx.cleanupTokens(); } catch (e) { console.error(e.message); } }, 6 * 3600 * 1000).unref();
backupHarian();
setInterval(backupHarian, 3600 * 1000).unref();
