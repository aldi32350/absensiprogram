/**
 * Rekap.gs — dashboard, rekap (per sesi / program / jamaah / petugas), tren,
 * koreksi absensi oleh admin, dan export ke Google Drive (Sheets + PDF).
 * Semua fungsi khusus admin.
 */

var STATUS_LIST = ['Hadir', 'Izin', 'Sakit', 'Alpa'];
var KET_OTOMATIS = 'Otomatis saat sesi ditutup';

/* =========================================================================
 * DASHBOARD
 * ========================================================================= */

/**
 * Dashboard. filter: { program: id|'' , dari: yyyy-mm-dd|'' , sampai: yyyy-mm-dd|'' } (kosong = semua).
 * KPI keaktifan dihitung per PERTEMUAN = tanggal sesi (beberapa program di hari yang sama = 1 pertemuan):
 *   Aktif ≥ 3 pertemuan hadir · Sedang 1–2 · Tidak aktif 0.
 */
var BATAS_AKTIF = 3;
function getDashboardSummary(token, filter) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var db = loadRekapDb_();
    var today = today_();
    filter = filter || {};
    var fProg = clean_(filter.program);
    if (fProg && !db.program[fProg]) fProg = '';
    var fDari = normalizeDate_(filter.dari), fSampai = normalizeDate_(filter.sampai);
    if (fDari && fSampai && fDari > fSampai) { var tmp = fDari; fDari = fSampai; fSampai = tmp; }

    // --- KPI keaktifan ---
    var sesiF = db.sesi.filter(function (s) {
      return (!fProg || s.id_program === fProg) && (!fDari || s.tanggal >= fDari) && (!fSampai || s.tanggal <= fSampai);
    });
    var sesiIds = {}, tanggalSet = {};
    sesiF.forEach(function (s) { sesiIds[s.id_sesi] = s.tanggal; tanggalSet[s.tanggal] = true; });
    var hadirTanggal = {};          // id_jamaah → {tanggal:true}
    var perTanggal = {};            // tanggal → {id_jamaah:true}
    db.absensi.forEach(function (a) {
      var t = sesiIds[a.id_sesi];
      if (!t || a.status !== 'Hadir') return;
      (hadirTanggal[a.id_jamaah] = hadirTanggal[a.id_jamaah] || {})[t] = true;
      (perTanggal[t] = perTanggal[t] || {})[a.id_jamaah] = true;
    });
    var populasi = fProg ? pesertaProgram_(db.program[fProg], db.jamaahList)
                         : db.jamaahList.filter(function (j) { return j.status === 'Aktif'; });
    var kat = { aktif: [], sedang: [], tidak: [] };
    populasi.forEach(function (j) {
      var n = hadirTanggal[j.id_jamaah] ? Object.keys(hadirTanggal[j.id_jamaah]).length : 0;
      var item = [j.id_jamaah, j.nama, j.desa || '', n];   // kolom ke-3 = desa
      (n >= BATAS_AKTIF ? kat.aktif : n >= 1 ? kat.sedang : kat.tidak).push(item);
    });
    Object.keys(kat).forEach(function (k) { kat[k].sort(function (a, b) { return b[3] - a[3] || a[1].localeCompare(b[1]); }); });
    // Pertemuan = tanggal yang sudah berjalan: ada yang hadir, atau sesinya sudah ditutup
    // (sesi hari ini yang baru dibuka & belum ada scan tidak menurunkan rata-rata).
    var tutupTgl = {};
    sesiF.forEach(function (s) { if (s.status === 'Ditutup') tutupTgl[s.tanggal] = true; });
    var tanggalList = Object.keys(tanggalSet).filter(function (t) { return t <= today && (perTanggal[t] || tutupTgl[t]); });
    var totalHadirTgl = 0;
    tanggalList.forEach(function (t) { totalHadirTgl += perTanggal[t] ? Object.keys(perTanggal[t]).length : 0; });
    var total = populasi.length;
    function pct(n) { return total ? Math.round(n / total * 1000) / 10 : 0; }
    var kpi = {
      total: total, pertemuan: tanggalList.length, batas: BATAS_AKTIF,
      aktif: kat.aktif.length, aktifPct: pct(kat.aktif.length),
      sedang: kat.sedang.length, sedangPct: pct(kat.sedang.length),
      tidak: kat.tidak.length, tidakPct: pct(kat.tidak.length),
      rataHadir: tanggalList.length ? Math.round(totalHadirTgl / tanggalList.length * 10) / 10 : 0,
      daftar: kat
    };
    function view(s) {
      var p = db.program[s.id_program] || {};
      var c = db.countBySesi[s.id_sesi] || {};
      return { id_sesi: s.id_sesi, id_program: s.id_program, nama_program: p.nama_program || s.id_program,
               tanggal: s.tanggal, jam_mulai: s.jam_mulai, keterangan: s.keterangan, status: s.status,
               hadir: c.Hadir || 0, peserta: db.pesertaN(s.id_program) };
    }
    var sesiHariIni = db.sesi.filter(function (s) { return s.tanggal === today && (!fProg || s.id_program === fProg); }).map(view)
      .sort(function (a, b) { return (a.jam_mulai || '').localeCompare(b.jam_mulai || ''); });
    var belumDitutup = db.sesi.filter(function (s) { return s.tanggal < today && s.status === 'Dibuka'; }).map(view)
      .sort(function (a, b) { return b.tanggal.localeCompare(a.tanggal); });
    var hadirHariIni = 0, pesertaHariIni = 0;
    sesiHariIni.forEach(function (s) { hadirHariIni += s.hadir; pesertaHariIni += s.peserta; });
    return {
      jamaahAktif: db.jamaahList.filter(function (j) { return j.status === 'Aktif'; }).length,
      programAktif: db.programList.filter(function (p) { return p.status === 'Aktif'; }).length,
      sesiDibuka: sesiHariIni.filter(function (s) { return s.status === 'Dibuka'; }).length,
      hadirHariIni: hadirHariIni, pesertaHariIni: pesertaHariIni,
      sesiHariIni: sesiHariIni,
      belumDitutup: belumDitutup.slice(0, 10), jumlahBelumDitutup: belumDitutup.length,
      tren: trenData_(db, fDari || fSampai ? 60 : 8, fProg, fDari, fSampai),
      kpi: kpi,
      filter: { program: fProg, dari: fDari, sampai: fSampai },
      programs: db.programList.map(function (p) { return { id: p.id_program, nama: p.nama_program, status: p.status }; })
    };
  });
}

