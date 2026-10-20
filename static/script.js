/**
 * static/script.js
 * Logika antarmuka pengguna untuk aplikasi Binarisasi Dokumen.
 * Hanya membaca kunci yang benar-benar dikirim oleh endpoint Flask.
 * Dibuat oleh: Ridho Ramdhan
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Referensi elemen DOM                                                  */
/* ------------------------------------------------------------------ */
const daftarCitraEl      = document.getElementById('daftar-citra');
const zonaUnggahEl       = document.getElementById('zona-unggah');
const inputBerkasEl      = document.getElementById('input-berkas');
const galatUnggahEl      = document.getElementById('galat-unggah');
const sliderN            = document.getElementById('slider-n');
const nilaiNEl           = document.getElementById('nilai-n');
const sliderC            = document.getElementById('slider-c');
const nilaiCEl           = document.getElementById('nilai-c');
const sliderT            = document.getElementById('slider-t');
const nilaiTEl           = document.getElementById('nilai-t');
const tombolAturUlang    = document.getElementById('tombol-atur-ulang');
const kisiHasilEl        = document.getElementById('kisi-hasil');
const modalLatar         = document.getElementById('modal-latar');
const modalGambarEl      = document.getElementById('modal-gambar');
const modalJudul         = document.getElementById('modal-judul');
const tombolTutupModal   = document.getElementById('tombol-tutup-modal');
const notifGalatEl       = document.getElementById('notif-galat');

/* ------------------------------------------------------------------ */
/* Status aplikasi                                                       */
/* ------------------------------------------------------------------ */
let citraAktif = null;        // {sumber: 'contoh'|'unggahan', data}
let dataCitraUnggahan = null; // ArrayBuffer untuk unggahan
let namaUnggahan = '';
let timerTunda = null;        // ID setTimeout debounce
let sedangMemproses = false;

/* Parameter default */
const PARAM_DEFAULT = { n: 31, c: 10, t: 127, blur: 'gaussian3' };

/* ------------------------------------------------------------------ */
/* Pemuat daftar citra dari folder contoh                               */
/* ------------------------------------------------------------------ */
async function muatDaftarCitra() {
  daftarCitraEl.innerHTML = '<li class="pesan-kosong">Memuat daftar citra...</li>';
  try {
    const res = await fetch('/api/daftar-citra');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const daftar = await res.json();
    tampilkanDaftarCitra(daftar);
  } catch (e) {
    daftarCitraEl.innerHTML =
      '<li class="pesan-kosong">Gagal memuat daftar citra.</li>';
    console.error('Gagal memuat daftar citra:', e);
  }
}

function tampilkanDaftarCitra(daftar) {
  if (!daftar || daftar.length === 0) {
    daftarCitraEl.innerHTML =
      '<li class="pesan-kosong">Tidak ada citra di folder "contoh".<br>' +
      'Jalankan <code>buat_citra_contoh.py</code> terlebih dahulu.</li>';
    return;
  }

  daftarCitraEl.innerHTML = '';
  daftar.forEach(item => {
    const li  = document.createElement('li');
    li.className = 'item-citra';
    li.dataset.nama = item.nama;

    // Nama tampil tanpa ekstensi, dengan kapitalisasi
    const namaTampil = item.nama
      .replace(/\.[^.]+$/, '')       // hapus ekstensi
      .replace(/_/g, ' ')            // ganti garis bawah
      .replace(/\b\w/g, c => c.toUpperCase()); // kapitalisasi tiap kata

    li.innerHTML = `
      <img class="mini-gambar"
           src="/api/citra-contoh/${encodeURIComponent(item.nama)}"
           alt="${namaTampil}"
           onerror="this.style.display='none'">
      <span class="info-citra">
        <span class="nama-citra" title="${item.nama}">${namaTampil}</span>
        <span class="ukuran-citra">${item.lebar} × ${item.tinggi} piksel</span>
      </span>`;

    li.addEventListener('click', () => pilihCitraContoh(item.nama, li));
    daftarCitraEl.appendChild(li);
  });

  // Pilih citra pertama secara otomatis
  const pertama = daftarCitraEl.querySelector('.item-citra');
  if (pertama) pertama.click();
}

function pilihCitraContoh(namaBerkas, elemenLi) {
  // Tandai item aktif
  document.querySelectorAll('.item-citra').forEach(el => el.classList.remove('aktif'));
  elemenLi.classList.add('aktif');

  citraAktif = { sumber: 'contoh', nama: namaBerkas };
  dataCitraUnggahan = null;
  jadwalkanPemrosesan();
}

