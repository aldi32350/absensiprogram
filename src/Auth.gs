/**
 * Auth.gs — login admin & petugas, token sesi 8 jam, validasi role di server.
 *
 * Token disimpan di PropertiesService (tahan 8 jam; CacheService maks 6 jam),
 * dengan CacheService sebagai cache baca agar validasi cepat.
 */

var SESSION_HOURS = 8;
var TOKEN_PREFIX = 'tok_';
var MAX_LOGIN_FAIL = 5;          // gagal berturut-turut sebelum diblokir sementara
var LOGIN_BLOCK_SECONDS = 300;   // 5 menit

/* ---------- Hash ---------- */

function hash_(text, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(salt || '') + String(text), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b & 0xff).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 16);
}

/* ---------- Login ---------- */

function loginAdmin(username, password) {
  return respond_(function () {
    username = clean_(username).toLowerCase();
    if (!username || !password) throw new Error('Username dan password wajib diisi.');
    checkLoginBlock_('admin', username);
    var adm = findBy_('ADMIN', 'username', username);
    if (!adm || adm.password_hash !== hash_(password, adm.salt)) {
      registerLoginFail_('admin', username);
      logActivity_(username, 'admin', 'Login admin GAGAL');
      throw new Error('Username atau password salah.');
    }
    clearLoginFail_('admin', username);
    var sess = createSession_({ role: 'admin', id: adm.id_admin, nama: adm.nama, username: adm.username });
    logActivity_(adm.username, 'admin', 'Login admin');
    return sess;
  });
}

function loginPetugas(username, pin) {
  return respond_(function () {
    username = clean_(username).toLowerCase();
    pin = clean_(pin);
    if (!username || !pin) throw new Error('Username dan PIN wajib diisi.');
    if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4–6 angka.');
    checkLoginBlock_('petugas', username);
    var p = findBy_('PETUGAS', 'username', username);
    if (!p || p.pin_hash !== hash_(pin, p.salt)) {
      registerLoginFail_('petugas', username);
      logActivity_(username, 'petugas', 'Login petugas GAGAL');
      throw new Error('Username atau PIN salah.');
    }
    if (p.status !== 'Aktif') throw new Error('Akun petugas nonaktif. Hubungi admin.');
    if (p.jenis === 'pendataan') throw new Error('Akun ini untuk PENDATAAN. Login lewat halaman Admin → tab Pendataan.');
    clearLoginFail_('petugas', username);
    var sess = createSession_({
      role: 'petugas', id: p.id_petugas, nama: p.nama, username: p.username,
      programs: splitList_(p.program_ids)
    });
    logActivity_(p.username, 'petugas', 'Login petugas');
    return sess;
  });
}

/** Login petugas PENDATAAN (melengkapi & menambah data master jamaah) — username + PIN, di halaman Admin. */
function loginPendataan(username, pin) {
  return respond_(function () {
    username = clean_(username).toLowerCase();
    pin = clean_(pin);
    if (!username || !pin) throw new Error('Username dan PIN wajib diisi.');
    if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4–6 angka.');
    checkLoginBlock_('pendataan', username);
    var p = findBy_('PETUGAS', 'username', username);
    if (!p || p.pin_hash !== hash_(pin, p.salt)) {
      registerLoginFail_('pendataan', username);
      logActivity_(username, 'pendataan', 'Login pendataan GAGAL');
      throw new Error('Username atau PIN salah.');
    }
    if (p.status !== 'Aktif') throw new Error('Akun nonaktif. Hubungi admin.');
    if (p.jenis !== 'pendataan') throw new Error('Akun ini petugas ABSENSI. Login lewat aplikasi petugas (tab Petugas).');
    clearLoginFail_('pendataan', username);
    var sess = createSession_({ role: 'pendataan', id: p.id_petugas, nama: p.nama, username: p.username });
    logActivity_(p.username, 'pendataan', 'Login pendataan');
    return sess;
  });
}