/** Tren % hadir per program aktif: N sesi terakhir masing-masing. */
function trenData_(db, n, fProg, fDari, fSampai) {
  return db.programList.filter(function (p) { return fProg ? p.id_program === fProg : p.status === 'Aktif'; }).map(function (p) {
    // Hanya sesi yang sudah ditutup (sesi yang masih berjalan akan menarik garis ke 0%).
    var ss = db.sesi.filter(function (s) {
      return s.id_program === p.id_program && s.status === 'Ditutup' &&
             (!fDari || s.tanggal >= fDari) && (!fSampai || s.tanggal <= fSampai);
    })
      .sort(function (a, b) { return (a.tanggal + a.jam_mulai).localeCompare(b.tanggal + b.jam_mulai); })
      .slice(-n);
    var peserta = db.pesertaN(p.id_program);
    return {
      id_program: p.id_program, nama_program: p.nama_program,
      points: ss.map(function (s) {
        var h = (db.countBySesi[s.id_sesi] || {}).Hadir || 0;
        return { tanggal: s.tanggal, hadir: h, peserta: peserta, pct: peserta ? Math.round(h / peserta * 1000) / 10 : 0 };
      })
    };
  }).filter(function (x) { return x.points.length; });
}

/* =========================================================================
 * REKAP
 * ========================================================================= */