/* ------------------------------------------------------------------ */
/* Pengunggahan citra                                                    */
/* ------------------------------------------------------------------ */
zonaUnggahEl.addEventListener('dragover', e => {
  e.preventDefault();
  zonaUnggahEl.classList.add('dragover');
});
zonaUnggahEl.addEventListener('dragleave', () => {
  zonaUnggahEl.classList.remove('dragover');
});
zonaUnggahEl.addEventListener('drop', e => {
  e.preventDefault();
  zonaUnggahEl.classList.remove('dragover');
  const berkas = e.dataTransfer.files[0];
  if (berkas) prosesUnggahan(berkas);
});

inputBerkasEl.addEventListener('change', () => {
  const berkas = inputBerkasEl.files[0];
  if (berkas) prosesUnggahan(berkas);
  inputBerkasEl.value = ''; // izinkan memilih berkas yang sama lagi
});

function prosesUnggahan(berkas) {
  galatUnggahEl.style.display = 'none';

  // Validasi ukuran
  const MAKS_MB = 10;
  if (berkas.size > MAKS_MB * 1024 * 1024) {
    tampilkanGalatUnggah(`Ukuran berkas melebihi ${MAKS_MB} MB.`);
    return;
  }

  // Validasi ekstensi
  const ekstensiBoleh = ['.png', '.jpg', '.jpeg', '.bmp'];
  const ekstensi = berkas.name.substring(berkas.name.lastIndexOf('.')).toLowerCase();
  if (!ekstensiBoleh.includes(ekstensi)) {
    tampilkanGalatUnggah(
      `Format tidak didukung (${ekstensi}). Gunakan PNG, JPG, JPEG, atau BMP.`
    );
    return;
  }

  const reader = new FileReader();
  reader.onload = ev => {
    dataCitraUnggahan = ev.target.result; // ArrayBuffer
    namaUnggahan = berkas.name;

    // Bersihkan pilihan aktif pada daftar
    document.querySelectorAll('.item-citra').forEach(el => el.classList.remove('aktif'));
    citraAktif = { sumber: 'unggahan' };

    // Tampilkan pratinjau di daftar sebagai "Citra Anda"
    tampilkanItemUnggahan(berkas.name, ev.target.result);
    jadwalkanPemrosesan();
  };
  reader.onerror = () => {
    tampilkanGalatUnggah('Gagal membaca berkas. Coba lagi.');
  };
  reader.readAsArrayBuffer(berkas);
}

function tampilkanItemUnggahan(namaAsli, arrayBuffer) {
  // Hapus item unggahan lama jika ada
  const lama = daftarCitraEl.querySelector('[data-nama="__unggahan__"]');
  if (lama) lama.remove();

  const namaTampil = namaAsli.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  const blob = new Blob([arrayBuffer]);
  const urlObj = URL.createObjectURL(blob);

  const li = document.createElement('li');
  li.className = 'item-citra aktif';
  li.dataset.nama = '__unggahan__';
  li.innerHTML = `
    <img class="mini-gambar" src="${urlObj}" alt="Citra Anda"
         onload="URL.revokeObjectURL(this.src)"
         onerror="this.style.display='none'">
    <span class="info-citra">
      <span class="nama-citra" title="${namaAsli}">📎 ${namaTampil}</span>
      <span class="ukuran-citra">Citra Anda</span>
    </span>`;
  li.addEventListener('click', () => {
    document.querySelectorAll('.item-citra').forEach(el => el.classList.remove('aktif'));
    li.classList.add('aktif');
    citraAktif = { sumber: 'unggahan' };
    jadwalkanPemrosesan();
  });

  // Sisipkan di atas daftar
  daftarCitraEl.prepend(li);
}

function tampilkanGalatUnggah(pesan) {
  galatUnggahEl.textContent = pesan;
  galatUnggahEl.style.display = 'block';
}

/* ------------------------------------------------------------------ */
/* Slider dan pengaturan                                                 */
/* ------------------------------------------------------------------ */
function perbarui_slider(slider, elNilai, label) {
  // Perbarui label nilai dan gradasi warna slider
  let nilai = parseInt(slider.value);

  // Pastikan N selalu ganjil
  if (slider === sliderN && nilai % 2 === 0) {
    nilai += 1;
    slider.value = nilai;
  }

  elNilai.textContent = nilai;

  // Perbarui gradasi slider
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);
  const persen = ((nilai - min) / (max - min)) * 100;
  slider.style.background =
    `linear-gradient(to right, var(--biru-utama) ${persen}%, var(--garis) ${persen}%)`;

  jadwalkanPemrosesan();
}

