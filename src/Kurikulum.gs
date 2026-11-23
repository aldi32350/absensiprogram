/**
 * Kurikulum.gs — kurikulum MIM BBHQ dalam bentuk "pos indikator" per level + progres per jamaah.
 *
 * Prinsip: patokannya KUALITAS BACAAN (lulus indikator), bukan halaman. Iqro hanya alat bantu.
 * - Tiap level punya pos berurutan. Fasilitator menilai 1 pos dengan 1 tap: Lulus (hijau) / Tetap & Kuatkan (kuning).
 * - Kuning boleh diberi tag titik lemah + 1 baris catatan → jadi "catatan estafet" untuk fasilitator pasangan berikutnya.
 * - Semua pos (dan EBTA untuk Iqro 6) hijau → tombol "Siap Naik Level (Ajukan)" → tercatat sebagai laporan Lanjut.
 * - Setiap penilaian disimpan sebagai riwayat (sheet PROGRES POS): siapa yang mengajar, kapan, dan apakah pengganti.
 */

var KURIKULUM = {
  "Iqro' 1": { regu: 'Regu Mantap Huruf', pos: [
    { k: '1', n: 'Kenal Huruf & Makhraj', d: 'Hafal bunyi huruf tunggal berharakat fathah (a) sesuai tempat keluarnya, dibaca tegas putus-putus tanpa mengeja.', ref: 'Iqro 1 hal. 1–25',
      tags: ['Masih mengeja', 'Makhraj belum tepat', 'Belum tegas', 'Kurang hafal huruf'] },
    { k: '2', n: 'Bedain Huruf Mirip', d: 'Tidak tertukar huruf yang bentuk/bunyinya mirip: ج-ح-خ, ع-غ, ص-ض, ط-ظ, س-ش.', ref: 'Iqro 1 hal. 3–22',
      tags: ['ج ح خ', 'ع غ', 'ص ض', 'ط ظ', 'س ش'] },
    { k: '3', n: 'Uji Acak & Lancar', d: 'Lulus dites tunjuk acak di halaman mana saja tanpa berpikir lama.', ref: 'Iqro 1 hal. 26–32',
      tags: ['Masih lama berpikir', 'Masih mengeja', 'Tertukar huruf'] }
  ] },
  "Iqro' 2": { regu: 'Regu Rangkai Huruf', pos: [
    { k: '1', n: 'Bentuk Huruf Sambung', d: 'Kenal perubahan bentuk huruf di awal, tengah, dan akhir kata.', ref: 'Iqro 2 hal. 1–8',
      tags: ['Bentuk awal', 'Bentuk tengah', 'Bentuk akhir'] },
    { k: '2', n: 'Baca Sambung Lancar', d: 'Lancar membaca rangkaian huruf sambung berharakat fathah tanpa mengeja per huruf.', ref: 'Iqro 2 hal. 9–20',
      tags: ['Masih mengeja', 'Terputus-putus', 'Tertukar huruf'] },
    { k: '3', n: 'Awal Panjang-Pendek', d: 'Bisa membedakan bacaan pendek (1 ketukan) dan panjang 2 harakat (Alif / fathah tegak).', ref: 'Iqro 2 hal. 21–30',
      tags: ['Pendek jadi panjang', 'Panjang jadi pendek', 'Fathah tegak'] }
  ] },
  "Iqro' 3": { regu: 'Regu Panjang-Pendek', pos: [
    { k: '1', n: 'Harakat Dasar Lengkap', d: 'Lancar membaca campuran fathah (a), kasrah (i), dhammah (u) di huruf sambung tanpa tertukar i dan u.', ref: 'Iqro 3 hal. 1–8 & 15–18',
      tags: ['Tertukar i / u', 'Masih mengeja', 'Kurang lancar'] },
    { k: '2', n: 'Panjang Kasrah & Dhammah', d: 'Tepat membaca panjang 2 harakat pada Ya sukun / kasrah berdiri dan Wau sukun / dhammah terbalik.', ref: 'Iqro 3 hal. 9–14 & 19–24',
      tags: ['Mad Ya', 'Mad Wau', 'Kasrah berdiri', 'Dhammah terbalik'] },
    { k: '3', n: 'Konsisten Panjang-Pendek', d: 'Lulus tes acak campuran: tidak ada huruf pendek yang kepanjangan atau mad yang kependekan.', ref: 'Iqro 3 hal. 25–30',
      tags: ['Pendek jadi panjang', 'Mad kependekan', 'Kurang lancar'] }
  ] },
  "Iqro' 4": { regu: 'Regu Tajwid Dasar', pos: [
    { k: '1', n: 'Tanwin', d: 'Tepat dan pendek membaca harakat tanwin (an-in-un).', ref: 'Iqro 4 hal. 1–6', tags: ['Tanwin dipanjangkan', 'Tertukar an/in/un'] },
    { k: '2', n: 'Huruf Sukun & Lin', d: 'Membaca huruf mati (sukun) bersih tanpa memantul, plus ayunan lembut huruf lin (au / ai).', ref: 'Iqro 4 hal. 7–14', tags: ['Sukun memantul', 'Lin (au/ai)'] },
    { k: '3', n: 'Qalqalah', d: 'Pantulan ringan pada huruf ب ج د ط ق sukun.', ref: 'Iqro 4 hal. 15–18', tags: ['Tidak memantul', 'Pantulan berlebihan'] },
    { k: '4', n: 'Dengung Praktis', d: 'Bisa membedakan nun/mim sukun yang jelas (izhar) dan yang didengungkan (ikhfa) secara praktik.', ref: 'Iqro 4 hal. 19–30', tags: ['Izhar', 'Ikhfa', 'Dengung kurang'] }
  ] },
  "Iqro' 5": { regu: 'Regu Tajwid Lancar', pos: [
    { k: '1', n: 'Cara Berhenti (Waqaf)', d: 'Benar mematikan huruf di akhir kalimat, termasuk ta marbuthah (ة) menjadi h sukun.', ref: 'Iqro 5 hal. 1–6', tags: ['Ta marbuthah', 'Waqaf belum mati'] },
    { k: '2', n: 'Alif Lam', d: 'Membedakan Alif Lam yang dibaca jelas (Qamariyah) dan yang lebur (Syamsiyah).', ref: 'Iqro 5 hal. 7–10', tags: ['Qamariyah', 'Syamsiyah'] },
    { k: '3', n: 'Tasydid & Ghunnah', d: 'Ditekan pada tasydid, ditahan dengungnya pada Nun dan Mim bertasydid.', ref: 'Iqro 5 hal. 11–15', tags: ['Tasydid kurang tekan', 'Ghunnah kurang'] },
    { k: '4', n: 'Mad Panjang 4–5 Harakat', d: 'Konsisten memanjangkan bacaan bertanda bendera/alis (~) 4–5 ketukan.', ref: 'Iqro 5 hal. 16–30', tags: ['Mad kependekan', 'Tidak konsisten'] }
  ] },
  "Iqro' 6": { regu: "Regu Siap Qur'an", pos: [
    { k: '1', n: 'Hukum Nun Sukun / Tanwin', d: 'Otomatis menerapkan idgham, iqlab, ikhfa saat membaca ayat tanpa memikirkan teori.', ref: 'Iqro 6 hal. 1–14', tags: ['Idgham', 'Iqlab', 'Ikhfa'] },
    { k: '2', n: 'Tanda Waqaf', d: 'Paham tanda berhenti (مـ، لا، ج، صلى، قلى) agar tidak memotong arti ayat.', ref: 'Iqro 6 hal. 15–20', tags: ['Salah berhenti', 'Belum paham tanda'] },
    { k: '3', n: 'Bacaan Panjang & Huruf Potong', d: "Lancar membaca kalimat panjang Al-Qur'an termasuk huruf pembuka surat (Alif Lam Mim).", ref: 'Iqro 6 hal. 21–30', tags: ['Kalimat panjang', 'Huruf potong'] }
  ], ebta: [
    { k: 'E1', n: 'Makhraj & Huruf Mirip', d: "Konsisten membedakan 'Ain vs Hamzah, Ha besar vs Ha kecil, Sya vs Sa, Dza vs Za, Qaf vs Kaf.", tags: ["'Ain/Hamzah", 'Ha besar/kecil', 'Sya/Sa', 'Dza/Za', 'Qaf/Kaf'] },
    { k: 'E2', n: 'Panjang-Pendek (Mad)', d: 'Pas ketukannya (1, 2, 4, atau 5 harakat), tidak tertukar.', tags: ['Mad tertukar'] },
    { k: 'E3', n: 'Kelancaran', d: 'Membaca langsung tanpa mengeja dalam hati, tempo stabil (tartil, tidak terburu-buru).', tags: ['Masih mengeja', 'Terburu-buru'] },
    { k: 'E4', n: 'Tajwid Praktis', d: 'Dengung (ghunnah/ikhfa/idgham) dan pantulan qalqalah sudah alami.', tags: ['Dengung', 'Qalqalah'] },
    { k: 'E5', n: "Waqaf & Ibtida'", d: 'Benar mematikan huruf akhir (terutama ة jadi ha sukun) dan berhenti di tempat yang pas.', tags: ['Ta marbuthah', 'Tempat berhenti'] }
  ] },
  "Qur'an Kecil": { regu: 'Tahsin Dasar', pos: [
    { k: '1', n: 'Makhraj & Tahsin Huruf', d: "Pengucapan makhraj huruf di dalam ayat bersih, jelas, dan tidak tertukar antar-huruf berdekatan.", ref: 'Mushaf: Al-Fatihah, Maryam, surah pilihan', tags: ['Makhraj', 'Huruf berdekatan'] },
    { k: '2', n: 'Panjang-Pendek & Tajwid Dasar', d: 'Panjang-pendek (mad) konsisten dan tajwid dasar diterapkan tepat saat membaca mushaf.', ref: 'Mushaf: surah pilihan', tags: ['Mad', 'Tajwid dasar'] },
    { k: '3', n: "Kelancaran, Waqaf & Ibtida'", d: "Bacaan mengalir lancar, tepat berhenti dan memulai kembali, serta lulus asesmen surah pilihan.", ref: 'Asesmen: QS Al-Fatihah, QS Maryam', tags: ['Kurang lancar', 'Waqaf', "Ibtida'"] }
  ] },
  "Qur'an Sedang": { regu: 'Tahsin & Tilawah', pos: [
    { k: '1', n: 'Kelancaran & Tartil', d: "Membaca Al-Qur'an dengan irama tartil, tenang, dan lancar tanpa terbata-bata.", ref: 'Mushaf', tags: ['Terbata-bata', 'Terburu-buru'] },
    { k: '2', n: 'Konsistensi Tajwid', d: 'Penerapan seluruh kaidah tajwid stabil di berbagai ayat panjang.', ref: 'Mushaf', tags: ['Mad', 'Dengung', 'Qalqalah'] },
    { k: '3', n: 'Khatam Tilawah Juz 1–30', d: "Menyelesaikan setoran tilawah dari Juz 1 sampai Juz 30 secara bertahap.", ref: 'Lanjut dari juz terakhir', juz: true, tags: [] }
  ] },
  "Qur'an Besar": { regu: 'Pengembangan Peran', jalur: {
    A: { n: 'Pemantapan Tilawah', pos: [
      { k: 'A1', n: 'Ketepatan Bacaan & Tajwid', d: 'Membaca ayat demi ayat dengan makhraj, panjang-pendek, dan tajwid yang tepat serta konsisten.', ref: 'Mushaf', tags: ['Makhraj', 'Mad', 'Tajwid'] },
      { k: 'A2', n: 'Tuntas Khatam Juz 1–30', d: 'Menyelesaikan setoran Juz 1 sampai Juz 30 secara bertahap dan tepat.', ref: 'Lanjut dari juz terakhir', juz: true, tags: [] }
    ] },
    B: { n: 'Tahfizh', pos: [
      { k: 'B1', n: 'Kualitas Bacaan Hafalan', d: 'Setiap setoran hafalan menjaga standar tahsin, makhraj, dan tajwid.', ref: 'Setoran hafalan', tags: ['Makhraj', 'Tajwid', 'Kurang lancar'] },
      { k: 'B2', n: 'Setoran & Murajaah Juz 30', d: 'Tuntas hafalan Juz 30 beserta murajaah yang kuat.', ref: 'Juz 30', tags: ['Murajaah kurang', 'Sering lupa'] }
    ] },
    C: { n: "Ta'lim Al-Qur'an (Kaderisasi)", pos: [
      { k: 'C1', n: 'Pemahaman Metode & Adab', d: 'Menguasai cara mengajar MIM (metode 3 baris), mengoreksi dengan empatik, dan adab membimbing.', ref: 'Pendampingan ustadz', tags: ['Metode', 'Adab', 'Cara mengoreksi'] },
      { k: 'C2', n: 'Praktik Mendampingi (Supervisi)', d: 'Mulai membantu mendampingi regu lain dengan supervisi ustadz/ustadzah.', ref: 'Praktik di regu lain', tags: [] }
    ] }
  } }
};