/** Per sesi: semua peserta + siapa pun yang tercatat, dengan status masing-masing. */
function rekapSesi(token, idSesi) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var db = loadRekapDb_();
    var sesi = db.sesiById[idSesi];
    if (!sesi) throw new Error('Sesi tidak ditemukan.');
    var p = db.program[sesi.id_program];
    var recs = db.absensi.filter(function (a) { return a.id_sesi === idSesi; });
    var byJ = {};
    recs.forEach(function (a) { byJ[a.id_jamaah] = a; });
    var pesertaIds = db.pesertaIds(sesi.id_program);
    var isPeserta = {};
    pesertaIds.forEach(function (id) { isPeserta[id] = true; });
    // Hanya jamaah yang tercatat (Hadir/Izin/Sakit/Alpa) — yang belum tercatat tidak ditampilkan.
    var ids = [];
    recs.forEach(function (a) { if (ids.indexOf(a.id_jamaah) === -1) ids.push(a.id_jamaah); });

    var ringkas = { peserta: pesertaIds.length, Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Belum: 0,
                    Selesai: recs.filter(function (a) { return a.status === 'Hadir' && a.waktu_selesai; }).length };
    var rows = ids.map(function (id) {
      var j = db.jamaah[id] || { nama: '(terhapus)', kelompok: '' };
      var a = byJ[id];
      var st = a ? a.status : 'Belum tercatat';
      if (a) ringkas[a.status] = (ringkas[a.status] || 0) + 1; else ringkas.Belum++;
      return {
        id_absensi: a ? a.id_absensi : '', id_jamaah: id, nama: j.nama, kelompok: j.desa,   // ditampilkan sebagai Desa
        peserta: !!isPeserta[id], status: st, waktu: a ? a.waktu_scan : '', metode: a ? a.metode : '',
        petugas: a ? db.namaPetugas(a.id_petugas) : '', keterangan: a ? a.keterangan : '',
        selesai: a ? a.waktu_selesai : '', hadiah: a && a.hadiah === 'Ya' ? 'Ya' : ''
      };
    });
    var order = { 'Hadir': 0, 'Izin': 1, 'Sakit': 2, 'Alpa': 3, 'Belum tercatat': 4 };
    rows.sort(function (a, b) { return order[a.status] - order[b.status] || a.nama.localeCompare(b.nama); });
    ringkas.pct = ringkas.peserta ? Math.round(ringkas.Hadir / ringkas.peserta * 1000) / 10 : 0;
    return { sesi: strip_(sesi), program: { id_program: p.id_program, nama_program: p.nama_program }, ringkas: ringkas, rows: rows };
  });
}

