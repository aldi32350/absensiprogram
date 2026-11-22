/**
 * Laporan.gs — laporan perkembangan bacaan jamaah oleh FASILITATOR.
 *
 * - Admin menentukan jamaah binaan tiap fasilitator (menu Fasilitator → Jamaah binaan; kolom DATA_JAMAAH.kelompok).
 * - Fasilitator login (Admin → tab Fasilitator), melihat jamaah binaannya, lalu melaporkan:
 *   indikator (Iqro' 1 … Qur'an Besar), keputusan Tetap / Lanjut, dan keterangan.
 * - Setiap laporan disimpan sebagai baris baru (riwayat), sehingga perkembangan jamaah bisa ditelusuri.
 */

var INDIKATOR_JAMAAH = ["Iqro' 1", "Iqro' 2", "Iqro' 3", "Iqro' 4", "Iqro' 5", "Iqro' 6",
                        "Qur'an Kecil", "Qur'an Sedang", "Qur'an Besar"];
var KEPUTUSAN_LAPORAN = ['Tetap', 'Lanjut'];

/**
 * Fasilitator yang login (s.id = id_petugas) + kelas yang dipegangnya.
 * f = { id_fasilitator: id_petugas, nama } dipakai saat mencatat absensi; kelasByNama = { nama kelas: baris kelas }.
 */
function fasilSaya_(s) {
  var u = findBy_('PETUGAS', 'id_petugas', s.id);
  var kelas = kelasMilik_(s.id);
  var byNama = {};
  kelas.forEach(function (k) { byNama[k.nama] = k; });
  return { user: u, f: { id_fasilitator: s.id, nama: u ? u.nama : s.nama }, kelas: kelas, kelasByNama: byNama };
}

/** Beranda fasilitator: sesi hari ini (untuk dipilih), jamaah binaan + laporan terakhir + status hadir di sesi terpilih. */
function fasilitatorHome(token, idSesi) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    var me = fasilSaya_(s);
    var today = today_();
    var last = laporanTerakhir_();
    var thumbs = thumbMap_();
    var absensi = readAll_('ABSENSI');
    var prog = {}; readAll_('PROGRAM').forEach(function (p) { prog[p.id_program] = p; });
    var hadirN = {};
    absensi.forEach(function (a) { if (a.status === 'Hadir') hadirN[a.id_sesi] = (hadirN[a.id_sesi] || 0) + 1; });
    // Sesi hari ini + sesi hari sebelumnya yang BELUM ditutup (fasilitator masih bisa absen & melapor).
    var sesiHariIni = readAll_('SESI').filter(function (x) {
      return prog[x.id_program] && prog[x.id_program].status === 'Aktif' && x.tanggal <= today && (x.tanggal === today || x.status === 'Dibuka');
    }).sort(function (a, b) { return (b.tanggal + (b.jam_mulai || '')).localeCompare(a.tanggal + (a.jam_mulai || '')); })
      .map(function (x) {
        return { id_sesi: x.id_sesi, id_program: x.id_program, nama_program: prog[x.id_program].nama_program,
                 tanggal: x.tanggal, jam_mulai: x.jam_mulai, keterangan: x.keterangan, status: x.status, hadir: hadirN[x.id_sesi] || 0 };
      });
    idSesi = clean_(idSesi);
    var sesi = sesiHariIni.filter(function (x) { return x.id_sesi === idSesi; })[0] || null;
    var hadir = {};
    if (sesi) absensi.forEach(function (a) {
      if (a.id_sesi === sesi.id_sesi) hadir[a.id_jamaah] = { status: a.status, waktu: a.waktu_scan, metode: a.metode, keterangan: a.keterangan };
    });
    var rows = readAll_('DATA_JAMAAH').filter(function (j) { return me.kelasByNama[j.kelompok] && j.status === 'Aktif'; })
      .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); })
      .map(function (j) {
        var l = last[j.id_jamaah] || null;
        return {
          id_jamaah: j.id_jamaah, nama: j.nama, nama_panggilan: j.nama_panggilan, jenis_kelamin: j.jenis_kelamin,
          tanggal_lahir: j.tanggal_lahir, desa: j.desa, rt: j.rt, rw: j.rw, no_hp: j.no_hp, thumb: thumbs[j.id_jamaah] || '',
          terakhir: l ? { tanggal: l.tanggal, indikator: l.indikator, keputusan: l.keputusan, keterangan: l.keterangan, nama_fasilitator: l.nama_fasilitator } : null,
          absen: hadir[j.id_jamaah] || null,
          kelas: me.kelasByNama[j.kelompok].kelas || ''
        };
      });
    var k0 = me.kelas[0] || {};
    var pasangan = function (k) { return [k.anggota_1, k.anggota_2].filter(function (id) { return id && id !== s.id; }); };
    var namaUser = {}; readAll_('PETUGAS').forEach(function (p) { namaUser[p.id_petugas] = p.nama; });
    return { fasilitator: { nama: me.f.nama, kelas: k0.kelas || '', kategori: k0.kategori || '',
               kelasList: me.kelas.map(function (k) { return { id_fasilitator: k.id_fasilitator, kelas: k.kelas, kategori: k.kategori, nama: k.nama,
                 pasangan: pasangan(k).map(function (id) { return namaUser[id] || ''; }).filter(String) }; }) },
             indikator: INDIKATOR_JAMAAH, keputusan: KEPUTUSAN_LAPORAN, rows: rows, today: today,
             sesiHariIni: sesiHariIni, sesi: sesi };
  });
}