/** Login FASILITATOR (melaporkan perkembangan jamaah binaan) — username + PIN, di halaman Admin → tab Fasilitator. */
function loginFasilitator(username, pin) {
  return respond_(function () {
    username = clean_(username).toLowerCase();
    pin = clean_(pin);
    if (!username || !pin) throw new Error('Username dan PIN wajib diisi.');
    if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4–6 angka.');
    checkLoginBlock_('fasilitator', username);
    var f = findBy_('FASILITATOR', 'username', username);
    if (!f || !f.pin_hash || f.pin_hash !== hash_(pin, f.salt)) {
      registerLoginFail_('fasilitator', username);
      logActivity_(username, 'fasilitator', 'Login fasilitator GAGAL');
      throw new Error('Username atau PIN salah.');
    }
    if (f.status !== 'Aktif') throw new Error('Akun fasilitator nonaktif. Hubungi admin.');
    clearLoginFail_('fasilitator', username);
    var sess = createSession_({ role: 'fasilitator', id: f.id_fasilitator, nama: f.nama, username: f.username });
    logActivity_(f.username, 'fasilitator', 'Login fasilitator');
    return sess;
  });
}

/**
 * SATU login untuk semua akun: username + password. Peran ditentukan oleh akunnya (diatur admin di Kelola User):
 *   admin · pendataan · fasilitator → halaman admin · petugas (absensi) → aplikasi scan.
 * (Password petugas/pendataan/fasilitator = PIN lama; disimpan sebagai hash di kolom pin_hash.)
 */
function login(username, password) {
  return respond_(function () {
    username = clean_(username).toLowerCase();
    password = String(password === null || password === undefined ? '' : password);
    if (!username || !password) throw new Error('Username dan password wajib diisi.');
    checkLoginBlock_('user', username);
    function gagal() {
      registerLoginFail_('user', username);
      logActivity_(username, '-', 'Login GAGAL');
      throw new Error('Username atau password salah.');
    }
    var sess;
    var adm = findBy_('ADMIN', 'username', username);
    if (adm) {
      if (adm.password_hash !== hash_(password, adm.salt)) gagal();
      sess = createSession_({ role: 'admin', id: adm.id_admin, nama: adm.nama, username: adm.username });
    } else {
      var p = findBy_('PETUGAS', 'username', username);
      if (p) {
        if (p.pin_hash !== hash_(password, p.salt)) gagal();
        if (p.status !== 'Aktif') throw new Error('Akun nonaktif. Hubungi admin.');
        sess = p.jenis === 'pendataan'
          ? createSession_({ role: 'pendataan', id: p.id_petugas, nama: p.nama, username: p.username })
          : createSession_({ role: 'petugas', id: p.id_petugas, nama: p.nama, username: p.username, programs: splitList_(p.program_ids) });
      } else {
        var f = findBy_('FASILITATOR', 'username', username);
        if (!f || !f.pin_hash || f.pin_hash !== hash_(password, f.salt)) gagal();
        if (f.status !== 'Aktif') throw new Error('Akun nonaktif. Hubungi admin.');
        sess = createSession_({ role: 'fasilitator', id: f.id_fasilitator, nama: f.nama, username: f.username });
      }
    }
    clearLoginFail_('user', username);
    logActivity_(sess.username, sess.role, 'Login');
    return sess;
  });
}

/** Aturan password akun petugas / pendataan / fasilitator (PIN lama tetap berlaku). */
function cekPasswordUser_(pw) {
  pw = String(pw || '');
  if (pw.length < 4 || pw.length > 64) throw new Error('Password minimal 4 karakter (maks. 64).');
  if (/^\s|\s$/.test(pw)) throw new Error('Password tidak boleh diawali / diakhiri spasi.');
  return pw;
}

/** Username harus unik di semua akun (admin, petugas, pendataan, fasilitator). */
function cekUsernameUnik_(username, tabel, id) {
  var pakai = readAll_('ADMIN').some(function (a) { return a.username === username && !(tabel === 'ADMIN' && a.id_admin === id); }) ||
    readAll_('PETUGAS').some(function (p) { return p.username === username && !(tabel === 'PETUGAS' && p.id_petugas === id); }) ||
    readAll_('FASILITATOR').some(function (f) { return f.username === username && !(tabel === 'FASILITATOR' && f.id_fasilitator === id); });
  if (pakai) throw new Error('Username "' + username + '" sudah dipakai akun lain.');
}