/** Per program per periode: tabel sesi + persentase kehadiran tiap jamaah. */
function rekapProgram(token, idProgram, dari, sampai) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var range = range_(dari, sampai);
    var db = loadRekapDb_();
    var p = db.program[idProgram];
    if (!p) throw new Error('Program tidak ditemukan.');
    var sesi = db.sesi.filter(function (s) { return s.id_program === idProgram && s.tanggal >= range.dari && s.tanggal <= range.sampai; })
      .sort(function (a, b) { return (a.tanggal + a.jam_mulai).localeCompare(b.tanggal + b.jam_mulai); });
    var pesertaN = db.pesertaN(idProgram);
    var sesiRows = sesi.map(function (s) {
      var c = db.countBySesi[s.id_sesi] || {};
      var tot = (c.Hadir || 0) + (c.Izin || 0) + (c.Sakit || 0) + (c.Alpa || 0);
      return { id_sesi: s.id_sesi, tanggal: s.tanggal, jam_mulai: s.jam_mulai, keterangan: s.keterangan, status: s.status,
               peserta: pesertaN, Hadir: c.Hadir || 0, Izin: c.Izin || 0, Sakit: c.Sakit || 0, Alpa: c.Alpa || 0,
               Belum: Math.max(0, pesertaN - tot), pct: pesertaN ? Math.round((c.Hadir || 0) / pesertaN * 1000) / 10 : 0,
               Selesai: db.absensi.filter(function (a) { return a.id_sesi === s.id_sesi && a.status === 'Hadir' && a.waktu_selesai; }).length };
    });

    var sesiIds = {};
    sesi.forEach(function (s) { sesiIds[s.id_sesi] = s; });
    var per = {};
    db.pesertaIds(idProgram).forEach(function (id) { per[id] = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, peserta: true }; });
    db.absensi.forEach(function (a) {
      if (!sesiIds[a.id_sesi]) return;
      per[a.id_jamaah] = per[a.id_jamaah] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, peserta: false };
      per[a.id_jamaah][a.status] = (per[a.id_jamaah][a.status] || 0) + 1;
    });
    var jamaahRows = Object.keys(per).map(function (id) {
      var j = db.jamaah[id] || { nama: '(terhapus)', kelompok: '', tanggal_daftar: '' };
      var x = per[id];
      // Sesi yang "wajib" diikuti: sesi setelah jamaah mendaftar (untuk peserta), atau yang tercatat (tamu).
      var wajib = x.peserta ? sesi.filter(function (s) { return !j.tanggal_daftar || s.tanggal >= j.tanggal_daftar; }).length
                            : x.Hadir + x.Izin + x.Sakit + x.Alpa;
      var tercatat = x.Hadir + x.Izin + x.Sakit + x.Alpa;
      return { id_jamaah: id, nama: j.nama, kelompok: j.desa, peserta: x.peserta, sesi: wajib,
               Hadir: x.Hadir, Izin: x.Izin, Sakit: x.Sakit, Alpa: x.Alpa, Belum: Math.max(0, wajib - tercatat),
               pct: wajib ? Math.round(x.Hadir / wajib * 1000) / 10 : 0 };
    }).sort(function (a, b) { return b.pct - a.pct || a.nama.localeCompare(b.nama); });

    var totalHadir = 0, totalWajib = 0;
    sesiRows.forEach(function (s) { totalHadir += s.Hadir; totalWajib += s.peserta; });
    return {
      program: { id_program: p.id_program, nama_program: p.nama_program, jadwal: p.jadwal },
      range: range,
      ringkas: { sesi: sesi.length, peserta: pesertaN, totalHadir: totalHadir,
                 rata: totalWajib ? Math.round(totalHadir / totalWajib * 1000) / 10 : 0,
                 rataHadir: sesi.length ? Math.round(totalHadir / sesi.length * 10) / 10 : 0 },
      sesi: sesiRows, jamaah: jamaahRows
    };
  });
}

/**
 * Per PERTEMUAN = per SESI satu program — format "Rekap Pertemuan & Kehadiran Harian":
 * total hadir, anak/remaja vs ibu/dewasa, pakai kartu barcode vs tanpa barcode, jumlah kelompok (kelas) yang hadir,
 * ditambah KPI keaktifan jamaah (aktif ≥ 3×, sedang 1–2×, tidak aktif 0×) dari sesi yang ditampilkan.
 * idSesi kosong = semua sesi program (yang sedang berlangsung maupun sudah ditutup).
 */
