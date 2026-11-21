/**
 * Absensi.gs — fungsi untuk aplikasi petugas (scan, manual, tutup sesi).
 * Semua fungsi memeriksa token + penugasan program di server.
 */

var STATUS_ABSEN = ['Hadir', 'Izin', 'Sakit', 'Alpa'];
var METODE_ABSEN = ['Scan Kamera', 'Scanner', 'Manual'];

/** Beranda petugas: program yang ditugaskan + sesi hari ini masing-masing. */
function petugasHome(token) {
  return respond_(function () {
    var s = requireAuth_(token, 'petugas');
    var today = today_();
    var mine = s.role === 'admin' ? null : s.programs;
    var programs = readAll_('PROGRAM').filter(function (p) {
      return p.status === 'Aktif' && (!mine || mine.indexOf(p.id_program) !== -1);
    });
    var sesi = readAll_('SESI').filter(function (x) { return x.tanggal === today; });
    var absensi = readAll_('ABSENSI');
    var jamaah = readAll_('DATA_JAMAAH');
    var hadir = {};
    absensi.forEach(function (a) { if (a.status === 'Hadir') hadir[a.id_sesi] = (hadir[a.id_sesi] || 0) + 1; });
    return {
      today: today,
      nama: s.nama,
      programs: programs.map(function (p) {
        var ss = sesi.filter(function (x) { return x.id_program === p.id_program; })
          .sort(function (a, b) { return (a.jam_mulai || '').localeCompare(b.jam_mulai || ''); })
          .map(function (x) {
            return { id_sesi: x.id_sesi, jam_mulai: x.jam_mulai, keterangan: x.keterangan,
                     status: x.status, hadir: hadir[x.id_sesi] || 0 };
          });
        return { id_program: p.id_program, nama_program: p.nama_program, jadwal: p.jadwal,
                 peserta: pesertaProgram_(p, jamaah).length, sesi: ss };
      })
    };
  });
}

/** Petugas membuka sesi hari ini untuk programnya (bila belum ada). */
function bukaSesiHariIni(token, idProgram) {
  return respond_(function () {
    var s = requireAuth_(token, 'petugas', idProgram);
    var p = findBy_('PROGRAM', 'id_program', idProgram);
    if (!p || p.status !== 'Aktif') throw new Error('Program tidak aktif.');
    var today = today_();
    return withLock_(function () {
      var existing = readAll_('SESI').filter(function (x) { return x.id_program === idProgram && x.tanggal === today; });
      var open = existing.filter(function (x) { return x.status === 'Dibuka'; })[0];
      if (open) return strip_(open);
      if (existing.length) throw new Error('Sesi hari ini sudah ditutup. Minta admin membukanya kembali.');
      var m = String(p.jadwal || '').match(/(\d{1,2})[:.](\d{2})/);
      var rec = {
        id_sesi: nextId_('SESI', 'id_sesi', 'SES', 4), id_program: idProgram, tanggal: today,
        jam_mulai: m ? ('0' + m[1]).slice(-2) + ':' + m[2] : Utilities.formatDate(new Date(), tz_(), 'HH:mm'),
        keterangan: 'Dibuka oleh ' + s.nama, status: 'Dibuka'
      };
      appendRow_('SESI', rec);
      logActivity_(s.username, s.role, 'Buka sesi ' + rec.id_sesi + ' (' + p.nama_program + ')');
      return rec;
    });
  });
}

/**
 * Data lengkap untuk layar scan (disimpan di HP agar scan instan & bisa offline):
 * sesi, program, semua jamaah aktif (ringkas), id peserta, dan absensi yang sudah ada.
 */
function getSesiData(token, idSesi) {
  return respond_(function () {
    var sesi = findBy_('SESI', 'id_sesi', idSesi);
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    var s = requireAuth_(token, 'petugas', sesi.id_program);
    var p = findBy_('PROGRAM', 'id_program', sesi.id_program);
    var jamaahRows = readAll_('DATA_JAMAAH');
    var aktif = jamaahRows.filter(function (j) { return j.status === 'Aktif'; });
    return {
      sesi: strip_(sesi),
      program: { id_program: p.id_program, nama_program: p.nama_program, jadwal: p.jadwal },
      // Ringkas (array) agar hemat data HP. Urutan: lihat JAMAAH_HP_FIELDS di absensi.html.
      jamaah: aktif.map(function (j) {
        return [j.id_jamaah, j.nama, j.desa, j.jenis_kelamin, j.nama_panggilan,
                j.tanggal_lahir, j.pekerjaan, j.no_hp, j.rt, j.rw, j.kecamatan, j.kota, j.provinsi,
                j.no_kk, j.alamat, j.catatan, j.kelompok, j.tanggal_daftar];
      }),
      peserta: pesertaProgram_(p, jamaahRows).map(function (j) { return j.id_jamaah; }),
      records: sesiRecords_(idSesi),
      petugas: s.nama,
      serverTime: now_(),
      formMeta: formMetaJamaah_(jamaahRows),
      thumbs: thumbMap_()           // foto kecil untuk hasil scan, daftar, & Input Manual
    };
  });
}