/** Daftar pos sebuah level (untuk Qur'an Besar: sesuai jalur). ebta = pos ujian akhir (Iqro 6). */
function posLevel_(level, jalur) {
  var L = KURIKULUM[level];
  if (!L) return { pos: [], ebta: [] };
  if (L.jalur) return { pos: jalur && L.jalur[jalur] ? L.jalur[jalur].pos : [], ebta: [] };
  return { pos: L.pos || [], ebta: L.ebta || [] };
}

/** Level jamaah saat ini: laporan terakhir (Lanjut → level berikutnya), atau tingkat kelas fasilitatornya. */
function levelJamaah_(lap, kelasLevel) {
  if (lap && lap.indikator) {
    var i = INDIKATOR_JAMAAH.indexOf(lap.indikator);
    if (lap.keputusan === 'Lanjut' && i >= 0 && i < INDIKATOR_JAMAAH.length - 1) return INDIKATOR_JAMAAH[i + 1];
    return lap.indikator;
  }
  return kelasLevel || INDIKATOR_JAMAAH[0];
}

/** Indeks progres: { id_jamaah: { level: { pos: entri terakhir } } } + aktivitas mengajar terakhir per jamaah. */
function indeksProgres_() {
  var byJ = {};
  readAll_('PROGRES_POS').forEach(function (p) {
    var lv = ((byJ[p.id_jamaah] = byJ[p.id_jamaah] || {})[p.level] = byJ[p.id_jamaah][p.level] || {});
    if (!lv[p.pos] || p.waktu >= lv[p.pos].waktu) lv[p.pos] = p;
  });
  return byJ;
}

