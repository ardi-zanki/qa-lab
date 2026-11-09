# Rencana pengujian persetujuan dokumen

Risiko utama adalah permintaan disetujui dengan kode yang salah atau permintaan
valid tertahan. Untuk memeriksanya, validasi respons dan status yang tersimpan
setelah setiap hasil penting. Buat record baru untuk setiap skenario, kecuali
kasus retry dan replay yang memang memakai record yang sama.

| ID | Jenis | Langkah atau input | Hasil yang diharapkan |
| --- | --- | --- | --- |
| QA-01 | Normal | Buat fixture standard dan kirim kode `"123456"` | Create `201`, approve `200`, status `approved`, timestamp UTC terisi. Status tetap sama setelah GET atau reload. |
| QA-02 | Negatif | Buat fixture standard dan kirim `"999999"` | `422 INCORRECT_CODE`. GET tetap `pending` dengan `approvedAt: null`. UI menampilkan pesan kesalahan. |
| QA-03 | Pemulihan | Setelah QA-02, kirim `"123456"` pada record yang sama | `200`, status berubah menjadi `approved`, pesan kesalahan hilang dari UI. |
| QA-04 | Negatif | Kirim kode numerik `42731` atau teks lima digit `"42731"` ke fixture leading-zero | `400 INVALID_CODE_FORMAT`. Status dan timestamp tetap sama. |
| QA-05 | Edge case | Kirim teks `"042731"` ke fixture leading-zero | `200`, status `approved`. Uji yang sama menemukan `422` di mode legacy. |
| QA-06 | Replay | Setelah QA-01, ulangi pengiriman kode yang sama | `409 ALREADY_APPROVED`. Timestamp persetujuan asli tetap sama. |
| QA-07 | Dua tab | Buka permintaan pending di dua tab. Setujui di tab pertama, lalu kirim kode valid dari tab kedua. | API menolak persetujuan ulang dengan `409 ALREADY_APPROVED`. Tab kedua mengambil ulang status, menampilkan `Approved` dan timestamp asli, lalu menyembunyikan formulir persetujuan. |
| QA-08 | Layout | Pada viewport 390 px, buat permintaan dengan judul 80 karakter tanpa spasi. | Judul membungkus dan halaman dapat dibaca tanpa scroll horizontal. |

QA-01 dan QA-03 membuktikan alur utama dan pemulihan di browser. QA-02 dan
QA-04 membedakan kode yang salah dari format yang salah. QA-05 membuktikan
bahwa nol adalah bagian dari identitas kode. QA-06 memastikan pengiriman ulang
tidak menimpa data persetujuan. QA-07 memeriksa pemulihan UI setelah konflik.
QA-08 melindungi layout ketika judul memenuhi panjang maksimum.
