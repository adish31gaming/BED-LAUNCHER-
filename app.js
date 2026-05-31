/**
 * ═══════════════════════════════════════════════════════════
 * BEDLAUNCHER — app.js
 * Complete launcher logic: storage, versions, downloads,
 * settings, navigation, and UI management.
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ──────────────────────────────────────────────────────────
   CONSTANTS & VERSION CATALOG
   Simulated Bedrock version data (no real game files)
─────────────────────────────────────────────────────────── */

/** Version catalog — populated with realistic Bedrock version numbers */
const VERSION_CATALOG = [
  { id: 'bedrock-1.21.40',  number: '1.21.40',  type: 'release', date: '2024-10-22', size: 234, changelog: 'Bundles, Ominous Trials improvements' },
  { id: 'bedrock-1.21.30',  number: '1.21.30',  type: 'release', date: '2024-09-24', size: 231, changelog: 'Bug fixes and performance improvements' },
  { id: 'bedrock-1.21.20',  number: '1.21.20',  type: 'release', date: '2024-08-21', size: 229, changelog: 'Mace weapon, wind burst enchantment' },
  { id: 'bedrock-1.21.10',  number: '1.21.10',  type: 'release', date: '2024-07-23', size: 228, changelog: 'Trial chambers updates' },
  { id: 'bedrock-1.21.0',   number: '1.21.0',   type: 'release', date: '2024-06-13', size: 225, changelog: 'Tricky Trials - initial release' },
  { id: 'bedrock-1.20.80',  number: '1.20.80',  type: 'release', date: '2024-03-13', size: 220, changelog: 'Armadillo, wolf armor, crafter block' },
  { id: 'bedrock-1.20.73',  number: '1.20.73',  type: 'release', date: '2024-02-20', size: 218, changelog: 'Critical bug fixes' },
  { id: 'bedrock-1.20.62',  number: '1.20.62',  type: 'release', date: '2024-01-23', size: 217, changelog: 'Stability improvements' },
  { id: 'bedrock-1.20.51',  number: '1.20.51',  type: 'release', date: '2023-12-05', size: 215, changelog: 'Camel and sniffer fixes' },
  { id: 'bedrock-1.20.40',  number: '1.20.40',  type: 'release', date: '2023-10-25', size: 213, changelog: 'Recipe unlocking, villager trade rebalance' },
  { id: 'bedrock-1.20.30',  number: '1.20.30',  type: 'release', date: '2023-09-19', size: 211, changelog: 'Bug fixes and accessibility improvements' },
  { id: 'bedrock-1.20.15',  number: '1.20.15',  type: 'release', date: '2023-07-25', size: 210, changelog: 'Trails & Tales patch' },
  { id: 'bedrock-1.20.0',   number: '1.20.0',   type: 'release', date: '2023-06-07', size: 208, changelog: 'Trails & Tales - cherry grove, sniffer, camels' },
  { id: 'bedrock-1.21.50b1','number': '1.21.50 Beta 1', type: 'beta', date: '2024-11-06', size: 235, changelog: 'Experimental features preview' },
  { id: 'bedrock-1.21.50b2','number': '1.21.50 Beta 2', type: 'beta', date: '2024-11-13', size: 236, changelog: 'New blocks and entities' },
  { id: 'bedrock-preview-1','number': '1.22.0 Preview', type: 'preview', date: '2024-12-01', size: 240, changelog: 'Upcoming features preview — unstable' },
];

/** Simulated download speeds (bytes/ms range) for realistic progress */
const DL_SPEED_RANGE = { min: 500, max: 2500 };
/** Max simulated storage (MB) */
const STORAGE_LIMIT_MB = 2048;

/* ──────────────────────────────────────────────────────────
   STORAGE LAYER (IndexedDB with localStorage fallback)
─────────────────────────────────────────────────────────── */

const Storage = (() => {
  const PREFIX = 'bedlauncher_';

  /** Get item (parsed JSON) */
  const get = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };

  /** Set item (JSON stringified) */
  const set = (key, value) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] Write error:', e);
      return false;
    }
  };

  /** Remove item */
  const remove = (key) => {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  };

  /** Clear all BedLauncher keys */
  const clearAll = () => {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
  };

  return { get, set, remove, clearAll };
})();

/* ──────────────────────────────────────────────────────────
   APP STATE
─────────────────────────────────────────────────────────── */

const State = {
  /** Currently logged-in user profile */
  profile: null,
  /** App settings (merged from defaults + stored) */
  settings: {},
  /** Installed versions: { [versionId]: { ...versionData, installedAt, sizeKb } } */
  installed: {},
  /** Downloads: { [versionId]: { ...versionData, progress, status, speed, startTime } } */
  downloads: {},
  /** Currently selected version ID */
  selectedVersion: null,
  /** Activity log entries */
  activityLog: [],
  /** Active screen ID */
  currentScreen: 'login',
};

