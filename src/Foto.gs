/**
 * Foto.gs — foto jamaah.
 * - Semua foto dikonversi ke WebP di browser sebelum diunggah (hemat penyimpanan).
 * - Foto besar (maks 480 px) disimpan di Google Drive folder "Foto Jamaah" — PRIVAT (tidak dibagikan publik),
 *   hanya bisa diambil lewat aplikasi oleh pengguna yang login.
 * - Thumbnail kecil (±64 px) disimpan di sheet FOTO_JAMAAH agar daftar jamaah cepat dimuat.
 */

var FOTO_MAX = 160000;     // panjang data URL foto besar (±120 KB)
var THUMB_MAX = 12000;     // panjang data URL thumbnail (±9 KB)

/** Semua thumbnail: { id_jamaah: dataUrl }. Admin & petugas. */
function listThumbJamaah(token) {
  return respond_(function () {
    var s = requireAuth_(token, 'any');
    var m = thumbMap_();
    if (s.role !== 'fasilitator') return m;
    var boleh = binaanSet_(s.id), out = {};   // fasilitator: hanya foto jamaah binaannya
    Object.keys(m).forEach(function (id) { if (boleh[id]) out[id] = m[id]; });
    return out;
  });
}

/** Foto besar satu jamaah (data URL WebP) atau '' bila belum ada. Admin & petugas. */
function getFotoJamaah(token, idJamaah) {
  return respond_(function () {
    var s = requireAuth_(token, 'any');
    if (s.role === 'fasilitator' && !binaanSet_(s.id)[clean_(idJamaah).toUpperCase()]) throw new Error('Jamaah ini bukan binaan Anda.');
    var f = findBy_('FOTO_JAMAAH', 'id_jamaah', clean_(idJamaah).toUpperCase());
    if (!f || !f.file_id) return f && f.thumb ? f.thumb : '';
    try {
      var blob = DriveApp.getFileById(f.file_id).getBlob();
      return 'data:' + (blob.getContentType() || 'image/webp') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (err) { return f.thumb || ''; }
  });
}

/**
 * Simpan / ganti foto. Boleh oleh admin, atau petugas yang sedang bertugas (idSesi dibuka hari ini).
 * foto & thumb harus data URL image/webp. Kirim foto = '' untuk menghapus.
 */
function simpanFotoJamaah(token, idJamaah, foto, thumb, idSesi) {
  return respond_(function () {
    var s;
    if (idSesi) {
      var sesi = findBy_('SESI', 'id_sesi', idSesi);
      if (!sesi) throw new Error('Sesi tidak ditemukan.');
      s = requireAuth_(token, 'petugas', sesi.id_program);
      if (s.role !== 'admin' && (sesi.status !== 'Dibuka' || sesi.tanggal !== today_())) throw new Error('Unggah foto hanya bisa saat bertugas.');
    } else {
      s = requireAuth_(token, 'pendataan');   // admin & petugas pendataan
    }
    idJamaah = clean_(idJamaah).toUpperCase();
    if (!findBy_('DATA_JAMAAH', 'id_jamaah', idJamaah)) throw new Error('Jamaah tidak ditemukan.');
    foto = String(foto || ''); thumb = String(thumb || '');
    var hapus = !foto;
    if (!hapus) {
      if (!/^data:image\/webp;base64,[A-Za-z0-9+\/=]+$/.test(foto) || !/^data:image\/webp;base64,[A-Za-z0-9+\/=]+$/.test(thumb)) {
        throw new Error('Foto harus berformat WebP (dikonversi otomatis oleh aplikasi).');
      }
      if (foto.length > FOTO_MAX) throw new Error('Foto terlalu besar.');
      if (thumb.length > THUMB_MAX) throw new Error('Thumbnail terlalu besar.');
    }
    return withLock_(function () {
      var old = findBy_('FOTO_JAMAAH', 'id_jamaah', idJamaah);
      if (old && old.file_id) { try { DriveApp.getFileById(old.file_id).setTrashed(true); } catch (e) { /* sudah tidak ada */ } }
      if (hapus) {
        if (old) deleteBy_('FOTO_JAMAAH', 'id_jamaah', idJamaah);
        logActivity_(s.username, s.role, 'Hapus foto jamaah ' + idJamaah);
        return { thumb: '' };
      }
      var b64 = foto.split(',')[1];
      var file = fotoFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/webp', idJamaah + '.webp'));
      var rec = { id_jamaah: idJamaah, thumb: thumb, file_id: file.getId(), diperbarui: now_() };
      if (old) updateBy_('FOTO_JAMAAH', 'id_jamaah', idJamaah, rec); else appendRow_('FOTO_JAMAAH', rec);
      logActivity_(s.username, s.role, (old ? 'Ganti' : 'Unggah') + ' foto jamaah ' + idJamaah + ' (' + Math.round(b64.length * 0.75 / 1024) + ' KB WebP)');
      return { thumb: thumb };
    });
  });
}

/* ---------- Helper ---------- */

function thumbMap_() {
  var m = {};
  readAll_('FOTO_JAMAAH').forEach(function (f) { if (f.thumb) m[f.id_jamaah] = f.thumb; });
  return m;
}

/** Folder Drive privat untuk foto jamaah (tidak dibagikan). */
function fotoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* terhapus → buat baru */ } }
  var f = DriveApp.createFolder('Foto Jamaah (Absensi)');
  props.setProperty('FOTO_FOLDER_ID', f.getId());
  return f;
}

/** { id_jamaah: true } untuk jamaah binaan seorang fasilitator. */
function binaanSet_(idFasilitator) {
  var nama = {}, set = {};
  kelasMilik_(idFasilitator).forEach(function (k) { nama[k.nama] = true; });
  readAll_('DATA_JAMAAH').forEach(function (j) { if (nama[j.kelompok]) set[j.id_jamaah] = true; });
  return set;
}