/** Password acak mudah dibaca (untuk reset tanpa isian). */
function passwordAcak_() {
  var c = 'abcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 8; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}

function logout(token) {
  return respond_(function () {
    var s = getSession_(token);
    destroySession_(token);
    if (s) logActivity_(s.username, s.role, 'Logout');
    return true;
  });
}

/** Klien memanggil ini saat halaman dibuka untuk memastikan token masih berlaku. */
function whoAmI(token) {
  return respond_(function () {
    var s = getSession_(token);
    if (!s) throw new Error('AUTH:EXPIRED:Sesi login berakhir, silakan login ulang.');
    return publicSession_(s, token);
  });
}

/** Admin mengganti password sendiri. Semua sesi admin lain ikut diputus. */
function changeAdminPassword(token, oldPass, newPass) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    var adm = findBy_('ADMIN', 'id_admin', s.id);
    if (!adm || adm.password_hash !== hash_(oldPass, adm.salt)) throw new Error('Password lama salah.');
    newPass = String(newPass || '');
    if (newPass.length < 8) throw new Error('Password baru minimal 8 karakter.');
    if (newPass === oldPass) throw new Error('Password baru harus berbeda.');
    return withLock_(function () {
      var salt = newSalt_();
      updateBy_('ADMIN', 'id_admin', s.id, { salt: salt, password_hash: hash_(newPass, salt) });
      destroySessionsOf_('admin', s.id);
      logActivity_(s.username, s.role, 'Ganti password admin');
      return createSession_({ role: 'admin', id: adm.id_admin, nama: adm.nama, username: adm.username });
    });
  });
}

/* ---------- Validasi untuk fungsi lain ---------- */

/**
 * Wajib dipanggil di awal setiap fungsi publik.
 *   requireAuth_(token, 'admin')
 *   requireAuth_(token, 'petugas')            → admin juga boleh
 *   requireAuth_(token, 'petugas', 'PRG001')  → petugas harus ditugaskan di program itu
 */
/*
 * Peran:  admin      → semua fitur
 *         pendataan  → hanya data master jamaah (lihat, lengkapi, tambah, foto)
 *         petugas    → absensi (scan) untuk program yang ditugaskan
 * role yang diminta: 'admin' | 'pendataan' (admin/pendataan) | 'petugas' (admin/petugas) | 'any' (siapa pun yang login)
 */
function requireAuth_(token, role, idProgram) {
  var s = getSession_(token);
  if (!s) throw new Error('AUTH:EXPIRED:Sesi login berakhir, silakan login ulang.');
  if (role === 'admin' && s.role !== 'admin') {
    logActivity_(s.username, s.role, 'DITOLAK: akses fungsi admin');
    throw new Error('AUTH:FORBIDDEN:Akses ditolak. Fitur ini hanya untuk admin.');
  }
  // Fasilitator hanya boleh memanggil fungsi fasilitator (dan 'any'); fungsi fasilitator hanya untuk fasilitator.
  if ((s.role === 'fasilitator' && role !== 'fasilitator' && role !== 'any') || (role === 'fasilitator' && s.role !== 'fasilitator')) {
    logActivity_(s.username, s.role, 'DITOLAK: akses fungsi ' + role);
    throw new Error('AUTH:FORBIDDEN:Akses ditolak untuk jenis akun ini.');
  }
  if (s.role === 'fasilitator') {
    var fs = findBy_('FASILITATOR', 'id_fasilitator', s.id);
    if (!fs || fs.status !== 'Aktif' || !fs.pin_hash) {
      destroySession_(token);
      throw new Error('AUTH:EXPIRED:Akun fasilitator nonaktif.');
    }
    s.nama = fs.nama;   // nama terbaru (bila admin mengganti nama)
  }
  if ((role === 'pendataan' && s.role === 'petugas') || (role === 'petugas' && s.role === 'pendataan')) {
    logActivity_(s.username, s.role, 'DITOLAK: akses fungsi ' + role);
    throw new Error('AUTH:FORBIDDEN:Akses ditolak untuk jenis akun ini.');
  }
  if (s.role === 'pendataan') {
    // Status & jenis akun dicek ulang agar perubahan admin langsung berlaku.
    var pd = findBy_('PETUGAS', 'id_petugas', s.id);
    if (!pd || pd.status !== 'Aktif' || pd.jenis !== 'pendataan') {
      destroySession_(token);
      throw new Error('AUTH:EXPIRED:Akun pendataan nonaktif.');
    }
  }
  if (role === 'petugas' && s.role === 'petugas') {
    // Status & penugasan dicek ulang dari sheet agar perubahan admin langsung berlaku.
    var p = findBy_('PETUGAS', 'id_petugas', s.id);
    if (!p || p.status !== 'Aktif' || p.jenis === 'pendataan') {   // akun diubah jadi pendataan → sesi absensi berakhir
      destroySession_(token);
      throw new Error('AUTH:EXPIRED:Akun petugas nonaktif.');
    }
    s.programs = splitList_(p.program_ids);
    if (idProgram && s.programs.indexOf(String(idProgram)) === -1) {
      logActivity_(s.username, s.role, 'DITOLAK: program ' + idProgram + ' bukan tugasnya');
      throw new Error('AUTH:FORBIDDEN:Anda tidak ditugaskan di program ini.');
    }
  }
  return s;
}

