'use strict';

// ── Firebase ───────────────────────────────────────────────────────────────
// firebaseConfig is loaded from firebase-config.js (gitignored)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── Constants ──────────────────────────────────────────────────────────────
const SESSION_KEY = 'polyquarket_session_v3';
const CURRENT_DATA_VERSION = 1;


const DEFAULT_DATA = {
  meta: { dataVersion: CURRENT_DATA_VERSION },
  users: {
    karen:     { password: '1234', role: 'user',  balance: 670 },
    elizabeth: { password: 'goat', role: 'admin', balance: 670 }
  },
  markets: [
    {
      id: 'demo0',
      title: 'Will Putri win a spherical cow award?',
      description: 'Resolves YES if Putri wins a spherical cow award before June 19, 2026.',
      category: 'Spherical Cow Awards',
      yesPool: 67, noPool: 33,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-06-19'
    },
    {
      id: 'demo1',
      title: 'Will we get back the second years for the oatmeal prank?',
      description: 'Resolves YES if success before December 31, 2026.',
      category: 'Random',
      yesPool: 140, noPool: 65,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo2',
      title: 'Is matcha the best caffinated beverage?',
      description: 'Resolves YES if matcha is determined to be the best caffinated beverage.',
      category: 'Random',
      yesPool: 420, noPool: 0,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo3',
      title: 'Will a Dave win the battle of the Daves?',
      description: 'Resolves YES if a Dave triumphs in the ultimate showdown before December 31, 2026.',
      category: 'Skits',
      yesPool: 180, noPool: 820,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo4',
      title: 'Will this be the best every FTY?',
      description: 'Resolves YES if success before December 31, 2026.',
      category: 'Spherical Cow Awards',
      yesPool: 50, noPool: 95,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo5',
      title: 'Will we find dark matter?',
      description: 'Resolves YES if we find dark matter before December 31, 2026.',
      category: 'Physics',
      yesPool: 300, noPool: 300,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo6',
      title: 'Will the particle succeed?',
      description: 'Resolves YES if the particle is the goat.',
      category: 'Physics',
      yesPool: 667, noPool: 333,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo7',
      title: 'Will Bob Wald make an appearance? ',
      description: 'Resolves YES if Bob Wald spawns in before December 31, 2026.',
      category: 'Skits',
      yesPool: 550, noPool: 450,
      status: 'open', winner: null,
      createdAt: '2026-06-17', endsAt: '2026-12-31'
    },
    {
      id: 'demo8',
      title: 'Did Karen use Claude more than 5 times for this website? :D',
      description: 'Resolves YES if Karen uses Claude on this more than 5 times before June 19, 2026.',
      category: 'Random',
      yesPool: 670, noPool: 330,
      status: 'open', winner: null,
      createdAt: '2003-01-23', endsAt: '2026-06-19'
    },
  ]
};

// ── State ──────────────────────────────────────────────────────────────────
let appData = {};
let currentUser = null;
let activeView = 'login';
let selectedMarketId = null;
let selectedTradeSide = 'yes';
let activeAdminTab = 'markets';
let selectedAdjUser = null;
let loginMode = 'signin';
let marketSearch = '';
let marketCategoryFilter = 'all';

// ── Storage ────────────────────────────────────────────────────────────────
let _dbInitialized = false;

function saveData() {
  db.ref('appData').set(appData);
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function applyMigrations(fromVersion) {
  if (fromVersion < 1) {
    // v1: reset all user balances to 670
    for (const ud of Object.values(appData.users)) {
      ud.balance = 670;
    }
  }
  if (!appData.meta) appData.meta = {};
  appData.meta.dataVersion = CURRENT_DATA_VERSION;
  saveData();
}

function startRealtimeListener() {
  db.ref('appData').on('value', snapshot => {
    const data = snapshot.val();

    if (!_dbInitialized) {
      _dbInitialized = true;
      if (data) {
        appData = data;
        if (!appData.users)        appData.users        = deepCopy(DEFAULT_DATA.users);
        if (!appData.markets)      appData.markets      = deepCopy(DEFAULT_DATA.markets);
        if (!appData.meta)         appData.meta         = { dataVersion: 0 };
        if (!appData.notifyEmails) {
          appData.notifyEmails = ['efield@uchicago.edu'];
          saveData();
        }

        const storedVersion = appData.meta.dataVersion || 0;
        if (storedVersion < CURRENT_DATA_VERSION) {
          applyMigrations(storedVersion);
        }
      } else {
        appData = deepCopy(DEFAULT_DATA);
        saveData();
      }
      if (loadSession()) {
        showView('markets');
      } else {
        showView('login');
      }
      return;
    }

    // Remote update from another client
    if (!data) return;
    appData = data;
    syncCurrentUser();
    if (currentUser) {
      switch (activeView) {
        case 'markets':   renderMarkets();   break;
        case 'portfolio': renderPortfolio(); break;
        case 'admin':     renderAdmin();     break;
      }
      refreshHeader();
    }
  });
}

// ── Session ────────────────────────────────────────────────────────────────
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { username } = JSON.parse(raw);
    if (appData.users[username]) {
      currentUser = { username, ...appData.users[username] };
      return true;
    }
  } catch {}
  return false;
}

