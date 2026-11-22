/**
 * Setup.gs — struktur tabel (sheet), migrasi kolom, program MIM, data dummy.
 *
 * Jalankan sekali dari editor Apps Script: pilih fungsi `setupAll` → Run.
 * Aman dijalankan ulang: sheet yang ada tidak dihapus; bila urutan/daftar kolom berubah,
 * data lama dipindahkan otomatis berdasarkan nama kolom.
 */

/** Awalan ID jamaah (isi barcode). Data MIM memakai MIM-0001, MIM-0002, … */
var ID_PREFIX = 'MIM-';
var ID_PAD = 4;
var DUMMY_PREFIX = 'DMY-';

var SCHEMA = {
  // 18 kolom pertama = persis file "MASTER DATA JAMAAH" (urutan & judul sama).
  // 2 kolom terakhir milik aplikasi: Fasilitator (kelompok, opsional) & Tanggal Daftar.
  DATA_JAMAAH: ['id_jamaah', 'nama', 'nama_panggilan', 'jenis_kelamin', 'tanggal_lahir', 'usia', 'pekerjaan', 'no_hp',
                'desa', 'rt', 'rw', 'kecamatan', 'kota', 'provinsi', 'no_kk', 'status', 'alamat', 'catatan',
                'kelompok', 'tanggal_daftar'],
  // kelompok_peserta: daftar fasilitator/kelompok yang ikut program (pisah koma). Kosong = semua jamaah aktif.
  PROGRAM:     ['id_program', 'nama_program', 'deskripsi', 'jadwal', 'kelompok_peserta', 'status'],
  SESI:        ['id_sesi', 'id_program', 'tanggal', 'jam_mulai', 'keterangan', 'status'],
  ADMIN:       ['id_admin', 'nama', 'username', 'password_hash', 'salt'],
  // jenis: 'absensi' (scan di HP, default) | 'pendataan' (melengkapi & menambah data master jamaah)
  PETUGAS:     ['id_petugas', 'nama', 'username', 'pin_hash', 'salt', 'program_ids', 'status', 'jenis'],
  // waktu_selesai/petugas_selesai/hadiah: absen SELESAI di akhir program → jamaah yang tadi HADIR mendapat hadiah.
  ABSENSI:     ['id_absensi', 'id_sesi', 'id_program', 'id_jamaah', 'status', 'waktu_scan',
                'id_petugas', 'metode', 'keterangan', 'waktu_selesai', 'petugas_selesai', 'hadiah'],
  LOG:         ['waktu', 'user', 'role', 'aktivitas'],
  // Master fasilitator (pendamping jamaah). DATA_JAMAAH.kelompok berisi NAMA fasilitator.
  // username/pin_hash/salt: akun login fasilitator (melaporkan perkembangan jamaah binaannya). Kosong = belum punya akun.
  // kelas: tingkat kelas yang dipegang (Iqro' 1 … Qur'an Besar) = indikator awal jamaah binaan; kategori: Ibu & Bapak / Remaja & Anak.
  // anggota_1/anggota_2: id_petugas akun fasilitator (per orang, dibuat di Kelola User). nama = gabungan nama anggota (A & B).
  FASILITATOR: ['id_fasilitator', 'nama', 'no_hp', 'jenis_kelamin', 'status', 'catatan', 'username', 'pin_hash', 'salt', 'kelas', 'kategori', 'anggota_1', 'anggota_2'],
  // Laporan perkembangan bacaan jamaah oleh fasilitator: indikator Iqro' 1 … Qur'an Besar, keputusan Tetap / Lanjut.
  LAPORAN_FASILITATOR: ['id_laporan', 'tanggal', 'id_fasilitator', 'nama_fasilitator', 'id_jamaah', 'nama_jamaah',
                        'indikator', 'keputusan', 'keterangan', 'waktu', 'id_sesi'],
  // Foto jamaah: thumbnail WebP kecil (data URL) untuk daftar + ID file foto besar di Drive (privat).
  FOTO_JAMAAH: ['id_jamaah', 'thumb', 'file_id', 'diperbarui'],
  // Profil yayasan & pengaturan kartu (kunci–nilai). Logo disimpan sebagai data URL yang dipecah per 40.000 karakter.
  PENGATURAN:  ['kunci', 'nilai']
};

/** Nama sheet di Google Sheets (bila beda dari nama tabel di kode). */
var SHEET_NAMES = { DATA_JAMAAH: 'DATA MASTER JAMAAH', LAPORAN_FASILITATOR: 'LAPORAN FASILITATOR' };

/**
 * Judul kolom yang tampil di sheet (bila beda dari nama field). Sheet DATA MASTER JAMAAH memakai judul
 * & format yang sama dengan file master: Jenis Kelamin = Ikhwan/Akhwat, tanggal = dd/mm/yyyy,
 * Status = Aktif / Tidak Aktif — supaya data bisa langsung di-copy-paste dari file master.
 */
