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

/** Beranda fasilitator: jamaah binaan + laporan terakhir masing-masing. */
function fasilitatorHome(token) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    var f = findBy_('FASILITATOR', 'id_fasilitator', s.id);
    var last = laporanTerakhir_();
    var thumbs = thumbMap_();
    var rows = readAll_('DATA_JAMAAH').filter(function (j) { return j.kelompok === f.nama && j.status === 'Aktif'; })
      .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); })
      .map(function (j) {
        var l = last[j.id_jamaah] || null;
        return {
          id_jamaah: j.id_jamaah, nama: j.nama, nama_panggilan: j.nama_panggilan, jenis_kelamin: j.jenis_kelamin,
          tanggal_lahir: j.tanggal_lahir, desa: j.desa, rt: j.rt, rw: j.rw, no_hp: j.no_hp, thumb: thumbs[j.id_jamaah] || '',
          terakhir: l ? { tanggal: l.tanggal, indikator: l.indikator, keputusan: l.keputusan, keterangan: l.keterangan, nama_fasilitator: l.nama_fasilitator } : null
        };
      });
    return { fasilitator: publicFasil_(f), indikator: INDIKATOR_JAMAAH, keputusan: KEPUTUSAN_LAPORAN, rows: rows, today: today_() };
  });
}

/** Simpan laporan satu jamaah binaan. data: {id_jamaah, indikator, keputusan, keterangan} */
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
      var f = findBy_('FASILITATOR', 'id_fasilitator', s.id);
      var j = findBy_('DATA_JAMAAH', 'id_jamaah', idJ);
      if (!j || j.status !== 'Aktif') throw new Error('Jamaah tidak ditemukan / nonaktif.');
      if (j.kelompok !== f.nama) throw new Error('Jamaah ini bukan binaan Anda. Hubungi admin.');
      rec.id_laporan = nextId_('LAPORAN_FASILITATOR', 'id_laporan', 'LAP', 6);
      rec.tanggal = today_();
      rec.waktu = now_();
      rec.id_fasilitator = f.id_fasilitator;
      rec.nama_fasilitator = f.nama;
      rec.id_jamaah = j.id_jamaah;
      rec.nama_jamaah = j.nama;
      appendRow_('LAPORAN_FASILITATOR', rec);
      logActivity_(s.username, s.role, 'Laporan ' + j.id_jamaah + ': ' + rec.indikator + ' · ' + rec.keputusan);
      return rec;
    });
  });
}

/** Riwayat laporan satu jamaah (terbaru dulu). Fasilitator: hanya jamaah binaannya. Admin: semua. */
function riwayatLaporanJamaah(token, idJamaah) {
  return respond_(function () {
    var s = requireAuth_(token, 'any');
    idJamaah = clean_(idJamaah).toUpperCase();
    if (s.role === 'fasilitator') {
      var f = findBy_('FASILITATOR', 'id_fasilitator', s.id), j = findBy_('DATA_JAMAAH', 'id_jamaah', idJamaah);
      if (!j || j.kelompok !== f.nama) throw new Error('Jamaah ini bukan binaan Anda.');
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