function saveSession(username) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username }));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── Auth ───────────────────────────────────────────────────────────────────
function login(username, password) {
  const user = appData.users[username];
  if (!user || user.password !== password) {
    return { success: false, error: 'Invalid username or password.' };
  }
  currentUser = { username, ...user };
  saveSession(username);
  return { success: true };
}

function logout() {
  currentUser = null;
  loginMode = 'signin';
  marketSearch = '';
  marketCategoryFilter = 'all';
  clearSession();
  showView('login');
}

function register(email, username, password, confirmPassword) {
  email    = email.trim().toLowerCase();
  username = username.trim();

  if (!email || !username || !password) {
    return { success: false, error: 'All fields are required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Enter a valid email address.' };
  }
  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match.' };
  }
  if (password.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters.' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { success: false, error: 'Username may only contain letters, numbers, _ and -.' };
  }
  if (appData.users[username]) {
    return { success: false, error: 'That username is already taken.' };
  }
  for (const u of Object.values(appData.users)) {
    if (u.email && u.email === email) {
      return { success: false, error: 'An account with that email already exists.' };
    }
  }

  appData.users[username] = { email, password, role: 'user', balance: 670 };
  saveData();
  return { success: true };
}

// ── Utils ──────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function fmt$(n) {
  return '$' + Number(n).toFixed(2);
}

function fmtPct(v) {
  return Math.round(v * 100) + '%';
}

function yesPrice(market) {
  const total = market.yesPool + market.noPool;
  return total === 0 ? 0.5 : market.yesPool / total;
}

function noPrice(market) {
  return 1 - yesPrice(market);
}

function getUserHolding(marketId) {
  if (!currentUser) return { yes: 0, no: 0 };
  return (appData.users[currentUser.username].holdings || {})[marketId] || { yes: 0, no: 0 };
}

function userData() {
  return currentUser ? appData.users[currentUser.username] : null;
}

function syncCurrentUser() {
  if (currentUser) currentUser = { username: currentUser.username, ...appData.users[currentUser.username] };
}

// ── Market Actions ─────────────────────────────────────────────────────────
function buyShares(marketId, side, rawAmount) {
  const amount = parseFloat(rawAmount);
  if (!amount || amount <= 0) return { success: false, error: 'Enter a valid amount.' };

  const ud = userData();
  if (!ud) return { success: false, error: 'Not logged in.' };
  if (amount > ud.balance + 0.001) return { success: false, error: 'Insufficient balance.' };

  const market = appData.markets.find(m => m.id === marketId);
  if (!market || market.status !== 'open') return { success: false, error: 'Market is not open.' };

  const spend = Math.min(amount, ud.balance);
  ud.balance = +((ud.balance - spend).toFixed(2));

  if (side === 'yes') market.yesPool = +((market.yesPool + spend).toFixed(2));
  else                market.noPool  = +((market.noPool  + spend).toFixed(2));

  if (!ud.holdings) ud.holdings = {};
  if (!ud.holdings[marketId]) ud.holdings[marketId] = { yes: 0, no: 0 };
  ud.holdings[marketId][side] = +((ud.holdings[marketId][side] + spend).toFixed(2));

  syncCurrentUser();
  saveData();
  return { success: true };
}

function resolveMarket(marketId, winner) {
  const market = appData.markets.find(m => m.id === marketId);
  if (!market || market.status !== 'open') return { success: false, error: 'Cannot resolve.' };

  market.status = 'resolved';
  market.winner = winner;

  const total       = market.yesPool + market.noPool;
  const winningPool = winner === 'yes' ? market.yesPool : market.noPool;

  for (const [, ud] of Object.entries(appData.users)) {
    const h = (ud.holdings || {})[marketId];
    if (!h) continue;
    const bet = h[winner] || 0;
    if (bet > 0 && winningPool > 0) {
      ud.balance = +((ud.balance + (bet / winningPool) * total).toFixed(2));
    }
    delete ud.holdings[marketId];
  }

  syncCurrentUser();
  saveData();
  return { success: true };
}

function adjustBalance(username, delta) {
  const ud = appData.users[username];
  if (!ud) return { success: false, error: 'User not found.' };
  const newBalance = +((ud.balance + delta).toFixed(2));
  if (newBalance < 0) return { success: false, error: 'Balance cannot go below $0.' };
  ud.balance = newBalance;
  syncCurrentUser();
  saveData();
  return { success: true };
}

function addMarket(title, description, category, endsAt, yesPool, noPool) {
  if (!title.trim()) return { success: false, error: 'Title is required.' };
  const yp = yesPool !== '' && yesPool !== undefined ? parseFloat(yesPool) : 500;
  const np = noPool  !== '' && noPool  !== undefined ? parseFloat(noPool)  : 500;
  if (isNaN(yp) || yp < 0) return { success: false, error: 'YES pool must be a non-negative number.' };
  if (isNaN(np) || np < 0) return { success: false, error: 'NO pool must be a non-negative number.' };
  const market = {
    id: 'm' + Date.now(),
    title: title.trim(),
    description: description.trim(),
    category: category || 'Random',
    yesPool: +yp.toFixed(2), noPool: +np.toFixed(2),
    status: 'open', winner: null,
    createdAt: new Date().toISOString().slice(0, 10),
    endsAt: endsAt || ''
  };
  appData.markets.unshift(market);
  saveData();
  return { success: true };
}

