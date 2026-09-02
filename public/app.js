/**
 * EduPage nampm.edupage.org Explorer Frontend Application
 * Presidential School in Namangan
 */

// Global Application State
const state = {
  timetableData: null,
  filterMode: 'class', // 'class', 'teacher', or 'classroom'
  selectedEntityId: null,
  activeDayFilter: 'all',
  searchQuery: '',
  currentVersion: '13',
  dailyData: null,
  newsData: null,
  substitutionData: null,
  substMode: 'classes', // 'classes' or 'teachers'
  substDate: '2026-09-02',
  directoryTab: 'teachers',
  directorySearchQuery: '',
  cachedTimetables: {}
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  setupEventListeners();
  await loadTimetable('13');
  loadNewsFeed();
  loadDailyScheduleClasses();
  loadSubstitution();
  renderDirectory();
});

// Live Tashkent Clock (UTC+5)
function initClock() {
  const clockEl = document.getElementById('live-clock');
  function updateTime() {
    try {
      const now = new Date();
      const tashkentTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tashkent',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(now);
      if (clockEl) clockEl.textContent = `Tashkent Time: ${tashkentTime} (UTC+5)`;
    } catch (e) {
      if (clockEl) clockEl.textContent = `Tashkent Time: ${new Date().toLocaleTimeString()} (UTC+5)`;
    }
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// Setup Event Listeners
function setupEventListeners() {
  const searchInput = document.getElementById('schedule-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderGrid();
    });
  }

  const dirSearchInput = document.getElementById('directory-search-input');
  if (dirSearchInput) {
    dirSearchInput.addEventListener('input', (e) => {
      state.directorySearchQuery = e.target.value.toLowerCase().trim();
      renderDirectory();
    });
  }

  const entitySelect = document.getElementById('entity-select');
  if (entitySelect) {
    entitySelect.addEventListener('change', (e) => {
      state.selectedEntityId = e.target.value;
      renderGrid();
    });
  }

  const versionSelect = document.getElementById('version-select');
  if (versionSelect) {
    versionSelect.addEventListener('change', async (e) => {
      state.currentVersion = e.target.value;
      await loadTimetable(state.currentVersion);
    });
  }

  const substDateInput = document.getElementById('subst-date-input');
  if (substDateInput) {
    substDateInput.addEventListener('change', (e) => {
      state.substDate = e.target.value;
      loadSubstitution();
    });
  }

  // API Playground live cURL generation
  const endpointInput = document.getElementById('api-endpoint');
  const payloadInput = document.getElementById('api-payload');
  if (endpointInput && payloadInput) {
    const updateCurl = () => {
      const ep = endpointInput.value.trim();
      const payload = payloadInput.value.trim().replace(/\n/g, '');
      const curl = `curl -X POST "https://nampm.edupage.org${ep}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"__args":${payload},"__gsh":"00000000"}'`;
      const curlEl = document.getElementById('snippet-curl');
      if (curlEl) curlEl.textContent = curl;
    };
    endpointInput.addEventListener('input', updateCurl);
    payloadInput.addEventListener('input', updateCurl);
  }
}

