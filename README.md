# Absensi Jamaah (QR / Barcode)

Aplikasi web absensi jamaah per program. Backend dan database memakai **Google Sheets + Google Apps Script** (Web App).

- **Admin** mengelola data jamaah, program, sesi, petugas, profil yayasan, kartu, dan rekap.
- **Petugas** cukup scan kartu jamaah dari HP.

Warna mengikuti sosmedmmb.web.id (hijau emerald + emas). Panduan pemakaian ada di **[PANDUAN.md](PANDUAN.md)**.

| URL | Untuk |
|---|---|
| `…/exec` | Petugas: login dengan PIN, lalu scan |
| `…/exec?page=admin` | Admin |

## Status tahapan
- [x] a. Setup project dan database (+ migrasi kolom otomatis)
- [x] b. Login admin dan petugas (token 8 jam, role dicek di server, LOG)
- [x] c. Master data: jamaah format MIM, 13 program MIM, sesi, petugas
- [x] d. Kartu jamaah: desain potret dengan QR, mengambil profil yayasan
- [x] e. Aplikasi petugas: kamera QR/CODE128, scanner USB/BT, input manual, mode offline
- [x] f. Rekap 4 jenis, koreksi, export CSV/Excel/PDF/Drive, dashboard KPI + grafik
- [x] g. Polishing, tampilan HP dan laptop, panduan

## Tampilan
- **Login**: gaya Kalender Konten dengan tab Admin | Petugas dan tema Terang/Gelap.
  - Login admin dan petugas **tampilannya sama**: di laptop panel kiri berisi hero hijau, panel kanan berisi form username + password/PIN. Di HP hanya form yang tampil. Bedanya hanya isian password (admin) atau PIN (petugas).
- **Panel admin**: sidebar hijau, area kerja terang/gelap. Di HP, sidebar menjadi menu ☰.
- **Aplikasi petugas**: kaca hijau. Di laptop tampil sebagai kolom selebar HP.
- Logo dan nama yayasan dari **Profil Yayasan** otomatis muncul di login, sidebar, dan kartu.

## Struktur folder
```
absensi-jamaah/
├── src/                    ← di-push ke Apps Script (clasp rootDir)
│   ├── appsscript.json
│   ├── Code.gs             ← doGet, helper database, migrasi otomatis, LOG, guardOwner_
│   ├── Setup.gs            ← skema sheet, 13 program MIM, data awal, hapus dummy
│   ├── Auth.gs             ← login, hash SHA-256 + salt, token 8 jam, requireAuth_
│   ├── Fasilitator.gs      ← master fasilitator + jamaah binaan
│   ├── Jamaah.gs           ← CRUD + import upsert (format MASTER DATA JAMAAH MIM)
│   ├── Program.gs  Petugas.gs  Absensi.gs
│   ├── Rekap.gs            ← dashboard KPI, tren, rekap, koreksi, export Drive
│   ├── Profil.gs           ← profil yayasan & teks kartu (sheet PENGATURAN)
│   ├── styles.html  scripts.html
│   ├── index-admin.html  index-petugas.html  login-admin.html  login-petugas.html
│   └── dashboard.html  jamaah.html  program.html  petugas.html  kartu.html  rekap.html  profil.html  absensi.html
└── dev/server.js           ← server lokal tiruan Apps Script (hanya untuk pengembangan)
```