function deleteMarket(marketId) {
  const idx = appData.markets.findIndex(m => m.id === marketId);
  if (idx === -1) return { success: false, error: 'Not found.' };

  const market = appData.markets[idx];
  if (market.status === 'open') {
    for (const [, ud] of Object.entries(appData.users)) {
      const h = (ud.holdings || {})[marketId];
      if (h) {
        ud.balance = +((ud.balance + (h.yes || 0) + (h.no || 0)).toFixed(2));
        delete ud.holdings[marketId];
      }
    }
  }

  appData.markets.splice(idx, 1);
  syncCurrentUser();
  saveData();
  return { success: true };
}

// ── View Management ────────────────────────────────────────────────────────
function showView(view) {
  if ((view === 'admin' || view === 'portfolio' || view === 'markets') && !currentUser) {
    view = 'login';
  }
  if (view === 'admin' && currentUser?.role !== 'admin') {
    view = 'markets';
  }

  activeView = view;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-loading')?.classList.remove('active');
  document.getElementById('view-' + view)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view)
  );

  const header = document.getElementById('main-header');
  if (!header) return;

  if (!currentUser || view === 'login') {
    header.style.display = 'none';
  } else {
    header.style.display = 'flex';
    const ud = userData();
    document.getElementById('header-balance').textContent  = fmt$(ud.balance);
    document.getElementById('header-username').textContent = currentUser.username;
    document.getElementById('header-role').textContent     = currentUser.role;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = currentUser.username[0].toUpperCase();
    const adminLink = document.getElementById('nav-admin');
    if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? '' : 'none';
  }

  switch (view) {
    case 'login':     renderLogin();     break;
    case 'markets':   renderMarkets();   break;
    case 'portfolio': renderPortfolio(); break;
    case 'admin':     renderAdmin();     break;
  }
}

function refreshHeader() {
  if (!currentUser) return;
  const ud = userData();
  if (ud) document.getElementById('header-balance').textContent = fmt$(ud.balance);
}

