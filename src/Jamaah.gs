/**
 * Jamaah.gs — CRUD data jamaah + import massal (format "MASTER DATA JAMAAH MIM").
 * Semua fungsi khusus admin.
 */

var STATUS_JAMAAH = ['Aktif', 'Nonaktif'];
var JAMAAH_FIELDS = ['nama', 'nama_panggilan', 'jenis_kelamin', 'tanggal_lahir', 'pekerjaan', 'no_hp',
                     'desa', 'rt', 'rw', 'kecamatan', 'kota', 'provinsi', 'kelompok', 'no_kk', 'alamat',
                     'tanggal_daftar', 'status', 'catatan'];

/** ID jamaah = isi barcode. Huruf besar/angka/tanda minus, 4–20 karakter (mis. MIM-0001). */
function isJamaahId_(id) { return /^[A-Z0-9][A-Z0-9\-]{3,19}$/.test(String(id || '')); }

/** Daftar seluruh jamaah + daftar kelompok (fasilitator). Filter dilakukan di browser. */
function listJamaah(token) {
  return respond_(function () {
    requireAuth_(token, 'pendataan');           // admin & petugas pendataan
    withLock_(function () { isiNoJamaahKosong_(); syncFasilitatorDariJamaah_(); });
    var rows = readAll_('DATA_JAMAAH').map(strip_);
    var desa = {};
    rows.forEach(function (j) { if (j.desa) desa[j.desa] = true; });
    return { rows: rows, kelompok: kelompokList_(rows), fasilitator: namaFasilitatorList_(), thumbs: thumbMap_(),
             desa: Object.keys(desa).sort(), prefix: ID_PREFIX };
  });
}

/** Tambah (tanpa id_jamaah) atau edit (dengan id_jamaah). */
function saveJamaah(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'pendataan');   // admin & petugas pendataan
    data = data || {};
    var rec = normalizeJamaah_(data, false);
    return withLock_(function () {
      if (data.id_jamaah) {
        var old = findBy_('DATA_JAMAAH', 'id_jamaah', data.id_jamaah);
        if (!old) throw new Error('Jamaah tidak ditemukan.');
        rec.tanggal_daftar = rec.tanggal_daftar || old.tanggal_daftar;
        if (s.role === 'pendataan') rec.status = old.status;   // aktif/nonaktif hanya oleh admin
        // Ganti No Jamaah (isi barcode) — khusus admin; riwayat absensi, foto & laporan ikut pindah.
        var noBaru = clean_(data.no_jamaah_baru).toUpperCase().replace(/\s+/g, '');
        var idAkhir = data.id_jamaah;
        if (noBaru && noBaru !== data.id_jamaah) {
          if (s.role !== 'admin') throw new Error('Hanya admin yang bisa mengganti No Jamaah.');
          gantiNoJamaah_(data.id_jamaah, noBaru);
          logActivity_(s.username, s.role, 'Ganti No Jamaah ' + data.id_jamaah + ' → ' + noBaru + ' (' + rec.nama + ')');
          idAkhir = noBaru;
        }
        var saved = updateBy_('DATA_JAMAAH', 'id_jamaah', idAkhir, rec);
        logActivity_(s.username, s.role, 'Edit jamaah ' + idAkhir + ' (' + rec.nama + ')');
        return strip_(saved);
      }
      rec.id_jamaah = nextId_('DATA_JAMAAH', 'id_jamaah', ID_PREFIX, ID_PAD);
      rec.tanggal_daftar = rec.tanggal_daftar || today_();
      if (s.role === 'pendataan') rec.status = 'Aktif';
      appendRow_('DATA_JAMAAH', rec);
      logActivity_(s.username, s.role, 'Tambah jamaah ' + rec.id_jamaah + ' (' + rec.nama + ')');
      return rec;
    });
  });
}

/**
 * Ubah No Jamaah lama → baru di semua tabel yang memakainya (di dalam withLock_).
 * Kartu lama (barcode No lama) tidak berlaku lagi → kartu perlu dicetak ulang.
 */
function gantiNoJamaah_(lama, baru) {
  if (!isJamaahId_(baru)) throw new Error('Format No Jamaah tidak valid (huruf besar, angka, tanda -, 4–20 karakter, mis. MIM-0150).');
  if (findBy_('DATA_JAMAAH', 'id_jamaah', baru)) throw new Error('No Jamaah ' + baru + ' sudah dipakai jamaah lain.');
  ['DATA_JAMAAH', 'ABSENSI', 'FOTO_JAMAAH', 'LAPORAN_FASILITATOR'].forEach(function (t) {
    var col = SCHEMA[t].indexOf('id_jamaah') + 1;
    if (!col) return;
    var sh = getSheet_(t);
    readAll_(t).forEach(function (r) { if (r.id_jamaah === lama) sh.getRange(r._row, col).setValue(baru); });
  });
}