## Database (1 tabel = 1 sheet)
| Sheet | Kolom |
|---|---|
| **DATA MASTER JAMAAH** | 18 kolom **persis seperti file MASTER DATA JAMAAH**: No Jamaah (**MIM-0001**, isi QR) · Nama Lengkap · Nama Panggilan · Jenis Kelamin (Ikhwan/Akhwat) · Tanggal Lahir (dd/mm/yyyy) · Usia (otomatis) · Pekerjaan · No HP · Desa / Kampung · RT · RW · Kecamatan · Kota / Kabupaten · Provinsi · Kartu Keluarga · Status (Aktif/Tidak Aktif) · Alamat Asli · Catatan — lalu 2 kolom aplikasi: **Fasilitator** (opsional) · **Tanggal Daftar** |
| PROGRAM | id_program, nama_program, deskripsi, jadwal, kelompok_peserta (fasilitator; kosong = semua jamaah aktif), status |
| SESI | id_sesi, id_program, tanggal, jam_mulai, keterangan, status (Dibuka/Ditutup) |
| ADMIN / PETUGAS | username + hash password/PIN + salt; PETUGAS punya program_ids & status |
| ABSENSI | id_absensi, id_sesi, id_program, id_jamaah, status (Hadir/Izin/Sakit/Alpa), waktu_scan, id_petugas, metode, keterangan |
| FASILITATOR | id_fasilitator, nama, no_hp, jenis_kelamin, status, catatan, username, pin_hash, salt, kelas, kategori |
| LAPORAN FASILITATOR | id_laporan, tanggal, id_fasilitator, nama_fasilitator, id_jamaah, nama_jamaah, indikator, keputusan, keterangan, waktu |
| LOG | waktu, user, role, aktivitas |
| PENGATURAN | kunci, nilai: profil yayasan, teks kartu, logo (dipecah per 40.000 karakter) |

- Semua kolom berformat **teks**, jadi no HP berawalan 0, KK 16 digit, dan tanggal tetap utuh.
- Kalau daftar kolom berubah karena update aplikasi, data lama **dipindahkan otomatis berdasarkan nama kolom** saat sheet pertama kali dibaca.
- Sheet **DATA MASTER JAMAAH** bisa dibaca & diisi langsung di Google Sheets (judul & format sama dengan file master). Baris yang ditempel tanpa No Jamaah otomatis diberi nomor saat menu Jamaah dibuka. Kolom tambahan buatan sendiri di sebelah kanan tidak akan dihapus.
- Sheet lama `DATA_JAMAAH` (versi sebelumnya) otomatis diganti nama & dikonversi.

**Program bawaan (13):** MIM - Menghafal Itu Mudah, FYB - Festival Yatim Bahagia, Bazar Ramadhan, Subuh/Dzuhur/Ashar/Maghrib/Isya Ramadhan, IFTAR Ramadhan, Terawih Ramadhan, Kajian Botram, Pasar Bahagia, OMG.

---

## Setup pertama kali
1. Pasang clasp, lalu aktifkan **Google Apps Script API** di https://script.google.com/home/usersettings:
   ```powershell
   npm i -g @google/clasp
   ```
2. Login ke akun Google (browser akan terbuka):
   ```powershell
   clasp login
   ```
3. Buat Spreadsheet dan project Apps Script dari folder `absensi-jamaah`. `clasp create` bisa menimpa `appsscript.json`, jadi file itu dibackup dulu lalu dikembalikan:
   ```powershell
   cd "E:\Project Aldi\absensi-jamaah"
   ```
   ```powershell
   Copy-Item src\appsscript.json appsscript.backup.json
   ```
   ```powershell
   clasp create --type sheets --title "Absensi Jamaah" --rootDir src
   ```
   ```powershell
   Copy-Item appsscript.backup.json src\appsscript.json -Force; Remove-Item appsscript.backup.json
   ```
   ```powershell
   clasp push -f
   ```
4. Buka editor dengan `clasp open-script` (pada clasp versi lama: `clasp open`). Pilih fungsi **`setupAll`**, klik **Run**, lalu izinkan akses yang diminta. Ini membuat 8 sheet, 13 program MIM, admin, 2 petugas contoh, dan 20 jamaah dummy (DMY-…).
5. Deploy: **Deploy → New deployment → Web app**, dengan **Execute as: Me** dan **Who has access: Anyone**. Salin URL `/exec`.
6. Login admin, buka **Jamaah → Import**, lalu pilih file **MASTER DATA JAMAAH.xlsx**. Sheet "MASTER JAMAAH" dibaca otomatis.
7. Di Google Sheets, pilih menu **Absensi Jamaah → Hapus jamaah dummy (DMY-…)**.
8. Isi **Profil Yayasan** (logo, nama, Instagram, teks kartu), lalu **ganti password admin dan PIN petugas**.

### Update kode
```powershell
clasp push
```
Setelah itu, di editor buka **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. URL tidak berubah.

Kalau update menambah sheet atau program, jalankan lagi menu **Absensi Jamaah → Setup database…** di Google Sheets. Data tidak akan terhapus.

