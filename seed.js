const schedule = require('./schedule');

// ============================================================
// seed.js — seedSampleData(db): data contoh idempoten.
// Semua tanggal diketahui tetap (tahun 2026), tanpa new Date().
// Seluruh operasi dibungkus satu db.transaction.
// ============================================================

function seedSampleData(db) {
  const run = db.transaction(() => {
    // --- Hapus semua data (tabel anak dulu) ---
    db.exec('DELETE FROM task_resources');
    db.exec('DELETE FROM day_offs');
    db.exec('DELETE FROM dependencies');
    db.exec('DELETE FROM resources');
    db.exec('DELETE FROM project_weekends');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM holidays');
    db.exec('DELETE FROM projects');

    // ============ Proyek 1: SDLC PT Xijet ============
    const p1 = db.prepare(
      'INSERT INTO projects (name, organization, website, description, weekends_off) VALUES (?,?,?,?,?)'
    ).run(
      'Pengembangan Perangkat Lunak PT Xijet',
      'PT Xijet Indonesia',
      'https://xijet.co.id',
      'Skenario SDLC dengan akhir pekan libur dan libur custom 17 Juli 2026',
      1
    );
    const p1Id = Number(p1.lastInsertRowid);

    db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(p1Id, 1);    db.prepare('INSERT INTO holidays (project_id, date, label, recurring) VALUES (?, ?, ?, ?)')
      .run(p1Id, '2026-07-17', 'Libur custom', 0);
    // libur tambahan di luar rentang jadwal agar tidak mengubah tanggal yang dites
    db.prepare('INSERT INTO holidays (project_id, date, label, recurring) VALUES (?, ?, ?, ?)')
      .run(p1Id, '2026-08-17', 'Hari Kemerdekaan RI', 0);

    // --- Tugas utama (start_date semua 2026-06-30) ---
    const tasks = [
      { name: 'Analisis Kebutuhan', dur: 5, color: '#E67E22', prio: 1 },
      { name: 'Analisis Sistem', dur: 9, color: '#F1C40F', prio: 1 },
      { name: 'Perancangan', dur: 7, color: '#2ECC71', prio: 1 },
      { name: 'Implementasi', dur: 5, color: '#3498DB', prio: 1 },
      { name: 'Pengujian', dur: 2, color: '#9B59B6', prio: 1 },
      { name: 'Deployment & Maintenance', dur: 2, color: '#34495E', prio: 1 },
    ];

    const insertT = db.prepare(
      'INSERT INTO tasks (project_id, name, start_date, duration_days, priority, color) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const taskIds = tasks.map(t =>
      Number(insertT.run(p1Id, t.name, '2026-06-30', t.dur, t.prio, t.color).lastInsertRowid)
    );

    // --- Dependensi ---
    const insertD = db.prepare(
      'INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)'
    );
    insertD.run(taskIds[1], taskIds[0], 'SS', 3); // Analisis Sistem <- Analisis Kebutuhan SS 3
    insertD.run(taskIds[2], taskIds[1], 'SS', 5); // Perancangan <- Analisis Sistem SS 5
    insertD.run(taskIds[3], taskIds[2], 'FS', 0); // Implementasi <- Perancangan FS 0
    insertD.run(taskIds[4], taskIds[3], 'FS', 0); // Pengujian <- Implementasi FS 0
    insertD.run(taskIds[5], taskIds[4], 'FS', 0); // Deployment <- Pengujian FS 0

    // --- Sub-tugas Analisis Kebutuhan ---
    const subs = [
      { name: 'Survei', start: '2026-06-30', dur: 2 },
      { name: 'Pengamatan', start: '2026-07-02', dur: 2 },
      { name: 'Wawancara', start: '2026-07-06', dur: 1 },
    ];
    for (const s of subs) {
      const info = insertT.run(p1Id, s.name, s.start, s.dur, 2, '#E67E22');
      db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(taskIds[0], info.lastInsertRowid);
    }

    // --- Resource (7 orang) ---
    const insertR = db.prepare(
      'INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)'
    );
    const r1 = Number(insertR.run(p1Id, 'Andi Perbowo', '081234567890', 'andi@xijet.co.id', 'Project Manager', '18000000').lastInsertRowid);
    const r2 = Number(insertR.run(p1Id, 'Budi Seorang', '082111122233', 'budi@xijet.co.id', 'Project Analyst', '12000000').lastInsertRowid);
    const r3 = Number(insertR.run(p1Id, 'Citra Laras', '083344455566', 'citra@xijet.co.id', 'Project Analyst', '13000000').lastInsertRowid);
    const r4 = Number(insertR.run(p1Id, 'Doni Coding', '084455566677', 'doni@xijet.co.id', 'Programmer', '14000000').lastInsertRowid);
    const r5 = Number(insertR.run(p1Id, 'Eka Ngoding', '085566677788', 'eka@xijet.co.id', 'Programmer', '14500000').lastInsertRowid);
    const r6 = Number(insertR.run(p1Id, 'Fani Tes', '086677788899', 'fani@xijet.co.id', 'Tester', '11000000').lastInsertRowid);
    const r7 = Number(insertR.run(p1Id, 'Gita Uji', '087788899900', 'gita@xijet.co.id', 'Tester', '11500000').lastInsertRowid);

    // --- Alokasi resource ---
    const alloc = db.prepare('INSERT INTO task_resources (task_id, resource_id) VALUES (?, ?)');
    alloc.run(taskIds[0], r2); alloc.run(taskIds[0], r3); // Analisis Kebutuhan -> 2 analis
    alloc.run(taskIds[1], r3);                             // Analisis Sistem
    alloc.run(taskIds[2], r4); alloc.run(taskIds[2], r5);  // Perancangan
    alloc.run(taskIds[3], r4); alloc.run(taskIds[3], r5);  // Implementasi
    alloc.run(taskIds[4], r6); alloc.run(taskIds[4], r7);  // Pengujian
    alloc.run(taskIds[5], r1);                             // Deployment

    // --- Day off (seperti seed lama: Budi, 1 Juli) ---
    db.prepare('INSERT INTO day_offs (resource_id, date, description) VALUES (?, ?, ?)')
      .run(r2, '2026-07-01', 'Cuti pribadi');

    // ============ Proyek 2: Contoh Critical Path ============
    const p2 = db.prepare(
      'INSERT INTO projects (name, organization, website, description, weekends_off) VALUES (?,?,?,?,?)'
    ).run(
      'Contoh Critical Path',
      'PT Demo',
      'https://demo.co.id',
      'Contoh jalur kritis dengan akhir pekan tetap kerja',
      0
    );
    const p2Id = Number(p2.lastInsertRowid);

    db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(p2Id, 0);

    const cp = [
      { name: 'A', dur: 1 },
      { name: 'B', dur: 2 },
      { name: 'C', dur: 3 },
      { name: 'D', dur: 5 },
      { name: 'E', dur: 7 },
      { name: 'F', dur: 4 },
      { name: 'G', dur: 12 },
      { name: 'H', dur: 21 },
      { name: 'I', dur: 2 },
      { name: 'J', dur: 3 },
    ];
    const cids = cp.map(t =>
      Number(insertT.run(p2Id, t.name, '2026-06-30', t.dur, 1, '#4A90D9').lastInsertRowid)
    );

    // Dependensi FS delay 0: D<-A, E<-B, F<-B, G<-C, H<-D,E, I<-G, J<-F,H,I
    insertD.run(cids[3], cids[0], 'FS', 0); // D <- A
    insertD.run(cids[4], cids[1], 'FS', 0); // E <- B
    insertD.run(cids[5], cids[1], 'FS', 0); // F <- B
    insertD.run(cids[6], cids[2], 'FS', 0); // G <- C
    insertD.run(cids[7], cids[3], 'FS', 0); // H <- D
    insertD.run(cids[7], cids[4], 'FS', 0); // H <- E
    insertD.run(cids[8], cids[6], 'FS', 0); // I <- G
    insertD.run(cids[9], cids[5], 'FS', 0); // J <- F
    insertD.run(cids[9], cids[7], 'FS', 0); // J <- H
    insertD.run(cids[9], cids[8], 'FS', 0); // J <- I

    // --- Resource proyek 2 (Critical Path) agar data terisi penuh ---
    const q1 = Number(insertR.run(p2Id, 'Kirana Manajer', '081122233344', 'kirana@demo.co.id', 'Project Manager', '15000000').lastInsertRowid);
    const q2 = Number(insertR.run(p2Id, 'Lukman Pengembang', '082233344455', 'lukman@demo.co.id', 'Programmer', '12500000').lastInsertRowid);
    const q3 = Number(insertR.run(p2Id, 'Mira Pengujji', '083344455566', 'mira@demo.co.id', 'Tester', '10500000').lastInsertRowid);
    alloc.run(cids[3], q2); alloc.run(cids[4], q2); // D, E -> programmer
    alloc.run(cids[7], q1);                          // H -> manajer
    alloc.run(cids[9], q3);                          // J -> tester
    db.prepare('INSERT INTO day_offs (resource_id, date, description) VALUES (?, ?, ?)')
      .run(q2, '2026-07-20', 'Dinas luar');

    // ============ Proyek 3: Digitalisasi UMKM Nusantara ============
    const p3 = db.prepare(
      'INSERT INTO projects (name, organization, website, description, weekends_off) VALUES (?,?,?,?,?)'
    ).run(
      'Digitalisasi UMKM Nusantara',
      'Koperasi Digital Nusantara',
      'https://umkm-nusantara.id',
      'Onboarding platform digital UMKM: kebutuhan, pengembangan, integrasi pembayaran, uji terbatas, dan peluncuran (Agu–Sep 2026)',
      1
    );
    const p3Id = Number(p3.lastInsertRowid);

    db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(p3Id, 1);

    db.prepare('INSERT INTO holidays (project_id, date, label, recurring) VALUES (?, ?, ?, ?)')
      .run(p3Id, '2026-08-17', 'Cuti Bersama', 0);
    db.prepare('INSERT INTO holidays (project_id, date, label, recurring) VALUES (?, ?, ?, ?)')
      .run(p3Id, '2026-12-25', 'Hari Natal', 1); // berulang tiap tahun

    const t3 = [
      { name: 'Penggalian Kebutuhan UMKM', dur: 5, color: '#E67E22' },
      { name: 'Pemetaan Proses Bisnis', dur: 4, color: '#F1C40F' },
      { name: 'Pengembangan Platform', dur: 8, color: '#2ECC71' },
      { name: 'Integrasi Pembayaran', dur: 6, color: '#3498DB' },
      { name: 'UAT Terbatas', dur: 4, color: '#9B59B6' },
      { name: 'Peluncuran & Pelatihan', dur: 3, color: '#34495E' },
    ];
    const t3ids = t3.map(t =>
      Number(insertT.run(p3Id, t.name, '2026-08-03', t.dur, 1, t.color).lastInsertRowid)
    );

    insertD.run(t3ids[1], t3ids[0], 'FS', 0); // Pemetaan <- Penggalian FS 0
    insertD.run(t3ids[2], t3ids[1], 'FS', 0); // Platform <- Pemetaan FS 0
    insertD.run(t3ids[3], t3ids[2], 'SS', 4); // Integrasi <- Platform SS 4 (tumpang tindih)
    insertD.run(t3ids[4], t3ids[3], 'FS', 0); // UAT <- Integrasi FS 0
    insertD.run(t3ids[5], t3ids[4], 'FS', 0); // Peluncuran <- UAT FS 0

    // Sub-tugas Penggalian Kebutuhan
    const sub3 = [
      { name: 'Kunjungan Lapangan', start: '2026-08-03', dur: 2 },
      { name: 'Fokus Grup', start: '2026-08-05', dur: 3 },
    ];
    for (const s of sub3) {
      const info = insertT.run(p3Id, s.name, s.start, s.dur, 2, '#E67E22');
      db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(t3ids[0], info.lastInsertRowid);
    }

    // Resource proyek 3
    const u1 = Number(insertR.run(p3Id, 'Rani Manajer', '081199988877', 'rani@umkm-nusantara.id', 'Project Manager', '16000000').lastInsertRowid);
    const u2 = Number(insertR.run(p3Id, 'Bagus Analis', '082288877766', 'bagus@umkm-nusantara.id', 'System Analyst', '12500000').lastInsertRowid);
    const u3 = Number(insertR.run(p3Id, 'Cemplung Pengembang', '083377766655', 'cemplung@umkm-nusantara.id', 'Programmer', '13500000').lastInsertRowid);
    const u4 = Number(insertR.run(p3Id, 'Dewi Pengujji', '084466655544', 'dewi@umkm-nusantara.id', 'QA Engineer', '11500000').lastInsertRowid);

    alloc.run(t3ids[0], u2);                         // Penggalian -> analis
    alloc.run(t3ids[1], u2); alloc.run(t3ids[1], u1);// Pemetaan -> analis + manajer
    alloc.run(t3ids[2], u3);                         // Platform -> pengembang
    alloc.run(t3ids[3], u3);                         // Integrasi -> pengembang
    alloc.run(t3ids[4], u4);                         // UAT -> QA
    alloc.run(t3ids[5], u1); alloc.run(t3ids[5], u4);// Peluncuran -> manajer + QA

    db.prepare('INSERT INTO day_offs (resource_id, date, description) VALUES (?, ?, ?)')
      .run(u3, '2026-08-21', 'Cuti keluarga');

    // --- Hitung ulang jadwal ketiga proyek ---
    schedule.rescheduleProject(p1Id, db);
    schedule.rescheduleProject(p2Id, db);
    schedule.rescheduleProject(p3Id, db);
  });

  run();
}

module.exports = { seedSampleData };
