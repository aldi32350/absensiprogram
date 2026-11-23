# Panduan Singkat Absensi Jamaah

> **Login:** semua akun masuk di halaman yang sama dengan **username + password** (PIN lama = password). Peran akun yang menentukan halaman: petugas absensi → aplikasi scan, admin / pendataan / fasilitator → panel. Akun dibuat admin di menu **Kelola User**.
> Tombol **kembali** di HP tidak langsung keluar: muncul pertanyaan *Keluar dari aplikasi? Ya / Tidak*.

---

## 👤 Untuk ADMIN
Buka `…/exec?page=admin` di laptop, lalu login dengan username + password.

### Pertama kali
1. **Profil Yayasan**: unggah logo, isi nama yayasan, singkatan (mis. MMB), nama masjid/lembaga, dan Instagram. Teks kartu (mis. KARTU / JAMAAH) dan tagline juga diatur di sini. Klik **Simpan Profil**.
2. **Ganti Password**: menu kiri bawah. Gunakan minimal 8 karakter.
3. **Petugas**: ubah PIN petugas contoh, atau buat petugas baru dan centang program yang ditangani.

### Data jamaah
- **Tambah satu jamaah**: tombol **Tambah Jamaah**. No Jamaah (mis. MIM-0123) dibuat otomatis.
- **Tambah atau perbarui banyak jamaah**:
  1. Klik **Template**, lalu **Unduh Template Excel** (lembar kosong, kolom wajib bertanda \*).
  2. Isi file itu (lihat contoh di sheet PETUNJUK). No Jamaah tidak perlu diisi, dibuat otomatis.
  3. Kembali ke **Jamaah**, klik **Import**, dan pilih file tersebut.
- **Memperbaiki data massal**:
  1. Klik **Export** → **Excel** (berisi semua data jamaah).
  2. Edit file di Excel. **Jangan ubah No Jamaah.**
  3. **Import** kembali. Data lama diperbarui, tidak dobel.
- Jamaah yang berhenti cukup **dinonaktifkan** (ikon 👤✕), jangan dihapus, agar riwayatnya tetap ada.
- Cek bagian **peringatan** setelah import, misalnya jenis kelamin kosong atau KK tidak 16 digit.

### Fasilitator
- Buka menu **Fasilitator** untuk menambah fasilitator (mis. "Khansa & Silma"), mengisi no HP, dan menonaktifkan fasilitator.
- Klik **jumlah binaan** untuk melihat jamaah yang didampingi dan menambahkan jamaah lain ke fasilitator tersebut.
- Di form jamaah, fasilitator cukup **dipilih** dari daftar.
- **Kelas**: setiap fasilitator (boleh 2 orang, mis. "Dini Lestari & Muhammad Haidar") memegang satu kelas dengan **tingkat** (Iqro' 1 … Qur'an Besar) dan **kategori** (Ibu & Bapak / Remaja & Anak). Tingkat kelas menjadi indikator awal jamaah binaannya sampai fasilitator mengirim laporan pertama.
- **Akun login fasilitator**: klik ✏️ Edit, lalu isi **Username** dan **PIN** di bagian *Akun login fasilitator*. Tombol 🔑 dipakai untuk reset PIN.
- **Admin yang menentukan jamaah binaan**: klik 👥, lalu ketik nama jamaah dan tekan **Tambahkan**. Tombol ➖ melepas jamaah dari fasilitator itu.
- Menu **Laporan Fasilitator** berisi semua laporan (tanggal, jamaah, indikator, Tetap/Lanjut, keterangan), dengan filter fasilitator, tanggal, indikator, dan Tetap/Lanjut. Panel **Posisi jamaah saat ini** menunjukkan berapa jamaah di tiap tingkat Iqro' 1 … Qur'an Besar. Klik baris laporan untuk melihat riwayat jamaah itu.

### Detail & foto jamaah
- Klik **baris jamaah** untuk melihat detail lengkap beserta fotonya.
- Untuk menambah atau mengganti foto: buka **Edit data & foto**, lalu pilih **Ambil foto** (kamera) atau **Pilih file**. Foto otomatis dikecilkan ke format WebP.