### Akun awal
| Peran | Username | Rahasia |
|---|---|---|
| Admin | `admin` | `admin123` |
| Petugas | `petugas1` (MIM), `petugas2` (MIM + Kajian Botram) | PIN `1234` |
| Pendataan | belum ada, dibuat admin di menu Petugas (Jenis tugas: Pendataan) | PIN |
| Fasilitator | belum ada, dibuat admin di menu Fasilitator (Edit → Akun login) | PIN |

⚠️ Ganti password dan PIN ini sebelum dipakai sungguhan.

---

## Foto & detail jamaah
- **Klik baris jamaah** (menu Jamaah) untuk membuka **Detail Jamaah**: foto besar, semua kolom profil, dan tombol Edit data & foto, Cetak kartu, serta Rekap kehadiran.
- **Foto** bisa diunggah atau diambil dengan kamera di form Tambah/Edit Jamaah (admin) dan di formulir **Daftar Baru** (petugas yang sedang bertugas).
- **Selalu dikonversi ke WebP di browser** sebelum diunggah. Ada dua ukuran:
  - foto (sisi terpanjang 480 px, umumnya ±20–40 KB; contoh: foto HP 332 KB menjadi 19 KB)
  - thumbnail persegi 72 px (±1–2 KB)
- **Penyimpanan:**
  - Foto besar ada di Google Drive folder **Foto Jamaah (Absensi)** dan bersifat **privat**: tidak dibagikan publik, hanya bisa diambil lewat aplikasi oleh pengguna yang login.
  - Thumbnail ada di sheet **FOTO_JAMAAH** supaya daftar cepat dimuat.
- **Foto tampil di:**
  - admin: tabel jamaah (avatar), Detail Jamaah, dan form Tambah/Edit Jamaah
  - petugas: banner hasil scan (untuk mencocokkan wajah dengan kartu), Input Manual (hasil cari + profil), Daftar Hadir, dan formulir Daftar Baru
- Tanpa foto, yang tampil adalah inisial nama.

## Formulir Daftar Jamaah Baru (petugas)
- Desain mengikuti aplikasi: bagian **Wajib diisi** (Nama Lengkap, Jenis Kelamin) di atas, lalu bagian opsional yang bisa dilipat (Foto, Data Diri, Kontak & Alamat, Lainnya), dan tombol **Simpan Pendaftaran** selalu terlihat di bawah. Bisa dibuka lewat tombol **Daftar Baru** di layar Scan, atau dari Input Manual saat nama tidak ditemukan.
- Hanya bisa dipakai **petugas yang sedang bertugas**, yaitu yang punya sesi programnya Dibuka hari ini. Server ikut memeriksa ini.
- Data masuk ke **DATA MASTER JAMAAH** dengan No Jamaah otomatis, dan bisa langsung dicatat **Hadir**.
- Pendaftaran ganda (nama + tanggal lahir + HP sama) ditolak.

## Verifikasi scan: SALAH / BENAR
Setiap scan dari kamera atau scanner tidak langsung dicatat. Petugas melihat lembar **Cek data** berisi foto dan profil lengkap jamaah:
- **SALAH** → tidak ada yang dicatat. Muncul banner merah "Dibatalkan" dan petugas bisa scan ulang.
- **BENAR** → tercatat HADIR. Dalam mode SELESAI tombolnya **BENAR · Hadiah** dan langsung mencatat SELESAI + hadiah.
- Input Manual tidak memakai lembar ini, karena petugas sudah memilih jamaah dari daftar.
- Scan jamaah yang sudah hadir (atau sudah selesai) langsung membuka profil lengkapnya dengan judul kuning "Sudah absen jam …" dan tombol **OK · Scan berikutnya**. Kartu yang sama tidak memunculkan lembar lagi selama 4 detik setelah ditutup.