/**
 * Hapus jamaah permanen (khusus admin) — mis. data ganda / salah input.
 * cek = true → hanya menghitung data terkait (untuk teks konfirmasi), tidak menghapus apa pun.
 * Ikut terhapus: foto, riwayat absensi, dan laporan fasilitator jamaah tersebut.
 */
function hapusJamaah(token, id, cek) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    id = clean_(id).toUpperCase();
    function hitung() {
      return {
        absensi: readAll_('ABSENSI').filter(function (a) { return a.id_jamaah === id; }).length,
        laporan: readAll_('LAPORAN_FASILITATOR').filter(function (l) { return l.id_jamaah === id; }).length,
        foto: !!findBy_('FOTO_JAMAAH', 'id_jamaah', id)
      };
    }
    var j = findBy_('DATA_JAMAAH', 'id_jamaah', id);
    if (!j) throw new Error('Jamaah tidak ditemukan.');
    if (cek) { var c = hitung(); c.nama = j.nama; return c; }
    return withLock_(function () {
      j = findBy_('DATA_JAMAAH', 'id_jamaah', id);
      if (!j) throw new Error('Jamaah tidak ditemukan.');
      var foto = findBy_('FOTO_JAMAAH', 'id_jamaah', id);
      if (foto && foto.file_id) { try { DriveApp.getFileById(foto.file_id).setTrashed(true); } catch (err) { /* file sudah tidak ada */ } }
      var n = {
        absensi: hapusBarisJamaah_('ABSENSI', id),
        laporan: hapusBarisJamaah_('LAPORAN_FASILITATOR', id),
        foto: hapusBarisJamaah_('FOTO_JAMAAH', id) > 0
      };
      deleteBy_('DATA_JAMAAH', 'id_jamaah', id);
      logActivity_(s.username, s.role, 'HAPUS jamaah ' + id + ' (' + j.nama + ') · ' + n.absensi + ' absensi, ' + n.laporan + ' laporan' + (n.foto ? ', foto' : '') + ' ikut terhapus');
      n.nama = j.nama;
      return n;
    });
  });
}

/** Hapus semua baris milik satu jamaah di sebuah tabel (dari bawah agar nomor baris tidak bergeser). */
function hapusBarisJamaah_(tabel, id) {
  var rows = readAll_(tabel).filter(function (r) { return r.id_jamaah === id; }).sort(function (a, b) { return b._row - a._row; });
  if (!rows.length) return 0;
  var sh = getSheet_(tabel);
  rows.forEach(function (r) { sh.deleteRow(r._row); });
  return rows.length;
}

/** Aktifkan / nonaktifkan jamaah (data tidak dihapus agar riwayat absensi tetap utuh). */
function setJamaahStatus(token, id, status) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (STATUS_JAMAAH.indexOf(status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var saved = updateBy_('DATA_JAMAAH', 'id_jamaah', id, { status: status });
      logActivity_(s.username, s.role, 'Status jamaah ' + id + ' → ' + status);
      return strip_(saved);
    });
  });
}

/**
 * Import massal (CSV/Excel, format MASTER DATA JAMAAH MIM atau template aplikasi).
 * - Baris dengan No Jamaah yang SUDAH ada → data diperbarui (kolom kosong di file tidak menghapus data lama).
 * - Baris dengan No Jamaah baru → ditambahkan dengan ID tersebut.
 * - Baris tanpa No Jamaah → dibuatkan ID baru (MIM-xxxx); dilewati bila nama + tgl lahir + HP sudah ada.
 */
