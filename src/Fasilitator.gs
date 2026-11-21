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
    withLock_(syncFasilitatorDariJamaah_);
    var jamaah = readAll_('DATA_JAMAAH');
    var count = {}, aktif = {};
    jamaah.forEach(function (j) {
      if (!j.kelompok) return;
      count[j.kelompok] = (count[j.kelompok] || 0) + 1;
      if (j.status === 'Aktif') aktif[j.kelompok] = (aktif[j.kelompok] || 0) + 1;
    });
    var rows = readAll_('FASILITATOR').map(function (f) {
      var o = publicFasil_(f);
      o.jumlah_jamaah = count[f.nama] || 0;
      o.jamaah_aktif = aktif[f.nama] || 0;
      return o;
    }).sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });
    return { rows: rows, tanpa_fasilitator: jamaah.filter(function (j) { return !j.kelompok && j.status === 'Aktif'; }).length };
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
    var rec = {
      nama: clean_(data.nama).replace(/\s+/g, ' '),
      no_hp: normalizePhone_(data.no_hp),
      jenis_kelamin: normalizeJk_(data.jenis_kelamin),
      status: clean_(data.status) || 'Aktif',
      catatan: clean_(data.catatan),
      username: clean_(data.username).toLowerCase(),
      kelas: clean_(data.kelas),
      kategori: clean_(data.kategori)
    };
    if (rec.kelas && INDIKATOR_JAMAAH.indexOf(rec.kelas) === -1) throw new Error('Kelas tidak valid.');
    if (rec.kategori && KATEGORI_KELAS.indexOf(rec.kategori) === -1) throw new Error('Kategori tidak valid.');
    var pin = clean_(data.pin);
    if (!rec.nama) throw new Error('Nama fasilitator wajib diisi.');
    if (rec.username && !/^[a-z0-9._]{3,20}$/.test(rec.username)) throw new Error('Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.');
    if (pin && !/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4–6 angka.');
    if (rec.nama.indexOf(',') !== -1) throw new Error('Nama fasilitator tidak boleh mengandung koma (pakai "&" untuk dua orang).');
    if (rec.no_hp && !/^(\+62|62|0)8\d{7,12}$/.test(rec.no_hp)) throw new Error('Format no HP tidak valid.');
    if (STATUS_FASILITATOR.indexOf(rec.status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var all = readAll_('FASILITATOR');
      var dup = all.some(function (f) { return f.nama.toLowerCase() === rec.nama.toLowerCase() && f.id_fasilitator !== data.id_fasilitator; });
      if (dup) throw new Error('Nama fasilitator sudah ada.');
      if (rec.username && all.some(function (f) { return f.username === rec.username && f.id_fasilitator !== data.id_fasilitator; })) {
        throw new Error('Username sudah dipakai fasilitator lain.');
      }
      if (pin) { rec.salt = newSalt_(); rec.pin_hash = hash_(pin, rec.salt); }
      if (data.id_fasilitator) {
        var old = findBy_('FASILITATOR', 'id_fasilitator', data.id_fasilitator);
        if (!old) throw new Error('Fasilitator tidak ditemukan.');
        if (rec.username && !pin && !old.pin_hash) throw new Error('Isi PIN untuk membuat akun login fasilitator.');
        if (!rec.username) { rec.pin_hash = ''; rec.salt = ''; }   // username dikosongkan = akun login dihapus
        var saved = updateBy_('FASILITATOR', 'id_fasilitator', data.id_fasilitator, rec);
        var moved = 0;
        if (old.nama !== rec.nama) moved = renameFasilitatorDiData_(old.nama, rec.nama);
        if (rec.status !== 'Aktif' || !rec.username || pin || rec.username !== old.username) destroySessionsOf_('fasilitator', data.id_fasilitator);
        logActivity_(s.username, s.role, 'Edit fasilitator ' + data.id_fasilitator + ' (' + rec.nama + ')' +
          (moved ? ', ' + moved + ' jamaah ikut diperbarui' : ''));
        return publicFasil_(saved);
      }
      if (rec.username && !pin) throw new Error('Isi PIN untuk akun login fasilitator.');
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
    pin = clean_(pin);
    if (!pin) pin = String(Math.floor(1000 + Math.random() * 9000));
    if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN harus 4–6 angka.');
    return withLock_(function () {
      var f = findBy_('FASILITATOR', 'id_fasilitator', id);
      if (!f) throw new Error('Fasilitator tidak ditemukan.');
      if (!f.username) throw new Error('Fasilitator ini belum punya username. Isi username lewat Edit.');
      var salt = newSalt_();
      updateBy_('FASILITATOR', 'id_fasilitator', id, { salt: salt, pin_hash: hash_(pin, salt) });
      destroySessionsOf_('fasilitator', id);
      logActivity_(s.username, s.role, 'Reset PIN fasilitator ' + id + ' (' + f.username + ')');
      return { pin: pin, username: f.username };
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
