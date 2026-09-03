/**
 * EduPage nampm.edupage.org Explorer Frontend Application
 * Presidential School in Namangan
 */

// ============================================================================
// Client Memory & Storage Manager (localStorage)
// ============================================================================
const STORAGE_KEY = 'edupage_nampm_prefs_v1';

const StorageManager = {
  getPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('LocalStorage unavailable:', e);
      return {};
    }
  },
  savePrefs(newPrefs) {
    try {
      const current = this.getPrefs();
      const updated = { ...current, ...newPrefs };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  },
  get(key, fallback) {
    const prefs = this.getPrefs();
    return prefs[key] !== undefined ? prefs[key] : fallback;
  },
  set(key, val) {
    this.savePrefs({ [key]: val });
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }
};

// Global Application State (hydrated from memory)
const state = {
  timetableData: null,
  filterMode: StorageManager.get('filterMode', 'class'), // 'class', 'teacher', or 'classroom'
  selectedEntityId: null,
  lastClassId: StorageManager.get('lastClassId', '-17'),
  lastTeacherId: StorageManager.get('lastTeacherId', null),
  lastRoomId: StorageManager.get('lastRoomId', null),
  activeDayFilter: StorageManager.get('dayFilter', 'all'),
  searchQuery: '',
  currentVersion: StorageManager.get('timetableVersion', '13'),
  zoomLevel: StorageManager.get('zoomLevel', 100),
  densityMode: StorageManager.get('densityMode', 'comfortable'),
  statsBannerCollapsed: StorageManager.get('statsBannerCollapsed', false),
  dailyData: null,
  dailyClassId: StorageManager.get('dailyClassId', '-17'),
  dailyDate: StorageManager.get('dailyDate', '2026-09-02'),
  newsData: null,
  substitutionData: null,
  substMode: StorageManager.get('substMode', 'classes'), // 'classes' or 'teachers'
  substDate: StorageManager.get('substDate', '2026-09-02'),
  directoryTab: StorageManager.get('directoryTab', 'teachers'),
  directorySearchQuery: '',
  subjectCategoryFilter: 'all',
  currentTab: StorageManager.get('lastTab', 'timetable'),
  cachedTimetables: {},
  simulatedMinutes: null, // null for real time, or total minutes from 00:00 (e.g. 580 for 09:40)
  simulatedDayId: null,   // null for real day, or '0'..'4'
  lastKnownPeriodId: null,
  lastKnownDayId: null
};

// ============================================================================
// Zoom, Density & Layout Controls
// ============================================================================
function applyZoom(zoom) {
  const clamped = Math.max(70, Math.min(150, Math.round(zoom)));
  state.zoomLevel = clamped;
  document.documentElement.style.setProperty('--zoom-scale', clamped / 100);
  const label = document.getElementById('zoom-level-label');
  if (label) label.textContent = `${clamped}%`;
  StorageManager.set('zoomLevel', clamped);
}

function adjustZoom(delta) {
  applyZoom(state.zoomLevel + delta);
  renderGrid();
}

function resetZoom() {
  applyZoom(100);
  renderGrid();
}

function applyDensity(mode) {
  state.densityMode = mode;
  const icon = document.getElementById('density-icon');
  const label = document.getElementById('density-label');
  if (mode === 'compact') {
    document.body.classList.add('density-compact');
    if (icon) icon.textContent = '⊞';
    if (label) label.textContent = 'Compact';
  } else {
    document.body.classList.remove('density-compact');
    if (icon) icon.textContent = '⊟';
    if (label) label.textContent = 'Normal';
  }
  StorageManager.set('densityMode', mode);
}

function toggleDensity() {
  const next = state.densityMode === 'compact' ? 'comfortable' : 'compact';
  applyDensity(next);
  renderGrid();
}

function applyStatsBanner(collapsed) {
  state.statsBannerCollapsed = !!collapsed;
  const banner = document.getElementById('stats-banner');
  if (banner) {
    if (collapsed) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
    }
  }
  StorageManager.set('statsBannerCollapsed', state.statsBannerCollapsed);
}

function toggleStatsBanner() {
  applyStatsBanner(!state.statsBannerCollapsed);
}

function resetUserPreferences() {
  if (confirm('Reset all saved timetable choices, zoom level, and view settings to default?')) {
    StorageManager.clear();
    window.location.reload();
  }
}

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initClock();
  applyZoom(state.zoomLevel);
  applyDensity(state.densityMode);
  applyStatsBanner(state.statsBannerCollapsed);
  setupEventListeners();

  // Restore saved form inputs
  const versionSelect = document.getElementById('version-select');
  if (versionSelect) versionSelect.value = state.currentVersion;

  const substDateInput = document.getElementById('subst-date-input');
  if (substDateInput) substDateInput.value = state.substDate;

  // Restore Day Filter UI
  document.querySelectorAll('.day-filter-btn').forEach(btn => {
    if (btn.getAttribute('data-day') === state.activeDayFilter) {
      btn.className = 'day-filter-btn px-2 py-0.5 rounded text-xs font-semibold bg-blue-600 text-white';
    } else {
      btn.className = 'day-filter-btn px-2 py-0.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700';
    }
  });

  // Restore Mode Filter Button UI
  const btnClass = document.getElementById('mode-btn-class');
  const btnTeacher = document.getElementById('mode-btn-teacher');
  const btnClassroom = document.getElementById('mode-btn-classroom');
  [btnClass, btnTeacher, btnClassroom].forEach(b => {
    if (b) b.className = 'px-2.5 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900';
  });
  const activeModeBtn = state.filterMode === 'class' ? btnClass : (state.filterMode === 'teacher' ? btnTeacher : btnClassroom);
  if (activeModeBtn) {
    activeModeBtn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-blue-600 shadow-2xs';
  }

  // Restore Substitution UI Mode
  updateSubstModeUI();

  // Restore Directory Subtab UI
  updateDirectorySubtabUI();

  // Load Timetable Data
  await loadTimetable(state.currentVersion);

  loadNewsFeed();
  loadDailyScheduleClasses();
  loadSubstitution();
  renderDirectory();

  // Switch to saved tab
  switchTab(state.currentTab);
});

// ============================================================================
// Schedule Period Timings & Real-Time Tracking Logic
// ============================================================================
const SCHEDULE_PERIODS = [
  { id: 1, name: 'Period 1', start: '08:30', end: '09:15', startMin: 510, endMin: 555 },
  { id: 2, name: 'Period 2', start: '09:20', end: '10:05', startMin: 560, endMin: 605 },
  { id: 3, name: 'Period 3', start: '10:10', end: '10:55', startMin: 610, endMin: 655 },
  { id: 4, name: 'Period 4', start: '11:25', end: '12:10', startMin: 685, endMin: 730 },
  { id: 5, name: 'Period 5', start: '12:15', end: '13:00', startMin: 735, endMin: 780 },
  { id: 6, name: 'Period 6', start: '14:00', end: '14:45', startMin: 840, endMin: 885 },
  { id: 7, name: 'Period 7', start: '14:50', end: '15:35', startMin: 890, endMin: 935 }
];