sliderN.addEventListener('input', () => perbarui_slider(sliderN, nilaiNEl, 'N'));
sliderC.addEventListener('input', () => perbarui_slider(sliderC, nilaiCEl, 'C'));
sliderT.addEventListener('input', () => perbarui_slider(sliderT, nilaiTEl, 'T'));

// Inisialisasi slider
perbarui_slider(sliderN, nilaiNEl, 'N');
perbarui_slider(sliderC, nilaiCEl, 'C');
perbarui_slider(sliderT, nilaiTEl, 'T');

// Pilihan blur
document.querySelectorAll('input[name="pilihan-blur"]').forEach(radio => {
  radio.addEventListener('change', jadwalkanPemrosesan);
});

// Tombol atur ulang
tombolAturUlang.addEventListener('click', () => {
  sliderN.value = PARAM_DEFAULT.n;
  sliderC.value = PARAM_DEFAULT.c;
  sliderT.value = PARAM_DEFAULT.t;
  perbarui_slider(sliderN, nilaiNEl, 'N');
  perbarui_slider(sliderC, nilaiCEl, 'C');
  perbarui_slider(sliderT, nilaiTEl, 'T');
  // Set radio blur
  const radioDefault = document.querySelector(`input[name="pilihan-blur"][value="${PARAM_DEFAULT.blur}"]`);
  if (radioDefault) radioDefault.checked = true;
  jadwalkanPemrosesan();
});

/* ------------------------------------------------------------------ */
/* Jadwalkan pemrosesan (debounce 300 ms)                               */
/* ------------------------------------------------------------------ */
function jadwalkanPemrosesan() {
  clearTimeout(timerTunda);
  timerTunda = setTimeout(jalankanPemrosesan, 300);
}

/* ------------------------------------------------------------------ */
/* Pemrosesan utama                                                     */
/* ------------------------------------------------------------------ */
async function jalankanPemrosesan() {
  if (!citraAktif) return;
  if (sedangMemproses) return;

  sedangMemproses = true;

  // Tampilkan status memproses
  kisiHasilEl.innerHTML = `
    <div class="pesan-proses">
      <span class="pemuat"></span>
      <span style="margin-left:.75rem">Memproses citra...</span>
    </div>`;

  try {
    // Ambil nilai parameter
    const nBlok       = parseInt(sliderN.value);
    const cVal        = parseInt(sliderC.value);
    const tGlobal     = parseInt(sliderT.value);
    const pilihanBlur = document.querySelector('input[name="pilihan-blur"]:checked')?.value || 'gaussian3';

    // Bentuk FormData
    const form = new FormData();
    form.append('n_blok',       nBlok);
    form.append('c_val',        cVal);
    form.append('t_global',     tGlobal);
    form.append('pilihan_blur', pilihanBlur);

    if (citraAktif.sumber === 'contoh') {
      form.append('sumber',      'contoh');
      form.append('nama_berkas', citraAktif.nama);
    } else {
      // Unggahan
      if (!dataCitraUnggahan) {
        sedangMemproses = false;
        return;
      }
      form.append('sumber', 'unggahan');
      const blob = new Blob([dataCitraUnggahan]);
      form.append('berkas', blob, namaUnggahan);
    }

    const res = await fetch('/api/proses', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok || data.galat) {
      tampilkanGalatGlobal(data.galat || 'Terjadi galat pada server.');
      kisiHasilEl.innerHTML = `<div class="pesan-proses">⚠ ${data.galat || 'Galat.'}</div>`;
      return;
    }

    // Render hasil — hanya kunci yang ada di respons
    renderHasil(data);

  } catch (e) {
    console.error('Galat fetch:', e);
    tampilkanGalatGlobal('Gagal menghubungi server. Pastikan Flask berjalan.');
    kisiHasilEl.innerHTML = `<div class="pesan-proses">⚠ Gagal menghubungi server.</div>`;
  } finally {
    sedangMemproses = false;
  }
}

