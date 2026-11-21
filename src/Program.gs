/**
 * Program.gs — CRUD program & sesi (khusus admin).
 * Fungsi sesi untuk petugas (buka sesi hari ini, tutup sesi) ada di Absensi.gs.
 */

var STATUS_PROGRAM = ['Aktif', 'Selesai'];
var STATUS_SESI = ['Dibuka', 'Ditutup'];

/** Daftar program + jumlah peserta & sesi, plus daftar kelompok untuk form. */
function listPrograms(token) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var jamaah = readAll_('DATA_JAMAAH');
    var sesi = readAll_('SESI');
    var rows = readAll_('PROGRAM').map(function (p) {
      var o = strip_(p);
      o.jumlah_peserta = pesertaProgram_(p, jamaah).length;
      o.jumlah_sesi = sesi.filter(function (x) { return x.id_program === p.id_program; }).length;
      return o;
    });
    withLock_(syncFasilitatorDariJamaah_);
    return { rows: rows, kelompok: namaFasilitatorList_() };   // pilihan peserta = fasilitator aktif
  });
}

function saveProgram(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    data = data || {};
    var rec = {
      nama_program: clean_(data.nama_program),
      deskripsi: clean_(data.deskripsi),
      jadwal: clean_(data.jadwal),
      kelompok_peserta: (Array.isArray(data.kelompok_peserta) ? data.kelompok_peserta : splitList_(data.kelompok_peserta))
        .map(clean_).filter(String).join(', '),
      status: clean_(data.status) || 'Aktif'
    };
    if (!rec.nama_program) throw new Error('Nama program wajib diisi.');
    if (STATUS_PROGRAM.indexOf(rec.status) === -1) throw new Error('Status program tidak valid.');
    return withLock_(function () {
      var dup = readAll_('PROGRAM').filter(function (p) {
        return p.nama_program.toLowerCase() === rec.nama_program.toLowerCase() && p.id_program !== data.id_program;
      });
      if (dup.length) throw new Error('Nama program sudah dipakai.');
      if (data.id_program) {
        var saved = updateBy_('PROGRAM', 'id_program', data.id_program, rec);
        logActivity_(s.username, s.role, 'Edit program ' + data.id_program + ' (' + rec.nama_program + ')');
        return strip_(saved);
      }
      rec.id_program = nextId_('PROGRAM', 'id_program', 'PRG', 3);
      appendRow_('PROGRAM', rec);
      logActivity_(s.username, s.role, 'Tambah program ' + rec.id_program + ' (' + rec.nama_program + ')');
      return rec;
    });
  });
}

/** Hapus program hanya bila belum punya sesi. Bila sudah, sarankan ubah status ke Selesai. */
function deleteProgram(token, id) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    return withLock_(function () {
      var hasSesi = readAll_('SESI').some(function (x) { return x.id_program === id; });
      if (hasSesi) throw new Error('Program sudah punya sesi/absensi. Ubah statusnya menjadi "Selesai" saja.');
      var rec = deleteBy_('PROGRAM', 'id_program', id);
      logActivity_(s.username, s.role, 'Hapus program ' + id + ' (' + rec.nama_program + ')');
      return true;
    });
  });
}

/* ========================= SESI ========================= */

/** Sesi milik satu program (terbaru dulu) + jumlah hadir per sesi. */
function listSesi(token, idProgram) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var program = findBy_('PROGRAM', 'id_program', idProgram);
    if (!program) throw new Error('Program tidak ditemukan.');
    var absensi = readAll_('ABSENSI');
    var count = {};
    absensi.forEach(function (a) {
      if (a.id_program !== idProgram) return;
      count[a.id_sesi] = count[a.id_sesi] || { hadir: 0, total: 0 };
      count[a.id_sesi].total++;
      if (a.status === 'Hadir') count[a.id_sesi].hadir++;
    });
    var rows = readAll_('SESI').filter(function (x) { return x.id_program === idProgram; }).map(function (x) {
      var o = strip_(x);
      o.hadir = (count[x.id_sesi] || {}).hadir || 0;
      o.tercatat = (count[x.id_sesi] || {}).total || 0;
      return o;
    });
    rows.sort(function (a, b) { return (b.tanggal + b.jam_mulai).localeCompare(a.tanggal + a.jam_mulai); });
    return { program: strip_(program), peserta: pesertaProgram_(program).length, rows: rows };
  });
}

function saveSesi(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    data = data || {};
    var rec = validateSesi_(data);
    return withLock_(function () {
      assertSesiUnik_(rec, data.id_sesi);
      if (data.id_sesi) {
        var saved = updateBy_('SESI', 'id_sesi', data.id_sesi, rec);
        logActivity_(s.username, s.role, 'Edit sesi ' + data.id_sesi + ' (' + rec.tanggal + ')');
        return strip_(saved);
      }
      rec.id_sesi = nextId_('SESI', 'id_sesi', 'SES', 4);
      appendRow_('SESI', rec);
      logActivity_(s.username, s.role, 'Tambah sesi ' + rec.id_sesi + ' program ' + rec.id_program + ' (' + rec.tanggal + ')');
      return rec;
    });
  });
}

/** Buka / tutup sesi. */
function setSesiStatus(token, id, status) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (STATUS_SESI.indexOf(status) === -1) throw new Error('Status sesi tidak valid.');
    return withLock_(function () {
      var saved = updateBy_('SESI', 'id_sesi', id, { status: status });
      logActivity_(s.username, s.role, (status === 'Dibuka' ? 'Buka' : 'Tutup') + ' sesi ' + id);
      return strip_(saved);
    });
  });
}

/** Hapus sesi hanya bila belum ada absensi tercatat. */
function deleteSesi(token, id) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    return withLock_(function () {
      var used = readAll_('ABSENSI').some(function (a) { return a.id_sesi === id; });
      if (used) throw new Error('Sesi sudah berisi absensi, tidak bisa dihapus. Tutup sesi saja.');
      deleteBy_('SESI', 'id_sesi', id);
      logActivity_(s.username, s.role, 'Hapus sesi ' + id);
      return true;
    });
  });
}

function validateSesi_(d) {
  var rec = {
    id_program: clean_(d.id_program),
    tanggal: normalizeDate_(d.tanggal),
    jam_mulai: clean_(d.jam_mulai),
    keterangan: clean_(d.keterangan),
    status: clean_(d.status) || 'Dibuka'
  };
  var p = findBy_('PROGRAM', 'id_program', rec.id_program);
  if (!p) throw new Error('Program tidak ditemukan.');
  if (!rec.tanggal) throw new Error('Tanggal sesi wajib diisi (yyyy-mm-dd).');
  if (rec.jam_mulai && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rec.jam_mulai)) throw new Error('Format jam harus HH:MM, mis. 05:30.');
  if (STATUS_SESI.indexOf(rec.status) === -1) throw new Error('Status sesi tidak valid.');
  return rec;
}

/** Satu program tidak boleh punya dua sesi di tanggal & jam yang sama. */
function assertSesiUnik_(rec, exceptId) {
  var dup = readAll_('SESI').some(function (x) {
    return x.id_program === rec.id_program && x.tanggal === rec.tanggal &&
           x.jam_mulai === rec.jam_mulai && x.id_sesi !== exceptId;
  });
  if (dup) throw new Error('Sudah ada sesi program ini pada tanggal & jam yang sama.');
}