const SCHEDULE_BREAKS = [
  { afterPeriod: 1, name: 'Short Break', start: '09:15', end: '09:20', startMin: 555, endMin: 560, nextPeriod: 2 },
  { afterPeriod: 2, name: 'Short Break', start: '10:05', end: '10:10', startMin: 605, endMin: 610, nextPeriod: 3 },
  { afterPeriod: 3, name: 'Morning Recess', start: '10:55', end: '11:25', startMin: 655, endMin: 685, nextPeriod: 4, isLong: true },
  { afterPeriod: 4, name: 'Short Break', start: '12:10', end: '12:15', startMin: 730, endMin: 735, nextPeriod: 5 },
  { afterPeriod: 5, name: 'Lunch & Recreation', start: '13:00', end: '14:00', startMin: 780, endMin: 840, nextPeriod: 6, isLunch: true },
  { afterPeriod: 6, name: 'Short Break', start: '14:45', end: '14:50', startMin: 885, endMin: 890, nextPeriod: 7 }
];

function getPeriodStartMinutes(periodNum) {
  const p = SCHEDULE_PERIODS.find(item => item.id === Number(periodNum));
  return p ? p.startMin : (510 + (Number(periodNum) - 1) * 50);
}

function getPeriodEndMinutes(periodNum) {
  const p = SCHEDULE_PERIODS.find(item => item.id === Number(periodNum));
  return p ? p.endMin : (555 + (Number(periodNum) - 1) * 50);
}

function getPeriodStartTimeStr(periodNum) {
  const p = SCHEDULE_PERIODS.find(item => item.id === Number(periodNum));
  return p ? p.start : '08:30';
}

function getPeriodEndTimeStr(periodNum) {
  const p = SCHEDULE_PERIODS.find(item => item.id === Number(periodNum));
  return p ? p.end : '09:15';
}

