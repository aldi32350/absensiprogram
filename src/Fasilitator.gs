/**
 * Fasilitator.gs — master fasilitator (pendamping jamaah), terpisah dari data jamaah.
 * Jamaah menyimpan nama fasilitatornya di kolom DATA_JAMAAH.kelompok.
 * Nama fasilitator yang muncul di data jamaah (mis. dari import file MIM) otomatis ditambahkan ke master.
 */

var STATUS_FASILITATOR = ['Aktif', 'Nonaktif'];
var KATEGORI_KELAS = ['Ibu & Bapak', 'Remaja & Anak'];

/** Daftar fasilitator + jumlah jamaah binaan. */
function listFasilitator(token) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    withLock_(migrasiAkunFasilitator_);
    withLock_(syncFasilitatorDariJamaah_);
    var jamaah = readAll_('DATA_JAMAAH');
    var count = {}, aktif = {}, anggota = {};
    jamaah.forEach(function (j) {
      if (!j.kelompok) return;
      count[j.kelompok] = (count[j.kelompok] || 0) + 1;
      if (j.status === 'Aktif') {
        aktif[j.kelompok] = (aktif[j.kelompok] || 0) + 1;
        (anggota[j.kelompok] = anggota[j.kelompok] || []).push([j.id_jamaah, j.nama, j.nama_panggilan || '']);
      }
    });
    var rows = readAll_('FASILITATOR').map(function (f) {
      var o = publicFasil_(f);
      o.jumlah_jamaah = count[f.nama] || 0;
      o.jamaah_aktif = aktif[f.nama] || 0;
      o.jamaah = (anggota[f.nama] || []).sort(function (a, b) { return a[1].localeCompare(b[1], 'id'); });   // [id, nama, panggilan]
      return o;
    }).sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });
    // Akun fasilitator (per orang) dari Kelola User → dipilih sebagai pasangan kelas.
    var dipakai = {};
    rows.forEach(function (k) { if (k.anggota_1) dipakai[k.anggota_1] = k.nama; if (k.anggota_2) dipakai[k.anggota_2] = k.nama; });
    var users = readAll_('PETUGAS').filter(function (p) { return p.jenis === 'fasilitator'; }).map(function (p) {
      return { id_petugas: p.id_petugas, nama: p.nama, username: p.username, status: p.status, kelas: dipakai[p.id_petugas] || '' };
    }).sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });
    return { rows: rows, users: users, tanpa_fasilitator: jamaah.filter(function (j) { return !j.kelompok && j.status === 'Aktif'; }).length };
  });
}

/** Jamaah binaan satu fasilitator. */
function jamaahBinaan(token, idFasilitator) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var f = findBy_('FASILITATOR', 'id_fasilitator', idFasilitator);
    if (!f) throw new Error('Fasilitator tidak ditemukan.');
    return {
      fasilitator: publicFasil_(f),
      rows: readAll_('DATA_JAMAAH').filter(function (j) { return j.kelompok === f.nama; }).map(function (j) {
        return { id_jamaah: j.id_jamaah, nama: j.nama, desa: j.desa, jenis_kelamin: j.jenis_kelamin, status: j.status };
      })
    };
  });
}