/** Default settings */
const DEFAULT_SETTINGS = {
  autoclose: false,
  showbeta: true,
  keephistory: true,
  paralleldl: 2,
  ram: 1024,
  resolution: '1080p',
};

/* ──────────────────────────────────────────────────────────
   INITIALIZATION
─────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  bindEvents();

  // Attempt to restore session
  if (State.profile && State.profile.username) {
    navigateTo('home');
    updateHomeUI();
    updateStatsUI();
    updateActivityUI();
  } else {
    navigateTo('login');
  }
});

/** Load persisted state from localStorage */
function loadState() {
  State.profile        = Storage.get('profile', null);
  State.installed      = Storage.get('installed', {});
  State.downloads      = Storage.get('downloads', {});
  State.selectedVersion = Storage.get('selectedVersion', null);
  State.activityLog    = Storage.get('activityLog', []);
  State.settings       = { ...DEFAULT_SETTINGS, ...Storage.get('settings', {}) };

  // Clean up stale in-progress downloads (persisted but not running)
  Object.entries(State.downloads).forEach(([id, dl]) => {
    if (dl.status === 'downloading') {
      dl.status = 'paused';
      dl.progress = dl.progress || 0;
    }
  });
  persistState();
}

/** Persist all mutable state */
function persistState() {
  Storage.set('installed',       State.installed);
  Storage.set('downloads',       State.downloads);
  Storage.set('selectedVersion', State.selectedVersion);
  Storage.set('activityLog',     State.activityLog.slice(0, 50)); // keep last 50
  Storage.set('settings',        State.settings);
}

/* ──────────────────────────────────────────────────────────
   NAVIGATION
─────────────────────────────────────────────────────────── */

/** Navigate to a named screen, handling screen transitions */
function navigateTo(screenId) {
  const prev = document.querySelector('.screen.active');
  const next = document.getElementById('screen-' + screenId);
  if (!next) return;

  // Update bottom nav highlight
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === screenId);
  });

  if (prev && prev !== next) {
    prev.classList.add('slide-out');
    setTimeout(() => {
      prev.classList.remove('active', 'slide-out');
      prev.style.display = '';
    }, 300);
  }

  next.style.display = 'flex';
  requestAnimationFrame(() => {
    next.classList.add('active');
  });

  State.currentScreen = screenId;

  // Screen-specific refresh
  switch (screenId) {
    case 'home':      updateHomeUI(); updateStatsUI(); updateActivityUI(); break;
    case 'versions':  renderVersionsList(); break;
    case 'installed': renderInstalledList(); break;
    case 'downloads': renderDownloadsList(); break;
    case 'settings':  populateSettings(); break;
  }
}

/* ──────────────────────────────────────────────────────────
   EVENT BINDING
─────────────────────────────────────────────────────────── */

function bindEvents() {
  // ── Login ──
  bindLoginEvents();

  // ── Navigation (data-nav attribute on any element) ──
  document.addEventListener('click', e => {
    const navTarget = e.target.closest('[data-nav]');
    if (navTarget) navigateTo(navTarget.dataset.nav);
  });

  // ── Home ──
  qs('#btn-play').addEventListener('click', handlePlay);

  // ── Version manager ──
  qs('#btn-refresh-versions').addEventListener('click', () => {
    showToast('Version list refreshed', 'info');
    renderVersionsList();
  });
  qs('#version-search').addEventListener('input', renderVersionsList);
  qs('.filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    qsAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderVersionsList();
  });

  // ── Installed ──
  qs('#btn-clear-all').addEventListener('click', () => {
    if (Object.keys(State.installed).length === 0) {
      showToast('No installed versions to remove', 'info');
      return;
    }
    showConfirm(
      'Remove All Versions',
      'This will uninstall all downloaded versions. Are you sure?',
      () => {
        State.installed = {};
        State.selectedVersion = null;
        persistState();
        renderInstalledList();
        updateHomeUI();
        updateStatsUI();
        logActivity('All installed versions removed', 'danger');
        showToast('All versions removed', 'success');
      }
    );
  });

  // ── Downloads ──
  qs('#btn-clear-downloads').addEventListener('click', clearCompletedDownloads);

  // ── Settings ──
  bindSettingsEvents();

  // ── Modal: confirm ──
  qs('#modal-confirm-cancel').addEventListener('click', closeConfirm);
  qs('#modal-play-close').addEventListener('click', () => {
    qs('#modal-play').classList.add('hidden');
  });
}