### Kartu jamaah
1. Buka menu **Kartu Jamaah**, centang jamaah (atau **Pilih semua tampil**), lalu klik **Cetak**.
2. Di dialog cetak, atur: kertas **A4**, skala **100%**, dan centang **Background graphics**.
3. Potong mengikuti garis putus-putus (9 kartu per halaman). Sebaiknya dilaminasi doff.
4. Untuk mencetak ulang satu kartu: di menu Jamaah, klik ikon 🪪 di baris jamaah tersebut.

### Program & sesi
- Klik **Kelola Sesi** di program, lalu **Buka Sesi Hari Ini** (petugas juga bisa membukanya dari HP).
- Atur **peserta** program lewat edit program, dengan mencentang fasilitator (jamaah binaannya menjadi peserta). Kalau tidak ada yang dicentang, semua jamaah aktif menjadi peserta.
- Sesi lama yang **lupa ditutup** muncul di Dashboard (panel "Perlu ditutup").

### Dashboard & laporan
- **Dashboard**: pilih program dan tanggal di bagian atas. Klik kartu **Aktif / Sedang / Tidak Aktif** untuk melihat siapa saja.
  - **Aktif** = hadir ≥ 3 pertemuan
  - **Sedang** = 1–2 pertemuan
  - **Tidak Aktif** = 0 pertemuan
- **Rekap & Laporan**:
  - Per Sesi: daftar hadir dan tidak hadir.
  - Per Program: persentase tiap jamaah.
  - Per Jamaah: riwayat satu jamaah.
  - Per Petugas: jumlah scan tiap petugas.
- **Koreksi absensi** di Rekap → Per Sesi:
  - ✏️ ubah status, misalnya Alpa → Izin, dengan alasan
  - 🗑 hapus data
  - **Tandai** untuk jamaah yang terlewat
  - Semua perubahan tercatat di sheet LOG.
- **Export**: tombol CSV, Excel, atau PDF di kanan atas. Kalau unduhan diblokir browser, pakai **Simpan ke Drive**.

---

## 🗂️ Untuk PETUGAS PENDATAAN
Tugasnya melengkapi data master jamaah (foto, tanggal lahir, alamat, KK, dll.) dan menambah jamaah baru.
- **Admin membuat akunnya** di menu **Petugas → Tambah Petugas**, pilih **Jenis tugas: Pendataan**, isi nama, username, dan PIN.
- **Login**: buka `…/exec?page=admin`, pilih tab **Pendataan**, lalu masukkan username + PIN. (Dari halaman petugas, ketuk tab **Pendataan**.)
- Bisa dibuka di **HP**: data master tampil sebagai kartu (foto, nama, No Jamaah, desa, dan data yang masih kurang), lengkap dengan kolom **cari** dan tombol **Edit** di setiap kartu. Ketuk kartu untuk melihat profil lengkap.
- Akun petugas **absensi** (mis. untuk scan) tidak bisa login di tab Pendataan. Minta admin membuat akun berjenis Pendataan, atau mengubah jenis tugasnya.
- Yang terlihat hanya menu **Jamaah**. Filter **Data belum lengkap** langsung aktif, dengan kolom **Kelengkapan** yang menunjukkan data mana yang kurang.
- Klik ✏️ untuk melengkapi data. Kolom yang masih kosong diberi tanda kuning. Unggah foto langsung dari kamera/galeri (otomatis dikecilkan ke WebP).
- **Tambah Jamaah** di kanan atas untuk mendaftarkan jamaah baru.
- Petugas pendataan **tidak bisa** mengubah status Aktif/Nonaktif, import, export, cetak kartu, membuka rekap, atau absen scan.

---