/** Pilihan & isian default untuk formulir pendaftaran jamaah (diambil dari data yang sudah ada). */
function formMetaJamaah_(rows) {
  function common(k) {
    var c = {}; rows.forEach(function (j) { if (j[k]) c[j[k]] = (c[j[k]] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
  }
  var desa = common('desa'), kec = common('kecamatan'), kota = common('kota'), prov = common('provinsi');
  return {
    fasilitator: namaFasilitatorList_(),
    desa: desa.slice(0, 50), pekerjaan: common('pekerjaan').slice(0, 30),
    defaults: { desa: desa[0] || '', kecamatan: kec[0] || '', kota: kota[0] || '', provinsi: prov[0] || '' }
  };
}

/**
 * Petugas yang SEDANG BERTUGAS (punya sesi Dibuka hari ini di programnya) mendaftarkan jamaah baru.
 * Data masuk ke DATA MASTER JAMAAH; opsional langsung dicatat Hadir di sesi tersebut.
 */
function daftarJamaahPetugas(token, idSesi, data, tandaiHadir) {
  return respond_(function () {
    var sesi = findBy_('SESI', 'id_sesi', idSesi);
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    var s = requireAuth_(token, 'petugas', sesi.id_program);
    if (sesi.status !== 'Dibuka' || sesi.tanggal !== today_()) {
      throw new Error('Pendaftaran hanya bisa saat bertugas: sesi hari ini harus sedang dibuka.');
    }
    data = data || {};
    var rec = normalizeJamaah_({
      nama: data.nama, nama_panggilan: data.nama_panggilan, jenis_kelamin: data.jenis_kelamin,
      tanggal_lahir: data.tanggal_lahir, pekerjaan: data.pekerjaan, no_hp: data.no_hp, desa: data.desa,
      rt: data.rt, rw: data.rw, kecamatan: data.kecamatan, kota: data.kota, provinsi: data.provinsi,
      no_kk: data.no_kk, alamat: data.alamat, catatan: data.catatan, kelompok: data.kelompok, status: 'Aktif'
    }, false);
    if (rec.kelompok && namaFasilitatorList_().indexOf(rec.kelompok) === -1) rec.kelompok = '';
    return withLock_(function () {
      var rows = readAll_('DATA_JAMAAH');
      var key = dupKey_(rec);
      var dup = rows.filter(function (j) { return dupKey_(j) === key; })[0];
      if (dup) throw new Error('Jamaah ini sudah terdaftar dengan No Jamaah ' + dup.id_jamaah + '. Cari namanya di Input Manual.');
      rec.id_jamaah = nextId_('DATA_JAMAAH', 'id_jamaah', ID_PREFIX, ID_PAD);
      rec.tanggal_daftar = today_();
      rec.catatan = (rec.catatan ? rec.catatan + ' · ' : '') + 'Didaftarkan petugas ' + s.nama;
      appendRow_('DATA_JAMAAH', rec);
      logActivity_(s.username, s.role, 'Daftar jamaah baru ' + rec.id_jamaah + ' (' + rec.nama + ') di sesi ' + idSesi);
      var hadir = null;
      if (tandaiHadir) {
        var all = readAll_('ABSENSI'), maxNum = 0;
        all.forEach(function (a) { var n = parseInt(String(a.id_absensi).replace(/\D/g, ''), 10); if (n > maxNum) maxNum = n; });
        hadir = { id_absensi: 'ABS' + ('000000' + (maxNum + 1)).slice(-6), id_sesi: idSesi, id_program: sesi.id_program,
                  id_jamaah: rec.id_jamaah, status: 'Hadir', waktu_scan: now_(), id_petugas: s.id, metode: 'Manual',
                  keterangan: 'Jamaah baru didaftarkan petugas' };
        appendRow_('ABSENSI', hadir);
      }
      var p = findBy_('PROGRAM', 'id_program', sesi.id_program);
      return {
        jamaah: [rec.id_jamaah, rec.nama, rec.desa, rec.jenis_kelamin, rec.nama_panggilan, rec.tanggal_lahir, rec.pekerjaan,
                 rec.no_hp, rec.rt, rec.rw, rec.kecamatan, rec.kota, rec.provinsi, rec.no_kk, rec.alamat, rec.catatan,
                 rec.kelompok, rec.tanggal_daftar],
        peserta: pesertaProgram_(p, [rec]).length > 0,
        hadir: hadir ? { status: 'Hadir', waktu: hadir.waktu_scan, metode: 'Manual' } : null
      };
    });
  });
}

/** Absensi terbaru suatu sesi (dipanggil berkala agar scan petugas lain ikut tampil). */
function getSesiAbsensi(token, idSesi) {
  return respond_(function () {
    var sesi = findBy_('SESI', 'id_sesi', idSesi);
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    requireAuth_(token, 'petugas', sesi.id_program);
    return { status: sesi.status, records: sesiRecords_(idSesi) };
  });
}

/**
 * Catat absensi secara batch (dipakai untuk scan langsung maupun antrean offline).
 * items: [{client_id, id_jamaah, status, metode, waktu, keterangan}]
 * Hasil per item: ok | dup (sudah tercatat) | invalid | closed
 */
function catatAbsensi(token, idSesi, items) {
  return respond_(function () {
    var sesi = findBy_('SESI', 'id_sesi', idSesi);
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    var s = requireAuth_(token, 'petugas', sesi.id_program);
    if (!Array.isArray(items) || !items.length) return [];
    if (items.length > 500) throw new Error('Terlalu banyak data sekaligus.');

    return withLock_(function () {
      sesi = findBy_('SESI', 'id_sesi', idSesi);          // baca ulang di dalam lock
      var jamaah = {};
      readAll_('DATA_JAMAAH').forEach(function (j) { jamaah[j.id_jamaah] = j; });
      var all = readAll_('ABSENSI');
      var existing = {}, maxNum = 0;
      all.forEach(function (a) {
        if (a.id_sesi === idSesi) existing[a.id_jamaah] = a;
        var n = parseInt(String(a.id_absensi).replace(/\D/g, ''), 10);
        if (n > maxNum) maxNum = n;
      });
      var nowStr = now_();
      var toAdd = [], results = [];

      items.forEach(function (it) {
        var id = clean_(it.id_jamaah).toUpperCase();
        var r = { client_id: it.client_id, id_jamaah: id };
        var j = jamaah[id];
        if (!isJamaahId_(id) || !j) { r.result = 'invalid'; r.pesan = 'Barcode tidak terdaftar'; results.push(r); return; }
        r.nama = j.nama;
        if (j.status !== 'Aktif') { r.result = 'invalid'; r.pesan = 'Jamaah nonaktif'; results.push(r); return; }
        if (existing[id]) {
          r.result = 'dup'; r.waktu = existing[id].waktu_scan; r.status = existing[id].status;
          results.push(r); return;
        }
        if (sesi.status !== 'Dibuka') { r.result = 'closed'; r.pesan = 'Sesi sudah ditutup'; results.push(r); return; }
        var status = STATUS_ABSEN.indexOf(it.status) !== -1 ? it.status : 'Hadir';
        var metode = METODE_ABSEN.indexOf(it.metode) !== -1 ? it.metode : 'Manual';
        var rec = {
          id_absensi: 'ABS' + ('000000' + (++maxNum)).slice(-6),
          id_sesi: idSesi, id_program: sesi.id_program, id_jamaah: id, status: status,
          waktu_scan: validWaktu_(it.waktu, nowStr), id_petugas: s.id, metode: metode,
          keterangan: clean_(it.keterangan).substring(0, 200)
        };
        toAdd.push(rec);
        existing[id] = rec;
        r.result = 'ok'; r.waktu = rec.waktu_scan; r.status = status;
        results.push(r);
      });

      appendRows_('ABSENSI', toAdd);
      if (toAdd.length) {
        logActivity_(s.username, s.role, 'Absensi ' + idSesi + ': ' + toAdd.length + ' dicatat (' +
          toAdd.map(function (a) { return a.id_jamaah + ' ' + a.status; }).slice(0, 5).join(', ') + (toAdd.length > 5 ? ', …' : '') + ')');
      }
      return results;
    });
  });
}

/** Tutup sesi; peserta yang belum tercatat otomatis ditandai Alpa. */
function tutupSesi(token, idSesi) {
  return respond_(function () {
    var sesi = findBy_('SESI', 'id_sesi', idSesi);
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    var s = requireAuth_(token, 'petugas', sesi.id_program);
    return withLock_(function () {
      var p = findBy_('PROGRAM', 'id_program', sesi.id_program);
      var all = readAll_('ABSENSI');
      var sudah = {}, maxNum = 0;
      all.forEach(function (a) {
        if (a.id_sesi === idSesi) sudah[a.id_jamaah] = true;
        var n = parseInt(String(a.id_absensi).replace(/\D/g, ''), 10);
        if (n > maxNum) maxNum = n;
      });
      var nowStr = now_();
      var alpa = pesertaProgram_(p).filter(function (j) { return !sudah[j.id_jamaah]; }).map(function (j) {
        return { id_absensi: 'ABS' + ('000000' + (++maxNum)).slice(-6), id_sesi: idSesi, id_program: sesi.id_program,
                 id_jamaah: j.id_jamaah, status: 'Alpa', waktu_scan: nowStr, id_petugas: s.id,
                 metode: 'Manual', keterangan: 'Otomatis saat sesi ditutup' };
      });
      appendRows_('ABSENSI', alpa);
      updateBy_('SESI', 'id_sesi', idSesi, { status: 'Ditutup' });
      logActivity_(s.username, s.role, 'Tutup sesi ' + idSesi + ' (' + p.nama_program + '), ' + alpa.length + ' ditandai Alpa');
      return { alpa: alpa.length };
    });
  });
}

/* ---------- Helper ---------- */

function sesiRecords_(idSesi) {
  return readAll_('ABSENSI').filter(function (a) { return a.id_sesi === idSesi; }).map(function (a) {
    return { id_jamaah: a.id_jamaah, status: a.status, waktu: a.waktu_scan, metode: a.metode, id_petugas: a.id_petugas,
             selesai: a.waktu_selesai, hadiah: a.hadiah };
  });
}

/**
 * Absen SELESAI (akhir program) secara batch — sekaligus tanda jamaah menerima hadiah.
 * items: [{client_id, id_jamaah, metode, waktu}]
 * Hasil per item: ok | dup (sudah selesai) | belum_hadir | bukan_hadir (status Izin/Sakit/Alpa) | invalid | closed
 * Aturan: hanya jamaah yang tercatat HADIR di sesi ini yang bisa SELESAI & mendapat hadiah.
 */
function catatSelesai(token, idSesi, items) {
  return respond_(function () {
    var sesi = findBy_('SESI', 'id_sesi', idSesi);
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    var s = requireAuth_(token, 'petugas', sesi.id_program);
    if (!Array.isArray(items) || !items.length) return [];
    if (items.length > 500) throw new Error('Terlalu banyak data sekaligus.');
    return withLock_(function () {
      sesi = findBy_('SESI', 'id_sesi', idSesi);
      var jamaah = {};
      readAll_('DATA_JAMAAH').forEach(function (j) { jamaah[j.id_jamaah] = j; });
      var rec = {};
      readAll_('ABSENSI').forEach(function (a) { if (a.id_sesi === idSesi) rec[a.id_jamaah] = a; });
      var sh = getSheet_('ABSENSI'), cols = SCHEMA.ABSENSI.length, nowStr = now_(), n = 0, results = [];
      items.forEach(function (it) {
        var id = clean_(it.id_jamaah).toUpperCase();
        var r = { client_id: it.client_id, id_jamaah: id, nama: jamaah[id] ? jamaah[id].nama : '' };
        var a = rec[id];
        if (!jamaah[id]) { r.result = 'invalid'; r.pesan = 'Barcode tidak terdaftar'; }
        else if (!a) { r.result = 'belum_hadir'; r.pesan = 'Belum absen HADIR — tidak dapat hadiah'; }
        else if (a.status !== 'Hadir') { r.result = 'bukan_hadir'; r.pesan = 'Tercatat ' + a.status + ', bukan Hadir'; }
        else if (a.waktu_selesai) { r.result = 'dup'; r.waktu = a.waktu_selesai; }
        else if (sesi.status !== 'Dibuka') { r.result = 'closed'; r.pesan = 'Sesi sudah ditutup'; }
        else {
          a.waktu_selesai = validWaktu_(it.waktu, nowStr);
          if (a.waktu_selesai < a.waktu_scan) a.waktu_selesai = nowStr;
          a.petugas_selesai = s.id; a.hadiah = 'Ya';
          sh.getRange(a._row, 1, 1, cols).setValues([objToRow_('ABSENSI', a)]);
          r.result = 'ok'; r.waktu = a.waktu_selesai; n++;
        }
        results.push(r);
      });
      if (n) logActivity_(s.username, s.role, 'Selesai ' + idSesi + ': ' + n + ' jamaah (hadiah diberikan)');
      return results;
    });
  });
}

/** Waktu dari HP dipakai bila wajar (antrean offline); selain itu waktu server. */
function validWaktu_(w, nowStr) {
  w = clean_(w);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(w)) return nowStr;
  if (w > nowStr) return nowStr;                         // tidak boleh di masa depan
  if (w.substring(0, 10) < nowStr.substring(0, 10) && w < shiftDays_(nowStr, -2)) return nowStr;
  return w;
}

function shiftDays_(ts, days) {
  var d = new Date(new Date().getTime() + days * 86400000);
  return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd') + ts.substring(10);
}