/** Tambah / edit. Mengganti nama ikut memperbarui jamaah binaan & peserta program. */
function saveFasilitator(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    data = data || {};
    var anggota = [clean_(data.anggota_1), clean_(data.anggota_2)].filter(String);
    if (anggota.length === 2 && anggota[0] === anggota[1]) throw new Error('Fasilitator 1 dan 2 tidak boleh orang yang sama.');
    var namaAnggota = anggota.map(function (id) {
      var u = findBy_('PETUGAS', 'id_petugas', id);
      if (!u || u.jenis !== 'fasilitator') throw new Error('Fasilitator tidak ditemukan di Kelola User.');
      return u.nama.replace(/,/g, ' ').trim();
    });
    if (anggota.length) data.nama = namaAnggota.join(' & ');
    var rec = {
      anggota_1: anggota[0] || '', anggota_2: anggota[1] || '',
      nama: clean_(data.nama).replace(/\s+/g, ' '),
      no_hp: normalizePhone_(data.no_hp),
      jenis_kelamin: '',
      status: clean_(data.status) || 'Aktif',
      catatan: clean_(data.catatan),
      username: clean_(data.username).toLowerCase(),
      kelas: clean_(data.kelas),
      kategori: clean_(data.kategori)
    };
    // Akun login diatur di Kelola User. Form Fasilitator tanpa isian username → akun login tidak diubah.
    var aturAkun = Object.prototype.hasOwnProperty.call(data, 'username');
    if (!aturAkun) delete rec.username;
    if (rec.kelas && INDIKATOR_JAMAAH.indexOf(rec.kelas) === -1) throw new Error('Kelas tidak valid.');
    if (rec.kategori && KATEGORI_KELAS.indexOf(rec.kategori) === -1) throw new Error('Kategori tidak valid.');
    var pin = clean_(data.pin);
    if (!rec.nama) throw new Error('Pilih minimal Fasilitator 1.');
    if (rec.username && !/^[a-z0-9._]{3,20}$/.test(rec.username)) throw new Error('Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.');
    if (pin) cekPasswordUser_(pin);
    if (rec.nama.indexOf(',') !== -1) throw new Error('Nama fasilitator tidak boleh mengandung koma (pakai "&" untuk dua orang).');
    if (rec.no_hp && !/^(\+62|62|0)8\d{7,12}$/.test(rec.no_hp)) throw new Error('Format no HP tidak valid.');
    if (STATUS_FASILITATOR.indexOf(rec.status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var all = readAll_('FASILITATOR');
      var dup = all.some(function (f) { return f.nama.toLowerCase() === rec.nama.toLowerCase() && f.id_fasilitator !== data.id_fasilitator; });
      if (dup) throw new Error('Pasangan fasilitator ini sudah ada di kelas lain.');
      if (rec.username) cekUsernameUnik_(rec.username, 'FASILITATOR', data.id_fasilitator || '');
      if (pin) { rec.salt = newSalt_(); rec.pin_hash = hash_(pin, rec.salt); }
      if (data.id_fasilitator) {
        var old = findBy_('FASILITATOR', 'id_fasilitator', data.id_fasilitator);
        if (!old) throw new Error('Fasilitator tidak ditemukan.');
        if (rec.username && !pin && !old.pin_hash) throw new Error('Isi password untuk membuat akun login fasilitator.');
        if (aturAkun && !rec.username) { rec.pin_hash = ''; rec.salt = ''; }   // username dikosongkan = akun login dihapus
        var saved = updateBy_('FASILITATOR', 'id_fasilitator', data.id_fasilitator, rec);
        var moved = 0;
        if (old.nama !== rec.nama) moved = renameFasilitatorDiData_(old.nama, rec.nama);
        if (rec.status !== 'Aktif' || (aturAkun && (!rec.username || pin || rec.username !== old.username))) destroySessionsOf_('fasilitator', data.id_fasilitator);
        logActivity_(s.username, s.role, 'Edit fasilitator ' + data.id_fasilitator + ' (' + rec.nama + ')' +
          (moved ? ', ' + moved + ' jamaah ikut diperbarui' : ''));
        return publicFasil_(saved);
      }
      if (rec.username && !pin) throw new Error('Isi password untuk akun login fasilitator.');
      rec.id_fasilitator = nextId_('FASILITATOR', 'id_fasilitator', 'FSL', 3);
      appendRow_('FASILITATOR', rec);
      logActivity_(s.username, s.role, 'Tambah fasilitator ' + rec.id_fasilitator + ' (' + rec.nama + ')');
      return publicFasil_(rec);
    });
  });
}