// ============================================================================
// Navigation Tabs
// ============================================================================
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-sm');
    el.classList.add('text-slate-600');
  });

  const activeContent = document.getElementById(`tab-content-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-sm');
    activeBtn.classList.remove('text-slate-600');
  }

  if (tabId === 'directory') {
    renderDirectory();
  } else if (tabId === 'substitution' && !state.substitutionData) {
    loadSubstitution();
  }
}

// ============================================================================
// Data Loading & Management
// ============================================================================
async function loadTimetable(ttNum = '13') {
  showLoadingGrid();

  try {
    let data = null;

    // Try live server API first
    try {
      const res = await fetch(`/api/timetable/${ttNum}`);
      if (res.ok) {
        data = await res.json();
      }
    } catch (netErr) {
      console.warn('Live API request failed, checking snapshot fallback...', netErr);
    }

    // Fallback to static snapshot if running on file:// or server offline
    if (!data && ttNum === '13') {
      const fallbackRes = await fetch('snapshot-13.json');
      if (fallbackRes.ok) {
        data = await fallbackRes.json();
      }
    }

    if (!data) {
      throw new Error(`Could not load timetable data for version ${ttNum}`);
    }

    state.timetableData = data;
    state.cachedTimetables[ttNum] = data;

    updateKPIs(data.stats);
    populateEntityDropdown();
    renderGrid();
    renderDirectory();
  } catch (err) {
    console.error('Error loading timetable:', err);
    showErrorGrid(`Failed to load timetable: ${err.message}`);
  }
}

// Update Top KPI Metrics
function updateKPIs(stats = {}) {
  if (!stats) return;
  const classesEl = document.getElementById('stat-classes');
  const teachersEl = document.getElementById('stat-teachers');
  const subjectsEl = document.getElementById('stat-subjects');
  const roomsEl = document.getElementById('stat-rooms');
  const lessonsEl = document.getElementById('stat-lessons');
  const cardsEl = document.getElementById('stat-cards');

  if (classesEl) classesEl.textContent = stats.totalClasses || 14;
  if (teachersEl) teachersEl.textContent = stats.totalTeachers || 36;
  if (subjectsEl) subjectsEl.textContent = stats.totalSubjects || 39;
  if (roomsEl) roomsEl.textContent = stats.totalClassrooms || 20;
  if (lessonsEl) lessonsEl.textContent = stats.totalLessons || 222;
  if (cardsEl) cardsEl.textContent = stats.totalCards || 434;
}

// ============================================================================
// Timetable Filtering & Rendering (Class, Teacher, Classroom)
// ============================================================================
function setFilterMode(mode) {
  state.filterMode = mode;
  state.selectedEntityId = null;

  const btnClass = document.getElementById('mode-btn-class');
  const btnTeacher = document.getElementById('mode-btn-teacher');
  const btnClassroom = document.getElementById('mode-btn-classroom');

  [btnClass, btnTeacher, btnClassroom].forEach(b => {
    if (b) {
      b.className = 'px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900';
    }
  });

  const activeBtn = mode === 'class' ? btnClass : (mode === 'teacher' ? btnTeacher : btnClassroom);
  if (activeBtn) {
    activeBtn.className = 'px-3 py-1 rounded-md text-xs font-semibold bg-white text-blue-600 shadow-sm';
  }

  populateEntityDropdown();
  renderGrid();
}

function populateEntityDropdown() {
  const select = document.getElementById('entity-select');
  if (!select || !state.timetableData) return;

  select.innerHTML = '';
  let items = [];

  if (state.filterMode === 'class') {
    items = (state.timetableData.classes || []).map(c => ({ id: c.id, name: `Class: ${c.name}` }));
  } else if (state.filterMode === 'teacher') {
    items = (state.timetableData.teachers || []).map(t => ({ id: t.id, name: `Teacher: ${t.name || t.short}` }));
    items.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.filterMode === 'classroom') {
    items = (state.timetableData.classrooms || []).map(r => ({ id: r.id, name: `Room: ${r.name}` }));
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    select.appendChild(opt);
  });

  if (items.length > 0) {
    if (!state.selectedEntityId || !items.find(i => i.id === state.selectedEntityId)) {
      state.selectedEntityId = items[0].id;
    }
    select.value = state.selectedEntityId;
  }
}

function filterDay(day) {
  state.activeDayFilter = day;
  document.querySelectorAll('.day-filter-btn').forEach(btn => {
    if (btn.getAttribute('data-day') === day) {
      btn.className = 'day-filter-btn px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white';
    } else {
      btn.className = 'day-filter-btn px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700';
    }
  });
  renderGrid();
}

function renderGrid() {
  const tbody = document.getElementById('timetable-grid-body');
  const titleEl = document.getElementById('grid-header-title');
  const subtitleEl = document.getElementById('grid-header-subtitle');

  if (!tbody || !state.timetableData) return;

  const data = state.timetableData;
  const days = data.days || [
    { id: '0', name: 'Monday', short: 'Mo' },
    { id: '1', name: 'Tuesday', short: 'Tu' },
    { id: '2', name: 'Wednesday', short: 'We' },
    { id: '3', name: 'Thursday', short: 'Th' },
    { id: '4', name: 'Friday', short: 'Fr' }
  ];

  let gridData = {};
  let currentEntity = null;

  if (state.filterMode === 'class') {
    gridData = data.classGrid?.[state.selectedEntityId] || {};
    currentEntity = (data.classes || []).find(c => c.id === state.selectedEntityId);
    if (titleEl) titleEl.textContent = `Schedule for Class ${currentEntity?.name || ''}`;
    if (subtitleEl) subtitleEl.textContent = `Homeroom: ${currentEntity?.homeroomTeacherName || 'Unassigned'} • ${currentEntity?.weeklyLessons || 0} lessons/week`;
  } else if (state.filterMode === 'teacher') {
    gridData = data.teacherGrid?.[state.selectedEntityId] || {};
    currentEntity = (data.teachers || []).find(t => t.id === state.selectedEntityId);
    if (titleEl) titleEl.textContent = `Schedule for ${currentEntity?.name || currentEntity?.short || 'Teacher'}`;
    const hrText = currentEntity?.homeroomClass ? ` • Class Teacher of ${currentEntity.homeroomClass}` : '';
    if (subtitleEl) subtitleEl.textContent = `Faculty Workload: ${currentEntity?.weeklyLessons || 0} periods/week${hrText}`;
  } else if (state.filterMode === 'classroom') {
    gridData = data.classroomGrid?.[state.selectedEntityId] || {};
    currentEntity = (data.classrooms || []).find(r => r.id === state.selectedEntityId);
    if (titleEl) titleEl.textContent = `Schedule for Room ${currentEntity?.name || ''}`;
    if (subtitleEl) subtitleEl.textContent = `Room Occupancy: ${currentEntity?.bookedSlots || 0}/35 slots (${currentEntity?.utilizationRate || 0}% utilization)`;
  }

  tbody.innerHTML = '';

  const daysToRender = state.activeDayFilter === 'all'
    ? days
    : days.filter(d => d.id === state.activeDayFilter);

  daysToRender.forEach(day => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 transition border-b border-slate-200';

    // Day label cell
    const thDay = document.createElement('th');
    thDay.className = 'p-3 font-semibold text-slate-800 bg-slate-50 border-r border-slate-200 text-center w-32';
    thDay.innerHTML = `
      <div class="text-sm font-bold">${day.name}</div>
      <div class="text-[11px] text-slate-400 font-normal uppercase tracking-wider">${day.short}</div>
    `;
    tr.appendChild(thDay);

    // Periods 1 through 7
    for (let period = 1; period <= 7; period++) {
      const td = document.createElement('td');
      td.className = 'p-2 border-r border-slate-200 align-top min-w-[120px] max-w-[180px]';
      if (period === 7) td.className = 'p-2 align-top min-w-[120px] max-w-[180px]';

      const items = gridData[day.id]?.[period] || [];

      // Filter by search query
      const filteredItems = items.filter(item => {
        if (!state.searchQuery) return true;
        const q = state.searchQuery;
        const sName = (item.subject?.name || '').toLowerCase();
        const tNames = (item.teachers || []).map(t => t.name.toLowerCase()).join(' ');
        const cNames = (item.classes || []).map(c => c.name.toLowerCase()).join(' ');
        const rNames = (item.classrooms || []).map(r => r.name.toLowerCase()).join(' ');
        return sName.includes(q) || tNames.includes(q) || cNames.includes(q) || rNames.includes(q);
      });

      if (filteredItems.length > 0) {
        const stack = document.createElement('div');
        stack.className = 'space-y-1.5';

        filteredItems.forEach(item => {
          const card = document.createElement('div');
          const bgColor = item.subject?.color || '#3b82f6';

          let subText = '';
          if (state.filterMode === 'class') {
            const tNames = item.teachers.map(t => t.short).join(', ') || 'Staff';
            const rNames = item.classrooms.map(r => r.short).join(', ') || 'TBD';
            subText = `${tNames} • <span class="font-bold text-slate-800">${rNames}</span>`;
          } else if (state.filterMode === 'teacher') {
            const cNames = item.classes.map(c => c.short).join(', ') || 'Class';
            const rNames = item.classrooms.map(r => r.short).join(', ') || 'TBD';
            subText = `<span class="font-bold text-blue-700">${cNames}</span> • ${rNames}`;
          } else if (state.filterMode === 'classroom') {
            const cNames = item.classes.map(c => c.short).join(', ') || 'Class';
            const tNames = item.teachers.map(t => t.short).join(', ') || 'Staff';
            subText = `<span class="font-bold text-blue-700">${cNames}</span> • ${tNames}`;
          }

          card.className = 'lesson-card p-2 rounded-lg text-xs border border-slate-200/80 bg-white cursor-pointer relative overflow-hidden shadow-xs hover:shadow-md transition';
          card.innerHTML = `
            <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background-color: ${bgColor}"></div>
            <div class="pl-1.5">
              <div class="font-bold text-slate-900 truncate" title="${item.subject.name}">${item.subject.name}</div>
              <div class="text-[11px] text-slate-500 mt-0.5 truncate">${subText}</div>
            </div>
          `;

          card.onclick = () => openLessonModal(item, period, day.name);
          stack.appendChild(card);
        });

        td.appendChild(stack);
      } else {
        td.innerHTML = `<div class="h-10 flex items-center justify-center text-slate-200 text-xs font-mono select-none">—</div>`;
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

function showLoadingGrid() {
  const tbody = document.getElementById('timetable-grid-body');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400">Loading schedule data...</td></tr>`;
  }
}