## Petugas Pendataan (data master)
Jenis petugas ketiga selain admin dan petugas absensi. Admin membuatnya di menu **Petugas** dengan **Jenis tugas: Pendataan** (kolom `jenis` di sheet PETUGAS).
- Login di halaman admin lewat tab **Pendataan** (username + PIN). Fungsi server: `loginPendataan`, dengan peran sesi `pendataan`.
- Boleh: `listJamaah`, `saveJamaah` (kecuali mengubah status), foto jamaah, dan menambah jamaah.
- Ditolak di server: import/export, kartu, program, petugas, rekap, dashboard, absensi. Petugas pendataan juga tidak bisa login di aplikasi scan, dan petugas absensi tidak bisa login di tab Pendataan.
- Jika akunnya dinonaktifkan atau jenisnya diganti, sesinya langsung tidak berlaku.
- Panel jamaah punya filter **Kelengkapan** (Data belum lengkap / Belum ada foto / Sudah lengkap). Datanya dianggap lengkap bila sudah ada Foto, Jenis kelamin, Tanggal lahir, Desa, Alamat asli, dan Kartu keluarga.

## Login & Kelola User
- Satu fungsi `login(username, password)` untuk semua akun. Peran diambil dari akunnya: ADMIN → admin, PETUGAS (jenis absensi/pendataan) → petugas/pendataan, FASILITATOR → fasilitator. Halaman otomatis menyesuaikan peran (`App.pindahHalamanSesuaiPeran`).
- Password akun non-admin disimpan sebagai hash di kolom `pin_hash` (PIN lama tetap berlaku sebagai password). Minimal 4 karakter. Username unik di semua tabel akun.
- Menu **Kelola User** (dulu *Petugas*): tambah/edit akun petugas absensi, pendataan, dan akun login fasilitator (`aturAkunFasilitator`, `hapusAkunFasilitator`, `setFasilitatorStatus`), reset password, aktif/nonaktif.
- Tombol kembali di HP dijaga `App.guardBack()`: pop-up ditutup dulu, lalu konfirmasi *Keluar dari aplikasi?*.

## Fasilitator & laporan perkembangan jamaah
- Fasilitator memilih **sesi hari ini** dulu. `fasilitatorTandaiHadir` dan `simpanLaporanFasilitator` (dengan `id_sesi`) mencatat HADIR (metode `Fasilitator`, id_petugas = id fasilitator) bila jamaah belum tercatat — dobel dengan scan petugas tanpa data ganda. Kolom `id_sesi` ditambahkan ke sheet LAPORAN FASILITATOR.
- Satu fasilitator = satu **kelas**: `kelas` (Iqro' 1 … Qur'an Besar) dan `kategori` (Ibu & Bapak / Remaja & Anak). Jamaah yang belum pernah dilaporkan dianggap berada di tingkat kelasnya.
- Admin menentukan jamaah binaan setiap fasilitator (menu **Fasilitator** → 👥; disimpan di kolom *Fasilitator* sheet DATA MASTER JAMAAH).
- Akun login fasilitator memakai kolom `username`, `pin_hash`, dan `salt` di sheet FASILITATOR. Admin mengisinya lewat Edit, dan bisa reset PIN dengan 🔑.
- Fasilitator login di halaman admin lewat tab **Fasilitator** (`loginFasilitator`, peran sesi `fasilitator`). Ia hanya melihat menu **Laporan Jamaah**, yaitu kartu jamaah binaan yang ramah HP.
- Laporan berisi indikator (Iqro' 1–6, Qur'an Kecil/Sedang/Besar), keputusan **Tetap / Lanjut**, dan keterangan. Laporan dikirim dengan konfirmasi Ya/Tidak.
- Setiap laporan menjadi satu baris baru di sheet **LAPORAN FASILITATOR**, sehingga riwayat perkembangan jamaah bisa ditelusuri.
- Server menolak fasilitator untuk semua fungsi lain (data master, absensi, rekap, dll.), dan juga menolak laporan atau foto jamaah yang bukan binaannya.
- Menu admin **Laporan Fasilitator** menampilkan rekap dengan filter fasilitator, tanggal, indikator, dan Tetap/Lanjut, ditambah sebaran posisi indikator jamaah saat ini.

## Absen HADIR & SELESAI (hadiah)
Alur program: jamaah datang lalu di-scan **HADIR**, mengikuti program, lalu saat pulang di-scan **SELESAI** dan menerima hadiah.
- Di atas kamera ada tombol **HADIR | SELESAI**. Mode yang dipilih diingat di HP.
- Saat di-scan dalam mode SELESAI:
  - 🟩 **SELESAI ✓ · Berikan hadiah 🎁** bila jamaah tadi tercatat HADIR.
  - 🟥 **Belum absen HADIR — tidak dapat hadiah** bila jamaah belum absen hadir, atau tercatat Izin/Sakit/Alpa.
  - 🟨 **Sudah selesai jam … — hadiah sudah diberikan** bila jamaah di-scan lagi. Ini mencegah hadiah dobel.
