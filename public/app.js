const API = '/api/v1';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ===== Toast =====
function toast(message, type = 'info', duration = 3500) {
  const stack = $('#toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-msg"></span><button class="toast-close" aria-label="Tutup">×</button>`;
  el.querySelector('.toast-msg').textContent = message;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  stack.appendChild(el);
  setTimeout(() => removeToast(el), duration);
}
function removeToast(el) {
  if (!el.parentNode) return;
  el.style.transition = 'opacity 0.2s, transform 0.2s';
  el.style.opacity = '0';
  el.style.transform = 'translateX(20px)';
  setTimeout(() => el.remove(), 220);
}
function apiError(err) {
  const msg = err?.responseJSON?.error || err?.message || 'Terjadi kesalahan pada server';
  toast(msg, 'error');
}

// ===== Sidebar / Routing =====
const panels = {
  projects: document.getElementById('panel-projects'),
  calendar: document.getElementById('panel-calendar'),
  tasks: document.getElementById('panel-tasks'),
  gantt: document.getElementById('panel-gantt'),
};
const titles = {
  projects: 'Proyek',
  calendar: 'Kalender Kerja',
  tasks: 'Tugas',
  gantt: 'Gantt Chart',
};

function goTo(name) {
  Object.entries(panels).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
  $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.panel === name));
  const t = $('#panel-title');
  if (t) t.textContent = titles[name] || name;
  if (name === 'projects') loadProjects();
  if (name === 'calendar') loadHolidays();
  if (name === 'tasks') loadTasks();
  if (name === 'gantt') renderGantt();
}
$$('.nav-item').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  goTo(a.dataset.panel);
}));

let currentPanel = 'projects';

// Responsive sidebar toggle
const sidebarToggle = $('#sidebar-toggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('change', () => {
    document.querySelector('.sidebar').classList.toggle('collapsed', sidebarToggle.checked);
    document.querySelector('.main').style.marginLeft = sidebarToggle.checked ? '0' : '';
  });
}

// ===== API helpers =====
async function get(path, params) {
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { responseJSON: body });
  }
  return res.json();
}
async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { responseJSON: j });
  }
  return res.json();
}
async function put(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { responseJSON: j });
  }
  return res.json();
}
async function del(path) {
  const res = await fetch(path, { method: 'DELETE' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || `HTTP ${res.status}`), { responseJSON: j });
  }
  return res.json();
}

// ===== Projects =====
const formProject = $('#form-project');
const tbodyProjects = $('#tbody-projects');
const emptyProjects = $('#empty-projects');
const projectCount = $('#project-count');

async function loadProjects() {
  try {
    const data = await get(`${API}/projects`);
    renderProjects(data);
  } catch (e) {
    apiError(e);
  }
}

