/**
 * Code.gs — router Web App, helper database (Google Sheets), util umum.
 *
 * URL:
 *   .../exec                → aplikasi Petugas (login petugas → absensi)
 *   .../exec?page=admin     → aplikasi Admin (login admin → dashboard, master, rekap)
 *   (Cetak kartu ada di dalam aplikasi Admin, menu "Kartu Jamaah".)
 */

var APP_NAME = 'Absensi Jamaah';

var PAGES = {
  petugas: { file: 'index-petugas', title: 'Absensi Jamaah — Petugas' },
  admin:   { file: 'index-admin',   title: 'Absensi Jamaah — Admin' }
};

function doGet(e) {
  var key = (e && e.parameter && e.parameter.page) || 'petugas';
  var page = PAGES[key] || PAGES.petugas;
  var t;
  try { t = HtmlService.createTemplateFromFile(page.file); }
  catch (err) { page = PAGES.petugas; t = HtmlService.createTemplateFromFile(page.file); }
  t.appUrl = ScriptApp.getService().getUrl();
  t.params = (e && e.parameter) || {};
  var out = t.evaluate();
  // Ikon tab browser = logo yayasan (Profil Yayasan). Gagal → pakai ikon bawaan Google.
  var fav = faviconUrl_();
  if (fav) { try { out.setFaviconUrl(fav); } catch (err) { console.warn('setFaviconUrl: ' + err); } }
  return out
    .setTitle(page.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cut')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Dipakai di template: <?!= include('styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Menu di Google Sheets (untuk setup tanpa buka editor). */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Absensi Jamaah')
      .addItem('1. Setup database + program MIM + data awal', 'setupAll')
      .addItem('Tambahkan program MIM yang belum ada', 'pasangProgramMIM')
      .addItem('Hapus jamaah dummy (DMY-…)', 'hapusJamaahDummy')
      .addItem('Bersihkan token kedaluwarsa', 'cleanupTokens')
      .addToUi();
  } catch (err) { /* bukan konteks spreadsheet */ }
}

/* =========================================================================
 * Database helper
 * ========================================================================= */

function getDb_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (err) { ss = null; }
  if (!ss) ss = SpreadsheetApp.create('Database Absensi Jamaah');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

var CHECKED_SHEETS_ = {};   // per eksekusi: header sudah dicek
function getSheet_(name) {
  var sh = getDb_().getSheetByName(sheetName_(name));
  if (!sh) {
    withLock_(function () { ensureSheet_(name); });   // buat baru / ganti nama sheet lama
    sh = getDb_().getSheetByName(sheetName_(name));
    CHECKED_SHEETS_[name] = true;
  } else if (!CHECKED_SHEETS_[name]) {
    CHECKED_SHEETS_[name] = true;
    var headers = headerRow_(name);
    var cur = sh.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
    if (cur.join('|') !== headers.join('|')) {   // struktur kolom berubah / data ditempel → migrasi otomatis
      withLock_(function () { ensureSheet_(name); });
      sh = getDb_().getSheetByName(sheetName_(name));
    }
  }
  return sh;
}

/* ---------- Konversi format sheet ↔ aplikasi (khusus DATA MASTER JAMAAH) ---------- */

/** Dari sheet (format manusia / campuran) → format aplikasi: JK L/P, tanggal yyyy-mm-dd, status Aktif/Nonaktif. */
function decodeRow_(name, o) {
  if (name !== 'DATA_JAMAAH') return o;
  o.jenis_kelamin = normalizeJk_(o.jenis_kelamin);
  o.tanggal_lahir = normalizeDate_(o.tanggal_lahir) || '';
  o.tanggal_daftar = normalizeDate_(o.tanggal_daftar) || '';
  var st = clean_(o.status).toLowerCase();
  o.status = (st.indexOf('tidak') === 0 || st.indexOf('non') === 0 || st === 'keluar') ? 'Nonaktif' : 'Aktif';
  o.no_hp = normalizePhone_(o.no_hp);
  o.id_jamaah = clean_(o.id_jamaah).toUpperCase();
  return o;
}

/** Dari aplikasi → tampilan di sheet: Ikhwan/Akhwat, dd/mm/yyyy, Aktif/Tidak Aktif, Usia dihitung. */
function encodeValue_(name, k, v, o) {
  if (name !== 'DATA_JAMAAH') return v;
  if (k === 'jenis_kelamin') return v === 'L' ? 'Ikhwan' : v === 'P' ? 'Akhwat' : '';
  if (k === 'tanggal_lahir' || k === 'tanggal_daftar') {
    var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : (v || '');
  }
  if (k === 'status') return v === 'Nonaktif' ? 'Tidak Aktif' : 'Aktif';
  if (k === 'usia') return usiaDari_(o.tanggal_lahir);
  return v;
}

function usiaDari_(ymd) {
  var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  var t = today_().split('-');
  var u = +t[0] - +m[1] - ((+t[1] < +m[2] || (+t[1] === +m[2] && +t[2] < +m[3])) ? 1 : 0);
  return u >= 0 && u < 130 ? String(u) : '';
}