var COLUMN_LABELS = {
  DATA_JAMAAH: {
    id_jamaah: 'No Jamaah', nama: 'Nama Lengkap', nama_panggilan: 'Nama Panggilan', jenis_kelamin: 'Jenis Kelamin',
    tanggal_lahir: 'Tanggal Lahir', usia: 'Usia', pekerjaan: 'Pekerjaan', no_hp: 'No HP',
    desa: 'Desa / Kampung', rt: 'RT', rw: 'RW', kecamatan: 'Kecamatan', kota: 'Kota / Kabupaten', provinsi: 'Provinsi',
    kelompok: 'Fasilitator', no_kk: 'Kartu Keluarga', status: 'Status', alamat: 'Alamat Asli', catatan: 'Catatan',
    tanggal_daftar: 'Tanggal Daftar'
  }
};
/** Nama lama sheet (versi sebelumnya) — otomatis di-rename & dikonversi. */
var OLD_SHEET_NAMES = { DATA_JAMAAH: ['DATA_JAMAAH'] };

function sheetName_(name) { return SHEET_NAMES[name] || name; }
function headerRow_(name) {
  var lb = COLUMN_LABELS[name];
  return SCHEMA[name].map(function (k) { return lb && lb[k] ? lb[k] : k; });
}
/** Cocokkan judul kolom apa pun (label, nama field, atau alias) ke nama field. */
var HEADER_ALIASES = { kelompok: ['fasilitator', 'kelompok', 'halaqah'],
  desa: ['desa kampung', 'desa'], kota: ['kota kabupaten', 'kota'], no_kk: ['kartu keluarga', 'no kk'], alamat: ['alamat asli', 'alamat'] };
function headerKey_(name, h) {
  var n = String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!n) return null;
  var keys = SCHEMA[name], lb = COLUMN_LABELS[name] || {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (n === k.replace(/_/g, ' ') || (lb[k] && n === lb[k].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) ||
        (HEADER_ALIASES[k] && HEADER_ALIASES[k].indexOf(n) !== -1)) return k;
  }
  return null;
}

/** Program kegiatan MIM. */
var PROGRAM_MIM = [
  ['MIM - Menghafal Itu Mudah', 'Program menghafal Al-Qur\'an'],
  ['FYB - Festival Yatim Bahagia', 'Festival untuk anak yatim'],
  ['Bazar Ramadhan', 'Bazar selama bulan Ramadhan'],
  ['Subuh Ramadhan', 'Sholat Subuh berjamaah Ramadhan'],
  ['Dzuhur Ramadhan', 'Sholat Dzuhur berjamaah Ramadhan'],
  ['Ashar Ramadhan', 'Sholat Ashar berjamaah Ramadhan'],
  ['Maghrib Ramadhan', 'Sholat Maghrib berjamaah Ramadhan'],
  ['Isya Ramadhan', 'Sholat Isya berjamaah Ramadhan'],
  ['IFTAR Ramadhan', 'Buka puasa bersama'],
  ['Terawih Ramadhan', 'Sholat Terawih berjamaah'],
  ['Kajian Botram', 'Kajian sambil makan bersama (botram)'],
  ['Pasar Bahagia', 'Pasar Bahagia'],
  ['OMG', 'OMG']
];

/** Satu tombol: buat sheet, isi data awal, pasang trigger. */
function setupAll() {
  guardOwner_();
  var info = setupDatabase();
  var prog = pasangProgramMIM();
  var seed = seedDummyData();
  installTriggers();
  var msg = info + '\n' + prog + '\n' + seed + '\nSpreadsheet: ' + getDb_().getUrl();
  console.log(msg);
  return msg;
}

/** Buat semua sheet beserta header bila belum ada (dan migrasikan kolom bila berubah). */
function setupDatabase() {
  guardOwner_();
  var created = [], migrated = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var r = ensureSheet_(name);
    if (r === 'new') created.push(name);
    if (r === 'migrated') migrated.push(name);
  });
  var ss = getDb_();
  ['Sheet1', 'Lembar1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  return (created.length ? 'Sheet dibuat: ' + created.join(', ') : 'Semua sheet sudah ada.') +
         (migrated.length ? ' Kolom dimigrasi: ' + migrated.join(', ') : '');
}