function renderProjects(list) {
  if (!tbodyProjects) return;
  if (!list.length) {
    tbodyProjects.innerHTML = '';
    if (emptyProjects) emptyProjects.style.display = 'block';
    if (projectCount) projectCount.textContent = '0 proyek';
    return;
  }
  if (emptyProjects) emptyProjects.style.display = 'none';
  if (projectCount) projectCount.textContent = `${list.length} proyek`;
  tbodyProjects.innerHTML = list.map((p, i) => `
    <tr>
      <td class="col-id hide-mobile">${i + 1}</td>
      <td class="col-name">
        <div class="name-cell">
          <span class="name-primary">${esc(p.name)}</span>
          ${p.organization ? `<span class="name-sub">${esc(p.organization)}</span>` : ''}
        </div>
      </td>
      <td class="col-org hide-mobile">${esc(p.organization || '—')}</td>
      <td class="col-web wrap">${link(p.website)}</td>
      <td class="col-desc wrap">${esc(p.description || '—')}</td>
      <td class="col-actions align-end">
        <div class="actions">
          <button class="btn btn-ghost btn-icon edit-project" data-id="${p.id}" title="Ubah">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon delete-project" data-id="${p.id}" title="Hapus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbodyProjects.querySelectorAll('.edit-project').forEach(btn => {
    btn.addEventListener('click', () => editProject(Number(btn.dataset.id)));
  });
  tbodyProjects.querySelectorAll('.delete-project').forEach(btn => {
    btn.addEventListener('click', () => deleteProjectConfirm(Number(btn.dataset.id)));
  });
}

formProject.addEventListener('submit', async e => {
  e.preventDefault();
  const data = new FormData(formProject);
  const payload = {
    name: data.get('name'),
    organization: data.get('organization'),
    website: data.get('website'),
    description: data.get('description'),
  };
  try {
    const created = await post(`${API}/projects`, payload);
    toast(`Proyek "${created.name}" berhasil dibuat`, 'success');
    formProject.reset();
    loadProjects();
  } catch (err) {
    apiError(err);
    markFieldError(formProject, err);
  }
});

function editProject(id) {
  get(`${API}/projects/${id}`).then(p => {
    $('#p-name').value = p.name;
    $('#p-org').value = p.organization || '';
    $('#p-web').value = p.website || '';
    $('#p-desc').value = p.description || '';
    toast('Ubah proyek: ubah data lalu klik "Simpan Proyek"', 'info', 3000);
  }).catch(apiError);
}

async function deleteProjectConfirm(id) {
  if (!confirm('Hapus proyek ini? Tugas yang terkait akan kehilangan proyek (tidak dihapus).')) return;
  try {
    await del(`${API}/projects/${id}`);
    toast('Proyek berhasil dihapus', 'success');
    loadProjects();
  } catch (err) {
    apiError(err);
  }
}

// ===== Holidays =====
const formHoliday = $('#form-holiday');
const chkWeekend = $('#chk-weekend');
const tbodyHolidays = $('#tbody-holidays');
const emptyHolidays = $('#empty-holidays');
const holidayCount = $('#holiday-count');

async function loadHolidays() {
  try {
    const data = await get(`${API}/holidays`);
    renderHolidays(data);
  } catch (e) {
    apiError(e);
    renderHolidays([]);
  }
}

function renderHolidays(list) {
  if (!tbodyHolidays) return;
  if (!list || !list.length) {
    tbodyHolidays.innerHTML = '';
    if (emptyHolidays) emptyHolidays.style.display = 'block';
    if (holidayCount) holidayCount.textContent = '0 hari libur';
    return;
  }
  if (emptyHolidays) emptyHolidays.style.display = 'none';
  if (holidayCount) holidayCount.textContent = `${list.length} hari libur`;

  const rows = list.map((h, i) => `
    <tr data-id="${h.id}">
      <td class="col-id hide-mobile">${i + 1}</td>
      <td class="col-date">${h.date}</td>
      <td class="col-name">
        <span class="name-primary">${esc(h.label || '—')}</span>
      </td>
      <td class="col-name wrap">${h.recurring ? '<span class="tag tag-recurring">Berulang</span>' : 'Sekali'}</td>
      <td class="col-actions align-end">
        <div class="actions">
          <button class="btn btn-ghost btn-icon delete-holiday" data-id="${h.id}" title="Hapus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbodyHolidays.innerHTML = rows;

  tbodyHolidays.querySelectorAll('.delete-holiday').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await del(`${API}/holidays/${btn.dataset.id}`);
        toast('Hari libur dihapus', 'success');
        loadHolidays();
      } catch (err) {
        apiError(err);
      }
    });
  });
}

formHoliday.addEventListener('submit', async e => {
  e.preventDefault();
  const data = new FormData(formHoliday);
  const payload = {
    date: data.get('date'),
    label: data.get('label'),
    recurring: data.get('recurring') ? 1 : 0,
  };
  try {
    await post(`${API}/holidays`, payload);
    toast('Hari libur ditambahkan', 'success');
    formHoliday.reset();
    if (chkWeekend && chkWeekend.checked) ($('#h-recurring').checked = false);
    loadHolidays();
  } catch (err) {
    apiError(err);
  }
});