function importJamaah(token, rows) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (!rows || !rows.length) throw new Error('File tidak berisi data.');
    if (rows.length > 3000) throw new Error('Maksimal 3000 baris sekali import.');
    return withLock_(function () {
      var existing = readAll_('DATA_JAMAAH');
      var byId = {}, seen = {};
      existing.forEach(function (j) { byId[j.id_jamaah] = j; seen[dupKey_(j)] = true; });
      var nextNum = parseInt(nextId_('DATA_JAMAAH', 'id_jamaah', ID_PREFIX, ID_PAD).substring(ID_PREFIX.length), 10);
      var added = [], updated = 0, skipped = [], warnings = [], idsInFile = {};
      var sh = getSheet_('DATA_JAMAAH');

      rows.forEach(function (raw, i) {
        var line = i + 2;
        try {
          var id = clean_(raw.id_jamaah).toUpperCase().replace(/\s+/g, '');
          if (id && !isJamaahId_(id)) throw new Error('No Jamaah "' + id + '" tidak valid (pakai huruf/angka/-, mis. MIM-0001)');
          if (id && idsInFile[id]) throw new Error('No Jamaah ' + id + ' dobel di dalam file');
          if (id) idsInFile[id] = true;
          var rec = normalizeJamaah_(raw, true, function (w) { warnings.push({ baris: line, nama: clean_(raw.nama), info: w }); });

          if (id && byId[id]) {                                  // perbarui
            var old = byId[id], merged = {};
            SCHEMA.DATA_JAMAAH.forEach(function (h) {
              merged[h] = (h in rec && rec[h] !== '' && raw[h] !== undefined && clean_(raw[h]) !== '') ? rec[h] : old[h];
            });
            merged.id_jamaah = id;
            sh.getRange(old._row, 1, 1, SCHEMA.DATA_JAMAAH.length).setValues([objToRow_('DATA_JAMAAH', merged)]);
            updated++;
            return;
          }
          if (!id) {
            var key = dupKey_(rec);
            if (seen[key]) throw new Error('sudah terdaftar (nama + tgl lahir + HP sama)');
            seen[key] = true;
            var num = String(nextNum++); while (num.length < ID_PAD) num = '0' + num;
            id = ID_PREFIX + num;
          } else if (id.indexOf(ID_PREFIX) === 0) {
            var n = parseInt(id.substring(ID_PREFIX.length), 10);
            if (!isNaN(n) && n >= nextNum) nextNum = n + 1;
          }
          rec.id_jamaah = id;
          rec.tanggal_daftar = rec.tanggal_daftar || today_();
          added.push(rec);
          byId[id] = rec;
        } catch (err) {
          skipped.push({ baris: line, nama: clean_(raw && raw.nama), alasan: err.message });
        }
      });
      appendRows_('DATA_JAMAAH', added);
      var fBaru = syncFasilitatorDariJamaah_();   // nama fasilitator baru dari file → masuk menu Fasilitator
      if (fBaru) warnings.push({ baris: '-', nama: '', info: fBaru + ' fasilitator baru ditambahkan ke menu Fasilitator' });
      logActivity_(s.username, s.role, 'Import jamaah: ' + added.length + ' ditambah, ' + updated + ' diperbarui, ' +
        skipped.length + ' dilewati, ' + warnings.length + ' peringatan');
      return { added: added.length, updated: updated, skipped: skipped, warnings: warnings.slice(0, 300) };
    });
  });
}

/** Dicatat saat admin mencetak kartu (data kartu memakai listJamaah). */
function logCetakKartu(token, ids) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    ids = (ids || []).map(clean_).filter(String);
    var info = ids.length <= 5 ? ids.join(', ') : ids.slice(0, 5).join(', ') + ' …';
    logActivity_(s.username, s.role, 'Cetak kartu ' + ids.length + ' jamaah (' + info + ')');
    return true;
  });
}

/** Dicatat saat admin mengekspor data jamaah / mengunduh template. */
function logExportJamaah(token, jenis, jumlah) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    logActivity_(s.username, s.role, 'Export data jamaah (' + clean_(jenis) + ', ' + (parseInt(jumlah, 10) || 0) + ' baris)');
    return true;
  });
}

/* ---------- Helper ---------- */

/** Baris yang ditempel langsung di sheet tanpa No Jamaah → diberi nomor otomatis (MIM-xxxx). */
function isiNoJamaahKosong_() {
  var rows = readAll_('DATA_JAMAAH').filter(function (j) { return !j.id_jamaah && j.nama; });
  if (!rows.length) return 0;
  var sh = getSheet_('DATA_JAMAAH');
  var next = parseInt(nextId_('DATA_JAMAAH', 'id_jamaah', ID_PREFIX, ID_PAD).substring(ID_PREFIX.length), 10);
  rows.forEach(function (j) {
    var num = String(next++); while (num.length < ID_PAD) num = '0' + num;
    j.id_jamaah = ID_PREFIX + num;
    j.tanggal_daftar = j.tanggal_daftar || today_();
    sh.getRange(j._row, 1, 1, SCHEMA.DATA_JAMAAH.length).setValues([objToRow_('DATA_JAMAAH', j)]);
  });
  logActivity_('system', 'system', 'No Jamaah otomatis untuk ' + rows.length + ' baris yang ditempel langsung di sheet');
  return rows.length;
}

