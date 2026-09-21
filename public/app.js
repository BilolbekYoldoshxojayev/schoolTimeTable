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
const initialFilterMode = StorageManager.get('filterMode', 'class');
const initialClassId = StorageManager.get('lastClassId', StorageManager.get('last_class', '-17'));
const initialTeacherId = StorageManager.get('lastTeacherId', StorageManager.get('last_teacher', null));
const initialRoomId = StorageManager.get('lastRoomId', StorageManager.get('last_classroom', null));

let initialSelectedEntityId = null;
if (initialFilterMode === 'class') {
  initialSelectedEntityId = initialClassId;
} else if (initialFilterMode === 'teacher') {
  initialSelectedEntityId = initialTeacherId;
} else if (initialFilterMode === 'classroom') {
  initialSelectedEntityId = initialRoomId;
}

const state = {
  theme: StorageManager.get('theme', null), // null = auto (system preference), 'dark', or 'light'
  timetableData: null,
  filterMode: initialFilterMode, // 'class', 'teacher', or 'classroom'
  selectedEntityId: initialSelectedEntityId,
  lastClassId: initialClassId,
  lastTeacherId: initialTeacherId,
  lastRoomId: initialRoomId,
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
  subjectCategoryFilter: StorageManager.get('subjectCategoryFilter', 'all'),
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

function applyTheme(themeName) {
  const isDark = themeName === 'dark' || (themeName === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
  const icon = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  const btn = document.getElementById('theme-toggle-btn');
  
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Light' : 'Dark';
  if (btn) {
    btn.setAttribute('title', isDark ? 'Switch to Light theme' : 'Switch to Dark theme');
    btn.setAttribute('aria-label', isDark ? 'Switch to Light theme' : 'Switch to Dark theme');
  }
  
  state.theme = themeName;
  if (themeName !== null) {
    StorageManager.set('theme', themeName);
  }
}

function triggerScannerBeam() {
  const existing = document.getElementById('scanner-beam');
  if (existing) existing.remove();

  const beam = document.createElement('div');
  beam.id = 'scanner-beam';
  beam.className = 'scanner-wavefront-beam';

  // Calculate dynamic angle matching the diagonal curtain hem across all viewport sizes
  const angle = Math.atan2(0.40 * window.innerHeight, window.innerWidth) * (180 / Math.PI);
  beam.style.setProperty('--beam-angle', `${angle.toFixed(2)}deg`);

  document.body.appendChild(beam);

  setTimeout(() => {
    if (beam && beam.parentNode) {
      beam.remove();
    }
  }, 700);
}

function toggleTheme() {
  const currentIsDark = document.documentElement.classList.contains('dark');
  const targetTheme = currentIsDark ? 'light' : 'dark';

  // Icon spring spin animation
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.classList.remove('theme-icon-rotating');
    void icon.offsetWidth; // force DOM reflow to restart animation
    icon.classList.add('theme-icon-rotating');
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // View Transitions API: Diagonal Falling Curtain
  if (typeof document.startViewTransition === 'function' && !prefersReduced) {
    triggerScannerBeam();
    document.startViewTransition(() => {
      applyTheme(targetTheme);
    });
  } else if (!prefersReduced) {
    // Graceful CSS transition fallback
    document.documentElement.classList.add('theme-transitioning');
    applyTheme(targetTheme);
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 550);
  } else {
    // Instant switch when reduced motion is preferred
    applyTheme(targetTheme);
  }
}
window.toggleTheme = toggleTheme;

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
  applyTheme(state.theme);
  // Listen for system theme changes if user hasn't explicitly set a preference
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (state.theme === null) {
      applyTheme(null);
    }
  });

  initClock();
  applyZoom(state.zoomLevel);
  applyDensity(state.densityMode);
  applyStatsBanner(state.statsBannerCollapsed);
  setupEventListeners();
  renderSliderScaleTicks();

  // Restore saved form inputs
  const versionSelect = document.getElementById('version-select');
  if (versionSelect) versionSelect.value = state.currentVersion;

  const substDateInput = document.getElementById('subst-date-input');
  if (substDateInput) substDateInput.value = state.substDate;

  // Restore Day Filter UI
  updateDayFilterUI();

  // Restore Mode Filter Button UI
  updateFilterModeUI();

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
  if (!window.location.hash) window.location.hash = "/" + state.currentTab; else handleRouteChange();
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

  const tableWrapper = document.getElementById('timetable-table-wrapper');
  const wrapperRect = tableWrapper ? tableWrapper.getBoundingClientRect() : null;

  // Check if there is an active lesson card on the current day's row
  const todayRow = document.querySelector('tr.timetable-current-day-row');
  const activeCard = todayRow ? todayRow.querySelector('.lesson-card.is-current-lesson') : null;

  if (activeCard && wrapperRect) {
    const wrap = activeCard.querySelector('.lesson-progress-wrap');
    const fill = activeCard.querySelector('.lesson-progress-fill');
    const timeLeftEl = activeCard.querySelector('.lesson-time-left');

    const startMin = parseFloat(activeCard.dataset.startMin || (schedState.activePeriod ? schedState.activePeriod.startMin : 510));
    const endMin = parseFloat(activeCard.dataset.endMin || (schedState.activePeriod ? schedState.activePeriod.endMin : 555));
    const cardProgress = Math.max(0, Math.min(1, (schedState.totalMinutes - startMin) / Math.max(1, endMin - startMin)));
    const remainingMin = Math.max(0, Math.ceil(endMin - schedState.totalMinutes));

    if (wrap && fill) {
      const wrapRect = wrap.getBoundingClientRect();
      const wrapLeft = wrapRect.left - wrapperRect.left;
      const wrapWidth = wrapRect.width;

      // Update fill width exactly
      const percent = (cardProgress * 100).toFixed(2);
      fill.style.width = `${percent}%`;
      if (timeLeftEl) timeLeftEl.textContent = `${remainingMin}m left`;

      // Align targetX directly with the card's dot position (center of dot is at wrapLeft + cardProgress * wrapWidth)
      targetX = wrapLeft + (cardProgress * wrapWidth);
      pillText = `${schedState.shortTimeString} • ${remainingMin}m left`;
    }
  }

  // If targetX wasn't set by an active card on todayRow, calculate from column / break gap / boundary
  if (targetX === null) {
    if (schedState.activePeriod) {
      const th = document.getElementById(`th-period-${schedState.activePeriod.id}`);
      if (th) {
        const colLeft = th.offsetLeft;
        const colWidth = th.offsetWidth;
        targetX = colLeft + (schedState.periodFraction * colWidth);
        pillText = `${schedState.shortTimeString} • ${schedState.remainingMinutes}m left`;
      }
    } else if (schedState.totalMinutes >= 480 && schedState.totalMinutes < 510) {
      // Morning Arrival Gap (08:00 - 08:30)
      const th = document.getElementById('th-gap-morning');
      if (th) {
        const frac = Math.max(0, Math.min(1, (schedState.totalMinutes - 480) / 30));
        targetX = th.offsetLeft + (frac * th.offsetWidth);
        const minsUntil = Math.max(0, 510 - Math.floor(schedState.totalMinutes));
        pillText = `${schedState.shortTimeString} • Arrival (P1 in ${minsUntil}m)`;
      }
    } else if (schedState.activeBreak) {
      const b = schedState.activeBreak;
      let thBreak = null;
      if (b.isLong) {
        thBreak = document.getElementById('th-gap-recess');
      } else if (b.isLunch) {
        thBreak = document.getElementById('th-gap-lunch');
      } else if (b.afterPeriod === 1) {
        thBreak = document.getElementById('th-gap-1');
      } else if (b.afterPeriod === 2) {
        thBreak = document.getElementById('th-gap-2');
      } else if (b.afterPeriod === 4) {
        thBreak = document.getElementById('th-gap-4');
      } else if (b.afterPeriod === 6) {
        thBreak = document.getElementById('th-gap-6');
      }

      if (thBreak) {
        const frac = Math.max(0, Math.min(1, (schedState.totalMinutes - b.startMin) / (b.endMin - b.startMin)));
        targetX = thBreak.offsetLeft + (frac * thBreak.offsetWidth);
        pillText = `${schedState.shortTimeString} • ${b.name} (${schedState.remainingMinutes}m left)`;
      } else {
        const thPrev = document.getElementById(`th-period-${b.afterPeriod}`);
        if (thPrev) targetX = thPrev.offsetLeft + thPrev.offsetWidth;
        pillText = `${schedState.shortTimeString} • ${b.name} (${schedState.remainingMinutes}m left)`;
      }
    } else if (schedState.totalMinutes >= 935) {
      const th7 = document.getElementById('th-period-7');
      if (th7) {
        targetX = th7.offsetLeft + th7.offsetWidth;
        const minsSince = Math.floor(schedState.totalMinutes - 935);
        const h = Math.floor(minsSince / 60);
        const m = minsSince % 60;
        const agoStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        pillText = `${schedState.shortTimeString} • Day Ended (${agoStr} ago)`;
      }
    } else if (schedState.totalMinutes < 480) {
      const th = document.getElementById('th-gap-morning');
      if (th) {
        targetX = th.offsetLeft;
        pillText = `${schedState.shortTimeString} • Doors Open at 08:00`;
      }
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

  // 5. Position intersection node dot on the current day's row only if there is no active card dot
  if (nodeEl) {
    if (todayRow && targetX !== null && !activeCard) {
      const rowTop = todayRow.offsetTop;
      const rowHeight = todayRow.offsetHeight;
      nodeEl.style.top = `${rowTop + rowHeight / 2}px`;
      nodeEl.classList.remove('hidden');
    } else {
      nodeEl.classList.add('hidden');
    }
  }

  // 6. Update in-card progress bars and timers for other active cards
  document.querySelectorAll('.lesson-card.is-current-lesson').forEach(card => {
    if (card === activeCard) return;
    const fill = card.querySelector('.lesson-progress-fill');
    const startMin = parseFloat(card.dataset.startMin || (schedState.activePeriod ? schedState.activePeriod.startMin : 510));
    const endMin = parseFloat(card.dataset.endMin || (schedState.activePeriod ? schedState.activePeriod.endMin : 555));
    const cardProgress = Math.max(0, Math.min(1, (schedState.totalMinutes - startMin) / Math.max(1, endMin - startMin)));
    const remainingMin = Math.max(0, Math.ceil(endMin - schedState.totalMinutes));
    if (fill) {
      fill.style.width = `${(cardProgress * 100).toFixed(2)}%`;
    }
    const timeLeft = card.querySelector('.lesson-time-left');
    if (timeLeft) {
      timeLeft.textContent = `${remainingMin}m left`;
    }
  });

  // 7. Update header status chip
  if (headerStatusEl && headerStatusText) {
    if (schedState.isWeekend) {
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs';
      headerStatusText.textContent = `🏖️ Weekend (${schedState.timeString})`;
    } else if (schedState.activePeriod) {
      const activeCardTitle = document.querySelector('.lesson-card.is-current-lesson .lesson-card-title');
      const subjectName = activeCardTitle ? (activeCardTitle.getAttribute('title') || activeCardTitle.textContent) : 'Lesson';
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 shadow-2xs';
      headerStatusText.innerHTML = `<span class="font-bold text-rose-800 dark:text-rose-300">Period ${schedState.activePeriod.id}:</span> <span class="text-slate-800 dark:text-slate-100 font-semibold">${subjectName}</span> <span class="text-rose-600 dark:text-rose-300/80 font-medium">(${schedState.remainingMinutes}m left)</span>`;
    } else if (schedState.activeBreak) {
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shadow-2xs';
      headerStatusText.innerHTML = `<span class="font-semibold text-amber-800 dark:text-amber-300">☕ ${schedState.activeBreak.name}:</span> <span class="text-slate-700 dark:text-slate-200">Period ${schedState.activeBreak.nextPeriod} in ${schedState.remainingMinutes}m</span>`;
    } else if (schedState.isBeforeSchool) {
      const minsUntil = Math.max(0, 510 - Math.floor(schedState.totalMinutes));
      const h = Math.floor(minsUntil / 60);
      const m = minsUntil % 60;
      const waitStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 shadow-2xs';
      headerStatusText.innerHTML = `<span class="font-semibold text-blue-800 dark:text-blue-300">🌅 Before School (${schedState.shortTimeString}):</span> <span class="text-slate-700 dark:text-slate-200">Period 1 in ${waitStr}</span>`;
    } else if (schedState.isAfterSchool) {
      const minsSince = Math.floor(schedState.totalMinutes - 935);
      const h = Math.floor(minsSince / 60);
      const m = minsSince % 60;
      const agoStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      headerStatusEl.className = 'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs';
      headerStatusText.innerHTML = `<span class="font-medium text-slate-600 dark:text-slate-300">🏁 Day Ended at 15:35 (${agoStr} ago • ${schedState.shortTimeString})</span>`;
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
      renderSliderScaleTicks();
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

  renderSliderScaleTicks(mode);
}
window.setSimulatedRangeMode = setSimulatedRangeMode;

function renderSliderScaleTicks() {
  const container = document.getElementById('slider-scale-container');
  if (!container) return;

  const ticks = [
    { val: 480, label: '08:00', isEdge: 'start', title: 'School Doors Open & Arrival (08:00)' },
    { val: 510, label: '08:30 (P1)', title: 'Period 1 Starts (08:30)' },
    { val: 655, label: '10:55 (Recess)', title: 'Morning Recess (10:55 - 11:25)' },
    { val: 685, label: '11:25 (P4)', title: 'Period 4 Starts (11:25)' },
    { val: 780, label: '13:00 (Lunch)', title: 'Lunch Break (13:00 - 14:00)' },
    { val: 840, label: '14:00 (P6)', title: 'Period 6 Starts (14:00)' },
    { val: 935, label: '15:35', isEdge: 'end', title: 'School Dismissal (15:35)' }
  ];

  const min = 480;
  const max = 935;
  const span = max - min; // 455 minutes

  container.innerHTML = ticks.map(t => {
    const fraction = Math.max(0, Math.min(1, (t.val - min) / span));
    const percent = (fraction * 100).toFixed(2);

    let style = '';
    let alignClass = 'items-center -translate-x-1/2';
    if (t.isEdge === 'start') {
      style = 'left: 0;';
      alignClass = 'items-start translate-x-0';
    } else if (t.isEdge === 'end') {
      style = 'right: 0;';
      alignClass = 'items-end translate-x-0';
    } else {
      style = `left: calc(8px + (100% - 16px) * ${percent} / 100);`;
    }

    return `
      <div class="slider-tick-marker absolute top-0 flex flex-col ${alignClass} cursor-pointer group select-none" style="${style}" onclick="applySimulatedTime(${t.val})" title="${t.title || t.label}">
        <div class="w-0.5 h-1.5 bg-slate-300 group-hover:bg-blue-600 transition-colors"></div>
        <span class="text-slate-500 font-semibold group-hover:text-blue-600 transition-colors whitespace-nowrap text-[9px] mt-0.5">${t.label}</span>
      </div>
    `;
  }).join('');
}
window.renderSliderScaleTicks = renderSliderScaleTicks;

function stepSimulatedTime(deltaMinutes) {
  const current = state.simulatedMinutes !== null ? state.simulatedMinutes : 580;
  let next = current + deltaMinutes;
  if (next < 480) next = 480;
  if (next > 935) next = 935;
  applySimulatedTime(next);
}
window.stepSimulatedTime = stepSimulatedTime;

function setSimulatedPeriod(periodOrPhase) {
  const presets = {
    'open': 480,       // 08:00 School Arrival
    1: 530,            // 08:50 (in Period 1)
    2: 580,            // 09:40 (in Period 2)
    3: 630,            // 10:30 (in Period 3)
    'recess': 665,     // 11:05 (in Morning Recess)
    4: 705,            // 11:45 (in Period 4)
    5: 760,            // 12:40 (in Period 5)
    'lunch': 810,      // 13:30 (in Lunch Break)
    6: 860,            // 14:20 (in Period 6)
    7: 910,            // 15:10 (in Period 7)
    'dismissal': 935   // 15:35 Dismissal
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
    const startScrub = () => document.body.classList.add('no-transition');
    const stopScrub = () => document.body.classList.remove('no-transition');

    timeSlider.addEventListener('mousedown', startScrub);
    timeSlider.addEventListener('touchstart', startScrub, { passive: true });
    window.addEventListener('mouseup', stopScrub);
    window.addEventListener('touchend', stopScrub);

    timeSlider.addEventListener('input', (e) => {
      document.body.classList.add('no-transition');
      applySimulatedTime(parseInt(e.target.value, 10));
    });
    timeSlider.addEventListener('change', stopScrub);
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

// ============================================================================
// SPA ROUTER
// ============================================================================
function switchTab(tabId) {
  window.location.hash = '/' + tabId;
}

window.addEventListener('hashchange', handleRouteChange);

async function handleRouteChange() {
  let hash = window.location.hash.replace('#/', '');
  if (!hash) hash = 'timetable';
  
  const tabId = hash;
  state.currentTab = tabId;
  StorageManager.set('lastTab', tabId);
  
  // Update Buttons
  document.querySelectorAll('.tab-btn').forEach(el => {
    el.classList.remove('active', 'bg-white', 'text-blue-600', 'shadow-2xs');
    el.classList.add('text-slate-600');
  });
  
  const activeBtn = document.getElementById('tab-btn-' + tabId);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-white', 'text-blue-600', 'shadow-2xs');
    activeBtn.classList.remove('text-slate-600');
  }
  
  const routerView = document.getElementById('router-view');
  const timetableSection = document.getElementById('tab-content-timetable');
  
  if (tabId === 'timetable') {
    routerView.classList.add('hidden');
    routerView.innerHTML = ''; // clear memory
    if (timetableSection) timetableSection.classList.remove('hidden');
    updateCurrentTimeLine();
    return;
  }
  
  // Hide timetable
  if (timetableSection) timetableSection.classList.add('hidden');
  routerView.classList.remove('hidden');
  routerView.innerHTML = '<div class="p-8 text-center text-slate-400">Loading ' + tabId + '...</div>';
  
  try {
    const res = await fetch('/pages/' + tabId + '.html');
    if (!res.ok) throw new Error('Page not found');
    const html = await res.text();
    routerView.innerHTML = html;
    
    // Trigger specific logic after load
    if (tabId === 'directory') renderDirectory();
    if (tabId === 'substitution' && !state.substitutionData) loadSubstitution();
    if (tabId === 'daily' && !state.dailyData) {
      fetchDailySchedule();
    } else if (tabId === 'daily') {
      loadDailyScheduleClasses();
      renderDailySchedule();
    }
  } catch (err) {
    console.error(err);
    routerView.innerHTML = '<div class="p-8 text-center text-red-500">Failed to load ' + tabId + '</div>';
  }
}

// Intercept the initial load tab state from StorageManager
// Find where switchTab(state.currentTab) is called on startup.

function loadDailyScheduleClasses() {
  const select = document.getElementById('daily-class-select');
  if (!select) return;

  const defaultClasses = [
    { id: '-17', name: '5-01: Al-Xorazmiy' },
    { id: '-18', name: '5-02: Al-Xorazmiy' },
    { id: '-15', name: "6-01: Mirzo Ulug'bek" },
    { id: '-16', name: "6-02: Mirzo Ulug'bek" },
    { id: '-1', name: '7-01: Abu Ali ibn Sino' },
    { id: '-2', name: '7-02: Abu Ali ibn Sino' },
    { id: '-3', name: "8-01: Ahmad al-Farg'oniy" },
    { id: '-4', name: "8-02: Ahmad al-Farg'oniy" },
    { id: '-5', name: '9-01: Abu Rayhon Beruniy' },
    { id: '-6', name: '9-02: Abu Rayhon Beruniy' },
    { id: '-7', name: '10-01: Abu Nasr Forobiy' },
    { id: '-8', name: '10-02: Abu Nasr Forobiy' },
    { id: '-9', name: '11-01: Alisher Navoiy' },
    { id: '-10', name: '11-02: Alisher Navoiy' }
  ];

  const classList = (state.timetableData?.classes && state.timetableData.classes.length > 0)
    ? state.timetableData.classes
    : defaultClasses;

  select.innerHTML = '';
  classList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });

  const savedClass = state.dailyClassId || '-17';
  if (classList.find(c => c.id === savedClass)) {
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
    let items = [];
    let isFallback = false;

    try {
      const res = await fetch(`/api/daily?classId=${classId}&date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        items = data.ttitems || [];
      }
    } catch (netErr) {
      console.warn('Live daily API request failed, trying timetable grid fallback...', netErr);
    }

    // Fallback to local timetableData grid if live API returned no items or failed
    if ((!items || items.length === 0) && state.timetableData?.classGrid?.[classId]) {
      const dateObj = new Date(dateStr + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      const dayIdx = (dayOfWeek >= 1 && dayOfWeek <= 5) ? String(dayOfWeek - 1) : null;
      if (dayIdx && state.timetableData.classGrid[classId][dayIdx]) {
        const dayPeriods = state.timetableData.classGrid[classId][dayIdx];
        const periodKeys = Object.keys(dayPeriods).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        for (const p of periodKeys) {
          for (const item of dayPeriods[p]) {
            const pInfo = (state.timetableData.periods || []).find(pr => String(pr.id) === String(p));
            items.push({
              period: p,
              uniperiod: p,
              subject: item.subject?.name,
              color: item.subject?.color,
              teacher: (item.teachers || []).map(t => t.name || t.short).join(', '),
              classroom: (item.classrooms || []).map(r => normalizeClassroomName(r.short || r.name)).join(', '),
              starttime: pInfo ? pInfo.startTime : '',
              endtime: pInfo ? pInfo.endTime : ''
            });
          }
        }
        if (items.length > 0) isFallback = true;
      }
    }

    if (items.length === 0) {
      resultsContainer.innerHTML = `
        <div class="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">
          No scheduled lessons reported for this date.
        </div>
      `;
      return;
    }

    // Resolve any missing names/rooms from timetableData dictionaries
    const subjectsMap = {};
    (state.timetableData?.subjects || []).forEach(s => { subjectsMap[s.id] = s; });
    const teachersMap = {};
    (state.timetableData?.teachers || []).forEach(t => { teachersMap[t.id] = t; });
    const roomsMap = {};
    (state.timetableData?.classrooms || []).forEach(r => { roomsMap[r.id] = r; });

    resultsContainer.innerHTML = `
      ${isFallback ? `<div class="mb-2.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5">
        <span>ℹ️</span> <span>Live EduPage RPC unavailable; displaying standard timetable schedule for this day.</span>
      </div>` : ''}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${items.map(item => {
          const period = item.period || item.uniperiod || '?';
          const pInfo = (state.timetableData?.periods || []).find(pr => String(pr.id) === String(period));
          const starttime = item.starttime || (pInfo ? pInfo.startTime : '');
          const endtime = item.endtime || (pInfo ? pInfo.endTime : '');
          const timeDisplay = (starttime && endtime) ? `${starttime} - ${endtime}` : (starttime || endtime || '');
          
          let subject = item.subject;
          if (!subject && item.subjectid && subjectsMap[item.subjectid]) {
            subject = subjectsMap[item.subjectid].name;
          }
          subject = subject || 'Lesson';

          let subjectColor = item.color || (item.colors && item.colors[0]) || (item.subjectid && subjectsMap[item.subjectid]?.color) || '#3b82f6';

          let teacher = item.teacher;
          if (!teacher && Array.isArray(item.teacherids)) {
            teacher = item.teacherids.map(tid => teachersMap[tid]?.name || teachersMap[tid]?.short || tid).filter(Boolean).join(', ');
          }
          teacher = teacher || 'Faculty';

          let classroom = item.classroom;
          if (!classroom && Array.isArray(item.classroomids)) {
            classroom = item.classroomids.map(rid => {
              const r = roomsMap[rid];
              return r ? normalizeClassroomName(r.short || r.name) : rid;
            }).filter(Boolean).join(', ');
          }
          classroom = classroom || 'Room';

          return `
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/90 space-y-1.5 shadow-2xs hover:shadow-xs transition" style="border-left: 4px solid ${subjectColor};">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/70 border border-blue-100 dark:border-blue-900/50 px-2 py-0.5 rounded">Period ${period}</span>
                ${timeDisplay ? `<span class="text-xs font-mono text-slate-500 dark:text-slate-400">${timeDisplay}</span>` : ''}
              </div>
              <div class="font-bold text-slate-900 dark:text-white text-sm">${subject}</div>
              <div class="text-xs text-slate-600 dark:text-slate-400 flex justify-between gap-2">
                <span class="truncate" title="${teacher}">👨‍🏫 ${teacher}</span>
                <span class="truncate shrink-0 font-medium text-slate-700 dark:text-slate-300" title="${classroom}">🚪 ${classroom}</span>
              </div>
            </div>
          `;
        }).join('')}
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