function getTashkentNow() {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const getPart = type => parts.find(p => p.type === type)?.value;
    const hour = parseInt(getPart('hour'), 10);
    const minute = parseInt(getPart('minute'), 10);
    const second = parseInt(getPart('second'), 10);
    const weekdayStr = getPart('weekday');
    const weekdayMap = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 0 };
    const dayOfWeek = weekdayMap[weekdayStr] ?? now.getDay();

    if (state.simulatedMinutes !== null || state.simulatedDayId !== null) {
      const activeMinutes = state.simulatedMinutes !== null ? state.simulatedMinutes : (hour * 60 + minute);
      const simHour = Math.floor(activeMinutes / 60);
      const simMinute = Math.floor(activeMinutes % 60);
      const simSecond = second;
      let simDay = dayOfWeek;
      if (state.simulatedDayId === 'weekend') {
        simDay = 6; // Saturday (weekend)
      } else if (state.simulatedDayId !== null && state.simulatedDayId !== undefined) {
        simDay = parseInt(state.simulatedDayId, 10) + 1;
      }
      return {
        hour: simHour,
        minute: simMinute,
        second: simSecond,
        dayOfWeek: simDay,
        totalMinutes: activeMinutes + (second / 60),
        timeString: `${String(simHour).padStart(2, '0')}:${String(simMinute).padStart(2, '0')}:${String(simSecond).padStart(2, '0')}`,
        shortTimeString: `${String(simHour).padStart(2, '0')}:${String(simMinute).padStart(2, '0')}`,
        isSimulated: true
      };
    }

    return {
      hour,
      minute,
      second,
      dayOfWeek,
      totalMinutes: hour * 60 + minute + (second / 60),
      timeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
      shortTimeString: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      isSimulated: false
    };
  } catch (e) {
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    let simDay = now.getDay();
    if (state.simulatedDayId === 'weekend') {
      simDay = 6;
    } else if (state.simulatedDayId !== null && state.simulatedDayId !== undefined) {
      simDay = parseInt(state.simulatedDayId, 10) + 1;
    }
    const isSim = state.simulatedMinutes !== null || state.simulatedDayId !== null;
    const activeMinutes = state.simulatedMinutes !== null ? state.simulatedMinutes : (hour * 60 + minute);
    const simHour = Math.floor(activeMinutes / 60);
    const simMinute = Math.floor(activeMinutes % 60);
    return {
      hour: simHour,
      minute: simMinute,
      second,
      dayOfWeek: simDay,
      totalMinutes: activeMinutes + (second / 60),
      timeString: `${String(simHour).padStart(2, '0')}:${String(simMinute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
      shortTimeString: `${String(simHour).padStart(2, '0')}:${String(simMinute).padStart(2, '0')}`,
      isSimulated: isSim
    };
  }
}

function getCurrentScheduleState() {
  const time = getTashkentNow();
  const dayOfWeek = time.dayOfWeek;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const currentDayId = isWeekend ? null : String(dayOfWeek - 1); // '0' = Monday, '3' = Thursday

  const totalMinutes = time.totalMinutes;
  let activePeriod = null;
  let periodFraction = 0;
  let remainingMinutes = 0;
  let elapsedMinutes = 0;

  let activeBreak = null;
  let breakFraction = 0;

  // Check periods
  for (const p of SCHEDULE_PERIODS) {
    if (totalMinutes >= p.startMin && totalMinutes < p.endMin) {
      activePeriod = p;
      periodFraction = Math.max(0, Math.min(1, (totalMinutes - p.startMin) / (p.endMin - p.startMin)));
      remainingMinutes = Math.max(0, Math.ceil(p.endMin - totalMinutes));
      elapsedMinutes = Math.floor(totalMinutes - p.startMin);
      break;
    }
  }

  // Check breaks
  if (!activePeriod) {
    for (const b of SCHEDULE_BREAKS) {
      if (totalMinutes >= b.startMin && totalMinutes < b.endMin) {
        activeBreak = b;
        breakFraction = Math.max(0, Math.min(1, (totalMinutes - b.startMin) / (b.endMin - b.startMin)));
        remainingMinutes = Math.max(0, Math.ceil(b.endMin - totalMinutes));
        elapsedMinutes = Math.floor(totalMinutes - b.startMin);
        break;
      }
    }
  }

  const isBeforeSchool = totalMinutes < 510;
  const isAfterSchool = totalMinutes >= 935;

  return {
    ...time,
    isWeekend,
    currentDayId,
    currentPeriod: activePeriod ? activePeriod.id : null,
    activePeriod,
    periodFraction,
    remainingMinutes,
    elapsedMinutes,
    activeBreak,
    breakFraction,
    isBeforeSchool,
    isAfterSchool
  };
}

function updateCurrentTimeLine() {
  const schedState = getCurrentScheduleState();
  const lineEl = document.getElementById('current-time-line');
  const lineTextEl = document.getElementById('current-time-line-text');
  const nodeEl = document.getElementById('current-time-node');
  const headerStatusEl = document.getElementById('grid-header-current-status');
  const headerStatusText = document.getElementById('header-status-text');

  if (!lineEl || !lineTextEl) return;

  // 1. Highlight the current active period column in thead
  for (let p = 1; p <= 7; p++) {
    const th = document.getElementById(`th-period-${p}`);
    if (th) {
      if (schedState.currentPeriod === p) {
        th.classList.add('current-period-col');
      } else {
        th.classList.remove('current-period-col');
      }
    }
  }

  // 2. Highlight Today button in Day Filter toolbar
  document.querySelectorAll('.day-filter-btn').forEach(btn => {
    const d = btn.getAttribute('data-day');
    if (d === schedState.currentDayId && !schedState.isWeekend) {
      btn.classList.add('ring-2', 'ring-blue-400');
      btn.title = 'Today';
    } else {
      btn.classList.remove('ring-2', 'ring-blue-400');
    }
  });

  // 3. Compute X position of the timeline indicator
  let targetX = null;
  let pillText = '';

  if (schedState.activePeriod) {
    const th = document.getElementById(`th-period-${schedState.activePeriod.id}`);
    if (th) {
      const colLeft = th.offsetLeft;
      const colWidth = th.offsetWidth;
      targetX = colLeft + (schedState.periodFraction * colWidth);
      pillText = `${schedState.shortTimeString} • ${schedState.remainingMinutes}m left`;
    }
  } else if (schedState.activeBreak) {
    const b = schedState.activeBreak;
    const thPrev = document.getElementById(`th-period-${b.afterPeriod}`);
    const thNext = document.getElementById(`th-period-${b.nextPeriod}`);
    if (thPrev && thNext) {
      const startX = thPrev.offsetLeft + thPrev.offsetWidth;
      const endX = thNext.offsetLeft;
      targetX = startX + (schedState.breakFraction * Math.max(1, endX - startX));
      pillText = `${schedState.shortTimeString} • ${b.name} (${schedState.remainingMinutes}m left)`;
    }
  } else if (schedState.isBeforeSchool) {
    const th1 = document.getElementById('th-period-1');
    if (th1) {
      targetX = th1.offsetLeft;
      const minsUntil = Math.max(0, 510 - Math.floor(schedState.totalMinutes));
      const h = Math.floor(minsUntil / 60);
      const m = minsUntil % 60;
      const waitStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      pillText = `${schedState.shortTimeString} • Starts in ${waitStr}`;
    }
  } else if (schedState.isAfterSchool) {
    const th7 = document.getElementById('th-period-7');
    if (th7) {
      targetX = th7.offsetLeft + th7.offsetWidth;
      const minsSince = Math.floor(schedState.totalMinutes - 935);
      const h = Math.floor(minsSince / 60);
      const m = minsSince % 60;
      const agoStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      pillText = `${schedState.shortTimeString} • Ended (${agoStr} ago)`;
    }
  }

  // 4. Update vertical line position and text
  if (targetX !== null) {
    lineEl.style.left = `${Math.round(targetX)}px`;
    lineEl.classList.remove('hidden');
    lineTextEl.textContent = pillText;
  } else {
    lineEl.classList.add('hidden');
  }

  // 5. Position intersection node dot on the current day's row
  if (nodeEl) {
    const todayRow = document.querySelector('tr.timetable-current-day-row');
    if (todayRow && targetX !== null) {
      const rowTop = todayRow.offsetTop;
      const rowHeight = todayRow.offsetHeight;
      nodeEl.style.top = `${rowTop + rowHeight / 2}px`;
      nodeEl.classList.remove('hidden');
    } else {
      nodeEl.classList.add('hidden');
    }
  }

  // 6. Update in-card progress bars and timers for active cards
  document.querySelectorAll('.lesson-card.is-current-lesson').forEach(card => {
    const fill = card.querySelector('.lesson-progress-fill');
    if (fill) {
      fill.style.width = `${Math.min(100, Math.max(0, schedState.periodFraction * 100))}%`;
    }
    const timeLeft = card.querySelector('.lesson-time-left');
    if (timeLeft) {
      timeLeft.textContent = `${schedState.remainingMinutes}m left`;
    }
  });

  // 7. Update header status chip
  if (headerStatusEl && headerStatusText) {
    if (schedState.isWeekend) {
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200';
      headerStatusText.textContent = `🏖️ Weekend (${schedState.timeString})`;
    } else if (schedState.activePeriod) {
      const activeCardTitle = document.querySelector('.lesson-card.is-current-lesson .lesson-card-title');
      const subjectName = activeCardTitle ? (activeCardTitle.getAttribute('title') || activeCardTitle.textContent) : 'Lesson';
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs';
      headerStatusText.innerHTML = `<span class="font-bold text-rose-800">Period ${schedState.activePeriod.id}:</span> ${subjectName} (${schedState.remainingMinutes}m left)`;
    } else if (schedState.activeBreak) {
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs';
      headerStatusText.innerHTML = `<span>☕ ${schedState.activeBreak.name}:</span> Period ${schedState.activeBreak.nextPeriod} in ${schedState.remainingMinutes}m`;
    } else if (schedState.isBeforeSchool) {
      const minsUntil = Math.max(0, 510 - Math.floor(schedState.totalMinutes));
      const h = Math.floor(minsUntil / 60);
      const m = minsUntil % 60;
      const waitStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs';
      headerStatusText.innerHTML = `<span>🌅 Before School (${schedState.shortTimeString}):</span> Period 1 in ${waitStr}`;
    } else if (schedState.isAfterSchool) {
      const minsSince = Math.floor(schedState.totalMinutes - 935);
      const h = Math.floor(minsSince / 60);
      const m = minsSince % 60;
      const agoStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200';
      headerStatusText.innerHTML = `<span>🏁 Day Ended at 15:35</span> (${agoStr} ago • ${schedState.shortTimeString})`;
    }
  }

  // 8. If period or day changed, trigger grid re-render to update active card markers
  if (state.lastKnownPeriodId !== schedState.currentPeriod || state.lastKnownDayId !== schedState.currentDayId) {
    state.lastKnownPeriodId = schedState.currentPeriod;
    state.lastKnownDayId = schedState.currentDayId;
    renderGrid();
  }

  // 9. Sync open schedule controller popover UI if visible
  const popover = document.getElementById('time-simulator-popover');
  if (popover && !popover.classList.contains('hidden')) {
    updateTimeSimulatorUI();
  }
}

// ============================================================================
// Time & Schedule Simulator Controllers (Full 24-Hour Day & Weekday System)
// ============================================================================
function toggleTimeSimulator() {
  const popover = document.getElementById('time-simulator-popover');
  if (popover) {
    popover.classList.toggle('hidden');
    if (!popover.classList.contains('hidden')) {
      updateTimeSimulatorUI();
    }
  }
}
window.toggleTimeSimulator = toggleTimeSimulator;

function setSimulatedDay(dayId) {
  state.simulatedDayId = dayId; // '0'..'4' (Mon-Fri) or 'weekend'
  if (state.simulatedMinutes === null) {
    state.simulatedMinutes = 580; // Default to Period 2 (09:40) if not currently set
  }
  updateTimeSimulatorUI();
  renderGrid();
  updateCurrentTimeLine();
}
window.setSimulatedDay = setSimulatedDay;

function setSimulatedRangeMode(mode) {
  const slider = document.getElementById('time-slider');
  const labelMin = document.getElementById('slider-min-label');
  const labelMax = document.getElementById('slider-max-label');
  const rangeDesc = document.getElementById('slider-range-desc');
  const btnFull = document.getElementById('btn-range-fullday');
  const btnSchool = document.getElementById('btn-range-school');

  if (!slider) return;

  if (mode === 'school') {
    slider.min = 480; // 08:00
    slider.max = 960; // 16:00
    if (labelMin) labelMin.textContent = '08:00';
    if (labelMax) labelMax.textContent = '16:00';
    if (rangeDesc) rangeDesc.textContent = '(08:00 – 16:00)';
    if (btnSchool) {
      btnSchool.className = 'px-2 py-0.5 rounded-md font-bold bg-blue-600 text-white shadow-2xs';
    }
    if (btnFull) {
      btnFull.className = 'px-2 py-0.5 rounded-md font-medium text-slate-600 hover:text-slate-900';
    }
    const curMin = state.simulatedMinutes ?? 580;
    if (curMin < 480 || curMin > 960) {
      applySimulatedTime(580);
    } else {
      slider.value = curMin;
    }
  } else {
    // 24-Hour Full Day
    slider.min = 0;
    slider.max = 1439;
    if (labelMin) labelMin.textContent = '00:00';
    if (labelMax) labelMax.textContent = '23:59';
    if (rangeDesc) rangeDesc.textContent = '(00:00 – 23:59)';
    if (btnFull) {
      btnFull.className = 'px-2 py-0.5 rounded-md font-bold bg-blue-600 text-white shadow-2xs';
    }
    if (btnSchool) {
      btnSchool.className = 'px-2 py-0.5 rounded-md font-medium text-slate-600 hover:text-slate-900';
    }
    slider.value = state.simulatedMinutes ?? 580;
  }
}
window.setSimulatedRangeMode = setSimulatedRangeMode;

function stepSimulatedTime(deltaMinutes) {
  const current = state.simulatedMinutes !== null ? state.simulatedMinutes : 580;
  let next = current + deltaMinutes;
  if (next < 0) next = 1440 + next;
  if (next >= 1440) next = next % 1440;
  applySimulatedTime(next);
}
window.stepSimulatedTime = stepSimulatedTime;

function setSimulatedPeriod(periodOrPhase) {
  const presets = {
    // Full 24-hour milestones
    'midnight': 0,     // 00:00 Midnight
    'early': 420,      // 07:00 Early Morning
    'open': 495,       // 08:15 School Opens
    // Academic periods & breaks
    1: 530,            // 08:50 (in Period 1)
    2: 580,            // 09:40 (in Period 2)
    3: 630,            // 10:30 (in Period 3)
    'recess': 665,     // 11:05 (Morning Recess)
    4: 705,            // 11:45 (in Period 4)
    5: 760,            // 12:40 (in Period 5)
    'lunch': 810,      // 13:30 (Lunch Break)
    6: 860,            // 14:20 (in Period 6)
    7: 910,            // 15:10 (in Period 7)
    // After school & evening
    'dismissal': 945,  // 15:45 Dismissal
    'clubs': 1020,     // 17:00 Clubs / Sports
    'evening': 1200,   // 20:00 Evening
    'night': 1380      // 23:00 Night
  };
  const targetMin = presets[periodOrPhase] !== undefined ? presets[periodOrPhase] : 580;
  applySimulatedTime(targetMin);
}
window.setSimulatedPeriod = setSimulatedPeriod;

function getSchedulePhaseInfo(totalMinutes, isWeekend) {
  if (isWeekend) {
    return { type: 'weekend', title: 'Weekend', subtitle: 'Weekend • School Closed' };
  }
  for (const p of SCHEDULE_PERIODS) {
    if (totalMinutes >= p.startMin && totalMinutes < p.endMin) {
      const remaining = Math.max(0, Math.ceil(p.endMin - totalMinutes));
      return { type: 'period', title: `Period ${p.id}`, subtitle: `${p.name} (${p.start} – ${p.end}) • ${remaining}m left` };
    }
  }
  for (const b of SCHEDULE_BREAKS) {
    if (totalMinutes >= b.startMin && totalMinutes < b.endMin) {
      const remaining = Math.max(0, Math.ceil(b.endMin - totalMinutes));
      return { type: 'break', title: b.name, subtitle: `${b.name} (${b.start} – ${b.end}) • P${b.nextPeriod} in ${remaining}m` };
    }
  }
  if (totalMinutes < 510) {
    const minsUntil = 510 - Math.floor(totalMinutes);
    const h = Math.floor(minsUntil / 60);
    const m = minsUntil % 60;
    const waitStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return { type: 'before_school', title: 'Before School', subtitle: `Period 1 starts at 08:30 (in ${waitStr})` };
  }
  const minsSince = Math.floor(totalMinutes - 935);
  const h = Math.floor(minsSince / 60);
  const m = minsSince % 60;
  const agoStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { type: 'after_school', title: 'After School', subtitle: `Day ended at 15:35 (${agoStr} ago)` };
}

function updateTimeSimulatorUI() {
  const slider = document.getElementById('time-slider');
  const sliderVal = document.getElementById('slider-time-val');
  const phaseText = document.getElementById('slider-phase-text');
  const modeLabel = document.getElementById('simulator-mode-label');
  const modeDot = document.getElementById('simulator-mode-dot');
  const phasePill = document.getElementById('simulator-phase-pill');
  const simDayLabel = document.getElementById('sim-day-label');
  const btnLabel = document.getElementById('time-sim-label');

  const sched = getCurrentScheduleState();
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dayName = sched.isWeekend ? 'Weekend' : (dayNames[parseInt(sched.currentDayId || '0', 10)] || 'Weekday');

  // Update day buttons active styles
  document.querySelectorAll('.sim-day-btn').forEach(btn => {
    const d = btn.getAttribute('data-simday');
    const isSelected = (state.simulatedDayId === d) || (state.simulatedDayId === null && ((sched.isWeekend && d === 'weekend') || (!sched.isWeekend && d === sched.currentDayId)));
    if (isSelected) {
      btn.className = 'sim-day-btn py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] shadow-2xs border border-blue-600 transition text-center';
    } else {
      btn.className = 'sim-day-btn py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] border border-slate-200 transition text-center';
    }
  });

  const phaseInfo = getSchedulePhaseInfo(sched.totalMinutes, sched.isWeekend);

  if (sliderVal) sliderVal.textContent = sched.shortTimeString;
  if (phaseText) phaseText.textContent = phaseInfo.subtitle;

  if (state.simulatedMinutes !== null || state.simulatedDayId !== null) {
    if (slider && state.simulatedMinutes !== null) slider.value = Math.floor(state.simulatedMinutes);
    if (modeDot) modeDot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0';
    if (modeLabel) modeLabel.innerHTML = `<span class="text-amber-700 font-bold">Simulating: ${dayName}, ${sched.shortTimeString}</span>`;
    if (phasePill) {
      phasePill.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0 shadow-2xs';
      phasePill.textContent = phaseInfo.title;
    }
    if (simDayLabel) simDayLabel.textContent = state.simulatedDayId ? `${dayName}` : 'auto';
    if (btnLabel) btnLabel.textContent = `Sim: ${dayName.slice(0, 3)} ${sched.shortTimeString}`;
  } else {
    if (slider) slider.value = Math.floor(sched.totalMinutes);
    if (modeDot) modeDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';
    if (modeLabel) modeLabel.innerHTML = `<span class="text-slate-800 font-bold">Live: ${dayName}, ${sched.shortTimeString}</span>`;
    if (phasePill) {
      phasePill.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-emerald-700 border border-emerald-200 shrink-0 shadow-2xs';
      phasePill.textContent = phaseInfo.title;
    }
    if (simDayLabel) simDayLabel.textContent = `auto (${dayName})`;
    if (btnLabel) btnLabel.textContent = `Live Time`;
  }
}

function applySimulatedTime(totalMinutes) {
  state.simulatedMinutes = totalMinutes;
  if (state.simulatedDayId === null) {
    const today = getTashkentNow();
    state.simulatedDayId = (!today.isWeekend && today.dayOfWeek >= 1 && today.dayOfWeek <= 5)
      ? String(today.dayOfWeek - 1)
      : '3'; // Default to Thursday if weekend or unselected
  }

  updateTimeSimulatorUI();
  renderGrid();
  updateCurrentTimeLine();
}

function resetToLiveTime() {
  state.simulatedMinutes = null;
  state.simulatedDayId = null;

  updateTimeSimulatorUI();

  const popover = document.getElementById('time-simulator-popover');
  if (popover) popover.classList.add('hidden');

  renderGrid();
  updateCurrentTimeLine();
}

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
    updateCurrentTimeLine();
  }
  updateTime();
  setInterval(updateTime, 1000);
}

window.addEventListener('resize', () => {
  updateCurrentTimeLine();
});

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
      saveCurrentEntityId(e.target.value);
      renderGrid();
    });
  }

  const versionSelect = document.getElementById('version-select');
  if (versionSelect) {
    versionSelect.addEventListener('change', async (e) => {
      state.currentVersion = e.target.value;
      StorageManager.set('timetableVersion', e.target.value);
      await loadTimetable(state.currentVersion);
    });
  }

  const substDateInput = document.getElementById('subst-date-input');
  if (substDateInput) {
    substDateInput.addEventListener('change', (e) => {
      state.substDate = e.target.value;
      StorageManager.set('substDate', e.target.value);
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

  const timeSlider = document.getElementById('time-slider');
  if (timeSlider) {
    timeSlider.addEventListener('input', (e) => {
      applySimulatedTime(parseInt(e.target.value, 10));
    });
  }

  // Close schedule controller popover when clicking outside
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('time-simulator-popover');
    const toggleBtn = document.getElementById('time-simulator-btn');
    if (popover && !popover.classList.contains('hidden')) {
      if (!popover.contains(e.target) && !toggleBtn?.contains(e.target)) {
        popover.classList.add('hidden');
      }
    }
  });
}

// ============================================================================
// Navigation Tabs
// ============================================================================
function switchTab(tabId) {
  state.currentTab = tabId;
  StorageManager.set('lastTab', tabId);

  document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-2xs');
    el.classList.add('text-slate-600');
  });

  const activeContent = document.getElementById(`tab-content-${tabId}`);
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-2xs');
    activeBtn.classList.remove('text-slate-600');
  }

  if (tabId === 'directory') {
    renderDirectory();
  } else if (tabId === 'timetable') {
    updateCurrentTimeLine();
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
      const fallbackRes = await fetch('snapshot-13.json?v=2');
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
    updateDirectoryTabBadges();
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

  const uniqueSubs = state.timetableData ? getOrganizedSubjects(state.timetableData).length : 32;

  if (classesEl) classesEl.textContent = stats.totalClasses || 14;
  if (teachersEl) teachersEl.textContent = stats.totalTeachers || 36;
  if (subjectsEl) subjectsEl.textContent = uniqueSubs;
  if (roomsEl) roomsEl.textContent = stats.totalClassrooms || 20;
  if (lessonsEl) lessonsEl.textContent = stats.totalLessons || 222;
  if (cardsEl) cardsEl.textContent = stats.totalCards || 434;
}

// ============================================================================
// Timetable Filtering & Rendering (Class, Teacher, Classroom)
// ============================================================================
function setFilterMode(mode) {
  state.filterMode = mode;
  StorageManager.set('filterMode', mode);

  // Restore last selected entity for this mode if known
  if (mode === 'class') {
    state.selectedEntityId = state.lastClassId || null;
  } else if (mode === 'teacher') {
    state.selectedEntityId = state.lastTeacherId || null;
  } else if (mode === 'classroom') {
    state.selectedEntityId = state.lastRoomId || null;
  }

  const btnClass = document.getElementById('mode-btn-class');
  const btnTeacher = document.getElementById('mode-btn-teacher');
  const btnClassroom = document.getElementById('mode-btn-classroom');

  [btnClass, btnTeacher, btnClassroom].forEach(b => {
    if (b) {
      b.className = 'px-2.5 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900';
    }
  });

  const activeBtn = mode === 'class' ? btnClass : (mode === 'teacher' ? btnTeacher : btnClassroom);
  if (activeBtn) {
    activeBtn.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-blue-600 shadow-2xs';
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
    items = (state.timetableData.classrooms || []).map(r => ({ id: r.id, name: `Room: ${normalizeClassroomName(r.name)}` }));
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    select.appendChild(opt);
  });

  if (items.length > 0) {
    let targetId = state.selectedEntityId;
    if (state.filterMode === 'class' && state.lastClassId) targetId = state.lastClassId;
    if (state.filterMode === 'teacher' && state.lastTeacherId) targetId = state.lastTeacherId;
    if (state.filterMode === 'classroom' && state.lastRoomId) targetId = state.lastRoomId;

    if (!targetId || !items.find(i => i.id === targetId)) {
      targetId = items[0].id;
    }

    state.selectedEntityId = targetId;
    select.value = targetId;
    saveCurrentEntityId(targetId);
  }
}

function saveCurrentEntityId(id) {
  if (state.filterMode === 'class') {
    state.lastClassId = id;
    StorageManager.set('lastClassId', id);
  } else if (state.filterMode === 'teacher') {
    state.lastTeacherId = id;
    StorageManager.set('lastTeacherId', id);
  } else if (state.filterMode === 'classroom') {
    state.lastRoomId = id;
    StorageManager.set('lastRoomId', id);
  }
}

function filterDay(day) {
  state.activeDayFilter = day;
  StorageManager.set('dayFilter', day);
  document.querySelectorAll('.day-filter-btn').forEach(btn => {
    if (btn.getAttribute('data-day') === day) {
      btn.className = 'day-filter-btn px-2 py-0.5 rounded text-xs font-semibold bg-blue-600 text-white';
    } else {
      btn.className = 'day-filter-btn px-2 py-0.5 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700';
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
    if (subtitleEl) subtitleEl.textContent = `Faculty: ${currentEntity?.weeklyLessons || 0} periods/week${hrText}`;
  } else if (state.filterMode === 'classroom') {
    gridData = data.classroomGrid?.[state.selectedEntityId] || {};
    currentEntity = (data.classrooms || []).find(r => r.id === state.selectedEntityId);
    if (titleEl) titleEl.textContent = `Schedule for Room ${normalizeClassroomName(currentEntity?.name || '')}`;
    if (subtitleEl) subtitleEl.textContent = `Occupancy: ${currentEntity?.bookedSlots || 0}/35 slots (${currentEntity?.utilizationRate || 0}% utilization)`;
  }

  tbody.innerHTML = '';

  const schedState = getCurrentScheduleState();

  const daysToRender = state.activeDayFilter === 'all'
    ? days
    : days.filter(d => d.id === state.activeDayFilter);

  daysToRender.forEach(day => {
    const isToday = day.id === schedState.currentDayId && !schedState.isWeekend;

    const tr = document.createElement('tr');
    tr.className = `timetable-day-row ${isToday ? 'timetable-current-day-row bg-blue-50/20' : 'hover:bg-slate-50/50'} transition border-b border-slate-200/80`;

    // Day label cell
    const thDay = document.createElement('th');
    if (isToday) {
      thDay.className = 'p-1 font-semibold text-slate-800 bg-blue-100/60 border-r-2 border-r-blue-500 text-center w-24 select-none';
      thDay.innerHTML = `
        <div class="text-xs font-bold leading-tight flex items-center justify-center gap-1 text-blue-950">
          ${day.name}
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" title="Today"></span>
        </div>
        <div class="flex items-center justify-center gap-1 mt-0.5">
          <span class="text-[10px] text-blue-700 font-bold uppercase tracking-wider">${day.short}</span>
          <span class="px-1 py-0.2 rounded text-[8px] font-black bg-blue-600 text-white leading-none tracking-wide">TODAY</span>
        </div>
      `;
    } else {
      thDay.className = 'p-1 font-semibold text-slate-800 bg-slate-50/80 border-r border-slate-200 text-center w-24 select-none';
      thDay.innerHTML = `
        <div class="text-xs font-bold leading-tight">${day.name}</div>
        <div class="text-[10px] text-slate-400 font-normal uppercase tracking-wider">${day.short}</div>
      `;
    }
    tr.appendChild(thDay);

    // Periods 1 through 7 with multi-period span support
    let period = 1;
    while (period <= 7) {
      const currentPeriod = period;
      const items = gridData[day.id]?.[period] || [];
      const primaryItem = items[0];
      const isStartOfMulti = primaryItem && primaryItem.startPeriod === period && primaryItem.duration > 1;
      const span = isStartOfMulti ? Math.min(primaryItem.duration, 8 - period) : 1;

      const td = document.createElement('td');
      td.className = 'timetable-cell border-r border-slate-200 align-top p-1';
      if (period + span - 1 >= 7) td.className = 'timetable-cell align-top p-1';
      if (span > 1) {
        td.colSpan = span;
        td.className += ' bg-amber-50/20';
      }

      // Filter by search query
      const filteredItems = items.filter(item => {
        if (!state.searchQuery) return true;
        const q = state.searchQuery.toLowerCase();
        const sName = (item.subject?.name || '').toLowerCase();
        const tNames = (item.teachers || []).map(t => t.name.toLowerCase()).join(' ');
        const cNames = (item.classes || []).map(c => c.name.toLowerCase()).join(' ');
        const rNames = (item.classrooms || []).map(r => r.name.toLowerCase()).join(' ');
        return sName.includes(q) || tNames.includes(q) || cNames.includes(q) || rNames.includes(q);
      });

      if (filteredItems.length > 0) {
        const stack = document.createElement('div');
        stack.className = 'h-full flex flex-col justify-center space-y-1';

        filteredItems.forEach(item => {
          const card = document.createElement('div');
          const bgColor = item.subject?.color || '#3b82f6';

          let subText = '';
          if (state.filterMode === 'class') {
            const tNames = item.teachers.map(t => t.short).join(', ') || 'Staff';
            const rNames = item.classrooms.map(r => normalizeClassroomName(r.short || r.name)).join(', ') || 'TBD';
            subText = `${tNames} • <span class="font-bold text-slate-800">${rNames}</span>`;
          } else if (state.filterMode === 'teacher') {
            const cNames = item.classes.map(c => c.short).join(', ') || 'Class';
            const rNames = item.classrooms.map(r => normalizeClassroomName(r.short || r.name)).join(', ') || 'TBD';
            subText = `<span class="font-bold text-blue-700">${cNames}</span> • ${rNames}`;
          } else if (state.filterMode === 'classroom') {
            const cNames = item.classes.map(c => c.short).join(', ') || 'Class';
            const tNames = item.teachers.map(t => t.short).join(', ') || 'Staff';
            subText = `<span class="font-bold text-blue-700">${cNames}</span> • ${tNames}`;
          }

          let badgeHtml = '';
          if (item.duration > 1) {
            badgeHtml = `<span class="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0 ml-0.5">2P</span>`;
          }

          // Check if this card represents the current active lesson
          const startP = Number(item.startPeriod || item.period || currentPeriod);
          const dur = Number(item.duration || 1);
          const endP = startP + dur - 1;
          const isCurrentLesson = isToday && schedState.activePeriod && (schedState.activePeriod.id >= startP && schedState.activePeriod.id <= endP);

          let liveBadgeHtml = '';
          let progressHtml = '';

          if (isCurrentLesson) {
            liveBadgeHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500 text-white shrink-0 ml-1 shadow-2xs animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-white"></span>NOW</span>`;

            const startMin = getPeriodStartMinutes(startP);
            const endMin = getPeriodEndMinutes(endP);
            const cardProgress = Math.max(0, Math.min(1, (schedState.totalMinutes - startMin) / Math.max(1, endMin - startMin)));
            const cardPercent = Math.min(100, Math.max(0, Math.round(cardProgress * 100)));
            const cardRemainingMin = Math.max(0, Math.ceil(endMin - schedState.totalMinutes));

            progressHtml = `
              <div class="lesson-progress-wrap mt-1" title="${cardPercent}% elapsed • ${cardRemainingMin}m remaining">
                <div class="lesson-progress-fill" style="width: ${cardPercent}%;">
                  <div class="lesson-progress-pointer"></div>
                </div>
              </div>
              <div class="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-0.5">
                <span>${getPeriodStartTimeStr(startP)}</span>
                <span class="lesson-time-left font-sans font-bold text-rose-600">${cardRemainingMin}m left</span>
                <span>${getPeriodEndTimeStr(endP)}</span>
              </div>
            `;
          }

          card.className = `lesson-card ${isCurrentLesson ? 'is-current-lesson' : ''} rounded-md border border-slate-200/90 bg-white cursor-pointer relative overflow-hidden h-full flex flex-col justify-center select-none shadow-2xs hover:shadow-xs transition`;
          card.innerHTML = `
            <div class="absolute left-0 top-0 bottom-0 w-1" style="background-color: ${bgColor}"></div>
            <div class="pl-1.5 min-w-0">
              <div class="flex items-center justify-between gap-0.5">
                <div class="font-bold text-slate-900 truncate lesson-card-title flex items-center gap-1 min-w-0" title="${item.subject.name}">
                  <span class="truncate">${item.subject.name}</span>
                </div>
                <div class="flex items-center shrink-0">
                  ${badgeHtml}
                  ${liveBadgeHtml}
                </div>
              </div>
              <div class="text-slate-500 truncate lesson-card-sub mt-0.5">${subText}</div>
              ${progressHtml}
            </div>
          `;

          card.onclick = () => openLessonModal(item, startP, day.name);
          stack.appendChild(card);
        });

        td.appendChild(stack);
      } else {
        td.innerHTML = `<div class="h-full min-h-[32px] flex items-center justify-center text-slate-200 text-xs font-mono select-none">—</div>`;
      }

      tr.appendChild(td);
      period += span;
    }

    tbody.appendChild(tr);
  });

  // Position vertical time line immediately after DOM render
  updateCurrentTimeLine();
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

  const startP = Number(item?.startPeriod || item?.period || periodNumber || 1);
  const dur = Number(item?.duration || 1);
  const endP = startP + dur - 1;

  const sTime = (periodMap[startP] ? periodMap[startP].split('–')[0].trim() : getPeriodStartTimeStr(startP));
  const eTime = (periodMap[endP] ? periodMap[endP].split('–')[1].trim() : getPeriodEndTimeStr(endP));

  let timeStr = '';
  if (dur > 1) {
    timeStr = `${dayName}, Periods ${startP}–${endP} (${sTime} – ${eTime}) • Double Period (${dur * 45} mins)`;
  } else {
    const pTime = periodMap[startP] || `${sTime} – ${eTime}`;
    timeStr = `${dayName}, Period ${startP} (${pTime})`;
  }

  if (header) header.style.backgroundColor = item?.subject?.color || '#2563eb';
  if (subjectTag) {
    const doubleTag = dur > 1 ? ` • Double Period (${dur}x 45 min)` : '';
    subjectTag.textContent = `Course • ${item?.subject?.short || 'ID: ' + (item?.subject?.id || '')}${doubleTag}`;
  }
  if (subjectName) subjectName.textContent = item?.subject?.name || 'Untitled Lesson';

  if (teacherVal) teacherVal.textContent = (item?.teachers || []).map(t => t.name || t.short).join(', ') || 'Not Assigned';
  if (classroomVal) classroomVal.textContent = (item?.classrooms || []).map(r => normalizeClassroomName(r.name || r.short)).join(', ') || 'General Classroom';
  if (classVal) classVal.textContent = (item?.classes || []).map(c => c.name).join(', ') || 'All Groups';
  if (timeVal) timeVal.textContent = timeStr;

  if (lessonIdVal) lessonIdVal.textContent = item?.lessonId || 'N/A';
  if (cardIdVal) cardIdVal.textContent = item?.cardId || 'N/A';

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
  StorageManager.set('substMode', mode);
  updateSubstModeUI();
  loadSubstitution();
}