var STATUS_ABSEN_FASIL = ['Hadir', 'Izin', 'Sakit', 'Alpa'];

/**
 * Catat absen oleh fasilitator (dobel dengan scan petugas supaya tidak ada yang terlewat). Dipanggil di dalam withLock_.
 * - Sesi harus masih DIBUKA (boleh dari hari sebelumnya selama belum ditutup).
 * - Belum tercatat → dibuat. Sudah tercatat oleh fasilitator → statusnya boleh diubah.
 * - Sudah tercatat oleh petugas (scan / manual) → tidak diubah, dikembalikan data yang ada.
 */
function catatAbsenFasil_(f, idSesi, j, status, keterangan) {
  status = STATUS_ABSEN_FASIL.indexOf(status) !== -1 ? status : 'Hadir';
  var sesi = findBy_('SESI', 'id_sesi', idSesi);
  if (!sesi) throw new Error('Sesi tidak ditemukan. Pilih ulang sesi.');
  var all = readAll_('ABSENSI'), maxNum = 0, ada = null;
  all.forEach(function (a) {
    if (a.id_sesi === idSesi && a.id_jamaah === j.id_jamaah) ada = a;
    var n = parseInt(String(a.id_absensi).replace(/[^0-9]/g, ''), 10);
    if (n > maxNum) maxNum = n;
  });
  var ket = clean_(keterangan).substring(0, 200) || ('Dicatat fasilitator ' + f.nama);
  if (ada) {
    if (ada.metode !== 'Fasilitator' || ada.status === status || sesi.status !== 'Dibuka') {
      return { baru: false, ubah: false, status: ada.status, waktu: ada.waktu_scan, metode: ada.metode, keterangan: ada.keterangan };
    }
    updateBy_('ABSENSI', 'id_absensi', ada.id_absensi, { status: status, keterangan: ket, id_petugas: f.id_fasilitator });
    return { baru: false, ubah: true, status: status, waktu: ada.waktu_scan, metode: ada.metode, keterangan: ket };
  }
  if (sesi.status !== 'Dibuka') throw new Error('Sesi sudah ditutup. Absen tidak bisa ditambah lagi.');
  var rec = { id_absensi: 'ABS' + ('000000' + (maxNum + 1)).slice(-6), id_sesi: idSesi, id_program: sesi.id_program,
              id_jamaah: j.id_jamaah, status: status, waktu_scan: now_(), id_petugas: f.id_fasilitator, metode: 'Fasilitator', keterangan: ket };
  appendRow_('ABSENSI', rec);
  return { baru: true, ubah: false, status: status, waktu: rec.waktu_scan, metode: rec.metode, keterangan: ket };
}
/** Kompatibel: catat HADIR. */
function catatHadirFasil_(f, idSesi, j) { return catatAbsenFasil_(f, idSesi, j, 'Hadir', ''); }