/** Bind login screen events */
function bindLoginEvents() {
  // Mode selector
  qs('.mode-selector').addEventListener('click', e => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    qsAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  // Login button
  qs('#btn-login').addEventListener('click', handleLogin);

  // Enter key on inputs
  qs('#login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  qs('#login-displayname').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
}

/** Bind settings page events */
function bindSettingsEvents() {
  // Edit profile toggle
  qs('#btn-edit-profile').addEventListener('click', () => {
    const section = qs('#edit-profile-section');
    const isVisible = section.style.display !== 'none';
    section.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      qs('#settings-username-input').value  = State.profile.username;
      qs('#settings-displayname-input').value = State.profile.displayname || '';
    }
  });

  qs('#btn-save-profile').addEventListener('click', () => {
    const username = qs('#settings-username-input').value.trim();
    if (!username) { showToast('Username cannot be empty', 'error'); return; }
    State.profile.username    = username;
    State.profile.displayname = qs('#settings-displayname-input').value.trim();
    Storage.set('profile', State.profile);
    qs('#edit-profile-section').style.display = 'none';
    populateSettings();
    updateHomeUI();
    logActivity('Profile updated', 'info');
    showToast('Profile saved', 'success');
  });

  // Toggle settings
  const toggleIds = ['setting-autoclose', 'setting-showbeta', 'setting-keephistory'];
  toggleIds.forEach(id => {
    const el = qs('#' + id);
    el.addEventListener('change', () => {
      const key = id.replace('setting-', '');
      State.settings[key] = el.checked;
      persistState();
      if (key === 'showbeta') renderVersionsList();
    });
  });

  // Select settings
  ['setting-paralleldl', 'setting-ram', 'setting-resolution'].forEach(id => {
    qs('#' + id).addEventListener('change', e => {
      const key = id.replace('setting-', '');
      State.settings[key] = e.target.value;
      persistState();
    });
  });

  // Clear cache
  qs('#btn-clear-cache').addEventListener('click', () => {
    showConfirm('Clear Cache', 'Remove temporary launcher cache data?', () => {
      // Simulated cache clear
      showToast('Cache cleared (32 MB freed)', 'success');
      logActivity('Cache cleared', 'info');
    });
  });

  // Reset launcher
  qs('#btn-reset-launcher').addEventListener('click', () => {
    showConfirm(
      'Reset Launcher',
      'This will delete ALL data including installed versions, settings, and your profile. This cannot be undone.',
      () => {
        Storage.clearAll();
        window.location.reload();
      }
    );
  });

  // Logout
  qs('#btn-logout').addEventListener('click', () => {
    showConfirm('Logout', 'Return to the login screen?', () => {
      Storage.remove('profile');
      State.profile = null;
      navigateTo('login');
    });
  });
}

/* ──────────────────────────────────────────────────────────
   LOGIN LOGIC
─────────────────────────────────────────────────────────── */

function handleLogin() {
  const usernameEl = qs('#login-username');
  const displayEl  = qs('#login-displayname');
  const errorEl    = qs('#login-error');
  const modeBtn    = qs('.mode-btn.active');

  const username = usernameEl.value.trim();
  const displayname = displayEl.value.trim();
  const mode = modeBtn ? modeBtn.dataset.mode : 'offline';

  // Validation
  if (!username) {
    showLoginError('Username is required.');
    usernameEl.focus();
    return;
  }
  if (username.length < 2) {
    showLoginError('Username must be at least 2 characters.');
    return;
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
    showLoginError('Username may only contain letters, numbers, _ and -');
    return;
  }

  errorEl.classList.add('hidden');

  State.profile = {
    username,
    displayname: displayname || username,
    mode,
    createdAt: Date.now(),
  };
  Storage.set('profile', State.profile);

  logActivity(`Logged in as ${State.profile.displayname}`, 'success');
  navigateTo('home');
  updateHomeUI();
  updateStatsUI();
  updateActivityUI();
}

function showLoginError(msg) {
  const el = qs('#login-error');
  el.textContent = '⚠ ' + msg;
  el.classList.remove('hidden');
}

/* ──────────────────────────────────────────────────────────
   VERSION MANAGEMENT
─────────────────────────────────────────────────────────── */

/** Render version list with current filter + search */
function renderVersionsList() {
  const container = qs('#versions-list');
  const searchVal = qs('#version-search').value.toLowerCase();
  const activeFilter = (qs('.filter-btn.active') || {}).dataset?.filter || 'all';

  const filtered = VERSION_CATALOG.filter(v => {
    if (!State.settings.showbeta && (v.type === 'beta' || v.type === 'preview')) return false;
    if (activeFilter !== 'all' && v.type !== activeFilter) return false;
    if (searchVal && !v.number.toLowerCase().includes(searchVal)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⬡</span>
        <span>No versions match your search</span>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(v => buildVersionCard(v)).join('');

  // Bind action buttons in version cards
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const action = e.currentTarget.dataset.action;
      const vId    = e.currentTarget.dataset.vid;
      switch (action) {
        case 'install': startDownload(vId); break;
        case 'select':  selectVersion(vId); break;
        case 'remove':  confirmRemoveVersion(vId); break;
        case 'resume':  resumeDownload(vId); break;
        case 'cancel':  cancelDownload(vId); break;
      }
    });
  });
}