/**
 * Status pos satu jamaah di levelnya. Mengembalikan:
 *  pos: [{k, n, d, ref, tags, juz?, status: 'Lulus'|'Kuatkan'|'', tag, catatan, juzNow, oleh, tanggal}]
 *  ebta, aktif (kode pos aktif), siapNaik, tertahan (daftar pos kuning yang menahan), jalur
 */
function statusPos_(level, progLevel) {
  progLevel = progLevel || {};
  var jalur = progLevel.JALUR ? progLevel.JALUR.status : '';
  var def = posLevel_(level, jalur);
  function isi(p) {
    var e = progLevel[p.k] || null;
    var o = { k: p.k, n: p.n, d: p.d, ref: p.ref || '', tags: p.tags || [], juz: !!p.juz,
              status: e ? e.status : '', tag: e ? e.tag : '', catatan: e ? e.catatan : '', juzNow: e && e.juz ? +e.juz : 0,
              oleh: e ? e.nama_fasilitator + (e.pengganti === 'Ya' ? ' (pengganti)' : '') : '', tanggal: e ? e.tanggal : '' };
    return o;
  }
  var pos = def.pos.map(isi), ebta = def.ebta.map(isi);
  var semua = pos.concat(pos.every(function (p) { return p.status === 'Lulus'; }) ? ebta : []);
  var aktif = (semua.filter(function (p) { return p.status !== 'Lulus'; })[0] || {}).k || '';
  var lulusSemua = pos.length > 0 && pos.every(function (p) { return p.status === 'Lulus'; }) && ebta.every(function (p) { return p.status === 'Lulus'; });
  var akhirLulus = pos.length && pos[pos.length - 1].status === 'Lulus';
  var tertahan = akhirLulus ? pos.filter(function (p) { return p.status !== 'Lulus'; }).map(function (p) { return 'Pos ' + p.k + ' (' + p.n + ')'; }) : [];
  var L = KURIKULUM[level] || {};
  return { level: level, regu: L.regu || '', pos: pos, ebta: ebta, aktif: aktif, siapNaik: lulusSemua, tertahan: tertahan,
           perluJalur: !!L.jalur && !jalur, jalur: jalur, jalurNama: jalur && L.jalur ? L.jalur[jalur].n : '',
           levelAkhir: INDIKATOR_JAMAAH.indexOf(level) === INDIKATOR_JAMAAH.length - 1 };
}

