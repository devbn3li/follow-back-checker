// Follow Back Checker: runs on instagram.com inside your own logged-in session.
// It calls the same endpoints the website uses when you scroll a followers list,
// paces the requests, compares the two lists, and keeps a per-account history locally.
// Nothing leaves the browser. Pure logic lives in core.js, strings in i18n.js, CSS in styles.js.
// Hosts: Chrome extension (default), the Android app (window.FBC_HOST = 'android'),
// a userscript, or a bookmarklet (window.FBC_HOST = 'bookmarklet').
(() => {
  'use strict';
  if (window.top !== window) return;
  if (window.__fbcLoaded) {
    // A bookmarklet tapped again opens the panel; every other host just skips the second injection.
    if (window.FBC_HOST === 'bookmarklet' && typeof window.__fbcToggle === 'function') window.__fbcToggle();
    return;
  }
  const CORE = window.FBC_CORE, I18N = window.FBC_I18N;
  if (!CORE || !I18N) return;
  window.__fbcLoaded = true;
  const { num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, profileUsername, describeRel, parseUsernames, toCsv, matchesKind, tokensFromHtml, jazoest, judgeAction, findFollowing, lostSince, whoLeft, computeStats, loopsFrom, carryMe, preCheck, UNDO, appendLog, markUndone, parsePending, mergePending, shortNum, followBackOdds, sortRows, pruneCounts, goneSet, reactivations, reclassifyEvents, picCandidates, emptyDates, applyDateEvents, importDates, sinceOf, guessListKind, zipReadFile, shouldAutoCheck, autoCheckDefault, parseRelease, pickExportEntry } = CORE;
  const CSS = typeof FBC_CSS === 'string' ? FBC_CSS : '';
  const HOST = typeof window.FBC_HOST === 'string' ? window.FBC_HOST : 'extension';
  const MOBILE = HOST === 'android' || (window.innerWidth < 700 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  // The script's own version: the extension reads its manifest, the bundles carry what the build stamped in.
  const SCRIPT_VERSION = (() => { try { return chrome.runtime.getManifest().version; } catch (e) { return typeof window.FBC_VERSION === 'string' ? window.FBC_VERSION : ''; } })();
  // The Android app's bridge (window.FollowCheckHost), when running inside it.
  const hostApp = () => (HOST === 'android' && window.FollowCheckHost ? window.FollowCheckHost : null);

  // Instagram web internals. If Instagram changes its site, these are the lines to revisit.
  const API = {
    appId: '936619743392459',
    asbdId: '129477',
    pageSize: 200,
    info: (id) => `/api/v1/users/${id}/info/`,
    following: (id, maxId, count, order) => `/api/v1/friendships/${id}/following/?count=${count || API.pageSize}` + (order ? `&order=${order}` : '') + (maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''),
    followers: (id, maxId, count, order) => `/api/v1/friendships/${id}/followers/?count=${count || API.pageSize}&search_surface=follow_list_page` + (order ? `&order=${order}` : '') + (maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''),
    friendship: (id) => `/api/v1/friendships/show/${id}/`,
  };
  // Pause between page requests, and the back-off when Instagram answers "wait a few minutes".
  const PACE = { minDelayMs: 1200, jitterMs: 1600, rateLimitWaitMs: 90000, rateLimitRetries: 2, longPauseEvery: 15, longPauseMs: 10000 };
  // How many "follow you, not followed back" accounts are double-checked one by one after a check.
  const VERIFY_MAX = 20;
  // Unfollow: one account per tap, confirmed, spaced out, capped, verified, and paused when Instagram objects.
  // docId is the persisted GraphQL query behind instagram.com's own Unfollow button; Instagram rotates it now
  // and then. The older REST route is tried first and needs no such id.
  const ACT = { gapMs: 20000, perHour: 30, perDay: 100, blockPauseMs: 2 * 60 * 60 * 1000, rateLimitPauseMs: 30 * 60 * 1000, docId: '27789106940691111', friendlyName: 'usePolarisUnfollowMutation' };

  // --- language and formatting
  let lang = String(navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
  function t(key, vars) {
    const dict = I18N[lang] || I18N.en;
    let v = dict[key];
    if (v == null) v = I18N.en[key];
    if (typeof v === 'function') return v(vars || {});
    if (typeof v !== 'string') return key;
    return v.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  }
  const locale = () => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US');
  const fmtDT = (ms) => new Date(ms).toLocaleString(locale(), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtMD = (ms) => new Date(ms).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
  const fmtT = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = (ms) => (new Date(ms).toDateString() === new Date().toDateString() ? fmtT(ms) : fmtMD(ms));
  const cookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  // Build elements without innerHTML, so a strict page CSP or Trusted Types cannot block the panel.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'value') el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(typeof kid === 'object' && kid.nodeType ? kid : String(kid));
    }
    return el;
  }

  // --- errors and timing
  class Cancelled extends Error { constructor() { super('Cancelled'); this.name = 'Cancelled'; } }
  class RateLimited extends Error { constructor(m) { super(m); this.name = 'RateLimited'; } }
  class AuthError extends Error { constructor(m) { super(m); this.name = 'AuthError'; } }
  function sleep(ms, ctl) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (ctl && ctl.cancelled) { reject(new Cancelled()); return; }
        const left = ms - (Date.now() - start);
        if (left <= 0) { resolve(); return; }
        setTimeout(tick, Math.min(200, left));
      };
      tick();
    });
  }
  async function countdown(ms, onTick, ctl) {
    const end = Date.now() + ms;
    for (;;) {
      const left = end - Date.now();
      if (left <= 0) return;
      onTick(Math.ceil(left / 1000));
      await sleep(Math.min(1000, left), ctl);
    }
  }

  // --- storage: extension storage when it exists, otherwise the site's localStorage
  const cs = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;
  // Where the script runs; the userscript looks like the extension except for the missing extension storage.
  const RUNTIME = HOST === 'android' ? 'android' : HOST === 'bookmarklet' ? 'bookmarklet' : cs ? 'extension' : 'userscript';
  function storageGet(keys) {
    return new Promise((resolve) => {
      if (cs) {
        try { cs.get(keys, (r) => resolve(r || {})); return; } catch (e) { /* fall through */ }
      }
      const out = {};
      for (const k of keys) { try { out[k] = JSON.parse(localStorage.getItem('fbc:' + k) || 'null'); } catch (e) { out[k] = null; } }
      resolve(out);
    });
  }
  function storageSet(obj) {
    return new Promise((resolve) => {
      if (cs) {
        try { cs.set(obj, () => resolve()); return; } catch (e) { /* fall through */ }
      }
      for (const [k, v] of Object.entries(obj)) { try { localStorage.setItem('fbc:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
      resolve();
    });
  }
  function storageRemove(keys) {
    return new Promise((resolve) => {
      if (cs) {
        try { cs.remove(keys, () => resolve()); return; } catch (e) { /* fall through */ }
      }
      for (const k of keys) { try { localStorage.removeItem('fbc:' + k); } catch (e) { /* ignore */ } }
      resolve();
    });
  }
  // Everything is stored per Instagram account, keyed by the logged-in user id.
  const acctStoreKey = (uid) => 'fbc.acct.' + uid;
  const doneStoreKey = (uid) => 'fbc.done.' + uid;
  const histStoreKey = (uid) => 'fbc.hist.' + uid;
  const whiteStoreKey = (uid) => 'fbc.white.' + uid;
  const actStoreKey = (uid) => 'fbc.actions.' + uid;
  const logStoreKey = (uid) => 'fbc.log.' + uid;
  const pendStoreKey = (uid) => 'fbc.pending.' + uid;
  const datesStoreKey = (uid) => 'fbc.dates.' + uid;
  // Automatic check: when the last one is older than this, a few seconds after the page loads.
  const AUTO = { maxAgeMs: 3 * 86400000, delayMs: 4000 };
  // Update notice: GitHub's latest release, asked at most once a day.
  const UPDATE = { everyMs: 86400000 };
  const LOG_CAP = 500;
  // Counts of other accounts, shared by every logged-in account: username -> { fw, fg, at }.
  const COUNTS_KEY = 'fbc.counts';
  const COUNTS = { max: 60, cap: 3000, ttlMs: 14 * 86400000 };
  const HIST_CAPS = { points: 400, events: 3000 };

  // --- Instagram requests
  async function igGet(path) {
    const headers = { 'x-ig-app-id': API.appId, 'x-asbd-id': API.asbdId, 'x-requested-with': 'XMLHttpRequest', accept: '*/*' };
    const csrf = cookie('csrftoken');
    if (csrf) headers['x-csrftoken'] = csrf;
    try { const claim = sessionStorage.getItem('www-claim-v2'); if (claim) headers['x-ig-www-claim'] = claim; } catch (e) { /* optional */ }
    let res;
    try { res = await fetch(location.origin + path, { headers, credentials: 'include' }); }
    catch (e) { throw new Error(t('errNetwork')); }
    if (res.status === 429) throw new RateLimited(t('errSlow'));
    if (res.status === 404) throw new Error(t('errHttp', { s: 404, m: '' }));
    if (res.status === 401 || res.status === 403) throw new AuthError(t('errRefused', { s: res.status }));
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) throw new AuthError(t('errLoggedOut'));
    let j;
    try { j = await res.json(); } catch (e) { throw new Error(t('errUnreadable')); }
    const msg = j && typeof j.message === 'string' ? j.message : '';
    if (/wait a few minutes|rate limit/i.test(msg)) throw new RateLimited(t('errSlow'));
    if (/login_required|checkpoint_required|challenge_required/i.test(msg)) throw new AuthError(t('errWantsLogin', { m: msg }));
    if (!res.ok) throw new Error(t('errHttp', { s: res.status, m: msg ? ': ' + msg : '' }));
    return j;
  }
  // One full pass over a list. Returns the accounts plus how many came back twice, which is the
  // sign that the pages shifted under us and something else may have been skipped.
  async function fetchList(kind, userId, onProgress, ctl, opts) {
    const o = opts || {};
    const out = new Map();
    let maxId = '', retries = 0, dupes = 0, requests = 0;
    for (;;) {
      if (ctl.cancelled) throw new Cancelled();
      let j;
      try { j = await igGet(API[kind](userId, maxId, o.pageSize, o.order)); }
      catch (e) {
        if (e instanceof RateLimited && retries < PACE.rateLimitRetries) {
          retries++;
          await countdown(PACE.rateLimitWaitMs, (s) => onProgress(out.size, s), ctl);
          continue;
        }
        if (e instanceof RateLimited) throw new Error(t('errSlowTwice'));
        throw e;
      }
      const users = Array.isArray(j.users) ? j.users : [];
      for (const raw of users) {
        const rec = normalizeUser(raw);
        if (!rec) continue;
        if (out.has(rec.u)) dupes++; else out.set(rec.u, rec);
      }
      onProgress(out.size, null);
      maxId = j.next_max_id != null && j.next_max_id !== '' ? String(j.next_max_id) : '';
      if (!maxId || users.length === 0) break;
      requests++;
      // A longer pause every few pages keeps big accounts gentle on Instagram's limits.
      const extra = requests % PACE.longPauseEvery === 0 ? PACE.longPauseMs : 0;
      await sleep(extra + PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
    }
    return { users: out, dupes };
  }
  async function runCheck(ctl, prog) {
    const userId = cookie('ds_user_id');
    if (!userId) throw new AuthError(t('errLoginTab'));
    prog({ phase: 'info' });
    let totals = { following: null, followers: null, me: '' };
    try {
      const info = await igGet(API.info(userId));
      const u = info && info.user;
      if (u) totals = { following: typeof u.following_count === 'number' ? u.following_count : null, followers: typeof u.follower_count === 'number' ? u.follower_count : null, me: typeof u.username === 'string' ? u.username : '' };
    } catch (e) {
      if (e instanceof AuthError) throw e; // totals are only for the progress bar
    }
    // Instagram's lists are paged by offset, and their default order is not stable, so accounts can fall
    // between two pages. Each list is read in a fixed order (newest follow first); if anything came back
    // twice or the list is shorter than Instagram's own count, a second pass from the other end fills the gaps.
    const fetchComplete = async (kind, total) => {
      const report = (n, wait) => prog({ phase: kind, n, total, wait });
      let first;
      try { first = await fetchList(kind, userId, report, ctl, { order: 'date_followed_latest' }); }
      catch (e) {
        if (e instanceof AuthError || e instanceof RateLimited || e instanceof Cancelled) throw e;
        first = await fetchList(kind, userId, report, ctl); // the order parameter was refused; plain pass
      }
      const list = first.users;
      const shortBy = typeof total === 'number' ? total - list.size : 0;
      if (first.dupes > 0 || shortBy > 0) {
        await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
        let second = null;
        try { second = await fetchList(kind, userId, report, ctl, { order: 'date_followed_earliest', pageSize: 100 }); }
        catch (e) { if (e instanceof AuthError || e instanceof RateLimited || e instanceof Cancelled) throw e; }
        if (second) second.users.forEach((rec, u) => { if (!list.has(u)) list.set(u, rec); });
      }
      return list;
    };
    await sleep(PACE.minDelayMs, ctl);
    const following = await fetchComplete('following', totals.following);
    await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
    const followers = await fetchComplete('followers', totals.followers);
    // The accounts that follow you but seem unfollowed by you are few. Ask Instagram about each one
    // directly, so an account that slipped between pages is never reported as one you don't follow.
    const fans = [];
    followers.forEach((rec, u) => { if (!following.has(u) && rec.id) fans.push(rec); });
    if (fans.length > 0 && fans.length <= VERIFY_MAX) {
      let i = 0;
      for (const rec of fans) {
        if (ctl.cancelled) throw new Cancelled();
        prog({ phase: 'verify', n: ++i, total: fans.length });
        try {
          const st = await igGet(API.friendship(rec.id));
          if (st && st.following === true) following.set(rec.u, rec);
        } catch (e) {
          if (e instanceof AuthError) throw e;
          if (e instanceof RateLimited) break;
        }
        await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
      }
    }
    const short = (got, total) => typeof total === 'number' && got < total - Math.max(2, Math.ceil(total * 0.01));
    const partial = {};
    if (short(following.size, totals.following)) partial.following = { got: following.size, total: totals.following };
    if (short(followers.size, totals.followers)) partial.followers = { got: followers.size, total: totals.followers };
    return {
      at: Date.now(), uid: userId, me: totals.me, totals,
      partial: Object.keys(partial).length ? partial : null,
      following: [...following.values()], followers: [...followers.values()],
    };
  }

  // --- UI
  const host = document.createElement('div');
  host.id = 'fbc-host';
  if (MOBILE) host.classList.add('mobile');
  const root = host.attachShadow({ mode: 'open' });
  let styled = false;
  try {
    if ('adoptedStyleSheets' in root && typeof CSSStyleSheet === 'function') {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
      styled = true;
    }
  } catch (e) { styled = false; }
  if (!styled) { const st = document.createElement('style'); st.textContent = CSS; root.appendChild(st); }
  function mount() {
    const parent = document.body || document.documentElement;
    if (parent && !host.isConnected) parent.appendChild(host);
  }

  const TABS = {
    notback: { label: 'tileNotback', title: 'titleNotback', empty: 'emptyNotback' },
    fans: { label: 'tileFans', title: 'titleFans', empty: 'emptyFans' },
    mutual: { label: 'tileMutual', title: 'titleMutual', empty: 'emptyMutual' },
    changes: { label: 'tileHistory', title: 'titleHistory', empty: '' },
  };
  const freshActions = () => ({ times: [], pausedUntil: 0, warned: false });
  const state = { uid: '', snap: null, prev: null, done: {}, white: {}, actions: freshActions(), lists: null, hist: null, log: [], pending: [], counts: {}, countsRun: null, sort: 'name', left: new Map(), loops: new Map(), react: new Map(), onlyLeft: false, evFilter: 'all', kind: 'all', showProtected: false, tab: 'notback', q: '', hideDone: false, running: false, ctl: null, open: false, width: 640, cooldownUntil: 0, countsPausedUntil: 0, dates: null, autoCheck: false, upd: { at: 0, seen: '', rel: null } };
  const live = { following: 0, followers: 0 };
  const ui = {};
  // Small preferences, remembered across visits: language, panel width, and the pause after Instagram asks us to slow down.
  const UI_KEY = 'fbc.ui';
  function saveUi() { storageSet({ [UI_KEY]: { lang, width: state.width, cooldownUntil: state.cooldownUntil, countsPausedUntil: state.countsPausedUntil, autoCheck: state.autoCheck, upd: state.upd } }); }
  let prefsLoaded;
  const prefsReady = new Promise((resolve) => { prefsLoaded = resolve; }); // the automatic check waits for the settings
  const WIDTH = { def: 640, min: 380, max: 1100, narrowBelow: 560 };
  function applyWidth(w) {
    const cap = Math.min(WIDTH.max, window.innerWidth || WIDTH.max);
    w = Math.round(Math.max(WIDTH.min, Math.min(cap, Number(w) || WIDTH.def)));
    if (MOBILE) w = window.innerWidth || w;
    ui.drawer.style.width = w + 'px';
    ui.drawer.classList.toggle('narrow', w < WIDTH.narrowBelow);
    return w;
  }
  function wireResize() {
    let drag = null;
    const end = (e) => {
      if (!drag) return;
      drag = null;
      ui.drawer.classList.remove('dragging');
      try { ui.grip.releasePointerCapture(e.pointerId); } catch (e2) { /* ignore */ }
      saveUi();
      rerenderChart();
    };
    ui.grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, w: ui.drawer.getBoundingClientRect().width };
      ui.drawer.classList.add('dragging');
      try { ui.grip.setPointerCapture(e.pointerId); } catch (e2) { /* ignore */ }
      e.preventDefault();
    });
    ui.grip.addEventListener('pointermove', (e) => { if (drag) state.width = applyWidth(drag.w + (drag.x - e.clientX)); });
    ui.grip.addEventListener('pointerup', end);
    ui.grip.addEventListener('pointercancel', end);
    ui.grip.addEventListener('dblclick', () => { state.width = applyWidth(WIDTH.def); saveUi(); rerenderChart(); });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      state.width = applyWidth(state.width);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rerenderChart, 150);
    });
  }

  function build() {
    ui.fab = h('button', { class: 'fab', type: 'button', onclick: () => toggle() });
    ui.relDot = h('span', { class: 'dot' });
    ui.relName = h('b');
    ui.relText = h('span', { class: 'reltext' });
    ui.rel = h('button', { class: 'rel', type: 'button', hidden: true, onclick: () => recheckRel() }, ui.relDot, ui.relName, ui.relText);
    ui.fabwrap = h('div', { class: 'fabwrap' }, ui.rel, ui.fab);
    ui.me = h('span', { class: 'me' });
    ui.settingsBtn = h('button', { class: 'icon gear', type: 'button', onclick: () => toggleSettings() }, '⚙');
    ui.langBtn = h('button', { class: 'lang', type: 'button', onclick: () => setLang(lang === 'ar' ? 'en' : 'ar') });
    ui.close = h('button', { class: 'icon', type: 'button', onclick: () => toggle(false) }, '×');
    ui.check = h('button', { class: 'btn primary', type: 'button', onclick: () => startCheck() });
    ui.cancel = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => cancelCheck() });
    ui.status = h('div', { class: 'status' });
    ui.ptext = h('div', { class: 'ptext' });
    ui.pfill = h('div', { class: 'pfill' });
    ui.progress = h('div', { class: 'progress', hidden: true }, ui.ptext, h('div', { class: 'pbar' }, ui.pfill));
    ui.error = h('div', { class: 'error', role: 'alert', hidden: true });
    ui.ledger = h('div', { class: 'ledger' });
    ui.tiles = h('div', { class: 'tiles', role: 'tablist' });
    ui.tile = {};
    for (const k of Object.keys(TABS)) {
      const label = h('span', { class: 'label' });
      const value = h('span', { class: 'value' }, '0');
      const sub = h('span', { class: 'sub' });
      const el = h('button', { class: 'tile', type: 'button', role: 'tab', 'data-tab': k, 'aria-selected': 'false', onclick: () => { state.tab = k; renderList(); } }, label, value, sub);
      ui.tile[k] = { el, label, value, sub };
      ui.tiles.append(el);
    }
    ui.search = h('input', { class: 'field', type: 'search', autocomplete: 'off', spellcheck: 'false', oninput: () => { state.q = ui.search.value; renderList(); } });
    ui.hideDone = h('input', { type: 'checkbox', onchange: () => { state.hideDone = ui.hideDone.checked; renderList(); } });
    ui.hideDoneText = h('span');
    ui.hideDoneWrap = h('label', { class: 'chk' }, ui.hideDone, ui.hideDoneText);
    ui.showProtected = h('input', { type: 'checkbox', onchange: () => { state.showProtected = ui.showProtected.checked; renderList(); } });
    ui.showProtectedText = h('span');
    ui.showProtectedWrap = h('label', { class: 'chk', hidden: true }, ui.showProtected, ui.showProtectedText);
    ui.onlyLeft = h('input', { type: 'checkbox', onchange: () => { state.onlyLeft = ui.onlyLeft.checked; renderList(); } });
    ui.onlyLeftText = h('span');
    ui.onlyLeftWrap = h('label', { class: 'chk', hidden: true }, ui.onlyLeft, ui.onlyLeftText);
    ui.share = h('button', { class: 'btn small', type: 'button', onclick: () => openShareCard() });
    ui.kindOpts = ['all', 'verified', 'notVerified', 'private', 'public'].map((v) => h('option', { value: v }));
    ui.kindFilter = h('select', { class: 'field sel', onchange: () => { state.kind = ui.kindFilter.value; renderList(); } }, ui.kindOpts);
    ui.sortOpts = ['name', 'followers', 'ratio', 'since'].map((v) => h('option', { value: v }));
    ui.sortSel = h('select', { class: 'field sel', onchange: () => { state.sort = ui.sortSel.value; renderList(); } }, ui.sortOpts);
    ui.countsBtn = h('button', { class: 'btn small', type: 'button', onclick: () => loadCounts() });
    ui.filterOpts = ['all', 'others', 'gained', 'lost', 'you_followed', 'you_unfollowed', 'deactivated', 'reactivated'].map((v) => h('option', { value: v }));
    ui.evFilter = h('select', { class: 'field sel', hidden: true, onchange: () => { state.evFilter = ui.evFilter.value; renderList(); } }, ui.filterOpts);
    ui.copy = h('button', { class: 'btn small', type: 'button', onclick: () => copyList() });
    ui.download = h('button', { class: 'btn small', type: 'button', onclick: () => downloadCurrent() });
    ui.protectedBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { state.tab = 'protected'; renderList(); } });
    ui.pendingBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { state.tab = 'pending'; renderList(); } });
    ui.logBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { state.tab = 'actions'; renderList(); } });
    ui.toolbar = h('div', { class: 'toolbar' }, ui.search, ui.hideDoneWrap, ui.showProtectedWrap, ui.onlyLeftWrap, ui.kindFilter, ui.sortSel, ui.countsBtn, ui.evFilter, ui.copy, ui.download, ui.protectedBtn, ui.pendingBtn, ui.logBtn, ui.share);
    ui.listTitle = h('div', { class: 'listtitle' });
    ui.chart = h('div', { class: 'charthost', hidden: true });
    // Protected accounts: paste, import, export, and the list itself.
    ui.protHint = h('div', { class: 'hint' });
    ui.protText = h('textarea', { class: 'field area', rows: '3', spellcheck: 'false' });
    ui.protAdd = h('button', { class: 'btn small primary', type: 'button', onclick: () => addProtectedFromText() });
    ui.protFile = h('input', { type: 'file', accept: '.json,.txt,.csv,application/json,text/plain,text/csv', hidden: true, onchange: () => importProtectedFile() });
    ui.protImport = h('button', { class: 'btn small', type: 'button', onclick: () => ui.protFile.click() });
    ui.protExport = h('button', { class: 'btn small', type: 'button', onclick: () => exportProtected() });
    ui.protList = h('div', { class: 'list' });
    ui.protEmpty = h('div', { class: 'empty', hidden: true });
    ui.prot = h('div', { class: 'prot', hidden: true }, ui.protHint, ui.protText, h('div', { class: 'toolbar' }, ui.protAdd, ui.protImport, ui.protExport, ui.protFile), ui.protList, ui.protEmpty);
    // Pending requests: the hint, the export import, and the list itself.
    ui.pendHint = h('div', { class: 'hint' });
    ui.pendFile = h('input', { type: 'file', accept: '.zip,.json,.html,.htm,.txt,application/zip,application/x-zip-compressed,application/json,text/html,text/plain', hidden: true, onchange: () => importPendingFile() });
    ui.pendImport = h('button', { class: 'btn small', type: 'button', onclick: () => ui.pendFile.click() });
    ui.pend = h('div', { class: 'prot', hidden: true }, ui.pendHint, h('div', { class: 'toolbar' }, ui.pendImport, ui.pendFile));
    // Settings: the automatic check, the app's reminder, and the export import for exact follow dates.
    ui.settingsTitle = h('div', { class: 'stitle' });
    ui.autoCheck = h('input', { type: 'checkbox', onchange: () => { state.autoCheck = ui.autoCheck.checked; saveUi(); maybeAutoCheck(); } });
    ui.autoCheckText = h('span');
    ui.reminder = h('input', { type: 'checkbox', onchange: () => setReminder(ui.reminder.checked) });
    ui.reminderText = h('span');
    const app = hostApp();
    ui.reminderWrap = h('label', { class: 'chk', hidden: !(app && typeof app.setReminder === 'function') }, ui.reminder, ui.reminderText);
    if (app && typeof app.reminderEnabled === 'function') { try { ui.reminder.checked = app.reminderEnabled() !== false; } catch (e) { ui.reminder.checked = true; } }
    ui.datesHint = h('div', { class: 'hint' });
    ui.datesFile = h('input', { type: 'file', accept: '.zip,.json,.html,.htm,application/zip,application/x-zip-compressed,application/json,text/html', hidden: true, onchange: () => importDatesFile() });
    ui.datesImport = h('button', { class: 'btn small', type: 'button', onclick: () => ui.datesFile.click() });
    ui.datesStatus = h('div', { class: 'hint' });
    ui.picStatus = h('div', { class: 'hint', hidden: true });
    ui.settings = h('div', { class: 'settings', hidden: true }, ui.settingsTitle, h('label', { class: 'chk' }, ui.autoCheck, ui.autoCheckText), ui.reminderWrap, ui.datesHint, h('div', { class: 'toolbar' }, ui.datesImport, ui.datesFile), ui.datesStatus, ui.picStatus);
    // Update notice: shown when GitHub's latest release is newer than what runs here.
    ui.updText = h('span', { class: 'updtext' });
    ui.updGet = h('button', { class: 'btn small primary', type: 'button', onclick: () => openUpdate() });
    ui.updLater = h('button', { class: 'btn small', type: 'button', onclick: () => dismissUpdate() });
    ui.update = h('div', { class: 'update', hidden: true }, ui.updText, ui.updGet, ui.updLater);
    ui.list = h('div', { class: 'list' });
    ui.empty = h('div', { class: 'empty', hidden: true });
    ui.notice = h('div', { class: 'notice', hidden: true });
    ui.results = h('div', { class: 'results', hidden: true }, ui.ledger, ui.notice, ui.tiles, ui.toolbar, ui.listTitle, ui.chart, ui.prot, ui.pend, ui.list);
    ui.toast = h('div', { class: 'toast', role: 'status', hidden: true });
    ui.modalTitle = h('div', { class: 'mtitle' });
    ui.modalText = h('div', { class: 'mtext' });
    ui.modalOk = h('button', { class: 'btn primary', type: 'button' });
    ui.modalCancel = h('button', { class: 'btn', type: 'button' });
    ui.modal = h('div', { class: 'modal', role: 'dialog', hidden: true }, h('div', { class: 'box' }, ui.modalTitle, ui.modalText, h('div', { class: 'toolbar' }, ui.modalOk, ui.modalCancel)));
    ui.grip = h('div', { class: 'grip' });
    ui.foot = h('footer', { class: 'foot' });
    ui.body = h('div', { class: 'body' }, ui.results, ui.empty);
    ui.drawer = h('section', { class: 'drawer', role: 'dialog', 'aria-label': 'Follow Back Checker', hidden: true },
      ui.grip,
      h('header', { class: 'head' }, h('div', { class: 'headl' }, h('span', { class: 'title' }, 'Follow Back Checker'), ui.me), h('div', { class: 'headr' }, ui.settingsBtn, ui.langBtn, ui.close)),
      h('div', { class: 'controls' }, ui.check, ui.cancel, ui.status),
      ui.settings,
      ui.update,
      ui.progress,
      ui.error,
      ui.body,
      ui.foot,
      ui.toast,
      ui.modal,
    );
    // Picture viewer: the thumbnail first, the full size on request, and a save button.
    ui.lbImg = h('img', { class: 'lbimg', alt: '' });
    ui.lbName = h('div', { class: 'lbname' });
    ui.lbFull = h('button', { class: 'btn small', type: 'button', onclick: () => loadFullSize() });
    ui.lbSave = h('button', { class: 'btn small primary', type: 'button', onclick: () => saveCurrentImage() });
    ui.lbClose = h('button', { class: 'btn small', type: 'button', onclick: () => closeLightbox() });
    ui.lbShowName = h('input', { type: 'checkbox', checked: true, onchange: () => renderShareCard() });
    ui.lbShowNameText = h('span');
    ui.lbOpt = h('label', { class: 'lbopt', hidden: true }, ui.lbShowName, ui.lbShowNameText);
    ui.lightbox = h('div', { class: 'lightbox', hidden: true, onclick: (e) => { if (e.target === ui.lightbox) closeLightbox(); } },
      h('div', { class: 'lbbox' }, ui.lbImg, ui.lbName, ui.lbOpt, h('div', { class: 'lbbar' }, ui.lbFull, ui.lbSave, ui.lbClose)));
    root.append(ui.fabwrap, ui.drawer, ui.lightbox);
    relabel();
    wireResize();
    applyWidth(state.width);
    storageGet([UI_KEY]).then((r) => {
      const prefs = r[UI_KEY] && typeof r[UI_KEY] === 'object' ? r[UI_KEY] : {};
      state.width = applyWidth(typeof prefs.width === 'number' ? prefs.width : WIDTH.def);
      if (typeof prefs.cooldownUntil === 'number' && prefs.cooldownUntil > Date.now()) state.cooldownUntil = prefs.cooldownUntil;
      if (typeof prefs.countsPausedUntil === 'number' && prefs.countsPausedUntil > Date.now()) state.countsPausedUntil = prefs.countsPausedUntil;
      if ((prefs.lang === 'ar' || prefs.lang === 'en') && prefs.lang !== lang) setLang(prefs.lang, true);
      state.autoCheck = typeof prefs.autoCheck === 'boolean' ? prefs.autoCheck : autoCheckDefault(HOST);
      ui.autoCheck.checked = state.autoCheck;
      const upd = prefs.upd && typeof prefs.upd === 'object' ? prefs.upd : {};
      state.upd = { at: Number(upd.at) || 0, seen: typeof upd.seen === 'string' ? upd.seen : '', rel: upd.rel && typeof upd.rel === 'object' ? upd.rel : null };
      prefsLoaded();
      checkForUpdate();
    });
  }
  // Every static label, in the current language; dynamic text is rebuilt by applySnapshot().
  function relabel() {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    host.setAttribute('data-lang', lang);
    ui.drawer.setAttribute('dir', dir);
    ui.fabwrap.setAttribute('dir', dir);
    ui.fab.textContent = t('fab');
    ui.langBtn.textContent = t('langToggle');
    ui.settingsBtn.title = t('settings');
    ui.settingsBtn.setAttribute('aria-label', t('settings'));
    ui.settingsTitle.textContent = t('settings');
    ui.autoCheckText.textContent = t('autoCheck', { d: Math.round(AUTO.maxAgeMs / 86400000) });
    ui.reminderText.textContent = t('reminder');
    ui.datesHint.textContent = t('datesHint');
    ui.datesImport.textContent = t('datesImport');
    ui.updGet.textContent = t('updGet');
    ui.updLater.textContent = t('updLater');
    updateDatesStatus();
    updatePicStatus();
    showUpdate();
    ui.close.setAttribute('aria-label', t('close'));
    ui.check.textContent = t('checkNow');
    ui.cancel.textContent = t('cancel');
    ui.search.placeholder = t('searchPh');
    ui.search.setAttribute('aria-label', t('searchPh'));
    ui.hideDoneText.textContent = t('hideHandled');
    ui.copy.textContent = t('copyUsernames');
    const optKeys = ['filterAll', 'filterOthers', 'filterGained', 'filterLost', 'filterYouFollowed', 'filterYouUnfollowed', 'filterDeactivated', 'filterReactivated'];
    ui.filterOpts.forEach((o, i) => { o.textContent = t(optKeys[i]); });
    for (const k of Object.keys(TABS)) ui.tile[k].label.textContent = t(TABS[k].label);
    ui.showProtectedText.textContent = t('showProtected');
    ui.onlyLeftText.textContent = t('onlyLeft');
    ui.share.textContent = t('share');
    ui.lbShowNameText.textContent = t('showName');
    const kindKeys = ['kindAll', 'kindVerified', 'kindNotVerified', 'kindPrivate', 'kindPublic'];
    ui.kindOpts.forEach((o, i) => { o.textContent = t(kindKeys[i]); });
    const sortKeys = ['sortName', 'sortFollowers', 'sortRatio', 'sortSince'];
    ui.sortOpts.forEach((o, i) => { o.textContent = t(sortKeys[i]); });
    ui.countsBtn.title = t('loadCountsTitle', { n: COUNTS.max });
    if (!state.countsRun) ui.countsBtn.textContent = t('loadCounts');
    ui.download.textContent = t('download');
    ui.protAdd.textContent = t('add');
    ui.protImport.textContent = t('importBtn');
    ui.protExport.textContent = t('exportBtn');
    ui.protText.placeholder = t('protectedPlaceholder');
    ui.protHint.textContent = t('protectedHint');
    updateProtectedBtn();
    ui.pendHint.textContent = t('pendingHint');
    ui.pendImport.textContent = t('importBtn');
    updateSideBtns();
    ui.lbFull.textContent = t('lbFull');
    ui.lbSave.textContent = t('lbSave');
    ui.lbClose.textContent = t('close');
    ui.foot.textContent = t('footer');
    ui.grip.title = t('gripTitle');
    ui.rel.title = t('pillTitle');
  }
  // --- picture viewer
  const lb = { rec: null, url: '', hd: false };
  function openLightbox(rec) {
    if (!rec || !rec.pic) return;
    lb.rec = rec; lb.url = picCandidates(rec.pic)[0] || rec.pic; lb.hd = false; lb.loading = null; lb.card = null;
    ui.lbImg.src = lb.url;
    ui.lbName.textContent = '@' + rec.u;
    ui.lbFull.hidden = true;
    ui.lbOpt.hidden = true;
    ui.lightbox.hidden = false;
    loadFullSize(true); // the lists only carry a 150px thumbnail; fetch the real picture right away
  }
  function closeLightbox() {
    ui.lightbox.hidden = true;
    if (lb.card && lb.card.url) URL.revokeObjectURL(lb.card.url);
    lb.card = null; // a toBlob still in flight sees this and drops its result
  }
  // One profile-info request, the same one the site makes, for the large picture. Resolves to
  // true once the viewer shows the full size. The button only appears when the automatic load could not run.
  function loadFullSize(auto) {
    const rec = lb.rec;
    if (!rec || lb.hd) return Promise.resolve(!!lb.hd);
    if (lb.loading) return lb.loading;
    const showButton = () => { ui.lbFull.hidden = false; ui.lbFull.disabled = false; ui.lbFull.textContent = t('lbFull'); };
    if (Date.now() < state.cooldownUntil) {
      if (!auto) toast(t('pillPaused', { t: fmtT(state.cooldownUntil) }));
      showButton();
      return Promise.resolve(false);
    }
    ui.lbFull.hidden = false;
    ui.lbFull.disabled = true;
    ui.lbFull.textContent = t('pillChecking');
    lb.loading = (async () => {
      try {
        const hd = await fetchHdPicture(rec);
        if (lb.rec !== rec) return false; // another picture was opened meanwhile
        lb.url = hd; lb.hd = true;
        ui.lbImg.src = hd;
        ui.lbFull.hidden = true;
        return true;
      } catch (e) {
        if (e instanceof RateLimited) { state.cooldownUntil = Date.now() + REL_COOLDOWN_MS; saveUi(); }
        if (lb.rec === rec) {
          toast(e instanceof RateLimited ? t('lbSlow', { t: fmtT(state.cooldownUntil) }) : t('lbFullFailed', { r: e && e.message ? e.message : String(e) }));
          showButton();
        }
        return false;
      } finally {
        if (lb.rec === rec) lb.loading = null;
      }
    })();
    return lb.loading;
  }
  // The large picture: the account-info endpoint first (it carries the full-resolution picture),
  // the profile-info endpoint as fallback. Remembered for the session so a picture is asked for once.
  const hdCache = new Map();
  async function fetchHdPicture(rec) {
    const cached = hdCache.get(rec.u);
    if (cached) return cached;
    let hd = '';
    if (rec.id) {
      try {
        const j = await igGet(API.info(encodeURIComponent(rec.id)));
        const u = j && j.user;
        if (u && u.hd_profile_pic_url_info && typeof u.hd_profile_pic_url_info.url === 'string') hd = u.hd_profile_pic_url_info.url;
        if (!hd && u && Array.isArray(u.hd_profile_pic_versions) && u.hd_profile_pic_versions.length) {
          const best = u.hd_profile_pic_versions.reduce((a, b) => ((b && b.width > (a && a.width || 0)) ? b : a), null);
          if (best && typeof best.url === 'string') hd = best.url;
        }
        if (!hd && u && typeof u.profile_pic_url === 'string') hd = u.profile_pic_url;
      } catch (e) {
        if (e instanceof RateLimited || e instanceof AuthError) throw e;
      }
    }
    if (!hd) {
      const j = await igGet('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(rec.u));
      const u = j && j.data && j.data.user;
      hd = u && typeof u.profile_pic_url_hd === 'string' ? u.profile_pic_url_hd : (u && typeof u.profile_pic_url === 'string' ? u.profile_pic_url : '');
    }
    if (!hd || !/^https:\/\//.test(hd)) throw new Error('no picture');
    hdCache.set(rec.u, hd);
    return hd;
  }
  // Downloads the full-size picture, fetching it first when the viewer still shows the thumbnail.
  async function saveCurrentImage() {
    if (lb.card) { await saveCanvas(lb.card.canvas, 'follow-check-card.png'); return; }
    const rec = lb.rec;
    if (!rec || !lb.url) return;
    ui.lbSave.disabled = true;
    try {
      if (!lb.hd) await loadFullSize(false);
      if (lb.rec !== rec) return;
      await saveImage(lb.url, rec.u + (lb.hd ? '' : '-small') + '.jpg');
    } finally {
      ui.lbSave.disabled = false;
    }
  }

  // --- share card: a story-sized PNG with the numbers, drawn locally
  function shareCardData() {
    const snap = state.snap, L = state.lists;
    if (!snap || !L) return null;
    const stats = computeStats(state.hist && state.hist.points ? state.hist.points : [pointFrom(snap)], Date.now());
    const nf = snap.following.length;
    return {
      me: snap.me || '',
      at: snap.at,
      following: nf,
      followers: snap.followers.length,
      mutual: L.mutual.length,
      notback: L.notback.length,
      rate: nf ? Math.round((100 * L.mutual.length) / nf) : 0,
      week: stats && stats.week ? stats.week : null,
    };
  }
  function roundRect(g, x, y, w, hgt, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + hgt, r);
    g.arcTo(x + w, y + hgt, x, y + hgt, r);
    g.arcTo(x, y + hgt, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawShareCard(d, showName) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const font = (weight, size) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", "Noto Naskh Arabic", Arial, sans-serif`;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0E7C7B');
    grad.addColorStop(1, '#0B2B33');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = lang === 'ar' ? 'rtl' : 'ltr';
    g.fillStyle = '#FFFFFF';
    g.font = font(700, 64);
    g.fillText(t('cardTitle'), W / 2, 190);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = font(400, 42);
    g.fillText(showName && d.me ? '@' + d.me : t('cardAnon'), W / 2, 262);
    const cardX = 90, cardY = 340, cardW = W - 180, cardH = 1260;
    roundRect(g, cardX, cardY, cardW, cardH, 48);
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.fillStyle = '#0E7C7B';
    g.font = font(800, 220);
    g.fillText(d.rate + '%', W / 2, cardY + 230);
    g.fillStyle = '#5A6772';
    g.font = font(500, 40);
    g.fillText(t('cardRate'), W / 2, cardY + 370);
    const items = [[d.following, t('cardFollowing')], [d.followers, t('cardFollowers')], [d.mutual, t('cardMutual')], [d.notback, t('cardNotback')]];
    const colW = cardW / 2;
    items.forEach(([v, label], i) => {
      const cx = cardX + colW * (i % 2) + colW / 2;
      const cy = cardY + 560 + Math.floor(i / 2) * 290;
      g.fillStyle = '#151D25';
      g.font = font(700, 112);
      g.fillText(num(v), cx, cy);
      g.fillStyle = '#5A6772';
      g.font = font(500, 38);
      g.fillText(label, cx, cy + 92);
    });
    if (d.week) {
      const n = (d.week.followers >= 0 ? '+' : '−') + num(Math.abs(d.week.followers));
      g.fillStyle = d.week.followers >= 0 ? '#1E8E5A' : '#B26A00';
      g.font = font(600, 44);
      g.fillText(t('cardWeek', { n, since: fmtMD(d.week.since) }), W / 2, cardY + 1150);
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = font(500, 36);
    g.fillText(fmtMD(d.at) + ' · ' + t('cardFooter'), W / 2, H - 150);
    return c;
  }
  function renderShareCard() {
    const d = shareCardData();
    if (!d) return;
    let canvas;
    try { canvas = drawShareCard(d, ui.lbShowName.checked); } catch (e) { toast(t('cardFailed')); return; }
    if (lb.card && lb.card.url) URL.revokeObjectURL(lb.card.url);
    lb.card = { canvas, url: '' };
    canvas.toBlob((blob) => {
      if (!blob || !lb.card || lb.card.canvas !== canvas) return;
      lb.card.url = URL.createObjectURL(blob);
      ui.lbImg.src = lb.card.url;
    }, 'image/png');
  }
  function openShareCard() {
    if (!state.snap || !state.lists) return;
    lb.rec = null; lb.url = ''; lb.hd = false; lb.loading = null; lb.card = null;
    ui.lbImg.removeAttribute('src');
    ui.lbName.textContent = t('cardName');
    ui.lbFull.hidden = true;
    ui.lbOpt.hidden = false;
    ui.lightbox.hidden = false;
    renderShareCard();
    ensureMe().then((got) => { if (got && lb.card) renderShareCard(); });
  }
  // A check whose account-info request was throttled has no username. Ask once, only when the
  // card needs it, and keep the answer with the saved check.
  let meLookup = null;
  function ensureMe() {
    const snap = state.snap;
    if (!snap || snap.me || !snap.uid) return Promise.resolve(false);
    if (!meLookup) {
      meLookup = igGet(API.info(snap.uid)).then(async (info) => {
        const name = info && info.user && typeof info.user.username === 'string' ? info.user.username : '';
        if (!name || state.snap !== snap) return false;
        snap.me = name;
        ui.me.textContent = '@' + name;
        await storageSet({ [acctStoreKey(snap.uid)]: { last: snap, prev: state.prev } });
        return true;
      }).catch(() => false).finally(() => { meLookup = null; });
    }
    return meLookup;
  }
  // Saves a drawn image: through the Android app when it hosts the page, otherwise as a browser download.
  function saveCanvas(canvas, name) {
    return new Promise((resolve) => {
      try {
        const bridge = window.FollowCheckHost;
        if (bridge && typeof bridge.saveBase64 === 'function') {
          const b64 = canvas.toDataURL('image/png').split(',')[1] || '';
          const ok = b64 && bridge.saveBase64(name, 'image/png', b64);
          toast(ok ? t('toastSaved', { name }) : t('toastSaveFailed'));
          resolve(!!ok);
          return;
        }
        if (HOST === 'android') { toast(t('needUpdate')); resolve(false); return; } // an older app build: a WebView cannot download a blob by itself
      } catch (e) { /* fall through to the browser download */ }
      canvas.toBlob((blob) => {
        if (!blob) { toast(t('toastSaveFailed')); resolve(false); return; }
        const obj = URL.createObjectURL(blob);
        const a = h('a', { href: obj, download: name });
        root.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(obj), 2000);
        toast(t('toastSaved', { name }));
        resolve(true);
      }, 'image/png');
    });
  }
  // Saves a picture: through the Android app when it hosts the page, otherwise as a browser download,
  // and if the picture host refuses cross-origin reads, in a new tab to save from there.
  async function saveImage(url, name) {
    try {
      const bridge = window.FollowCheckHost;
      if (bridge && typeof bridge.saveUrl === 'function') {
        const ok = bridge.saveUrl(url, name);
        toast(ok ? t('toastSaved', { name }) : t('toastSaveFailed'));
        return;
      }
      if (HOST === 'android') { toast(t('needUpdate')); return; }
    } catch (e) { /* fall through */ }
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = h('a', { href: obj, download: name });
      root.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 2000);
      toast(t('toastSaved', { name }));
    } catch (e) {
      const a = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' });
      root.append(a); a.click(); a.remove();
      toast(t('toastImgOpen'));
    }
  }
  function updateProtectedBtn() { ui.protectedBtn.textContent = t('protectedBtn', { n: num(Object.keys(state.white).length) }); }
  function updateSideBtns() {
    ui.pendingBtn.textContent = t('pendingBtn', { n: num(state.pending.length) });
    ui.logBtn.textContent = t('logBtn', { n: num(state.log.filter((e) => !e.undone).length) });
  }
  function savePending() { if (state.uid) storageSet({ [pendStoreKey(state.uid)]: state.pending }); updateSideBtns(); }
  function addLog(type, r, undoOf) {
    const entry = { at: Date.now(), type, u: r.u, id: r.id || '', name: r.name || '', priv: !!r.priv, pic: r.pic || '' };
    if (undoOf) entry.undoOf = undoOf.at;
    state.log = appendLog(state.log, entry, LOG_CAP);
    if (undoOf) state.log = markUndone(state.log, undoOf.at, undoOf.u, entry.at);
    if (state.uid) storageSet({ [logStoreKey(state.uid)]: state.log });
    updateSideBtns();
  }
  function addPending(rows) {
    const m = mergePending(state.pending, rows, Date.now());
    state.pending = m.pending;
    savePending();
    return m.added;
  }
  function removePending(u) {
    state.pending = state.pending.filter((p) => p.u !== u);
    savePending();
  }
  // The export zip as downloaded, or one of its files. From the zip: the pending requests, and the
  // recently unfollowed profiles as history events so the followed-again flag knows about them.
  async function importPendingFile() {
    const f = ui.pendFile.files && ui.pendFile.files[0];
    ui.pendFile.value = '';
    if (!f) return;
    try {
      let text = '', unfollowedText = '';
      const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b) {
        if (typeof DecompressionStream !== 'function') { toast(t('toastZipOld')); return; }
        const files = await zipReadFile(f, (entries) => [pickExportEntry(entries, 'pending_follow_requests'), pickExportEntry(entries, 'recently_unfollowed_profiles')].filter(Boolean));
        const pend = (files || []).find((x) => /pending_follow_requests/i.test(x.name));
        if (!pend) { toast(t('zipNoPending')); return; }
        text = pend.text;
        const unf = files.find((x) => /recently_unfollowed_profiles/i.test(x.name));
        if (unf) unfollowedText = unf.text;
      } else {
        text = await f.text();
      }
      const rows = parsePending(text);
      if (!rows.length) { toast(t('toastNothingToAdd')); return; }
      const added = addPending(rows);
      const unfollowed = unfollowedText ? importUnfollowed(parsePending(unfollowedText)) : 0;
      toast((added ? t('toastAdded', { n: num(added) }) : t('toastNothingToAdd')) + (unfollowed ? ' · ' + t('toastUnfollowedImported', { n: num(unfollowed) }) : ''));
      renderList();
    } catch (e) {
      toast(t('liveFailed', { r: e && e.message ? e.message : String(e) }));
    }
  }
  // "you unfollowed" events from the export that the history does not have yet.
  function importUnfollowed(rows) {
    if (!rows.length || !state.uid) return 0;
    const hist = state.hist && Array.isArray(state.hist.events) ? state.hist : { points: [], events: [] };
    const have = new Set(hist.events.filter((e) => e.type === 'you_unfollowed').map((e) => e.u + ':' + e.at));
    const events = rows.filter((r) => r.ts && !have.has(r.u + ':' + r.ts)).map((r) => ({ at: r.ts, type: 'you_unfollowed', u: r.u, name: '', priv: false }));
    if (!events.length) return 0;
    state.hist = { points: hist.points, events: hist.events.concat(events).sort((a, b) => a.at - b.at).slice(-HIST_CAPS.events) };
    storageSet({ [histStoreKey(state.uid)]: state.hist });
    refreshFlags();
    applyTiles();
    return events.length;
  }
  // A yes/no box inside the panel (the viewer never shows window.confirm).
  function askConfirm(titleKey, textKey, okKey, vars) {
    return new Promise((resolve) => {
      ui.modalTitle.textContent = t(titleKey, vars);
      ui.modalText.textContent = t(textKey, vars);
      ui.modalOk.textContent = t(okKey, vars);
      ui.modalCancel.textContent = t('cancel');
      ui.modal.hidden = false;
      const done = (v) => { ui.modal.hidden = true; ui.modalOk.onclick = null; ui.modalCancel.onclick = null; resolve(v); };
      ui.modalOk.onclick = () => done(true);
      ui.modalCancel.onclick = () => done(false);
    });
  }
  function setLang(l, silent) {
    lang = l;
    if (!silent) saveUi();
    relabel();
    applySnapshot();
    if (relUser) showRelFor(relUser);
  }

  function syncTheme() {
    let dark = null;
    try {
      for (const el of [document.body, document.documentElement]) {
        const bg = el && getComputedStyle(el).backgroundColor;
        const m = bg && bg.match(/[\d.]+/g);
        if (!m || m.length < 3) continue;
        if (m.length >= 4 && Number(m[3]) === 0) continue; // transparent, look further up
        const [r, g, b] = m.slice(0, 3).map(Number);
        dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
        break;
      }
    } catch (e) { dark = null; }
    if (dark === null) dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    host.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  function toggle(force) {
    const open = typeof force === 'boolean' ? force : !state.open;
    state.open = open;
    if (open) { syncTheme(); applyWidth(state.width); }
    if (open && !state.running) ui.fab.textContent = t('fab'); // the result shown after an automatic check has been seen
    ui.drawer.hidden = !open;
    ui.fabwrap.hidden = open;
  }
  let toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2400);
  }
  function showError(msg) { ui.error.textContent = msg; ui.error.hidden = false; }
  function showProgress(p) {
    ui.progress.hidden = false;
    let text;
    if (p.wait != null) text = t('progSlow', { s: p.wait });
    else if (p.phase === 'info') { text = t('progInfo'); live.following = 0; live.followers = 0; }
    else if (p.phase === 'verify') text = t('progVerify', { n: num(p.n), total: num(p.total) });
    else text = t('progFetch', { phase: t(p.phase === 'followers' ? 'phaseFollowers' : 'phaseFollowing'), n: num(p.n), of: p.total ? t('progOf', { total: num(p.total) }) : '' });
    ui.ptext.textContent = text;
    if (p.phase === 'following' || p.phase === 'followers') {
      live[p.phase] = p.n || 0;
      ui.ledger.textContent = t('ledgerLive', { nf: num(live.following), nw: num(live.followers) }); // counts up while the check runs
    }
    const frac = p.total ? Math.min(1, (p.n || 0) / p.total) : 0;
    let width = 0.02;
    if (p.phase === 'following') width = frac * 0.45;
    else if (p.phase === 'followers') width = 0.45 + frac * 0.45;
    else if (p.phase === 'verify') width = 0.9 + frac * 0.1;
    ui.pfill.style.width = Math.round(width * 100) + '%';
  }
  function setTile(k, value, sub, small) {
    ui.tile[k].value.textContent = value;
    ui.tile[k].value.classList.toggle('small', !!small);
    ui.tile[k].sub.textContent = sub;
  }
  function applySnapshot() {
    const snap = state.snap;
    if (!snap) {
      ui.me.textContent = '';
      ui.status.textContent = state.uid ? t('statusNotChecked') : t('statusLogin');
      ui.results.hidden = true;
      ui.empty.hidden = false;
      ui.empty.textContent = state.uid ? t('emptyClick') : t('emptyLogin');
      return;
    }
    ui.me.textContent = snap.me ? '@' + snap.me : '';
    ui.status.textContent = t('lastCheck', { when: fmtDT(snap.at) });
    const following = new Map(snap.following.map((r) => [r.u, r]));
    const followers = new Map(snap.followers.map((r) => [r.u, r]));
    state.lists = derive(following, followers);
    refreshFlags();
    ui.results.hidden = false;
    const nf = following.size, nw = followers.size;
    ui.ledger.textContent = t('ledger', { nf: num(nf), nfRaw: nf, nw: num(nw), nwRaw: nw });
    const partial = snap.partial && typeof snap.partial === 'object' ? snap.partial : null;
    const notes = [];
    if (partial && partial.following) notes.push(t('partialWarn', { got: num(partial.following.got), total: num(partial.following.total), what: t('partialFollowing') }));
    if (partial && partial.followers) notes.push(t('partialWarn', { got: num(partial.followers.got), total: num(partial.followers.total), what: t('partialFollowers') }));
    ui.notice.textContent = notes.join(' ');
    ui.notice.hidden = notes.length === 0;
    applyTiles();
    renderList();
  }
  function applyTiles() {
    const L = state.lists;
    if (!L || !state.snap) return;
    const nf = state.snap.following.length, nw = state.snap.followers.length;
    const protectedN = L.notback.filter((r) => isProtected(r.u)).length;
    const shown = L.notback.length - protectedN;
    const leftN = whoLeft(L.notback.filter((r) => !isProtected(r.u)), state.left).length;
    const loopN = L.notback.filter((r) => !isProtected(r.u) && state.loops.has(r.u)).length;
    setTile('notback', num(shown), t('subOfFollowing', { pct: pct(shown, nf) })
      + (leftN ? ' · ' + t('nLeft', { n: num(leftN) }) : '')
      + (loopN ? ' · ' + t('nLoop', { n: num(loopN) }) : '')
      + (protectedN ? ' · ' + t('nProtected', { n: num(protectedN) }) : ''));
    const fansLeft = L.fans.filter((r) => state.left.has(r.u)).length;
    setTile('fans', num(L.fans.length), t('subOfFollowers', { pct: pct(L.fans.length, nw) }) + (fansLeft ? ' · ' + t('nLeftBefore', { n: num(fansLeft) }) : ''));
    setTile('mutual', num(L.mutual.length), t('subOfFollowing', { pct: pct(L.mutual.length, nf) }));
    const pts = state.hist && Array.isArray(state.hist.points) ? state.hist.points : [];
    const lastAt = pts.length ? pts[pts.length - 1].at : 0;
    const g = groupEvents(state.hist && Array.isArray(state.hist.events) ? state.hist.events : []).find((x) => x.at === lastAt);
    if (pts.length >= 2) setTile('changes', `+${num(g ? g.gained : 0)} / −${num(g ? g.lost : 0)}`, t('subHistory'), true);
    else setTile('changes', '—', t('subHistoryNone'));
  }
  function visible(rows) {
    const q = state.q.trim().toLowerCase().replace(/^@/, '');
    if (!q) return rows;
    return rows.filter((r) => r.u.includes(q) || (r.name && r.name.toLowerCase().includes(q)));
  }
  const doneKey = (u) => state.tab + ':' + u;
  const isDone = (u) => !!state.done[doneKey(u)];
  function setDone(u, v) {
    if (v) state.done[doneKey(u)] = 1; else delete state.done[doneKey(u)];
    if (state.uid) storageSet({ [doneStoreKey(state.uid)]: state.done });
  }
  // Protected accounts: followed on purpose, kept out of "don't follow you back".
  const isProtected = (u) => !!state.white[u];
  function saveWhite() {
    if (state.uid) storageSet({ [whiteStoreKey(state.uid)]: state.white });
    updateProtectedBtn();
  }
  function setProtected(u, v) {
    if (v) state.white[u] = 1; else delete state.white[u];
    saveWhite();
  }
  function addProtected(names) {
    let added = 0;
    for (const u of names) if (!state.white[u]) { state.white[u] = 1; added++; }
    saveWhite();
    toast(added ? t('toastAdded', { n: num(added) }) : t('toastNothingToAdd'));
    applyTiles();
    renderList();
  }
  function addProtectedFromText() {
    const names = parseUsernames(ui.protText.value);
    if (!names.length) { toast(t('toastNothingToAdd')); return; }
    ui.protText.value = '';
    addProtected(names);
  }
  function importProtectedFile() {
    const f = ui.protFile.files && ui.protFile.files[0];
    ui.protFile.value = '';
    if (!f) return;
    f.text().then((text) => addProtected(parseUsernames(text)), () => toast(t('toastNothingToAdd')));
  }
  function exportProtected() {
    const names = Object.keys(state.white).sort();
    if (!names.length) { toast(t('toastNothing')); return; }
    downloadText('follow-check-protected.json', 'application/json', JSON.stringify({ protected: names }, null, 2));
  }
  function lookupRecord(u) {
    const s = state.snap;
    if (!s) return null;
    return s.following.find((r) => r.u === u) || s.followers.find((r) => r.u === u) || null;
  }
  // Saves a text file: through the Android app when it hosts the page, otherwise as a browser download.
  function downloadText(name, mime, text) {
    try {
      const bridge = window.FollowCheckHost;
      if (bridge && typeof bridge.saveText === 'function') {
        const ok = bridge.saveText(name, mime, text);
        toast(ok ? t('toastSaved', { name }) : t('toastSaveFailed'));
        return;
      }
      if (HOST === 'android') { toast(t('needUpdate')); return; }
    } catch (e) { /* fall through to the browser download */ }
    try {
      const blob = new Blob([text], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      root.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(t('toastSaved', { name }));
    } catch (e) {
      toast(t('toastSaveFailed'));
    }
  }
  function downloadCurrent() {
    if (!state.lists) return;
    const profile = (u) => 'https://www.instagram.com/' + u + '/';
    if (state.tab === 'protected') { exportProtected(); return; }
    let rows, name;
    if (state.tab === 'pending') {
      const list = visible(state.pending);
      if (!list.length) { toast(t('toastNothing')); return; }
      rows = [['username', 'name', 'pending_since', 'profile']].concat(list.map((r) => [r.u, r.name || '', new Date(r.ts).toISOString(), profile(r.u)]));
      name = 'follow-check-pending.csv';
    } else if (state.tab === 'actions') {
      const list = visible(state.log);
      if (!list.length) { toast(t('toastNothing')); return; }
      rows = [['date', 'action', 'username', 'name', 'undone', 'profile']].concat(list.map((e) => [new Date(e.at).toISOString(), e.type, e.u, e.name || '', e.undone ? new Date(e.undone).toISOString() : '', profile(e.u)]));
      name = 'follow-check-actions.csv';
    } else if (state.tab === 'changes') {
      const evs = filteredEvents();
      if (!evs.length) { toast(t('toastNothing')); return; }
      rows = [['date', 'event', 'username', 'name', 'profile']].concat(evs.map((e) => [new Date(e.at).toISOString(), e.type, e.u, e.name || '', profile(e.u)]));
      name = 'follow-check-history.csv';
    } else {
      const list = listRows();
      if (!list.length) { toast(t('toastNothing')); return; }
      const yes = (v) => (v ? 'yes' : 'no');
      rows = [['username', 'name', 'private', 'verified', 'protected', 'handled', 'profile']]
        .concat(list.map((r) => [r.u, r.name || '', yes(r.priv), yes(r.ver), yes(isProtected(r.u)), yes(isDone(r.u)), profile(r.u)]));
      name = 'follow-check-' + state.tab + '.csv';
    }
    downloadText(name, 'text/csv', '﻿' + toCsv(rows));
  }
  // Avatars load when their row comes into view: the panel scrolls inside its own box, so the browser's
  // own lazy loading is not relied on. A link that fails is tried on the other picture host (see
  // picCandidates) before the first letter stands in, and the failures are counted for the Settings box,
  // since a phone cannot show its console.
  const pics = { failed: 0, host: '' };
  const avatarWatch = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      avatarWatch.unobserve(en.target);
      if (en.target.dataset.src) { en.target.src = en.target.dataset.src; delete en.target.dataset.src; }
    }
  }, { rootMargin: '400px' }) : null;
  function avatarNode(r) {
    if (!r.pic) return h('span', { class: 'avatar ph' }, (r.u || '?').charAt(0).toUpperCase());
    const img = h('img', { class: 'avatar', alt: '', onclick: () => openLightbox(r) });
    const tries = picCandidates(r.pic);
    let i = 0;
    img.addEventListener('error', () => {
      if (++i < tries.length) { img.src = tries[i]; return; }
      pics.failed++;
      if (!pics.host) { try { pics.host = new URL(r.pic).host; } catch (e) { pics.host = '?'; } }
      img.replaceWith(h('span', { class: 'avatar ph' }, (r.u || '?').charAt(0).toUpperCase()));
      if (pics.failed === 1 || pics.failed % 25 === 0) updatePicStatus();
    });
    if (avatarWatch) { img.dataset.src = tries[0]; avatarWatch.observe(img); } else img.src = tries[0];
    return img;
  }
  function updatePicStatus() {
    ui.picStatus.hidden = !pics.failed;
    if (pics.failed) ui.picStatus.textContent = t('picFail', { n: num(pics.failed), host: pics.host });
  }
  function rowNode(r, withCheck) {
    const row = h('div', { class: 'row' + (withCheck && isDone(r.u) ? ' done' : '') });
    if (withCheck) {
      const cb = h('input', { type: 'checkbox', checked: isDone(r.u), 'aria-label': t('markHandled', { u: r.u }) });
      cb.addEventListener('change', () => {
        setDone(r.u, cb.checked);
        row.classList.toggle('done', cb.checked);
        if (state.hideDone && cb.checked) { row.remove(); if (!ui.list.children.length) renderList(); }
      });
      row.append(h('label', { class: 'chk' }, cb));
    }
    row.append(avatarNode(r));
    row.append(h('div', { class: 'who' },
      h('a', { class: 'handle', href: 'https://www.instagram.com/' + encodeURIComponent(r.u) + '/', target: '_blank', rel: 'noopener noreferrer' }, '@' + r.u, h('span', { class: 'arrow' }, '↗')),
      r.name ? h('div', { class: 'name', title: r.name }, r.name) : null,
      sinceNode(r.u)));
    const acts = h('span', { class: 'acts' });
    row.acts = acts; // every button of the row goes in here, so they wrap together (see actsOf)
    if (r.ver) row.append(h('span', { class: 'tag ver' }, t('verifiedTag')));
    if (r.priv) row.append(h('span', { class: 'tag' }, t('privateTag')));
    const cnt = state.tab !== 'changes' ? state.counts[r.u] : null;
    if (cnt) {
      const odds = followBackOdds(cnt);
      const title = t('countsTitle', { fw: num(cnt.fw), fg: num(cnt.fg) }) + (odds === 'low' ? ' · ' + t('oddsLow') : odds === 'good' ? ' · ' + t('oddsGood') : '');
      row.append(h('span', { class: 'chip cnt' + (odds === 'low' ? ' warn' : odds === 'good' ? ' good' : ''), title }, shortNum(cnt.fw) + ' · ' + shortNum(cnt.fg)));
    }
    if (state.tab !== 'changes' && state.left.has(r.u)) {
      const stillFollowsYou = !!(state.snap && state.snap.followers.some((x) => x.u === r.u));
      row.append(h('span', { class: 'chip warn' }, t(stillFollowsYou ? 'leftBackChip' : 'leftChip', { d: fmtMD(state.left.get(r.u)) })));
    }
    if (state.tab !== 'changes' && state.loops.has(r.u)) row.append(h('span', { class: 'chip' }, t('loopChip', { d: fmtMD(state.loops.get(r.u).followedAt) })));
    if (state.tab !== 'changes' && state.react && state.react.has(r.u)) row.append(h('span', { class: 'chip' }, t('reactChip', { d: fmtMD(state.react.get(r.u).goneAt) })));
    if (withCheck && state.tab === 'notback' && r.id) {
      // Two taps within four seconds: the first arms the button, the second unfollows.
      const ub = h('button', { class: 'unf', type: 'button', title: t('unfollowTitle') }, t('unfollow'));
      let armed = 0;
      ub.addEventListener('click', () => {
        if (armed && Date.now() - armed < 4000) { armed = 0; unfollowRow(r, ub); return; }
        armed = Date.now();
        ub.classList.add('arm');
        ub.textContent = t('unfollowConfirm');
        setTimeout(() => { if (armed && Date.now() - armed >= 3900) { armed = 0; ub.classList.remove('arm'); ub.textContent = t('unfollow'); } }, 4000);
      });
      acts.append(ub);
    }
    if (withCheck && state.tab === 'fans' && r.id) {
      // Follow back: the same two-tap arming, spacing and caps as Unfollow.
      const fb = h('button', { class: 'unf follow', type: 'button', title: t('followTitle') }, t('follow'));
      let armed = 0;
      fb.addEventListener('click', () => {
        if (armed && Date.now() - armed < 4000) { armed = 0; followRow(r, row, fb); return; }
        armed = Date.now();
        fb.classList.add('arm');
        fb.textContent = t('unfollowConfirm');
        setTimeout(() => { if (armed && Date.now() - armed >= 3900) { armed = 0; fb.classList.remove('arm'); fb.textContent = t('follow'); } }, 4000);
      });
      acts.append(fb);
    }
    if (withCheck) {
      const on = isProtected(r.u);
      const pb = h('button', { class: 'protect' + (on ? ' on' : ''), type: 'button', title: t('protectTitle') }, on ? t('protectedLabel') : t('protect'));
      pb.addEventListener('click', () => {
        const now = !isProtected(r.u);
        setProtected(r.u, now);
        pb.classList.toggle('on', now);
        pb.textContent = now ? t('protectedLabel') : t('protect');
        applyTiles();
        if (state.tab === 'notback' && now && !state.showProtected) { row.remove(); if (!ui.list.children.length) renderList(); }
      });
      acts.append(pb);
    }
    if (withCheck) {
      // The lists come from the last check; this asks Instagram about this one account right now.
      const vb = h('button', { class: 'verify', type: 'button', title: t('verifyTitle') }, t('verify'));
      vb.addEventListener('click', () => verifyRow(r, row, vb));
      acts.append(vb);
    }
    if (acts.childElementCount) row.append(acts);
    return row;
  }
  // The buttons a list adds to a row after rowNode() join the same end-of-row group.
  function actsOf(row) {
    if (!row.acts) row.acts = h('span', { class: 'acts' });
    if (row.acts.parentNode !== row) row.append(row.acts);
    return row.acts;
  }
  async function verifyRow(r, row, btn) {
    if (btn.disabled) return;
    if (Date.now() < state.cooldownUntil) { toast(t('pillPaused', { t: fmtT(state.cooldownUntil) })); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t('pillChecking');
    const key = state.uid + ':' + r.u;
    try {
      const cached = relCache.get(key);
      const rel = cached && Date.now() - cached.at < REL_TTL_MS ? cached.rel : await fetchRelationship(r.u);
      relCache.set(key, { at: Date.now(), rel });
      const they = rel.followsYou ? t('liveFollowsYou') : rel.theyRequested ? t('liveTheyRequested') : t('liveNotFollowsYou');
      const you = rel.youFollow ? t('liveYouFollow') : rel.youRequested ? t('liveYouRequested') : t('liveYouNot');
      let chip = row.querySelector('.chip.live');
      if (!chip) { chip = h('span', { class: 'chip live' }); row.insertBefore(chip, row.acts && row.acts.parentNode === row ? row.acts : null); }
      chip.textContent = t('liveChip', { a: they, b: you });
      chip.classList.toggle('good', !!(rel.followsYou && rel.youFollow));
    } catch (e) {
      if (e instanceof RateLimited) { state.cooldownUntil = Date.now() + REL_COOLDOWN_MS; saveUi(); }
      toast(t('liveFailed', { r: e && e.message ? e.message : String(e) }));
    } finally {
      btn.textContent = label;
      btn.disabled = false;
    }
  }
  // The rows of the current list tab after every filter: search, protected, handled, account kind.
  function listRows() {
    let rows = visible(state.lists[state.tab]);
    if (state.tab === 'notback' && !state.showProtected) rows = rows.filter((r) => !isProtected(r.u));
    if ((state.tab === 'notback' || state.tab === 'fans') && state.onlyLeft) rows = rows.filter((r) => state.left.has(r.u));
    if (state.hideDone) rows = rows.filter((r) => !isDone(r.u));
    if (state.kind !== 'all') rows = rows.filter((r) => matchesKind(r, state.kind));
    return sortRows(rows, state.sort, state.counts, (u) => sinceOf(state.dates, state.tab === 'fans' ? 'followers' : 'following', u));
  }
  function renderProtected() {
    ui.listTitle.textContent = t('protectedTitle');
    const names = Object.keys(state.white).sort();
    ui.protList.replaceChildren();
    for (const u of names) {
      const row = rowNode(lookupRecord(u) || { u, name: '', priv: false, ver: false, pic: '' }, false);
      actsOf(row).append(h('button', { class: 'verify', type: 'button', onclick: () => { setProtected(u, false); applyTiles(); renderList(); } }, t('remove')));
      ui.protList.append(row);
    }
    ui.protList.hidden = names.length === 0;
    ui.protEmpty.hidden = names.length !== 0;
    ui.protEmpty.textContent = t('protectedEmpty');
  }
  // One row per request you sent: when, a live "still pending?" check, and a cancel under the action limits.
  function renderPending() {
    const rows = visible(state.pending);
    ui.listTitle.textContent = t('pendingTitle') + (state.pending.length ? ' · ' + num(state.pending.length) : '');
    for (const p of rows) {
      const rec = Object.assign({ u: p.u, name: '', priv: true, ver: false, pic: '' }, lookupRecord(p.u) || {}, p);
      const row = rowNode(rec, false);
      row.append(h('span', { class: 'chip' }, t('pendingChip', { d: fmtMD(p.ts) })));
      const sb = h('button', { class: 'verify', type: 'button', title: t('stillPendingTitle') }, t('stillPending'));
      sb.addEventListener('click', () => checkPendingRow(p, row, sb));
      actsOf(row).append(sb, armedButton('unf', t('cancelReq'), t('cancelTitle'), (btn) => cancelRow(p, row, btn)));
      ui.list.append(row);
    }
    ui.list.hidden = rows.length === 0;
    ui.empty.hidden = rows.length !== 0;
    if (!rows.length) ui.empty.textContent = state.pending.length ? t('noMatch', { q: state.q.trim() }) : t('pendingEmpty');
  }
  const ACT_KEY = { unfollow: 'actUnfollow', follow: 'actFollow', request: 'actRequest', cancel: 'actCancel' };
  function renderActions() {
    const rows = visible(state.log).slice().reverse();
    ui.listTitle.textContent = t('logTitle') + (state.log.length ? ' · ' + num(state.log.length) : '');
    for (const e of rows) {
      const row = rowNode(Object.assign({ u: e.u, name: e.name, priv: e.priv, ver: false, pic: e.pic || '', id: e.id }, lookupRecord(e.u) || {}, { id: e.id || (lookupRecord(e.u) || {}).id || '' }), false);
      row.append(h('span', { class: 'chip ' + (e.type === 'unfollow' || e.type === 'cancel' ? 'warn' : 'good') }, t(ACT_KEY[e.type] || 'actFollow', { d: fmtWhen(e.at) })));
      if (e.undone) row.append(h('span', { class: 'chip muted' }, t('undone', { d: fmtWhen(e.undone) })));
      else if (UNDO[e.type]) actsOf(row).append(armedButton('unf undo', t('undo'), t('undoTitle'), (btn) => undoRow(e, row, btn)));
      ui.list.append(row);
    }
    ui.list.hidden = rows.length === 0;
    ui.empty.hidden = rows.length !== 0;
    if (!rows.length) ui.empty.textContent = state.log.length ? t('noMatch', { q: state.q.trim() }) : t('logEmpty');
  }
  // A button that needs two taps within four seconds: the first arms it, the second runs the action.
  function armedButton(cls, label, title, run) {
    const b = h('button', { class: cls, type: 'button', title }, label);
    let armed = 0;
    b.addEventListener('click', () => {
      if (armed && Date.now() - armed < 4000) { armed = 0; b.classList.remove('arm'); b.textContent = label; run(b); return; }
      armed = Date.now();
      b.classList.add('arm');
      b.textContent = t('unfollowConfirm');
      setTimeout(() => { if (armed && Date.now() - armed >= 3900) { armed = 0; b.classList.remove('arm'); b.textContent = label; } }, 4000);
    });
    return b;
  }
  function renderList() {
    for (const el of ui.tiles.children) el.setAttribute('aria-selected', String(el.dataset.tab === state.tab));
    ui.list.replaceChildren();
    if (!state.lists) return;
    const history = state.tab === 'changes', prot = state.tab === 'protected', pend = state.tab === 'pending', acts = state.tab === 'actions';
    const side = prot || pend || acts;
    ui.chart.hidden = !history;
    ui.evFilter.hidden = !history;
    ui.hideDoneWrap.hidden = history || side;
    ui.kindFilter.hidden = history || side;
    ui.sortSel.hidden = history || side;
    ui.countsBtn.hidden = history || side;
    ui.showProtectedWrap.hidden = state.tab !== 'notback';
    const leftRows = state.tab === 'fans' ? state.lists.fans.filter((r) => state.left.has(r.u)) : whoLeft(state.lists.notback.filter((r) => !isProtected(r.u)), state.left);
    ui.onlyLeftWrap.hidden = (state.tab !== 'notback' && state.tab !== 'fans') || !leftRows.length;
    if (ui.onlyLeftWrap.hidden && state.onlyLeft) { state.onlyLeft = false; ui.onlyLeft.checked = false; } // a hidden filter must not keep filtering
    ui.share.hidden = side;
    ui.prot.hidden = !prot;
    ui.pend.hidden = !pend;
    ui.list.hidden = prot;
    ui.empty.hidden = true;
    if (prot) { renderProtected(); return; }
    if (pend) { renderPending(); return; }
    if (acts) { renderActions(); return; }
    if (history) { renderHistory(); return; }
    const all = state.lists[state.tab];
    const base = state.tab === 'notback' ? all.filter((r) => !isProtected(r.u)) : all;
    const rows = listRows();
    const handled = all.filter((r) => isDone(r.u)).length;
    const protectedN = all.length - base.length;
    const quota = (state.tab === 'notback' || state.tab === 'fans') ? actionQuota() : null;
    ui.listTitle.textContent = t(TABS[state.tab].title, { n: num(base.length), nRaw: base.length })
      + (rows.length !== base.length ? ' · ' + t('showing', { n: num(rows.length) }) : '')
      + (handled ? ' · ' + t('handled', { n: num(handled) }) : '')
      + (protectedN ? ' · ' + t('nProtected', { n: num(protectedN) }) : '')
      + (quota && state.actions.times.length ? ' · ' + t('actionsQuota', { h: num(quota.hourLeft), d: num(quota.dayLeft) }) : '');
    for (const r of rows) ui.list.append(rowNode(r, true));
    ui.list.hidden = rows.length === 0;
    ui.empty.hidden = rows.length !== 0;
    if (!rows.length) {
      ui.empty.textContent = all.length === 0 ? t(TABS[state.tab].empty)
        : state.q.trim() ? t('noMatch', { q: state.q.trim() })
        : state.kind !== 'all' ? t('histEmptyFilter')
        : (state.tab === 'notback' && base.length === 0) ? t('allProtected')
        : t('allHandled');
    }
  }

  // --- history tab: the chart and the event log
  const EV = {
    gained: { key: 'evGained', cls: 'good' },
    lost: { key: 'evLost', cls: 'warn' },
    you_followed: { key: 'evYouFollowed', cls: '' },
    you_unfollowed: { key: 'evYouUnfollowed', cls: '' },
    deactivated: { key: 'evDeactivated', cls: '' },
    reactivated: { key: 'evReactivated', cls: 'good' },
  };
  function filteredEvents() {
    let evs = state.hist && Array.isArray(state.hist.events) ? state.hist.events : [];
    const f = state.evFilter;
    if (f === 'others') evs = evs.filter((e) => e.type === 'gained' || e.type === 'lost' || e.type === 'deactivated' || e.type === 'reactivated');
    else if (f !== 'all') evs = evs.filter((e) => e.type === f);
    return visible(evs);
  }
  function renderHistory() {
    const hist = state.hist && Array.isArray(state.hist.points) ? state.hist : { points: [], events: [] };
    const pts = hist.points;
    ui.chart.replaceChildren(buildStats(computeStats(pts, Date.now())), buildChart(pts));
    const all = Array.isArray(hist.events) ? hist.events : [];
    const gained = all.filter((e) => e.type === 'gained').length;
    const lost = all.filter((e) => e.type === 'lost').length;
    ui.listTitle.textContent = pts.length
      ? t('histSince', { date: fmtMD(pts[0].at), n: num(pts.length), nRaw: pts.length, g: num(gained), l: num(lost) })
      : t('titleHistory');
    const groups = groupEvents(filteredEvents());
    let total = 0;
    for (const g of groups) {
      total += g.events.length;
      const parts = [];
      if (g.gained) parts.push(t('histGained', { n: num(g.gained) }));
      if (g.lost) parts.push(t('histLost', { n: num(g.lost) }));
      if (g.youFollowed) parts.push(t('histYouFollowed', { n: num(g.youFollowed) }));
      if (g.youUnfollowed) parts.push(t('histYouUnfollowed', { n: num(g.youUnfollowed) }));
      if (g.deactivated) parts.push(t('histDeactivated', { n: num(g.deactivated) }));
      if (g.reactivated) parts.push(t('histReactivated', { n: num(g.reactivated) }));
      ui.list.append(h('div', { class: 'group' }, fmtDT(g.at) + ' · ' + parts.join(' · ')));
      for (const e of g.events) {
        const row = rowNode({ u: e.u, name: e.name, priv: e.priv }, false);
        const ev = EV[e.type] || { key: 'evUnknown', cls: '' };
        row.append(h('span', { class: 'chip ' + ev.cls }, t(ev.key)));
        ui.list.append(row);
      }
    }
    ui.list.hidden = total === 0;
    ui.empty.hidden = total !== 0;
    if (!total) {
      ui.empty.textContent = pts.length < 2 ? t('histEmptyFirst')
        : (state.q.trim() || state.evFilter !== 'all') ? t('histEmptyFilter') : t('histEmptyNone');
    }
  }
  // Four small numbers above the chart: follow-back rate, this week, best and worst check.
  function buildStats(s) {
    const wrap = h('div', { class: 'stats' });
    if (!s) return wrap;
    const signed = (v) => (v >= 0 ? '+' : '−') + num(Math.abs(v));
    const stat = (value, label) => h('div', { class: 'stat' }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
    wrap.append(stat(s.rate + '%', t('statRate')));
    wrap.append(s.week ? stat(signed(s.week.followers), t('statWeek', { since: fmtMD(s.week.since) })) : stat('—', t('statNeedMore')));
    wrap.append(s.best ? stat(signed(s.best.delta), t('statBest', { d: fmtMD(s.best.at) })) : stat('—', t('statNeedMore')));
    wrap.append(s.worst ? stat(signed(s.worst.delta), t('statWorst', { d: fmtMD(s.worst.at) })) : stat('—', t('statNeedMore')));
    return wrap;
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    return el;
  }
  // Followers and following over time: one scale (both are counts of accounts), two lines,
  // end labels on each line, a legend, and a hover crosshair with the numbers for that check.
  function buildChart(points) {
    const wrap = h('div', { class: 'chart' });
    if (points.length < 2) {
      wrap.append(h('div', { class: 'cnote' }, t(points.length === 1 ? 'chartOne' : 'chartNone')));
      return wrap;
    }
    const W = Math.max(300, (ui.body.clientWidth || state.width) - 34), H = 190;
    const m = { l: 42, r: 110, t: 12, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const t0 = points[0].at, t1 = points[points.length - 1].at, span = Math.max(1, t1 - t0);
    const ticks = niceTicks(Math.max(1, ...points.map((p) => Math.max(p.followers, p.following))), 3);
    const top = ticks[ticks.length - 1];
    const x = (tm) => m.l + ((tm - t0) / span) * iw;
    const y = (v) => m.t + ih - (v / top) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': t('chartAria') });
    for (const v of ticks) {
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'grid' }));
      svg.append(s('text', { x: m.l - 6, y: y(v) + 4, class: 'ax', 'text-anchor': 'end' }, num(v)));
    }
    svg.append(s('text', { x: m.l, y: H - 8, class: 'ax' }, fmtMD(t0)));
    svg.append(s('text', { x: W - m.r, y: H - 8, class: 'ax', 'text-anchor': 'end' }, fmtMD(t1)));
    const series = [['followers', 's1', t('chartFollowers')], ['following', 's2', t('chartFollowing')]];
    const last = points[points.length - 1];
    const ends = [];
    for (const [key, cls, label] of series) {
      const d = points.map((p, i) => (i ? 'L' : 'M') + x(p.at).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
      svg.append(s('path', { d, class: 'line ' + cls }));
      svg.append(s('circle', { cx: x(last.at), cy: y(last[key]), r: 3.5, class: 'end ' + cls }));
      ends.push({ cls, label, yy: y(last[key]), v: last[key] });
    }
    ends.sort((a, b) => a.yy - b.yy);
    if (ends[1].yy - ends[0].yy < 14) { const mid = (ends[0].yy + ends[1].yy) / 2; ends[0].yy = mid - 7; ends[1].yy = mid + 7; }
    for (const e of ends) {
      svg.append(s('circle', { cx: W - m.r + 10, cy: e.yy, r: 3, class: 'end ' + e.cls }));
      svg.append(s('text', { x: W - m.r + 17, y: e.yy + 4, class: 'lbl' }, `${e.label} ${num(e.v)}`));
    }
    const cross = s('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: 'cross', visibility: 'hidden' });
    const dots = series.map(([, cls]) => s('circle', { r: 4.5, class: 'hdot ' + cls, visibility: 'hidden' }));
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    svg.append(cross, ...dots, hit);
    const tip = h('div', { class: 'ctip', hidden: true });
    const show = (clientX) => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;
      const px = (clientX - r.left) * (W / r.width);
      let best = 0, bd = Infinity;
      points.forEach((p, i) => { const d = Math.abs(x(p.at) - px); if (d < bd) { bd = d; best = i; } });
      const p = points[best], cx = x(p.at);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dots[0].setAttribute('cx', cx); dots[0].setAttribute('cy', y(p.followers)); dots[0].setAttribute('visibility', 'visible');
      dots[1].setAttribute('cx', cx); dots[1].setAttribute('cy', y(p.following)); dots[1].setAttribute('visibility', 'visible');
      tip.replaceChildren(
        h('div', { class: 'ctipd' }, fmtDT(p.at)),
        h('div', null, t('chartTip1', { a: num(p.followers), b: num(p.following) })),
        h('div', null, t('chartTip2', { a: num(p.notback), b: num(p.mutual) })));
      tip.hidden = false;
      const left = (cx / W) * r.width;
      tip.style.left = Math.max(8, Math.min(left + 12, r.width - 200)) + 'px';
      tip.style.top = '6px';
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); for (const d of dots) d.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    hit.addEventListener('mousemove', (e) => show(e.clientX));
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', (e) => { if (e.touches && e.touches[0]) show(e.touches[0].clientX); }, { passive: true });
    const legend = h('div', { class: 'legend' }, h('span', null, h('i', { class: 's1' }), series[0][2]), h('span', null, h('i', { class: 's2' }), series[1][2]));
    wrap.append(svg, tip, legend);
    return wrap;
  }
  function rerenderChart() { if (state.tab === 'changes' && state.lists && state.open) renderList(); }

  function currentUsernames() {
    if (!state.lists) return [];
    if (state.tab === 'changes') return [...new Set(filteredEvents().map((e) => e.u))];
    if (state.tab === 'protected') return Object.keys(state.white).sort();
    if (state.tab === 'pending') return visible(state.pending).map((r) => r.u);
    if (state.tab === 'actions') return [...new Set(visible(state.log).map((e) => e.u))];
    return listRows().map((r) => r.u);
  }
  function copyList() {
    const names = currentUsernames();
    if (!names.length) { toast(t('toastNothing')); return; }
    const text = names.join('\n');
    const ok = () => toast(t('toastCopied', { n: num(names.length), nRaw: names.length }));
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      if (done) ok(); else toast(t('toastCopyBlocked'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }

  // auto: started by the panel itself (see maybeAutoCheck); the button at the bottom then carries the result.
  async function startCheck(auto) {
    if (state.running) return;
    const uid = cookie('ds_user_id');
    if (uid !== state.uid) await loadAccount(uid);
    if (state.running) return;
    state.running = true;
    state.ctl = { cancelled: false };
    ui.check.disabled = true;
    ui.cancel.hidden = false;
    ui.error.hidden = true;
    if (auto) ui.fab.textContent = t('fabChecking');
    showProgress({ phase: 'info' });
    try {
      const snap = await runCheck(state.ctl, showProgress);
      if (state.uid !== uid || snap.uid !== uid) throw new Cancelled(); // the account changed mid-check; never mix results
      snap.me = carryMe(snap, state.snap); // the account-info request can be throttled; keep the name we already know
      const knownEvents = state.hist && Array.isArray(state.hist.events) ? state.hist.events : [];
      const events = eventsFrom(diff(state.snap, snap), snap.at, goneSet(knownEvents));
      state.hist = appendHistory(state.hist, pointFrom(snap), events, HIST_CAPS);
      state.prev = state.snap;
      state.snap = snap;
      noteDates(events, snap.at);
      await storageSet({ [acctStoreKey(uid)]: { last: snap, prev: state.prev }, [histStoreKey(uid)]: state.hist, [datesStoreKey(uid)]: state.dates });
      state.tab = 'notback';
      applySnapshot();
      toast(t('toastChecked', { a: num(snap.following.length), b: num(snap.followers.length) }));
      const app = hostApp();
      if (app && typeof app.noteCheck === 'function') { try { app.noteCheck(snap.at); } catch (e) { /* older app build */ } }
      if (auto) ui.fab.textContent = t('fabResult', { g: num(events.filter((e) => e.type === 'gained').length), l: num(events.filter((e) => e.type === 'lost').length) });
    } catch (e) {
      if (auto) ui.fab.textContent = t('fab');
      if (e instanceof Cancelled) toast(t('toastCancelled'));
      else showError(e && e.message ? e.message : t('errGeneric'));
    } finally {
      state.running = false;
      state.ctl = null;
      ui.check.disabled = false;
      ui.cancel.hidden = true;
      ui.progress.hidden = true;
    }
  }
  function cancelCheck() { if (state.ctl) state.ctl.cancelled = true; }

  // Version 1.0.0 kept a single account under "fbc" / "fbcDone". Hand that data to the logged-in
  // account only when the snapshot's username matches it (one small request), then drop the old keys.
  async function migrateLegacy(uid, legacy, legacyDone) {
    const last = legacy && isSnap(legacy.last) ? legacy.last : null;
    if (!last) { await storageRemove(['fbc', 'fbcDone']); return null; }
    let mine = !last.me; // no username recorded: best effort, assume it was this account
    if (!mine) {
      try {
        const info = await igGet(API.info(uid));
        const name = info && info.user && typeof info.user.username === 'string' ? info.user.username.toLowerCase() : '';
        if (!name) return null; // could not verify now, try again next time
        mine = name === last.me.toLowerCase();
      } catch (e) { return null; }
    }
    if (!mine) return null; // belongs to another account; it can claim the data when it logs in
    const acct = { last, prev: isSnap(legacy.prev) ? legacy.prev : null };
    const done = legacyDone && typeof legacyDone === 'object' ? legacyDone : {};
    await storageSet({ [acctStoreKey(uid)]: acct, [doneStoreKey(uid)]: done });
    await storageRemove(['fbc', 'fbcDone']);
    return { acct, done };
  }
  let loadSeq = 0;
  async function loadAccount(uid) {
    const seq = ++loadSeq;
    state.uid = uid;
    state.snap = null; state.prev = null; state.done = {}; state.white = {}; state.actions = freshActions(); state.lists = null; state.hist = null; state.log = []; state.pending = []; state.dates = null;
    state.tab = 'notback';
    updateProtectedBtn();
    updateSideBtns();
    applySnapshot();
    if (!uid) return;
    const r = await storageGet([acctStoreKey(uid), doneStoreKey(uid), histStoreKey(uid), whiteStoreKey(uid), actStoreKey(uid), logStoreKey(uid), pendStoreKey(uid), datesStoreKey(uid), COUNTS_KEY, 'fbc', 'fbcDone']);
    if (seq !== loadSeq) return; // another account took over while loading
    let acct = r[acctStoreKey(uid)];
    let done = r[doneStoreKey(uid)];
    if (!acct && r.fbc && typeof r.fbc === 'object') {
      const m = await migrateLegacy(uid, r.fbc, r.fbcDone);
      if (seq !== loadSeq) return;
      if (m) { acct = m.acct; done = m.done; }
    }
    state.snap = acct && isSnap(acct.last) ? acct.last : null;
    state.prev = acct && isSnap(acct.prev) ? acct.prev : null;
    state.done = done && typeof done === 'object' ? done : {};
    const white = r[whiteStoreKey(uid)];
    state.white = white && typeof white === 'object' && !Array.isArray(white) ? white : {};
    updateProtectedBtn();
    const act = r[actStoreKey(uid)];
    state.actions = act && typeof act === 'object' && Array.isArray(act.times) ? { times: act.times, pausedUntil: Number(act.pausedUntil) || 0, warned: !!act.warned } : freshActions();
    state.counts = pruneCounts(r[COUNTS_KEY], Date.now(), COUNTS.cap, COUNTS.ttlMs);
    const rawLog = r[logStoreKey(uid)];
    state.log = Array.isArray(rawLog) ? rawLog.filter((e) => e && typeof e.at === 'number' && typeof e.u === 'string').slice(-LOG_CAP) : [];
    state.pending = mergePending([], Array.isArray(r[pendStoreKey(uid)]) ? r[pendStoreKey(uid)] : [], Date.now()).pending;
    updateSideBtns();
    const hist = r[histStoreKey(uid)];
    if (hist && Array.isArray(hist.points) && Array.isArray(hist.events)) {
      // Older histories recorded a deactivation as "unfollowed you" plus "you unfollowed"; fold those once.
      const fixed = reclassifyEvents(hist.events);
      if (fixed !== hist.events) { hist.events = fixed; storageSet({ [histStoreKey(uid)]: hist }); }
      state.hist = hist;
    } else if (state.snap) {
      // First run with history: seed it from the two snapshots kept so far, so nothing is lost.
      let seeded = { points: [], events: [] };
      if (state.prev) seeded = appendHistory(seeded, pointFrom(state.prev), [], HIST_CAPS);
      seeded = appendHistory(seeded, pointFrom(state.snap), eventsFrom(diff(state.prev, state.snap), state.snap.at), HIST_CAPS);
      state.hist = seeded;
      storageSet({ [histStoreKey(uid)]: seeded });
    }
    const dates = r[datesStoreKey(uid)];
    if (dates && typeof dates === 'object' && dates.following && dates.followers) state.dates = dates;
    else if (state.hist && state.hist.points.length) {
      // First time with dates: read the whole history once, the first check being the floor.
      state.dates = applyDateEvents(emptyDates(state.hist.points[0].at), state.hist.events);
      storageSet({ [datesStoreKey(uid)]: state.dates });
    }
    updateDatesStatus();
    applySnapshot();
    maybeAutoCheck();
  }
  // Instagram can switch accounts without a reload, so follow the login cookie.
  function watchAccount() {
    const uid = cookie('ds_user_id');
    if (uid === state.uid) return;
    if (state.running) cancelCheck();
    relCache.clear();
    relSeq++;
    relPath = '';
    ui.rel.hidden = true;
    loadAccount(uid);
  }

  // --- "does this profile follow me?" pill, shown while a profile page is open
  const REL_TTL_MS = 10 * 60 * 1000;
  const REL_COOLDOWN_MS = 20 * 60 * 1000;
  const relCache = new Map(); // uid:username -> { at, rel }
  let relPath = '', relTimer = 0, relSeq = 0, relUser = '';
  // Two ways to ask Instagram live. First the profile-info request the site itself makes when it
  // opens a profile; if that route is broken, find the account id through search and ask the
  // friendship endpoint. Login and rate-limit errors stop both routes at once.
  const isMe = (id) => { const me = cookie('ds_user_id'); return !!(me && id && id === me); };
  async function fetchRelationship(username) {
    let firstError = null;
    try {
      return await relFromProfileInfo(username);
    } catch (e) {
      if (e instanceof AuthError || e instanceof RateLimited) throw e;
      firstError = e;
    }
    try {
      return await relFromSearch(username);
    } catch (e) {
      if (e instanceof AuthError || e instanceof RateLimited) throw e;
      const a = firstError && firstError.message ? firstError.message : 'profile lookup failed';
      const b = e && e.message ? e.message : 'search lookup failed';
      throw new Error('profile info: ' + a + ' | search: ' + b);
    }
  }
  async function relFromProfileInfo(username) {
    const j = await igGet('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(username));
    const u = j && j.data && j.data.user;
    if (!u) throw new Error('profile info came back empty');
    const id = u.id != null ? String(u.id) : '';
    if (typeof u.follows_viewer === 'boolean' || typeof u.followed_by_viewer === 'boolean') {
      return { id, self: isMe(id), followsYou: !!u.follows_viewer, youFollow: !!u.followed_by_viewer, youRequested: !!u.requested_by_viewer, theyRequested: !!u.has_requested_viewer };
    }
    if (!id) throw new Error('profile info had no viewer fields');
    return relFromFriendship(id);
  }
  async function relFromFriendship(id) {
    const st = await igGet(API.friendship(encodeURIComponent(id)));
    if (!st || typeof st.followed_by !== 'boolean') throw new Error('friendship status unavailable');
    return { id, self: isMe(id), followsYou: !!st.followed_by, youFollow: !!st.following, youRequested: !!st.outgoing_request, theyRequested: !!st.incoming_request };
  }
  async function relFromSearch(username) {
    const j = await igGet('/api/v1/web/search/topsearch/?context=blended&query=' + encodeURIComponent(username) + '&include_reel=false');
    const hits = j && Array.isArray(j.users) ? j.users : [];
    const hit = hits.map((x) => x && x.user).find((u) => u && typeof u.username === 'string' && u.username.toLowerCase() === username);
    if (!hit || hit.pk == null) throw new Error('search did not return this profile');
    return relFromFriendship(String(hit.pk));
  }
  function renderRel(username, rel, status, note) {
    ui.rel.hidden = false;
    ui.rel.classList.remove('err');
    ui.relDot.className = 'dot';
    ui.relName.textContent = '@' + username;
    ui.rel.title = note || t('pillTitleClick');
    if (status === 'loading') { ui.relDot.classList.add('loading'); ui.relText.textContent = t('pillChecking'); return; }
    if (!rel) { ui.rel.classList.add('err'); ui.relText.textContent = status || t('pillCouldNot'); return; }
    if (rel.self) { ui.rel.hidden = true; return; }
    const d = describeRel(rel);
    ui.relDot.classList.add(d.tone);
    const left = (state.left.has(username) ? ' · ' + t('pillLeft', { d: fmtMD(state.left.get(username)) }) : '')
      + (state.loops.has(username) ? ' · ' + t('pillLoop', { d: fmtMD(state.loops.get(username).followedAt) }) : '');
    if (rel.stale) {
      ui.relText.textContent = t('pillAsOf', { text: t(d.key), when: fmtWhen(rel.stale) }) + left;
      if (!note) ui.rel.title = t('pillTitleLast');
    } else {
      ui.relText.textContent = t(d.key) + left;
      if (!note) ui.rel.title = t('pillTitleLive');
    }
  }
  // The answer from the last full check: no request at all.
  function relFromSnapshot(username) {
    const snap = state.snap;
    if (!snap) return null;
    return {
      followsYou: snap.followers.some((r) => r.u === username),
      youFollow: snap.following.some((r) => r.u === username),
      youRequested: false,
      theyRequested: false,
      self: !!(snap.me && snap.me.toLowerCase() === username),
      stale: snap.at,
    };
  }
  // Opening a profile answers from the last full check. Instagram is asked live only when the pill
  // is clicked, or when there is no local data yet, and never while it has asked us to slow down.
  async function showRelFor(username, live) {
    const seq = ++relSeq;
    relUser = username;
    const key = state.uid + ':' + username; // the answer depends on who is logged in
    const cached = relCache.get(key);
    if (!live && cached && Date.now() - cached.at < REL_TTL_MS) { renderRel(username, cached.rel, null); return; }
    const local = relFromSnapshot(username);
    if (Date.now() < state.cooldownUntil) {
      const note = t('pillSlowNote', { t: fmtT(state.cooldownUntil) });
      if (local) renderRel(username, local, null, note);
      else renderRel(username, null, t('pillPaused', { t: fmtT(state.cooldownUntil) }), note);
      return;
    }
    if (!live && local) { renderRel(username, local, null); return; }
    renderRel(username, null, 'loading');
    try {
      const rel = await fetchRelationship(username);
      if (seq !== relSeq) return; // moved to another page meanwhile
      relCache.set(key, { at: Date.now(), rel });
      renderRel(username, rel, null);
    } catch (e) {
      if (seq !== relSeq) return;
      const reason = e && e.message ? e.message : String(e);
      try { console.warn('[Follow Back Checker] live check failed for @' + username + ': ' + reason); } catch (e2) { /* ignore */ }
      if (e instanceof RateLimited) {
        state.cooldownUntil = Date.now() + REL_COOLDOWN_MS;
        saveUi();
      }
      const note = t('pillFailed', { r: reason }) + (e instanceof RateLimited ? ' ' + t('pillSlowNote', { t: fmtT(state.cooldownUntil) }) : t('pillRetry'));
      if (local && !(e instanceof AuthError)) renderRel(username, local, null, note);
      else renderRel(username, null, e instanceof RateLimited ? t('pillPaused', { t: fmtT(state.cooldownUntil) }) : e instanceof AuthError ? t('pillLogin') : t('pillCouldNot'), note);
    }
  }
  function recheckRel() { if (relUser) { relCache.delete(state.uid + ':' + relUser); showRelFor(relUser, true); } }

  // --- unfollow, one account per tap
  class ActionBlocked extends Error { constructor(m) { super(m); this.name = 'ActionBlocked'; } }
  function saveActions() { if (state.uid) storageSet({ [actStoreKey(state.uid)]: state.actions }); }
  function actionQuota() {
    const now = Date.now();
    state.actions.times = state.actions.times.filter((x) => typeof x === 'number' && x > now - 86400000);
    const hour = state.actions.times.filter((x) => x > now - 3600000).length;
    return { hourLeft: Math.max(0, ACT.perHour - hour), dayLeft: Math.max(0, ACT.perDay - state.actions.times.length), last: state.actions.times.length ? state.actions.times[state.actions.times.length - 1] : 0 };
  }
  // Why an unfollow cannot happen right now, or null when it can.
  function unfollowBlocker() {
    if (Date.now() < state.actions.pausedUntil) return t('unfollowBlocked', { t: fmtT(state.actions.pausedUntil) });
    const q = actionQuota();
    if (q.last && Date.now() - q.last < ACT.gapMs) return t('unfollowWait', { s: Math.ceil((ACT.gapMs - (Date.now() - q.last)) / 1000) });
    if (q.hourLeft <= 0) return t('unfollowLimitHour', { n: ACT.perHour });
    if (q.dayLeft <= 0) return t('unfollowLimitDay', { n: ACT.perDay });
    return null;
  }
  async function postForm(path, headers, params) {
    let res;
    try {
      res = await fetch(location.origin + path, {
        method: 'POST', credentials: 'include',
        headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, headers),
        body: new URLSearchParams(params).toString(),
      });
    } catch (e) { throw new Error(t('errNetwork')); }
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(text.replace(/^for \(;;\);/, '')); } catch (e) { data = null; }
    return { status: res.status, data };
  }
  let sessionTokens = null;
  async function webSessionTokens() {
    if (sessionTokens) return sessionTokens;
    try {
      const req = window.require;
      if (typeof req === 'function') {
        const d = req('DTSGInitialData'), l = req('LSD');
        if (d && d.token && l && l.token) { sessionTokens = { fbDtsg: d.token, lsd: l.token, revision: '' }; return sessionTokens; }
      }
    } catch (e) { /* not reachable from this world */ }
    sessionTokens = tokensFromHtml(document.documentElement.innerHTML);
    if (!sessionTokens) {
      try { const res = await fetch(location.origin + '/', { credentials: 'include' }); sessionTokens = tokensFromHtml(await res.text()); } catch (e) { sessionTokens = null; }
    }
    return sessionTokens;
  }
  // Asks Instagram to unfollow one account and only returns once Instagram confirms the follow is gone.
  async function unfollowRequest(r) {
    const base = { 'x-csrftoken': cookie('csrftoken'), 'x-ig-app-id': API.appId, 'x-asbd-id': API.asbdId, 'x-requested-with': 'XMLHttpRequest' };
    // The REST route the web client used for years.
    let a = await postForm('/api/v1/friendships/destroy/' + encodeURIComponent(r.id) + '/', base, { container_module: 'profile', user_id: r.id });
    let verdict = judgeAction(a.status, a.data);
    if (verdict === 'blocked') throw new ActionBlocked('blocked');
    if (verdict !== 'ok') {
      // The GraphQL mutation the current web client runs from its own Unfollow button.
      const tokens = await webSessionTokens();
      if (!tokens) throw new Error('session tokens not found');
      const params = {
        av: cookie('ds_user_id'), __d: 'www', __user: '0', __a: '1', __comet_req: '7',
        fb_dtsg: tokens.fbDtsg, jazoest: jazoest(tokens.fbDtsg), lsd: tokens.lsd,
        fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: ACT.friendlyName,
        variables: JSON.stringify({ target_user_id: r.id, container_module: 'profile', nav_chain: 'PolarisProfilePostsTabRoot:profilePage:1:via_cold_start' }),
        server_timestamps: 'true', doc_id: ACT.docId,
      };
      if (tokens.revision) { params.__rev = tokens.revision; params.__spin_r = tokens.revision; }
      a = await postForm('/api/graphql', Object.assign({}, base, { 'x-fb-friendly-name': ACT.friendlyName, 'x-fb-lsd': tokens.lsd }), params);
      verdict = judgeAction(a.status, a.data);
      if (verdict === 'blocked') throw new ActionBlocked('blocked');
      if (verdict !== 'ok') throw new Error('HTTP ' + a.status);
    }
    let confirmed = findFollowing(a.data, 0) === false;
    let st = null;
    try { st = await igGet(API.friendship(encodeURIComponent(r.id))); } catch (e) { if (e instanceof AuthError) throw e; st = null; }
    if (st && st.following === true) throw new Error(t('unfollowStill'));
    if (st && typeof st.following === 'boolean') confirmed = true;
    if (!confirmed) throw new Error(t('unfollowUnconfirmed'));
  }
  // One friendships/show request right before an action, so a days-old list cannot cause a wrong one.
  // Resolves to the verdict; anything but 'go' has already been explained to the user and applied to the lists.
  async function preflight(kind, r) {
    if (!r.id) throw new Error('no account id');
    let st = null;
    try { st = await igGet(API.friendship(encodeURIComponent(r.id))); } catch (e) { if (e instanceof AuthError || e instanceof RateLimited) throw e; st = null; }
    const v = preCheck(kind, st);
    if (v === 'go') return v;
    if (v === 'follows_you') { recordFollower(r, true); toast(t('preFollowsYou', { u: r.u })); }
    else if (v === 'not_following') { recordUnfollow(r, true); toast(t('preNotFollowing', { u: r.u })); }
    else if (v === 'left') { recordFollower(r, false); toast(t('preLeft', { u: r.u })); }
    else if (v === 'already') { recordFollow(r, true); toast(t('preAlready', { u: r.u })); }
    else if (v === 'requested') { addPending([{ u: r.u, id: r.id, name: r.name, pic: r.pic }]); toast(t('toastRequested', { u: r.u })); }
    else if (v === 'accepted') { recordFollow(r, true); removePending(r.u); toast(t('preAccepted', { u: r.u })); }
    else if (v === 'gone') { removePending(r.u); toast(t('preGone', { u: r.u })); }
    else toast(t('preUnknown'));
    return v;
  }
  // Adds or drops one account in the followers list after Instagram said so, with a history event.
  function recordFollower(r, followsYou) {
    const snap = state.snap;
    if (!snap) return;
    const has = snap.followers.some((x) => x.u === r.u);
    if (followsYou === has) return;
    if (followsYou) snap.followers.push({ u: r.u, id: r.id, name: r.name || '', priv: !!r.priv, ver: !!r.ver, pic: r.pic || '' });
    else snap.followers = snap.followers.filter((x) => x.u !== r.u);
    const ev = { at: Date.now(), type: followsYou ? 'gained' : 'lost', u: r.u, name: r.name || '', priv: !!r.priv };
    state.hist = appendHistory(state.hist, pointFrom(snap), [ev], HIST_CAPS);
    noteDates([ev], snap.at);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    refreshFlags();
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist, [datesStoreKey(state.uid)]: state.dates });
    ui.ledger.textContent = t('ledger', { nf: num(snap.following.length), nfRaw: snap.following.length, nw: num(snap.followers.length), nwRaw: snap.followers.length });
    applyTiles();
  }
  // Keeps the lists and the history honest after an unfollow, without another full check.
  // silent: Instagram said you already do not follow, so there is no event to record.
  // The two per-account flags read off the history: who unfollowed you, and whom you followed again after an unfollow.
  function refreshFlags() {
    const events = state.hist && Array.isArray(state.hist.events) ? state.hist.events : [];
    state.left = lostSince(events);
    state.loops = loopsFrom(events);
    state.react = reactivations(events);
  }
  function recordUnfollow(r, silent) {
    const snap = state.snap;
    if (!snap) return;
    snap.following = snap.following.filter((x) => x.u !== r.u);
    const evs = silent ? [] : [{ at: Date.now(), type: 'you_unfollowed', u: r.u, name: r.name || '', priv: !!r.priv }];
    state.hist = appendHistory(state.hist, pointFrom(snap), evs, HIST_CAPS);
    noteDates(evs, snap.at);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    refreshFlags();
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist, [datesStoreKey(state.uid)]: state.dates });
    ui.ledger.textContent = t('ledger', { nf: num(snap.following.length), nfRaw: snap.following.length, nw: num(snap.followers.length), nwRaw: snap.followers.length });
    applyTiles();
  }
  // Asks Instagram to follow one account. Resolves to 'following', or 'requested' for a private account.
  async function followRequest(r) {
    const base = { 'x-csrftoken': cookie('csrftoken'), 'x-ig-app-id': API.appId, 'x-asbd-id': API.asbdId, 'x-requested-with': 'XMLHttpRequest' };
    let a = await postForm('/api/v1/friendships/create/' + encodeURIComponent(r.id) + '/', base, { container_module: 'profile', user_id: r.id });
    let verdict = judgeAction(a.status, a.data);
    if (verdict === 'blocked') throw new ActionBlocked('blocked');
    if (verdict !== 'ok') {
      // The older web route.
      a = await postForm('/web/friendships/' + encodeURIComponent(r.id) + '/follow/', base, {});
      verdict = judgeAction(a.status, a.data);
      if (verdict === 'blocked') throw new ActionBlocked('blocked');
      if (verdict !== 'ok') throw new Error('HTTP ' + a.status);
    }
    let st = null;
    try { st = await igGet(API.friendship(encodeURIComponent(r.id))); } catch (e) { if (e instanceof AuthError) throw e; st = null; }
    if (st && st.following === true) return 'following';
    if (st && st.outgoing_request === true) return 'requested';
    const fs = a.data && a.data.friendship_status;
    if (fs && fs.following === true) return 'following';
    if (fs && fs.outgoing_request === true) return 'requested';
    if (a.data && a.data.result === 'following') return 'following';
    if (a.data && a.data.result === 'requested') return 'requested';
    throw new Error(t('followUnconfirmed'));
  }
  function recordFollow(r, silent) {
    const snap = state.snap;
    if (!snap || snap.following.some((x) => x.u === r.u)) return;
    snap.following.push({ u: r.u, id: r.id, name: r.name || '', priv: !!r.priv, ver: !!r.ver, pic: r.pic || '' });
    const evs = silent ? [] : [{ at: Date.now(), type: 'you_followed', u: r.u, name: r.name || '', priv: !!r.priv }];
    state.hist = appendHistory(state.hist, pointFrom(snap), evs, HIST_CAPS);
    noteDates(evs, snap.at);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    refreshFlags();
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist, [datesStoreKey(state.uid)]: state.dates });
    ui.ledger.textContent = t('ledger', { nf: num(snap.following.length), nfRaw: snap.following.length, nw: num(snap.followers.length), nwRaw: snap.followers.length });
    applyTiles();
  }
  async function followRow(r, row, btn) {
    btn.classList.remove('arm');
    btn.textContent = t('follow');
    if (!state.actions.warned) {
      const ok = await askConfirm('unfollowWarnTitle', 'unfollowWarn', 'unfollowWarnOk', { h: ACT.perHour, d: ACT.perDay });
      if (!ok) return;
      state.actions.warned = true;
      saveActions();
    }
    const why = unfollowBlocker();
    if (why) { toast(why); return; }
    if (state.running) { toast(t('unfollowBusy')); return; }
    btn.disabled = true;
    btn.textContent = t('pillChecking');
    try {
      if (await preflight('follow', r) !== 'go') { renderList(); return; }
      const outcome = await followRequest(r);
      state.actions.times.push(Date.now());
      saveActions();
      if (outcome === 'following') {
        addLog('follow', r);
        recordFollow(r);
        toast(t('toastFollowed', { u: r.u }));
        renderList();
      } else {
        addLog('request', r);
        addPending([{ u: r.u, id: r.id, name: r.name, pic: r.pic, priv: r.priv }]);
        btn.remove();
        row.append(h('span', { class: 'chip live' }, t('liveYouRequested')));
        toast(t('toastRequested', { u: r.u }));
      }
    } catch (e) {
      if (e instanceof ActionBlocked || e instanceof RateLimited) {
        state.actions.pausedUntil = Date.now() + (e instanceof ActionBlocked ? ACT.blockPauseMs : ACT.rateLimitPauseMs);
        saveActions();
        toast(t('unfollowBlocked', { t: fmtT(state.actions.pausedUntil) }));
      } else {
        toast(t('followFailed', { r: e && e.message ? e.message : String(e) }));
      }
      btn.disabled = false;
      btn.textContent = t('follow');
    }
  }
  async function unfollowRow(r, btn) {
    btn.classList.remove('arm');
    btn.textContent = t('unfollow');
    if (!state.actions.warned) {
      const ok = await askConfirm('unfollowWarnTitle', 'unfollowWarn', 'unfollowWarnOk', { h: ACT.perHour, d: ACT.perDay });
      if (!ok) return;
      state.actions.warned = true;
      saveActions();
    }
    const why = unfollowBlocker();
    if (why) { toast(why); return; }
    if (state.running) { toast(t('unfollowBusy')); return; }
    btn.disabled = true;
    btn.textContent = t('pillChecking');
    try {
      if (await preflight('unfollow', r) !== 'go') { renderList(); return; }
      await unfollowRequest(r);
      state.actions.times.push(Date.now());
      saveActions();
      addLog('unfollow', r);
      recordUnfollow(r);
      toast(t('toastUnfollowed', { u: r.u }));
      renderList();
    } catch (e) {
      if (e instanceof ActionBlocked || e instanceof RateLimited) {
        state.actions.pausedUntil = Date.now() + (e instanceof ActionBlocked ? ACT.blockPauseMs : ACT.rateLimitPauseMs);
        saveActions();
        toast(t('unfollowBlocked', { t: fmtT(state.actions.pausedUntil) }));
      } else {
        toast(t('unfollowFailed', { r: e && e.message ? e.message : String(e) }));
      }
      btn.disabled = false;
      btn.textContent = t('unfollow');
    }
  }
  // Followers and following of the accounts shown, one paced request each, at most COUNTS.max per tap.
  async function loadCounts() {
    if (state.countsRun) { state.countsRun.cancelled = true; return; }
    if (!state.lists || state.running) { if (state.running) toast(t('unfollowBusy')); return; }
    if (Date.now() < state.countsPausedUntil) { toast(t('countsPaused', { t: fmtT(state.countsPausedUntil) })); return; }
    const fresh = (u) => state.counts[u] && Date.now() - state.counts[u].at < COUNTS.ttlMs;
    const todo = listRows().filter((r) => r.id && !fresh(r.u)).slice(0, COUNTS.max);
    if (!todo.length) { toast(t('countsNothing')); return; }
    const ctl = { cancelled: false };
    state.countsRun = ctl;
    let done = 0;
    const label = () => { ui.countsBtn.textContent = t('loadingCounts', { a: num(done), b: num(todo.length) }); };
    label();
    try {
      for (const r of todo) {
        if (ctl.cancelled) break;
        const j = await igGet(API.info(encodeURIComponent(r.id)));
        const u = j && j.user;
        if (u && typeof u.follower_count === 'number' && typeof u.following_count === 'number') {
          state.counts[r.u] = { fw: u.follower_count, fg: u.following_count, at: Date.now() };
        }
        done++;
        label();
        if (done % 10 === 0) { saveCounts(); renderList(); }
        if (done < todo.length && !ctl.cancelled) await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
      }
      toast(t(ctl.cancelled || done < todo.length ? 'countsStopped' : 'countsDone', { n: num(done) }));
    } catch (e) {
      if (e instanceof Cancelled) toast(t('countsStopped', { n: num(done) }));
      else {
        if (e instanceof RateLimited) { state.countsPausedUntil = Date.now() + REL_COOLDOWN_MS; saveUi(); toast(t('countsPaused', { t: fmtT(state.countsPausedUntil) })); }
        else toast(t('liveFailed', { r: e && e.message ? e.message : String(e) }));
      }
    } finally {
      state.countsRun = null;
      saveCounts();
      ui.countsBtn.textContent = t('loadCounts');
      renderList();
    }
  }
  function saveCounts() {
    state.counts = pruneCounts(state.counts, Date.now(), COUNTS.cap, COUNTS.ttlMs);
    storageSet({ [COUNTS_KEY]: state.counts });
  }
  // Withdraws one follow request; the same route the site uses, confirmed with friendships/show.
  async function cancelRequest(r) {
    const base = { 'x-csrftoken': cookie('csrftoken'), 'x-ig-app-id': API.appId, 'x-asbd-id': API.asbdId, 'x-requested-with': 'XMLHttpRequest' };
    const a = await postForm('/api/v1/friendships/destroy/' + encodeURIComponent(r.id) + '/', base, { container_module: 'profile', user_id: r.id });
    const verdict = judgeAction(a.status, a.data);
    if (verdict === 'blocked') throw new ActionBlocked('blocked');
    if (verdict !== 'ok') throw new Error('HTTP ' + a.status);
    let st = null;
    try { st = await igGet(API.friendship(encodeURIComponent(r.id))); } catch (e) { if (e instanceof AuthError) throw e; st = null; }
    if (st && (st.outgoing_request === true || st.following === true)) throw new Error(t('unfollowStill'));
    const fs = a.data && a.data.friendship_status;
    if (!st && !(fs && fs.outgoing_request === false)) throw new Error(t('unfollowUnconfirmed'));
  }
  // The id of a pending account, looked up once when the import did not carry it.
  async function resolveId(p) {
    if (p.id) return p.id;
    const rel = await fetchRelationship(p.u);
    if (!rel.id) throw new Error('no account id');
    p.id = rel.id;
    savePending();
    return p.id;
  }
  async function checkPendingRow(p, row, btn) {
    if (btn.disabled) return;
    if (Date.now() < state.cooldownUntil) { toast(t('pillPaused', { t: fmtT(state.cooldownUntil) })); return; }
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = t('pillChecking');
    try {
      await resolveId(p);
      const v = await preflight('cancel', p);
      if (v === 'go') {
        let chip = row.querySelector('.chip.live');
        if (!chip) { chip = h('span', { class: 'chip live' }); row.insertBefore(chip, row.acts && row.acts.parentNode === row ? row.acts : null); }
        chip.textContent = t('pendingStill');
      } else if (v !== 'unknown') renderList();
    } catch (e) {
      if (e instanceof RateLimited) { state.cooldownUntil = Date.now() + REL_COOLDOWN_MS; saveUi(); }
      toast(t('liveFailed', { r: e && e.message ? e.message : String(e) }));
    } finally {
      btn.textContent = label;
      btn.disabled = false;
    }
  }
  // Runs one write action under the shared limits: the warning once, the blocker, then the pre-check, the request and the log.
  async function runAction(kind, r, btn, label, undoOf) {
    if (!state.actions.warned) {
      const ok = await askConfirm('unfollowWarnTitle', 'unfollowWarn', 'unfollowWarnOk', { h: ACT.perHour, d: ACT.perDay });
      if (!ok) return false;
      state.actions.warned = true;
      saveActions();
    }
    const why = unfollowBlocker();
    if (why) { toast(why); return false; }
    if (state.running) { toast(t('unfollowBusy')); return false; }
    btn.disabled = true;
    btn.textContent = t('pillChecking');
    try {
      if (kind === 'cancel') await resolveId(r);
      if (await preflight(kind, r) !== 'go') { renderList(); return false; }
      let logged = kind;
      if (kind === 'cancel') { await cancelRequest(r); removePending(r.u); toast(t('toastReqCancelled', { u: r.u })); }
      else if (kind === 'unfollow') { await unfollowRequest(r); recordUnfollow(r); toast(t('toastUnfollowed', { u: r.u })); }
      else {
        const outcome = await followRequest(r);
        if (outcome === 'following') { recordFollow(r); toast(t('toastFollowed', { u: r.u })); }
        else { logged = 'request'; addPending([{ u: r.u, id: r.id, name: r.name, pic: r.pic, priv: r.priv }]); toast(t('toastRequested', { u: r.u })); }
      }
      state.actions.times.push(Date.now());
      saveActions();
      addLog(logged, r, undoOf);
      renderList();
      return true;
    } catch (e) {
      if (e instanceof ActionBlocked || e instanceof RateLimited) {
        state.actions.pausedUntil = Date.now() + (e instanceof ActionBlocked ? ACT.blockPauseMs : ACT.rateLimitPauseMs);
        saveActions();
        toast(t('unfollowBlocked', { t: fmtT(state.actions.pausedUntil) }));
      } else {
        toast(t(kind === 'cancel' ? 'cancelFailed' : kind === 'unfollow' ? 'unfollowFailed' : 'followFailed', { r: e && e.message ? e.message : String(e) }));
      }
      btn.disabled = false;
      btn.textContent = label;
      return false;
    }
  }
  function cancelRow(p, row, btn) { return runAction('cancel', p, btn, t('cancelReq')); }
  // Undo does the opposite action for the account in the log entry, and records both sides.
  function undoRow(e, row, btn) {
    const rec = Object.assign({ u: e.u, id: e.id, name: e.name, priv: e.priv, pic: e.pic }, lookupRecord(e.u) || {}, e.id ? { id: e.id } : {});
    if (!rec.id) { toast(t('preUnknown')); return; }
    return runAction(UNDO[e.type], rec, btn, t('undo'), e);
  }
  function watchProfile() {
    const path = location.pathname;
    if (path === relPath) return;
    relPath = path;
    clearTimeout(relTimer);
    const username = profileUsername(path);
    if (!username) { relUser = ''; relSeq++; ui.rel.hidden = true; return; }
    relTimer = setTimeout(() => showRelFor(username), 600);
  }

  // Inside the Android app, Instagram's "Open Instagram" / "Use the app" links point at the official
  // app and would only show an error page. Hide them; the app also ignores that link scheme.
  function hideAppPrompts() {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('a[href^="intent:"], a[href*="applink.instagram.com"] { display: none !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch (e) { /* older WebView: the navigation is blocked by the app anyway */ }
  }

  // --- settings, follow dates, the automatic check and the update notice
  function toggleSettings() { ui.settings.hidden = !ui.settings.hidden; }
  function setReminder(on) {
    const app = hostApp();
    if (!app || typeof app.setReminder !== 'function') return;
    try { app.setReminder(!!on); } catch (e) { /* older app build */ }
  }
  const fmtD = (ms) => new Date(ms).toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' });
  const SINCE_LIST = { notback: 'following', mutual: 'following', protected: 'following', fans: 'followers' };
  // One line under the name: since when you follow this account (or it follows you), and for how long.
  function sinceNode(u) {
    const list = SINCE_LIST[state.tab];
    if (!list) return null;
    const s = sinceOf(state.dates, list, u);
    if (!s) return null;
    if (s.before) return h('div', { class: 'since', title: t('sinceApprox') }, t('sinceBefore', { d: fmtD(s.at) }));
    const days = Math.max(0, Math.round((Date.now() - s.at) / 86400000));
    const d = s.exact && days === 0 ? fmtDT(s.at) : fmtD(s.at); // an exact date from today reads as a time
    return h('div', { class: 'since', title: t(s.exact ? 'sinceExact' : 'sinceApprox') }, t(list === 'followers' ? 'sinceFollowsYou' : 'sinceFollowing', { d, n: num(days) }) + (s.exact ? ' · ' + t('exactTag') : ''));
  }
  function updateDatesStatus() {
    const d = state.dates;
    if (!d || !d.importedAt) { ui.datesStatus.textContent = t('datesNone'); return; }
    const exact = (m) => Object.values(m || {}).filter((e) => e && e.x).length;
    ui.datesStatus.textContent = t('datesStatus', { d: fmtD(d.importedAt), a: num(exact(d.following)), b: num(exact(d.followers)) });
  }
  // Keeps the follow dates in step with the history. at: the check's date, the floor when there was none before.
  function noteDates(events, at) {
    if (!state.dates) state.dates = emptyDates(at || Date.now());
    state.dates = applyDateEvents(state.dates, events);
    updateDatesStatus();
  }
  async function importDatesFile() {
    const f = ui.datesFile.files && ui.datesFile.files[0];
    ui.datesFile.value = '';
    if (!f || !state.uid) return;
    try {
      let files;
      const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b) {
        if (typeof DecompressionStream !== 'function') { toast(t('toastZipOld')); return; }
        files = await zipReadFile(f);
        if (!files) { toast(t('toastDatesNone')); return; }
      } else {
        files = [{ name: f.name, text: await f.text() }];
      }
      let a = 0, b = 0, unknown = false;
      for (const file of files) {
        const rows = parsePending(file.text);
        if (!rows.length) continue;
        const kind = guessListKind(file.name, rows, state.snap);
        if (!kind) { unknown = true; continue; }
        const res = importDates(state.dates || emptyDates(state.snap ? state.snap.at : 0), rows, kind, Date.now());
        state.dates = res.dates;
        if (kind === 'followers') b += res.added; else a += res.added;
      }
      if (!a && !b) { toast(t(unknown ? 'toastDatesWhich' : 'toastDatesNone')); return; }
      await storageSet({ [datesStoreKey(state.uid)]: state.dates });
      updateDatesStatus();
      renderList();
      toast(t('toastDates', { a: num(a), b: num(b) }));
    } catch (e) {
      toast(t('toastDatesNone'));
    }
  }
  // The check that starts by itself: once per page load and account, a few seconds after the panel is ready.
  const autoRan = new Set();
  async function maybeAutoCheck() {
    await prefsReady;
    const uid = state.uid;
    if (!uid || uid !== cookie('ds_user_id')) return;
    const due = shouldAutoCheck({ enabled: state.autoCheck, lastAt: state.snap ? state.snap.at : 0, now: Date.now(), running: state.running, cooldownUntil: state.cooldownUntil, maxAgeMs: AUTO.maxAgeMs, ranAlready: autoRan.has(uid) });
    if (!due) return;
    autoRan.add(uid);
    await sleep(AUTO.delayMs);
    if (state.uid !== uid || state.running) return;
    startCheck(true);
  }
  // The latest release: the app keeps a copy (its own request), the extension asks its background script.
  // Instagram's page rules block that request from the page itself, so the userscript and bookmarklet skip it.
  function fetchRelease() {
    if (RUNTIME === 'android') {
      const app = hostApp();
      if (!app || typeof app.latestRelease !== 'function') return Promise.resolve(null);
      try { const text = app.latestRelease(); return Promise.resolve(text ? JSON.parse(text) : null); } catch (e) { return Promise.resolve(null); }
    }
    if (RUNTIME === 'extension') {
      return new Promise((resolve) => {
        try { chrome.runtime.sendMessage({ type: 'fbc-release' }, (r) => { void chrome.runtime.lastError; resolve(r && r.ok ? r.release : null); }); } catch (e) { resolve(null); }
      });
    }
    return Promise.resolve(null);
  }
  function appVersion() {
    const app = hostApp();
    if (!app || typeof app.appVersion !== 'function') return '';
    try { return String(app.appVersion() || ''); } catch (e) { return ''; }
  }
  async function checkForUpdate() {
    if (RUNTIME !== 'android' && RUNTIME !== 'extension') return;
    const now = Date.now();
    if (RUNTIME === 'extension' && now - state.upd.at < UPDATE.everyMs) { showUpdate(); return; }
    const raw = await fetchRelease();
    const rel = raw ? parseRelease(raw, { host: RUNTIME, script: SCRIPT_VERSION, app: appVersion() }) : null;
    state.upd = { at: now, seen: state.upd.seen, rel: rel || (RUNTIME === 'android' ? null : state.upd.rel) };
    saveUi();
    showUpdate();
  }
  function showUpdate() {
    const rel = state.upd && state.upd.rel;
    const show = !!(rel && rel.newer && rel.get && state.upd.seen !== rel.tag);
    ui.update.hidden = !show;
    if (show) ui.updText.textContent = t('updNew', { v: rel.version });
  }
  function openUpdate() {
    const rel = state.upd && state.upd.rel;
    if (!rel || !rel.get) return;
    const app = hostApp();
    if (app && typeof app.openExternal === 'function') { try { if (app.openExternal(rel.get)) return; } catch (e) { /* fall through */ } }
    const a = h('a', { href: rel.get, target: '_blank', rel: 'noopener noreferrer' });
    root.append(a);
    a.click();
    a.remove();
  }
  function dismissUpdate() {
    const rel = state.upd && state.upd.rel;
    state.upd = Object.assign({}, state.upd, { seen: rel ? rel.tag : state.upd.seen });
    saveUi();
    ui.update.hidden = true;
  }

  // --- boot
  if (HOST === 'android') hideAppPrompts();
  build();
  mount();
  setInterval(mount, 3000); // Instagram re-renders a lot; keep the host attached
  loadAccount(cookie('ds_user_id'));
  setInterval(watchAccount, 1000);
  watchProfile();
  setInterval(watchProfile, 500); // Instagram navigates without reloading, so poll the URL
  window.__fbcToggle = () => toggle(true);
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'fbc-toggle') { toggle(); sendResponse({ ok: true }); }
      });
    }
  } catch (e) { /* not running as an extension */ }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!ui.lightbox.hidden) { closeLightbox(); return; }
    if (state.open) toggle(false);
  }, true);
})();
