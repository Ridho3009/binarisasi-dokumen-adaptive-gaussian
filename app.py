"""
versi-flask/app.py
Backend Flask untuk aplikasi Binarisasi Dokumen dengan Adaptive Gaussian Thresholding.
Dibuat oleh: Ridho Ramdhan - Teknik Informatika, Universitas Catur Insan Cendekia

Endpoint utama:
  GET  /            - Halaman utama
  GET  /api/daftar-citra  - Daftar citra di folder contoh
  POST /api/proses   - Proses binarisasi dan kembalikan hasil JSON
"""

import os
import io
import time
import base64
import glob

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from flask import Flask, render_template, jsonify, request, send_file

# ---------------------------------------------------------------
# Konfigurasi aplikasi
# ---------------------------------------------------------------
FOLDER_CONTOH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'contoh')
EKSTENSI_VALID = {'.png', '.jpg', '.jpeg', '.bmp'}
UKURAN_MAKS_MB = 10
PANJANG_SISI_MAKS = 1200

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = UKURAN_MAKS_MB * 1024 * 1024


# ---------------------------------------------------------------
# Fungsi bantu
# ---------------------------------------------------------------

def validasi_parameter(n_blok: int, c_val: int, t_global: int) -> tuple[bool, str]:
    """
    Validasi sisi server untuk parameter binarisasi.
    Mengembalikan (valid, pesan_galat).
    """
    if n_blok < 3:
        return False, "Ukuran blok N minimal 3."
    if n_blok % 2 == 0:
        return False, "Ukuran blok N harus ganjil."
    if not (0 <= c_val <= 40):
        return False, "Konstanta C harus antara 0 dan 40."
    if not (0 <= t_global <= 255):
        return False, "Ambang global T harus antara 0 dan 255."
    return True, ""


def citra_ke_base64(citra_abu: np.ndarray) -> str:
    """
    Mengkodekan larik numpy keabuan menjadi string base64 PNG.
    Digunakan untuk dikirim ke frontend melalui JSON.
    """
    sukses, buffer = cv2.imencode('.png', citra_abu)
    if not sukses:
        raise ValueError("Gagal menyandikan citra ke PNG.")
    return base64.b64encode(buffer).decode('utf-8')


def hitung_persen_hitam(citra_biner: np.ndarray) -> float:
    """
    Menghitung persentase piksel hitam (nilai 0) dalam citra biner.
    """
    total_piksel = citra_biner.size
    if total_piksel == 0:
        return 0.0
    piksel_hitam = int(np.sum(citra_biner == 0))
    return round(100.0 * piksel_hitam / total_piksel, 2)