/** Fasilitator mencatat absen (Hadir / Izin / Sakit / Alpa) jamaah kelasnya di sesi yang masih dibuka. */
function fasilitatorAbsen(token, idSesi, idJamaah, status, keterangan) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    return withLock_(function () {
      var me = fasilSaya_(s);
      var j = findBy_('DATA_JAMAAH', 'id_jamaah', clean_(idJamaah).toUpperCase());
      if (!j || j.status !== 'Aktif') throw new Error('Jamaah tidak ditemukan / nonaktif.');
      if (!me.kelasByNama[j.kelompok]) throw new Error('Jamaah ini bukan binaan Anda. Hubungi admin.');
      var r = catatAbsenFasil_(me.f, clean_(idSesi), j, status, keterangan);
      if (r.baru || r.ubah) logActivity_(s.username, s.role, (r.ubah ? 'Ubah absen ' : 'Absen ') + j.id_jamaah + ' → ' + r.status + ' di sesi ' + idSesi);
      return r;
    });
  });
}

/** Kompatibel (versi lama): tandai HADIR. */
function fasilitatorTandaiHadir(token, idSesi, idJamaah) { return fasilitatorAbsen(token, idSesi, idJamaah, 'Hadir', ''); }

/** Simpan laporan satu jamaah binaan. data: {id_jamaah, indikator, keputusan, keterangan, id_sesi?}
 *  Bila id_sesi (sesi hari ini) diisi, jamaah otomatis tercatat HADIR di sesi itu. */
function simpanLaporanFasilitator(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    data = data || {};
    var idJ = clean_(data.id_jamaah).toUpperCase();
    var rec = {
      indikator: clean_(data.indikator),
      keputusan: clean_(data.keputusan),
      keterangan: clean_(data.keterangan).substring(0, 500)
    };
    if (INDIKATOR_JAMAAH.indexOf(rec.indikator) === -1) throw new Error('Pilih indikator jamaah.');
    if (KEPUTUSAN_LAPORAN.indexOf(rec.keputusan) === -1) throw new Error('Pilih Tetap atau Lanjut.');
    return withLock_(function () {
      var me = fasilSaya_(s), f = me.f;
      var j = findBy_('DATA_JAMAAH', 'id_jamaah', idJ);
      if (!j || j.status !== 'Aktif') throw new Error('Jamaah tidak ditemukan / nonaktif.');
      var kelasJ = me.kelasByNama[j.kelompok];
      if (!kelasJ) throw new Error('Jamaah ini bukan binaan Anda. Hubungi admin.');
      rec.id_laporan = nextId_('LAPORAN_FASILITATOR', 'id_laporan', 'LAP', 6);
      rec.tanggal = today_();
      rec.waktu = now_();
      rec.id_fasilitator = kelasJ.id_fasilitator;   // kelas (dipakai filter rekap)
      rec.nama_fasilitator = f.nama;                // orang yang melapor
      rec.id_jamaah = j.id_jamaah;
      rec.nama_jamaah = j.nama;
      rec.id_sesi = clean_(data.id_sesi);
      // Laporan di sesi hari ini = jamaah hadir → otomatis tercatat HADIR (tidak dobel bila petugas sudah scan).
      var absen = rec.id_sesi ? catatHadirFasil_(f, rec.id_sesi, j) : null;
      appendRow_('LAPORAN_FASILITATOR', rec);
      logActivity_(s.username, s.role, 'Laporan ' + j.id_jamaah + ': ' + rec.indikator + ' · ' + rec.keputusan + (absen && absen.baru ? ' · tercatat HADIR' : ''));
      rec.absen = absen;
      return rec;
    });
  });
}

