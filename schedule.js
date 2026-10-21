// ============================================================
// schedule.js — penjadwalan tugas berbasis hari kerja
//
// KONVENSI:
// - Semua fungsi menerima dan mengembalikan string tanggal 'YYYY-MM-DD'.
// - Date object hanya dipakai internal, dan selalu diproses dengan
//   getFullYear()/getMonth()/getDate() (zona waktu lokal),
//   tidak pernah toISOString()/toISOString().slice().
// ============================================================

// === Util tanggal lokal ===
function pad(n) {
  return String(n).padStart(2, '0');
}

// Date -> 'YYYY-MM-DD' (zona waktu lokal)
function toKey(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 'YYYY-MM-DD' -> Date (zona waktu lokal, tengah malam)
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function assertKey(value, fname) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fname}: tanggal harus string 'YYYY-MM-DD', diterima: ${JSON.stringify(value)}`);
  }
}

// === Cek apakah suatu tanggal adalah hari kerja untuk proyek tertentu ===
function isWorkday(dateKey, projectId, db) {
  assertKey(dateKey, 'isWorkday');

  const d = fromKey(dateKey);
  const day = d.getDay();
  const sun = 0, sat = 6;

  // Atur akhir pekan: jika project_weekends.weekends_off = 1 (default),
  // Sabtu & Minggu libur; jika 0, Sabtu & Minggu tetap hari kerja.
  const pw = db.prepare('SELECT weekends_off FROM project_weekends WHERE project_id = ?').get(projectId);
  const weekendsOff = pw ? Number(pw.weekends_off) : 1;

  if (weekendsOff && (day === sun || day === sat)) {
    return false;
  }

  // Hari libur proyek:
  // - non-recurring: cocok persis tanggalnya
  // - recurring: cocok bulan + tanggal (berlaku tiap tahun)
  const rows = db.prepare(
    `SELECT h.date, h.recurring
     FROM holidays h
     WHERE h.project_id = ? AND (h.recurring = 1 OR h.date = ?)`
  ).all(projectId, dateKey);

  for (const h of rows) {
    if (h.recurring) {
      const hm = fromKey(h.date);
      if (hm.getMonth() === d.getMonth() && hm.getDate() === d.getDate()) {
        return false;
      }
    } else if (h.date === dateKey) {
      return false;
    }
  }

  // day_off pribadi (resource) tidak mempengaruhi hari kerja proyek.
  return true;
}

// === Hari kerja berikutnya setelah sebuah tanggal ===
// Mengembalikan string 'YYYY-MM-DD'.
// Jika includeStart = true dan tanggal tersebut hari kerja, tanggal itu sendiri dikembalikan.
function nextWorkdayAfter(dateKey, projectId, db, includeStart = false) {
  assertKey(dateKey, 'nextWorkdayAfter');

  if (includeStart && isWorkday(dateKey, projectId, db)) {
    return dateKey;
  }

  const cur = fromKey(dateKey);
  do {
    cur.setDate(cur.getDate() + 1);
  } while (!isWorkday(toKey(cur), projectId, db));

  return toKey(cur);
}

// Tambah N hari kerja dari sebuah tanggal (tanggal acuan TIDAK dihitung).
// Jika N = 0, kembalikan tanggal acuan apa adanya.
// Mengembalikan string 'YYYY-MM-DD'.
function addWorkdaysFrom(dateKey, n, projectId, db) {
  assertKey(dateKey, 'addWorkdaysFrom');

  const cur = fromKey(dateKey);
  let counted = 0;
  while (counted < n) {
    cur.setDate(cur.getDate() + 1);
    if (isWorkday(toKey(cur), projectId, db)) {
      counted++;
    }
  }
  return toKey(cur);
}

// === Add workdays: dari startKey, hitung N hari kerja (start = hari ke-1) ===
// - Jika startKey hari kerja: startKey adalah hari ke-1.
// - Jika startKey bukan hari kerja: geser ke hari kerja berikutnya sebagai hari ke-1.
// - Finish = hari kerja ke-N.
// Contoh: 30 Jun 2026 (Selasa), N=5 -> mulai 30 Jun, selesai 6 Jul.
// return { start, finish } keduanya string 'YYYY-MM-DD'.
function addWorkDays(startKey, workDays, projectId, db) {
  assertKey(startKey, 'addWorkDays');
  if (!Number.isInteger(workDays) || workDays < 1) {
    throw new Error(`addWorkDays: workDays harus bilangan bulat >= 1, diterima: ${workDays}`);
  }

  let cursor = fromKey(startKey);
  let added = 0;

  if (isWorkday(startKey, projectId, db)) {
    // startKey adalah hari ke-1
    added = 1;
  } else {
    // geser ke hari kerja berikutnya sebagai hari ke-1
    do {
      cursor.setDate(cursor.getDate() + 1);
    } while (!isWorkday(toKey(cursor), projectId, db));
    added = 1;
  }

  const start = toKey(cursor);

  while (added < workDays) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkday(toKey(cursor), projectId, db)) {
      added++;
    }
  }

  return {
    start,
    finish: toKey(cursor),
  };
}

// === Aturan dependensi (delay dalam hari kerja) ===
// computeStartDateByDependency menghitung tanggal acuan yang dibutuhkan:
// - FS/SS -> mengembalikan tanggal MULAI tugas
// - FF/SF -> mengembalikan tanggal SELESAI tugas (start dihitung terpisah
//            dengan computeStartFromFinish agar pas dengan durasi tugas)
//
// Aturan:
// - FS: mulai = hari kerja setelah selesai pendahulu + delay
// - SS: mulai = mulai pendahulu + delay hari kerja
// - FF: selesai = selesai pendahulu + delay hari kerja
// - SF: selesai = mulai pendahulu + delay hari kerja
function computeStartDateByDependency(type, pStart, pFinish, delay, projectId, db) {
  if (pStart instanceof Date) pStart = toKey(pStart);
  if (pFinish instanceof Date) pFinish = toKey(pFinish);
  assertKey(pStart, 'computeStartDateByDependency(pStart)');
  assertKey(pFinish, 'computeStartDateByDependency(pFinish)');
  if (!Number.isInteger(delay) || delay < 0) {
    throw new Error(`computeStartDateByDependency: delay harus bilangan bulat >= 0, diterima: ${delay}`);
  }

  switch (type) {
    case 'FS': {
      // mulai = hari kerja setelah selesai pendahulu, lalu + delay hari kerja
      const base = nextWorkdayAfter(pFinish, projectId, db, false);
      return addWorkdaysFrom(base, delay, projectId, db);
    }
    case 'SS': {
      // mulai = mulai pendahulu + delay hari kerja
      // (delay = 0 -> mulai pendahulu sendiri, yang sudah hari kerja)
      return addWorkdaysFrom(pStart, delay, projectId, db);
    }
    case 'FF': {
      // selesai = selesai pendahulu + delay hari kerja
      return addWorkdaysFrom(pFinish, delay, projectId, db);
    }
    case 'SF': {
      // selesai = mulai pendahulu + delay hari kerja
      return addWorkdaysFrom(pStart, delay, projectId, db);
    }
    default:
      throw new Error('Tipe dependensi tidak dikenal: ' + type);
  }
}

// === Hitung MULAI dari SELESAI dengan durasi tertentu (hitung mundur hari kerja) ===
// start = hari kerja ke-(durasi-1) sebelum finish; finish sendiri dihitung
// sebagai hari kerja terakhir (ke-durasi).
// Mengembalikan string 'YYYY-MM-DD'.
function computeStartFromFinish(finishKey, durationDays, projectId, db) {
  assertKey(finishKey, 'computeStartFromFinish');
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new Error(`computeStartFromFinish: durationDays harus bilangan bulat >= 1, diterima: ${durationDays}`);
  }

  if (!isWorkday(finishKey, projectId, db)) {
    // geser mundur ke hari kerja terakhir sebelum finishKey
    const cur = fromKey(finishKey);
    do {
      cur.setDate(cur.getDate() - 1);
    } while (!isWorkday(toKey(cur), projectId, db));
    finishKey = toKey(cur);
  }

  const cur = fromKey(finishKey);
  let counted = 1; // finishKey sendiri adalah hari kerja ke-durasi
  while (counted < durationDays) {
    cur.setDate(cur.getDate() - 1);
    if (isWorkday(toKey(cur), projectId, db)) {
      counted++;
    }
  }
  return toKey(cur);
}

// === Deteksi siklus dependency ===
// Edge: predecessor -> task (task bergantung pada predecessor).
// Menambah edge predecessorId -> taskId membentuk siklus jika sudah ada
// jalur dari taskId ke predecessorId. DFS dijalankan dari taskId mengikuti
// edge task -> pred apa adanya (kueri: siapa yang bergantung pada cur).
function wouldCreateCycle(taskId, predecessorId, db) {
  if (taskId === predecessorId) return true;

  const visited = new Set();
  const stack = [taskId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === predecessorId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const deps = db.prepare(
      'SELECT task_id FROM dependencies WHERE predecessor_id = ?'
    ).all(cur);
    for (const d of deps) {
      stack.push(d.task_id);
    }
  }
  return false;
}

// === Hitung ulang jadwal semua tugas dalam satu proyek ===
// Urutan topological berdasarkan dependency; setiap tugas:
// - tanpa dependensi: anchor = start_date
// - dengan dependensi: start dihitung dari aturan FS/SS/FF/SF,
//   lalu digeser agar jatuh di hari kerja dan durasi dihitung dalam hari kerja.
function rescheduleProject(projectId, db) {
  if (projectId == null) return;

  const tasks = db.prepare(
    `SELECT id, name, start_date, duration_days, parent_id FROM tasks
     WHERE project_id = ?
     ORDER BY id`
  ).all(projectId);

  if (!tasks.length) return;

  const byId = {};
  tasks.forEach(t => (byId[t.id] = t));

  // Dependencies dalam proyek ini
  const deps = db.prepare(
    `SELECT d.task_id, d.predecessor_id, d.type, d.delay
     FROM dependencies d
     WHERE d.task_id IN (SELECT id FROM tasks WHERE project_id = ?)
       AND d.predecessor_id IN (SELECT id FROM tasks WHERE project_id = ?)`
  ).all(projectId, projectId);

  const depMap = {}; // task_id -> list {pred, type, delay}
  deps.forEach(d => {
    (depMap[d.task_id] = depMap[d.task_id] || []).push({
      pred: d.predecessor_id,
      type: d.type,
      delay: Number(d.delay) || 0,
    });
  });

  // Urutan topological (Kahn)
  const inDegree = {};
  tasks.forEach(t => (inDegree[t.id] = 0));
  tasks.forEach(t => {
    (depMap[t.id] || []).forEach(() => {
      inDegree[t.id]++;
    });
  });

  const queue = [];
  tasks.forEach(t => {
    if (inDegree[t.id] === 0) queue.push(t.id);
  });

  const scheduled = {}; // id -> { start, finish } string 'YYYY-MM-DD'

  while (queue.length) {
    const id = queue.shift();
    const task = byId[id];
    const taskDeps = depMap[id] || [];
    const dur = task.duration_days || 1;
    const manStart = task.start_date;

    let startKey;

    if (taskDeps.length === 0) {
      // Tidak ada dependensi: anchor = start_date manual
      startKey = manStart || toKey(new Date());
    } else {
      // Hitung dari semua predecessor, ambil hasil paling akhir.
      // FS/SS menghasilkan tanggal mulai; FF/SF menghasilkan tanggal selesai
      // yang dikonversi ke mulai menggunakan durasi tugas.
      let resolvedStart = null;

      for (const d of taskDeps) {
        const pred = byId[d.pred];
        if (!pred || !scheduled[pred.id]) continue;
        const pStart = scheduled[pred.id].start;
        const pFinish = scheduled[pred.id].finish;
        const computed = computeStartDateByDependency(d.type, pStart, pFinish, d.delay, projectId, db);

        let candidateStart;
        if (d.type === 'FF' || d.type === 'SF') {
          // computed adalah tanggal selesai target -> hitung mundur sesuai durasi
          candidateStart = computeStartFromFinish(computed, dur, projectId, db);
        } else {
          candidateStart = computed;
        }

        if (!resolvedStart || candidateStart > resolvedStart) {
          resolvedStart = candidateStart;
        }
      }

      // start_date manual tetap dipertahankan jika lebih akhir dari hasil dependensi
      if (manStart && (!resolvedStart || manStart > resolvedStart)) {
        resolvedStart = manStart;
      }

      startKey = resolvedStart || toKey(new Date());
    }

    const { start, finish } = addWorkDays(startKey, dur, projectId, db);
    scheduled[id] = { start, finish };

    // Lepaskan dependensi berikutnya: kurangi in-degree semua tugas yang
    // menunggu tugas ini, masukkan ke antrean jika sudah 0.
    tasks.forEach(t => {
      if ((depMap[t.id] || []).some(d => d.pred === id)) {
        inDegree[t.id]--;
        if (inDegree[t.id] === 0) queue.push(t.id);
      }
    });
  }

  // Update DB: scheduled_start / scheduled_finish
  const upd = db.prepare(
    `UPDATE tasks SET scheduled_start = ?, scheduled_finish = ? WHERE id = ?`
  );
  for (const t of tasks) {
    const s = scheduled[t.id];
    if (!s) continue;
    upd.run(s.start, s.finish, t.id);
  }

  // Induk dengan sub-tugas: start = anak paling awal, finish = anak paling akhir
  tasks.forEach(t => {
    if (t.parent_id) return;
    const children = tasks.filter(c => c.parent_id === t.id);
    if (!children.length) return;
    let earliest = null;
    let latest = null;
    for (const c of children) {
      if (!scheduled[c.id]) continue;
      if (!earliest || scheduled[c.id].start < earliest) earliest = scheduled[c.id].start;
      if (!latest || scheduled[c.id].finish > latest) latest = scheduled[c.id].finish;
    }
    if (earliest && latest) {
      db.prepare(
        `UPDATE tasks SET scheduled_start = ?, scheduled_finish = ? WHERE id = ?`
      ).run(earliest, latest, t.id);
      scheduled[t.id] = { start: earliest, finish: latest };
    }
  });
}

// === Ambil tugas dengan jadwal + dependensi + sub-tugas + resource ===
function getScheduledTasks(projectId, db) {
  const tasks = db.prepare(
    `SELECT * FROM tasks WHERE project_id = ? ORDER BY COALESCE(scheduled_start, start_date) ASC, priority ASC`
  ).all(projectId);

  const deps = db.prepare(
    `SELECT d.*, t.name AS predecessor_name
     FROM dependencies d
     JOIN tasks t ON t.id = d.predecessor_id
     WHERE d.task_id IN (SELECT id FROM tasks WHERE project_id = ?)`
  ).all(projectId);

  const taskDeps = {};
  deps.forEach(d => {
    (taskDeps[d.task_id] = taskDeps[d.task_id] || []).push({
      id: d.id,
      predecessor_id: d.predecessor_id,
      type: d.type,
      delay: d.delay,
      predecessor_name: d.predecessor_name,
    });
  });

  const taskResources = db.prepare(
    `SELECT tr.*, r.name AS resource_name
     FROM task_resources tr
     JOIN resources r ON r.id = tr.resource_id
     WHERE tr.task_id IN (SELECT id FROM tasks WHERE project_id = ?)`
  ).all(projectId);

  const resMap = {};
  taskResources.forEach(tr => {
    (resMap[tr.task_id] = resMap[tr.task_id] || []).push({
      resource_id: tr.resource_id,
      resource_name: tr.resource_name,
    });
  });

  const subs = {};
  tasks.forEach(t => {
    if (!t.parent_id) {
      subs[t.id] = tasks
        .filter(c => c.parent_id === t.id)
        .sort((a, b) => String(a.scheduled_start || a.start_date).localeCompare(String(b.scheduled_start || b.start_date)));
    }
  });

  return tasks.map(t => ({
    ...t,
    dependencies: taskDeps[t.id] || [],
    resources: resMap[t.id] || [],
    subtasks: t.parent_id ? [] : subs[t.id] || [],
  }));
}

module.exports = {
  toKey,
  fromKey,
  isWorkday,
  nextWorkdayAfter,
  addWorkDays,
  computeStartDateByDependency,
  computeStartFromFinish,
  wouldCreateCycle,
  rescheduleProject,
  getScheduledTasks,
};