/** Build the HTML for one version card */
function buildVersionCard(v) {
  const isInstalled  = Boolean(State.installed[v.id]);
  const isSelected   = State.selectedVersion === v.id;
  const dl           = State.downloads[v.id];
  const isDownloading = dl && (dl.status === 'downloading' || dl.status === 'queued');

  const badgeLetter = v.type === 'release' ? 'R' : v.type === 'beta' ? 'B' : 'P';
  const selectedClass = isSelected ? 'selected' : '';

  let actions = '';
  if (isDownloading) {
    actions = `
      <button class="btn-install downloading" disabled>⬇ ${dl.progress || 0}%</button>
      <button class="btn-remove-sm" data-action="cancel" data-vid="${v.id}">CANCEL</button>`;
  } else if (isInstalled) {
    actions = `
      <button class="btn-select ${isSelected ? 'active-selection' : ''}" data-action="select" data-vid="${v.id}">
        ${isSelected ? '✓ SELECTED' : 'SELECT'}
      </button>
      <button class="btn-remove-sm" data-action="remove" data-vid="${v.id}">REMOVE</button>`;
  } else {
    const dlFailed = dl && dl.status === 'failed';
    actions = `<button class="btn-install" data-action="${dlFailed ? 'resume' : 'install'}" data-vid="${v.id}">
      ${dlFailed ? '↻ RETRY' : '⬇ INSTALL'}
    </button>`;
  }

  const tags = [
    isInstalled  ? `<span class="version-tag installed">INSTALLED</span>` : '',
    isSelected   ? `<span class="version-tag selected">ACTIVE</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="version-item ${selectedClass}" id="vcard-${v.id}">
      <div class="version-badge ${v.type}">
        <span class="version-badge-letter">${badgeLetter}</span>
        <span class="version-badge-type">${v.type.toUpperCase()}</span>
      </div>
      <div class="version-info">
        <div class="version-number">${escapeHtml(v.number)}</div>
        <div class="version-date">${v.date} · ${v.size} MB</div>
        <div class="version-tags">${tags}</div>
      </div>
      <div class="version-actions">${actions}</div>
    </div>`;
}

/** Set active/selected version */
function selectVersion(vId) {
  if (!State.installed[vId]) return;
  State.selectedVersion = vId;
  persistState();
  updateHomeUI();
  updateStatsUI();
  renderVersionsList();
  if (State.currentScreen === 'installed') renderInstalledList();
  logActivity(`Selected version ${State.installed[vId].number}`, 'info');
  showToast(`Version ${State.installed[vId].number} selected`, 'success');
}

/** Prompt and remove an installed version */
function confirmRemoveVersion(vId) {
  const v = State.installed[vId] || getVersionById(vId);
  if (!v) return;
  showConfirm(
    'Remove Version',
    `Remove Minecraft Bedrock ${v.number}? (${v.size} MB will be freed)`,
    () => {
      delete State.installed[vId];
      if (State.selectedVersion === vId) State.selectedVersion = null;
      persistState();
      renderVersionsList();
      renderInstalledList();
      updateHomeUI();
      updateStatsUI();
      logActivity(`Removed version ${v.number}`, 'danger');
      showToast(`Version ${v.number} removed`, 'success');
    }
  );
}

/** Get version from catalog by ID */
function getVersionById(vId) {
  return VERSION_CATALOG.find(v => v.id === vId) || null;
}

/* ──────────────────────────────────────────────────────────
   DOWNLOAD MANAGER
─────────────────────────────────────────────────────────── */

/** Pending download timers: { [vId]: intervalId } */
const downloadTimers = {};

/** Start downloading a version */
function startDownload(vId) {
  const v = getVersionById(vId);
  if (!v) { showToast('Version not found', 'error'); return; }
  if (State.installed[vId]) { showToast('Already installed', 'info'); return; }
  if (State.downloads[vId]?.status === 'downloading') return;

  // Check active download limit
  const activeCount = Object.values(State.downloads).filter(d => d.status === 'downloading').length;
  const limit = parseInt(State.settings.paralleldl) || 2;

  const dl = {
    ...v,
    progress: 0,
    status: activeCount >= limit ? 'queued' : 'downloading',
    speed: 0,
    startTime: Date.now(),
    downloadedMB: 0,
  };
  State.downloads[vId] = dl;
  persistState();

  updateDownloadBadge();
  renderVersionsList();
  if (State.currentScreen === 'downloads') renderDownloadsList();

  if (dl.status === 'downloading') {
    simulateDownload(vId);
    logActivity(`Started download: ${v.number}`, 'info');
    showToast(`Downloading ${v.number}...`, 'info');
  } else {
    logActivity(`Queued download: ${v.number}`, 'info');
    showToast(`${v.number} added to queue`, 'info');
    processQueue();
  }
}

/** Resume a failed or paused download */
function resumeDownload(vId) {
  const dl = State.downloads[vId];
  if (!dl) { startDownload(vId); return; }
  dl.status = 'downloading';
  dl.startTime = Date.now();
  persistState();
  simulateDownload(vId);
  renderVersionsList();
  if (State.currentScreen === 'downloads') renderDownloadsList();
  showToast(`Resuming ${dl.number}...`, 'info');
}

/** Cancel an active or queued download */
function cancelDownload(vId) {
  if (downloadTimers[vId]) {
    clearInterval(downloadTimers[vId]);
    delete downloadTimers[vId];
  }
  delete State.downloads[vId];
  persistState();
  renderVersionsList();
  if (State.currentScreen === 'downloads') renderDownloadsList();
  updateDownloadBadge();
  updateStatsUI();
  processQueue();
  showToast('Download cancelled', 'info');
}

/**
 * Simulate download progress using setInterval.
 * In a real launcher this would hook into an actual HTTP fetch stream.
 */
function simulateDownload(vId) {
  const dl = State.downloads[vId];
  if (!dl) return;

  const TICK_MS = 250;
  const totalKB = dl.size * 1024;
  let downloadedKB = (dl.progress / 100) * totalKB;

  downloadTimers[vId] = setInterval(() => {
    const currentDl = State.downloads[vId];
    if (!currentDl || currentDl.status !== 'downloading') {
      clearInterval(downloadTimers[vId]);
      delete downloadTimers[vId];
      return;
    }

    // Random speed in KB per tick
    const speedKBs = (Math.random() * (DL_SPEED_RANGE.max - DL_SPEED_RANGE.min) + DL_SPEED_RANGE.min) / 4;
    downloadedKB = Math.min(downloadedKB + speedKBs, totalKB);

    const progress = Math.floor((downloadedKB / totalKB) * 100);
    currentDl.progress     = progress;
    currentDl.downloadedMB = (downloadedKB / 1024).toFixed(1);
    currentDl.speed        = (speedKBs * 4 / 1024).toFixed(1); // MB/s

    // Update UI live
    updateDownloadItemUI(vId);
    updateVersionCardProgress(vId, progress);

    if (progress >= 100) {
      clearInterval(downloadTimers[vId]);
      delete downloadTimers[vId];
      finishDownload(vId);
    }
  }, TICK_MS);
}

/** Called when a download reaches 100% */
function finishDownload(vId) {
  const dl = State.downloads[vId];
  if (!dl) return;

  dl.status   = 'completed';
  dl.progress = 100;
  dl.speed    = 0;

  // Mark as installed
  State.installed[vId] = {
    ...getVersionById(vId),
    installedAt: Date.now(),
    sizeKb: dl.size * 1024,
  };

  // Auto-select if no version selected
  if (!State.selectedVersion) {
    State.selectedVersion = vId;
  }

  persistState();

  // Clean up completed if setting disabled
  if (!State.settings.keephistory) {
    setTimeout(() => { delete State.downloads[vId]; persistState(); }, 3000);
  }

  updateHomeUI();
  updateStatsUI();
  updateDownloadBadge();
  renderVersionsList();
  if (State.currentScreen === 'downloads') renderDownloadsList();
  if (State.currentScreen === 'installed') renderInstalledList();

  logActivity(`Installed ${dl.number}`, 'success');
  showToast(`${dl.number} installed!`, 'success');

  processQueue();
}

/** Move next queued item to downloading status */
function processQueue() {
  const activeCount = Object.values(State.downloads).filter(d => d.status === 'downloading').length;
  const limit = parseInt(State.settings.paralleldl) || 2;
  if (activeCount >= limit) return;

  const queued = Object.entries(State.downloads).find(([, d]) => d.status === 'queued');
  if (!queued) return;

  const [qId] = queued;
  State.downloads[qId].status = 'downloading';
  persistState();
  simulateDownload(qId);
  if (State.currentScreen === 'downloads') renderDownloadsList();
}

/** Update a single download item's live stats in the DOM */
function updateDownloadItemUI(vId) {
  const dl = State.downloads[vId];
  if (!dl) return;

  const pctEl   = document.getElementById(`dl-pct-${vId}`);
  const fillEl  = document.getElementById(`dl-fill-${vId}`);
  const speedEl = document.getElementById(`dl-speed-${vId}`);
  const sizeEl  = document.getElementById(`dl-size-${vId}`);

  if (pctEl)   pctEl.textContent   = dl.progress + '%';
  if (fillEl)  fillEl.style.width  = dl.progress + '%';
  if (speedEl) speedEl.textContent = dl.speed + ' MB/s';
  if (sizeEl)  sizeEl.textContent  = `${dl.downloadedMB} / ${dl.size} MB`;
}

/** Update progress shown in version list card */
function updateVersionCardProgress(vId, progress) {
  const btn = document.querySelector(`#vcard-${vId} .btn-install`);
  if (btn && btn.classList.contains('downloading')) {
    btn.textContent = `⬇ ${progress}%`;
  }
}

/** Render full downloads list */
function renderDownloadsList() {
  const container = qs('#downloads-list');
  const entries = Object.entries(State.downloads);

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⬇</span>
        <span>No active downloads</span>
      </div>`;
    return;
  }

  container.innerHTML = entries.map(([vId, dl]) => buildDownloadCard(vId, dl)).join('');

  container.querySelectorAll('[data-dl-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const action = e.currentTarget.dataset.dlAction;
      const vId    = e.currentTarget.dataset.vid;
      switch (action) {
        case 'cancel': cancelDownload(vId);  break;
        case 'resume': resumeDownload(vId);  break;
        case 'remove': {
          delete State.downloads[vId];
          persistState();
          renderDownloadsList();
          break;
        }
      }
    });
  });
}

/** Build HTML for one download card */
function buildDownloadCard(vId, dl) {
  const pct = dl.progress || 0;
  const statusMap = {
    downloading: 'DOWNLOADING',
    completed:   'COMPLETED',
    failed:      'FAILED',
    queued:      'QUEUED',
    paused:      'PAUSED',
  };
  const statusLabel = statusMap[dl.status] || dl.status.toUpperCase();

  const fillClass = dl.status === 'failed' ? 'error' : dl.status === 'completed' ? 'complete' : '';

  let actions = '';
  if (dl.status === 'downloading') {
    actions = `<button class="dl-btn danger" data-dl-action="cancel" data-vid="${vId}">CANCEL</button>`;
  } else if (dl.status === 'paused' || dl.status === 'failed') {
    actions = `
      <button class="dl-btn" data-dl-action="resume" data-vid="${vId}">RESUME</button>
      <button class="dl-btn danger" data-dl-action="cancel" data-vid="${vId}">CANCEL</button>`;
  } else if (dl.status === 'queued') {
    actions = `<button class="dl-btn danger" data-dl-action="cancel" data-vid="${vId}">CANCEL</button>`;
  } else if (dl.status === 'completed') {
    actions = `<button class="dl-btn" data-dl-action="remove" data-vid="${vId}">CLEAR</button>`;
  }

  return `
    <div class="download-item">
      <div class="dl-header">
        <span class="dl-name">Bedrock ${escapeHtml(dl.number)}</span>
        <span class="dl-status ${dl.status}">${statusLabel}</span>
      </div>
      <div class="dl-progress-bar">
        <div class="dl-progress-fill ${fillClass}" id="dl-fill-${vId}" style="width:${pct}%"></div>
      </div>
      <div class="dl-meta">
        <span class="dl-size" id="dl-size-${vId}">${dl.downloadedMB || 0} / ${dl.size} MB</span>
        <span class="dl-pct" id="dl-pct-${vId}">${pct}%</span>
        <span class="dl-speed" id="dl-speed-${vId}">${dl.speed || 0} MB/s</span>
      </div>
      ${actions ? `<div class="dl-actions">${actions}</div>` : ''}
    </div>`;
}

/** Remove completed downloads from state */
function clearCompletedDownloads() {
  const before = Object.keys(State.downloads).length;
  Object.entries(State.downloads).forEach(([vId, dl]) => {
    if (dl.status === 'completed') delete State.downloads[vId];
  });
  const removed = before - Object.keys(State.downloads).length;
  persistState();
  renderDownloadsList();
  showToast(removed > 0 ? `Cleared ${removed} completed` : 'Nothing to clear', 'info');
}

/* ──────────────────────────────────────────────────────────
   INSTALLED LIST
─────────────────────────────────────────────────────────── */

function renderInstalledList() {
  const container = qs('#installed-list');
  const entries = Object.entries(State.installed);

  updateStorageBar();

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◈</span>
        <span>No versions installed</span>
        <button class="btn-secondary small" data-nav="versions">Browse Versions</button>
      </div>`;
    return;
  }

  container.innerHTML = entries.map(([vId, v]) => {
    const isActive = State.selectedVersion === vId;
    const installedDate = new Date(v.installedAt).toLocaleDateString();
    return `
      <div class="installed-item ${isActive ? 'active-version' : ''}">
        <div class="version-badge ${v.type}">
          <span class="version-badge-letter">${v.type === 'release' ? 'R' : v.type === 'beta' ? 'B' : 'P'}</span>
          <span class="version-badge-type">${v.type.toUpperCase()}</span>
        </div>
        <div class="installed-info">
          <div class="installed-version">${escapeHtml(v.number)}</div>
          <div class="installed-meta">
            <span>${v.size} MB</span>
            <span>Installed ${installedDate}</span>
            ${isActive ? '<span style="color:var(--accent-2)">● ACTIVE</span>' : ''}
          </div>
        </div>
        <div class="installed-actions">
          ${!isActive ? `<button class="btn-select" data-action="select" data-vid="${vId}">SELECT</button>` : ''}
          <button class="btn-remove-sm" data-action="remove" data-vid="${vId}">✕</button>
        </div>
      </div>`;
  }).join('');

  // Bind action buttons
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      const action = e.currentTarget.dataset.action;
      const vId    = e.currentTarget.dataset.vid;
      if (action === 'select') selectVersion(vId);
      if (action === 'remove') confirmRemoveVersion(vId);
    });
  });
}