// ── Render: Login ──────────────────────────────────────────────────────────
function renderLogin() {
  const mode = loginMode; // 'signin' | 'register' | 'forgot'

  let formHTML = '';

  if (mode === 'register') {
    formHTML = `
      <form id="auth-form">
        <div class="field">
          <label>Email</label>
          <input id="inp-email" type="email" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="field">
          <label>Username</label>
          <input id="inp-user" type="text" placeholder="username" autocomplete="username">
        </div>
        <div class="field">
          <label>Password</label>
          <input id="inp-pass" type="password" placeholder="password" autocomplete="new-password">
        </div>
        <div class="field">
          <label>Confirm Password</label>
          <input id="inp-pass2" type="password" placeholder="confirm password" autocomplete="new-password">
        </div>
        <div id="auth-err" class="err-msg" style="display:none"></div>
        <button type="submit" class="btn btn-primary w-full mt-4">Create Account</button>
      </form>
      <p class="login-switch">Already have an account? <a href="#" id="link-signin">Sign in</a></p>
    `;
  } else if (mode === 'forgot') {
    const contacts = (appData.notifyEmails || []);
    formHTML = `
      <div class="forgot-info">
        <p class="forgot-desc">To find/reset your username/password, contact an admin with your username or email address.</p>
        ${contacts.length ? `
          <div class="forgot-contacts">
            <span class="forgot-contacts-label">Admin contact${contacts.length > 1 ? 's' : ''}:</span>
            ${contacts.map(e => `<a href="mailto:${esc(e)}" class="forgot-email-link">${esc(e)}</a>`).join('')}
          </div>
        ` : ''}
      </div>
      <p class="login-switch"><a href="#" id="link-signin">Back to sign in</a></p>
    `;
  } else {
    formHTML = `
      <form id="auth-form">
        <div class="field">
          <label>Username</label>
          <input id="inp-user" type="text" placeholder="username" autocomplete="username">
        </div>
        <div class="field">
          <label>Password</label>
          <input id="inp-pass" type="password" placeholder="password" autocomplete="current-password">
        </div>
        <div id="auth-err" class="err-msg" style="display:none"></div>
        <button type="submit" class="btn btn-primary w-full mt-4">Sign In</button>
      </form>
      <div class="login-links">
        <a href="#" id="link-forgot">Forgot username/password?</a>
        <a href="#" id="link-register">Create an account</a>
      </div>
    `;
  }

  document.getElementById('view-login').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand">
          <img src="logo.png" alt="Polyquarket" class="brand-logo">
          <span class="brand-name">Polyquarket</span>
        </div>
        <p class="login-tagline">Predict. Trade. Profit.</p>
        ${formHTML}
      </div>
    </div>
  `;

  // Navigation links
  document.getElementById('link-signin')?.addEventListener('click', e => {
    e.preventDefault(); loginMode = 'signin'; renderLogin();
  });
  document.getElementById('link-register')?.addEventListener('click', e => {
    e.preventDefault(); loginMode = 'register'; renderLogin();
  });
  document.getElementById('link-forgot')?.addEventListener('click', e => {
    e.preventDefault(); loginMode = 'forgot'; renderLogin();
  });

  // Form submit (not present in 'forgot' mode)
  document.getElementById('auth-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const errEl = document.getElementById('auth-err');
    errEl.style.display = 'none';

    if (mode === 'register') {
      const res = register(
        document.getElementById('inp-email').value,
        document.getElementById('inp-user').value,
        document.getElementById('inp-pass').value,
        document.getElementById('inp-pass2').value
      );
      if (res.success) {
        login(document.getElementById('inp-user').value.trim(), document.getElementById('inp-pass').value);
        showView('markets');
      } else {
        errEl.textContent = res.error;
        errEl.style.display = 'block';
      }
    } else {
      const res = login(
        document.getElementById('inp-user').value.trim(),
        document.getElementById('inp-pass').value
      );
      if (res.success) {
        showView('markets');
      } else {
        errEl.textContent = res.error;
        errEl.style.display = 'block';
      }
    }
  });
}

// ── Render: Markets ────────────────────────────────────────────────────────
function renderMarkets() {
  const allCategories = [...new Set(appData.markets.map(m => m.category))].sort();
  const totalVol      = appData.markets.reduce((s, m) => s + m.yesPool + m.noPool, 0);
  const openCount     = appData.markets.filter(m => m.status === 'open').length;
  const resolvedCount = appData.markets.filter(m => m.status === 'resolved').length;

  document.getElementById('view-markets').innerHTML = `
    <div class="page-inner">
      <div class="page-hero">
        <h2 class="hero-title">Prediction Markets</h2>
        <p class="hero-sub">Trade on real-world outcomes</p>
      </div>

      <div class="stat-row">
        <div class="stat-box">
          <div class="stat-val">${openCount}</div>
          <div class="stat-lbl">Open Markets</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${fmt$(totalVol)}</div>
          <div class="stat-lbl">Total Volume</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${resolvedCount}</div>
          <div class="stat-lbl">Resolved</div>
        </div>
      </div>

      <div class="market-controls">
        <div class="market-search-wrap">
          <input id="market-search" class="market-search-input" type="text" placeholder="Search markets…">
        </div>
        <select id="market-cat-filter" class="market-cat-select">
          <option value="all">All Categories</option>
          ${allCategories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>

      <div id="market-list-container"></div>
    </div>
  `;

  const searchEl = document.getElementById('market-search');
  const catEl    = document.getElementById('market-cat-filter');
  searchEl.value = marketSearch;
  catEl.value    = marketCategoryFilter;

  searchEl.addEventListener('input', e => {
    marketSearch = e.target.value;
    applyMarketFilters();
  });
  catEl.addEventListener('change', e => {
    marketCategoryFilter = e.target.value;
    applyMarketFilters();
  });

  applyMarketFilters();
}

function applyMarketFilters() {
  let filtered = appData.markets;
  if (marketSearch) {
    const q = marketSearch.toLowerCase();
    filtered = filtered.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q)
    );
  }
  if (marketCategoryFilter !== 'all') {
    filtered = filtered.filter(m => m.category === marketCategoryFilter);
  }

  const open     = filtered.filter(m => m.status === 'open');
  const resolved = filtered.filter(m => m.status === 'resolved');
  const container = document.getElementById('market-list-container');
  if (!container) return;

  const hasFilters = marketSearch || marketCategoryFilter !== 'all';

  container.innerHTML = `
    ${open.length ? `
      <h3 class="section-head">Open Markets</h3>
      <div class="market-grid">
        ${open.map(marketCard).join('')}
      </div>
    ` : !hasFilters ? `<div class="empty-state"><p>No open markets yet.</p>${currentUser?.role === 'admin' ? '<p>Create one in the <a href="#" onclick="showView(\'admin\')">Admin panel</a>.</p>' : ''}</div>` : ''}

    ${resolved.length ? `
      <h3 class="section-head mt-8">Resolved Markets</h3>
      <div class="market-grid">
        ${resolved.map(marketCard).join('')}
      </div>
    ` : ''}

    ${!open.length && !resolved.length && hasFilters ? `
      <div class="empty-state"><p>No markets match your search.</p></div>
    ` : ''}
  `;

  container.querySelectorAll('.market-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

const CAT_COLORS = {
  Physics: '#0ea5e9', Skits: '#7c3aed', 'Spherical Cow Awards': '#f59e0b', Random: '#6b7280'
};

function marketCard(m) {
  const yp = yesPrice(m);
  const vol = m.yesPool + m.noPool;
  const h = getUserHolding(m.id);
  const hasPos = h.yes > 0 || h.no > 0;
  const color = CAT_COLORS[m.category] || '#6b7280';
  const resolved = m.status === 'resolved';

  return `
    <div class="market-card ${resolved ? 'is-resolved' : ''}" data-id="${m.id}">
      <div class="card-top">
        <span class="cat-badge" style="color:${color};background:${color}22">${esc(m.category)}</span>
        ${hasPos ? '<span class="pos-dot" title="You have a position">●</span>' : ''}
        ${resolved ? `<span class="res-tag ${m.winner}">${m.winner === 'yes' ? '✓ YES' : '✗ NO'}</span>` : ''}
      </div>
      <p class="card-title">${esc(m.title)}</p>
      <div class="prob-row">
        <span class="prob yes">${fmtPct(yp)}</span>
        <div class="prob-bar-wrap">
          <div class="prob-bar-fill" style="width:${yp*100}%"></div>
        </div>
        <span class="prob no">${fmtPct(1-yp)}</span>
      </div>
      <div class="card-foot">
        <span>Vol ${fmt$(vol)}</span>
        ${m.endsAt ? `<span>${m.endsAt}</span>` : ''}
      </div>
    </div>
  `;
}

// ── Render: Portfolio ──────────────────────────────────────────────────────
function renderPortfolio() {
  const ud = userData();
  if (!ud) return;
  const positions = Object.entries(ud.holdings || {})
    .map(([mid, h]) => ({ market: appData.markets.find(m => m.id === mid), h }))
    .filter(p => p.market);
  const invested = positions.reduce((s, p) => s + (p.h.yes||0) + (p.h.no||0), 0);

  document.getElementById('view-portfolio').innerHTML = `
    <div class="page-inner">
      <div class="page-hero">
        <h2 class="hero-title">Portfolio</h2>
        <p class="hero-sub">Your balance and open positions</p>
      </div>

      <div class="stat-row">
        <div class="stat-box big">
          <div class="stat-val big">${fmt$(ud.balance)}</div>
          <div class="stat-lbl">Available Balance</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${fmt$(invested)}</div>
          <div class="stat-lbl">Total Invested</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${positions.length}</div>
          <div class="stat-lbl">Open Positions</div>
        </div>
      </div>

      ${positions.length ? `
        <h3 class="section-head">Your Positions</h3>
        <div class="position-list">
          ${positions.map(positionCard).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>No positions yet.</p>
          <button class="btn btn-primary mt-4" onclick="showView('markets')">Browse Markets</button>
        </div>
      `}
    </div>
  `;
  document.querySelectorAll('.pos-card').forEach(card => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

function positionCard({ market: m, h }) {
  const yp = yesPrice(m);
  const np = noPrice(m);
  const yv = (h.yes > 0 && m.yesPool > 0) ? (h.yes / m.yesPool) * (m.yesPool + m.noPool) : 0;
  const nv = (h.no  > 0 && m.noPool  > 0) ? (h.no  / m.noPool)  * (m.yesPool + m.noPool) : 0;
  const invested = (h.yes||0) + (h.no||0);
  const current  = yv + nv;

  return `
    <div class="pos-card" data-id="${m.id}">
      <div class="pos-head">
        <span class="status-badge ${m.status}">${m.status}</span>
        <span class="pos-cat">${esc(m.category)}</span>
      </div>
      <p class="pos-title">${esc(m.title)}</p>
      <div class="pos-sides">
        ${h.yes > 0 ? `
          <div class="pos-side yes">
            <span class="side-name">YES <em>${fmtPct(yp)}</em></span>
            <span>Invested ${fmt$(h.yes)}</span>
            <span>Value ${fmt$(yv)}</span>
            <span class="pnl ${yv >= h.yes ? 'pos' : 'neg'}">${yv >= h.yes?'+':''}${fmt$(yv - h.yes)}</span>
          </div>
        ` : ''}
        ${h.no > 0 ? `
          <div class="pos-side no">
            <span class="side-name">NO <em>${fmtPct(np)}</em></span>
            <span>Invested ${fmt$(h.no)}</span>
            <span>Value ${fmt$(nv)}</span>
            <span class="pnl ${nv >= h.no ? 'pos' : 'neg'}">${nv >= h.no?'+':''}${fmt$(nv - h.no)}</span>
          </div>
        ` : ''}
      </div>
      <div class="pos-foot">
        <span>Total invested: ${fmt$(invested)}</span>
        <span class="${current >= invested ? 'pnl pos' : 'pnl neg'}">Current est. value: ${fmt$(current)}</span>
      </div>
    </div>
  `;
}

// ── Render: Admin ──────────────────────────────────────────────────────────
function renderAdmin() {
  if (currentUser?.role !== 'admin') { showView('markets'); return; }

  document.getElementById('view-admin').innerHTML = `
    <div class="page-inner">
      <div class="page-hero">
        <h2 class="hero-title">Admin Panel</h2>
        <p class="hero-sub">Manage markets and users</p>
      </div>

      <div class="admin-tabs">
        <button class="admin-tab ${activeAdminTab === 'markets' ? 'active' : ''}" data-tab="markets">Markets</button>
        <button class="admin-tab ${activeAdminTab === 'users' ? 'active' : ''}" data-tab="users">Users (${Object.keys(appData.users).length})</button>
      </div>

      <!-- Markets Tab -->
      <div id="admin-tab-markets" class="admin-tab-panel ${activeAdminTab === 'markets' ? 'active' : ''}">
        <div class="admin-layout">
          <div class="admin-form-wrap">
            <h3 class="section-head">Create Market</h3>
            <form id="add-form" class="admin-form">
              <div class="field">
                <label>Question *</label>
                <input id="f-title" type="text" placeholder="Will X happen by Y?" maxlength="200">
              </div>
              <div class="field">
                <label>Description / Resolution Criteria</label>
                <textarea id="f-desc" rows="3" placeholder="How does this market resolve?"></textarea>
              </div>
              <div class="field">
                <label>Category</label>
                <select id="f-cat">
                  <option>Physics</option>
                  <option>Skits</option>
                  <option>Spherical Cow Awards</option>
                  <option>Random</option>
                </select>
              </div>
              <div class="field">
                <label>End Date</label>
                <input id="f-ends" type="date">
              </div>
              <div class="field">
                <label class="pool-label-row">
                  Starting Pools
                  <span class="pool-hint">recommended total: $1000</span>
                </label>
                <div class="pool-inputs-row">
                  <div class="pool-input-wrap">
                    <span class="pool-tag yes">YES</span>
                    <span class="amount-prefix">$</span>
                    <input id="f-yes-pool" type="number" min="0" step="0.01" placeholder="500">
                  </div>
                  <div class="pool-input-wrap">
                    <span class="pool-tag no">NO</span>
                    <span class="amount-prefix">$</span>
                    <input id="f-no-pool" type="number" min="0" step="0.01" placeholder="500">
                  </div>
                </div>
              </div>
              <div id="add-err" class="err-msg" style="display:none"></div>
              <button type="submit" class="btn btn-primary w-full">Create Market</button>
            </form>
          </div>

          <div class="admin-list-wrap">
            <h3 class="section-head">All Markets (${appData.markets.length})</h3>
            <div id="admin-market-list">
              ${appData.markets.length === 0 ? '<p class="hint-txt">No markets yet.</p>' :
                appData.markets.map(adminMarketRow).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Users Tab -->
      <div id="admin-tab-users" class="admin-tab-panel ${activeAdminTab === 'users' ? 'active' : ''}">
        <div class="users-admin-wrap">
          <div class="users-admin-search-row">
            <input id="user-search" type="text" placeholder="Search users by name…" class="user-search-input">
          </div>
          <div class="users-admin-table-wrap">
            <div class="users-admin-thead">
              <span>Username</span><span>Role</span><span>Balance</span>
            </div>
            <div id="users-admin-tbody">
              ${usersAdminRows(Object.entries(appData.users))}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Tab switching ──
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeAdminTab = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === activeAdminTab)
      );
      document.querySelectorAll('.admin-tab-panel').forEach(p =>
        p.classList.toggle('active', p.id === `admin-tab-${activeAdminTab}`)
      );
    });
  });

  // ── Markets tab listeners ──
  document.getElementById('add-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const res = addMarket(
      document.getElementById('f-title').value,
      document.getElementById('f-desc').value,
      document.getElementById('f-cat').value,
      document.getElementById('f-ends').value,
      document.getElementById('f-yes-pool').value,
      document.getElementById('f-no-pool').value
    );
    if (res.success) {
      showToast('Market created!', 'success');
      document.getElementById('add-form').reset();
      renderAdmin();
    } else {
      const el = document.getElementById('add-err');
      el.textContent = res.error;
      el.style.display = 'block';
    }
  });

  document.querySelectorAll('.resolve-yes-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Resolve "${btn.dataset.title}" as YES?`)) {
        const res = resolveMarket(btn.dataset.id, 'yes');
        if (res.success) { showToast('Resolved YES — winnings distributed!', 'success'); renderAdmin(); refreshHeader(); }
      }
    })
  );

  document.querySelectorAll('.resolve-no-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Resolve "${btn.dataset.title}" as NO?`)) {
        const res = resolveMarket(btn.dataset.id, 'no');
        if (res.success) { showToast('Resolved NO — winnings distributed!', 'success'); renderAdmin(); refreshHeader(); }
      }
    })
  );

  document.querySelectorAll('.delete-market-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Delete this market? Open positions will be refunded.')) {
        const res = deleteMarket(btn.dataset.id);
        if (res.success) { showToast('Market deleted. Positions refunded.', 'success'); renderAdmin(); refreshHeader(); }
      }
    })
  );

  // ── Users tab listeners ──
  document.getElementById('user-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = Object.entries(appData.users).filter(([name, u]) =>
      name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
    document.getElementById('users-admin-tbody').innerHTML = usersAdminRows(filtered);
    bindUserRows();
  });

  bindUserRows();
  bindAdjButtons();
}