/** Hapus fasilitator. Jamaah binaannya menjadi "tanpa fasilitator" (data jamaah tidak dihapus). */
function deleteFasilitator(token, id) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    return withLock_(function () {
      var f = findBy_('FASILITATOR', 'id_fasilitator', id);
      if (!f) throw new Error('Fasilitator tidak ditemukan.');
      var moved = renameFasilitatorDiData_(f.nama, '');
      deleteBy_('FASILITATOR', 'id_fasilitator', id);
      destroySessionsOf_('fasilitator', id);
      logActivity_(s.username, s.role, 'Hapus fasilitator ' + id + ' (' + f.nama + '), ' + moved + ' jamaah dilepas');
      return { dilepas: moved };
    });
  });
}

/** Pindahkan sekumpulan jamaah ke fasilitator tertentu ('' = lepaskan). */
function aturFasilitatorJamaah(token, ids, namaFasilitator) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    ids = (ids || []).map(clean_).filter(String);
    namaFasilitator = clean_(namaFasilitator);
    return withLock_(function () {
      if (namaFasilitator && !readAll_('FASILITATOR').some(function (f) { return f.nama === namaFasilitator; })) {
        throw new Error('Fasilitator tidak ditemukan.');
      }
      var set = {}; ids.forEach(function (i) { set[i] = true; });
      var sh = getSheet_('DATA_JAMAAH'), col = SCHEMA.DATA_JAMAAH.indexOf('kelompok') + 1, n = 0;
      readAll_('DATA_JAMAAH').forEach(function (j) {
        if (set[j.id_jamaah]) { sh.getRange(j._row, col).setValue(namaFasilitator); n++; }
      });
      logActivity_(s.username, s.role, 'Atur fasilitator ' + n + ' jamaah → ' + (namaFasilitator || '(tanpa fasilitator)'));
      return { diubah: n };
    });
  });
}

/** Reset PIN login fasilitator (kosong = PIN acak 4 angka). */
function resetPinFasilitator(token, id, pin) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    pin = String(pin || '') || passwordAcak_();
    cekPasswordUser_(pin);
    return withLock_(function () {
      var f = findBy_('FASILITATOR', 'id_fasilitator', id);
      if (!f) throw new Error('Fasilitator tidak ditemukan.');
      if (!f.username) throw new Error('Fasilitator ini belum punya username. Isi username lewat Edit.');
      var salt = newSalt_();
      updateBy_('FASILITATOR', 'id_fasilitator', id, { salt: salt, pin_hash: hash_(pin, salt) });
      destroySessionsOf_('fasilitator', id);
      logActivity_(s.username, s.role, 'Reset password fasilitator ' + id + ' (' + f.username + ')');
      return { pin: pin, username: f.username };
    });
  });
}

/* ---------- Fasilitator per orang ---------- */

/** Kelas (baris FASILITATOR) yang dipegang seorang fasilitator (id_petugas). */
function kelasMilik_(idPetugas) {
  if (!idPetugas) return [];
  return readAll_('FASILITATOR').filter(function (k) { return k.anggota_1 === idPetugas || k.anggota_2 === idPetugas; });
}

/** Nama kelas = nama anggota; dipanggil saat nama akun fasilitator diganti di Kelola User (di dalam lock). */
function perbaruiNamaKelas_(idPetugas) {
  kelasMilik_(idPetugas).forEach(function (k) {
    var nama = [k.anggota_1, k.anggota_2].filter(String).map(function (id) {
      var u = findBy_('PETUGAS', 'id_petugas', id); return u ? u.nama.replace(/,/g, ' ').trim() : '';
    }).filter(String).join(' & ');
    if (nama && nama !== k.nama) {
      updateBy_('FASILITATOR', 'id_fasilitator', k.id_fasilitator, { nama: nama });
      renameFasilitatorDiData_(k.nama, nama);
    }
  });
}