## 📖 Untuk FASILITATOR
**Prinsip: anti-ribet, serba tap.** Patokannya kualitas bacaan (lulus pos indikator), bukan halaman Iqro.
- **Absen 1 tap** di kartu jamaah: Hadir / Izin / Sakit / Alpa. Tap **Hadir** → lembar **Nilai Pos** langsung terbuka.
- **Peta pos** tiap jamaah: hijau ✓ = lulus, kuning ! = perlu penguatan, garis putus = pos yang dinilai hari ini.
- **Nilai Pos**: tap **Lulus Pos Ini** (otomatis lanjut ke pos berikutnya) atau **Tetap & Kuatkan** → pilih tag titik lemah / ketik 1 baris catatan.
- Di kartu tampil **Terakhir diajar oleh …**, **catatan estafet** dari fasilitator sebelumnya, dan **rekomendasi halaman** hari ini.
- Semua pos hijau (Iqro 6 + 5 ceklis EBTA) → **Siap Naik Level — Ajukan**. Bila pos terakhir lulus tapi ada pos kuning di tengah, aplikasi menahan: "masih harus tetap dulu untuk menguatkan Pos X".
- Qur'an Sedang/Besar: pos tilawah memakai penghitung **Juz** (+/−); Qur'an Besar memilih **jalur** A Tilawah / B Tahfizh / C Ta'lim.
- **Gantikan regu lain** (tombol di kartu hijau): mengajar kelas yang fasilitatornya berhalangan — semua catatan ditandai *pengganti*. Tekan **Selesai** untuk kembali ke kelas sendiri.

> Akun fasilitator dibuat **per orang** oleh admin di **Kelola User** (nama lengkap, username, password). Admin memasangkan 2 fasilitator dalam satu **kelas** di menu **Fasilitator**.

1. Login dengan username + password dari admin.
2. **Pilih sesi hari ini** (sesi dibuka oleh petugas absensi), lalu tekan **Mulai di sesi ini**. Bila belum ada sesi, tekan *Muat ulang* setelah petugas membuka sesi (atau *Lanjut tanpa sesi* untuk laporan saja).
3. Ketuk nama jamaah untuk melihat **detail lengkap** (foto, data diri, alamat, KK, total hadir, riwayat laporan) — data diisi admin / tim pendataan (hanya-baca).
4. Di setiap jamaah binaan terlihat status kehadirannya di sesi itu (*Hadir · scan kartu*, *Hadir · oleh fasilitator*, atau *Belum absen*).
   - **Tandai Hadir** → jamaah tercatat HADIR (dobel dengan scan petugas supaya tidak ada yang terlewat; tidak pernah tercatat dua kali).
   - **Laporkan** → isi indikator (Iqro' 1 … Qur'an Besar), **Tetap / Lanjut**, keterangan → **Kirim** → **Ya**. Jamaah yang dilaporkan **otomatis tercatat HADIR** di sesi tersebut.
4. Filter: *Belum absen / Sudah hadir*, Tetap / Lanjut / belum dilaporkan, indikator, dan kolom cari. **Ganti sesi** di kartu atas.

---

## 📱 Untuk PETUGAS
Buka `…/exec` di HP, lalu login dengan username + PIN.

**Tips:** pasang aplikasi ke layar utama HP.
- Android (Chrome): menu ⋮ → **Tambahkan ke layar utama**
- iPhone (Safari): tombol Bagikan → **Tambah ke Layar Utama**

### Mulai absensi
1. Setelah login, pilih **program**. Kalau hanya ada satu sesi yang dibuka hari ini, aplikasi langsung masuk ke layar scan.
2. Kalau belum ada sesi, tekan **Buka Sesi Hari Ini**.
3. **Izinkan kamera** saat diminta.

### Scan
- Arahkan **QR di kartu** ke kotak di layar. Tidak perlu menekan apa pun, scan berjalan terus.
- Setelah kartu terbaca, muncul layar **Cek data** berisi foto dan data lengkap jamaah. Cocokkan dengan orang di depan Anda:
  - **SALAH** (merah) → tidak dicatat apa pun. Minta kartu yang benar, lalu scan ulang.
  - **BENAR** (hijau) → langsung tercatat **HADIR**.
- Hasil scan:
  - 🟩 **HIJAU + "HADIR ✓"** → berhasil.
  - 🟨 **"Sudah absen jam …"** → orang ini sudah tercatat. Profil lengkapnya langsung terbuka dengan judul kuning. Tekan **OK · Scan berikutnya** untuk lanjut.
  - 🟥 **MERAH + "tidak terdaftar"** → kartu salah atau jamaah nonaktif. Arahkan ke admin.