/** Detail lengkap satu jamaah binaan (hanya-baca) — data yang diisi admin / tim pendataan. */
function detailJamaahFasilitator(token, idJamaah) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    var j = findBy_('DATA_JAMAAH', 'id_jamaah', clean_(idJamaah).toUpperCase());
    if (!j || !fasilSaya_(s).kelasByNama[j.kelompok]) throw new Error('Jamaah ini bukan binaan Anda.');
    var o = strip_(j);
    o.usia = usiaDari_(j.tanggal_lahir);
    o.jumlah_hadir = readAll_('ABSENSI').filter(function (a) { return a.id_jamaah === j.id_jamaah && a.status === 'Hadir'; }).length;
    return o;
  });
}

/** Riwayat laporan satu jamaah (terbaru dulu). Fasilitator: hanya jamaah binaannya. Admin: semua. */
function riwayatLaporanJamaah(token, idJamaah) {
  return respond_(function () {
    var s = requireAuth_(token, 'any');
    idJamaah = clean_(idJamaah).toUpperCase();
    if (s.role === 'fasilitator') {
      var j = findBy_('DATA_JAMAAH', 'id_jamaah', idJamaah);
      if (!j || !fasilSaya_(s).kelasByNama[j.kelompok]) throw new Error('Jamaah ini bukan binaan Anda.');
    } else if (s.role !== 'admin') {
      throw new Error('Akses ditolak untuk jenis akun ini.');
    }
    return readAll_('LAPORAN_FASILITATOR').filter(function (l) { return l.id_jamaah === idJamaah; })
      .map(strip_).sort(function (a, b) { return b.waktu.localeCompare(a.waktu); });
  });
}

/**
 * Rekap laporan untuk admin.
 * opt: { id_fasilitator, dari, sampai } → { rows (laporan dalam rentang), posisi (indikator terakhir per jamaah), indikator, fasilitator }
 */
function rekapLaporanFasilitator(token, opt) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    opt = opt || {};
    var idF = clean_(opt.id_fasilitator), dari = clean_(opt.dari), sampai = clean_(opt.sampai);
    var semua = readAll_('LAPORAN_FASILITATOR').map(strip_);
    var rows = semua.filter(function (l) {
      return (!idF || l.id_fasilitator === idF) && (!dari || l.tanggal >= dari) && (!sampai || l.tanggal <= sampai);
    }).sort(function (a, b) { return b.waktu.localeCompare(a.waktu); });

    // Posisi terkini setiap jamaah binaan aktif (laporan terakhir, tanpa filter tanggal).
    var last = laporanTerakhir_(), fasil = readAll_('FASILITATOR');
    var namaF = {}, kelasF = {};
    fasil.forEach(function (f) { namaF[f.id_fasilitator] = f.nama; kelasF[f.nama] = f.kelas || ''; });
    var posisi = readAll_('DATA_JAMAAH').filter(function (j) {
      return j.status === 'Aktif' && j.kelompok && (!idF || j.kelompok === namaF[idF]);
    }).map(function (j) {
      var l = last[j.id_jamaah];
      // Belum ada laporan → posisi awal = kelas fasilitatornya.
      return { id_jamaah: j.id_jamaah, nama: j.nama, fasilitator: j.kelompok,
               indikator: l ? l.indikator : kelasF[j.kelompok] || '', dari_kelas: !l,
               keputusan: l ? l.keputusan : '', tanggal: l ? l.tanggal : '' };
    });
    return {
      rows: rows, posisi: posisi, indikator: INDIKATOR_JAMAAH,
      fasilitator: fasil.map(function (f) { return { id_fasilitator: f.id_fasilitator, nama: f.nama, status: f.status, kelas: f.kelas, kategori: f.kategori }; })
        .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); })
    };
  });
}

/** { id_jamaah: laporan terakhir } */
function laporanTerakhir_() {
  var last = {};
  readAll_('LAPORAN_FASILITATOR').forEach(function (l) {
    if (!last[l.id_jamaah] || l.waktu >= last[l.id_jamaah].waktu) last[l.id_jamaah] = l;
  });
  return last;
}