/**
 * Migrasi sekali: akun login lama (satu akun per PASANGAN di sheet FASILITATOR) → akun per ORANG di Kelola User.
 * - Fasilitator 1 mendapat username & password lama (login tetap sama).
 * - Fasilitator 2 dibuatkan akun baru (username dari nama depan, password acak — admin tinggal reset password).
 * - Kelas menyimpan keduanya di anggota_1 / anggota_2. Dipanggil di dalam withLock_.
 */
function migrasiAkunFasilitator_() {
  var kelas = readAll_('FASILITATOR');
  var lama = kelas.filter(function (k) { return k.pin_hash || (!k.anggota_1 && !k.anggota_2 && k.username); });
  if (!lama.length) return 0;
  var users = readAll_('PETUGAS');
  var n = parseInt(nextId_('PETUGAS', 'id_petugas', 'PTG', 3).substring(3), 10);
  function idBaru() { var x = String(n++); while (x.length < 3) x = '0' + x; return 'PTG' + x; }
  function usernameBaru(nama) {
    var dasar = String(nama || '').toLowerCase().split(' ').filter(function (w) { return w && w.indexOf('.') === -1; })[0] || 'fasil';
    dasar = dasar.replace(/[^a-z0-9]/g, '').substring(0, 14) || 'fasil';
    var u = dasar, i = 2;
    function dipakai(x) {
      return users.some(function (p) { return p.username === x; }) || kelas.some(function (k) { return k.username === x; }) ||
        readAll_('ADMIN').some(function (a) { return a.username === x; });
    }
    while (dipakai(u)) u = dasar + (i++);
    return u;
  }
  lama.forEach(function (k) {
    var nama = String(k.nama || '').split(' & ').map(function (x) { return x.trim(); }).filter(String);
    var ids = [];
    nama.slice(0, 2).forEach(function (nm, i) {
      var rec = { id_petugas: idBaru(), nama: nm, program_ids: '', status: k.status || 'Aktif', jenis: 'fasilitator' };
      if (i === 0 && k.username && k.pin_hash) { rec.username = k.username; rec.salt = k.salt; rec.pin_hash = k.pin_hash; }
      else { rec.username = usernameBaru(nm); rec.salt = newSalt_(); rec.pin_hash = hash_(passwordAcak_() + Utilities.getUuid(), rec.salt); }
      users.push(rec);
      appendRow_('PETUGAS', rec);
      ids.push(rec.id_petugas);
    });
    updateBy_('FASILITATOR', 'id_fasilitator', k.id_fasilitator, { username: '', pin_hash: '', salt: '', anggota_1: ids[0] || '', anggota_2: ids[1] || '' });
    destroySessionsOf_('fasilitator', k.id_fasilitator);
  });
  logActivity_('sistem', 'sistem', 'Migrasi akun fasilitator per orang: ' + lama.length + ' kelas');
  return lama.length;
}

/**
 * Kelola User: buat / ubah akun login seorang fasilitator (kelas yang sudah ada).
 * password kosong saat edit = password lama tetap.
 */
function aturAkunFasilitator(token, idFasilitator, username, password) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    username = clean_(username).toLowerCase();
    if (!/^[a-z0-9._]{3,20}$/.test(username)) throw new Error('Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.');
    password = String(password || '');
    if (password) cekPasswordUser_(password);
    return withLock_(function () {
      var f = findBy_('FASILITATOR', 'id_fasilitator', idFasilitator);
      if (!f) throw new Error('Fasilitator tidak ditemukan.');
      cekUsernameUnik_(username, 'FASILITATOR', idFasilitator);
      if (!password && !f.pin_hash) throw new Error('Isi password untuk akun baru.');
      var patch = { username: username };
      if (password) { patch.salt = newSalt_(); patch.pin_hash = hash_(password, patch.salt); }
      var saved = updateBy_('FASILITATOR', 'id_fasilitator', idFasilitator, patch);
      if (password || username !== f.username) destroySessionsOf_('fasilitator', idFasilitator);
      logActivity_(s.username, s.role, 'Atur akun fasilitator ' + idFasilitator + ' (' + username + ')');
      return publicFasil_(saved);
    });
  });
}