function updateSubstModeUI() {
  const mode = state.substMode || 'classes';
  const btnClasses = document.getElementById('subst-mode-classes');
  const btnTeachers = document.getElementById('subst-mode-teachers');

  if (mode === 'classes') {
    if (btnClasses) btnClasses.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white shadow-2xs';
    if (btnTeachers) btnTeachers.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
  } else {
    if (btnClasses) btnClasses.className = 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
    if (btnTeachers) btnTeachers.className = 'px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white shadow-2xs';
  }
}

function setSubstDateToday() {
  const dateInput = document.getElementById('subst-date-input');
  const today = '2026-09-02';
  if (dateInput) dateInput.value = today;
  state.substDate = today;
  StorageManager.set('substDate', today);
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
  StorageManager.set('substDate', nextDateStr);
  loadSubstitution();
}

// ============================================================================
// Classroom & Subject Normalization Helpers
// ============================================================================
function normalizeClassroomName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 's-zal') return 'Sport Zal';
  return trimmed;
}

function normalizeSubjectName(rawName) {
  if (!rawName) return 'Untitled Subject';
  let clean = rawName.trim().replace(/\.+$/, '').trim();
  if (clean.toLowerCase() === 'english languge') {
    clean = 'English Language';
  }
  return clean;
}

function getSubjectCategory(name) {
  const n = (name || '').toLowerCase();
  if (/physical|sport|military|music|art|drawing|tech/i.test(n)) {
    return { id: 'arts', name: 'Arts, Sports & Tech', icon: '🎨', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
  }
  if (/math|science|physics|chem|bio|comput/i.test(n)) {
    return { id: 'stem', name: 'STEM & Computing', icon: '📐', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  }
  if (/english|language|literature|russian/i.test(n)) {
    return { id: 'languages', name: 'Languages & Literature', icon: '📖', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
  }
  if (/history|geography|law|global|education/i.test(n)) {
    return { id: 'social', name: 'Social Sciences & Humanities', icon: '🌍', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
  }
  if (/kelajak|a10|b10|a11|b11/i.test(n)) {
    return { id: 'specialized', name: 'Specialized & Form Time', icon: '⭐', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
  }
  return { id: 'other', name: 'General Studies', icon: '📚', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
}

function getOrganizedSubjects(data) {
  if (!data) return [];
  const subjectsMap = new Map();

  // 1. Initialize grouped subjects from data.subjects
  (data.subjects || []).forEach(s => {
    const normName = normalizeSubjectName(s.name);
    const key = normName.toLowerCase();

    if (!subjectsMap.has(key)) {
      const cat = getSubjectCategory(normName);
      subjectsMap.set(key, {
        name: normName,
        short: (s.short || '').trim().replace(/\.+$/, '').trim() || normName.substring(0, 4).toUpperCase(),
        color: s.color || '#3b82f6',
        category: cat,
        rawIds: [s.id],
        totalLessons: s.totalLessons || 0,
        mergedCount: 1,
        teachers: new Set(),
        classes: new Set()
      });
    } else {
      const existing = subjectsMap.get(key);
      existing.rawIds.push(s.id);
      existing.totalLessons += (s.totalLessons || 0);
      existing.mergedCount += 1;
      if (s.color && s.color !== '#999999' && existing.color === '#999999') {
        existing.color = s.color;
      }
    }
  });

  // 2. Scan classGrid to associate teachers and classes to each subject accurately
  if (data.classGrid) {
    for (const [classId, dayObj] of Object.entries(data.classGrid)) {
      const targetClass = (data.classes || []).find(c => c.id === classId);
      const className = targetClass ? (targetClass.name || targetClass.short) : classId;

      for (const daySlots of Object.values(dayObj)) {
        for (const items of Object.values(daySlots)) {
          for (const item of items) {
            if (item.isContinuation) continue;
            const normName = normalizeSubjectName(item.subject?.name);
            const key = normName.toLowerCase();
            const record = subjectsMap.get(key);
            if (record) {
              if (className) record.classes.add(className);
              (item.teachers || []).forEach(t => {
                const tName = t.name || t.short;
                if (tName) record.teachers.add(tName);
              });
            }
          }
        }
      }
    }
  }

  // 3. Convert teachers and classes sets to sorted arrays
  const result = Array.from(subjectsMap.values()).map(sub => ({
    ...sub,
    teachersList: Array.from(sub.teachers).sort((a, b) => a.localeCompare(b)),
    classesList: Array.from(sub.classes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }));

  return result;
}

function filterSubjectCategory(catId) {
  state.subjectCategoryFilter = catId;
  renderDirectory();
}
window.filterSubjectCategory = filterSubjectCategory;

function updateDirectoryTabBadges() {
  if (!state.timetableData) return;
  const facultyCount = (state.timetableData.teachers || []).length;
  const classCount = (state.timetableData.classes || []).length;
  const roomCount = (state.timetableData.classrooms || []).length;
  const subjectCount = getOrganizedSubjects(state.timetableData).length;

  const bFaculty = document.getElementById('dirtab-teachers');
  const bClasses = document.getElementById('dirtab-classes');
  const bRooms = document.getElementById('dirtab-classrooms');
  const bSubjects = document.getElementById('dirtab-subjects');

  if (bFaculty) bFaculty.innerHTML = `👨‍🏫 Faculty (${facultyCount})`;
  if (bClasses) bClasses.innerHTML = `🏫 Classes (${classCount})`;
  if (bRooms) bRooms.innerHTML = `🚪 Rooms (${roomCount})`;
  if (bSubjects) bSubjects.innerHTML = `📚 Subjects (${subjectCount})`;
}

// ============================================================================
// TAB 3: SCHOOL DIRECTORY & ENTITY EXPLORER
// ============================================================================
function switchDirectoryTab(subTab) {
  state.directoryTab = subTab;
  StorageManager.set('directoryTab', subTab);
  updateDirectorySubtabUI();
  renderDirectory();
}

function updateDirectorySubtabUI() {
  const subTab = state.directoryTab || 'teachers';
  document.querySelectorAll('.dirtab-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-white', 'text-blue-600', 'font-semibold', 'shadow-2xs');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById(`dirtab-${subTab}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'font-semibold', 'shadow-2xs');
    activeBtn.classList.remove('text-slate-600');
  }
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
      const roomName = normalizeClassroomName(r.name);
      return roomName.toLowerCase().includes(q) || (r.short || '').toLowerCase().includes(q);
    });

    rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        ${rooms.map(r => {
          const roomName = normalizeClassroomName(r.name);
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
                    <h3 class="font-bold text-slate-900 text-base">Room ${roomName}</h3>
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
    const allOrganized = getOrganizedSubjects(state.timetableData);

    const categories = [
      { id: 'all', name: 'All Disciplines', icon: '📚' },
      { id: 'stem', name: 'STEM & Computing', icon: '📐' },
      { id: 'languages', name: 'Languages & Literature', icon: '📖' },
      { id: 'social', name: 'Social Sciences & Humanities', icon: '🌍' },
      { id: 'arts', name: 'Arts, Sports & Tech', icon: '🎨' },
      { id: 'specialized', name: 'Specialized & Form Time', icon: '⭐' }
    ];

    const categoryCounts = {
      all: allOrganized.length,
      stem: allOrganized.filter(s => s.category.id === 'stem').length,
      languages: allOrganized.filter(s => s.category.id === 'languages').length,
      social: allOrganized.filter(s => s.category.id === 'social').length,
      arts: allOrganized.filter(s => s.category.id === 'arts').length,
      specialized: allOrganized.filter(s => s.category.id === 'specialized').length
    };

    const activeCat = state.subjectCategoryFilter || 'all';

    let filtered = allOrganized;
    if (activeCat !== 'all') {
      filtered = filtered.filter(s => s.category.id === activeCat);
    }
    if (q) {
      filtered = filtered.filter(s => {
        const matchName = s.name.toLowerCase().includes(q);
        const matchShort = s.short.toLowerCase().includes(q);
        const matchCat = s.category.name.toLowerCase().includes(q);
        const matchTeachers = s.teachersList.some(t => t.toLowerCase().includes(q));
        const matchClasses = s.classesList.some(c => c.toLowerCase().includes(q));
        return matchName || matchShort || matchCat || matchTeachers || matchClasses;
      });
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    const totalCurriculumPeriods = allOrganized.reduce((acc, s) => acc + (s.totalLessons || 0), 0);
    const totalTeachersCount = new Set(allOrganized.flatMap(s => s.teachersList)).size;

    container.innerHTML = `
      <div class="space-y-4">
        <!-- Subjects Top Controls & Department Category Filter Pills -->
        <div class="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold shadow-2xs">📚</span>
              <div>
                <h3 class="font-extrabold text-slate-900 text-sm leading-tight">Academic Curriculum & Disciplines</h3>
                <p class="text-[11px] text-slate-500">Organized by academic departments • Consolidated and deduplicated from raw EduPage schedule entries</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-100 text-[11px]">
                ${allOrganized.length} Disciplines
              </span>
              <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200 text-[11px]">
                ${totalCurriculumPeriods} Periods / Week
              </span>
              <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100 text-[11px]">
                ${totalTeachersCount} Faculty
              </span>
            </div>
          </div>

          <!-- Category Filter Pills -->
          <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
            ${categories.map(c => {
              const count = categoryCounts[c.id] || 0;
              const isActive = activeCat === c.id;
              const btnClass = isActive
                ? 'bg-blue-600 text-white font-bold shadow-2xs border-blue-600'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium border-slate-200';
              return `
                <button onclick="filterSubjectCategory('${c.id}')" class="px-2.5 py-1 rounded-lg text-xs border transition flex items-center gap-1.5 ${btnClass}">
                  <span>${c.icon}</span>
                  <span>${c.name}</span>
                  <span class="px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'} font-mono font-bold">${count}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Subjects Grid -->
        ${filtered.length > 0 ? `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            ${filtered.map(s => {
              const teachersPreview = s.teachersList.length > 0
                ? s.teachersList.slice(0, 3).join(', ') + (s.teachersList.length > 3 ? ` +${s.teachersList.length - 3}` : '')
                : 'General Faculty';
              const classesPreview = s.classesList.length > 0
                ? `${s.classesList.length} Classes (${s.classesList[0]}–${s.classesList[s.classesList.length - 1]})`
                : 'All Classes';
              const dedupBadge = s.mergedCount > 1
                ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0" title="Consolidated ${s.mergedCount} EduPage entries into a single academic discipline">Deduplicated (${s.mergedCount} entries)</span>`
                : '';

              return `
                <div class="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-xs transition flex flex-col justify-between space-y-3 relative overflow-hidden group">
                  <div class="absolute top-0 left-0 bottom-0 w-1" style="background-color: ${s.color || '#3b82f6'}"></div>
                  <div class="pl-1">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${s.color || '#3b82f6'}"></span>
                          <h4 class="font-bold text-slate-900 text-sm truncate leading-tight group-hover:text-blue-600 transition" title="${s.name}">${s.name}</h4>
                        </div>
                        <div class="flex items-center flex-wrap gap-1.5 mt-1">
                          <span class="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded uppercase">${s.short}</span>
                          <span class="text-[10px] font-medium px-2 py-0.2 rounded-full ${s.category.bg} ${s.category.text} border ${s.category.border}">${s.category.name}</span>
                        </div>
                      </div>
                      <div class="flex flex-col items-end shrink-0">
                        <span class="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 shadow-2xs">
                          ${s.totalLessons} periods
                        </span>
                        <div class="mt-1">${dedupBadge}</div>
                      </div>
                    </div>

                    <div class="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-400 font-medium">Faculty (${s.teachersList.length}):</span>
                        <span class="font-semibold text-slate-800 truncate max-w-[65%]" title="${s.teachersList.join(', ')}">${teachersPreview}</span>
                      </div>
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-400 font-medium">Class Cohort:</span>
                        <span class="font-semibold text-slate-700 truncate max-w-[65%]" title="${s.classesList.join(', ')}">${classesPreview}</span>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-2">
            <div class="text-3xl">🔍</div>
            <div class="font-bold text-slate-700">No subjects found matching current filter</div>
            <p class="text-xs text-slate-400">Try changing department filter or clearing your search term</p>
            <button onclick="filterSubjectCategory('all'); const inp = document.getElementById('directory-search-input'); if(inp){ inp.value=''; state.directorySearchQuery=''; } renderDirectory();" class="mt-2 px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs rounded-lg transition border border-blue-100">
              Reset Filters
            </button>
          </div>
        `}
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
  saveCurrentEntityId(id);
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

  const savedClass = state.dailyClassId || '-17';
  if (defaultClasses.find(c => c.id === savedClass)) {
    select.value = savedClass;
  }

  const dateInput = document.getElementById('daily-date-input');
  if (dateInput && state.dailyDate) {
    dateInput.value = state.dailyDate;
  }

  select.addEventListener('change', (e) => {
    state.dailyClassId = e.target.value;
    StorageManager.set('dailyClassId', e.target.value);
  });

  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      state.dailyDate = e.target.value;
      StorageManager.set('dailyDate', e.target.value);
    });
  }
}

async function fetchDailySchedule() {
  const classSelect = document.getElementById('daily-class-select');
  const dateInput = document.getElementById('daily-date-input');
  const resultsContainer = document.getElementById('daily-results-container');

  if (!resultsContainer) return;

  const classId = classSelect ? classSelect.value : '-17';
  const dateStr = dateInput ? dateInput.value : '2026-09-02';
  state.dailyClassId = classId;
  state.dailyDate = dateStr;
  StorageManager.set('dailyClassId', classId);
  StorageManager.set('dailyDate', dateStr);

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
