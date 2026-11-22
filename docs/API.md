# Kontrak API Persetujuan

Aplikasi berjalan di localhost dan menggunakan data fiktif. Kode persetujuan
merupakan fixture tetap untuk pengujian. Lab ini memodelkan aturan bisnis; aplikasi
tidak menyediakan verifikasi identitas atau autentikasi produksi.

Semua respons API menggunakan JSON. Bentuk respons kesalahan:
`{"error":{"code":"ERROR_CODE","message":"Pesan yang mudah dipahami."}}`.

| Permintaan | Input | Respons berhasil |
| --- | --- | --- |
| `POST /api/requests` | `{"title":"Sample document","fixture":"standard"}`. Judul wajib berisi 1–80 karakter setelah spasi di awal/akhir dihapus. Fixture harus `standard` atau `leading-zero`. | `201` dengan permintaan berstatus `pending` |
| `GET /api/requests/:id` | ID dari respons pembuatan | `200` dengan status terkini dan waktu persetujuan |
| `POST /api/requests/:id/approve` | `{"code":"123456"}`. Kode harus berupa string enam digit ASCII. | `200` dengan status `approved` dan waktu persetujuan UTC |

Fixture standard menggunakan `123456`; fixture leading-zero menggunakan `042731`.
Bandingkan kode sebagai teks. Nol di depan adalah digit yang valid dan menjadi
bagian dari kode.

Respons permintaan berisi `id` (integer), `title`, `fixture`, `status`
(`pending` atau `approved`), dan `approvedAt` (waktu ISO UTC atau `null`).

| Status | Kode kesalahan | Kondisi |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Body permintaan bukan JSON yang valid |
| 400 | `INVALID_REQUEST` | Judul atau fixture tidak valid |
| 400 | `INVALID_CODE_FORMAT` | Kode tidak ada, bertipe angka, atau tidak memenuhi aturan enam digit |
| 404 | `NOT_FOUND` | Permintaan atau rute tidak ditemukan |
| 409 | `ALREADY_APPROVED` | Kode dengan format valid dikirim untuk permintaan yang sudah disetujui |
| 422 | `INCORRECT_CODE` | Kode berformat valid tidak cocok dengan permintaan yang masih pending |

Persetujuan yang ditolak tidak mengubah status maupun waktu. Pengiriman ulang
tidak mengubah waktu persetujuan asli. Proses persetujuan memperbarui kedua field
dalam satu pernyataan SQLite.
