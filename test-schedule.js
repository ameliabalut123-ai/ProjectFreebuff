// ============================================================
// test-schedule.js — verifikasi jadwal hasil seed (seed.js)
// - process.env.DB_PATH diarahkan ke file sementara di os.tmpdir()
//   SEBELUM require('./server'), sehingga autorun seed berjalan
//   pada database kosong.
// - Gunakan require('node:assert').strictEqual: setiap kegagalan
//   adalah hard fail (exit code != 0), semua kegagalan dilaporkan.
// - File DB sementara dihapus di akhir.
// ============================================================

const os = require('os');
const path = require('path');
const fs = require('fs');

// 1) Arahkan DB ke file sementara SEBELUM modul server/db dimuat
const tmpDb = path.join(os.tmpdir(), `gantt-test-${process.pid}.db`);
process.env.DB_PATH = tmpDb;

// 2) require('./server') -> blok autorun menjalankan seedSampleData
//    karena DB sementara masih kosong
require('./server');

// 3) Ambil db dari singleton db.js
const { getDb } = require('./db');
const assert = require('node:assert').strict;

const db = getDb();

let failures = 0;
function check(label, actual, expected) {
  try {
    assert.strictEqual(actual, expected, label);
    console.log(`PASS: ${label} = ${actual}`);
  } catch (e) {
    failures++;
    console.error(`FAIL: ${e.message}`);
  }
}

function schedByName(projectId, name) {
  const row = db
    .prepare('SELECT scheduled_start, scheduled_finish FROM tasks WHERE project_id = ? AND name = ?')
    .get(projectId, name);
  if (!row) throw new Error(`Tugas tidak ditemukan: proyek ${projectId} "${name}"`);
  return row;
}

function checkTask(projectId, name, expectedStart, expectedFinish) {
  const row = schedByName(projectId, name);
  check(`P${projectId} ${name} scheduled_start`, row.scheduled_start, expectedStart);
  check(`P${projectId} ${name} scheduled_finish`, row.scheduled_finish, expectedFinish);
}

try {
  // ===== Proyek 1: Pengembangan Perangkat Lunak PT Xijet =====
  checkTask(1, 'Analisis Kebutuhan', '2026-06-30', '2026-07-06');
  checkTask(1, 'Analisis Sistem', '2026-07-03', '2026-07-15');
  checkTask(1, 'Perancangan', '2026-07-10', '2026-07-21');
  checkTask(1, 'Implementasi', '2026-07-22', '2026-07-28');
  checkTask(1, 'Pengujian', '2026-07-29', '2026-07-30');
  checkTask(1, 'Deployment & Maintenance', '2026-07-31', '2026-08-03');

  // ===== Proyek 2: Contoh Critical Path =====
  checkTask(2, 'H', '2026-07-09', '2026-07-29');
  checkTask(2, 'J', '2026-07-30', '2026-08-01');
} finally {
  // 4) Hapus file DB sementara (dan teman WAL/Journal-nya) di akhir
  db.close();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const f = tmpDb + suffix;
    try {
      if (fs.existsSync(f)) fs.rmSync(f);
    } catch (e) {
      console.error(`Gagal menghapus ${f}: ${e.message}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} tes gagal.`);
  process.exit(1);
}
console.log('\nSemua tes lulus.');