/** Kelola User: hapus akun login fasilitator (kelas & jamaah binaannya tetap). */
function hapusAkunFasilitator(token, idFasilitator) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    return withLock_(function () {
      var saved = updateBy_('FASILITATOR', 'id_fasilitator', idFasilitator, { username: '', pin_hash: '', salt: '' });
      destroySessionsOf_('fasilitator', idFasilitator);
      logActivity_(s.username, s.role, 'Hapus akun login fasilitator ' + idFasilitator);
      return publicFasil_(saved);
    });
  });
}

/** Kelola User: aktif / nonaktifkan fasilitator (nonaktif = tidak bisa login). */
function setFasilitatorStatus(token, idFasilitator, status) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (STATUS_FASILITATOR.indexOf(status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var saved = updateBy_('FASILITATOR', 'id_fasilitator', idFasilitator, { status: status });
      if (status !== 'Aktif') destroySessionsOf_('fasilitator', idFasilitator);
      logActivity_(s.username, s.role, 'Status fasilitator ' + idFasilitator + ' → ' + status);
      return publicFasil_(saved);
    });
  });
}

/* ---------- Helper ---------- */

/** Data fasilitator tanpa hash PIN. */
function publicFasil_(f) {
  var o = strip_(f);
  o.punya_akun = !!(f.username && f.pin_hash);
  delete o.pin_hash; delete o.salt;
  return o;
}

/** Pastikan setiap nama fasilitator yang dipakai jamaah ada di master. */
function syncFasilitatorDariJamaah_() {
  var master = {};
  readAll_('FASILITATOR').forEach(function (f) { master[f.nama.toLowerCase()] = true; });
  var baru = [];
  readAll_('DATA_JAMAAH').forEach(function (j) {
    var n = clean_(j.kelompok);
    if (n && !master[n.toLowerCase()]) { master[n.toLowerCase()] = true; baru.push(n); }
  });
  if (!baru.length) return 0;
  var next = parseInt(nextId_('FASILITATOR', 'id_fasilitator', 'FSL', 3).substring(3), 10);
  appendRows_('FASILITATOR', baru.sort().map(function (n) {
    var num = String(next++); while (num.length < 3) num = '0' + num;
    return { id_fasilitator: 'FSL' + num, nama: n, no_hp: '', jenis_kelamin: '', status: 'Aktif', catatan: 'Otomatis dari data jamaah' };
  }));
  return baru.length;
}

/** Ganti nama fasilitator di data jamaah & daftar peserta program. Return jumlah jamaah yang berubah. */
function renameFasilitatorDiData_(lama, baru) {
  var sh = getSheet_('DATA_JAMAAH'), col = SCHEMA.DATA_JAMAAH.indexOf('kelompok') + 1, n = 0;
  readAll_('DATA_JAMAAH').forEach(function (j) {
    if (j.kelompok === lama) { sh.getRange(j._row, col).setValue(baru); n++; }
  });
  var shP = getSheet_('PROGRAM'), colP = SCHEMA.PROGRAM.indexOf('kelompok_peserta') + 1;
  readAll_('PROGRAM').forEach(function (p) {
    var list = splitList_(p.kelompok_peserta);
    var i = list.indexOf(lama);
    if (i === -1) return;
    if (baru) list[i] = baru; else list.splice(i, 1);
    shP.getRange(p._row, colP).setValue(list.join(', '));
  });
  return n;
}

/** Nama fasilitator aktif (untuk pilihan di form jamaah & program). */
function namaFasilitatorList_() {
  return readAll_('FASILITATOR').filter(function (f) { return f.status === 'Aktif'; })
    .map(function (f) { return f.nama; }).sort(function (a, b) { return a.localeCompare(b, 'id'); });
}