/** Update the storage usage bar */
function updateStorageBar() {
  const usedMB = Object.values(State.installed).reduce((s, v) => s + (v.size || 0), 0);
  const pct = Math.min((usedMB / STORAGE_LIMIT_MB) * 100, 100);
  qs('#storage-fill').style.width = pct + '%';
  qs('#storage-used-label').textContent = `${usedMB} MB / ${STORAGE_LIMIT_MB} MB`;
}

/* ──────────────────────────────────────────────────────────
   HOME SCREEN UI
─────────────────────────────────────────────────────────── */

function updateHomeUI() {
  if (!State.profile) return;

  // Header
  qs('#header-username').textContent = State.profile.displayname || State.profile.username;
  qs('#header-avatar').textContent   = (State.profile.displayname || State.profile.username)[0].toUpperCase();

  // Active version card
  if (State.selectedVersion && State.installed[State.selectedVersion]) {
    const v = State.installed[State.selectedVersion];
    qs('#avc-version-name').textContent = `Bedrock ${v.number}`;
    qs('#avc-version-meta').textContent  = `${v.type.toUpperCase()} · ${v.size} MB`;
    qs('#btn-play').disabled = false;

    const statusEl = qs('#avc-status');
    statusEl.innerHTML = `<span class="status-dot"></span><span class="status-text">READY</span>`;
  } else {
    qs('#avc-version-name').textContent = 'No version selected';
    qs('#avc-version-meta').textContent = 'Select a version to play';
    qs('#btn-play').disabled = true;
  }
}