/* ---------- Penyimpanan sesi ---------- */

function createSession_(data) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  data.exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  var json = JSON.stringify(data);
  PropertiesService.getScriptProperties().setProperty(TOKEN_PREFIX + token, json);
  CacheService.getScriptCache().put(TOKEN_PREFIX + token, json, 21600);
  return publicSession_(data, token);
}

function getSession_(token) {
  if (!token || typeof token !== 'string' || token.length < 32) return null;
  var key = TOKEN_PREFIX + token;
  var cache = CacheService.getScriptCache();
  var json = cache.get(key);
  if (!json) {
    json = PropertiesService.getScriptProperties().getProperty(key);
    if (json) cache.put(key, json, 21600);
  }
  if (!json) return null;
  var s = JSON.parse(json);
  if (!s.exp || s.exp < Date.now()) { destroySession_(token); return null; }
  return s;
}

function destroySession_(token) {
  if (!token) return;
  PropertiesService.getScriptProperties().deleteProperty(TOKEN_PREFIX + token);
  CacheService.getScriptCache().remove(TOKEN_PREFIX + token);
}

/** Hapus semua sesi milik user tertentu (dipakai saat petugas dinonaktifkan / PIN direset). */
function destroySessionsOf_(role, id) {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(TOKEN_PREFIX) !== 0) return;
    try {
      var s = JSON.parse(all[k]);
      if (s.role === role && s.id === id) {
        props.deleteProperty(k);
        CacheService.getScriptCache().remove(k);
      }
    } catch (err) { props.deleteProperty(k); }
  });
}

/** Dipanggil trigger tiap 6 jam: hapus token kedaluwarsa. */
function cleanupTokens() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var removed = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(TOKEN_PREFIX) !== 0) return;
    var exp = 0;
    try { exp = JSON.parse(all[k]).exp || 0; } catch (err) { exp = 0; }
    if (exp < Date.now()) { props.deleteProperty(k); removed++; }
  });
  return 'Token dihapus: ' + removed;
}

function publicSession_(s, token) {
  return { token: token, role: s.role, id: s.id, nama: s.nama, username: s.username,
           programs: s.programs || [], exp: s.exp };
}

/* ---------- Pembatasan percobaan login ---------- */

function failKey_(role, username) { return 'fail_' + role + '_' + username; }

function checkLoginBlock_(role, username) {
  var n = parseInt(CacheService.getScriptCache().get(failKey_(role, username)) || '0', 10);
  if (n >= MAX_LOGIN_FAIL) throw new Error('Terlalu banyak percobaan gagal. Coba lagi dalam 5 menit.');
}

function registerLoginFail_(role, username) {
  var c = CacheService.getScriptCache();
  var n = parseInt(c.get(failKey_(role, username)) || '0', 10) + 1;
  c.put(failKey_(role, username), String(n), LOGIN_BLOCK_SECONDS);
}

function clearLoginFail_(role, username) {
  CacheService.getScriptCache().remove(failKey_(role, username));
}

function splitList_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String);
}