function usersAdminRows(entries) {
  if (!entries.length) return '<p class="hint-txt" style="padding:14px 16px">No users match.</p>';
  return entries.map(([name, u]) => `
    <div class="users-admin-row ${selectedAdjUser === name ? 'selected' : ''}" data-username="${esc(name)}">
      <span class="uar-identity">
        <span class="uar-name">${esc(name)}</span>
        ${u.email ? `<span class="uar-email">${esc(u.email)}</span>` : ''}
      </span>
      <span class="role-badge ${u.role}">${u.role}</span>
      <span>${fmt$(u.balance)}</span>
    </div>
  `).join('');
}

function adjPanelHTML() {
  if (!selectedAdjUser || !appData.users[selectedAdjUser]) {
    return '<p class="adj-prompt">Select a user above to adjust their balance.</p>';
  }
  const u = appData.users[selectedAdjUser];
  return `
    <div class="adj-user-info">
      <span class="adj-user-name">${esc(selectedAdjUser)}</span>
      <span class="adj-user-bal" id="adj-cur-bal">${fmt$(u.balance)}</span>
    </div>
    <div class="adj-controls">
      <div class="amount-row">
        <span class="amount-prefix">$</span>
        <input id="adj-amount" type="number" step="0.01" placeholder="0.00" min="0.01">
      </div>
      <button class="btn btn-yes"    id="adj-add-btn">+ Add</button>
      <button class="btn btn-danger" id="adj-sub-btn">− Subtract</button>
    </div>
    <div id="adj-err" class="err-msg" style="display:none"></div>
  `;
}