var METODE_BARCODE = ['Scan Kamera', 'Scanner', 'Google Form'];
function rekapPertemuan(token, idProgram, idSesi) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var db = loadRekapDb_();
    var p = db.program[idProgram];
    if (!p) throw new Error('Program tidak ditemukan.');
    var today = today_();
    idSesi = clean_(idSesi);
    var sesi = db.sesi.filter(function (s) {
      return s.id_program === idProgram && (idSesi ? s.id_sesi === idSesi : s.tanggal <= today);
    }).sort(function (a, b) { return (a.tanggal + (a.jam_mulai || '')).localeCompare(b.tanggal + (b.jam_mulai || '')); });

    // Kategori jamaah: dari kelas fasilitatornya; bila belum punya kelas → dari usia (< 21 th = anak/remaja).
    var katFasil = {};
    readAll_('FASILITATOR').forEach(function (f) { katFasil[f.nama] = f.kategori || ''; });
    function anak(j, tgl) {
      var k = j && katFasil[j.kelompok];
      if (k) return k === 'Remaja & Anak';
      if (!j || !j.tanggal_lahir) return null;
      var a = j.tanggal_lahir.split('-'), b = tgl.split('-');
      var u = +b[0] - +a[0] - ((+b[1] < +a[1] || (+b[1] === +a[1] && +b[2] < +a[2])) ? 1 : 0);
      return u < 21;
    }

    var per = {};       // id_sesi → { id_jamaah: absensi } (hanya HADIR)
    var dipilih = {}; sesi.forEach(function (s) { dipilih[s.id_sesi] = true; per[s.id_sesi] = {}; });
    db.absensi.forEach(function (a) {
      if (!dipilih[a.id_sesi] || a.status !== 'Hadir') return;
      if (!per[a.id_sesi][a.id_jamaah]) per[a.id_sesi][a.id_jamaah] = a;
    });
    var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    var rows = sesi.map(function (s) {
      var hadir = per[s.id_sesi], ids = Object.keys(hadir);
      var r = { id_sesi: s.id_sesi, tanggal: s.tanggal, hari: HARI[new Date(s.tanggal + 'T12:00:00Z').getUTCDay()], jam: s.jam_mulai || '',
                keterangan: s.keterangan || '', status: s.status, berlangsung: s.status === 'Dibuka',
                total: ids.length, anak: 0, dewasa: 0, tanpaKategori: 0, barcode: 0, tanpaBarcode: 0, kelompok: 0 };
      var kel = {};
      ids.forEach(function (id) {
        var j = db.jamaah[id], k = anak(j, s.tanggal);
        if (k === true) r.anak++; else if (k === false) r.dewasa++; else r.tanpaKategori++;
        if (METODE_BARCODE.indexOf(hadir[id].metode) !== -1) r.barcode++; else r.tanpaBarcode++;
        if (j && j.kelompok) kel[j.kelompok] = true;
      });
      r.kelompok = Object.keys(kel).length;
      r.pctBarcode = r.total ? Math.round(r.barcode / r.total * 100) : 0;
      return r;
    });

    // KPI keaktifan: berapa pertemuan (tanggal berbeda) tiap jamaah hadir pada sesi yang ditampilkan
    var hadirTgl = {};
    rows.forEach(function (r) {
      Object.keys(per[r.id_sesi]).forEach(function (id) { (hadirTgl[id] = hadirTgl[id] || {})[r.tanggal] = true; });
    });
    var populasi = pesertaProgram_(p, db.jamaahList);
    var inPop = {}; populasi.forEach(function (j) { inPop[j.id_jamaah] = true; });
    Object.keys(hadirTgl).forEach(function (id) { if (!inPop[id] && db.jamaah[id]) { populasi.push(db.jamaah[id]); inPop[id] = true; } });
    var kat = { aktif: [], sedang: [], tidak: [] };
    populasi.forEach(function (j) {
      var n = hadirTgl[j.id_jamaah] ? Object.keys(hadirTgl[j.id_jamaah]).length : 0;
      (n >= BATAS_AKTIF ? kat.aktif : n >= 1 ? kat.sedang : kat.tidak).push([j.id_jamaah, j.nama, j.kelompok || j.desa || '', n]);
    });
    Object.keys(kat).forEach(function (k) { kat[k].sort(function (a, b) { return b[3] - a[3] || a[1].localeCompare(b[1]); }); });
    // Rata-rata dari sesi yang sudah ditutup (sesi yang masih berlangsung angkanya masih bertambah).
    var basis = rows.filter(function (r) { return !r.berlangsung; });
    if (!basis.length) basis = rows;
    var n = basis.length;
    function avg(key) { var s = 0; basis.forEach(function (r) { s += r[key]; }); return n ? Math.round(s / n * 10) / 10 : 0; }
    var totalHadir = 0, totalBarcode = 0;
    basis.forEach(function (r) { totalHadir += r.total; totalBarcode += r.barcode; });
    var pop = populasi.length;
    function pct(x) { return pop ? Math.round(x / pop * 100) : 0; }
    return {
      program: { id_program: p.id_program, nama_program: p.nama_program }, idSesi: idSesi,
      kpi: {
        total: pop, aktif: kat.aktif.length, aktifPct: pct(kat.aktif.length), sedang: kat.sedang.length, sedangPct: pct(kat.sedang.length),
        tidak: kat.tidak.length, tidakPct: pct(kat.tidak.length), batas: BATAS_AKTIF,
        pertemuan: rows.length, ditutup: rows.length - rows.filter(function (r) { return r.berlangsung; }).length, berlangsung: rows.filter(function (r) { return r.berlangsung; }).length,
        rataHadir: avg('total'), rataAnak: avg('anak'), rataDewasa: avg('dewasa'),
        rataBarcode: avg('barcode'), pctBarcode: totalHadir ? Math.round(totalBarcode / totalHadir * 100) : 0,
        rataKelompok: avg('kelompok'), daftar: kat
      },
      rows: rows
    };
  });
}