/**
 * Fasilitator menilai 1 pos (1 tap). data: { id_jamaah, level, pos, status: 'Lulus'|'Kuatkan'|'JALUR', tag: [..], catatan, juz,
 *   id_sesi, id_kelas_pengganti }. Bila sesi masih dibuka & jamaah belum absen → otomatis tercatat HADIR.
 */
function simpanPos(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    data = data || {};
    var idJ = clean_(data.id_jamaah).toUpperCase(), level = clean_(data.level), pos = clean_(data.pos), status = clean_(data.status);
    if (!KURIKULUM[level]) throw new Error('Level tidak dikenal.');
    return withLock_(function () {
      var me = fasilSaya_(s, data.id_kelas_pengganti);
      var j = findBy_('DATA_JAMAAH', 'id_jamaah', idJ);
      if (!j || j.status !== 'Aktif') throw new Error('Jamaah tidak ditemukan / nonaktif.');
      if (!me.kelasByNama[j.kelompok]) throw new Error('Jamaah ini bukan di kelas yang Anda ajar.');
      if (pos === 'JALUR') {
        if (!KURIKULUM[level].jalur || !KURIKULUM[level].jalur[status]) throw new Error('Jalur tidak valid.');
      } else {
        var prog = (indeksProgres_()[idJ] || {})[level] || {};
        var def = posLevel_(level, prog.JALUR ? prog.JALUR.status : '');
        var p = def.pos.concat(def.ebta).filter(function (x) { return x.k === pos; })[0];
        if (!p) throw new Error('Pos tidak dikenal untuk level ini.');
        if (['Lulus', 'Kuatkan'].indexOf(status) === -1) throw new Error('Pilih Lulus atau Tetap & Kuatkan.');
        var juz = p.juz ? Math.max(0, Math.min(30, parseInt(data.juz, 10) || 0)) : '';
        if (p.juz && status === 'Lulus' && juz < 30) throw new Error('Lulus pos ini setelah tilawah sampai Juz 30.');
      }
      var tag = (Array.isArray(data.tag) ? data.tag : String(data.tag || '').split(',')).map(clean_).filter(String).join(', ').substring(0, 200);
      var rec = {
        id: nextId_('PROGRES_POS', 'id', 'PP', 7), waktu: now_(), tanggal: today_(), id_jamaah: idJ, level: level, pos: pos, status: status,
        tag: status === 'Kuatkan' ? tag : '', catatan: clean_(data.catatan).substring(0, 200), juz: pos === 'JALUR' ? '' : juz,
        id_sesi: clean_(data.id_sesi), id_petugas: s.id, nama_fasilitator: me.f.nama, pengganti: me.pengganti ? 'Ya' : '',
        id_kelas: me.kelasByNama[j.kelompok].id_fasilitator
      };
      appendRow_('PROGRES_POS', rec);
      // Alur: dinilai di sesi yang masih dibuka = jamaah hadir → otomatis HADIR (tidak dobel dengan scan petugas).
      var absen = null;
      if (rec.id_sesi) { try { absen = catatHadirFasil_(me.f, rec.id_sesi, j); } catch (err) { absen = null; } }
      logActivity_(s.username, s.role, 'Pos ' + idJ + ' ' + level + ' ' + pos + ' → ' + status + (me.pengganti ? ' (pengganti)' : ''));
      var st = statusPos_(level, (indeksProgres_()[idJ] || {})[level]);
      return { status: st, absen: absen };
    });
  });
}

