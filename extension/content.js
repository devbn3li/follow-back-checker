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
  const { num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, profileUsername, describeRel, parseUsernames, toCsv, matchesKind, tokensFromHtml, jazoest, judgeAction, findFollowing } = CORE;
  const CSS = typeof FBC_CSS === 'string' ? FBC_CSS : '';
  const HOST = typeof window.FBC_HOST === 'string' ? window.FBC_HOST : 'extension';
  const MOBILE = HOST === 'android' || (window.innerWidth < 700 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

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
  const state = { uid: '', snap: null, prev: null, done: {}, white: {}, actions: freshActions(), lists: null, hist: null, evFilter: 'all', kind: 'all', showProtected: false, tab: 'notback', q: '', hideDone: false, running: false, ctl: null, open: false, width: 640, cooldownUntil: 0 };
  const live = { following: 0, followers: 0 };
  const ui = {};
  // Small preferences, remembered across visits: language, panel width, and the pause after Instagram asks us to slow down.
  const UI_KEY = 'fbc.ui';
  function saveUi() { storageSet({ [UI_KEY]: { lang, width: state.width, cooldownUntil: state.cooldownUntil } }); }
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
    ui.kindOpts = ['all', 'verified', 'notVerified', 'private', 'public'].map((v) => h('option', { value: v }));
    ui.kindFilter = h('select', { class: 'field sel', onchange: () => { state.kind = ui.kindFilter.value; renderList(); } }, ui.kindOpts);
    ui.filterOpts = ['all', 'others', 'gained', 'lost', 'you_followed', 'you_unfollowed'].map((v) => h('option', { value: v }));
    ui.evFilter = h('select', { class: 'field sel', hidden: true, onchange: () => { state.evFilter = ui.evFilter.value; renderList(); } }, ui.filterOpts);
    ui.copy = h('button', { class: 'btn small', type: 'button', onclick: () => copyList() });
    ui.download = h('button', { class: 'btn small', type: 'button', onclick: () => downloadCurrent() });
    ui.protectedBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { state.tab = 'protected'; renderList(); } });
    ui.toolbar = h('div', { class: 'toolbar' }, ui.search, ui.hideDoneWrap, ui.showProtectedWrap, ui.kindFilter, ui.evFilter, ui.copy, ui.download, ui.protectedBtn);
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
    ui.list = h('div', { class: 'list' });
    ui.empty = h('div', { class: 'empty', hidden: true });
    ui.notice = h('div', { class: 'notice', hidden: true });
    ui.results = h('div', { class: 'results', hidden: true }, ui.ledger, ui.notice, ui.tiles, ui.toolbar, ui.listTitle, ui.chart, ui.prot, ui.list);
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
      h('header', { class: 'head' }, h('div', { class: 'headl' }, h('span', { class: 'title' }, 'Follow Back Checker'), ui.me), h('div', { class: 'headr' }, ui.langBtn, ui.close)),
      h('div', { class: 'controls' }, ui.check, ui.cancel, ui.status),
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
    ui.lightbox = h('div', { class: 'lightbox', hidden: true, onclick: (e) => { if (e.target === ui.lightbox) closeLightbox(); } },
      h('div', { class: 'lbbox' }, ui.lbImg, ui.lbName, h('div', { class: 'lbbar' }, ui.lbFull, ui.lbSave, ui.lbClose)));
    root.append(ui.fabwrap, ui.drawer, ui.lightbox);
    relabel();
    wireResize();
    applyWidth(state.width);
    storageGet([UI_KEY]).then((r) => {
      const prefs = r[UI_KEY] && typeof r[UI_KEY] === 'object' ? r[UI_KEY] : {};
      state.width = applyWidth(typeof prefs.width === 'number' ? prefs.width : WIDTH.def);
      if (typeof prefs.cooldownUntil === 'number' && prefs.cooldownUntil > Date.now()) state.cooldownUntil = prefs.cooldownUntil;
      if ((prefs.lang === 'ar' || prefs.lang === 'en') && prefs.lang !== lang) setLang(prefs.lang, true);
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
    ui.close.setAttribute('aria-label', t('close'));
    ui.check.textContent = t('checkNow');
    ui.cancel.textContent = t('cancel');
    ui.search.placeholder = t('searchPh');
    ui.search.setAttribute('aria-label', t('searchPh'));
    ui.hideDoneText.textContent = t('hideHandled');
    ui.copy.textContent = t('copyUsernames');
    const optKeys = ['filterAll', 'filterOthers', 'filterGained', 'filterLost', 'filterYouFollowed', 'filterYouUnfollowed'];
    ui.filterOpts.forEach((o, i) => { o.textContent = t(optKeys[i]); });
    for (const k of Object.keys(TABS)) ui.tile[k].label.textContent = t(TABS[k].label);
    ui.showProtectedText.textContent = t('showProtected');
    const kindKeys = ['kindAll', 'kindVerified', 'kindNotVerified', 'kindPrivate', 'kindPublic'];
    ui.kindOpts.forEach((o, i) => { o.textContent = t(kindKeys[i]); });
    ui.download.textContent = t('download');
    ui.protAdd.textContent = t('add');
    ui.protImport.textContent = t('importBtn');
    ui.protExport.textContent = t('exportBtn');
    ui.protText.placeholder = t('protectedPlaceholder');
    ui.protHint.textContent = t('protectedHint');
    updateProtectedBtn();
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
    lb.rec = rec; lb.url = rec.pic; lb.hd = false;
    ui.lbImg.src = rec.pic;
    ui.lbName.textContent = '@' + rec.u;
    ui.lbFull.hidden = false;
    ui.lbFull.disabled = false;
    ui.lbFull.textContent = t('lbFull');
    ui.lightbox.hidden = false;
  }
  function closeLightbox() { ui.lightbox.hidden = true; }
  // One profile-info request, the same one the site makes, for the large picture.
  async function loadFullSize() {
    const rec = lb.rec;
    if (!rec) return;
    if (Date.now() < state.cooldownUntil) { toast(t('pillPaused', { t: fmtT(state.cooldownUntil) })); return; }
    ui.lbFull.disabled = true;
    ui.lbFull.textContent = t('pillChecking');
    try {
      const j = await igGet('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(rec.u));
      const u = j && j.data && j.data.user;
      const hd = u && typeof u.profile_pic_url_hd === 'string' ? u.profile_pic_url_hd : (u && typeof u.profile_pic_url === 'string' ? u.profile_pic_url : '');
      if (!hd || !/^https:\/\//.test(hd)) throw new Error('no picture');
      lb.url = hd; lb.hd = true;
      ui.lbImg.src = hd;
      ui.lbFull.hidden = true;
    } catch (e) {
      if (e instanceof RateLimited) { state.cooldownUntil = Date.now() + REL_COOLDOWN_MS; saveUi(); }
      toast(t('lbFullFailed', { r: e && e.message ? e.message : String(e) }));
      ui.lbFull.disabled = false;
      ui.lbFull.textContent = t('lbFull');
    }
  }
  function saveCurrentImage() {
    if (!lb.rec || !lb.url) return;
    saveImage(lb.url, lb.rec.u + (lb.hd ? '-full' : '') + '.jpg');
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
    setTile('notback', num(shown), t('subOfFollowing', { pct: pct(shown, nf) }) + (protectedN ? ' · ' + t('nProtected', { n: num(protectedN) }) : ''));
    setTile('fans', num(L.fans.length), t('subOfFollowers', { pct: pct(L.fans.length, nw) }));
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
    if (state.tab === 'changes') {
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
  function avatarNode(r) {
    if (r.pic) {
      const img = h('img', { class: 'avatar', src: r.pic, alt: '', loading: 'lazy', onclick: () => openLightbox(r) });
      // Instagram's picture links expire after a while; fall back to the first letter.
      img.addEventListener('error', () => img.replaceWith(h('span', { class: 'avatar ph' }, (r.u || '?').charAt(0).toUpperCase())));
      return img;
    }
    return h('span', { class: 'avatar ph' }, (r.u || '?').charAt(0).toUpperCase());
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
      r.name ? h('div', { class: 'name', title: r.name }, r.name) : null));
    if (r.ver) row.append(h('span', { class: 'tag ver' }, t('verifiedTag')));
    if (r.priv) row.append(h('span', { class: 'tag' }, t('privateTag')));
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
      row.append(ub);
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
      row.append(pb);
    }
    if (withCheck) {
      // The lists come from the last check; this asks Instagram about this one account right now.
      const vb = h('button', { class: 'verify', type: 'button', title: t('verifyTitle') }, t('verify'));
      vb.addEventListener('click', () => verifyRow(r, row, vb));
      row.append(vb);
    }
    return row;
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
      if (!chip) { chip = h('span', { class: 'chip live' }); row.append(chip); }
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
    if (state.hideDone) rows = rows.filter((r) => !isDone(r.u));
    if (state.kind !== 'all') rows = rows.filter((r) => matchesKind(r, state.kind));
    return rows.slice().sort((a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : 0));
  }
  function renderProtected() {
    ui.listTitle.textContent = t('protectedTitle');
    const names = Object.keys(state.white).sort();
    ui.protList.replaceChildren();
    for (const u of names) {
      const row = rowNode(lookupRecord(u) || { u, name: '', priv: false, ver: false, pic: '' }, false);
      row.append(h('button', { class: 'verify', type: 'button', onclick: () => { setProtected(u, false); applyTiles(); renderList(); } }, t('remove')));
      ui.protList.append(row);
    }
    ui.protList.hidden = names.length === 0;
    ui.protEmpty.hidden = names.length !== 0;
    ui.protEmpty.textContent = t('protectedEmpty');
  }
  function renderList() {
    for (const el of ui.tiles.children) el.setAttribute('aria-selected', String(el.dataset.tab === state.tab));
    ui.list.replaceChildren();
    if (!state.lists) return;
    const history = state.tab === 'changes', prot = state.tab === 'protected';
    ui.chart.hidden = !history;
    ui.evFilter.hidden = !history;
    ui.hideDoneWrap.hidden = history || prot;
    ui.kindFilter.hidden = history || prot;
    ui.showProtectedWrap.hidden = state.tab !== 'notback';
    ui.prot.hidden = !prot;
    ui.list.hidden = prot;
    ui.empty.hidden = true;
    if (prot) { renderProtected(); return; }
    if (history) { renderHistory(); return; }
    const all = state.lists[state.tab];
    const base = state.tab === 'notback' ? all.filter((r) => !isProtected(r.u)) : all;
    const rows = listRows();
    const handled = all.filter((r) => isDone(r.u)).length;
    const protectedN = all.length - base.length;
    const quota = state.tab === 'notback' ? actionQuota() : null;
    ui.listTitle.textContent = t(TABS[state.tab].title, { n: num(base.length), nRaw: base.length })
      + (rows.length !== base.length ? ' · ' + t('showing', { n: num(rows.length) }) : '')
      + (handled ? ' · ' + t('handled', { n: num(handled) }) : '')
      + (protectedN ? ' · ' + t('nProtected', { n: num(protectedN) }) : '')
      + (quota && state.actions.times.length ? ' · ' + t('unfollowQuota', { h: num(quota.hourLeft), d: num(quota.dayLeft) }) : '');
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
  };
  function filteredEvents() {
    let evs = state.hist && Array.isArray(state.hist.events) ? state.hist.events : [];
    const f = state.evFilter;
    if (f === 'others') evs = evs.filter((e) => e.type === 'gained' || e.type === 'lost');
    else if (f !== 'all') evs = evs.filter((e) => e.type === f);
    return visible(evs);
  }
  function renderHistory() {
    const hist = state.hist && Array.isArray(state.hist.points) ? state.hist : { points: [], events: [] };
    const pts = hist.points;
    ui.chart.replaceChildren(buildChart(pts));
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
      ui.list.append(h('div', { class: 'group' }, fmtDT(g.at) + ' · ' + parts.join(' · ')));
      for (const e of g.events) {
        const row = rowNode({ u: e.u, name: e.name, priv: e.priv }, false);
        row.append(h('span', { class: 'chip ' + EV[e.type].cls }, t(EV[e.type].key)));
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

  async function startCheck() {
    if (state.running) return;
    const uid = cookie('ds_user_id');
    if (uid !== state.uid) await loadAccount(uid);
    if (state.running) return;
    state.running = true;
    state.ctl = { cancelled: false };
    ui.check.disabled = true;
    ui.cancel.hidden = false;
    ui.error.hidden = true;
    showProgress({ phase: 'info' });
    try {
      const snap = await runCheck(state.ctl, showProgress);
      if (state.uid !== uid || snap.uid !== uid) throw new Cancelled(); // the account changed mid-check; never mix results
      state.hist = appendHistory(state.hist, pointFrom(snap), eventsFrom(diff(state.snap, snap), snap.at), HIST_CAPS);
      state.prev = state.snap;
      state.snap = snap;
      await storageSet({ [acctStoreKey(uid)]: { last: snap, prev: state.prev }, [histStoreKey(uid)]: state.hist });
      state.tab = 'notback';
      applySnapshot();
      toast(t('toastChecked', { a: num(snap.following.length), b: num(snap.followers.length) }));
    } catch (e) {
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
    state.snap = null; state.prev = null; state.done = {}; state.white = {}; state.actions = freshActions(); state.lists = null; state.hist = null;
    state.tab = 'notback';
    updateProtectedBtn();
    applySnapshot();
    if (!uid) return;
    const r = await storageGet([acctStoreKey(uid), doneStoreKey(uid), histStoreKey(uid), whiteStoreKey(uid), actStoreKey(uid), 'fbc', 'fbcDone']);
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
    const hist = r[histStoreKey(uid)];
    if (hist && Array.isArray(hist.points) && Array.isArray(hist.events)) {
      state.hist = hist;
    } else if (state.snap) {
      // First run with history: seed it from the two snapshots kept so far, so nothing is lost.
      let seeded = { points: [], events: [] };
      if (state.prev) seeded = appendHistory(seeded, pointFrom(state.prev), [], HIST_CAPS);
      seeded = appendHistory(seeded, pointFrom(state.snap), eventsFrom(diff(state.prev, state.snap), state.snap.at), HIST_CAPS);
      state.hist = seeded;
      storageSet({ [histStoreKey(uid)]: seeded });
    }
    applySnapshot();
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
    if (rel.stale) {
      ui.relText.textContent = t('pillAsOf', { text: t(d.key), when: fmtWhen(rel.stale) });
      if (!note) ui.rel.title = t('pillTitleLast');
    } else {
      ui.relText.textContent = t(d.key);
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
  // Keeps the lists and the history honest after an unfollow, without another full check.
  function recordUnfollow(r) {
    const snap = state.snap;
    if (!snap) return;
    snap.following = snap.following.filter((x) => x.u !== r.u);
    state.hist = appendHistory(state.hist, pointFrom(snap), [{ at: Date.now(), type: 'you_unfollowed', u: r.u, name: r.name || '', priv: !!r.priv }], HIST_CAPS);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist });
    ui.ledger.textContent = t('ledger', { nf: num(snap.following.length), nfRaw: snap.following.length, nw: num(snap.followers.length), nwRaw: snap.followers.length });
    applyTiles();
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
      await unfollowRequest(r);
      state.actions.times.push(Date.now());
      saveActions();
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