function showErrorGrid(msg) {
  const tbody = document.getElementById('timetable-grid-body');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-rose-500 font-medium">${msg}</td></tr>`;
  }
}

// Modal Inspector for Scheduled Lessons
function openLessonModal(item, periodNumber, dayName) {
  const modal = document.getElementById('lesson-modal');
  if (!modal) return;

  const header = document.getElementById('modal-header');
  const subjectTag = document.getElementById('modal-subject-tag');
  const subjectName = document.getElementById('modal-subject-name');
  const teacherVal = document.getElementById('modal-teacher');
  const classroomVal = document.getElementById('modal-classroom');
  const classVal = document.getElementById('modal-class');
  const timeVal = document.getElementById('modal-time');
  const lessonIdVal = document.getElementById('modal-lesson-id');
  const cardIdVal = document.getElementById('modal-card-id');

  const periodMap = {
    1: '08:30 – 09:15',
    2: '09:20 – 10:05',
    3: '10:10 – 10:55',
    4: '11:25 – 12:10',
    5: '12:15 – 13:00',
    6: '14:00 – 14:45',
    7: '14:50 – 15:35'
  };

  if (header) header.style.backgroundColor = item.subject.color || '#2563eb';
  if (subjectTag) subjectTag.textContent = `Course • ${item.subject.short || 'ID: ' + item.subject.id}`;
  if (subjectName) subjectName.textContent = item.subject.name;

  if (teacherVal) teacherVal.textContent = item.teachers.map(t => t.name || t.short).join(', ') || 'Not Assigned';
  if (classroomVal) classroomVal.textContent = item.classrooms.map(r => r.name).join(', ') || 'General Classroom';
  if (classVal) classVal.textContent = item.classes.map(c => c.name).join(', ') || 'All Groups';
  if (timeVal) timeVal.textContent = `${dayName}, Period ${periodNumber} (${periodMap[periodNumber] || ''})`;

  if (lessonIdVal) lessonIdVal.textContent = item.lessonId || 'N/A';
  if (cardIdVal) cardIdVal.textContent = item.cardId || 'N/A';

  modal.showModal();
}

