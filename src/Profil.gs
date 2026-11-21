/**
 * Profil.gs — profil yayasan (logo, nama, kontak) + teks kartu jamaah.
 * Disimpan di sheet PENGATURAN (kunci–nilai) agar dipakai bersama semua admin & HP.
 */

var PROFIL_FIELDS = {
  nama_yayasan:  { def: '', max: 120 },
  singkatan:     { def: '', max: 20 },     // label di bawah logo, mis. BBHQ
  nama_program:  { def: '', max: 80 },     // mis. Masjid Muslim Billionaire
  alamat:        { def: '', max: 300 },
  telepon:       { def: '', max: 40 },
  email:         { def: '', max: 80 },
  website:       { def: '', max: 120 },
  instagram:     { def: '', max: 60 },     // tanpa @
  kartu_judul1:  { def: 'NGAJI', max: 24 },
  kartu_judul2:  { def: 'BAHAGIA', max: 24 },
  kartu_tagline: { def: 'Istiqamah ngajinya, insyaAllah Allah mudahkan rezeki dan urusannya.', max: 140 },
  kartu_kode:    { def: 'qr', max: 10 },   // qr | barcode
  kartu_nama:    { def: 'tidak', max: 5 }, // ya | tidak — tampilkan nama jamaah di kartu
  favicon_url:   { def: '', max: 300 },    // opsional: URL ikon tab browser milik sendiri (https://…png)
  favicon_id:    { def: '', max: 100, internal: true }   // ID file logo di Drive (diisi otomatis)
};
var LOGO_CHUNK = 40000;          // batas aman isi 1 sel Google Sheets (maks 50.000)
var LOGO_MAX = 400000;           // ±300 KB gambar

/** Profil lengkap (untuk admin & petugas yang sudah login). */
function getProfil(token) {
  return respond_(function () {
    requireAuth_(token, 'petugas');           // admin juga lolos
    return readProfil_();
  });
}

/** Versi publik untuk halaman login: hanya nama, singkatan, logo. */
function getProfilPublik() {
  return respond_(function () {
    var p = readProfil_();
    return { nama_yayasan: p.nama_yayasan, singkatan: p.singkatan, nama_program: p.nama_program, logo: p.logo,
             favicon_url: p.favicon_url };
  });
}

function simpanProfil(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    data = data || {};
    var kv = {};
    Object.keys(PROFIL_FIELDS).forEach(function (k) {
      if (!(k in data) || PROFIL_FIELDS[k].internal) return;
      var v = clean_(data[k]).substring(0, PROFIL_FIELDS[k].max);
      if (k === 'favicon_url' && v && !/^https:\/\/\S+$/i.test(v)) throw new Error('URL ikon harus diawali https://');
      if (k === 'instagram') v = v.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
      if (k === 'kartu_kode' && ['qr', 'barcode'].indexOf(v) === -1) v = 'qr';
      if (k === 'kartu_nama' && ['ya', 'tidak'].indexOf(v) === -1) v = 'tidak';
      if (k === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Format email tidak valid.');
      kv[k] = v;
    });
    var logoChanged = false;
    if ('logo' in data) {
      var logo = String(data.logo || '');
      if (logo && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+$/.test(logo)) throw new Error('Format logo tidak didukung (PNG/JPG/WebP).');
      if (logo.length > LOGO_MAX) throw new Error('Logo terlalu besar. Gunakan gambar yang lebih kecil.');
      logoChanged = true;
    }
    return withLock_(function () {
      var rows = readAll_('PENGATURAN');
      var map = {};
      rows.forEach(function (r) { map[r.kunci] = r; });
      Object.keys(kv).forEach(function (k) { setSetting_(map, k, kv[k]); });
      if (logoChanged) {
        // hapus potongan logo lama, simpan potongan baru
        var sh = getSheet_('PENGATURAN');
        rows.filter(function (r) { return /^logo#\d+$/.test(r.kunci); })
          .map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
          .forEach(function (r) { sh.deleteRow(r); });
        var logo = String(data.logo || '');
        var parts = [];
        for (var i = 0; i < logo.length; i += LOGO_CHUNK) parts.push({ kunci: 'logo#' + parts.length, nilai: logo.substring(i, i + LOGO_CHUNK) });
        appendRows_('PENGATURAN', parts);
        // Salinan logo di Drive → dipakai sebagai ikon tab browser (favicon) halaman Web App.
        var favId = '', oldFav = map.favicon_id ? map.favicon_id.nilai : '';
        try {
          if (oldFav) { try { DriveApp.getFileById(oldFav).setTrashed(true); } catch (e1) { /* sudah terhapus */ } }
          if (logo) favId = simpanLogoKeDrive_(logo);
        } catch (e2) { console.warn('Favicon gagal dibuat: ' + e2); }
        setSetting_(map, 'favicon_id', favId);
      }
      CacheService.getScriptCache().remove('profil');
      logActivity_(s.username, s.role, 'Ubah profil yayasan' + (logoChanged ? ' (termasuk logo)' : ''));
      return readProfil_();
    });
  });
}

/** Simpan logo (data URL) sebagai file di Drive, bisa dilihat siapa pun yang punya link (dibutuhkan favicon). */
function simpanLogoKeDrive_(dataUrl) {
  var m = String(dataUrl).match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return '';
  var ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[m[1]] || 'png';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'logo-yayasan.' + ext);
  var file = exportFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

/** URL ikon tab browser: URL milik sendiri bila diisi, selain itu salinan logo di Drive. */
function faviconUrl_() {
  try {
    var p = readProfil_();
    if (p.favicon_url) return p.favicon_url;
    if (p.favicon_id) return 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(p.favicon_id) + '&ext=.png';
  } catch (err) { /* belum ada sheet PENGATURAN */ }
  return '';
}

function setSetting_(map, k, v) {
  if (map[k]) getSheet_('PENGATURAN').getRange(map[k]._row, 2).setValue(v);
  else appendRow_('PENGATURAN', { kunci: k, nilai: v });
}

function readProfil_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('profil');
  if (hit) return JSON.parse(hit);
  var rows = readAll_('PENGATURAN');
  var p = {}, logoParts = [];
  Object.keys(PROFIL_FIELDS).forEach(function (k) { p[k] = PROFIL_FIELDS[k].def; });
  rows.forEach(function (r) {
    var m = r.kunci.match(/^logo#(\d+)$/);
    if (m) logoParts[+m[1]] = r.nilai;
    else if (r.kunci in PROFIL_FIELDS) p[r.kunci] = r.nilai;
  });
  p.logo = logoParts.join('');
  p.lengkap = !!(p.nama_yayasan && p.logo);
  var json = JSON.stringify(p);
  if (json.length < 95000) cache.put('profil', json, 3600);
  return p;
}
