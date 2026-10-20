# Binarisasi Dokumen untuk OCR (Versi Flask)

Aplikasi web yang membandingkan Global Binary, Otsu, dan Adaptive Gaussian Thresholding
pada citra dokumen dengan pencahayaan tidak merata. Pemrosesan citra memakai OpenCV.

**Pembuat:** Ridho Ramdhan, Teknik Informatika, Universitas Catur Insan Cendekia

## Cara Menjalankan

Buka PowerShell di folder ini (folder yang berisi `app.py`), lalu:

```
pip install -r requirements.txt
python -m flask --app app run --port 5055
```

Buka **http://127.0.0.1:5055** di peramban. Tekan Ctrl+C untuk menghentikan.

Alternatif: `python app.py` (membuka di port 5000).

## Citra Contoh

Folder `contoh/` berisi tiga foto dokumen dan dibaca otomatis. Untuk menambah atau
mengganti gambar, taruh berkas PNG/JPG/JPEG/BMP di folder itu lalu muat ulang halaman.
Sumber dan lisensi ketiga foto (Unsplash License) tercatat di `contoh/README.md`.
Anda juga dapat mengunggah citra sendiri lewat halaman (maksimal 10 MB).

## Struktur Berkas

```
.
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
├── static/
│   ├── style.css
│   └── script.js
└── contoh/
    ├── dokumen_merata.jpg
    ├── dokumen_berbayangan.jpg
    ├── dokumen_kuning_bernoda.jpg
    └── README.md
```

## Endpoint API

| Endpoint | Metode | Fungsi |
|----------|--------|--------|
| `/` | GET | Halaman utama |
| `/api/daftar-citra` | GET | Daftar citra di folder contoh |
| `/api/citra-contoh/<nama>` | GET | Ambil berkas citra |
| `/api/proses` | POST | Proses binarisasi |