def proses_binarisasi(data_citra: bytes,
                       n_blok: int, c_val: int, t_global: int,
                       pilihan_blur: str) -> dict:
    """
    Fungsi inti pemrosesan binarisasi.
    Langkah-langkah:
      1. Dekode bytes -> numpy
      2. Konversi ke keabuan
      3. Terapkan blur (opsional)
      4. Global Binary dengan T yang ditentukan pengguna
      5. Otsu Thresholding (T dihitung otomatis)
      6. Adaptive Gaussian Thresholding dengan N dan C

    Mengembalikan dict berisi semua citra ter-encode base64 dan metadata.
    """
    # Dekode bytes menjadi larik numpy
    larik_bytes = np.frombuffer(data_citra, dtype=np.uint8)
    citra_asli = cv2.imdecode(larik_bytes, cv2.IMREAD_COLOR)
    if citra_asli is None:
        raise ValueError("Citra tidak dapat dibaca. Pastikan berkas tidak rusak.")

    # Perkecil bila sisi terpanjang melebihi batas
    h, w = citra_asli.shape[:2]
    sisi_maks = max(h, w)
    if sisi_maks > PANJANG_SISI_MAKS:
        skala = PANJANG_SISI_MAKS / sisi_maks
        lebar_baru = int(w * skala)
        tinggi_baru = int(h * skala)
        citra_asli = cv2.resize(citra_asli, (lebar_baru, tinggi_baru),
                                 interpolation=cv2.INTER_AREA)

    # Konversi ke keabuan menggunakan metode standar
    citra_abu = cv2.cvtColor(citra_asli, cv2.COLOR_BGR2GRAY)

    # Terapkan blur sesuai pilihan pengguna
    if pilihan_blur == 'gaussian3':
        citra_abu_blur = cv2.GaussianBlur(citra_abu, (3, 3), 0)
    elif pilihan_blur == 'gaussian5':
        citra_abu_blur = cv2.GaussianBlur(citra_abu, (5, 5), 0)
    elif pilihan_blur == 'gaussian7':
        citra_abu_blur = cv2.GaussianBlur(citra_abu, (7, 7), 0)
    else:
        # Tanpa blur
        citra_abu_blur = citra_abu.copy()

    # ------ Metode 1: Global Binary ------
    # Menggunakan nilai T tunggal untuk seluruh citra.
    # Gagal pada pencahayaan tidak merata karena T optimal berbeda di tiap area.
    _, citra_global = cv2.threshold(
        citra_abu_blur, t_global, 255, cv2.THRESH_BINARY
    )

    # ------ Metode 2: Otsu Thresholding ------
    # T dihitung otomatis berdasarkan histogram global.
    # Masih gagal pada pencahayaan tidak merata karena tetap menggunakan T global.
    t_otsu, citra_otsu = cv2.threshold(
        citra_abu_blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    # ------ Metode 3: Adaptive Gaussian Thresholding ------
    # T(x,y) dihitung secara lokal: rata-rata berbobot Gaussian blok NxN dikurangi C.
    # Berhasil memisahkan teks bahkan pada area yang sangat gelap atau terang.
    waktu_mulai = time.perf_counter()
    citra_adaptif = cv2.adaptiveThreshold(
        citra_abu_blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        n_blok,
        c_val
    )
    waktu_proses_ms = round((time.perf_counter() - waktu_mulai) * 1000, 2)

    # Kembalikan hanya kunci yang dipakai tampilan
    return {
        'keabuan':           citra_ke_base64(citra_abu_blur),
        'global_binary':     citra_ke_base64(citra_global),
        'otsu':              citra_ke_base64(citra_otsu),
        't_otsu':            int(round(t_otsu)),
        'adaptive_gaussian': citra_ke_base64(citra_adaptif),
        'persen_hitam': {
            'keabuan':           None,
            'global_binary':     hitung_persen_hitam(citra_global),
            'otsu':              hitung_persen_hitam(citra_otsu),
            'adaptive_gaussian': hitung_persen_hitam(citra_adaptif),
        },
        'waktu_proses_ms': waktu_proses_ms,
    }


# ---------------------------------------------------------------
# Rute halaman
# ---------------------------------------------------------------

@app.route('/')
def halaman_utama():
    """Menyajikan halaman utama aplikasi."""
    return render_template('index.html')


@app.route('/api/daftar-citra')
def daftar_citra():
    """
    Mengembalikan daftar semua citra PNG/JPG/JPEG/BMP di folder contoh.
    Dibaca ulang setiap kali dipanggil sehingga gambar baru langsung muncul
    tanpa mengubah kode.
    """
    folder = os.path.abspath(FOLDER_CONTOH)
    daftar = []
    if os.path.isdir(folder):
        for ekstensi in ['*.png', '*.jpg', '*.jpeg', '*.bmp',
                          '*.PNG', '*.JPG', '*.JPEG', '*.BMP']:
            for path_berkas in glob.glob(os.path.join(folder, ekstensi)):
                nama_berkas = os.path.basename(path_berkas)
                try:
                    img = Image.open(path_berkas)
                    lebar, tinggi = img.size
                    img.close()
                    daftar.append({
                        'nama': nama_berkas,
                        'lebar': lebar,
                        'tinggi': tinggi,
                    })
                except Exception:
                    # Lewati berkas yang tidak dapat dibaca
                    pass
    # Urutkan secara alfabetik dan hapus duplikat (karena glob case-insensitive)
    daftar_unik = {item['nama']: item for item in daftar}
    return jsonify(sorted(daftar_unik.values(), key=lambda x: x['nama'].lower()))


@app.route('/api/citra-contoh/<nama_berkas>')
def ambil_citra_contoh(nama_berkas: str):
    """
    Mengembalikan berkas citra dari folder contoh untuk ditampilkan sebagai miniatur.
    Hanya mengizinkan berkas dengan ekstensi valid.
    """
    # Keamanan: pastikan nama berkas tidak mengandung path traversal
    nama_bersih = os.path.basename(nama_berkas)
    ext = os.path.splitext(nama_bersih)[1].lower()
    if ext not in EKSTENSI_VALID:
        return jsonify({'galat': 'Ekstensi berkas tidak diizinkan.'}), 400

    path_berkas = os.path.abspath(os.path.join(FOLDER_CONTOH, nama_bersih))
    folder_abs = os.path.abspath(FOLDER_CONTOH)
    # Cegah akses di luar folder contoh
    if not path_berkas.startswith(folder_abs):
        return jsonify({'galat': 'Akses ditolak.'}), 403

    if not os.path.isfile(path_berkas):
        return jsonify({'galat': 'Berkas tidak ditemukan.'}), 404

    return send_file(path_berkas)


@app.route('/api/proses', methods=['POST'])
def proses():
    """
    Endpoint pemrosesan binarisasi.
    Menerima multipart/form-data dengan:
      - sumber: 'contoh' atau 'unggahan'
      - nama_berkas: nama berkas (bila sumber='contoh')
      - berkas: data berkas (bila sumber='unggahan')
      - n_blok, c_val, t_global, pilihan_blur: parameter algoritma
    Mengembalikan JSON berisi citra ter-encode dan metadata.
    Tidak menyimpan unggahan pengguna secara permanen.
    """
    try:
        # Baca dan validasi parameter numerik
        n_blok    = int(request.form.get('n_blok', 31))
        c_val     = int(request.form.get('c_val', 10))
        t_global  = int(request.form.get('t_global', 127))
        pilihan_blur = request.form.get('pilihan_blur', 'gaussian3')

        # Validasi sisi server
        valid, pesan = validasi_parameter(n_blok, c_val, t_global)
        if not valid:
            return jsonify({'galat': pesan}), 400

        sumber = request.form.get('sumber', 'contoh')

        if sumber == 'contoh':
            # Baca dari folder contoh
            nama_berkas = os.path.basename(
                request.form.get('nama_berkas', '')
            )
            if not nama_berkas:
                return jsonify({'galat': 'Nama berkas tidak boleh kosong.'}), 400

            ext = os.path.splitext(nama_berkas)[1].lower()
            if ext not in EKSTENSI_VALID:
                return jsonify({'galat': 'Ekstensi berkas tidak diizinkan.'}), 400

            path_berkas = os.path.abspath(
                os.path.join(FOLDER_CONTOH, nama_berkas)
            )
            if not path_berkas.startswith(os.path.abspath(FOLDER_CONTOH)):
                return jsonify({'galat': 'Akses ditolak.'}), 403
            if not os.path.isfile(path_berkas):
                return jsonify({'galat': 'Berkas contoh tidak ditemukan.'}), 404

            with open(path_berkas, 'rb') as f:
                data_citra = f.read()

        elif sumber == 'unggahan':
            # Baca dari unggahan pengguna (tidak disimpan permanen)
            if 'berkas' not in request.files:
                return jsonify({'galat': 'Tidak ada berkas yang diunggah.'}), 400

            berkas = request.files['berkas']
            if berkas.filename == '':
                return jsonify({'galat': 'Nama berkas kosong.'}), 400

            ext = os.path.splitext(berkas.filename)[1].lower()
            if ext not in EKSTENSI_VALID:
                return jsonify({
                    'galat': f'Format berkas tidak didukung ({ext}). '
                             f'Gunakan PNG, JPG, JPEG, atau BMP.'
                }), 400

            data_citra = berkas.read()
            if len(data_citra) > UKURAN_MAKS_MB * 1024 * 1024:
                return jsonify({
                    'galat': f'Ukuran berkas melebihi batas {UKURAN_MAKS_MB} MB.'
                }), 413

            # Verifikasi berkas benar-benar gambar yang valid
            try:
                img_uji = Image.open(io.BytesIO(data_citra))
                img_uji.verify()
            except (UnidentifiedImageError, Exception):
                return jsonify({'galat': 'Berkas gambar rusak atau tidak valid.'}), 400

        else:
            return jsonify({'galat': 'Sumber tidak dikenali.'}), 400

        # Proses binarisasi
        hasil = proses_binarisasi(data_citra, n_blok, c_val, t_global, pilihan_blur)
        return jsonify(hasil)

    except ValueError as e:
        return jsonify({'galat': str(e)}), 400
    except Exception as e:
        app.logger.error(f"Galat pemrosesan: {e}", exc_info=True)
        return jsonify({'galat': 'Terjadi galat pada server. Coba lagi.'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
