const fs = require('fs');
let appJs = fs.readFileSync('public/app.js', 'utf8');

const oldSwitchTabStart = appJs.indexOf('function switchTab(tabId) {');
const nextFuncStart = appJs.indexOf('function loadDailyScheduleClasses()', oldSwitchTabStart);

// We want to replace the whole block between `function switchTab` and the next function
// Wait, there's `function switchTab(tabId)` which has some if/else logic for fetching initial data.
// Let's replace it with a router.

const newRouterLogic = `
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
`;

// Replace from switchTab to loadDailyScheduleClasses
const oldCodeBlock = appJs.substring(oldSwitchTabStart, nextFuncStart);
appJs = appJs.replace(oldCodeBlock, newRouterLogic + '\n');

// Also need to find `switchTab(state.currentTab);` at the end of the init() or DOMContentLoaded
// and change it to trigger handleRouteChange() instead if there's a hash, otherwise default to timetable/lastTab
appJs = appJs.replace('switchTab(state.currentTab);', 'if (!window.location.hash) window.location.hash = "/" + state.currentTab; else handleRouteChange();');

fs.writeFileSync('public/app.js', appJs);
console.log('Router injected into app.js');