/** Per jamaah: persentase kehadiran per program + riwayat. */
function rekapJamaah(token, idJamaah, dari, sampai) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var range = range_(dari, sampai);
    var db = loadRekapDb_();
    var j = db.jamaah[idJamaah];
    if (!j) throw new Error('Jamaah tidak ditemukan.');
    var recs = db.absensi.filter(function (a) { return a.id_jamaah === idJamaah && db.sesiById[a.id_sesi] &&
      db.sesiById[a.id_sesi].tanggal >= range.dari && db.sesiById[a.id_sesi].tanggal <= range.sampai; });
    var progIds = {};
    db.programList.forEach(function (p) { if (db.pesertaIds(p.id_program).indexOf(idJamaah) !== -1) progIds[p.id_program] = true; });
    recs.forEach(function (a) { progIds[a.id_program] = true; });

    var perProgram = Object.keys(progIds).map(function (pid) {
      var p = db.program[pid] || { nama_program: pid };
      var isPeserta = db.pesertaIds(pid).indexOf(idJamaah) !== -1;
      var mine = recs.filter(function (a) { return a.id_program === pid; });
      var c = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
      mine.forEach(function (a) { c[a.status] = (c[a.status] || 0) + 1; });
      var wajib = isPeserta ? db.sesi.filter(function (s) {
        return s.id_program === pid && s.tanggal >= range.dari && s.tanggal <= range.sampai && (!j.tanggal_daftar || s.tanggal >= j.tanggal_daftar);
      }).length : mine.length;
      return { id_program: pid, nama_program: p.nama_program, peserta: isPeserta, sesi: wajib,
               Hadir: c.Hadir, Izin: c.Izin, Sakit: c.Sakit, Alpa: c.Alpa,
               Belum: Math.max(0, wajib - mine.length), pct: wajib ? Math.round(c.Hadir / wajib * 1000) / 10 : 0 };
    }).sort(function (a, b) { return a.nama_program.localeCompare(b.nama_program); });

    var riwayat = recs.map(function (a) {
      var s = db.sesiById[a.id_sesi];
      return { id_absensi: a.id_absensi, tanggal: s.tanggal, nama_program: (db.program[a.id_program] || {}).nama_program || a.id_program,
               status: a.status, waktu: a.waktu_scan, metode: a.metode, petugas: db.namaPetugas(a.id_petugas), keterangan: a.keterangan };
    }).sort(function (a, b) { return b.tanggal.localeCompare(a.tanggal); });

    return { jamaah: { id_jamaah: j.id_jamaah, nama: j.nama, kelompok: j.desa, status: j.status, tanggal_daftar: j.tanggal_daftar },
             range: range, perProgram: perProgram, riwayat: riwayat };
  });
}

/** Per petugas: jumlah data yang dicatat dalam periode (berdasarkan tanggal sesi). */
function rekapPetugas(token, dari, sampai) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var range = range_(dari, sampai);
    var db = loadRekapDb_();
    var per = {};
    db.petugasList.forEach(function (p) {
      per[p.id_petugas] = { id: p.id_petugas, nama: p.nama, username: p.username, status: p.status };
    });
    db.absensi.forEach(function (a) {
      var s = db.sesiById[a.id_sesi];
      if (!s || s.tanggal < range.dari || s.tanggal > range.sampai) return;
      var x = per[a.id_petugas] = per[a.id_petugas] || { id: a.id_petugas, nama: db.namaPetugas(a.id_petugas), username: '', status: '' };
      x.total = (x.total || 0) + 1;
      var k = a.keterangan === KET_OTOMATIS ? 'otomatis' : a.metode === 'Scan Kamera' ? 'kamera' : a.metode === 'Scanner' ? 'scanner' : 'manual';
      x[k] = (x[k] || 0) + 1;
      x._sesi = x._sesi || {}; x._sesi[a.id_sesi] = true;
      if (!x.terakhir || a.waktu_scan > x.terakhir) x.terakhir = a.waktu_scan;
    });
    var rows = Object.keys(per).map(function (k) {
      var x = per[k];
      return { id: x.id, nama: x.nama, username: x.username, status: x.status, total: x.total || 0,
               kamera: x.kamera || 0, scanner: x.scanner || 0, manual: x.manual || 0, otomatis: x.otomatis || 0,
               sesi: x._sesi ? Object.keys(x._sesi).length : 0, terakhir: x.terakhir || '' };
    }).sort(function (a, b) { return b.total - a.total || a.nama.localeCompare(b.nama); });
    return { range: range, rows: rows };
  });
}