/** Pastikan sheet ada + header benar. Return 'new' | 'migrated' | ''. */
function ensureSheet_(name) {
  var ss = getDb_();
  var sh = ss.getSheetByName(sheetName_(name));
  var result = '';
  if (!sh) {                                         // nama lama (versi sebelumnya) → ganti nama
    (OLD_SHEET_NAMES[name] || []).some(function (old) {
      var o = ss.getSheetByName(old);
      if (o) { o.setName(sheetName_(name)); sh = o; result = 'migrated'; }
      return !!o;
    });
  }
  if (!sh) { sh = ss.insertSheet(sheetName_(name)); result = 'new'; }
  var headers = headerRow_(name);
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  var lastCol = Math.max(sh.getLastColumn ? sh.getLastColumn() : headers.length, headers.length);
  var current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var same = headers.every(function (h, i) { return current[i] === h; });
  if (!same) {
    var lastRow = sh.getLastRow();
    var hasHeader = current.some(function (h) { return h; });
    if (hasHeader && lastRow > 1) {
      migrateColumns_(name, sh, current, lastRow, lastCol);
      result = 'migrated';
    } else {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#065F46').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  // Semua kolom format teks agar tanggal, jam, no HP/KK (awalan 0, 16 digit) tidak diubah otomatis.
  sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  return result;
}

/**
 * Susun ulang data mengikuti struktur baru, dicocokkan berdasarkan JUDUL kolom (label / nama field / alias).
 * Format nilai dinormalkan (mis. L → Ikhwan, 2026-01-20 → 20/01/2026).
 * Kolom yang tidak dikenal (tambahan buatan sendiri) TIDAK dibuang — dipindah ke kanan.
 */
function migrateColumns_(name, sh, oldHeaders, lastRow, lastCol) {
  var keys = SCHEMA[name], newHeaders = headerRow_(name);
  var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var idx = {}, extra = [];
  oldHeaders.forEach(function (h, i) {
    if (!h) return;
    var k = headerKey_(name, h);
    if (k && !(k in idx)) idx[k] = i; else extra.push(i);
  });
  var rows = data.filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {};
    keys.forEach(function (k) { o[k] = k in idx ? cellToString_(r[idx[k]]) : ''; });
    return objToRow_(name, decodeRow_(name, o)).concat(extra.map(function (i) { return cellToString_(r[i]); }));
  });
  var header = newHeaders.concat(extra.map(function (i) { return oldHeaders[i]; }));
  if (sh.getMaxColumns() < header.length) sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
  sh.getRange(1, 1, lastRow, lastCol).clearContent();
  sh.getRange(1, 1, lastRow, header.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

/** Tambahkan 13 program MIM yang belum ada (berdasarkan nama). Aman dijalankan ulang. */
function pasangProgramMIM() {
  guardOwner_();
  var existing = {};
  readAll_('PROGRAM').forEach(function (p) { existing[p.nama_program.toLowerCase()] = true; });
  var added = [];
  PROGRAM_MIM.forEach(function (p) {
    if (existing[p[0].toLowerCase()]) return;
    var rec = { id_program: nextId_('PROGRAM', 'id_program', 'PRG', 3), nama_program: p[0], deskripsi: p[1],
                jadwal: '', kelompok_peserta: '', status: 'Aktif' };
    appendRow_('PROGRAM', rec);
    added.push(rec.nama_program);
  });
  if (added.length) logActivity_('system', 'system', 'Program MIM ditambahkan: ' + added.join(', '));
  return added.length ? added.length + ' program MIM ditambahkan.' : 'Program MIM sudah lengkap.';
}

function programIdByName_(nama) {
  var p = readAll_('PROGRAM').filter(function (x) { return x.nama_program.toLowerCase() === nama.toLowerCase(); })[0];
  return p ? p.id_program : '';
}

/**
 * Data awal untuk uji coba: admin, 2 petugas, dan (bila sheet jamaah kosong) 20 jamaah DUMMY
 * ber-ID DMY-xxxx yang bisa dihapus lewat hapusJamaahDummy() setelah data asli diimport.
 */
function seedDummyData() {
  guardOwner_();
  var done = [];
  var today = today_();
  var mimId = programIdByName_('MIM - Menghafal Itu Mudah');
  var botramId = programIdByName_('Kajian Botram');

  if (readAll_('DATA_JAMAAH').length === 0) {
    var names = [
      ['Ahmad Fauzi', 'L'], ['Siti Aminah', 'P'], ['Muhammad Rizki', 'L'], ['Nur Aisyah', 'P'],
      ['Abdullah Hasan', 'L'], ['Fatimah Zahra', 'P'], ['Yusuf Maulana', 'L'], ['Khadijah Putri', 'P'],
      ['Ilham Ramadhan', 'L'], ['Zainab Salsabila', 'P'], ['Umar Faruq', 'L'], ['Maryam Hanifah', 'P'],
      ['Hamzah Akbar', 'L'], ['Aisyah Rahma', 'P'], ['Bilal Saputra', 'L'], ['Hafsah Nabila', 'P'],
      ['Salman Alfarisi', 'L'], ['Ruqayyah Azzahra', 'P'], ['Zaid Firdaus', 'L'], ['Sumayyah Lestari', 'P']
    ];
    var groups = ['Fasilitator A', 'Fasilitator B', 'Fasilitator C'];
    appendRows_('DATA_JAMAAH', names.map(function (n, i) {
      var num = String(i + 1); while (num.length < ID_PAD) num = '0' + num;
      return {
        id_jamaah: DUMMY_PREFIX + num, nama: n[0], nama_panggilan: n[0].split(' ')[0], jenis_kelamin: n[1],
        tanggal_lahir: '', pekerjaan: '', no_hp: '', desa: 'Contoh', rt: '', rw: '',
        kecamatan: '', kota: '', provinsi: '', kelompok: groups[i % 3], no_kk: '', alamat: '',
        tanggal_daftar: today, status: 'Aktif', catatan: 'DATA DUMMY — hapus setelah import data asli'
      };
    }));
    done.push('20 jamaah dummy (DMY-0001…DMY-0020)');
  }

  if (readAll_('SESI').length === 0 && mimId) {
    appendRow_('SESI', { id_sesi: 'SES0001', id_program: mimId, tanggal: today,
      jam_mulai: '', keterangan: 'Sesi contoh', status: 'Dibuka' });
    done.push('1 sesi hari ini (MIM, Dibuka)');
  }

  if (readAll_('ADMIN').length === 0) {
    var s1 = newSalt_();
    appendRow_('ADMIN', { id_admin: 'ADM001', nama: 'Administrator', username: 'admin',
      password_hash: hash_('admin123', s1), salt: s1 });
    done.push('admin (admin / admin123)');
  }

  if (readAll_('PETUGAS').length === 0) {
    var p1 = newSalt_(), p2 = newSalt_();
    appendRows_('PETUGAS', [
      { id_petugas: 'PTG001', nama: 'Petugas Satu', username: 'petugas1', pin_hash: hash_('1234', p1),
        salt: p1, program_ids: mimId, status: 'Aktif' },
      { id_petugas: 'PTG002', nama: 'Petugas Dua', username: 'petugas2', pin_hash: hash_('1234', p2),
        salt: p2, program_ids: [mimId, botramId].filter(String).join(','), status: 'Aktif' }
    ]);
    done.push('2 petugas (petugas1 & petugas2, PIN 1234)');
  }

  if (done.length) logActivity_('system', 'system', 'Data awal: ' + done.join(', '));
  return done.length ? 'Data awal diisi: ' + done.join(', ') : 'Data awal dilewati (sheet sudah berisi).';
}

/** Hapus jamaah dummy (DMY-…) beserta absensinya. Jalankan setelah data asli diimport. */
function hapusJamaahDummy() {
  guardOwner_();
  return withLock_(function () {
    var shJ = getSheet_('DATA_JAMAAH'), shA = getSheet_('ABSENSI');
    // DMY-… = dummy versi sekarang; JMH… = dummy versi awal (sebelum data MIM).
    function isDummy(id) { return id.indexOf(DUMMY_PREFIX) === 0 || /^JMH\d{4}$/.test(id); }
    var rowsJ = readAll_('DATA_JAMAAH').filter(function (j) { return isDummy(j.id_jamaah); });
    var rowsA = readAll_('ABSENSI').filter(function (a) { return isDummy(a.id_jamaah); });
    rowsA.map(function (a) { return a._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { shA.deleteRow(r); });
    rowsJ.map(function (j) { return j._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { shJ.deleteRow(r); });
    // Fasilitator yang dibuat otomatis dari data dummy & kini tidak punya jamaah → ikut dihapus.
    var dipakai = {};
    readAll_('DATA_JAMAAH').forEach(function (j) { if (j.kelompok) dipakai[j.kelompok] = true; });
    var shF = getSheet_('FASILITATOR');
    var rowsF = readAll_('FASILITATOR').filter(function (f) { return !dipakai[f.nama] && /^Otomatis dari data jamaah/.test(f.catatan); });
    rowsF.map(function (f) { return f._row; }).sort(function (a, b) { return b - a; }).forEach(function (r) { shF.deleteRow(r); });
    var msg = 'Dihapus: ' + rowsJ.length + ' jamaah dummy, ' + rowsA.length + ' absensi dummy, ' + rowsF.length + ' fasilitator dummy.';
    logActivity_('system', 'system', msg);
    console.log(msg);
    return msg;
  });
}

/** Trigger berkala untuk membersihkan token login yang kedaluwarsa. */
function installTriggers() {
  guardOwner_();
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'cleanupTokens';
  });
  if (!exists) ScriptApp.newTrigger('cleanupTokens').timeBased().everyHours(6).create();
}