function bindUserRows() {
  document.querySelectorAll('.users-admin-row').forEach(row => {
    row.addEventListener('click', () => {
      const wasSelected = selectedAdjUser === row.dataset.username;
      selectedAdjUser = wasSelected ? null : row.dataset.username;
      document.querySelectorAll('.users-admin-row').forEach(r =>
        r.classList.toggle('selected', r.dataset.username === selectedAdjUser)
      );
      document.querySelectorAll('.users-adj-inline').forEach(el => el.remove());
      if (selectedAdjUser) {
        const panel = document.createElement('div');
        panel.className = 'users-adj-inline';
        panel.innerHTML = adjPanelHTML();
        row.after(panel);
        bindAdjButtons();
      }
    });
  });
}

function bindAdjButtons() {
  if (!selectedAdjUser) return;
  const doAdjust = sign => {
    const raw    = parseFloat(document.getElementById('adj-amount')?.value);
    const errEl  = document.getElementById('adj-err');
    errEl.style.display = 'none';
    if (!raw || raw <= 0) {
      errEl.textContent = 'Enter a positive amount.';
      errEl.style.display = 'block';
      return;
    }
    const res = adjustBalance(selectedAdjUser, sign * raw);
    if (res.success) {
      showToast(`Balance updated for ${selectedAdjUser}!`, 'success');
      document.getElementById('adj-amount').value = '';
      const balEl = document.getElementById('adj-cur-bal');
      if (balEl) balEl.textContent = fmt$(appData.users[selectedAdjUser].balance);
      document.querySelectorAll('.users-admin-row').forEach(r => {
        if (r.dataset.username === selectedAdjUser) {
          r.querySelectorAll('span')[2].textContent = fmt$(appData.users[selectedAdjUser].balance);
        }
      });
      refreshHeader();
    } else {
      errEl.textContent = res.error;
      errEl.style.display = 'block';
    }
  };
  document.getElementById('adj-add-btn')?.addEventListener('click', () => doAdjust(1));
  document.getElementById('adj-sub-btn')?.addEventListener('click', () => doAdjust(-1));
}