/** Ubah nilai sel menjadi string rapi (tanggal → yyyy-MM-dd HH:mm:ss). */
function cellToString_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm:ss');
  }
  return String(v);
}

/** Baca seluruh sheet sebagai array objek {header: nilai}; setiap objek punya _row (nomor baris). */
function readAll_(name) {
  var sh = getSheet_(name);
  var last = sh.getLastRow();
  var headers = SCHEMA[name];
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = { _row: i + 2 };
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = cellToString_(row[c]).trim();
    out.push(decodeRow_(name, obj));
  }
  return out;
}

function objToRow_(name, obj) {
  return SCHEMA[name].map(function (h) {
    var v = encodeValue_(name, h, obj[h], obj);
    return v === null || v === undefined ? '' : String(v);
  });
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = getSheet_(name);
  var rows = objs.map(function (o) { return objToRow_(name, o); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, SCHEMA[name].length).setValues(rows);
}

function appendRow_(name, obj) { appendRows_(name, [obj]); }

/** Cari baris berdasarkan kolom kunci. */
function findBy_(name, field, value) {
  var all = readAll_(name);
  for (var i = 0; i < all.length; i++) if (all[i][field] === String(value)) return all[i];
  return null;
}

/** Update sebagian kolom pada baris yang kolom kuncinya = value. Mengembalikan objek baru. */
function updateBy_(name, field, value, patch) {
  var rec = findBy_(name, field, value);
  if (!rec) throw new Error('Data tidak ditemukan: ' + value);
  var merged = {};
  SCHEMA[name].forEach(function (h) { merged[h] = (h in patch) ? patch[h] : rec[h]; });
  getSheet_(name).getRange(rec._row, 1, 1, SCHEMA[name].length).setValues([objToRow_(name, merged)]);
  merged._row = rec._row;
  return merged;
}

function deleteBy_(name, field, value) {
  var rec = findBy_(name, field, value);
  if (!rec) throw new Error('Data tidak ditemukan: ' + value);
  getSheet_(name).deleteRow(rec._row);
  return rec;
}

/** ID berikutnya, mis. nextId_('DATA_JAMAAH','id_jamaah','MIM-',4) → MIM-0123 */
function nextId_(name, field, prefix, pad) {
  var max = 0;
  readAll_(name).forEach(function (r) {
    var s = String(r[field] || '');
    if (s.indexOf(prefix) === 0) {
      var n = parseInt(s.substring(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  var num = String(max + 1);
  while (num.length < pad) num = '0' + num;
  return prefix + num;
}

/** Jalankan fn dengan LockService agar tidak bentrok antar petugas. */
var LOCK_DEPTH_ = 0;   // lock bersarang (mis. migrasi di dalam withLock_) tidak dikunci dua kali
function withLock_(fn) {
  if (LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Server sedang sibuk, coba lagi sebentar.');
  LOCK_DEPTH_++;
  try { return fn(); }
  finally { LOCK_DEPTH_--; lock.releaseLock(); }
}

/* =========================================================================
 * Util
 * ========================================================================= */

function tz_() { return Session.getScriptTimeZone() || 'Asia/Jakarta'; }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function strip_(rec) {
  if (!rec) return rec;
  var o = {};
  for (var k in rec) if (k !== '_row') o[k] = rec[k];
  return o;
}

function clean_(v) { return String(v === null || v === undefined ? '' : v).trim(); }

/**
 * Bungkus setiap fungsi publik: hasil selalu {ok:true,data} atau {ok:false,error,code}.
 * Error dengan pesan berawalan "AUTH:" diberi code agar klien bisa logout otomatis.
 */
function respond_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (err) {
    var msg = (err && err.message) || String(err);
    var code = '';
    if (msg.indexOf('AUTH:') === 0) { code = msg.split(':')[1]; msg = msg.split(':').slice(2).join(':'); }
    return { ok: false, code: code, error: msg };
  }
}

/**
 * Fungsi pemeliharaan (setup, hapus dummy) hanya boleh dijalankan pemilik dari editor Apps Script
 * atau menu Google Sheets — BUKAN dari browser lewat Web App (yang bisa diakses siapa saja).
 */
function guardOwner_() {
  var active = '', owner = '';
  try { active = Session.getActiveUser().getEmail(); owner = Session.getEffectiveUser().getEmail(); } catch (err) {}
  if (!active || active !== owner) throw new Error('Fungsi ini hanya bisa dijalankan pemilik dari editor Apps Script / menu Google Sheets.');
}

/** Catat aktivitas ke sheet LOG (tidak pernah melempar error). */
function logActivity_(user, role, aktivitas) {
  try {
    appendRow_('LOG', { waktu: now_(), user: user || '-', role: role || '-', aktivitas: aktivitas });
  } catch (err) { console.error('LOG gagal: ' + err); }
}