/** Pilihan untuk filter rekap: program + jamaah (ringkas). */
function rekapMeta(token) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    return {
      programs: readAll_('PROGRAM').map(function (p) { return { id: p.id_program, nama: p.nama_program, status: p.status }; }),
      jamaah: readAll_('DATA_JAMAAH').map(function (j) { return [j.id_jamaah, j.nama, j.desa, j.status]; })
    };
  });
}

/* =========================================================================
 * KOREKSI ABSENSI (admin) — semua tercatat di LOG
 * ========================================================================= */

function koreksiAbsensi(token, idAbsensi, status, keterangan) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (STATUS_LIST.indexOf(status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var old = findBy_('ABSENSI', 'id_absensi', idAbsensi);
      if (!old) throw new Error('Data absensi tidak ditemukan.');
      var ket = clean_(keterangan) || old.keterangan;
      var saved = updateBy_('ABSENSI', 'id_absensi', idAbsensi, { status: status, keterangan: ket });
      logActivity_(s.username, s.role, 'Koreksi absensi ' + idAbsensi + ' (' + old.id_jamaah + ', ' + old.id_sesi + '): ' +
        old.status + ' → ' + status + (clean_(keterangan) ? ' · ket: ' + clean_(keterangan) : ''));
      return strip_(saved);
    });
  });
}

function hapusAbsensi(token, idAbsensi) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    return withLock_(function () {
      var old = deleteBy_('ABSENSI', 'id_absensi', idAbsensi);
      logActivity_(s.username, s.role, 'Hapus absensi ' + idAbsensi + ' (' + old.id_jamaah + ', ' + old.id_sesi + ', ' + old.status + ' ' + old.waktu_scan + ')');
      return true;
    });
  });
}

/** Admin mencatat absensi yang terlewat (boleh juga untuk sesi yang sudah ditutup). */
function tandaiAbsensiAdmin(token, idSesi, idJamaah, status, keterangan) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (STATUS_LIST.indexOf(status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var sesi = findBy_('SESI', 'id_sesi', idSesi);
      if (!sesi) throw new Error('Sesi tidak ditemukan.');
      if (!findBy_('DATA_JAMAAH', 'id_jamaah', idJamaah)) throw new Error('Jamaah tidak ditemukan.');
      var all = readAll_('ABSENSI'), maxNum = 0;
      all.forEach(function (a) {
        if (a.id_sesi === idSesi && a.id_jamaah === idJamaah) throw new Error('Jamaah ini sudah tercatat di sesi tersebut. Gunakan koreksi.');
        var n = parseInt(String(a.id_absensi).replace(/\D/g, ''), 10);
        if (n > maxNum) maxNum = n;
      });
      var rec = { id_absensi: 'ABS' + ('000000' + (maxNum + 1)).slice(-6), id_sesi: idSesi, id_program: sesi.id_program,
                  id_jamaah: idJamaah, status: status, waktu_scan: now_(), id_petugas: s.id, metode: 'Manual',
                  keterangan: clean_(keterangan) || 'Dicatat admin' };
      appendRow_('ABSENSI', rec);
      logActivity_(s.username, s.role, 'Tambah absensi oleh admin ' + rec.id_absensi + ' (' + idJamaah + ', ' + idSesi + ', ' + status + ')');
      return rec;
    });
  });
}