function updateStatsUI() {
  const installedCount = Object.keys(State.installed).length;
  const availableCount = VERSION_CATALOG.length - installedCount;
  const usedMB = Object.values(State.installed).reduce((s, v) => s + (v.size || 0), 0);

  qs('#stat-installed').textContent = installedCount;
  qs('#stat-available').textContent = availableCount;
  qs('#stat-storage').textContent   = usedMB >= 1024
    ? (usedMB / 1024).toFixed(1) + ' GB'
    : usedMB + ' MB';
}

function updateActivityUI() {
  const container = qs('#activity-list');
  if (State.activityLog.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }
  container.innerHTML = State.activityLog.slice(0, 8).map(entry => {
    const colorMap = { success: 'var(--accent-2)', danger: 'var(--danger)', info: 'var(--accent)', warn: 'var(--warn)' };
    const color = colorMap[entry.type] || 'var(--text-2)';
    const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="activity-item">
        <div class="activity-dot" style="background:${color};box-shadow:0 0 6px ${color}"></div>
        <span class="activity-text">${escapeHtml(entry.text)}</span>
        <span class="activity-time">${time}</span>
      </div>`;
  }).join('');
}

/** Update the download count badge on Quick Actions */
function updateDownloadBadge() {
  const active = Object.values(State.downloads).filter(d =>
    d.status === 'downloading' || d.status === 'queued'
  ).length;
  const el = qs('#active-dl-count');
  if (el) el.textContent = active > 0 ? `${active} active` : 'No active';
}

/* ──────────────────────────────────────────────────────────
   PLAY MODAL
─────────────────────────────────────────────────────────── */

function handlePlay() {
  if (!State.selectedVersion || !State.installed[State.selectedVersion]) return;
  const v = State.installed[State.selectedVersion];

  const modal   = qs('#modal-play');
  const bar     = qs('#launch-bar');
  const status  = qs('#launch-status');
  const verName = qs('#modal-play-version');
  const closeBtn = qs('#modal-play-close');

  verName.textContent = `Minecraft Bedrock ${v.number}`;
  bar.style.width  = '0%';
  closeBtn.style.display = 'none';
  modal.classList.remove('hidden');

  // Simulate launch sequence
  const steps = [
    { pct: 10, msg: 'Verifying game files...' },
    { pct: 25, msg: 'Loading runtime environment...' },
    { pct: 45, msg: 'Applying user profile...' },
    { pct: 65, msg: 'Initializing renderer...' },
    { pct: 85, msg: 'Loading world data...' },
    { pct: 100, msg: 'Launching Minecraft Bedrock...' },
  ];

  let stepIdx = 0;
  const interval = setInterval(() => {
    if (stepIdx >= steps.length) {
      clearInterval(interval);
      setTimeout(() => {
        status.textContent = '✓ Game launched successfully';
        closeBtn.style.display = 'block';
        logActivity(`Launched Bedrock ${v.number}`, 'success');
        updateActivityUI();
      }, 400);
      return;
    }
    const step = steps[stepIdx++];
    bar.style.width    = step.pct + '%';
    status.textContent = step.msg;
  }, 500);
}

/* ──────────────────────────────────────────────────────────
   SETTINGS PAGE
─────────────────────────────────────────────────────────── */

function populateSettings() {
  if (!State.profile) return;

  qs('#settings-username').textContent = State.profile.username;
  qs('#settings-avatar').textContent   = (State.profile.displayname || State.profile.username)[0].toUpperCase();
  qs('#settings-mode').textContent     = State.profile.mode === 'online' ? 'Online Mode' : 'Offline Mode';

  // Toggles
  qs('#setting-autoclose').checked    = State.settings.autoclose;
  qs('#setting-showbeta').checked     = State.settings.showbeta;
  qs('#setting-keephistory').checked  = State.settings.keephistory;

  // Selects
  qs('#setting-paralleldl').value  = State.settings.paralleldl;
  qs('#setting-ram').value         = State.settings.ram;
  qs('#setting-resolution').value  = State.settings.resolution;

  // Cache size estimate
  const usedMB = Object.values(State.installed).reduce((s, v) => s + (v.size || 0), 0);
  qs('#cache-size-badge').textContent = `~${Math.round(usedMB * 0.05)} MB`;
}

/* ──────────────────────────────────────────────────────────
   ACTIVITY LOG
─────────────────────────────────────────────────────────── */

/** Add an entry to the activity log */
function logActivity(text, type = 'info') {
  State.activityLog.unshift({ text, type, time: Date.now() });
  if (State.activityLog.length > 50) State.activityLog.pop();
  persistState();
  if (State.currentScreen === 'home') updateActivityUI();
}

/* ──────────────────────────────────────────────────────────
   UI UTILITIES
─────────────────────────────────────────────────────────── */

/** Show a confirm modal with OK/Cancel */
let confirmCallback = null;
function showConfirm(title, body, onConfirm) {
  qs('#modal-confirm-title').textContent = title;
  qs('#modal-confirm-body').textContent  = body;
  confirmCallback = onConfirm;
  qs('#modal-confirm').classList.remove('hidden');
}
function closeConfirm() {
  confirmCallback = null;
  qs('#modal-confirm').classList.add('hidden');
}
qs('#modal-confirm-ok').addEventListener('click', () => {
  if (typeof confirmCallback === 'function') confirmCallback();
  closeConfirm();
});

/** Show a temporary toast notification */
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = qs('#toast');
  toast.textContent = message;
  toast.className   = `toast show ${type}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2800);
}

/* ──────────────────────────────────────────────────────────
   HELPER FUNCTIONS
─────────────────────────────────────────────────────────── */

/** Quick querySelector */
function qs(selector) {
  return document.querySelector(selector);
}

/** Quick querySelectorAll */
function qsAll(selector) {
  return document.querySelectorAll(selector);
}

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ──────────────────────────────────────────────────────────
   CLOSE MODALS ON OVERLAY CLICK
─────────────────────────────────────────────────────────── */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
      if (overlay.id === 'modal-confirm') confirmCallback = null;
    }
  });
});