function adminMarketRow(m) {
  const vol = m.yesPool + m.noPool;
  const yp  = yesPrice(m);

  return `
    <div class="admin-row ${m.status}">
      <div class="admin-row-info">
        <div class="admin-row-meta">
          <span class="status-badge ${m.status}">${m.status}</span>
          <span class="pos-cat">${esc(m.category)}</span>
          ${m.winner ? `<span class="res-tag ${m.winner}">${m.winner === 'yes' ? '✓ YES' : '✗ NO'}</span>` : ''}
        </div>
        <p class="admin-row-title">${esc(m.title)}</p>
        <div class="admin-row-stats">
          <span>YES ${fmtPct(yp)}</span>
          <span>Vol ${fmt$(vol)}</span>
          ${m.endsAt ? `<span>${m.endsAt}</span>` : ''}
        </div>
      </div>
      <div class="admin-row-actions">
        ${m.status === 'open' ? `
          <button class="btn btn-yes resolve-yes-btn" data-id="${m.id}" data-title="${esc(m.title)}">✓ YES</button>
          <button class="btn btn-no  resolve-no-btn"  data-id="${m.id}" data-title="${esc(m.title)}">✗ NO</button>
        ` : ''}
        <button class="btn btn-danger delete-market-btn" data-id="${m.id}">Delete</button>
      </div>
    </div>
  `;
}

