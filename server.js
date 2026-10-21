const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const { getDb, resetDatabase } = require('./db');
const schedule = require('./schedule');
const { seedSampleData } = require('./seed');

// Autorun seed jika DB kosong (hanya saat pertama jalan)
try {
  const db = getDb();
  const n = db.prepare('SELECT COUNT(*) AS c FROM projects').get();
  if (n.c === 0) {
    seedSampleData(db);
    console.log('Data contoh dimuat otomatis (database kosong).');
  }
} catch (e) {
  console.error('Seed gagal:', e.message);
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log('Akses halaman: http://localhost:3000/');
    console.log('API: /api/v1/projects, /api/v1/holidays, /api/v1/tasks, /api/v1/dependencies, /api/v1/resources, /api/v1/day_offs, /api/v1/task_resources');
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const API_PREFIX = '/api/v1';

// === RESET DATABASE (hanya development) ===
if (process.env.NODE_ENV === 'development') {
  app.post(`${API_PREFIX}/_reset`, (req, res) => {
    try {
      resetDatabase();
      res.json({ message: 'Database direset dan skema dibuat ulang' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// === PROJECTS ===
app.get(`${API_PREFIX}/projects`, (req, res) => {
  try {
    const db = getDb();
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/projects/:id`, (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/projects`, (req, res) => {
  try {
    const { name, organization, website, description, weekends_off } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama proyek wajib diisi' });
    }
    const db = getDb();
    const stmt = db.prepare(
      'INSERT INTO projects (name, organization, website, description) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(
      name.trim(),
      organization ? organization.trim() : null,
      website ? website.trim() : null,
      description ? description.trim() : null
    );
    const projectId = info.lastInsertRowid;
    if (weekends_off !== undefined) {
      db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(projectId, weekends_off ? 1 : 0);
    } else {
      db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(projectId, 1);
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_PREFIX}/projects/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Proyek tidak ditemukan' });

    const { name, organization, website, description, weekends_off } = req.body;
    db.prepare(
      `UPDATE projects SET
        name = ?, organization = ?, website = ?, description = ?
      WHERE id = ?`
    ).run(
      name !== undefined ? (name || null) : existing.name,
      organization !== undefined ? (organization || null) : existing.organization,
      website !== undefined ? (website || null) : existing.website,
      description !== undefined ? (description || null) : existing.description,
      req.params.id
    );
    if (weekends_off !== undefined) {
      const row = db.prepare('SELECT id FROM project_weekends WHERE project_id = ?').get(req.params.id);
      if (row) {
        db.prepare('UPDATE project_weekends SET weekends_off = ? WHERE project_id = ?').run(weekends_off ? 1 : 0, req.params.id);
      } else {
        db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(req.params.id, weekends_off ? 1 : 0);
      }
    }
    schedule.rescheduleProject(Number(req.params.id), db);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/projects/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    res.json({ message: 'Proyek berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === HOLIDAYS ===
app.get(`${API_PREFIX}/holidays`, (req, res) => {
  try {
    const db = getDb();
    let query = 'SELECT h.* FROM holidays h';
    const params = [];
    if (req.query.project_id) {
      query += ' WHERE h.project_id = ?';
      params.push(Number(req.query.project_id));
    }
    query += ' ORDER BY h.date ASC';
    const holidays = db.prepare(query).all(...params);
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/holidays/:id`, (req, res) => {
  try {
    const db = getDb();
    const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(req.params.id);
    if (!holiday) return res.status(404).json({ error: 'Hari libur tidak ditemukan' });
    res.json(holiday);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/holidays`, (req, res) => {
  try {
    const { date, label, recurring, project_id } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Tanggal wajib diisi' });
    }
    const db = getDb();
    const pid = project_id ? Number(project_id) : null;
    const stmt = db.prepare(
      'INSERT INTO holidays (project_id, date, label, recurring) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(pid, date, label || null, recurring ? 1 : 0);
    const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(holiday);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Hari libur untuk proyek dan tanggal ini sudah ada' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_PREFIX}/holidays/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM holidays WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Hari libur tidak ditemukan' });

    const { date, label, recurring, project_id } = req.body;
    db.prepare(
      `UPDATE holidays SET
        project_id = ?, date = ?, label = ?, recurring = ?
      WHERE id = ?`
    ).run(
      project_id !== undefined ? (Number(project_id) || null) : existing.project_id,
      date || existing.date,
      label !== undefined ? (label || null) : existing.label,
      recurring !== undefined ? (recurring ? 1 : 0) : existing.recurring,
      req.params.id
    );
    const holiday = db.prepare('SELECT * FROM holidays WHERE id = ?').get(req.params.id);
    res.json(holiday);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Hari libur untuk proyek dan tanggal ini sudah ada' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/holidays/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM holidays WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Hari libur tidak ditemukan' });
    db.prepare('DELETE FROM holidays WHERE id = ?').run(req.params.id);
    res.json({ message: 'Hari libur berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === TASKS ===
app.get(`${API_PREFIX}/tasks`, (req, res) => {
  try {
    const db = getDb();
    let query = 'SELECT * FROM tasks';
    const params = [];

    if (req.query.project_id) {
      query += ' WHERE project_id = ?';
      params.push(Number(req.query.project_id));
    }
    if (req.query.parent_id !== undefined) {
      if (params.length === 0) query += ' WHERE ';
      else query += ' AND ';
      query += ' parent_id IS ' + (req.query.parent_id === 'null' ? 'NULL' : '?');
      if (req.query.parent_id !== 'null') params.push(Number(req.query.parent_id));
    }

    query += ' ORDER BY COALESCE(scheduled_start, start_date) ASC, priority ASC';

    const tasks = db.prepare(query).all(...params);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/tasks/:id`, (req, res) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tugas tidak ditemukan' });

    const subs = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY COALESCE(scheduled_start, start_date) ASC').all(task.id);
    const deps = db.prepare(
      `SELECT d.*, t.name AS predecessor_name
       FROM dependencies d
       JOIN tasks t ON t.id = d.predecessor_id
       WHERE d.task_id = ?`
    ).all(task.id);

    const resources = db.prepare(
      `SELECT tr.*, r.name AS resource_name, r.role AS resource_role
       FROM task_resources tr
       JOIN resources r ON r.id = tr.resource_id
       WHERE tr.task_id = ?`
    ).all(task.id);

    res.json({
      ...task,
      subtasks: subs,
      dependencies: deps,
      resources: resources,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/tasks/:id/subtasks`, (req, res) => {
  try {
    const db = getDb();
    const subs = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY COALESCE(scheduled_start, start_date) ASC, priority ASC').all(req.params.id);
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/tasks/:id/dependencies`, (req, res) => {
  try {
    const db = getDb();
    const deps = db.prepare(
      `SELECT d.*, t.name AS predecessor_name
       FROM dependencies d
       JOIN tasks t ON t.id = d.predecessor_id
       WHERE d.task_id = ?`
    ).all(req.params.id);
    res.json(deps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/tasks`, (req, res) => {
  try {
    const { name, project_id, start_date, duration_days, priority, color, parent_id, resource_ids } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama tugas wajib diisi' });
    }
    if (!start_date) {
      return res.status(400).json({ error: 'Tgl mulai wajib diisi' });
    }
    const db = getDb();
    const safe = (v, fallback) => (v !== undefined && v !== null && v !== '' ? v : fallback);
    const stmt = db.prepare(
      `INSERT INTO tasks (name, project_id, start_date, duration_days, priority, color, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      name.trim(),
      safe(project_id, null),
      start_date,
      duration_days ? Number(duration_days) : 1,
      priority ? Number(priority) : 1,
      color || '#4A90D9',
      safe(parent_id, null)
    );
    const taskId = info.lastInsertRowid;
    if (resource_ids && Array.isArray(resource_ids)) {
      const ins = db.prepare('INSERT INTO task_resources (task_id, resource_id) VALUES (?, ?)');
      for (const rid of resource_ids) {
        if (rid) ins.run(taskId, rid);
      }
    }
    schedule.rescheduleProject(Number(project_id) || undefined, db);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const deps = db.prepare(
      `SELECT d.*, t.name AS predecessor_name FROM dependencies d JOIN tasks t ON t.id = d.predecessor_id WHERE d.task_id = ?`
    ).all(taskId);
    const resources = db.prepare(
      `SELECT tr.*, r.name AS resource_name, r.role AS resource_role FROM task_resources tr JOIN resources r ON r.id = tr.resource_id WHERE tr.task_id = ?`
    ).all(taskId);
    res.status(201).json({ ...task, dependencies: deps, resources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_PREFIX}/tasks/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tugas tidak ditemukan' });

    const { name, project_id, start_date, duration_days, priority, color, parent_id, resource_ids } = req.body;
    db.prepare(
      `UPDATE tasks SET
        name = ?, project_id = ?, start_date = ?, duration_days = ?,
        priority = ?, color = ?, parent_id = ?
      WHERE id = ?`
    ).run(
      name !== undefined ? (name || null) : existing.name,
      project_id !== undefined ? (project_id || null) : existing.project_id,
      start_date !== undefined ? (start_date || null) : existing.start_date,
      duration_days !== undefined ? (duration_days ? Number(duration_days) : existing.duration_days) : existing.duration_days,
      priority !== undefined ? (priority ? Number(priority) : existing.priority) : existing.priority,
      color !== undefined ? (color || existing.color) : existing.color,
      parent_id !== undefined ? (parent_id || null) : existing.parent_id,
      req.params.id
    );

    // Update resources
    db.prepare('DELETE FROM task_resources WHERE task_id = ?').run(req.params.id);
    if (resource_ids && Array.isArray(resource_ids)) {
      const ins = db.prepare('INSERT INTO task_resources (task_id, resource_id) VALUES (?, ?)');
      for (const rid of resource_ids) {
        if (rid) ins.run(req.params.id, rid);
      }
    }

    schedule.rescheduleProject(Number(existing.project_id) || Number(project_id) || undefined, db);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    const deps = db.prepare(
      `SELECT d.*, t.name AS predecessor_name FROM dependencies d JOIN tasks t ON t.id = d.predecessor_id WHERE d.task_id = ?`
    ).all(req.params.id);
    const resources = db.prepare(
      `SELECT tr.*, r.name AS resource_name, r.role AS resource_role FROM task_resources tr JOIN resources r ON r.id = tr.resource_id WHERE tr.task_id = ?`
    ).all(req.params.id);
    res.json({ ...task, dependencies: deps, resources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/tasks/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ message: 'Tugas berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === DEPENDENCIES ===
app.get(`${API_PREFIX}/dependencies`, (req, res) => {
  try {
    const db = getDb();
    let query = 'SELECT d.*, t.name AS task_name, p.name AS predecessor_name FROM dependencies d JOIN tasks t ON t.id = d.task_id JOIN tasks p ON p.id = d.predecessor_id';
    const params = [];
    if (req.query.task_id) { query += ' WHERE d.task_id = ?'; params.push(Number(req.query.task_id)); }
    query += ' ORDER BY d.task_id, d.id';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/dependencies/:id`, (req, res) => {
  try {
    const db = getDb();
    const dep = db.prepare(
      `SELECT d.*, t.name AS task_name, p.name AS predecessor_name
       FROM dependencies d JOIN tasks t ON t.id = d.task_id JOIN tasks p ON p.id = d.predecessor_id
       WHERE d.id = ?`
    ).get(req.params.id);
    if (!dep) return res.status(404).json({ error: 'Dependensi tidak ditemukan' });
    res.json(dep);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/dependencies`, (req, res) => {
  try {
    const { task_id, predecessor_id, type, delay } = req.body;
    if (!task_id || !predecessor_id) {
      return res.status(400).json({ error: 'task_id dan predecessor_id wajib diisi' });
    }
    if (task_id === predecessor_id) {
      return res.status(400).json({ error: 'Tugas tidak boleh bergantung pada dirinya sendiri' });
    }
    const db = getDb();
    if (schedule.wouldCreateCycle(Number(task_id), Number(predecessor_id), db)) {
      return res.status(409).json({ error: 'Menambahkan dependensi ini akan membuat siklus' });
    }
    const stmt = db.prepare(
      'INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(
      Number(task_id),
      Number(predecessor_id),
      (type || 'FS').toUpperCase(),
      delay ? Number(delay) : 0
    );
    const dep = db.prepare(
      `SELECT d.*, t.name AS task_name, p.name AS predecessor_name FROM dependencies d JOIN tasks t ON t.id = d.task_id JOIN tasks p ON p.id = d.predecessor_id WHERE d.id = ?`
    ).get(info.lastInsertRowid);
    const pid = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(Number(task_id));
    schedule.rescheduleProject(pid?.project_id || undefined, db);
    res.status(201).json(dep);
  } catch (err) {
    if (err.message.includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'Tipe dependensi tidak valid. Gunakan FS, SS, FF, atau SF' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_PREFIX}/dependencies/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM dependencies WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Dependensi tidak ditemukan' });

    const { task_id, predecessor_id, type, delay } = req.body;
    db.prepare(
      `UPDATE dependencies SET
        task_id = ?, predecessor_id = ?, type = ?, delay = ?
      WHERE id = ?`
    ).run(
      task_id !== undefined ? Number(task_id) : existing.task_id,
      predecessor_id !== undefined ? Number(predecessor_id) : existing.predecessor_id,
      (type || 'FS').toUpperCase(),
      delay !== undefined ? (delay ? Number(delay) : 0) : existing.delay,
      req.params.id
    );
    const pid = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(existing.task_id);
    schedule.rescheduleProject(pid?.project_id || undefined, db);
    const dep = db.prepare(
      `SELECT d.*, t.name AS task_name, p.name AS predecessor_name FROM dependencies d JOIN tasks t ON t.id = d.task_id JOIN tasks p ON p.id = d.predecessor_id WHERE d.id = ?`
    ).get(req.params.id);
    res.json(dep);
  } catch (err) {
    if (err.message.includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'Tipe dependensi tidak valid. Gunakan FS, SS, FF, atau SF' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/dependencies/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM dependencies WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Dependensi tidak ditemukan' });
    db.prepare('DELETE FROM dependencies WHERE id = ?').run(req.params.id);
    const pid = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(existing.task_id);
    schedule.rescheduleProject(pid?.project_id || undefined, db);
    res.json({ message: 'Dependensi berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === RESOURCES ===
app.get(`${API_PREFIX}/resources`, (req, res) => {
  try {
    const db = getDb();
    let query = 'SELECT r.*, p.name AS project_name FROM resources r LEFT JOIN projects p ON p.id = r.project_id';
    const params = [];
    if (req.query.project_id) { query += ' WHERE r.project_id = ?'; params.push(Number(req.query.project_id)); }
    query += ' ORDER BY r.name';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/resources/:id`, (req, res) => {
  try {
    const db = getDb();
    const resource = db.prepare(
      `SELECT r.*, p.name AS project_name FROM resources r LEFT JOIN projects p ON p.id = r.project_id WHERE r.id = ?`
    ).get(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource tidak ditemukan' });
    const offs = db.prepare('SELECT * FROM day_offs WHERE resource_id = ? ORDER BY date ASC').all(resource.id);
    const tasks = db.prepare(
      `SELECT tr.*, t.name AS task_name, t.scheduled_start, t.scheduled_finish
       FROM task_resources tr JOIN tasks t ON t.id = tr.task_id WHERE tr.resource_id = ?`
    ).all(resource.id);
    res.json({ ...resource, day_offs: offs, tasks: tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/resources`, (req, res) => {
  try {
    const { name, project_id, phone, email, role, salary } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama resource wajib diisi' });
    }
    const db = getDb();
    const safe = (v, fallback) => (v !== undefined && v !== null && v !== '' ? v : fallback);
    const stmt = db.prepare(
      'INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(
      safe(project_id, null),
      name.trim(),
      safe(phone, null),
      safe(email, null),
      safe(role, null),
      safe(salary, null)
    );
    const resource = db.prepare(
      `SELECT r.*, p.name AS project_name FROM resources r LEFT JOIN projects p ON p.id = r.project_id WHERE r.id = ?`
    ).get(info.lastInsertRowid);
    res.status(201).json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_PREFIX}/resources/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Resource tidak ditemukan' });

    const { name, project_id, phone, email, role, salary } = req.body;
    db.prepare(
      `UPDATE resources SET
        project_id = ?, name = ?, phone = ?, email = ?, role = ?, salary = ?
      WHERE id = ?`
    ).run(
      project_id !== undefined ? (project_id || null) : existing.project_id,
      name !== undefined ? (name || null) : existing.name,
      phone !== undefined ? (phone || null) : existing.phone,
      email !== undefined ? (email || null) : existing.email,
      role !== undefined ? (role || null) : existing.role,
      salary !== undefined ? (salary || null) : existing.salary,
      req.params.id
    );
    const resource = db.prepare(
      `SELECT r.*, p.name AS project_name FROM resources r LEFT JOIN projects p ON p.id = r.project_id WHERE r.id = ?`
    ).get(req.params.id);
    res.json(resource);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/resources/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Resource tidak ditemukan' });
    db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
    res.json({ message: 'Resource berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === DAY OFFS ===
app.get(`${API_PREFIX}/day_offs`, (req, res) => {
  try {
    const db = getDb();
    let query = `SELECT dof.*, r.name AS resource_name FROM day_offs dof JOIN resources r ON r.id = dof.resource_id`;
    const params = [];
    if (req.query.resource_id) {
      query += ' WHERE dof.resource_id = ?';
      params.push(Number(req.query.resource_id));
    }
    query += ' ORDER BY dof.date ASC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/day_offs/:id`, (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT dof.*, r.name AS resource_name FROM day_offs dof JOIN resources r ON r.id = dof.resource_id WHERE dof.id = ?`
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Day off tidak ditemukan' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/day_offs`, (req, res) => {
  try {
    const { resource_id, date, description } = req.body;
    if (!resource_id || !date) {
      return res.status(400).json({ error: 'resource_id dan date wajib diisi' });
    }
    const db = getDb();
    const stmt = db.prepare('INSERT INTO day_offs (resource_id, date, description) VALUES (?, ?, ?)');
    const info = stmt.run(Number(resource_id), date, description || null);
    const row = db.prepare(
      `SELECT dof.*, r.name AS resource_name FROM day_offs dof JOIN resources r ON r.id = dof.resource_id WHERE dof.id = ?`
    ).get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Day off untuk resource dan tanggal ini sudah ada' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_PREFIX}/day_offs/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM day_offs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Day off tidak ditemukan' });

    const { resource_id, date, description } = req.body;
    db.prepare(
      `UPDATE day_offs SET resource_id = ?, date = ?, description = ? WHERE id = ?`
    ).run(
      resource_id !== undefined ? Number(resource_id) : existing.resource_id,
      date || existing.date,
      description !== undefined ? (description || null) : existing.description,
      req.params.id
    );
    const row = db.prepare(
      `SELECT dof.*, r.name AS resource_name FROM day_offs dof JOIN resources r ON r.id = dof.resource_id WHERE dof.id = ?`
    ).get(req.params.id);
    res.json(row);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Day off untuk resource dan tanggal ini sudah ada' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/day_offs/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM day_offs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Day off tidak ditemukan' });
    db.prepare('DELETE FROM day_offs WHERE id = ?').run(req.params.id);
    res.json({ message: 'Day off berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === TASK RESOURCES ===
app.get(`${API_PREFIX}/task_resources`, (req, res) => {
  try {
    const db = getDb();
    let query = `SELECT tr.*, t.name AS task_name, r.name AS resource_name FROM task_resources tr JOIN tasks t ON t.id = tr.task_id JOIN resources r ON r.id = tr.resource_id`;
    const params = [];
    if (req.query.task_id) { query += ' WHERE tr.task_id = ?'; params.push(Number(req.query.task_id)); }
    if (req.query.resource_id) {
      if (!params.length) query += ' WHERE ';
      else query += ' AND ';
      query += ' tr.resource_id = ?';
      params.push(Number(req.query.resource_id));
    }
    query += ' ORDER BY tr.id';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/task_resources/:id`, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM task_resources WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alokasi resource tidak ditemukan' });
    db.prepare('DELETE FROM task_resources WHERE id = ?').run(req.params.id);
    res.json({ message: 'Alokasi resource berhasil dihapus', id: Number(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === RESCHEDULE MANUAL (pakai jika perlu) ===
app.post(`${API_PREFIX}/reschedule/:project_id`, (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.project_id);
    if (!project) return res.status(404).json({ error: 'Proyek tidak ditemukan' });
    schedule.rescheduleProject(Number(req.params.project_id), db);
    res.json({ message: 'Jadwal dihitung ulang', project_id: Number(req.params.project_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === LOAD SAMPLE DATA ===
app.post(`${API_PREFIX}/sample/load`, (req, res) => {
  try {
    seedSampleData(getDb());
    res.json({ message: 'Data contoh berhasil dimuat ulang (idempoten)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === SEED FUNGSI (dipakai juga di inisialisasi otomatis) ===
function seedSampleDataLama(db) {
  db.exec('DELETE FROM task_resources');
  db.exec('DELETE FROM day_offs');
  db.exec('DELETE FROM dependencies');
  db.exec('DELETE FROM resources');
  db.exec('DELETE FROM project_weekends');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM holidays');
  db.exec('DELETE FROM projects');

  const today = new Date();
  const year = today.getFullYear();
  const toKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Proyek 1: Pengembangan Perangkat Lunak PT Xijet
  const p1 = db.prepare(
    'INSERT INTO projects (name, organization, website, description, weekends_off) VALUES (?,?,?,?,?)'
  ).run('Pengembangan Perangkat Lunak PT Xijet', 'PT Xijet Indonesia', 'https://xijet.co.id', 'Skenario SDLC dengan akhir pekan libur dan libur custom 17 Juli 2026', 1);
  db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(p1.lastInsertRowid, 1);

  db.prepare('INSERT INTO holidays (project_id, date, label, recurring) VALUES (?, ?, ?, ?)').run(p1.lastInsertRowid, `${year}-07-17`, 'Libur custom sekali', 0);

  // Tugas SDLC Proyek 1
  const tasks = [
    { name: 'Analisis Kebutuhan', dur: 5, color: '#E67E22', prio: 1 },
    { name: 'Analisis Sistem', dur: 4, color: '#F1C40F', prio: 1 },
    { name: 'Perancangan', dur: 6, color: '#2ECC71', prio: 1 },
    { name: 'Implementasi', dur: 7, color: '#3498DB', prio: 1 },
    { name: 'Pengujian', dur: 5, color: '#9B59B6', prio: 1 },
    { name: 'Deployment & Maintenance', dur: 4, color: '#34495E', prio: 1 },
  ];

  const insertT = db.prepare(
    'INSERT INTO tasks (project_id, name, start_date, duration_days, priority, color) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const taskIds = tasks.map(t => {
    const info = insertT.run(p1.lastInsertRowid, t.name, toKey(new Date(today.getFullYear(), 5, 30)), t.dur, t.prio, t.color);
    return info.lastInsertRowid;
  });

  // dependensi
  // Analysis Sistem (SS delay 3 dari Analisis Kebutuhan)
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(taskIds[1], taskIds[0], 'SS', 3);
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(taskIds[2], taskIds[1], 'SS', 5);
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(taskIds[3], taskIds[2], 'FS', 0);
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(taskIds[4], taskIds[3], 'FS', 0);
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(taskIds[5], taskIds[4], 'FS', 0);

  // 3 sub-tugas di Analisis Kebutuhan
  const subNames = ['Survei', 'Pengamatan', 'Wawancara'];
  const subIds = subNames.map(name => {
    const info = insertT.run(p1.lastInsertRowid, name, toKey(new Date(today.getFullYear(), 5, 30)), 2, 2, '#E67E22');
    return info.lastInsertRowid;
  });
  subIds.forEach(sid => db.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(taskIds[0], sid));

  // Resource proyek 1
  const r1 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Andi Perbowo', '081234567890', 'andi@xijet.co.id', 'Project Manager', '18000000');
  const r2 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Budi Seorang', '082111122233', 'budi@xijet.co.id', 'Project Analyst', '12000000');
  const r3 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Citra Laras', '083344455566', 'citra@xijet.co.id', 'Project Analyst', '13000000');
  const r4 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Doni Coding', '084455566677', 'doni@xijet.co.id', 'Programmer', '14000000');
  const r5 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Eka Ngoding', '085566677788', 'eka@xijet.co.id', 'Programmer', '14500000');
  const r6 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Fani Tes', '086677788899', 'fani@xijet.co.id', 'Tester', '11000000');
  const r7 = db.prepare('INSERT INTO resources (project_id, name, phone, email, role, salary) VALUES (?,?,?,?,?,?)').run(p1.lastInsertRowid, 'Gita Uji', '087788899900', 'gita@xijet.co.id', 'Tester', '11500000');

  // alokasi resource (contoh)
  const alloc = db.prepare('INSERT INTO task_resources (task_id, resource_id) VALUES (?, ?)');
  alloc.run(taskIds[0], r2.id); alloc.run(taskIds[0], r3.id); // analisis kebutuhan -> 2 analis
  alloc.run(taskIds[1], r3.id); // analisis sistem
  alloc.run(taskIds[2], r4.id); alloc.run(taskIds[2], r5.id); // perancangan
  alloc.run(taskIds[3], r4.id); alloc.run(taskIds[3], r5.id); // implementasi
  alloc.run(taskIds[4], r6.id); alloc.run(taskIds[4], r7.id); // pengujian
  alloc.run(taskIds[5], r1.id); // deployment

  // pastikan tabel task_resources ada (dibuat oleh db.js); jika tidak, buat ulang
  // NOTE: task_resources is created by db.js; no need to recreate here.

  // day off pribadi contoh
  db.prepare('INSERT INTO day_offs (resource_id, date, description) VALUES (?, ?, ?)').run(r2.id, toKey(new Date(today.getFullYear(), 6, 1)), 'Cuti pribadi');

  // Proyek 2: Contoh Critical Path
  const p2 = db.prepare(
    'INSERT INTO projects (name, organization, website, description, weekends_off) VALUES (?,?,?,?,?)'
  ).run('Contoh Critical Path', 'PT Demo', 'https://demo.co.id', 'Contoh jalur kritis dengan akhir pekan tetap kerja', 0);
  db.prepare('INSERT INTO project_weekends (project_id, weekends_off) VALUES (?, ?)').run(p2.lastInsertRowid, 0);

  const cp = [
    { name: 'A1-', dur: 2 },
    { name: 'B2-', dur: 2 },
    { name: 'C3-', dur: 3 },
    { name: 'D5(A)', dur: 5 },
    { name: 'E7(B)', dur: 7 },
    { name: 'F4(B)', dur: 4 },
    { name: 'G12(C)', dur: 12 },
    { name: 'H21(D,E)', dur: 21 },
    { name: 'I2(G)', dur: 2 },
    { name: 'J3(F,H,I)', dur: 3 },
  ];
  const cids = cp.map(t => {
    const info = insertT.run(p2.lastInsertRowid, t.name, toKey(new Date(today.getFullYear(), 5, 30)), t.dur, 1, '#4A90D9');
    return info.lastInsertRowid;
  });
  // FS 0
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[3], cids[0], 'FS', 0); // D5(A)
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[4], cids[1], 'FS', 0); // E7(B)
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[5], cids[1], 'FS', 0); // F4(B)
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[6], cids[2], 'FS', 0); // G12(C)
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[7], cids[3], 'FS', 0); // H21(D,E) dari D
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[7], cids[4], 'FS', 0); // H21(D,E) dari E
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[8], cids[6], 'FS', 0); // I2(G)
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[9], cids[5], 'FS', 0); // J3(F,H,I) dari F
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[9], cids[7], 'FS', 0); // dari H
  db.prepare('INSERT INTO dependencies (task_id, predecessor_id, type, delay) VALUES (?, ?, ?, ?)').run(cids[9], cids[8], 'FS', 0); // dari I

  // Jalankan penjadwalan
  schedule.rescheduleProject(p1.lastInsertRowid, db);
  schedule.rescheduleProject(p2.lastInsertRowid, db);
}

module.exports = app;
