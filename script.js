'use strict';

// ── Firebase ───────────────────────────────────────────────────────────────
// firebaseConfig is loaded from firebase-config.js (gitignored)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── Constants ──────────────────────────────────────────────────────────────
const SESSION_KEY = 'polyquarket_session_v3';
const CURRENT_DATA_VERSION = 5;
const STARTING_BALANCE = 1250;


const DEFAULT_DATA = {
  meta: { dataVersion: CURRENT_DATA_VERSION },
  users: {
    karen:     { password: '1234', role: 'user',  balance: STARTING_BALANCE },
    elizabeth: { password: 'goat', role: 'admin', balance: STARTING_BALANCE }
  },
  runnerScores: {},
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
let selectedTradeMode = 'buy'; // 'buy' | 'sell' — sell is only offered when the user holds a position
let activeAdminTab = 'markets';
let selectedAdjUser = null;
let loginMode = 'signin';
let marketSearch = '';
let marketCategoryFilter = 'all';
let activeExploreTab = 'trending';
let exploreChartFilter = 'all';
let activeGamesTab = 'runner';
let hiLoRound = null;
let dinoState = {
  running: false,
  over: false,
  score: 0,
  best: 0,
  wager: 5,
  playerY: 0,
  velocity: 0,
  obstacles: [],
  lastTs: 0,
  spawnTimer: 0,
  frame: null
};
const quarkRunnerLogo = new Image();
quarkRunnerLogo.src = 'logo.png';
quarkRunnerLogo.onload = () => {
  if (activeView === 'games' && activeGamesTab === 'runner') drawRunnerScene();
};
let networkAnimationFrame = null;

// ── Storage ────────────────────────────────────────────────────────────────
let _dbInitialized = false;

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Firebase drops empty objects/arrays, so fill in the containers the app expects.
function normalizeData(d) {
  if (!d.users)        d.users        = {};
  if (!d.markets)      d.markets      = [];
  if (!Array.isArray(d.markets)) d.markets = Object.values(d.markets);
  if (!d.runnerScores) d.runnerScores = {};
  if (!d.meta)         d.meta         = { dataVersion: 0 };
  return d;
}

function ensureGameDataShape() {
  normalizeData(appData);
}

// Every write goes through here. `mutator(data)` edits the LATEST server copy of
// appData and returns { success, ... }; returning success:false aborts the write.
// Firebase reruns the mutator if another client wrote in the meantime, so two
// people acting at once can never overwrite each other's changes.
function commit(mutator) {
  return new Promise(resolve => {
    let result = { success: false, error: 'Could not save. Please try again.' };
    db.ref('appData').transaction(current => {
      if (current === null) return null; // cache not loaded yet; Firebase retries with server data
      normalizeData(current);
      result = mutator(current) || { success: true };
      return result.success ? current : undefined;
    }, err => {
      if (err) resolve({ success: false, error: 'Network error. Your change was not saved.' });
      else resolve(result);
    });
  });
}

function pushHistory(ud, entry) {
  if (!Array.isArray(ud.history)) ud.history = ud.history ? Object.values(ud.history) : [];
  ud.history.push({ ts: new Date().toISOString(), ...entry });
}

function applyMigrations(d) {
  const fromVersion = d.meta.dataVersion || 0;
  if (fromVersion >= CURRENT_DATA_VERSION) return { success: false };
  if (fromVersion < 1) {
    for (const ud of Object.values(d.users)) {
      ud.balance = 670;
    }
  }
  if (fromVersion < 2) {
    const now = new Date().toISOString();
    for (const market of d.markets) {
      if (!market.history) {
        const startTs = market.createdAt ? market.createdAt + 'T00:00:00.000Z' : now;
        market.history = [{ ts: startTs, vol: +(market.yesPool + market.noPool).toFixed(2) }];
      }
    }
    for (const ud of Object.values(d.users)) {
      if (!ud.history) {
        ud.history = [{ ts: now, bal: ud.balance }];
      }
    }
  }
  if (fromVersion < 5) {
    // Reset everyone to an equal starting balance and remove chat data.
    for (const ud of Object.values(d.users)) {
      ud.balance = STARTING_BALANCE;
      pushHistory(ud, { bal: STARTING_BALANCE, note: 'Balance reset' });
      delete ud.chattedWith;
    }
    delete d.chats;
  }
  d.meta.dataVersion = CURRENT_DATA_VERSION;
  return { success: true };
}

function startRealtimeListener() {
  db.ref('appData').on('value', snapshot => {
    const data = snapshot.val();

    if (!_dbInitialized) {
      _dbInitialized = true;
      if (data) {
        appData = normalizeData(data);
        if (!appData.notifyEmails) {
          commit(d => {
            if (d.notifyEmails) return { success: false };
            d.notifyEmails = ['efield@uchicago.edu'];
            return { success: true };
          });
        }
        if ((appData.meta.dataVersion || 0) < CURRENT_DATA_VERSION) {
          commit(applyMigrations);
        }
      } else {
        appData = deepCopy(DEFAULT_DATA);
        db.ref('appData').transaction(cur => cur === null ? deepCopy(DEFAULT_DATA) : undefined);
      }
      if (loadSession()) {
        showView('markets');
      } else {
        showView('login');
      }
      return;
    }

    // Update from this or another client
    if (!data) return;
    appData = normalizeData(data);
    syncCurrentUser();
    if (currentUser) {
      switch (activeView) {
        case 'markets':   refreshMarketsLive(); break;
        case 'explore':   renderExplore();      break;
        case 'games':
          if (activeGamesTab === 'runner' && !dinoState.running) renderRunnerLeaderboard();
          break;
        case 'portfolio': renderPortfolio();    break;
        case 'admin':     refreshAdminLive();   break;
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
  finishOrStopDinoGame(); // settle any in-progress run before the user is cleared
  hiLoRound = null;
  currentUser = null;
  loginMode = 'signin';
  marketSearch = '';
  marketCategoryFilter = 'all';
  exploreChartFilter = 'all';
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
  return commit(d => {
    if (d.users[username]) {
      return { success: false, error: 'That username is already taken.' };
    }
    for (const u of Object.values(d.users)) {
      if (u.email && u.email === email) {
        return { success: false, error: 'An account with that email already exists.' };
      }
    }
    d.users[username] = { email, password, role: 'user', balance: STARTING_BALANCE, history: [{ ts: new Date().toISOString(), bal: STARTING_BALANCE }] };
    return { success: true };
  });
}

// ── Utils ──────────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function marketHasPositions(d, marketId) {
  return Object.values(d.users).some(ud => {
    const h = (ud.holdings || {})[marketId];
    return h && ((h.yes || 0) > 0 || (h.no || 0) > 0);
  });
}

// ── Market Actions ─────────────────────────────────────────────────────────
async function buyShares(marketId, side, rawAmount) {
  const amount = parseFloat(rawAmount);
  if (!amount || amount <= 0) return { success: false, error: 'Enter a valid amount.' };
  if (!currentUser) return { success: false, error: 'Not logged in.' };
  const username = currentUser.username;

  return commit(d => {
    const ud = d.users[username];
    if (!ud) return { success: false, error: 'Not logged in.' };
    if (amount > ud.balance + 0.001) return { success: false, error: 'Insufficient balance.' };

    const market = d.markets.find(m => m.id === marketId);
    if (!market || market.status !== 'open') return { success: false, error: 'Market is not open.' };

    const spend = Math.min(amount, ud.balance);
    ud.balance = +((ud.balance - spend).toFixed(2));
    pushHistory(ud, { bal: ud.balance });

    if (side === 'yes') market.yesPool = +((market.yesPool + spend).toFixed(2));
    else                market.noPool  = +((market.noPool  + spend).toFixed(2));
    if (!market.history) market.history = [];
    market.history.push({ ts: new Date().toISOString(), vol: +(market.yesPool + market.noPool).toFixed(2) });

    if (!ud.holdings) ud.holdings = {};
    if (!ud.holdings[marketId]) ud.holdings[marketId] = { yes: 0, no: 0 };
    ud.holdings[marketId][side] = +(((ud.holdings[marketId][side] || 0) + spend).toFixed(2));
    return { success: true };
  });
}

// Exit fee charged when selling; it stays in the pool, like the starting seed money.
const SELL_FEE = 0.05;

function sellRefund(amount) {
  return +(amount * (1 - SELL_FEE)).toFixed(2);
}

// In this pool-based market a position's expected value at the current odds is
// always exactly its stake (payout-if-win × win probability = stake), so selling
// refunds the stake minus the fee. Paying out "payout if win" would be free money.
async function sellShares(marketId, side, rawAmount) {
  const amount = parseFloat(rawAmount);
  if (!amount || amount <= 0) return { success: false, error: 'Enter a valid amount.' };
  if (!currentUser) return { success: false, error: 'Not logged in.' };
  const username = currentUser.username;

  return commit(d => {
    const ud = d.users[username];
    if (!ud) return { success: false, error: 'Not logged in.' };
    const market = d.markets.find(m => m.id === marketId);
    if (!market || market.status !== 'open') return { success: false, error: 'Market is not open.' };
    const h = (ud.holdings || {})[marketId];
    const held = h?.[side] || 0;
    if (held <= 0) return { success: false, error: `You don't hold any ${side.toUpperCase()}.` };
    if (amount > held + 0.001) return { success: false, error: `You only hold ${fmt$(held)} of ${side.toUpperCase()}.` };

    const sold   = Math.min(amount, held);
    const refund = sellRefund(sold);
    const poolKey = side === 'yes' ? 'yesPool' : 'noPool';
    market[poolKey] = Math.max(0, +((market[poolKey] - refund).toFixed(2)));
    if (!market.history) market.history = [];
    market.history.push({ ts: new Date().toISOString(), vol: +(market.yesPool + market.noPool).toFixed(2) });

    h[side] = +((held - sold).toFixed(2));
    if (h[side] < 0.01) h[side] = 0;
    if (!(h.yes > 0) && !(h.no > 0)) delete ud.holdings[marketId];

    ud.balance = +((ud.balance + refund).toFixed(2));
    pushHistory(ud, { bal: ud.balance, note: 'Sell' });
    return { success: true, sold, refund };
  });
}

function resolveMarket(marketId, winner) {
  return commit(d => {
    const market = d.markets.find(m => m.id === marketId);
    if (!market || market.status !== 'open') return { success: false, error: 'Cannot resolve.' };

    market.status = 'resolved';
    market.winner = winner;

    const total       = market.yesPool + market.noPool;
    const winningPool = winner === 'yes' ? market.yesPool : market.noPool;

    for (const ud of Object.values(d.users)) {
      const h = (ud.holdings || {})[marketId];
      if (!h) continue;
      const bet = h[winner] || 0;
      if (bet > 0 && winningPool > 0) {
        ud.balance = +((ud.balance + (bet / winningPool) * total).toFixed(2));
        pushHistory(ud, { bal: ud.balance });
      }
      delete ud.holdings[marketId];
    }
    return { success: true };
  });
}

function adjustBalance(username, delta) {
  return commit(d => {
    const ud = d.users[username];
    if (!ud) return { success: false, error: 'User not found.' };
    const newBalance = +((ud.balance + delta).toFixed(2));
    if (newBalance < 0) return { success: false, error: 'Balance cannot go below $0.' };
    ud.balance = newBalance;
    pushHistory(ud, { bal: ud.balance });
    return { success: true };
  });
}

function parsePool(raw, label) {
  const v = raw !== '' && raw !== undefined ? parseFloat(raw) : 500;
  if (isNaN(v) || v < 0) return { error: `${label} pool must be a non-negative number.` };
  return { value: +v.toFixed(2) };
}

function addMarket(title, description, category, endsAt, yesPool, noPool) {
  if (!title.trim()) return Promise.resolve({ success: false, error: 'Title is required.' });
  const yp = parsePool(yesPool, 'YES');
  const np = parsePool(noPool, 'NO');
  if (yp.error || np.error) return Promise.resolve({ success: false, error: yp.error || np.error });
  const market = {
    id: 'm' + Date.now(),
    title: title.trim(),
    description: description.trim(),
    category: category || 'Random',
    yesPool: yp.value, noPool: np.value,
    status: 'open', winner: null,
    createdAt: new Date().toISOString().slice(0, 10),
    endsAt: endsAt || '',
    history: [{ ts: new Date().toISOString(), vol: +(yp.value + np.value).toFixed(2) }]
  };
  return commit(d => {
    d.markets.unshift(market);
    return { success: true };
  });
}

// Pools can only be changed while nobody holds a position, since changing them
// after trades would alter everyone's payouts.
function editMarket(marketId, { title, description, category, endsAt, yesPool, noPool }) {
  if (!title.trim()) return Promise.resolve({ success: false, error: 'Title is required.' });
  let yp = null, np = null;
  if (yesPool !== undefined) {
    yp = parsePool(yesPool, 'YES');
    np = parsePool(noPool, 'NO');
    if (yp.error || np.error) return Promise.resolve({ success: false, error: yp.error || np.error });
  }
  return commit(d => {
    const market = d.markets.find(m => m.id === marketId);
    if (!market) return { success: false, error: 'Market no longer exists.' };
    market.title       = title.trim();
    market.description = description.trim();
    market.category    = category || 'Random';
    market.endsAt      = endsAt || '';
    if (yp && (yp.value !== market.yesPool || np.value !== market.noPool)) {
      if (market.status !== 'open' || marketHasPositions(d, marketId)) {
        return { success: false, error: 'Pools are locked because people have already traded on this market.' };
      }
      market.yesPool = yp.value;
      market.noPool  = np.value;
      market.history = [{ ts: new Date().toISOString(), vol: +(yp.value + np.value).toFixed(2) }];
    }
    return { success: true };
  });
}

function deleteMarket(marketId) {
  return commit(d => {
    const idx = d.markets.findIndex(m => m.id === marketId);
    if (idx === -1) return { success: false, error: 'Not found.' };

    const market = d.markets[idx];
    if (market.status === 'open') {
      for (const ud of Object.values(d.users)) {
        const h = (ud.holdings || {})[marketId];
        if (h) {
          ud.balance = +((ud.balance + (h.yes || 0) + (h.no || 0)).toFixed(2));
          pushHistory(ud, { bal: ud.balance });
          delete ud.holdings[marketId];
        }
      }
    }

    d.markets.splice(idx, 1);
    return { success: true };
  });
}

// ── View Management ────────────────────────────────────────────────────────
function showView(view) {
  if ((view === 'admin' || view === 'portfolio' || view === 'markets' || view === 'explore' || view === 'games') && !currentUser) {
    view = 'login';
  }
  if (activeView === 'games' && view !== 'games') finishOrStopDinoGame();
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
    case 'explore':   renderExplore();   break;
    case 'games':     renderGames();     break;
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
  document.getElementById('auth-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('auth-err');
    errEl.style.display = 'none';

    if (mode === 'register') {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      const res = await register(
        document.getElementById('inp-email').value,
        document.getElementById('inp-user').value,
        document.getElementById('inp-pass').value,
        document.getElementById('inp-pass2').value
      );
      submitBtn.disabled = false;
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
function marketStatsHTML() {
  const totalVol      = appData.markets.reduce((s, m) => s + m.yesPool + m.noPool, 0);
  const openCount     = appData.markets.filter(m => m.status === 'open').length;
  const resolvedCount = appData.markets.filter(m => m.status === 'resolved').length;
  return `
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
  `;
}

// Live update: refresh stats and cards without rebuilding the search box,
// so typing isn't interrupted when someone else trades.
function refreshMarketsLive() {
  const stats = document.getElementById('market-stats');
  if (!stats) { renderMarkets(); return; }
  stats.innerHTML = marketStatsHTML();
  applyMarketFilters();
}

function renderMarkets() {
  const allCategories = [...new Set(appData.markets.map(m => m.category))].sort();

  document.getElementById('view-markets').innerHTML = `
    <div class="page-inner">
      <div class="page-hero">
        <h2 class="hero-title">Prediction Markets</h2>
        <p class="hero-sub">Trade on real-world outcomes</p>
      </div>

      <div class="stat-row" id="market-stats">${marketStatsHTML()}</div>

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
    card.addEventListener('click', () => openModal(card.dataset.id, card));
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
    card.addEventListener('click', () => openModal(card.dataset.id, card));
  });
  document.querySelectorAll('.pos-sell-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openModal(btn.dataset.id, btn.closest('.pos-card'), { mode: 'sell', side: btn.dataset.side });
    });
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
            <span>Pays ${fmt$(yv)} if YES wins</span>
            <span class="pnl ${yv >= h.yes ? 'pos' : 'neg'}">${yv >= h.yes?'+':''}${fmt$(yv - h.yes)}</span>
            ${m.status === 'open' ? `
              <button class="btn btn-ghost btn-sm pos-sell-btn" data-id="${m.id}" data-side="yes">Sell · ${fmt$(sellRefund(h.yes))}</button>
            ` : ''}
          </div>
        ` : ''}
        ${h.no > 0 ? `
          <div class="pos-side no">
            <span class="side-name">NO <em>${fmtPct(np)}</em></span>
            <span>Invested ${fmt$(h.no)}</span>
            <span>Pays ${fmt$(nv)} if NO wins</span>
            <span class="pnl ${nv >= h.no ? 'pos' : 'neg'}">${nv >= h.no?'+':''}${fmt$(nv - h.no)}</span>
            ${m.status === 'open' ? `
              <button class="btn btn-ghost btn-sm pos-sell-btn" data-id="${m.id}" data-side="no">Sell · ${fmt$(sellRefund(h.no))}</button>
            ` : ''}
          </div>
        ` : ''}
      </div>
      <div class="pos-foot">
        <span>Total invested: ${fmt$(invested)}</span>
        <span class="${current >= invested ? 'pnl pos' : 'pnl neg'}">Max payout: ${fmt$(current)}</span>
      </div>
    </div>
  `;
}

// ── Render: Admin ──────────────────────────────────────────────────────────
// The admin page is never fully re-rendered by live updates: only the market
// list and the users table refresh, so the create/edit form, the user search
// and an open balance-adjust panel survive other people's activity.
let editingMarketId = null;
const MARKET_CATEGORIES = ['Physics', 'Skits', 'Spherical Cow Awards', 'Random'];

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
        <button class="admin-tab ${activeAdminTab === 'users' ? 'active' : ''}" data-tab="users">Users (<span id="admin-users-count">${Object.keys(appData.users).length}</span>)</button>
      </div>

      <!-- Markets Tab -->
      <div id="admin-tab-markets" class="admin-tab-panel ${activeAdminTab === 'markets' ? 'active' : ''}">
        <div class="admin-layout">
          <div class="admin-form-wrap" id="admin-form-wrap"></div>

          <div class="admin-list-wrap">
            <h3 class="section-head">All Markets (<span id="admin-markets-count">${appData.markets.length}</span>)</h3>
            <div id="admin-market-list"></div>
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
            <div id="users-admin-tbody"></div>
          </div>
        </div>
      </div>
    </div>
  `;

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

  document.getElementById('user-search').addEventListener('input', () => renderUsersTable());

  renderAdminForm();
  renderAdminMarketList();
  renderUsersTable();
}

function refreshAdminLive() {
  if (currentUser?.role !== 'admin') { showView('markets'); return; }
  if (!document.getElementById('admin-market-list')) { renderAdmin(); return; }
  document.getElementById('admin-markets-count').textContent = appData.markets.length;
  document.getElementById('admin-users-count').textContent   = Object.keys(appData.users).length;
  renderAdminMarketList();
  renderUsersTable();
}

// ── Admin: create / edit form ──
function renderAdminForm() {
  const wrap = document.getElementById('admin-form-wrap');
  if (!wrap) return;
  const m = editingMarketId ? appData.markets.find(x => x.id === editingMarketId) : null;
  if (!m) editingMarketId = null;
  const editing = !!m;
  const poolsLocked = editing && (m.status !== 'open' || marketHasPositions(appData, m.id));
  const cats = editing && !MARKET_CATEGORIES.includes(m.category)
    ? [...MARKET_CATEGORIES, m.category]
    : MARKET_CATEGORIES;

  wrap.innerHTML = `
    <h3 class="section-head">${editing ? 'Edit Market' : 'Create Market'}</h3>
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
          ${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>End Date</label>
        <input id="f-ends" type="date">
      </div>
      <div class="field">
        <label class="pool-label-row">
          ${editing ? 'Pools' : 'Starting Pools'}
          <span class="pool-hint">${poolsLocked ? 'locked' : 'recommended total: $1000'}</span>
        </label>
        ${poolsLocked ? `
          <p class="hint-txt">Pools can't be changed once people have traded on this market
            (YES ${fmt$(m.yesPool)} · NO ${fmt$(m.noPool)}).</p>
        ` : `
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
        `}
      </div>
      <div id="add-err" class="err-msg" style="display:none"></div>
      ${editing ? `
        <div class="admin-form-actions">
          <button type="submit" class="btn btn-primary">Save Changes</button>
          <button type="button" class="btn btn-ghost" id="edit-cancel-btn">Cancel</button>
        </div>
      ` : `
        <button type="submit" class="btn btn-primary w-full">Create Market</button>
      `}
    </form>
  `;

  // Fill values via the DOM so quotes and other characters in titles are safe.
  if (editing) {
    document.getElementById('f-title').value = m.title || '';
    document.getElementById('f-desc').value  = m.description || '';
    document.getElementById('f-cat').value   = m.category || 'Random';
    document.getElementById('f-ends').value  = m.endsAt || '';
    if (!poolsLocked) {
      document.getElementById('f-yes-pool').value = m.yesPool;
      document.getElementById('f-no-pool').value  = m.noPool;
    }
  }

  const form = document.getElementById('add-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('add-err');
    errEl.style.display = 'none';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const yesEl = document.getElementById('f-yes-pool');
    const noEl  = document.getElementById('f-no-pool');
    const fields = {
      title:       document.getElementById('f-title').value,
      description: document.getElementById('f-desc').value,
      category:    document.getElementById('f-cat').value,
      endsAt:      document.getElementById('f-ends').value,
      yesPool:     yesEl ? yesEl.value : undefined,
      noPool:      noEl  ? noEl.value  : undefined
    };
    const wasEditing = editingMarketId;
    const res = wasEditing
      ? await editMarket(wasEditing, fields)
      : await addMarket(fields.title, fields.description, fields.category, fields.endsAt, fields.yesPool, fields.noPool);
    submitBtn.disabled = false;

    if (res.success) {
      showToast(wasEditing ? 'Market updated!' : 'Market created!', 'success');
      editingMarketId = null;
      renderAdminForm();
      renderAdminMarketList();
    } else {
      errEl.textContent = res.error;
      errEl.style.display = 'block';
    }
  });

  document.getElementById('edit-cancel-btn')?.addEventListener('click', () => {
    editingMarketId = null;
    renderAdminForm();
    renderAdminMarketList();
  });
}

function startEditingMarket(marketId) {
  editingMarketId = marketId;
  renderAdminForm();
  renderAdminMarketList();
  const wrap = document.getElementById('admin-form-wrap');
  wrap?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('f-title')?.focus({ preventScroll: true });
}

// ── Admin: market list ──
function renderAdminMarketList() {
  const list = document.getElementById('admin-market-list');
  if (!list) return;
  list.innerHTML = appData.markets.length === 0
    ? '<p class="hint-txt">No markets yet.</p>'
    : appData.markets.map(adminMarketRow).join('');

  const titleOf = id => appData.markets.find(m => m.id === id)?.title || 'this market';

  list.querySelectorAll('.edit-market-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      startEditingMarket(btn.dataset.id);
    })
  );

  list.querySelectorAll('.resolve-yes-btn, .resolve-no-btn').forEach(btn =>
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const winner = btn.classList.contains('resolve-yes-btn') ? 'yes' : 'no';
      if (!confirm(`Resolve "${titleOf(btn.dataset.id)}" as ${winner.toUpperCase()}?`)) return;
      btn.disabled = true;
      const res = await resolveMarket(btn.dataset.id, winner);
      if (res.success) {
        showToast(`Resolved ${winner.toUpperCase()} — winnings distributed!`, 'success');
        if (editingMarketId === btn.dataset.id) renderAdminForm();
      } else {
        showToast(res.error, 'error');
        btn.disabled = false;
      }
      refreshHeader();
    })
  );

  list.querySelectorAll('.delete-market-btn').forEach(btn =>
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete "${titleOf(btn.dataset.id)}"? Open positions will be refunded.`)) return;
      btn.disabled = true;
      const res = await deleteMarket(btn.dataset.id);
      if (res.success) {
        showToast('Market deleted. Positions refunded.', 'success');
        if (editingMarketId === btn.dataset.id) { editingMarketId = null; renderAdminForm(); }
      } else {
        showToast(res.error, 'error');
        btn.disabled = false;
      }
      refreshHeader();
    })
  );
}

function adminMarketRow(m) {
  const vol = m.yesPool + m.noPool;
  const yp  = yesPrice(m);

  return `
    <div class="admin-row ${m.status} ${editingMarketId === m.id ? 'editing' : ''}">
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
        <button class="btn btn-ghost edit-market-btn" data-id="${m.id}">Edit</button>
        ${m.status === 'open' ? `
          <button class="btn btn-yes resolve-yes-btn" data-id="${m.id}">✓ YES</button>
          <button class="btn btn-no  resolve-no-btn"  data-id="${m.id}">✗ NO</button>
        ` : ''}
        <button class="btn btn-danger delete-market-btn" data-id="${m.id}">Delete</button>
      </div>
    </div>
  `;
}

// ── Admin: users table ──
function renderUsersTable() {
  const tbody = document.getElementById('users-admin-tbody');
  if (!tbody) return;
  const q = (document.getElementById('user-search')?.value || '').toLowerCase();
  const amtEl    = document.getElementById('adj-amount');
  const prevAmt  = amtEl?.value || '';
  const hadFocus = !!amtEl && document.activeElement === amtEl;

  const entries = Object.entries(appData.users).filter(([name, u]) =>
    !q || name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  );
  tbody.innerHTML = usersAdminRows(entries);
  bindUserRows();
  openAdjPanel(prevAmt, hadFocus);
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

function openAdjPanel(amount = '', focus = false) {
  document.querySelectorAll('.users-adj-inline').forEach(el => el.remove());
  if (!selectedAdjUser || !appData.users[selectedAdjUser]) return;
  const row = [...document.querySelectorAll('.users-admin-row')]
    .find(r => r.dataset.username === selectedAdjUser);
  if (!row) return;
  const panel = document.createElement('div');
  panel.className = 'users-adj-inline';
  panel.innerHTML = adjPanelHTML();
  row.after(panel);
  const inp = document.getElementById('adj-amount');
  inp.value = amount;
  if (focus) inp.focus({ preventScroll: true });
  bindAdjButtons();
}

function bindUserRows() {
  document.querySelectorAll('.users-admin-row').forEach(row => {
    row.addEventListener('click', () => {
      selectedAdjUser = selectedAdjUser === row.dataset.username ? null : row.dataset.username;
      document.querySelectorAll('.users-admin-row').forEach(r =>
        r.classList.toggle('selected', r.dataset.username === selectedAdjUser)
      );
      openAdjPanel();
    });
  });
}

function bindAdjButtons() {
  if (!selectedAdjUser) return;
  const doAdjust = async sign => {
    const target = selectedAdjUser;
    const raw    = parseFloat(document.getElementById('adj-amount')?.value);
    const errEl  = document.getElementById('adj-err');
    errEl.style.display = 'none';
    if (!raw || raw <= 0) {
      errEl.textContent = 'Enter a positive amount.';
      errEl.style.display = 'block';
      return;
    }
    const res = await adjustBalance(target, sign * raw);
    if (res.success) {
      showToast(`Balance updated for ${target}!`, 'success');
      const amtEl = document.getElementById('adj-amount');
      if (amtEl) amtEl.value = '';
      refreshHeader();
    } else {
      const el = document.getElementById('adj-err');
      if (el) { el.textContent = res.error; el.style.display = 'block'; }
    }
  };
  document.getElementById('adj-add-btn')?.addEventListener('click', () => doAdjust(1));
  document.getElementById('adj-sub-btn')?.addEventListener('click', () => doAdjust(-1));
}

// ── Render: Explore ────────────────────────────────────────────────────────
function renderExplore() {
  document.getElementById('view-explore').innerHTML = `
    <div class="page-inner">
      <div class="page-hero">
        <h2 class="hero-title">Explore</h2>
        <p class="hero-sub">Discover trending markets and top performers</p>
      </div>
      <div class="explore-tabs">
        <button class="explore-tab ${activeExploreTab === 'trending' ? 'active' : ''}" data-etab="trending">Trending</button>
        <button class="explore-tab ${activeExploreTab === 'overall'  ? 'active' : ''}" data-etab="overall">Top Overall</button>
        <button class="explore-tab ${activeExploreTab === 'users'    ? 'active' : ''}" data-etab="users">Top Users</button>
        <button class="explore-tab ${activeExploreTab === 'new'      ? 'active' : ''}" data-etab="new">New Markets</button>
      </div>
      <div id="explore-content"></div>
    </div>
  `;

  document.querySelectorAll('.explore-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeExploreTab = tab.dataset.etab;
      document.querySelectorAll('.explore-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.etab === activeExploreTab)
      );
      renderExploreTab();
    });
  });

  renderExploreTab();
}

function renderExploreTab() {
  const COLORS = ['#6366f1','#22c55e','#ef4444','#f59e0b','#0ea5e9','#7c3aed','#ec4899','#14b8a6','#f97316','#84cc16'];
  const content = document.getElementById('explore-content');
  if (!content) return;

  const trunc = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
  const yFmt  = v => Math.abs(v) >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v);

  if (activeExploreTab === 'users') {
    const top = Object.entries(appData.users)
      .filter(([, u]) => u.role !== 'admin')
      .sort(([, a], [, b]) => b.balance - a.balance)
      .slice(0, 10);
    const datasets = top.map(([name, u], i) => ({
      label: name,
      color: COLORS[i],
      points: filterPoints((u.history || []).map(h => ({ ts: h.ts, val: h.bal })), exploreChartFilter)
    }));
    content.innerHTML = `
      <div class="explore-panel-layout">
        <div class="explore-panel-list">
          ${top.length ? top.map(([name, u], i) => exploreUserRow(name, u, i + 1)).join('') : '<p class="hint-txt" style="padding:16px">No users yet.</p>'}
        </div>
        <div class="explore-panel-chart">${chartFiltersHTML()}${buildChart(datasets, { yFmt })}</div>
      </div>
    `;
    content.querySelectorAll('.chart-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => { exploreChartFilter = btn.dataset.filter; renderExploreTab(); });
    });
    return;
  }

  let markets = [...appData.markets];
  let variant = 'volume';

  if (activeExploreTab === 'trending') {
    markets = markets.filter(m => m.status === 'open').sort((a, b) => (b.yesPool + b.noPool) - (a.yesPool + a.noPool));
  } else if (activeExploreTab === 'overall') {
    markets = markets.sort((a, b) => (b.yesPool + b.noPool) - (a.yesPool + a.noPool));
  } else {
    markets = markets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    variant = 'new';
  }
  markets = markets.slice(0, 10);

  const datasets = markets.map((m, i) => ({
    label: trunc(m.title, 24),
    color: COLORS[i],
    resolved: m.status === 'resolved',
    points: filterPoints((m.history || []).map(h => ({ ts: h.ts, val: h.vol })), exploreChartFilter)
  }));

  content.innerHTML = `
    <div class="explore-panel-layout">
      <div class="explore-panel-list">
        ${markets.length ? markets.map((m, i) => exploreMarketRow(m, i + 1, variant)).join('') : '<p class="hint-txt" style="padding:16px">No markets yet.</p>'}
      </div>
      <div class="explore-panel-chart">${chartFiltersHTML()}${buildChart(datasets, { yFmt })}</div>
    </div>
  `;

  content.querySelectorAll('.explore-market-row').forEach(row => {
    row.addEventListener('click', () => openModal(row.dataset.id, row));
  });
  content.querySelectorAll('.chart-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { exploreChartFilter = btn.dataset.filter; renderExploreTab(); });
  });
}

function filterPoints(points, filter) {
  if (filter === 'all') return points;
  const cutoffs = { '1h': 3600000, '1d': 86400000, '1w': 604800000, '1m': 2592000000 };
  const cutoffTs = Date.now() - cutoffs[filter];
  const sorted = [...points].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const inWindow = sorted.filter(p => new Date(p.ts).getTime() >= cutoffTs);
  const before   = sorted.filter(p => new Date(p.ts).getTime() <  cutoffTs);
  if (before.length > 0) {
    const anchor = { ...before[before.length - 1], ts: new Date(cutoffTs).toISOString() };
    return [anchor, ...inWindow];
  }
  return inWindow;
}

function chartFiltersHTML() {
  const filters = [
    { key: '1h', label: '1H' }, { key: '1d', label: '1D' },
    { key: '1w', label: '1W' }, { key: '1m', label: '1M' },
    { key: 'all', label: 'All' },
  ];
  return `<div class="chart-filters">${filters.map(f =>
    `<button class="chart-filter-btn ${exploreChartFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
  ).join('')}</div>`;
}

function buildChart(datasets, { yFmt = v => Math.round(v) + '' } = {}) {
  const now = new Date().toISOString();
  const filled = datasets
    .filter(d => d.points.length > 0)
    .map(d => {
      if (d.resolved) return d;
      const sorted = [...d.points].sort((a, b) => new Date(a.ts) - new Date(b.ts));
      const last = sorted[sorted.length - 1];
      if (new Date(now) > new Date(last.ts)) {
        return { ...d, points: [...d.points, { ts: now, val: last.val }] };
      }
      return d;
    });
  if (!filled.length) {
    return '<div class="chart-empty">No history data yet.<br>Data will appear as trades are made.</div>';
  }

  const W = 540, H = 240;
  const ML = 56, MR = 16, MT = 14, MB = 38;
  const plotW = W - ML - MR, plotH = H - MT - MB;

  const allPts = filled.flatMap(d => d.points);
  const minTs  = Math.min(...allPts.map(p => new Date(p.ts).getTime()));
  const maxTs  = Math.max(...allPts.map(p => new Date(p.ts).getTime()));
  const minVal = Math.min(...allPts.map(p => p.val));
  const maxVal = Math.max(...allPts.map(p => p.val));

  const tsRange = maxTs - minTs || 3600000;
  const valPad  = (maxVal - minVal) * 0.14 || maxVal * 0.1 || 50;
  const vMin    = minVal - valPad;
  const vMax    = maxVal + valPad;
  const vRange  = vMax - vMin;

  const tx = ts  => ML + ((new Date(ts).getTime() - minTs) / tsRange) * plotW;
  const ty = val => MT + plotH - ((val - vMin) / vRange) * plotH;

  let grid = '', yLbls = '';
  for (let i = 0; i <= 4; i++) {
    const v = vMin + vRange * i / 4;
    const y = ty(v).toFixed(1);
    grid  += `<line x1="${ML}" y1="${y}" x2="${W - MR}" y2="${y}" class="chart-grid"/>`;
    yLbls += `<text x="${ML - 7}" y="${(parseFloat(y) + 4).toFixed(1)}" text-anchor="end" class="chart-lbl">${yFmt(v)}</text>`;
  }

  const shortRange = tsRange < 172800000;
  let xLbls = '';
  for (let i = 0; i <= 4; i++) {
    const t = minTs + tsRange * i / 4;
    const x = (ML + plotW * i / 4).toFixed(1);
    const d = new Date(t);
    const lbl = shortRange
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : `${d.getMonth() + 1}/${d.getDate()}`;
    xLbls += `<text x="${x}" y="${(H - MB + 16).toFixed(1)}" text-anchor="middle" class="chart-lbl">${lbl}</text>`;
  }

  let paths = '', dots = '';
  for (const { color, points } of filled) {
    const sorted = [...points].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    if (sorted.length === 1) {
      dots += `<circle cx="${tx(sorted[0].ts).toFixed(1)}" cy="${ty(sorted[0].val).toFixed(1)}" r="4" fill="${color}"/>`;
    } else {
      const d = sorted.map((p, j) => `${j ? 'L' : 'M'}${tx(p.ts).toFixed(1)},${ty(p.val).toFixed(1)}`).join('');
      paths += `<path d="${d}" stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
      const last = sorted[sorted.length - 1];
      dots += `<circle cx="${tx(last.ts).toFixed(1)}" cy="${ty(last.val).toFixed(1)}" r="3.5" fill="${color}"/>`;
    }
  }

  const legend = filled.map(({ color, label }) =>
    `<span class="chart-leg-item"><span class="chart-leg-dot" style="background:${color}"></span><span class="chart-leg-txt">${esc(label)}</span></span>`
  ).join('');

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" xmlns="http://www.w3.org/2000/svg">
      ${grid}
      <line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" class="chart-axis"/>
      <line x1="${ML}" y1="${MT + plotH}" x2="${W - MR}" y2="${MT + plotH}" class="chart-axis"/>
      ${yLbls}${xLbls}${paths}${dots}
    </svg>
    <div class="chart-legend">${legend}</div>
  </div>`;
}

function exploreMarketRow(m, rank, variant) {
  const vol   = m.yesPool + m.noPool;
  const yp    = yesPrice(m);
  const color = CAT_COLORS[m.category] || '#6b7280';

  const rightTop = variant === 'new'
    ? `<span class="status-badge ${m.status}">${m.status}</span>`
    : `<span class="explore-pct ${yp >= 0.5 ? 'yes' : 'no'}">${fmtPct(yp)}</span>`;

  const rightSub = variant === 'new'
    ? `<span class="explore-stat">${m.createdAt}</span>`
    : `<span class="explore-stat">Vol ${fmt$(vol)}</span>`;

  return `
    <div class="explore-market-row" data-id="${m.id}">
      <span class="explore-rank">#${rank}</span>
      <div class="explore-row-info">
        <span class="cat-badge" style="color:${color};background:${color}22">${esc(m.category)}</span>
        <p class="explore-row-title">${esc(m.title)}</p>
      </div>
      <div class="explore-row-right">
        ${rightTop}
        ${rightSub}
      </div>
    </div>
  `;
}

function exploreUserRow(name, u, rank) {
  const isYou = currentUser && currentUser.username === name;
  return `
    <div class="explore-user-row ${isYou ? 'is-you' : ''}">
      <span class="explore-rank">#${rank}</span>
      <span class="explore-username">
        ${esc(name)}${isYou ? '<span class="you-tag">you</span>' : ''}
      </span>
      <span class="explore-bal">${fmt$(u.balance)}</span>
    </div>
  `;
}

// ── Render: Games ──────────────────────────────────────────────────────────
function renderGames() {
  document.getElementById('view-games').innerHTML = `
    <div class="page-inner games-page-inner">
      <div class="page-hero">
        <h2 class="hero-title">Games</h2>
        <p class="hero-sub">Fast mini games with instant balance updates</p>
      </div>
      <div class="explore-tabs">
        <button class="explore-tab ${activeGamesTab === 'runner' ? 'active' : ''}" data-gtab="runner">Quark Run</button>
        <button class="explore-tab ${activeGamesTab === 'plinko' ? 'active' : ''}" data-gtab="plinko">Luck</button>
        <button class="explore-tab ${activeGamesTab === 'cards' ? 'active' : ''}" data-gtab="cards">Cards</button>
      </div>
      <div id="games-content"></div>
    </div>
  `;

  document.querySelectorAll('[data-gtab]').forEach(tab => {
    tab.addEventListener('click', () => {
      finishOrStopDinoGame();
      activeGamesTab = tab.dataset.gtab;
      document.querySelectorAll('[data-gtab]').forEach(t =>
        t.classList.toggle('active', t.dataset.gtab === activeGamesTab)
      );
      renderGamesTab();
    });
  });

  renderGamesTab();
}

function renderGamesTab() {
  const content = document.getElementById('games-content');
  if (!content) return;
  if (activeGamesTab === 'cards') renderCardGame(content);
  else if (activeGamesTab === 'runner') renderRunnerGame(content);
  else renderPlinkoGame(content);
}

async function placeGameWager(rawAmount, gameName) {
  const amount = parseFloat(rawAmount);
  if (!currentUser) return { success: false, error: 'Not logged in.' };
  if (!amount || amount <= 0) return { success: false, error: 'Enter a valid wager.' };
  const username = currentUser.username;
  const res = await commit(d => {
    const ud = d.users[username];
    if (!ud) return { success: false, error: 'Not logged in.' };
    if (amount > ud.balance + 0.001) return { success: false, error: 'Insufficient balance.' };
    ud.balance = +((ud.balance - amount).toFixed(2));
    pushHistory(ud, { bal: ud.balance, note: gameName });
    return { success: true, amount };
  });
  refreshHeader();
  return res;
}

async function awardGamePayout(amount, gameName) {
  if (!currentUser || amount <= 0) return;
  const username = currentUser.username;
  await commit(d => {
    const ud = d.users[username];
    if (!ud) return { success: false };
    ud.balance = +((ud.balance + amount).toFixed(2));
    pushHistory(ud, { bal: ud.balance, note: gameName });
    return { success: true };
  });
  refreshHeader();
}

async function chargeGameLoss(amount, gameName) {
  if (!currentUser || amount <= 0) return 0;
  const username = currentUser.username;
  const res = await commit(d => {
    const ud = d.users[username];
    if (!ud) return { success: false };
    const charged = Math.min(amount, ud.balance);
    ud.balance = +((ud.balance - charged).toFixed(2));
    pushHistory(ud, { bal: ud.balance, note: gameName });
    return { success: true, charged };
  });
  refreshHeader();
  return res.success ? res.charged : 0;
}

function renderPlinkoGame(content) {
  content.innerHTML = `
    <div class="game-layout">
      <div class="game-panel">
        <div class="game-panel-head">
          <div>
            <h3>Luck</h3>
            <p>Pick a risk level, drop the chip, and land in a multiplier bucket.</p>
          </div>
          <span class="game-chip">Balance ${fmt$(userData().balance)}</span>
        </div>
        <div class="game-controls">
          <div class="field">
            <label>Wager</label>
            <div class="amount-row">
              <span class="amount-prefix">$</span>
              <input id="plinko-wager" type="number" min="0.01" step="0.01" value="5">
            </div>
          </div>
          <div class="field">
            <label>Risk</label>
            <select id="plinko-risk">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <button class="btn btn-primary btn-large" id="plinko-drop-btn">Drop</button>
        </div>
        <div id="plinko-board" class="plinko-board">
          ${plinkoPegHTML()}
          <div id="plinko-chip" class="plinko-chip" style="display:none"></div>
          <div id="plinko-buckets" class="plinko-buckets">${plinkoBucketHTML('medium')}</div>
        </div>
        <div id="plinko-result" class="game-result">Ready to drop.</div>
      </div>
      <div class="game-side">
        <div class="game-side-stat"><span>Low risk</span><strong>0.5x - 1.5x</strong></div>
        <div class="game-side-stat"><span>Medium risk</span><strong>0x - 2x</strong></div>
        <div class="game-side-stat"><span>High risk</span><strong>-2x - 5x</strong></div>
      </div>
    </div>
  `;

  const riskEl = document.getElementById('plinko-risk');
  riskEl.addEventListener('change', () => {
    document.getElementById('plinko-buckets').innerHTML = plinkoBucketHTML(riskEl.value);
  });
  document.getElementById('plinko-drop-btn').addEventListener('click', playPlinko);
}

function plinkoMultipliers(risk) {
  return {
    low: [0.5, 0.75, 1, 1.25, 1.5],
    medium: [0, 0.5, 1, 1.5, 2],
    high: [-2, -1, 0, 2, 5]
  }[risk] || [0, 0.5, 0.8, 1, 2];
}

function plinkoWeights(risk) {
  return {
    low: [30, 30, 16, 14, 10],
    medium: [30, 30, 16, 14, 10],
    high: [20, 20, 20, 26, 14]
  }[risk] || [30, 30, 16, 14, 10];
}

function plinkoPegHTML() {
  let html = '';
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col <= row; col++) {
      const x = 50 + (col - row / 2) * 13;
      const y = 18 + row * 10;
      html += `<span class="plinko-peg" style="left:${x}%;top:${y}%"></span>`;
    }
  }
  return html;
}

function plinkoBucketHTML(risk) {
  return plinkoMultipliers(risk).map(m => `<span>${m}x</span>`).join('');
}

async function playPlinko() {
  const btn = document.getElementById('plinko-drop-btn');
  if (btn.disabled) return;
  const risk = document.getElementById('plinko-risk').value;
  const wager = document.getElementById('plinko-wager').value;
  btn.disabled = true;
  const res = await placeGameWager(wager, 'Luck');
  const resultEl = document.getElementById('plinko-result');
  if (!resultEl) return;
  if (!res.success) {
    btn.disabled = false;
    resultEl.textContent = res.error;
    resultEl.className = 'game-result loss';
    return;
  }

  const multipliers = plinkoMultipliers(risk);
  const bucket = weightedIndex(plinkoWeights(risk));
  const mult = multipliers[bucket];
  const payout = +(res.amount * mult).toFixed(2);

  resultEl.textContent = 'Dropping...';
  resultEl.className = 'game-result';
  const chip = document.getElementById('plinko-chip');
  chip.style.display = 'block';
  chip.style.left = '50%';
  chip.style.top = '4%';
  requestAnimationFrame(() => {
    chip.style.left = `${10 + bucket * 20}%`;
    chip.style.top = '82%';
  });

  setTimeout(async () => {
    if (mult < 0) {
      const extraLoss = await chargeGameLoss(Math.max(0, (Math.abs(mult) - 1) * res.amount), 'Luck');
      resultEl.textContent = `${mult}x multiplier. ${extraLoss > 0 ? `Lost an extra ${fmt$(extraLoss)}.` : 'No payout this drop.'}`;
      resultEl.className = 'game-result loss';
    } else {
      awardGamePayout(payout, 'Luck');
      resultEl.textContent = `${mult}x multiplier. ${payout > 0 ? `Paid ${fmt$(payout)}.` : 'No payout this drop.'}`;
      resultEl.className = `game-result ${payout > res.amount ? 'win' : payout < res.amount ? 'loss' : ''}`;
    }
    btn.disabled = false;
  }, 850);
}

function weightedIndex(weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function renderCardGame(content) {
  content.innerHTML = `
    <div class="game-layout">
      <div class="game-panel">
        <div class="game-panel-head">
          <div>
            <h3>Cards</h3>
            <p>Make four calls, then get paid from your final score.</p>
          </div>
          <span class="game-chip">2 = net zero · 3 = 2.5x · 4 = 8x</span>
        </div>
        <div class="game-controls">
          <div class="field">
            <label>Wager</label>
            <div class="amount-row">
              <span class="amount-prefix">$</span>
              <input id="cards-wager" type="number" min="0.01" step="0.01" value="5">
            </div>
          </div>
          <button class="btn btn-primary btn-large" id="cards-start-btn">Deal</button>
        </div>
        <div id="cards-table" class="cards-table">${cardBackHTML().repeat(4)}</div>
        <div id="cards-prompt" class="game-result">Deal a round to start.</div>
        <div id="cards-actions" class="cards-actions"></div>
      </div>
      <div class="game-side">
        <div class="game-side-stat"><span>Step 1</span><strong>Red or black</strong></div>
        <div class="game-side-stat"><span>Step 2</span><strong>Higher, lower, or same</strong></div>
        <div class="game-side-stat"><span>Step 3</span><strong>Higher, lower, same, or between</strong></div>
        <div class="game-side-stat"><span>Step 4</span><strong>Exact suit</strong></div>
      </div>
    </div>
  `;
  document.getElementById('cards-start-btn').addEventListener('click', startHiLoCards);
  if (hiLoRound) drawHiLoRound();
}

function cardBackHTML() {
  return '<div class="playing-card card-back">?</div>';
}

async function startHiLoCards() {
  const btn = document.getElementById('cards-start-btn');
  if (btn.disabled) return;
  if (hiLoRound) {
    // Dealing again used to silently throw away the current round and its wager.
    const prompt = document.getElementById('cards-prompt');
    prompt.textContent = 'Finish the current round first.';
    prompt.className = 'game-result loss';
    return;
  }
  btn.disabled = true;
  const res = await placeGameWager(document.getElementById('cards-wager').value, 'Cards');
  btn.disabled = false;
  if (!res.success) {
    const prompt = document.getElementById('cards-prompt');
    prompt.textContent = res.error;
    prompt.className = 'game-result loss';
    return;
  }
  const cards = shuffledDeck().slice(0, 4);
  hiLoRound = { wager: res.amount, cards, step: 0, correct: 0 };
  drawHiLoRound();
}

function shuffledDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck = [];
  for (const suit of suits) {
    for (let value = 1; value <= 13; value++) deck.push({ suit, value });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawHiLoRound() {
  const table = document.getElementById('cards-table');
  const prompt = document.getElementById('cards-prompt');
  const actions = document.getElementById('cards-actions');
  if (!table || !prompt || !actions || !hiLoRound) return;

  table.innerHTML = hiLoRound.cards.map((card, i) =>
    i < hiLoRound.step ? cardHTML(card) : cardBackHTML()
  ).join('');

  if (hiLoRound.step >= 4) {
    const multiplier = cardPayoutMultiplier(hiLoRound.correct);
    const payout = +(hiLoRound.wager * multiplier).toFixed(2);
    awardGamePayout(payout, 'Cards');
    prompt.textContent = cardResultText(hiLoRound.correct, payout);
    prompt.className = `game-result ${multiplier > 1 ? 'win' : multiplier === 0 ? 'loss' : ''}`;
    actions.innerHTML = '';
    hiLoRound = null;
    return;
  }

  const prompts = [
    ['First card color?', ['red', 'black']],
    ['Second card: higher, lower, or same as the first?', ['higher', 'lower', 'same']],
    ['Third card: higher, lower, same, or between the first two?', ['higher', 'lower', 'same', 'between']],
    ['Final card suit?', ['hearts', 'diamonds', 'clubs', 'spades']]
  ];
  prompt.textContent = `${prompts[hiLoRound.step][0]} Correct so far: ${hiLoRound.correct}/${hiLoRound.step}.`;
  prompt.className = 'game-result';
  actions.innerHTML = prompts[hiLoRound.step][1].map(choice =>
    `<button class="btn btn-ghost card-choice" data-choice="${choice}">${choiceLabel(choice)}</button>`
  ).join('');
  actions.querySelectorAll('.card-choice').forEach(btn => {
    btn.addEventListener('click', () => guessHiLo(btn.dataset.choice));
  });
}

function cardHTML(card) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return `<div class="playing-card ${red ? 'red' : 'black'}"><span>${cardValueLabel(card.value)}</span><span>${suitSymbol(card.suit)}</span></div>`;
}

function cardValueLabel(value) {
  return { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[value] || String(value);
}

function suitSymbol(suit) {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit];
}

function choiceLabel(choice) {
  return choice.charAt(0).toUpperCase() + choice.slice(1);
}

function guessHiLo(choice) {
  if (!hiLoRound) return;
  const c = hiLoRound.cards;
  let correct = false;
  if (hiLoRound.step === 0) {
    correct = choice === ((c[0].suit === 'hearts' || c[0].suit === 'diamonds') ? 'red' : 'black');
  } else if (hiLoRound.step === 1) {
    const actual = c[1].value > c[0].value ? 'higher' : c[1].value < c[0].value ? 'lower' : 'same';
    correct = choice === actual;
  } else if (hiLoRound.step === 2) {
    const low = Math.min(c[0].value, c[1].value);
    const high = Math.max(c[0].value, c[1].value);
    const actual = c[2].value === c[0].value || c[2].value === c[1].value
      ? 'same'
      : c[2].value > high
        ? 'higher'
        : c[2].value < low
          ? 'lower'
          : 'between';
    correct = choice === actual;
  } else {
    correct = choice === c[3].suit;
  }
  if (correct) hiLoRound.correct += 1;
  hiLoRound.step += 1;
  drawHiLoRound();
}

function cardPayoutMultiplier(correct) {
  if (correct >= 4) return 8;
  if (correct === 3) return 2.5;
  if (correct === 2) return 1;
  return 0;
}

function cardResultText(correct, payout) {
  if (correct >= 4) return `4 correct. Great work, paid ${fmt$(payout)}.`;
  if (correct === 3) return `3 correct. Nice run, paid ${fmt$(payout)}.`;
  if (correct === 2) return `2 correct. Your wager is returned.`;
  return `${correct} correct. No payout this round. Better luck next time.`;
}

function getRunnerHighScore(username) {
  if (!username) return 0;
  return Number(appData.runnerScores?.[username]?.score || 0);
}

function saveRunnerHighScore(score) {
  if (!currentUser || score <= getRunnerHighScore(currentUser.username)) return;
  const username = currentUser.username;
  commit(d => {
    if (score <= Number(d.runnerScores[username]?.score || 0)) return { success: false };
    d.runnerScores[username] = { score, updatedAt: new Date().toISOString() };
    return { success: true };
  });
}

function runnerRankings() {
  return Object.entries(appData.runnerScores || {})
    .filter(([name]) => appData.users?.[name] && appData.users[name].role !== 'admin')
    .sort(([, a], [, b]) => (b.score || 0) - (a.score || 0));
}

function runnerLeaderboardHTML() {
  const all = runnerRankings();
  const top = all.slice(0, 5);

  return `
    <div class="runner-leaderboard">
      <div class="runner-leaderboard-head">
        <h3>Quark Run Leaderboard</h3>
        ${all.length > 0
          ? `<button class="btn btn-ghost btn-sm" onclick="openRunnerLeaderboardModal(this)">View all (${all.length})</button>`
          : '<span>Top scores</span>'}
      </div>
      <div class="explore-panel-list runner-leaderboard-list">
        ${top.length ? top.map(([name, entry], i) => runnerLeaderboardRow(name, entry, i + 1)).join('') : '<p class="hint-txt" style="padding:16px">No runner scores yet.</p>'}
      </div>
    </div>
  `;
}

function runnerLeaderboardRow(name, entry, rank) {
  const isYou = currentUser && currentUser.username === name;
  return `
    <div class="explore-user-row ${isYou ? 'is-you' : ''}">
      <span class="explore-rank">#${rank}</span>
      <span class="explore-username">
        ${esc(name)}${isYou ? '<span class="you-tag">you</span>' : ''}
      </span>
      <span class="explore-bal">${Math.floor(entry.score || 0)}</span>
    </div>
  `;
}

function renderRunnerLeaderboard() {
  const el = document.getElementById('runner-leaderboard');
  if (el) el.innerHTML = runnerLeaderboardHTML();
}

// Full leaderboard in the shared pop-up; the list scrolls inside it.
function openRunnerLeaderboardModal(triggerEl = null) {
  const all = runnerRankings();
  const myIdx = currentUser ? all.findIndex(([name]) => name === currentUser.username) : -1;
  selectedMarketId = null;
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-head">
      <h2 class="modal-title">Quark Run — All Scores</h2>
      <button class="modal-close-btn" onclick="closeModal()">×</button>
    </div>
    <p class="hint-txt lb-modal-sub">${all.length} player${all.length === 1 ? '' : 's'}${myIdx >= 0 ? ` · You're #${myIdx + 1}` : ''}</p>
    <div class="explore-panel-list lb-modal-list">
      ${all.length
        ? all.map(([name, entry], i) => runnerLeaderboardRow(name, entry, i + 1)).join('')
        : '<p class="hint-txt" style="padding:16px">No runner scores yet.</p>'}
    </div>
  `;
  positionMarketModal(triggerEl);
  const modal = document.getElementById('market-modal');
  modal.scrollTop = 0;
  modal.classList.add('open');
  document.querySelector('.lb-modal-list .is-you')?.scrollIntoView({ block: 'center' });
}

function renderRunnerGame(content) {
  content.innerHTML = `
    <div class="game-stack">
      <div class="game-layout">
        <div class="game-panel">
          <div class="game-panel-head">
            <div>
              <h3>Quark Run</h3>
              <p>You are a runaway particle escaping pesky scientists. Run as far as you can and jump with Space (desktop) or the button (mobile) to stay free.</p>
            </div>
            <span class="game-chip">Score pays up to 3x</span>
          </div>
          <div class="game-controls runner-controls">
            <div class="field">
              <label>Wager</label>
              <div class="amount-row">
                <span class="amount-prefix">$</span>
                <input id="runner-wager" type="number" min="0.01" step="0.01" value="${dinoState.wager || 5}">
              </div>
            </div>
            <button class="btn btn-primary btn-large" id="runner-start-btn">Start</button>
          </div>
          <div class="runner-wrap">
            <canvas id="runner-canvas" width="760" height="260"></canvas>
            <div id="runner-overlay" class="runner-overlay">Press Start</div>
          </div>
          <button class="btn btn-ghost btn-large w-full runner-mobile-jump" id="runner-mobile-jump-btn">Jump</button>
          <div id="runner-result" class="game-result">Best score: ${Math.floor(getRunnerHighScore(currentUser?.username))}</div>
        </div>
        <div class="game-side">
          <div class="game-side-stat"><span>Space</span><strong>Jump</strong></div>
          <div class="game-side-stat"><span>100 score</span><strong>0.4x</strong></div>
          <div class="game-side-stat"><span>200 score</span><strong>1x (break even)</strong></div>
          <div class="game-side-stat"><span>300 score</span><strong>1.75x</strong></div>
          <div class="game-side-stat"><span>500 score</span><strong>3x cap</strong></div>
        </div>
      </div>
      <div id="runner-leaderboard">${runnerLeaderboardHTML()}</div>
    </div>
  `;
  drawRunnerScene();
  document.getElementById('runner-start-btn').addEventListener('click', startDinoGame);
  const mobileJumpBtn = document.getElementById('runner-mobile-jump-btn');
  mobileJumpBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    jumpDino(true);
  });
}

let runnerStarting = false;

async function startDinoGame() {
  if (runnerStarting) return;
  finishOrStopDinoGame();
  runnerStarting = true;
  const startBtn = document.getElementById('runner-start-btn');
  startBtn.disabled = true;
  const res = await placeGameWager(document.getElementById('runner-wager').value, 'Quark Run');
  runnerStarting = false;
  startBtn.disabled = false;
  const result = document.getElementById('runner-result');
  if (!result) {
    // Player left the Games tab while the wager was saving; refund it.
    if (res.success) awardGamePayout(res.amount, 'Quark Run refund');
    return;
  }
  if (!res.success) {
    result.textContent = res.error;
    result.className = 'game-result loss';
    return;
  }
  dinoState = {
    ...dinoState,
    running: true,
    over: false,
    score: 0,
    wager: res.amount,
    playerY: 0,
    velocity: 0,
    obstacles: [],
    lastTs: performance.now(),
    spawnTimer: 560
  };
  document.getElementById('runner-overlay').style.display = 'none';
  dinoState.frame = requestAnimationFrame(tickDinoGame);
}

function stopDinoGame() {
  if (dinoState.frame) cancelAnimationFrame(dinoState.frame);
  dinoState.frame = null;
  dinoState.running = false;
}

// Leaving a run mid-game used to just stop it, keeping the wager with no payout.
// Now it ends the run and pays out for the score reached, as if the player crashed.
function finishOrStopDinoGame() {
  if (dinoState.running) endDinoGame();
  else stopDinoGame();
}

function jumpDino(isTouch = false) {
  if (!dinoState.running || dinoState.playerY > 2) return;
  dinoState.velocity = isTouch ? 18.2 : 10.8;
  if (isTouch) dinoState.playerY = 4;
}

function tickDinoGame(ts) {
  if (!dinoState.running) return;
  const dt = Math.min(32, ts - dinoState.lastTs);
  dinoState.lastTs = ts;
  dinoState.score += dt * 0.0065;
  dinoState.velocity -= dt * 0.041;
  dinoState.playerY = Math.max(0, dinoState.playerY + dinoState.velocity);
  if (dinoState.playerY === 0 && dinoState.velocity < 0) dinoState.velocity = 0;

  const speed = runnerSpeed();
  dinoState.spawnTimer -= dt;
  if (dinoState.spawnTimer <= 0) {
    spawnRunnerObstacles();
    dinoState.spawnTimer = nextRunnerSpawnDelay();
  }
  dinoState.obstacles.forEach(o => { o.x -= dt * speed; });
  dinoState.obstacles = dinoState.obstacles.filter(o => o.x > -50);

  if (runnerHasCollision()) {
    endDinoGame();
    return;
  }
  drawRunnerScene();
  dinoState.frame = requestAnimationFrame(tickDinoGame);
}

function runnerHasCollision() {
  const player = { x: 76, y: 188 - dinoState.playerY, w: 42, h: 42 };
  return dinoState.obstacles.some(o => {
    const obstacle = { x: o.x, y: 232 - o.h, w: o.w, h: o.h };
    return player.x < obstacle.x + obstacle.w &&
      player.x + player.w > obstacle.x &&
      player.y < obstacle.y + obstacle.h &&
      player.y + player.h > obstacle.y;
  });
}

function endDinoGame() {
  stopDinoGame();
  dinoState.over = true;
  const finalScore = Math.floor(dinoState.score);
  dinoState.best = Math.max(dinoState.best, finalScore);
  saveRunnerHighScore(finalScore);
  const mult = runnerMultiplier(dinoState.score);
  const payout = +(dinoState.wager * mult).toFixed(2);
  awardGamePayout(payout, 'Quark Run');
  drawRunnerScene();
  const overlay = document.getElementById('runner-overlay');
  const result = document.getElementById('runner-result');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.textContent = 'Game Over';
  }
  if (result) {
    result.textContent = `Score ${finalScore}. ${mult.toFixed(2)}x paid ${fmt$(payout)}.`;
    result.className = `game-result ${payout > dinoState.wager ? 'win' : 'loss'}`;
  }
  renderRunnerLeaderboard();
}

function runnerSpeed() {
  return 0.34 + Math.min(0.56, dinoState.score / 220);
}

// Break-even is at 200 (~31s of play). Most players crash between 80 and 160,
// which returns 0.3x–0.76x, so the game loses money for most runs.
function runnerMultiplier(score) {
  if (score >= 500) return 3;
  if (score >= 300) return 1.75 + ((score - 300) / 200) * 1.25;
  if (score >= 200) return 1 + ((score - 200) / 100) * 0.75;
  if (score >= 100) return 0.4 + ((score - 100) / 100) * 0.6;
  return Math.max(0, score / 100 * 0.4);
}

function spawnRunnerObstacles() {
  const density = Math.min(1, dinoState.score / 130);
  const variants = [
    { type: 'short-wide', w: 46, h: 42 },
    { type: 'short-thin', w: 24, h: 42 },
    { type: 'tall-wide',  w: 44, h: 72 },
    { type: 'tall-thin',  w: 26, h: 72 }
  ];
  const makeObstacle = x => {
    const variant = variants[Math.floor(Math.random() * variants.length)];
    return {
      x,
      type: variant.type,
      w: variant.w + Math.random() * (density * 8),
      h: variant.h + Math.random() * (density * 6)
    };
  };

  dinoState.obstacles.push(makeObstacle(780));
  if (dinoState.score > 45 && Math.random() < density * 0.5) {
    dinoState.obstacles.push(makeObstacle(780 + 150 + Math.random() * 90));
  }
}

function nextRunnerSpawnDelay() {
  const density = Math.min(1, dinoState.score / 160);
  const base = 980 - density * 390;
  const jitter = 520 - density * 260;
  return Math.max(460, base + Math.random() * jitter);
}

function drawRunnerScene() {
  const canvas = document.getElementById('runner-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#10131d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#363a52';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 233);
  ctx.lineTo(canvas.width, 233);
  ctx.stroke();
  drawQuarkRunnerSprite(ctx, 76, 188 - dinoState.playerY, 42);
  for (const o of dinoState.obstacles) drawScientistObstacle(ctx, o);
  ctx.fillStyle = '#e8eaf6';
  ctx.font = '700 18px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(`Score ${Math.floor(dinoState.score)}`, 18, 30);
}

function drawScientistObstacle(ctx, o) {
  const ground = 232;
  const x = o.x;
  const y = ground - o.h;
  const center = x + o.w / 2;
  const headR = Math.max(5, Math.min(9, o.w * 0.22));
  const headY = y + headR + 2;
  const bodyTop = headY + headR + 3;
  const bodyBottom = ground - 12;
  const armY = bodyTop + (bodyBottom - bodyTop) * 0.34;
  const legY = bodyBottom;

  ctx.save();
  ctx.lineWidth = o.type.includes('wide') ? 4 : 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f8fafc';
  ctx.fillStyle = '#f8fafc';

  ctx.beginPath();
  ctx.arc(center, headY, headR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(center, bodyTop);
  ctx.lineTo(center, bodyBottom);
  ctx.moveTo(center - o.w * 0.38, armY);
  ctx.lineTo(center + o.w * 0.38, armY + (o.type.includes('short') ? 2 : -4));
  ctx.moveTo(center, legY);
  ctx.lineTo(center - o.w * 0.34, ground);
  ctx.moveTo(center, legY);
  ctx.lineTo(center + o.w * 0.34, ground);
  ctx.stroke();

  ctx.restore();
}

function drawQuarkRunnerSprite(ctx, x, y, size) {
  if (quarkRunnerLogo.complete && quarkRunnerLogo.naturalWidth > 0) {
    ctx.drawImage(quarkRunnerLogo, x, y, size, size);
    return;
  }
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(x + 4, y, size - 8, size);
}

// ── Modal ──────────────────────────────────────────────────────────────────
// opts: { mode: 'buy'|'sell', side: 'yes'|'no', keepPosition: bool }
function openModal(marketId, triggerEl = null, opts = {}) {
  const m = appData.markets.find(x => x.id === marketId);
  if (!m) return;
  const isMobileAnchored = triggerEl && window.matchMedia('(max-width: 640px)').matches;
  const restoreScrollY = isMobileAnchored ? window.scrollY : null;

  selectedMarketId  = marketId;
  selectedTradeMode = opts.mode || 'buy';
  selectedTradeSide = opts.side || 'yes';

  const yp   = yesPrice(m);
  const np   = noPrice(m);
  const h    = getUserHolding(marketId);
  const ud   = userData();
  const vol  = m.yesPool + m.noPool;
  const hasPos = h.yes > 0 || h.no > 0;

  const modalContent = document.getElementById('modal-content');
  modalContent.innerHTML = `
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
      <div id="trade-panel-wrap"></div>
    `}

    ${currentUser?.role === 'admin' ? `
      <div class="modal-admin-bar">
        <span class="modal-admin-label">Admin:</span>
        <button class="btn btn-ghost" onclick="adminEditFromModal()">Edit</button>
        ${m.status === 'open' ? `
          <button class="btn btn-yes" onclick="adminResolve('yes')">Resolve YES ✓</button>
          <button class="btn btn-no"  onclick="adminResolve('no')">Resolve NO ✗</button>
        ` : ''}
      </div>
    ` : ''}
  `;

  renderTradePanel();
  const modal = document.getElementById('market-modal');
  if (!opts.keepPosition) {
    positionMarketModal(triggerEl);
    modal.scrollTop = 0;
  }
  modal.classList.add('open');
  if (restoreScrollY !== null) {
    requestAnimationFrame(() => window.scrollTo({ top: restoreScrollY, left: 0, behavior: 'auto' }));
  }
}

function closeModal() {
  document.getElementById('market-modal').classList.remove('open');
  resetMarketModalPosition();
  selectedMarketId  = null;
  selectedTradeSide = 'yes';
  selectedTradeMode = 'buy';
}

function positionMarketModal(triggerEl) {
  const modal = document.getElementById('market-modal');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;
  resetMarketModalPosition();
  if (!triggerEl || !window.matchMedia('(max-width: 640px)').matches) return;

  // Start near the tapped item but never lower than 12% down the screen,
  // so the pop-up gets most of the viewport instead of the bottom half.
  const rect = triggerEl.getBoundingClientRect();
  const top = Math.max(12, Math.min(window.innerHeight * 0.12, rect.top));
  content.style.position = 'fixed';
  content.style.left = '12px';
  content.style.right = '12px';
  content.style.top = top + 'px';
  content.style.width = 'auto';
  content.style.maxHeight = `calc(100dvh - ${top + 12}px)`;
}

function resetMarketModalPosition() {
  const modal = document.getElementById('market-modal');
  const content = document.getElementById('modal-content');
  if (modal) {
    modal.style.paddingTop = '';
    modal.scrollTop = 0;
  }
  if (!content) return;
  content.style.marginTop = '';
  content.style.position = '';
  content.style.left = '';
  content.style.right = '';
  content.style.top = '';
  content.style.width = '';
  content.style.maxHeight = '';
}

// ── Trade panel (Buy / Sell) ──
function renderTradePanel() {
  const wrap = document.getElementById('trade-panel-wrap');
  const m = appData.markets.find(x => x.id === selectedMarketId);
  if (!wrap || !m) return;
  const ud = userData();
  const h  = getUserHolding(m.id);
  const held = { yes: h.yes || 0, no: h.no || 0 };
  const hasPos = held.yes > 0 || held.no > 0;

  // Fall back to buying if there's nothing to sell on the chosen side.
  if (!hasPos) selectedTradeMode = 'buy';
  if (selectedTradeMode === 'sell' && !(held[selectedTradeSide] > 0)) {
    selectedTradeSide = held.yes > 0 ? 'yes' : 'no';
  }
  const selling = selectedTradeMode === 'sell';
  const side    = selectedTradeSide;
  const yp = yesPrice(m), np = noPrice(m);
  const maxAmt = selling ? held[side] : ud.balance;

  const sideBtn = s => {
    const pct = fmtPct(s === 'yes' ? yp : np);
    const disabled = selling && !(held[s] > 0);
    const sub = selling ? (held[s] > 0 ? `${fmt$(held[s])} held` : 'None held') : `Buy ${s.toUpperCase()}`;
    return `
      <button id="side-${s}" class="side-btn ${s} ${side === s ? 'active' : ''}" ${disabled ? 'disabled' : ''} onclick="selectSide('${s}')">
        <span class="sb-pct">${selling ? s.toUpperCase() : pct}</span>
        <span class="sb-lbl">${sub}</span>
      </button>`;
  };

  const quick = selling
    ? [[0.25, '25%'], [0.5, '50%'], [1, 'All']].map(([f, lbl]) =>
        `<button class="quick-btn" onclick="setAmt(${(maxAmt * f).toFixed(2)})">${lbl}</button>`).join('')
    : [5, 10, 20, 50].filter(v => v <= ud.balance + 0.001).map(v =>
        `<button class="quick-btn" onclick="setAmt(${v.toFixed(2)})">${fmt$(v)}</button>`).join('');

  wrap.innerHTML = `
    <div class="trade-panel">
      <div class="trade-header">
        <span class="trade-title">${selling ? 'Sell Position' : 'Place Trade'}</span>
        <span class="trade-bal">Balance: <strong>${fmt$(ud.balance)}</strong></span>
      </div>

      ${hasPos ? `
        <div class="trade-mode-btns" role="tablist">
          <button class="trade-mode-btn ${!selling ? 'active' : ''}" onclick="selectTradeMode('buy')">Buy</button>
          <button class="trade-mode-btn ${selling ? 'active' : ''}" onclick="selectTradeMode('sell')">Sell</button>
        </div>
      ` : ''}

      <div class="side-btns">${sideBtn('yes')}${sideBtn('no')}</div>

      <div class="amount-wrap">
        <label>${selling ? `Amount to sell (of ${fmt$(held[side])} ${side.toUpperCase()})` : 'Amount'}</label>
        <div class="amount-row">
          <span class="amount-prefix">$</span>
          <input id="trade-amt" type="number" placeholder="0.00" min="0.01" step="0.01" max="${maxAmt}" oninput="updateEstimate()">
          <button class="btn btn-ghost max-btn" onclick="setAmt(${maxAmt})">MAX</button>
        </div>
        <div class="quick-btns">${quick}</div>
      </div>

      ${selling ? `
        <p class="trade-note">Selling returns the amount you staked minus a ${Math.round(SELL_FEE * 100)}% exit fee.
          To bet against ${side.toUpperCase()}, buy ${side === 'yes' ? 'NO' : 'YES'} instead.</p>
      ` : ''}

      <div id="estimate-row" class="estimate-row" style="display:none">
        <span>${selling ? "You'll receive:" : 'Estimated payout if correct:'}</span>
        <span id="estimate-val" class="estimate-val"></span>
      </div>

      <div id="trade-err" class="err-msg" style="display:none"></div>

      <button id="trade-btn" class="btn btn-${side} btn-large w-full" onclick="executeTrade()">
        ${selling ? 'Sell' : 'Buy'} ${side.toUpperCase()}
      </button>
    </div>
  `;
}

function selectTradeMode(mode) {
  selectedTradeMode = mode;
  renderTradePanel();
}

function selectSide(side) {
  if (side === selectedTradeSide) return;
  const keep = selectedTradeMode === 'buy' ? document.getElementById('trade-amt')?.value : '';
  selectedTradeSide = side;
  renderTradePanel();
  if (keep) setAmt(keep);
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

  if (selectedTradeMode === 'sell') {
    const held = getUserHolding(m.id)[selectedTradeSide] || 0;
    const refund = sellRefund(Math.min(amount, held));
    document.getElementById('estimate-val').textContent =
      `${fmt$(refund)}${amount > held + 0.001 ? ` (you only hold ${fmt$(held)})` : ''}`;
    row.style.display = 'flex';
    return;
  }

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

async function executeTrade() {
  const btn = document.getElementById('trade-btn');
  if (!btn || btn.disabled) return;
  const amount   = document.getElementById('trade-amt')?.value;
  const marketId = selectedMarketId;
  const side     = selectedTradeSide;
  const mode     = selectedTradeMode;
  btn.disabled = true;
  const res = mode === 'sell'
    ? await sellShares(marketId, side, amount)
    : await buyShares(marketId, side, amount);
  btn.disabled = false;
  refreshHeader();

  if (res.success) {
    showToast(mode === 'sell'
      ? `Sold ${fmt$(res.sold)} of ${side.toUpperCase()} for ${fmt$(res.refund)}`
      : `Bought ${side.toUpperCase()} position!`, 'success');
    if (selectedMarketId === marketId) openModal(marketId, null, { mode, side, keepPosition: true });
  } else {
    const errEl = document.getElementById('trade-err');
    if (!errEl) return;
    errEl.textContent  = res.error;
    errEl.style.display = 'block';
  }
}

async function adminResolve(winner) {
  if (!confirm(`Resolve as ${winner.toUpperCase()}?`)) return;
  const res = await resolveMarket(selectedMarketId, winner);
  if (res.success) {
    showToast(`Resolved ${winner.toUpperCase()} — winnings paid out!`, 'success');
    closeModal();
    refreshHeader();
  } else {
    showToast(res.error, 'error');
  }
}

function adminEditFromModal() {
  const id = selectedMarketId;
  closeModal();
  activeAdminTab = 'markets';
  editingMarketId = id;
  showView('admin');
  startEditingMarket(id);
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

// ── Animated Network Background ────────────────────────────────────────────
function initNetworkBackground() {
  const canvas = document.getElementById('network-bg');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: null, y: null };
  let particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;

  function particleCount() {
    return Math.max(90, Math.min(190, Math.floor((width * height) / 9500)));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nextCount = particleCount();
    if (particles.length > nextCount) {
      particles = particles.slice(0, nextCount);
    }
    while (particles.length < nextCount) {
      particles.push(createParticle());
    }
  }

  function createParticle() {
    const speed = prefersReducedMotion ? 0 : 0.035 + Math.random() * 0.11;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 1.2 + Math.random() * 2.5,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.004 + Math.random() * 0.008,
      glow: Math.random() > 0.82
    };
  }

  function drawBackground() {
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.22, 0, width * 0.5, height * 0.22, Math.max(width, height) * 0.76);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.14)');
    gradient.addColorStop(0.42, 'rgba(13, 14, 19, 0.54)');
    gradient.addColorStop(1, 'rgba(4, 8, 18, 0.96)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function tick() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);
    drawBackground();

    for (const p of particles) {
      if (!prefersReducedMotion) {
        p.drift += p.driftSpeed;
        p.vx += Math.cos(p.drift + frame * 0.0012) * 0.0022;
        p.vy += Math.sin(p.drift * 0.9 + frame * 0.001) * 0.0022;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (pointer.x !== null && !prefersReducedMotion) {
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 36000 && distSq > 1) {
          const force = (1 - distSq / 36000) * 0.011;
          p.vx += dx * force / Math.sqrt(distSq);
          p.vy += dy * force / Math.sqrt(distSq);
        }
      }

      applyParticleSpacing(p);

      p.vx *= 0.992;
      p.vy *= 0.992;
      stabilizeParticleSpeed(p);

      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;
    }

    const maxDist = 170;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.14;
          ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      const alpha = p.glow ? 0.56 : 0.34;
      ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      if (p.glow) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    networkAnimationFrame = requestAnimationFrame(tick);
  }

  function applyParticleSpacing(particle) {
    if (prefersReducedMotion) return;
    const minSpacing = 76;
    for (const other of particles) {
      if (other === particle) continue;
      const dx = particle.x - other.x;
      const dy = particle.y - other.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0 || distSq > minSpacing * minSpacing) continue;

      const dist = Math.sqrt(distSq);
      const push = (1 - dist / minSpacing) * 0.006;
      particle.vx += (dx / dist) * push;
      particle.vy += (dy / dist) * push;
    }
  }

  function stabilizeParticleSpeed(particle) {
    if (prefersReducedMotion) return;
    const speed = Math.hypot(particle.vx, particle.vy);
    const minSpeed = 0.035;
    const maxSpeed = 0.22;

    if (speed < minSpeed) {
      const angle = speed > 0 ? Math.atan2(particle.vy, particle.vx) : particle.drift;
      particle.vx = Math.cos(angle) * minSpeed;
      particle.vy = Math.sin(angle) * minSpeed;
      return;
    }

    if (speed > maxSpeed) {
      particle.vx = (particle.vx / speed) * maxSpeed;
      particle.vy = (particle.vy / speed) * maxSpeed;
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    pointer.x = null;
    pointer.y = null;
  });

  if (networkAnimationFrame) cancelAnimationFrame(networkAnimationFrame);
  resize();
  tick();
}

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initNetworkBackground();

  document.getElementById('market-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => showView(link.dataset.view));
  });

  window.addEventListener('keydown', e => {
    if (activeView === 'games' && activeGamesTab === 'runner' && e.code === 'Space') {
      e.preventDefault();
      jumpDino();
    }
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  startRealtimeListener();
});