/* =========================================================================
 * EXPORT KE GOOGLE DRIVE (Sheets + PDF) — cadangan bila unduhan diblokir browser
 * tables: [{name, headers:[...], rows:[[...]]}]
 * ========================================================================= */

function exportKeDrive(token, judul, tables) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    judul = clean_(judul).substring(0, 90) || 'Rekap Absensi';
    if (!Array.isArray(tables) || !tables.length) throw new Error('Tidak ada data untuk diexport.');
    var total = 0;
    tables.forEach(function (t) { total += (t.rows || []).length; });
    if (total > 20000) throw new Error('Data terlalu besar (maks. 20.000 baris). Persempit periode.');

    var ss = SpreadsheetApp.create(judul + ' — ' + now_());
    tables.forEach(function (t, i) {
      var name = clean_(t.name).replace(/[\[\]\*\/\\\?:]/g, ' ').substring(0, 90) || ('Data ' + (i + 1));
      var sh = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
      var headers = t.headers || [];
      var rows = (t.rows || []).map(function (r) {
        return headers.map(function (_, c) { var v = r[c]; return v === null || v === undefined ? '' : v; });
      });
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#065F46').setFontColor('#ffffff');
      if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, headers.length);
    });
    SpreadsheetApp.flush();

    var folder = exportFolder_();
    var file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
    var pdf = folder.createFile(file.getAs('application/pdf')).setName(judul + ' — ' + now_() + '.pdf');
    logActivity_(s.username, s.role, 'Export ke Drive: ' + judul + ' (' + total + ' baris)');
    return { sheetUrl: ss.getUrl(), pdfUrl: pdf.getUrl(), folderUrl: folder.getUrl() };
  });
}

function exportFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('EXPORT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* terhapus → buat baru */ } }
  var f = DriveApp.createFolder('Rekap Absensi Jamaah');
  props.setProperty('EXPORT_FOLDER_ID', f.getId());
  return f;
}

/* =========================================================================
 * Helper
 * ========================================================================= */

/** Rentang tanggal; default bulan berjalan. */
function range_(dari, sampai) {
  var d = normalizeDate_(dari), s = normalizeDate_(sampai);
  var t = today_();
  if (!d) d = t.substring(0, 8) + '01';
  if (!s) s = t;
  if (d > s) { var x = d; d = s; s = x; }
  return { dari: d, sampai: s };
}

/** Baca semua sheet sekali, siapkan indeks yang dipakai rekap. */
function loadRekapDb_() {
  var db = {
    jamaahList: readAll_('DATA_JAMAAH'), programList: readAll_('PROGRAM'), sesi: readAll_('SESI'),
    absensi: readAll_('ABSENSI'), petugasList: readAll_('PETUGAS'), adminList: readAll_('ADMIN')
  };
  db.jamaah = {}; db.jamaahList.forEach(function (j) { db.jamaah[j.id_jamaah] = j; });
  db.program = {}; db.programList.forEach(function (p) { db.program[p.id_program] = p; });
  db.sesiById = {}; db.sesi.forEach(function (s) { db.sesiById[s.id_sesi] = s; });
  db.countBySesi = {};
  db.absensi.forEach(function (a) {
    var c = db.countBySesi[a.id_sesi] = db.countBySesi[a.id_sesi] || {};
    c[a.status] = (c[a.status] || 0) + 1;
  });
  var people = {};
  db.petugasList.forEach(function (p) { people[p.id_petugas] = p.nama; });
  db.adminList.forEach(function (a) { people[a.id_admin] = a.nama + ' (admin)'; });
  people.IMPOR = 'Impor Google Form';
  db.namaPetugas = function (id) { return people[id] || id || ''; };
  var pcache = {};
  db.pesertaIds = function (pid) {
    if (!pcache[pid]) pcache[pid] = db.program[pid] ? pesertaProgram_(db.program[pid], db.jamaahList).map(function (j) { return j.id_jamaah; }) : [];
    return pcache[pid];
  };
  db.pesertaN = function (pid) { return db.pesertaIds(pid).length; };
  return db;
}