/**
 * Rapikan & validasi satu data jamaah.
 * lenient=true (import): masalah kecil (no HP/KK aneh, JK kosong) jadi peringatan, bukan penolakan.
 */
function normalizeJamaah_(d, lenient, warn) {
  warn = warn || function () {};
  function fail(msg) { if (lenient) warn(msg); else throw new Error(msg); }
  var rec = {};
  JAMAAH_FIELDS.forEach(function (f) { rec[f] = clean_(d[f]).replace(/\s+/g, ' '); });
  rec.jenis_kelamin = normalizeJk_(d.jenis_kelamin);
  rec.no_hp = normalizePhone_(d.no_hp);
  rec.no_kk = clean_(d.no_kk).replace(/\D/g, '');
  rec.tanggal_lahir = normalizeDate_(d.tanggal_lahir);
  rec.tanggal_daftar = normalizeDate_(d.tanggal_daftar);
  rec.rt = clean_(d.rt).replace(/^0+(?=\d)/, '');
  rec.rw = clean_(d.rw).replace(/^0+(?=\d)/, '');

  if (!rec.nama) throw new Error('Nama lengkap wajib diisi');
  if (rec.nama.length > 100) throw new Error('Nama terlalu panjang');
  if (clean_(d.jenis_kelamin) && !rec.jenis_kelamin) fail('Jenis kelamin "' + clean_(d.jenis_kelamin) + '" tidak dikenal (pakai Ikhwan/Akhwat)');
  if (!rec.jenis_kelamin && !lenient) throw new Error('Jenis kelamin wajib diisi');
  if (!rec.jenis_kelamin && lenient) warn('Jenis kelamin kosong');
  if (rec.no_hp && !/^(\+62|62|0)8\d{7,12}$/.test(rec.no_hp)) fail('Format no HP tidak valid: ' + rec.no_hp);
  if (rec.no_kk && rec.no_kk.length !== 16) warn('No KK ' + rec.no_kk.length + ' digit (seharusnya 16)');
  if (clean_(d.tanggal_lahir) && !rec.tanggal_lahir) fail('Tanggal lahir tidak valid (dd/mm/yyyy)');
  if (clean_(d.tanggal_daftar) && !rec.tanggal_daftar) fail('Tanggal daftar tidak valid (dd/mm/yyyy)');

  var st = clean_(d.status).toLowerCase();
  if (!st || st === 'aktif') rec.status = 'Aktif';
  else if (st.indexOf('tidak') === 0 || st.indexOf('non') === 0 || st === 'keluar' || st === 'pindah') rec.status = 'Nonaktif';
  else {                                              // mis. "Jarang" → tetap Aktif, keterangan disimpan di catatan
    rec.status = 'Aktif';
    rec.catatan = (rec.catatan ? rec.catatan + ' · ' : '') + 'Status: ' + clean_(d.status);
  }
  return rec;
}

function normalizeJk_(v) {
  var s = clean_(v).toLowerCase();
  if (!s) return '';
  if (s === 'l' || s.indexOf('laki') === 0 || s === 'pria' || s === 'ikhwan' || s === 'lk') return 'L';
  if (s === 'p' || s.indexOf('perempuan') === 0 || s === 'wanita' || s === 'akhwat' || s === 'pr') return 'P';
  return '';
}

function normalizePhone_(v) {
  var s = clean_(v).replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (/^8\d+$/.test(s)) s = '0' + s;          // angka dari Excel kehilangan 0 di depan
  return s;
}

/** Terima yyyy-mm-dd, dd/mm/yyyy, atau dd-mm-yyyy. Return yyyy-mm-dd atau ''. */
function normalizeDate_(v) {
  var s = clean_(v);
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function dupKey_(j) {
  return clean_(j.nama).toLowerCase().replace(/\s+/g, ' ') + '|' + clean_(j.tanggal_lahir) + '|' + clean_(j.no_hp);
}

function kelompokList_(rows) {
  var set = {};
  (rows || readAll_('DATA_JAMAAH')).forEach(function (j) { if (j.kelompok) set[j.kelompok] = true; });
  return Object.keys(set).sort();
}

/** Peserta program = jamaah Aktif yang kelompoknya termasuk kelompok_peserta (kosong = semua). */
function pesertaProgram_(program, jamaahRows) {
  var groups = splitList_(program.kelompok_peserta);
  return (jamaahRows || readAll_('DATA_JAMAAH')).filter(function (j) {
    return j.status === 'Aktif' && (!groups.length || groups.indexOf(j.kelompok) !== -1);
  });
}
