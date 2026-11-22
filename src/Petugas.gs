/**
 * Petugas.gs — CRUD petugas, penugasan program, reset PIN (khusus admin).
 */

var STATUS_PETUGAS = ['Aktif', 'Nonaktif'];

/** Daftar petugas (tanpa hash/salt) + daftar program untuk form. */
function listPetugas(token) {
  return respond_(function () {
    requireAuth_(token, 'admin');
    var programs = readAll_('PROGRAM').map(function (p) {
      return { id_program: p.id_program, nama_program: p.nama_program, status: p.status };
    });
    withLock_(migrasiAkunFasilitator_);
    var kelas = readAll_('FASILITATOR');
    var rows = readAll_('PETUGAS').map(function (p) {
      var o = publicPetugas_(p);
      if (o.jenis === 'fasilitator') o.kelas = kelas.filter(function (k) { return k.anggota_1 === p.id_petugas || k.anggota_2 === p.id_petugas; })
        .map(function (k) { return { id_fasilitator: k.id_fasilitator, nama: k.nama, kelas: k.kelas, kategori: k.kategori }; });
      return o;
    });
    return { rows: rows, programs: programs };
  });
}

function savePetugas(token, data) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    data = data || {};
    var rec = {
      nama: clean_(data.nama),
      username: clean_(data.username).toLowerCase(),
      program_ids: (Array.isArray(data.program_ids) ? data.program_ids : splitList_(data.program_ids))
        .map(clean_).filter(String).join(','),
      status: clean_(data.status) || 'Aktif',
      jenis: ['pendataan', 'fasilitator'].indexOf(clean_(data.jenis)) !== -1 ? clean_(data.jenis) : 'absensi'   // absensi = scan · pendataan = data master · fasilitator = kelas
    };
    if (!rec.nama) throw new Error('Nama petugas wajib diisi.');
    if (!/^[a-z0-9._]{3,20}$/.test(rec.username)) throw new Error('Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.');
    if (STATUS_PETUGAS.indexOf(rec.status) === -1) throw new Error('Status tidak valid.');
    var validProg = {};
    readAll_('PROGRAM').forEach(function (p) { validProg[p.id_program] = true; });
    splitList_(rec.program_ids).forEach(function (id) {
      if (!validProg[id]) throw new Error('Program tidak dikenal: ' + id);
    });

    return withLock_(function () {
      cekUsernameUnik_(rec.username, 'PETUGAS', data.id_petugas || '');

      if (data.id_petugas) {
        var lama = findBy_('PETUGAS', 'id_petugas', data.id_petugas);
        if (lama && lama.jenis === 'fasilitator' && rec.jenis !== 'fasilitator' && kelasMilik_(data.id_petugas).length) {
          throw new Error('Fasilitator ini masih memegang kelas. Lepaskan dari kelasnya dulu di menu Fasilitator.');
        }
        var saved = updateBy_('PETUGAS', 'id_petugas', data.id_petugas, rec);
        if (rec.status !== 'Aktif' || (lama && lama.jenis !== rec.jenis)) hapusSesiUser_(data.id_petugas);
        if (rec.jenis === 'fasilitator' && lama && lama.nama !== rec.nama) perbaruiNamaKelas_(data.id_petugas);
        logActivity_(s.username, s.role, 'Edit petugas ' + data.id_petugas + ' (' + rec.username + ')');
        return publicPetugas_(saved);
      }
      var pin = cekPasswordUser_(data.password || data.pin);
      rec.id_petugas = nextId_('PETUGAS', 'id_petugas', 'PTG', 3);
      rec.salt = newSalt_();
      rec.pin_hash = hash_(pin, rec.salt);
      appendRow_('PETUGAS', rec);
      logActivity_(s.username, s.role, 'Tambah petugas ' + rec.id_petugas + ' (' + rec.username + ')');
      return publicPetugas_(rec);
    });
  });
}

function setPetugasStatus(token, id, status) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    if (STATUS_PETUGAS.indexOf(status) === -1) throw new Error('Status tidak valid.');
    return withLock_(function () {
      var saved = updateBy_('PETUGAS', 'id_petugas', id, { status: status });
      if (status !== 'Aktif') hapusSesiUser_(id);
      logActivity_(s.username, s.role, 'Status petugas ' + id + ' → ' + status);
      return publicPetugas_(saved);
    });
  });
}

/** Reset PIN. pin kosong → dibuatkan PIN acak 4 angka. Mengembalikan PIN baru (tampil sekali). */
function resetPinPetugas(token, id, pin) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    pin = String(pin || '') || passwordAcak_();
    cekPasswordUser_(pin);
    return withLock_(function () {
      var salt = newSalt_();
      var saved = updateBy_('PETUGAS', 'id_petugas', id, { salt: salt, pin_hash: hash_(pin, salt) });
      hapusSesiUser_(id);
      logActivity_(s.username, s.role, 'Reset password petugas ' + id + ' (' + saved.username + ')');
      return { pin: pin, username: saved.username };
    });
  });
}

/** Hapus petugas hanya bila belum pernah mencatat absensi. */
function deletePetugas(token, id) {
  return respond_(function () {
    var s = requireAuth_(token, 'admin');
    return withLock_(function () {
      var used = readAll_('ABSENSI').some(function (a) { return a.id_petugas === id; });
      if (used) throw new Error('User ini sudah pernah mencatat absensi. Nonaktifkan saja agar riwayat tetap utuh.');
      if (kelasMilik_(id).length) throw new Error('Fasilitator ini masih memegang kelas. Lepaskan dari kelasnya dulu di menu Fasilitator.');
      var rec = deleteBy_('PETUGAS', 'id_petugas', id);
      hapusSesiUser_(id);
      logActivity_(s.username, s.role, 'Hapus petugas ' + id + ' (' + rec.username + ')');
      return true;
    });
  });
}

/** Putuskan semua sesi login satu user (apa pun perannya). */
function hapusSesiUser_(id) {
  ['petugas', 'pendataan', 'fasilitator'].forEach(function (r) { destroySessionsOf_(r, id); });
}

function publicPetugas_(p) {
  return { id_petugas: p.id_petugas, nama: p.nama, username: p.username,
           program_ids: splitList_(p.program_ids), status: p.status,
           jenis: p.jenis === 'pendataan' || p.jenis === 'fasilitator' ? p.jenis : 'absensi' };
}