// Weekend toggle hint
const weekendToggleState = document.querySelector('.toggle-state');
if (chkWeekend && weekendToggleState) {
  chkWeekend.addEventListener('change', () => {
    weekendToggleState.textContent = chkWeekend.checked ? 'Aktif' : 'Nonaktif';
  });
}

// ===== Tasks =====
const formTask = $('#form-task');
const tbodyTasks = $('#tbody-tasks');
const emptyTasks = $('#empty-tasks');
const taskCount = $('#task-count');
const filterProject = $('#filter-project');
const tProject = $('#t-project');
const tParent = $('#t-parent');
const colorSwatch = $('#t-color-swatch');
const colorInput = $('#t-color');

async function loadTasks(opts = {}) {
  const params = {};
  if (opts.projectId) params.project_id = opts.projectId;
  try {
    const [tasks, projects] = await Promise.all([
      get(`${API}/tasks`, params),
      get(`${API}/projects`),
    ]);
    renderTasks(tasks, projects);
    populateSelects(tasks, projects);
  } catch (e) {
    apiError(e);
  }
}

function renderTasks(list, projects) {
  if (!tbodyTasks) return;
  if (!list || !list.length) {
    tbodyTasks.innerHTML = '';
    if (emptyTasks) emptyTasks.style.display = 'block';
    if (taskCount) taskCount.textContent = '0 tugas';
    return;
  }
  if (emptyTasks) emptyTasks.style.display = 'none';
  if (taskCount) taskCount.textContent = `${list.length} tugas`;

  const nameById = id => projects.find(p => p.id === id)?.name || '—';

  tbodyTasks.innerHTML = list.map((t, i) => `
    <tr>
      <td class="col-id hide-mobile">${i + 1}</td>
      <td class="col-name">
        <div class="name-cell">
          <span class="name-primary">${esc(t.name)}</span>
          ${t.parent_id ? `<span class="name-sub">sub-tugas</span>` : ''}
        </div>
      </td>
      <td class="col-date">${t.start_date}</td>
      <td class="col-num">${t.duration_days}</td>
      <td class="col-prio">
        <span class="prio-pill prio-${t.priority}">${prioLabel(t.priority)}</span>
      </td>
      <td class="col-color">
        <span class="color-dot" style="background:${t.color}"></span>
        <span class="hide-mobile">${t.color}</span>
      </td>
      <td class="col-parent wrap hide-mobile">${t.parent_id ? esc(nameById(t.parent_id)) : '—'}</td>
      <td class="col-actions align-end">
        <div class="actions">
          <button class="btn btn-ghost btn-icon edit-task" data-id="${t.id}" title="Ubah">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon delete-task" data-id="${t.id}" title="Hapus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  tbodyTasks.querySelectorAll('.edit-task').forEach(btn => {
    btn.addEventListener('click', () => editTask(Number(btn.dataset.id)));
  });
  tbodyTasks.querySelectorAll('.delete-task').forEach(btn => {
    btn.addEventListener('click', () => deleteTaskConfirm(Number(btn.dataset.id)));
  });
}

function populateSelects(tasks, projects) {
  // Project select di form tambah
  if (tProject) {
    const cur = tProject.value;
    tProject.innerHTML = '<option value="">— Tanpa proyek —</option>' +
      projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    tProject.value = cur;
  }

  // Parent select di form tambah
  if (tParent) {
    const roots = tasks.filter(t => !t.parent_id);
    const cur = tParent.value;
    tParent.innerHTML = '<option value="">— Tugas utama —</option>' +
      roots.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    tParent.value = cur;
  }
}

function editTask(id) {
  get(`${API}/tasks/${id}`).then(t => {
    $('#t-id').value = t.id;
    $('#t-name').value = t.name;
    $('#t-project').value = t.project_id || '';
    $('#t-start').value = t.start_date;
    $('#t-dur').value = t.duration_days;
    $('#t-prio').value = t.priority;
    $('#t-color').value = t.color;
    if (colorSwatch) colorSwatch.value = t.color;
    $('#t-parent').value = t.parent_id || '';
    $('#btn-save-task').textContent = 'Perbarui Tugas';
    toast('Form diisi untuk mengedit tugas. Ubah lalu klik "Perbarui Tugas"', 'info', 3500);
  }).catch(apiError);
}

formTask.addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('#t-id').value;
  const data = new FormData(formTask);
  const payload = {
    name: data.get('name'),
    project_id: data.get('project_id') || null,
    start_date: data.get('start_date'),
    duration_days: parseInt(data.get('duration_days'), 10) || 1,
    priority: parseInt(data.get('priority'), 10) || 1,
    color: data.get('color'),
    parent_id: data.get('parent_id') || null,
  };
  try {
    if (id) {
      await put(`${API}/tasks/${id}`, payload);
      toast('Tugas berhasil diperbarui', 'success');
    } else {
      await post(`${API}/tasks`, payload);
      toast('Tugas berhasil dibuat', 'success');
    }
    clearTaskForm();
    loadTasks();
  } catch (err) {
    apiError(err);
    markFieldError(formTask, err);
  }
});

function clearTaskForm() {
  formTask.reset();
  $('#t-id').value = '';
  $('#t-color').value = '#4A90D9';
  if (colorSwatch) colorSwatch.value = '#4A90D9';
  $('#btn-save-task').textContent = 'Simpan Tugas';
}

$('#btn-clear-task').addEventListener('click', clearTaskForm);

filterProject.addEventListener('change', () => {
  loadTasks({ projectId: filterProject.value || undefined });
});

// Color swatch sync
if (colorSwatch && colorInput) {
  colorSwatch.addEventListener('input', () => { colorInput.value = colorSwatch.value; });
  colorInput.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(colorInput.value)) {
      colorSwatch.value = colorInput.value;
    }
  });
}

async function deleteTaskConfirm(id) {
  if (!confirm('Hapus tugas ini? Sub-tugas di bawahnya juga akan terhapus.')) return;
  try {
    await del(`${API}/tasks/${id}`);
    toast('Tugas dihapus', 'success');
    loadTasks();
  } catch (err) {
    apiError(err);
  }
}

// ===== Refresh buttons =====
function wireRefresh(btnId, loader) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', loader);
}
wireRefresh('btn-refresh-projects', loadProjects);
wireRefresh('btn-refresh-holidays', loadHolidays);
wireRefresh('btn-refresh-tasks', () => loadTasks({ projectId: filterProject.value || undefined }));

// ===== Sample data =====
$('#btn-load-sample').addEventListener('click', async () => {
  const btn = $('#btn-load-sample');
  btn.disabled = true;
  btn.textContent = 'Memuat...';
  try {
    await post(`${API}/sample/load`);
    toast('Data contoh SDLC PT Xijet (30 Jun – 31 Jul) berhasil dimuat', 'success', 4000);
    loadProjects();
    loadHolidays();
    loadTasks();
    goTo('gantt');
  } catch (err) {
    apiError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Muat Data Contoh';
  }
});

// ===== Gantt =====
let ganttState = { zoom: 36, nameWidth: 220, tasks: [], holidays: [], projects: [] };
// hormati pengaturan akhir pekan proyek yang sedang difilter di Gantt (1 = Sabtu/Minggu libur)
let ganttWeekendsOff = 1;

function refreshGanttData() {
  return Promise.all([
    get(`${API}/tasks`),
    get(`${API}/holidays`),
    get(`${API}/projects`),
  ]).then(([tasks, holidays, projects]) => {
    ganttState.tasks = tasks;
    ganttState.holidays = holidays;
    ganttState.projects = projects;
  }).catch(e => {
    apiError(e);
    ganttState.tasks = [];
    ganttState.holidays = [];
    ganttState.projects = [];
  });
}

function renderGantt() {
  // Populate filter
  const sel = $('#gantt-project');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Semua proyek</option>' +
      ganttState.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    sel.value = cur;
  }

  refreshGanttData().then(() => {
    drawGantt();
  });
}

$('#gantt-project').addEventListener('change', drawGantt);
$('#btn-zoom-in').addEventListener('click', () => { ganttState.zoom = Math.min(60, ganttState.zoom + 6); drawGantt(); });
$('#btn-zoom-out').addEventListener('click', () => { ganttState.zoom = Math.max(10, ganttState.zoom - 6); drawGantt(); });
const ganttRange = $('#gantt-name-width');
if (ganttRange) {
  ganttRange.addEventListener('input', () => {
    ganttState.nameWidth = parseInt(ganttRange.value, 10);
    drawGantt();
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function prioLabel(p) {
  return { 3: 'Tinggi', 2: 'Sedang', 1: 'Rendah' }[p] || 'Sedang';
}

function link(url) {
  if (!url) return '—';
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  try { new URL(url); return `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`; } catch { return esc(url); }
}

function markFieldError(form, err) {
  // highlight first field generically
  const field = form.querySelector('input:not([type="hidden"]):not([type="color"]), textarea, select');
  if (field) field.classList.add('input-error');
  setTimeout(() => field && field.classList.remove('input-error'), 2500);
}

function isWeekend(d) {
  if (!ganttWeekendsOff) return false; // proyek dengan weekends_off=0 tetap kerja akhir pekan
  const day = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return day === 5 || day === 6; // Sat or Sun
}

function isHoliday(d, holidays) {
  // kunci tanggal lokal (getFullYear/getMonth/getDate), bukan toISOString
  // agar tidak bergeser satu hari di zona waktu UTC+
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return holidays.some(h => h.date === key);
}

function addWorkDays(start, days, holidays) {
  let current = new Date(start);
  let added = 0;
  while (added < days) {
    current.setDate(current.getDate() + 1);
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      added++;
    }
  }
  return current;
}

function taskEnd(task, holidays) {
  return addWorkDays(new Date(task.start_date + 'T00:00:00'), task.duration_days, holidays);
}

function dateRange(tasks, holidays) {
  if (!tasks.length) {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 3, 1);
    return [s, e];
  }
  let min = Infinity, max = -Infinity;
  tasks.forEach(t => {
    const s = new Date((t.scheduled_start || t.start_date) + 'T00:00:00').getTime();
    const e = t.scheduled_finish
      ? new Date(t.scheduled_finish + 'T00:00:00').getTime()
      : taskEnd(t, holidays).getTime();
    if (s < min) min = s;
    if (e > max) max = e;
  });
  // pad 2 hari kerja ke kiri/kanan
  let start = new Date(min);
  let end = new Date(max);
  let pad = 0;
  while (pad < 2) {
    start.setDate(start.getDate() - 1);
    if (!isWeekend(start) && !isHoliday(start, holidays)) pad++;
  }
  pad = 0;
  while (pad < 2) {
    end.setDate(end.getDate() + 1);
    if (!isWeekend(end) && !isHoliday(end, holidays)) pad++;
  }
  return [start, end];
}

function dayColumns(start, end, holidays) {
  const cols = [];
  const cur = new Date(start);
  while (cur <= end) {
    cols.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return cols;
}

function drawGantt() {
  const container = $('#gantt-container');
  const left = $('#gantt-left');
  const headerDays = $('#gantt-header-days');
  const grid = $('#gantt-grid');
  const bars = $('#gantt-bars');
  const emptyGantt = $('#empty-gantt');

  if (!container || !left || !headerDays || !grid || !bars) return;

  const projectFilter = ($('#gantt-project')?.value || '');
  let tasks = (ganttState.tasks || []).filter(t => !projectFilter || String(t.project_id) === projectFilter);

  // Aturan akhir pekan & hari libur disesuaikan proyek yang difilter
  const proj = projectFilter ? (ganttState.projects || []).find(p => String(p.id) === projectFilter) : null;
  ganttWeekendsOff = proj ? Number(proj.weekends_off ?? 1) : 1;
  const holidays = (ganttState.holidays || []).filter(h =>
    !projectFilter || h.project_id == null || String(h.project_id) === projectFilter
  );

  if (!tasks.length) {
    container.style.display = 'none';
    if (emptyGantt) emptyGantt.style.display = 'block';
    return;
  }
  if (emptyGantt) emptyGantt.style.display = 'none';
  container.style.display = '';

  const [rangeStart, rangeEnd] = dateRange(tasks, holidays);
  const days = dayColumns(rangeStart, rangeEnd, holidays);
  const nameWidth = ganttState.nameWidth;
  const cellWidth = ganttState.zoom;

  // Header hari tanpa spacer nama (kolom nama = flex sibling di kiri, hari mulai dari tepi wrap)
  headerDays.innerHTML = days.map((d, i) => {
      const cls = ['day-col'];
      const isW = isWeekend(d);
      const isH = isHoliday(d, holidays);
      if (isW) cls.push('weekend');
      if (isH) cls.push('holiday');
      if (isToday(d)) cls.push('today');
      return `<div class="${cls.join(' ')} day-col" style="width:${cellWidth}px">
        <div class="day-label">${formatDayShort(d)}</div>
      </div>`;
    }).join('');

  // Kolom nama kiri: samakan lebarnya dengan slider
  left.style.width = nameWidth + 'px';

  // Left column header
  const leftHeader = document.createElement('div');
  leftHeader.className = 'gantt-header-row';
  leftHeader.innerHTML = `<div class="bar" style="width:${nameWidth}px">Tugas</div>`;
  left.innerHTML = '';
  left.appendChild(leftHeader);

  // Urutan baris: tiap induk lalu sub-tugasnya (berkelompok & rapi)
  const roots = (tasks || []).filter(t => !t.parent_id);
  const ordered = [];
  const seen = new Set();
  roots.forEach(r => {
    ordered.push(r); seen.add(r.id);
    (tasks || [])
      .filter(t => t.parent_id === r.id)
      .sort((a, b) => String(a.scheduled_start || a.start_date).localeCompare(String(b.scheduled_start || b.start_date)))
      .forEach(s => { ordered.push(s); seen.add(s.id); });
  });
  (tasks || []).forEach(t => { if (!seen.has(t.id)) ordered.push(t); });

  function addLeftRow(t, indent) {
    const row = document.createElement('div');
    row.className = 'gantt-left row';
    row.dataset.id = t.id;
    row.innerHTML = `<div class="bar" style="padding-left:${12 + (indent || 0) * 16}px">
      <span class="indent"></span>
      <span class="name" title="${esc(t.name)}">${esc(t.name)}</span>
      <span class="prio-dot" style="background:${prioColor(t.priority)}"></span>
      <span class="color-swatch-inline" style="background:${t.color}"></span>
    </div>`;
    left.appendChild(row);
  }

  ordered.forEach(t => addLeftRow(t, t.parent_id ? 1 : 0));

  // Grid: satu baris per tugas — bersihkan dulu agar tidak menumpuk saat redraw,
  // dan bangun baris baru (bukan clone .gantt-left) agar selebar area hari.
  grid.innerHTML = '';
  ordered.forEach(t => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    row.dataset.id = t.id;

    const cells = document.createElement('div');
    cells.className = 'cells';
    days.forEach(d => {
      const cd = document.createElement('div');
      cd.className = 'day-cell';
      if (isWeekend(d)) cd.classList.add('weekend');
      if (isHoliday(d, holidays)) cd.classList.add('holiday');
      if (isToday(d)) cd.classList.add('today');
      cd.style.width = cellWidth + 'px';
      cells.appendChild(cd);
    });

    // --- Bar tugas: duduk DI barisnya sendiri, sejajar tanggalnya ---
    const s = new Date((t.scheduled_start || t.start_date) + 'T00:00:00');
    const e = t.scheduled_finish ? new Date(t.scheduled_finish + 'T00:00:00') : taskEnd(t, holidays);
    const startIdx = days.findIndex(d => d.getTime() === s.getTime());
    let endIdx = days.findIndex(d => d.getTime() === e.getTime());
    if (endIdx === -1) {
      endIdx = days.findIndex(d => d >= e) - 1;
      if (endIdx < 0) endIdx = 0;
    }
    if (startIdx >= 0) {
      const barX = startIdx * cellWidth;
      const barW = Math.max((endIdx - startIdx + 1) * cellWidth, cellWidth);

      const barEl = document.createElement('div');
      barEl.className = 'bar-el';
      barEl.style.left = barX + 'px';
      barEl.style.width = barW + 'px';
      barEl.style.background = t.color;
      barEl.title = `${t.name}: ${(t.scheduled_start || t.start_date)} s/d ${(t.scheduled_finish || '?')} (${t.duration_days} hari kerja)`;
      barEl.innerHTML = `<span class="bar-label">${esc(t.name)}</span>`;

      // Bar terlalu sempit untuk namanya -> tampilkan nama lengkap di samping bar
      const labelW = Math.ceil(String(t.name).length * 6.4) + 6;
      if (barW < labelW) {
        barEl.querySelector('.bar-label').textContent = '';
        const out = document.createElement('span');
        out.className = 'bar-out-label';
        out.textContent = t.name;
        out.style.left = (barX + barW + 6) + 'px';
        cells.appendChild(out);
      }
      cells.appendChild(barEl);
    }

    row.appendChild(cells);
    grid.appendChild(row);
  });

  // Legend (strip bawah di dalam #gantt-bars)
  bars.innerHTML = '';

  // Legend
  const legendColors = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#34495E', '#4A90D9'];
  const legend = document.createElement('div');
  legend.className = 'bar-legend';
  legend.innerHTML = '<span class="item"><span class="swatch" style="background:#fff7ed;border:1px solid #fed7aa"></span> Akhir pekan</span>' +
    '<span class="item"><span class="swatch" style="background:#fef2f2;border:1px solid #fecaca"></span> Hari libur</span>' +
    '<span class="item"><span class="swatch" style="background:rgba(79,70,229,0.12);border:1px solid #c7d2fe"></span> Hari ini</span>' +
    '<span style="flex:1"></span>' +
    legendColors.map(c => `<span class="item"><span class="swatch" style="background:${c}"></span></span>`).join('');
  bars.appendChild(legend);
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function formatDayShort(d) {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}
function prioColor(p) {
  return { 3: '#dc2626', 2: '#d97706', 1: '#64748b' }[p] || '#64748b';
}

// ===== Init =====
function init() {
  // Default panel
  goTo('projects');
  loadProjects();
  loadHolidays();
  loadTasks();
  renderGantt();

  // Wire sidebar toggle UI (if checkbox exists, hide by default on small screens via CSS).
  // We add a small style to auto-collapse on narrow viewports.
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 820px) {
      .sidebar { transform: translateX(-100%); position: fixed; top: 0; left: 0; bottom: 0; }
      .sidebar-toggle:checked ~ .sidebar { transform: translateX(0); }
      .main { margin-left: 0 !important; }
      .sidebar-toggle:checked ~ .main { margin-left: 0; }
    }
  `;
  document.head.appendChild(style);

  // Click outside to close mobile sidebar
  document.addEventListener('click', e => {
    if (window.innerWidth > 820) return;
    const sidebar = document.querySelector('.sidebar');
    const toggle = $('#sidebar-toggle');
    if (!toggle.checked) return;
    if (!sidebar.contains(e.target) && !e.target.closest('.sidebar-toggle')) {
      toggle.checked = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