- Counter di mode SELESAI menampilkan *selesai / hadir*. Tab **Selesai 🎁** di Daftar memperlihatkan siapa saja yang sudah menerima hadiah (jam datang → jam selesai).
- Dari Input Manual, jamaah yang sudah HADIR punya tombol **SELESAI & Berikan Hadiah**.
- Mode ini bisa dipakai offline. Data dikirim berurutan (HADIR dulu, lalu SELESAI), dan server tetap memeriksa aturan hadiah.
- Data tersimpan di sheet ABSENSI kolom `waktu_selesai`, `petugas_selesai`, dan `hadiah`. Rekap & export menampilkan jam Selesai dan jumlah penerima hadiah.

## Konfirmasi setiap perubahan
Setiap aksi yang mengubah data selalu memunculkan pop-up **Ya / Tidak**. **Ya** melanjutkan, **Tidak** membatalkan.
- Saat menyimpan form, pilihan **Tidak** tidak menyimpan apa pun, dan form tetap terbuka supaya isian tidak hilang.
- Berlaku untuk: simpan form (jamaah, fasilitator, program, sesi, petugas, reset PIN, ganti password, import, koreksi/tandai absensi), hapus, aktif/nonaktif, buka/tutup sesi, Buka Sesi Hari Ini, simpan Profil Yayasan, tambah jamaah binaan, Input Manual petugas, Tutup Sesi, dan Keluar.
- **Pengecualian:** scan QR/barcode oleh petugas langsung tercatat tanpa pop-up agar scan tetap cepat.

## Fitur ringkas
- **Dashboard**:
  - Filter **program** dan **tanggal** (preset: Semua, Bulan ini, 30 hari, 3 bulan).
  - 5 KPI: **Total Jamaah**, **Aktif** (≥3× pertemuan), **Sedang** (1–2×), **Tidak Aktif** (0×), **Rata-rata Hadir per pertemuan**. Pertemuan dihitung per tanggal: beberapa program di hari yang sama dihitung satu pertemuan. Klik kartu KPI untuk melihat daftar namanya.
  - Daftar sesi hari ini, sesi yang lupa ditutup, dan grafik tren % hadir per program.
- **Jamaah**:
  - Cari dan filter (desa, Ikhwan/Akhwat, status), tambah, edit, nonaktifkan. Fasilitator dipilih dari menu Fasilitator (opsional).
  - **Import** (upsert berdasarkan No Jamaah, dengan peringatan untuk data yang perlu dicek).
  - **Export** = SEMUA data jamaah, semua kolom (No Jamaah, Usia, dst.) ke Excel/CSV/Drive. Bisa diedit lalu di-Import kembali untuk memperbarui data.
  - **Template** = lembar KOSONG berisi kolom yang diisi saat import jamaah baru (wajib bertanda \*), plus sheet PETUNJUK dengan contoh isian. No Jamaah & Usia dibuat otomatis.
  - Kolom HP, KK, RT, RW, dan tanggal berformat teks di kedua file.