/** Semua pos hijau → ajukan naik level (tercatat sebagai laporan "Lanjut"). */
function ajukanNaikLevel(token, idJamaah, level, idSesi, idKelasPengganti) {
  return respond_(function () {
    var s = requireAuth_(token, 'fasilitator');
    return withLock_(function () {
      var me = fasilSaya_(s, idKelasPengganti);
      var j = findBy_('DATA_JAMAAH', 'id_jamaah', clean_(idJamaah).toUpperCase());
      if (!j || !me.kelasByNama[j.kelompok]) throw new Error('Jamaah ini bukan di kelas yang Anda ajar.');
      var st = statusPos_(level, (indeksProgres_()[j.id_jamaah] || {})[level]);
      if (!st.siapNaik) throw new Error(st.tertahan.length ? 'Masih harus tetap dulu untuk menguatkan ' + st.tertahan.join(', ') + '.' : 'Belum semua pos lulus.');
      var berikut = INDIKATOR_JAMAAH[INDIKATOR_JAMAAH.indexOf(level) + 1] || '';
      var rec = {
        id_laporan: nextId_('LAPORAN_FASILITATOR', 'id_laporan', 'LAP', 6), tanggal: today_(), waktu: now_(),
        id_fasilitator: me.kelasByNama[j.kelompok].id_fasilitator, nama_fasilitator: me.f.nama + (me.pengganti ? ' (pengganti)' : ''),
        id_jamaah: j.id_jamaah, nama_jamaah: j.nama, indikator: level, keputusan: 'Lanjut',
        keterangan: 'Semua pos ' + level + ' lulus' + (berikut ? ' — naik ke ' + berikut : ' — tuntas'), id_sesi: clean_(idSesi)
      };
      appendRow_('LAPORAN_FASILITATOR', rec);
      logActivity_(s.username, s.role, 'Naik level ' + j.id_jamaah + ': ' + level + ' → ' + (berikut || 'tuntas'));
      return { level_baru: berikut || level, laporan: rec };
    });
  });
}

/** Admin: riwayat penilaian pos (terbaru dulu) untuk rekap. */
function rekapProgresPos(token, opt) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    opt = opt || {};
    var idF = clean_(opt.id_fasilitator), dari = clean_(opt.dari), sampai = clean_(opt.sampai);
    var nama = {}; readAll_('DATA_JAMAAH').forEach(function (j) { nama[j.id_jamaah] = j.nama; });
    return readAll_('PROGRES_POS').filter(function (p) {
      return p.pos !== 'JALUR' && (!idF || p.id_kelas === idF) && (!dari || p.tanggal >= dari) && (!sampai || p.tanggal <= sampai);
    }).sort(function (a, b) { return b.waktu.localeCompare(a.waktu); }).slice(0, 1000).map(function (p) {
      var def = posLevel_(p.level, p.pos.charAt(0) >= 'A' && p.pos.charAt(0) <= 'C' && p.level === "Qur'an Besar" ? p.pos.charAt(0) : '');
      var d = def.pos.concat(def.ebta).filter(function (x) { return x.k === p.pos; })[0];
      var o = strip_(p); o.nama_jamaah = nama[p.id_jamaah] || p.id_jamaah; o.nama_pos = d ? d.n : ''; return o;
    });
  });
}