/* ------------------------------------------------------------------ */
/* Render kartu hasil                                                    */
/* ------------------------------------------------------------------ */
function renderHasil(data) {
  // data hanya mengandung: keabuan, global_binary, otsu, t_otsu,
  //                        adaptive_gaussian, persen_hitam, waktu_proses_ms

  const konfig = [
    {
      kunci:    'keabuan',
      judul:    'Keabuan + Blur',
      sorot:    false,
      lencana:  '',
      tIkut:    null,
    },
    {
      kunci:    'global_binary',
      judul:    `Global Binary (T = ${parseInt(document.getElementById('slider-t').value)})`,
      sorot:    false,
      lencana:  '',
      tIkut:    null,
    },
    {
      kunci:    'otsu',
      judul:    `Otsu (T = ${data.t_otsu} — otomatis)`,
      sorot:    false,
      lencana:  '',
      tIkut:    data.t_otsu,
    },
    {
      kunci:    'adaptive_gaussian',
      judul:    'Adaptive Gaussian Thresholding',
      sorot:    true,
      lencana:  'Metode terpilih',
      tIkut:    null,
    },
  ];

  kisiHasilEl.innerHTML = '';
  konfig.forEach(k => {
    const base64 = data[k.kunci];
    if (typeof base64 !== 'string') return; // lewati jika data tidak ada

    const persen  = data.persen_hitam?.[k.kunci];
    const waktu   = k.kunci === 'adaptive_gaussian' ? data.waktu_proses_ms : null;

    const div = document.createElement('div');
    div.className = 'kotak-hasil' + (k.sorot ? ' sorot' : '');

    // --- Header kotak ---
    let lencanaHtml = '';
    if (k.lencana) {
      lencanaHtml = `<span class="lencana-terpilih">${k.lencana}</span>`;
    }

    div.innerHTML = `
      <div class="judul-kotak">
        <span class="nama-metode">${k.judul}</span>
        ${lencanaHtml}
      </div>
      <img class="gambar-hasil"
           src="data:image/png;base64,${base64}"
           alt="${k.judul}"
           id="img-${k.kunci}">
      <div class="meta-hasil">
        <span class="persen-hitam">
          ${persen !== null && persen !== undefined
            ? `Piksel hitam: <strong>${persen}%</strong>`
            : ''}
        </span>
        ${waktu !== null
          ? `<span class="waktu-proses">⏱ ${waktu} ms</span>` : ''}
        ${k.kunci === 'adaptive_gaussian'
          ? `<button class="tombol-unduh-hasil" id="btn-unduh-adaptif">Unduh hasil (PNG)</button>`
          : ''}
      </div>`;

    // Klik pada kotak → buka modal perbesaran
    div.addEventListener('click', ev => {
      // Jangan buka modal bila yang diklik adalah tombol unduh
      if (ev.target.closest('.tombol-unduh-hasil')) return;
      bukaModal(base64, k.judul);
    });

    kisiHasilEl.appendChild(div);
  });

  // Pasang tombol unduh Adaptive Gaussian
  const btnUnduh = document.getElementById('btn-unduh-adaptif');
  if (btnUnduh) {
    btnUnduh.addEventListener('click', e => {
      e.stopPropagation();
      unduhBase64(data.adaptive_gaussian, 'adaptive_gaussian_hasil.png');
    });
  }
}

/* ------------------------------------------------------------------ */
/* Unduh hasil PNG                                                       */
/* ------------------------------------------------------------------ */
function unduhBase64(base64Str, namaFile) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64Str}`;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ------------------------------------------------------------------ */
/* Modal perbesaran                                                      */
/* ------------------------------------------------------------------ */
function bukaModal(base64Str, judulStr) {
  modalGambarEl.src = `data:image/png;base64,${base64Str}`;
  modalJudul.textContent = judulStr;
  modalLatar.classList.add('tampil');
}

tombolTutupModal.addEventListener('click', tutupModal);
modalLatar.addEventListener('click', ev => {
  if (ev.target === modalLatar) tutupModal();
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') tutupModal();
});

function tutupModal() {
  modalLatar.classList.remove('tampil');
  modalGambarEl.src = '';
}

/* ------------------------------------------------------------------ */
/* Notifikasi galat global                                              */
/* ------------------------------------------------------------------ */
let timerNotif = null;
function tampilkanGalatGlobal(pesan) {
  notifGalatEl.textContent = pesan;
  notifGalatEl.classList.add('tampil');
  clearTimeout(timerNotif);
  timerNotif = setTimeout(() => notifGalatEl.classList.remove('tampil'), 5000);
}

/* ------------------------------------------------------------------ */
/* Inisialisasi                                                          */
/* ------------------------------------------------------------------ */
muatDaftarCitra();