- **Senter**: tombol 🔦 di pojok kamera (kalau HP mendukung). **Ganti kamera**: tombol 🔄.
- **Scanner Bluetooth/USB**: langsung scan saja selama layar Scan terbuka.
- Angka besar **Hadir x / y** menunjukkan jumlah yang sudah hadir dari total peserta.

### Jamaah lupa membawa kartu
Tekan **Input Manual**, ketik 2 huruf nama (nama panggilan juga bisa), ketuk namanya, lalu pilih **Hadir / Izin / Sakit / Alpa**.

### Mendaftarkan jamaah baru
Kalau ada jamaah yang **belum terdaftar**, tekan **Daftar Baru** di layar Scan. Bisa juga lewat Input Manual: kalau nama tidak ditemukan, tekan **Daftarkan sebagai jamaah baru**.
1. Isi bagian **Wajib diisi** dulu: **Nama Lengkap** dan **Jenis Kelamin**. Bagian lain (Foto, Data Diri, Kontak & Alamat, Lainnya) opsional dan bisa dibuka bila perlu. Yang wajib (*) hanya **Nama Lengkap** dan **Jenis Kelamin**. Desa, Kecamatan, dan Kota sudah terisi otomatis.
2. Biarkan centang **Langsung catat HADIR** kalau jamaahnya ada di tempat.
3. Tekan **Kirim**, lalu pilih **Ya**. No Jamaah baru (mis. MIM-0123) langsung muncul. Kartu QR-nya dicetak oleh admin.
- Pendaftaran hanya bisa saat **bertugas** (sesi hari ini sedang dibuka) dan butuh internet.
- Kalau orangnya ternyata sudah terdaftar (nama + tanggal lahir + HP sama), formulir menolak dan menampilkan No Jamaah-nya.

### Sinyal hilang?
Tetap scan seperti biasa. Lencana di kanan atas akan berubah menjadi **Offline · 3** (atau angka lain). Data tersimpan di HP dan **terkirim otomatis** saat internet kembali. **Jangan logout dan jangan ganti HP** sebelum lencana kembali menjadi **Tersimpan**.

### Bagi hadiah saat program selesai (absen SELESAI)
1. Di layar Scan, tekan **SELESAI** di pojok atas kamera (berubah kuning). Setelah scan, cek foto & data, lalu tekan **BENAR · Hadiah** (atau **SALAH** untuk membatalkan).
2. Scan kartu jamaah yang pulang:
   - 🟩 **SELESAI ✓ · Berikan hadiah 🎁** → berikan hadiahnya.
   - 🟥 **Belum absen HADIR** → tidak mendapat hadiah, karena tidak tercatat hadir di awal.
   - 🟨 **Sudah selesai** → hadiah sudah diberikan sebelumnya.
3. Jamaah tanpa kartu: buka **Input Manual**, cari namanya, lalu tekan **SELESAI & Berikan Hadiah**.
4. Tab **Daftar → Selesai 🎁** berisi daftar penerima hadiah.

### Selesai kegiatan
1. Buka tab **Daftar** untuk melihat **Sudah Hadir** dan **Belum Hadir**. Tombol **Tandai** bisa dipakai untuk mencatat izin/sakit.
2. Tekan **Tutup Sesi & Tandai Sisanya Alpa**, lalu konfirmasi. Pastikan lencana sudah **Tersimpan** sebelumnya.
3. Tekan **Keluar**.

### Masalah umum
| Masalah | Solusi |
|---|---|
| Kamera tidak muncul | Izinkan kamera di pengaturan browser, atau tekan **Coba lagi**. Di iPhone, pakai Input Manual atau scanner Bluetooth. |
| "Anda tidak ditugaskan di program ini" | Minta admin mencentang program tersebut untuk akun Anda. |
| Lupa PIN | Minta admin melakukan **Reset PIN**. |
| QR susah terbaca | Nyalakan senter, jauhkan HP sedikit (±15–20 cm), dan pastikan kartu tidak mengilap. |