// ── Modal ──────────────────────────────────────────────────────────────────
function openModal(marketId) {
  const m = appData.markets.find(x => x.id === marketId);
  if (!m) return;

  selectedMarketId  = marketId;
  selectedTradeSide = 'yes';

  const yp   = yesPrice(m);
  const np   = noPrice(m);
  const h    = getUserHolding(marketId);
  const ud   = userData();
  const vol  = m.yesPool + m.noPool;
  const hasPos = h.yes > 0 || h.no > 0;

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-head">
      <span class="cat-badge" style="color:${CAT_COLORS[m.category]||'#6b7280'};background:${CAT_COLORS[m.category]||'#6b7280'}22">${esc(m.category)}</span>
      <button class="modal-close-btn" onclick="closeModal()">×</button>
    </div>

    <h2 class="modal-title">${esc(m.title)}</h2>
    ${m.description ? `<p class="modal-desc">${esc(m.description)}</p>` : ''}

    <div class="modal-probs">
      <div class="modal-prob yes">
        <div class="mp-val">${fmtPct(yp)}</div>
        <div class="mp-lbl">YES</div>
      </div>
      <div class="mp-bar-wrap">
        <div class="mp-bar-fill" style="width:${yp*100}%"></div>
      </div>
      <div class="modal-prob no">
        <div class="mp-val">${fmtPct(np)}</div>
        <div class="mp-lbl">NO</div>
      </div>
    </div>

    <div class="modal-stats-row">
      <div class="ms"><span class="ms-l">Volume</span><span class="ms-v">${fmt$(vol)}</span></div>
      <div class="ms"><span class="ms-l">YES Pool</span><span class="ms-v yes">${fmt$(m.yesPool)}</span></div>
      <div class="ms"><span class="ms-l">NO Pool</span><span class="ms-v no">${fmt$(m.noPool)}</span></div>
      ${m.endsAt ? `<div class="ms"><span class="ms-l">Ends</span><span class="ms-v">${m.endsAt}</span></div>` : ''}
    </div>

    ${hasPos ? `
      <div class="modal-pos-row">
        <span class="modal-pos-label">Your position:</span>
        ${h.yes > 0 ? `<span class="pos-chip yes">YES ${fmt$(h.yes)}</span>` : ''}
        ${h.no  > 0 ? `<span class="pos-chip no">NO ${fmt$(h.no)}</span>`  : ''}
      </div>
    ` : ''}

    ${m.status === 'resolved' ? `
      <div class="resolved-banner ${m.winner}">
        <span class="rb-icon">${m.winner === 'yes' ? '✓' : '✗'}</span>
        <span>Resolved <strong>${m.winner?.toUpperCase()}</strong></span>
      </div>
    ` : `
      <div class="trade-panel">
        <div class="trade-header">
          <span class="trade-title">Place Trade</span>
          <span class="trade-bal">Balance: <strong>${fmt$(ud.balance)}</strong></span>
        </div>

        <div class="side-btns">
          <button id="side-yes" class="side-btn active yes" onclick="selectSide('yes')">
            <span class="sb-pct">${fmtPct(yp)}</span>
            <span class="sb-lbl">Buy YES</span>
          </button>
          <button id="side-no" class="side-btn no" onclick="selectSide('no')">
            <span class="sb-pct">${fmtPct(np)}</span>
            <span class="sb-lbl">Buy NO</span>
          </button>
        </div>

        <div class="amount-wrap">
          <label>Amount</label>
          <div class="amount-row">
            <span class="amount-prefix">$</span>
            <input id="trade-amt" type="number" placeholder="0.00" min="0.01" step="0.01" max="${ud.balance}" oninput="updateEstimate()">
            <button class="btn btn-ghost max-btn" onclick="setAmt(${ud.balance})">MAX</button>
          </div>
          <div class="quick-btns">
            ${[5, 10, 20, 50].filter(v => v <= ud.balance + 0.001).map(v =>
              `<button class="quick-btn" onclick="setAmt(${Math.min(v, ud.balance).toFixed(2)})">${fmt$(v)}</button>`
            ).join('')}
          </div>
        </div>

        <div id="estimate-row" class="estimate-row" style="display:none">
          <span>Estimated payout if correct:</span>
          <span id="estimate-val" class="estimate-val"></span>
        </div>

        <div id="trade-err" class="err-msg" style="display:none"></div>

        <button id="trade-btn" class="btn btn-yes btn-large w-full" onclick="executeTrade()">
          Buy YES
        </button>
      </div>
    `}

    ${currentUser?.role === 'admin' && m.status === 'open' ? `
      <div class="modal-admin-bar">
        <span class="modal-admin-label">Admin:</span>
        <button class="btn btn-yes" onclick="adminResolve('yes')">Resolve YES ✓</button>
        <button class="btn btn-no"  onclick="adminResolve('no')">Resolve NO ✗</button>
      </div>
    ` : ''}
  `;

  document.getElementById('market-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('market-modal').classList.remove('open');
  selectedMarketId  = null;
  selectedTradeSide = 'yes';
}

function selectSide(side) {
  selectedTradeSide = side;
  document.getElementById('side-yes')?.classList.toggle('active', side === 'yes');
  document.getElementById('side-no')?.classList.toggle('active', side === 'no');
  const btn = document.getElementById('trade-btn');
  if (btn) {
    btn.textContent  = `Buy ${side.toUpperCase()}`;
    btn.className    = `btn btn-${side} btn-large w-full`;
  }
  updateEstimate();
}

function setAmt(amount) {
  const inp = document.getElementById('trade-amt');
  if (inp) { inp.value = parseFloat(amount).toFixed(2); updateEstimate(); }
}

function updateEstimate() {
  const m = appData.markets.find(x => x.id === selectedMarketId);
  if (!m) return;
  const amount = parseFloat(document.getElementById('trade-amt')?.value) || 0;
  const row    = document.getElementById('estimate-row');
  if (!row) return;
  if (amount <= 0) { row.style.display = 'none'; return; }

  const pool      = selectedTradeSide === 'yes' ? m.yesPool : m.noPool;
  const otherPool = selectedTradeSide === 'yes' ? m.noPool  : m.yesPool;
  const newPool   = pool + amount;
  const total     = newPool + otherPool;
  const payout    = (amount / newPool) * total;
  const profit    = payout - amount;

  document.getElementById('estimate-val').textContent =
    `${fmt$(payout)} (+${fmt$(profit)})`;
  row.style.display = 'flex';
}

function executeTrade() {
  const amount = document.getElementById('trade-amt')?.value;
  const errEl  = document.getElementById('trade-err');
  const res    = buyShares(selectedMarketId, selectedTradeSide, amount);

  if (res.success) {
    showToast(`Bought ${selectedTradeSide.toUpperCase()} position!`, 'success');
    openModal(selectedMarketId);
    refreshHeader();
  } else {
    errEl.textContent  = res.error;
    errEl.style.display = 'block';
  }
}

function adminResolve(winner) {
  if (!confirm(`Resolve as ${winner.toUpperCase()}?`)) return;
  const res = resolveMarket(selectedMarketId, winner);
  if (res.success) {
    showToast(`Resolved ${winner.toUpperCase()} — winnings paid out!`, 'success');
    closeModal();
    renderMarkets();
    refreshHeader();
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const t    = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('market-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => showView(link.dataset.view));
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  startRealtimeListener();
});