- **Fasilitator** (menu sendiri): tambah, edit, nonaktifkan, dan lihat/tambah jamaah binaan. Mengganti nama ikut memperbarui jamaah dan peserta program. Nama fasilitator dari import file MIM otomatis masuk ke sini.
- **Program & Sesi**: CRUD, buka/tutup sesi, Buka Sesi Hari Ini.
- **Petugas**: CRUD, program yang ditangani, reset PIN, aktif/nonaktif.
- **Kartu Jamaah**: potret 54 × 85,6 mm, **9 per A4**. Berisi logo, judul, nama lembaga, **QR** (atau CODE128) berisi No Jamaah, tagline, pil No Jamaah, dan Instagram. Semua teks diambil dari Profil Yayasan.
- **Rekap & Laporan**: per sesi, program, jamaah, dan petugas. Ada koreksi absensi (tercatat di LOG) dan export CSV/Excel/PDF/Drive.
- **Profil Yayasan**: logo, nama, singkatan, lembaga, alamat, kontak, Instagram, teks kartu, jenis kode, dan opsi tampilkan nama. Ada pratinjau kartu langsung.
  - **Logo disimpan sesuai format aslinya.** PNG tetap PNG, dan latar transparan tetap transparan. PNG kecil disimpan utuh; yang besar diperkecil tetapi tetap PNG.
  - **Logo otomatis menjadi ikon tab browser (favicon).** Saat profil disimpan, salinan logo dibuat di Google Drive (folder *Rekap Absensi Jamaah*) dengan akses "siapa pun yang punya link bisa melihat", lalu dipakai `setFaviconUrl`. Kalau ingin ikon lain, isi kolom **Ikon tab browser** dengan URL https://…png.
  - Ikon baru terlihat setelah halaman dimuat ulang. Untuk Web App yang sudah di-deploy, buat versi deployment baru setelah `clasp push`.
- **Aplikasi petugas**:
  - Scan QR atau CODE128 terus-menerus (jeda 1,5 detik), dengan layar hijau/kuning/merah, bunyi, dan getar.
  - Scanner USB/BT dan input manual (bisa cari nama panggilan).
  - Daftar hadir/belum hadir dan tombol **Tutup Sesi & tandai Alpa**.
  - **Antrean offline** yang dikirim otomatis saat online.

## Keamanan
- Password dan PIN disimpan sebagai hash **SHA-256 + salt**. Token login berlaku 8 jam (PropertiesService).
- **Setiap fungsi server memeriksa token dan role.** Petugas hanya bisa mengakses program yang ditugaskan kepadanya. Akses yang ditolak dicatat di LOG.
- **Fungsi pemeliharaan** (setup, hapus dummy) hanya bisa dijalankan pemilik dari editor atau menu Sheets. Kalau dipanggil dari Web App, akan ditolak.
- Setelah 5 kali login gagal, akun diblokir 5 menit. Menonaktifkan petugas atau mereset PIN langsung memutus sesinya.
- Semua penulisan data memakai `LockService`.

## Tes lokal (pengembang)
```powershell
node dev/server.js --reset
```
Buka http://localhost:8787 dan http://localhost:8787/?page=admin. Data tersimpan di `dev/.data/` (diabaikan git). Tes akhir tetap harus di Apps Script asli.

## Server sendiri (VPS) — https://absenjamaah.web.id
Selain Apps Script, aplikasi juga berjalan sebagai server Node di VPS. `dev/server.js` berjalan dalam **mode produksi** (`NODE_ENV=production`, lihat `Dockerfile`), dan datanya disimpan di `data/db.json` di VPS.
- **Deploy / update:** jalankan `bash deploy.sh` dari folder ini. Kode di-upload, container dibangun ulang, dan Caddy (HTTPS otomatis) diatur. Data di VPS tidak tertimpa.
- **Domain:** `absenjamaah.web.id` dan `www`, dengan DNS `A @` dan `A www` → `31.58.103.170`. Alamat cadangan: `https://absensi.31-58-103-170.sslip.io`. Untuk menambah domain lain, jalankan `bash tambah-domain.sh nama.web.id`.
- **Keamanan mode produksi:**
  - Hanya fungsi publik di `src/*.gs` yang bisa dipanggil. Fungsi pemeliharaan pemilik, helper `_`, `include`, dan `doGet` tidak bisa dipanggil.
  - Rute `/__dev/*` mati.
  - Penyimpanan atomik.
  - Cadangan harian ada di `data/backup/` (14 hari terakhir).
- "Simpan ke Drive" tidak tersedia di VPS. Pakai unduh Excel / CSV / PDF.

## Batasan Apps Script yang perlu diketahui
- **PWA penuh tidak bisa** (iframe Google). Pasang lewat "Tambahkan ke layar utama" sebagai shortcut.
- **Kamera di iPhone** kadang diblokir di dalam iframe Apps Script. Kalau terjadi, pakai scanner Bluetooth atau Input Manual.
- **Unduhan dan cetak** dari dalam iframe bisa diblokir sebagian browser. Untuk unduhan, pakai tombol **Simpan ke Drive**.