function closeLessonModal() {
  const modal = document.getElementById('lesson-modal');
  if (modal) modal.close();
}

// JSON Export
function exportTimetableJson() {
  if (!state.timetableData) return;
  const blob = new Blob([JSON.stringify(state.timetableData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nampm_timetable_v${state.currentVersion}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// TAB 2: LIVE SUBSTITUTION MODULE (/substitution/)
// ============================================================================
async function loadSubstitution() {
  const container = document.getElementById('subst-render-container');
  const dateInput = document.getElementById('subst-date-input');
  if (!container) return;

  const targetDate = dateInput ? dateInput.value : state.substDate;
  state.substDate = targetDate;
  const mode = state.substMode || 'classes';

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center text-center p-8 space-y-2">
      <div class="animate-spin text-2xl">⏳</div>
      <div class="text-sm font-semibold text-slate-700">Querying EduPage Substitution API for ${targetDate}...</div>
      <div class="text-xs text-slate-400">Endpoint: /substitution/server/viewer.js?__func=getSubstViewerDayDataHtml</div>
    </div>
  `;

  try {
    let substHtml = null;
    let hasSubst = false;

    try {
      const res = await fetch(`/api/substitution?date=${targetDate}&mode=${mode}`);
      if (res.ok) {
        const json = await res.json();
        substHtml = json.html;
        hasSubst = json.hasSubstitution;
        state.substitutionData = json;
      }
    } catch (apiErr) {
      console.warn('API substitution request failed, attempting direct format...', apiErr);
    }

    if (!substHtml) {
      substHtml = `
        <div class="section">
          <div class="rows">
            <div class="row nosubst">
              <span class="text-emerald-700">✓ There is no substitution defined for ${targetDate}.</span>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Report Date:</span>
            <span class="font-mono text-sm font-bold text-slate-900">${targetDate}</span>
            <span class="text-xs px-2 py-0.5 rounded-full ${hasSubst ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800 font-semibold'}">
              ${hasSubst ? '⚠️ Substitutions Scheduled' : '✓ Normal Schedule (No Substitutions)'}
            </span>
          </div>
          <span class="text-xs text-slate-400">Grouping: ${mode === 'classes' ? 'By Classes' : 'By Teachers'}</span>
        </div>
        <div class="subst-report-body overflow-x-auto">
          ${substHtml}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="p-6 text-center text-rose-600 space-y-2">
        <div class="text-xl">⚠️</div>
        <div class="font-bold text-sm">Failed to load substitution report</div>
        <div class="text-xs text-slate-500">${err.message}</div>
      </div>
    `;
  }
}

function setSubstMode(mode) {
  state.substMode = mode;
  const btnClasses = document.getElementById('subst-mode-classes');
  const btnTeachers = document.getElementById('subst-mode-teachers');

  if (mode === 'classes') {
    if (btnClasses) btnClasses.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white shadow-xs';
    if (btnTeachers) btnTeachers.className = 'px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
  } else {
    if (btnClasses) btnClasses.className = 'px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
    if (btnTeachers) btnTeachers.className = 'px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white shadow-xs';
  }

  loadSubstitution();
}

function setSubstDateToday() {
  const dateInput = document.getElementById('subst-date-input');
  const today = '2026-09-02';
  if (dateInput) dateInput.value = today;
  state.substDate = today;
  loadSubstitution();
}

function setSubstDateRelative(deltaDays) {
  const dateInput = document.getElementById('subst-date-input');
  if (!dateInput) return;
  const cur = new Date(dateInput.value || '2026-09-02');
  cur.setDate(cur.getDate() + deltaDays);
  const nextDateStr = cur.toISOString().slice(0, 10);
  dateInput.value = nextDateStr;
  state.substDate = nextDateStr;
  loadSubstitution();
}

// ============================================================================
// TAB 3: SCHOOL DIRECTORY & ENTITY EXPLORER
// ============================================================================
function switchDirectoryTab(subTab) {
  state.directoryTab = subTab;
  document.querySelectorAll('.dirtab-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-white', 'text-blue-600', 'font-semibold', 'shadow-xs');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById(`dirtab-${subTab}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'font-semibold', 'shadow-xs');
    activeBtn.classList.remove('text-slate-600');
  }

  renderDirectory();
}

function renderDirectory() {
  const container = document.getElementById('directory-content-container');
  if (!container || !state.timetableData) return;

  const q = (state.directorySearchQuery || '').toLowerCase();
  const subTab = state.directoryTab || 'teachers';

  if (subTab === 'teachers') {
    const teachers = (state.timetableData.teachers || []).filter(t => {
      const name = (t.name || t.short || '').toLowerCase();
      const subs = (t.subjects || []).join(' ').toLowerCase();
      const cls = (t.classes || []).join(' ').toLowerCase();
      return name.includes(q) || subs.includes(q) || cls.includes(q);
    });

    teachers.sort((a, b) => (a.name || a.short).localeCompare(b.name || b.short));

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        ${teachers.map(t => {
          const hrBadge = t.homeroomClass
            ? `<span class="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Class Teacher: ${t.homeroomClass}</span>`
            : '';
          const subjects = (t.subjects || []).slice(0, 4).map(s => `
            <span class="bg-slate-100 text-slate-700 text-[10px] font-medium px-1.5 py-0.5 rounded">${s}</span>
          `).join('');

          return `
            <div class="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition flex flex-col justify-between space-y-3">
              <div class="space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center space-x-2">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${t.color || '#3b82f6'}"></span>
                    <h3 class="font-bold text-slate-900 text-sm leading-tight">${t.name || t.short}</h3>
                  </div>
                  ${hrBadge}
                </div>
                <div class="text-xs text-slate-500 font-medium">Workload: <strong class="text-slate-800">${t.weeklyLessons || 0}</strong> periods / week</div>
                <div class="flex flex-wrap gap-1 pt-1">${subjects}</div>
              </div>
              <button onclick="viewEntitySchedule('teacher', '${t.id}')" class="w-full py-1.5 px-3 bg-slate-50 hover:bg-blue-50 text-blue-600 hover:text-blue-700 text-xs font-semibold rounded-lg border border-slate-200 transition text-center">
                View Weekly Schedule ↗
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (subTab === 'classes') {
    const classes = (state.timetableData.classes || []).filter(c => {
      return (c.name || '').toLowerCase().includes(q) || (c.homeroomTeacherName || '').toLowerCase().includes(q);
    });

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        ${classes.map(c => `
          <div class="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition flex flex-col justify-between space-y-3">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2">
                  <span class="w-3 h-3 rounded-full" style="background-color: ${c.color || '#3b82f6'}"></span>
                  <h3 class="font-bold text-slate-900 text-base">Class ${c.name}</h3>
                </div>
                <span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">${c.weeklyLessons || 0} hrs/wk</span>
              </div>
              <div class="text-xs text-slate-600">
                <span class="text-slate-400">Homeroom Teacher:</span> <strong class="text-slate-800">${c.homeroomTeacherName || 'Unassigned'}</strong>
              </div>
            </div>
            <button onclick="viewEntitySchedule('class', '${c.id}')" class="w-full py-1.5 px-3 bg-slate-50 hover:bg-blue-50 text-blue-600 hover:text-blue-700 text-xs font-semibold rounded-lg border border-slate-200 transition text-center">
              View Class Timetable ↗
            </button>
          </div>
        `).join('')}
      </div>
    `;
  } else if (subTab === 'classrooms') {
    const rooms = (state.timetableData.classrooms || []).filter(r => {
      return (r.name || '').toLowerCase().includes(q);
    });

    rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        ${rooms.map(r => {
          const util = r.utilizationRate || 0;
          let utilColor = 'bg-emerald-500';
          if (util > 75) utilColor = 'bg-rose-500';
          else if (util > 50) utilColor = 'bg-amber-500';

          return `
            <div class="p-4 rounded-xl border border-slate-200 bg-white hover:border-purple-300 hover:shadow-sm transition flex flex-col justify-between space-y-3">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center space-x-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${r.color || '#a855f7'}"></span>
                    <h3 class="font-bold text-slate-900 text-base">Room ${r.name}</h3>
                  </div>
                  <span class="text-xs font-mono text-slate-500 font-semibold">${r.bookedSlots || 0}/35</span>
                </div>
                <div class="space-y-1">
                  <div class="flex justify-between text-[11px] text-slate-500">
                    <span>Weekly Utilization</span>
                    <span class="font-bold text-slate-700">${util}%</span>
                  </div>
                  <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div class="${utilColor} h-1.5 rounded-full" style="width: ${Math.min(util, 100)}%"></div>
                  </div>
                </div>
              </div>
              <button onclick="viewEntitySchedule('classroom', '${r.id}')" class="w-full py-1.5 px-3 bg-slate-50 hover:bg-purple-50 text-purple-600 hover:text-purple-700 text-xs font-semibold rounded-lg border border-slate-200 transition text-center">
                View Room Schedule ↗
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else if (subTab === 'subjects') {
    const subjects = (state.timetableData.subjects || []).filter(s => {
      return (s.name || '').toLowerCase().includes(q) || (s.short || '').toLowerCase().includes(q);
    });

    subjects.sort((a, b) => a.name.localeCompare(b.name));

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${subjects.map(s => `
          <div class="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between space-x-3">
            <div class="flex items-center space-x-2.5 min-w-0">
              <span class="w-3.5 h-3.5 rounded-md flex-shrink-0" style="background-color: ${s.color || '#3b82f6'}"></span>
              <div class="truncate">
                <div class="font-bold text-slate-900 text-xs truncate" title="${s.name}">${s.name}</div>
                <div class="text-[11px] font-mono text-slate-400 uppercase">${s.short || 'N/A'}</div>
              </div>
            </div>
            <span class="text-xs font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 flex-shrink-0">
              ${s.totalLessons || 0} periods
            </span>
          </div>
        `).join('')}
      </div>
    `;
  } else if (subTab === 'bells') {
    const bells = [
      { p: 'Period 1', time: '08:30 – 09:15', breakAfter: '5 min break (09:15 – 09:20)' },
      { p: 'Period 2', time: '09:20 – 10:05', breakAfter: '5 min break (10:05 – 10:10)' },
      { p: 'Period 3', time: '10:10 – 10:55', breakAfter: '30 min Morning Recess (10:55 – 11:25)', isLongBreak: true },
      { p: 'Period 4', time: '11:25 – 12:10', breakAfter: '5 min break (12:10 – 12:15)' },
      { p: 'Period 5', time: '12:15 – 13:00', breakAfter: '60 min Lunch & Recreation (13:00 – 14:00)', isLunch: true },
      { p: 'Period 6', time: '14:00 – 14:45', breakAfter: '5 min break (14:45 – 14:50)' },
      { p: 'Period 7', time: '14:50 – 15:35', breakAfter: 'End of Academic Day' }
    ];

    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-3">
        ${bells.map(b => `
          <div class="p-4 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div class="flex items-center space-x-3">
              <span class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-sm">
                ${b.p.replace('Period ', '')}
              </span>
              <div>
                <div class="font-bold text-slate-900 text-sm">${b.p}</div>
                <div class="text-xs font-mono text-slate-500">${b.time}</div>
              </div>
            </div>
            <div class="text-xs font-medium ${b.isLunch ? 'bg-amber-100 text-amber-900 font-bold px-3 py-1 rounded-full' : (b.isLongBreak ? 'bg-blue-100 text-blue-900 font-bold px-3 py-1 rounded-full' : 'text-slate-500')}">
              ${b.breakAfter}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function viewEntitySchedule(mode, id) {
  switchTab('timetable');
  setFilterMode(mode);
  state.selectedEntityId = id;
  const select = document.getElementById('entity-select');
  if (select) select.value = id;
  renderGrid();
}

// ============================================================================
// TAB 4: DAILY SCHEDULE (curentttGetData)
// ============================================================================
function loadDailyScheduleClasses() {
  const select = document.getElementById('daily-class-select');
  if (!select) return;

  const defaultClasses = [
    { id: '-17', name: '5-Blue' },
    { id: '-18', name: '5-Green' },
    { id: '-15', name: '6-Blue' },
    { id: '-16', name: '6-Green' },
    { id: '-1', name: '7-Blue' },
    { id: '-3', name: '7-Green' },
    { id: '-2', name: '8-Blue' },
    { id: '-4', name: '8-Green' },
    { id: '-10', name: '9-Blue' },
    { id: '-12', name: '9-Green' },
    { id: '-11', name: '10-Blue' },
    { id: '-13', name: '10-Green' },
    { id: '-14', name: '11-Blue' },
    { id: '-19', name: '11-Green' }
  ];

  select.innerHTML = '';
  defaultClasses.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

async function fetchDailySchedule() {
  const classSelect = document.getElementById('daily-class-select');
  const dateInput = document.getElementById('daily-date-input');
  const resultsContainer = document.getElementById('daily-results-container');

  if (!resultsContainer) return;

  const classId = classSelect ? classSelect.value : '-17';
  const dateStr = dateInput ? dateInput.value : '2026-09-02';

  resultsContainer.innerHTML = `<div class="p-6 text-center text-slate-400">Querying live schedule for ${dateStr}...</div>`;

  try {
    const res = await fetch(`/api/daily?classId=${classId}&date=${dateStr}`);
    const data = await res.json();
    const items = data.ttitems || [];

    if (items.length === 0) {
      resultsContainer.innerHTML = `
        <div class="p-6 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
          No scheduled lessons reported by the live server for this date.
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${items.map(item => `
          <div class="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 shadow-xs">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Period ${item.period || '?'}</span>
              <span class="text-xs font-mono text-slate-400">${item.starttime || ''} - ${item.endtime || ''}</span>
            </div>
            <div class="font-bold text-slate-900 text-sm">${item.subject || 'Lesson'}</div>
            <div class="text-xs text-slate-600 flex justify-between">
              <span>👨‍🏫 ${item.teacher || 'Faculty'}</span>
              <span>🚪 ${item.classroom || 'Room'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    resultsContainer.innerHTML = `<div class="p-6 text-center text-rose-500">Error querying daily API: ${err.message}</div>`;
  }
}

// ============================================================================
// TAB 5: SCHOOL RSS NEWS FEED
// ============================================================================
async function loadNewsFeed() {
  const container = document.getElementById('news-cards-container');
  if (!container) return;

  container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400">Loading school announcements...</div>`;

  try {
    const res = await fetch('/api/news');
    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-500">No news announcements available.</div>`;
      return;
    }

    container.innerHTML = items.map(item => `
      <article class="p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition flex flex-col justify-between space-y-3">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-400">
            <span>Official Notice</span>
            <span>${item.pubDate || ''}</span>
          </div>
          <h3 class="font-bold text-slate-900 text-base leading-snug">${item.title}</h3>
          <p class="text-xs text-slate-600 leading-relaxed">${item.description}</p>
        </div>
        ${item.link ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1">Read on EduPage ↗</a>` : ''}
      </article>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="col-span-full p-8 text-center text-rose-500">Failed to load news feed: ${err.message}</div>`;
  }
}

// ============================================================================
// TAB 7: API PLAYGROUND
// ============================================================================
const API_PRESETS = {
  versions: {
    endpoint: '/timetable/server/ttviewer.js?__func=getTTViewerData',
    args: [null, 2026]
  },
  regular: {
    endpoint: '/timetable/server/regulartt.js?__func=regularttGetData',
    args: [null, "13"]
  },
  current: {
    endpoint: '/timetable/server/currenttt.js?__func=curentttGetData',
    args: [null, {
      year: 2026,
      datefrom: "2026-09-02",
      dateto: "2026-09-02",
      table: "classes",
      id: "-17",
      showColors: true
    }]
  },
  substitution: {
    endpoint: '/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml',
    args: [null, {
      date: "2026-09-02",
      mode: "classes",
      kiosk: null
    }]
  },
  news: {
    endpoint: '/rss/news',
    args: []
  },
  info: {
    endpoint: '/api/info',
    args: []
  }
};

function loadPreset(presetKey) {
  const p = API_PRESETS[presetKey];
  if (!p) return;

  const endpointInput = document.getElementById('api-endpoint');
  const payloadInput = document.getElementById('api-payload');

  if (endpointInput) endpointInput.value = p.endpoint;
  if (payloadInput) payloadInput.value = JSON.stringify(p.args, null, 2);

  const curlEl = document.getElementById('snippet-curl');
  if (curlEl) {
    curlEl.textContent = `curl -X POST "https://nampm.edupage.org${p.endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"__args":${JSON.stringify(p.args)},"__gsh":"00000000"}'`;
  }
}

async function executeApiPlayground() {
  const endpoint = document.getElementById('api-endpoint').value.trim();
  const payloadText = document.getElementById('api-payload').value.trim();
  const viewer = document.getElementById('api-response-viewer');
  const statusPill = document.getElementById('response-status-pill');
  const timePill = document.getElementById('response-time-pill');
  const sendBtn = document.getElementById('api-send-btn');

  let args = [];
  try {
    args = JSON.parse(payloadText);
  } catch (e) {
    alert('Invalid JSON in RPC Arguments: ' + e.message);
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  viewer.textContent = 'Executing request to nampm.edupage.org...';
  statusPill.textContent = 'Connecting...';
  statusPill.className = 'text-xs bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded';

  const startTime = performance.now();

  try {
    let result = null;
    let latency = 0;

    if (endpoint === '/rss/news') {
      const res = await fetch('/api/news');
      result = await res.json();
      latency = Math.round(performance.now() - startTime);
    } else if (endpoint === '/api/info') {
      const res = await fetch('/api/info');
      result = await res.json();
      latency = Math.round(performance.now() - startTime);
    } else {
      const res = await fetch('/api/raw-rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, args })
      });
      const data = await res.json();
      result = data.response;
      latency = data.latencyMs || Math.round(performance.now() - startTime);
    }

    viewer.textContent = JSON.stringify(result, null, 2);
    statusPill.textContent = '200 OK';
    statusPill.className = 'text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded';
    timePill.textContent = `${latency} ms`;
  } catch (err) {
    viewer.textContent = `Error: ${err.message}`;
    statusPill.textContent = 'Error';
    statusPill.className = 'text-xs bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded';
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<span>🚀</span> Send Live RPC Request';
  }
}

function copySnippet(type) {
  const el = document.getElementById('snippet-curl');
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => alert('Copied cURL to clipboard!'));
  }
}

function copyResponseJson() {
  const el = document.getElementById('api-response-viewer');
  if (el) {
    navigator.clipboard.writeText(el.textContent).then(() => alert('Copied JSON to clipboard!'));
  }
}
