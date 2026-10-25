/* Follow Back Checker 1.2.1. Built from extension/ by scripts/build.js; do not edit by hand. https://github.com/devbn3li/follow-back-checker */
// Panel styles. Injected into a shadow root by content.js, so Instagram's own CSS cannot leak in
// and a strict page CSP cannot block them (they go in through a constructed stylesheet).
var FBC_CSS = `
:host {
  all: initial;
  --bg: #FFFFFF; --bg2: #F3F5F7; --fg: #151D25; --muted: #5A6772; --border: #D8DEE4;
  --accent: #0E7C7B; --accent-ink: #FFFFFF; --accent-soft: #D9EFED;
  --danger: #A33A2A; --danger-soft: #F9E6E2; --shadow: rgba(0, 0, 0, 0.25);
  --good: #1E8E5A; --warn: #B26A00;
  --c1: #0A9A95; --c2: #7A52CC;
  font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--fg);
}
:host([data-theme="dark"]) {
  --bg: #161C22; --bg2: #0E1317; --fg: #E6EBEF; --muted: #94A0AB; --border: #2B353F;
  --accent: #4FC4BE; --accent-ink: #06211F; --accent-soft: #143836;
  --danger: #E9907F; --danger-soft: #3A1F1A; --shadow: rgba(0, 0, 0, 0.6);
  --good: #4CC38A; --warn: #E0A33C;
  --c1: #249C96; --c2: #9C7FE6;
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, select { font: inherit; color: inherit; }

/* Bottom-right stack: the relationship pill (profile pages only) above the Follow check button.
   Sits above Instagram's own Messages tray, which occupies the bottom-right corner. */
.fabwrap { position: fixed; right: 20px; bottom: 96px; z-index: 2147483646; display: grid; justify-items: end; gap: 8px; max-width: min(440px, calc(100vw - 40px)); }
.fabwrap[dir="rtl"] { justify-items: start; }
.fab {
  background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 999px;
  padding: 10px 16px; font-weight: 600; cursor: pointer; box-shadow: 0 6px 20px var(--shadow);
}
.fab:hover { filter: brightness(1.08); }
.rel {
  display: inline-flex; align-items: center; gap: 8px; max-width: 100%; text-align: start;
  background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 999px;
  padding: 7px 12px; font-size: 13px; cursor: pointer; box-shadow: 0 6px 20px var(--shadow);
}
.rel:hover { border-color: var(--accent); }
.rel b { font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-weight: 600; white-space: nowrap; direction: ltr; unicode-bidi: isolate; }
.rel .reltext { color: var(--muted); min-width: 0; overflow-wrap: anywhere; }
.rel.err .reltext { color: var(--danger); }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); flex: none; }
.dot.good { background: var(--good); }
.dot.warn { background: var(--warn); }
.dot.info { background: var(--accent); }
.dot.loading { background: var(--accent); animation: fbc-pulse 1s ease-in-out infinite; }
@keyframes fbc-pulse { 50% { opacity: 0.3; } }

.drawer {
  position: fixed; top: 0; right: 0; height: 100vh; width: 640px; max-width: 100vw; z-index: 2147483647;
  background: var(--bg); color: var(--fg); border-left: 1px solid var(--border);
  box-shadow: -12px 0 40px var(--shadow); display: flex; flex-direction: column;
}
.drawer.dragging { user-select: none; }
/* Left edge: drag to resize, double-click to reset. */
.grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 1; }
.grip:hover, .drawer.dragging .grip { background: var(--accent); opacity: 0.6; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.headl { display: flex; align-items: baseline; gap: 8px; min-width: 0; flex-wrap: wrap; }
.headr { display: flex; align-items: center; gap: 4px; flex: none; }
.title { font-weight: 700; font-size: 16px; }
.me { color: var(--muted); font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13px; direction: ltr; unicode-bidi: isolate; }
.icon { background: none; border: 0; font-size: 22px; line-height: 1; cursor: pointer; color: var(--muted); padding: 4px 8px; border-radius: 6px; }
.icon:hover { background: var(--bg2); color: var(--fg); }
.lang { background: none; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--muted); padding: 4px 8px; cursor: pointer; }
.lang:hover { border-color: var(--accent); color: var(--fg); }

.controls { display: flex; align-items: center; gap: 10px; padding: 12px 16px; flex-wrap: wrap; }
.status { color: var(--muted); font-size: 13px; flex: 1 1 auto; min-width: 0; }
.btn { border: 1px solid var(--border); background: var(--bg); color: var(--fg); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 500; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn.primary:disabled { opacity: 0.6; cursor: progress; }
.btn.small { padding: 5px 10px; font-size: 13px; }

.progress { padding: 0 16px 10px; display: grid; gap: 6px; }
.ptext { font-size: 13px; color: var(--muted); }
.pbar { height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden; }
.pfill { height: 100%; width: 0; background: var(--accent); transition: width 0.3s; }
.error { margin: 0 16px 10px; padding: 10px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13px; }

.body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 16px 16px; display: grid; gap: 12px; align-content: start; }
.ledger { color: var(--muted); font-size: 13px; }
.ledger b { color: var(--fg); font-weight: 600; }

.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.tile { text-align: start; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: grid; gap: 2px; align-content: start; cursor: pointer; min-width: 0; }
.tile:hover { border-color: var(--accent); }
.tile[aria-selected="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.tile .label { font-size: 12px; line-height: 1.25; color: var(--muted); }
.tile[aria-selected="true"] .label { color: var(--accent); font-weight: 600; }
.tile .value { font-size: 24px; font-weight: 600; line-height: 1.15; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }
.tile .value.small { font-size: 15px; line-height: 1.5; }
.tile .sub { font-size: 11px; line-height: 1.3; color: var(--muted); }
.drawer.narrow .tiles { grid-template-columns: repeat(2, 1fr); }

.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.field { flex: 1 1 140px; min-width: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; }
.field.sel { flex: 0 0 auto; width: auto; }
.chk { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; cursor: pointer; }
input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.listtitle { font-weight: 600; font-size: 14px; }

.list { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.list > * + * { border-top: 1px solid var(--border); }
.row { display: flex; gap: 10px; align-items: center; padding: 8px 12px; min-width: 0; }
.row.done { opacity: 0.5; }
.row.done .handle { text-decoration: line-through; }
.who { flex: 1 1 auto; min-width: 0; display: flex; align-items: baseline; gap: 10px; }
.drawer.narrow .who { flex-direction: column; align-items: flex-start; gap: 1px; }
.handle { flex: none; font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13.5px; font-weight: 500; color: var(--fg); text-decoration: none; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }
.handle:hover { color: var(--accent); text-decoration: underline; }
.handle .arrow { color: var(--muted); font-size: 12px; margin-left: 4px; }
.name { flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer.narrow .name { max-width: 100%; }
.tag { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.group { padding: 8px 12px 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg2); }
.chip { flex: none; font-size: 11px; border-radius: 999px; padding: 2px 8px; white-space: nowrap; border: 1px solid var(--border); color: var(--muted); }
.chip.good { color: var(--good); border-color: var(--good); }
.chip.warn { color: var(--warn); border-color: var(--warn); }
.chip.live { color: var(--fg); border-color: var(--accent); }
.verify { flex: none; background: none; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; color: var(--muted); padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.verify:hover { border-color: var(--accent); color: var(--fg); }
.verify:disabled { opacity: 0.6; cursor: progress; }
.notice { padding: 8px 12px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 12.5px; }
.empty { padding: 22px 12px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 10px; }

/* History chart: text in text tokens, series color only on the marks. */
.chart { position: relative; border: 1px solid var(--border); border-radius: 10px; padding: 8px 8px 6px; background: var(--bg); direction: ltr; }
.chart svg { display: block; width: 100%; height: auto; font-family: inherit; }
.chart .grid { stroke: var(--border); stroke-width: 1; }
.chart .ax { font-size: 11px; fill: var(--muted); }
.chart .lbl { font-size: 11px; font-weight: 600; fill: var(--fg); }
.chart .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart path.s1 { stroke: var(--c1); }
.chart path.s2 { stroke: var(--c2); }
.chart circle.s1 { fill: var(--c1); stroke: var(--bg); stroke-width: 2; }
.chart circle.s2 { fill: var(--c2); stroke: var(--bg); stroke-width: 2; }
.chart .cross { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
.cnote { padding: 14px 6px; color: var(--muted); font-size: 13px; text-align: center; }
.ctip { position: absolute; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 12px; line-height: 1.4; box-shadow: 0 6px 20px var(--shadow); pointer-events: none; width: 190px; }
.ctipd { color: var(--muted); margin-bottom: 2px; }
.legend { display: flex; gap: 14px; font-size: 12px; color: var(--muted); padding: 6px 4px 0; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.legend .s1 { background: var(--c1); }
.legend .s2 { background: var(--c2); }

.foot { padding: 10px 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.toast { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); background: var(--fg); color: var(--bg); padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 6px 20px var(--shadow); white-space: nowrap; }
.btn:focus-visible, .tile:focus-visible, .field:focus-visible, .icon:focus-visible, .lang:focus-visible, .handle:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .pfill { transition: none; } .dot.loading { animation: none; } }

/* Phones and the Android app: full-width panel, bigger targets, no resize grip. */
:host(.mobile) .fabwrap { right: 12px; bottom: 76px; max-width: calc(100vw - 24px); }
:host(.mobile) .grip { display: none; }
:host(.mobile) .drawer { width: 100vw; }
:host(.mobile) .btn { padding: 11px 16px; }
:host(.mobile) .btn.small { padding: 8px 12px; }
:host(.mobile) .row { padding: 11px 12px; }
:host(.mobile) input[type="checkbox"] { width: 20px; height: 20px; }
:host(.mobile) .tile { padding: 12px 10px; }
:host(.mobile) .head { padding: 12px 14px; }
:host(.mobile) .controls { padding: 10px 14px; }
:host(.mobile) .body { padding: 4px 12px 16px; }
:host(.mobile) .field { padding: 10px 12px; }
`;

;
// Follow Back Checker: pure logic shared by the extension, the Android app and the tests.
// No DOM, no network, no storage here; everything is a plain function of its inputs.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBC_CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (v) => Number(v || 0).toLocaleString('en-US');
  const plural = (n, w) => (n === 1 ? w : w + 's');
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '0%');

  // One account as Instagram's list endpoints describe it.
  function normalizeUser(u) {
    if (!u || typeof u.username !== 'string') return null;
    const name = u.username.trim().toLowerCase();
    if (!name) return null;
    return {
      u: name,
      id: u.pk != null ? String(u.pk) : u.pk_id != null ? String(u.pk_id) : '',
      name: typeof u.full_name === 'string' ? u.full_name : '',
      priv: !!u.is_private,
    };
  }

  // following and followers are Maps keyed by username.
  function derive(following, followers) {
    const notback = [], fans = [], mutual = [];
    following.forEach((rec, u) => { if (followers.has(u)) mutual.push(rec); else notback.push(rec); });
    followers.forEach((rec, u) => { if (!following.has(u)) fans.push(rec); });
    return { notback, fans, mutual };
  }

  // What changed between two snapshots of the same account.
  function diff(prev, last) {
    if (!prev || !last) return null;
    if (prev.me && last.me && prev.me.toLowerCase() !== last.me.toLowerCase()) return null;
    const names = (rows) => new Set(rows.map((r) => r.u));
    const pf = names(prev.followers), lf = names(last.followers), pg = names(prev.following), lg = names(last.following);
    return {
      since: prev.at,
      gained: last.followers.filter((r) => !pf.has(r.u)),
      lost: prev.followers.filter((r) => !lf.has(r.u)),
      youFollowed: last.following.filter((r) => !pg.has(r.u)),
      youUnfollowed: prev.following.filter((r) => !lg.has(r.u)),
    };
  }

  const isSnap = (s) => !!(s && typeof s.at === 'number' && Array.isArray(s.following) && Array.isArray(s.followers));

  // History: one point per check plus one event per change.
  function pointFrom(snap) {
    const followers = new Set(snap.followers.map((r) => r.u));
    let mutual = 0;
    for (const r of snap.following) if (followers.has(r.u)) mutual++;
    return { at: snap.at, following: snap.following.length, followers: snap.followers.length, mutual, notback: snap.following.length - mutual };
  }
  function eventsFrom(d, at) {
    if (!d) return [];
    const mk = (type, rows) => rows.map((r) => ({ at, type, u: r.u, name: r.name || '', priv: !!r.priv }));
    return [...mk('gained', d.gained), ...mk('lost', d.lost), ...mk('you_followed', d.youFollowed), ...mk('you_unfollowed', d.youUnfollowed)];
  }
  function appendHistory(hist, point, events, caps) {
    const base = hist && Array.isArray(hist.points) && Array.isArray(hist.events) ? hist : { points: [], events: [] };
    const points = base.points.filter((p) => p && typeof p.at === 'number' && p.at !== point.at).concat([point]).sort((a, b) => a.at - b.at);
    const evs = base.events.concat(events).sort((a, b) => a.at - b.at);
    return { points: points.slice(-caps.points), events: evs.slice(-caps.events) };
  }
  function groupEvents(events) {
    const byAt = new Map();
    for (const e of events) { if (!byAt.has(e.at)) byAt.set(e.at, []); byAt.get(e.at).push(e); }
    return [...byAt.entries()].sort((a, b) => b[0] - a[0]).map(([at, list]) => ({
      at, events: list,
      gained: list.filter((e) => e.type === 'gained').length,
      lost: list.filter((e) => e.type === 'lost').length,
      youFollowed: list.filter((e) => e.type === 'you_followed').length,
      youUnfollowed: list.filter((e) => e.type === 'you_unfollowed').length,
    }));
  }

  // Round axis ticks from 0 up to just above max.
  function niceTicks(max, count) {
    if (!(max > 0)) return [0, 1];
    const raw = max / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = 10 * mag;
    for (const k of [1, 2, 2.5, 5, 10]) { if (raw <= k * mag) { step = k * mag; break; } }
    const ticks = [];
    for (let v = 0; v <= Math.ceil(max / step) * step + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return ticks;
  }

  // Which instagram.com paths are a profile page.
  const RESERVED = new Set(['explore', 'reels', 'reel', 'p', 'stories', 'direct', 'accounts', 'tv', 'igtv', 'your_activity', 'emails', 'about', 'legal', 'press', 'developer', 'developers', 'api', 'challenge', 'nametag', 'ar', 'lite', 'terms', 'privacy', 'web', 'session', 'graphql', 'static', 'oauth', 'locations', 'topics', 'guide', 'guides', 'search', 'directory', 'archive', 'settings', 'ads', 'blog', 'nonprofits', 'consent', 'community', 'notifications', 'help', 'download', 'create', 'login', 'logout', 'signup', 'embed', 'fbsearch', 'linkshim', 's', 'share', 'invites', 'tags']);
  function profileUsername(pathname) {
    const seg = String(pathname || '').split('/').filter(Boolean);
    if (!seg.length) return '';
    let first = seg[0];
    try { first = decodeURIComponent(first); } catch (e) { /* keep as is */ }
    first = first.toLowerCase();
    if (RESERVED.has(first) || !/^[a-z0-9._]{1,30}$/.test(first)) return '';
    return first;
  }

  // Only their side of the relationship; the page's own button already shows yours.
  function describeRel(rel) {
    if (rel.followsYou) return { key: 'pillFollows', tone: 'good' };
    if (rel.theyRequested) return { key: 'pillAsked', tone: 'info' };
    return { key: 'pillNot', tone: 'warn' };
  }

  return { num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, RESERVED, profileUsername, describeRel };
});

;
// Follow Back Checker: every string the panel shows, in English and Egyptian Arabic.
// Entries are plain strings with {placeholders}, or functions when grammar needs them.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBC_I18N = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const plural = (n, w) => (n === 1 ? w : w + 's');

  const en = {
    fab: 'Follow check',
    title: 'Follow Back Checker',
    close: 'Close',
    checkNow: 'Check now',
    cancel: 'Cancel',
    langToggle: 'عربي',
    statusNotChecked: 'Not checked yet for this account.',
    statusLogin: 'Log in to Instagram first.',
    emptyClick: 'Click Check now. A couple of thousand accounts take about a minute.',
    emptyLogin: 'Log in to Instagram in this tab and the panel picks up that account.',
    lastCheck: 'Last check {when}',
    ledger: (v) => `You follow ${v.nf} ${plural(v.nfRaw, 'account')}. ${v.nw} ${v.nwRaw === 1 ? 'follows' : 'follow'} you.`,
    tileNotback: 'Don’t follow you back',
    tileFans: 'You don’t follow back',
    tileMutual: 'Follow each other',
    tileHistory: 'History',
    subOfFollowing: '{pct} of following',
    subOfFollowers: '{pct} of followers',
    subHistory: 'followed / unfollowed you, last check',
    subHistoryNone: 'from the second check on',
    titleNotback: (v) => `${v.n} ${plural(v.nRaw, 'account')} you follow that ${v.nRaw === 1 ? 'doesn’t' : 'don’t'} follow you back`,
    titleFans: (v) => `${v.n} ${plural(v.nRaw, 'account')} that ${v.nRaw === 1 ? 'follows' : 'follow'} you without a follow back`,
    titleMutual: (v) => `${v.n} mutual ${plural(v.nRaw, 'follow')}`,
    titleHistory: 'History, check by check',
    emptyNotback: 'Everyone you follow follows you back.',
    emptyFans: 'You follow back every one of your followers.',
    emptyMutual: 'No mutual follows yet.',
    searchPh: 'Search usernames',
    hideHandled: 'Hide handled',
    copyUsernames: 'Copy usernames',
    filterAll: 'All events',
    filterOthers: 'Only their actions',
    filterGained: 'Followed you',
    filterLost: 'Unfollowed you',
    filterYouFollowed: 'You followed',
    filterYouUnfollowed: 'You unfollowed',
    showing: 'showing {n}',
    handled: '{n} handled',
    noMatch: 'No match for “{q}”.',
    allHandled: 'Everything here is handled. Untick “Hide handled” to see the list.',
    histSince: (v) => `Since ${v.date}: ${v.n} ${plural(v.nRaw, 'check')} · +${v.g} followed you · −${v.l} unfollowed you`,
    histGained: '+{n} followed you',
    histLost: '−{n} unfollowed you',
    histYouFollowed: 'you followed {n}',
    histYouUnfollowed: 'you unfollowed {n}',
    evGained: 'followed you',
    evLost: 'unfollowed you',
    evYouFollowed: 'you followed',
    evYouUnfollowed: 'you unfollowed',
    histEmptyFirst: 'Changes are recorded from your second check on. Run Check now again later and they show up here, with the date.',
    histEmptyFilter: 'No events match this filter.',
    histEmptyNone: 'No changes recorded yet.',
    chartOne: 'The chart starts with your second check.',
    chartNone: 'No checks recorded yet.',
    chartFollowers: 'followers',
    chartFollowing: 'following',
    chartTip1: 'followers {a} · following {b}',
    chartTip2: 'not following back {a} · mutual {b}',
    chartAria: 'Followers and following over time',
    progSlow: 'Instagram asked to slow down. Waiting {s}s before retrying…',
    progInfo: 'Checking your account…',
    progFetch: 'Fetching {phase}… {n}{of}',
    progOf: ' of {total}',
    phaseFollowing: 'following',
    phaseFollowers: 'followers',
    errNetwork: 'Network error while talking to Instagram. Check your connection and try again.',
    errSlow: 'Instagram asked to slow down.',
    errRefused: 'Instagram refused the request (HTTP {s}). Log in again, then retry.',
    errLoggedOut: 'Instagram sent a page instead of data. You are probably logged out, or Instagram changed its site.',
    errUnreadable: 'Instagram sent data this tool could not read.',
    errWantsLogin: 'Instagram wants you to log in again ({m}).',
    errHttp: 'Instagram returned HTTP {s}{m}.',
    errSlowTwice: 'Instagram asked to slow down more than once. Wait 15 to 30 minutes, then try again.',
    errLoginTab: 'Log in to Instagram in this tab first, then click Check now.',
    errGeneric: 'Something went wrong.',
    toastCancelled: 'Cancelled',
    toastChecked: 'Checked {a} following and {b} followers',
    toastNothing: 'Nothing to copy',
    toastCopied: (v) => `Copied ${v.n} ${plural(v.nRaw, 'username')}`,
    toastCopyBlocked: 'Copy was blocked by the browser.',
    pillFollows: 'follows you',
    pillAsked: 'asked to follow you',
    pillNot: 'doesn’t follow you',
    pillChecking: 'checking…',
    pillCouldNot: 'could not check',
    pillPaused: 'paused until {t}',
    pillLogin: 'log in to check',
    pillAsOf: '{text} · as of {when}',
    pillTitle: 'Does this profile follow you? Click to check again.',
    pillTitleLive: 'Live answer. Click to check again.',
    pillTitleLast: 'From your last full check. Click to check live now.',
    pillTitleClick: 'Click to check live now.',
    pillSlowNote: 'Instagram asked to slow down. No live checks until {t}.',
    pillFailed: 'Live check failed ({r}).',
    pillRetry: ' Click to try again.',
    footer: 'Your own session, the site’s own requests. Check every few days, not every hour.',
    gripTitle: 'Drag to resize. Double-click to reset.',
    privateTag: 'private',
    markHandled: 'Mark @{u} as handled',
    verify: 'Check live',
    verifyTitle: 'The list is from your last check. Ask Instagram about this account right now.',
    liveChip: 'live: {a} · {b}',
    liveFollowsYou: 'follows you',
    liveNotFollowsYou: 'doesn’t follow you',
    liveTheyRequested: 'asked to follow you',
    liveYouFollow: 'you follow them',
    liveYouNot: 'you don’t follow them',
    liveYouRequested: 'your request is pending',
    liveFailed: 'Could not check: {r}',
    partialWarn: 'Instagram returned {got} of the {total} accounts {what}. Some may be missing from these lists; try Check now again later.',
    partialFollowing: 'you follow',
    partialFollowers: 'following you',
  };

  const ar = {
    fab: 'فحص المتابعين',
    title: 'Follow Back Checker',
    close: 'إغلاق',
    checkNow: 'افحص دلوقتي',
    cancel: 'إلغاء',
    langToggle: 'EN',
    statusNotChecked: 'لسه ماتعملش فحص للحساب ده.',
    statusLogin: 'سجّل دخول إنستجرام الأول.',
    emptyClick: 'دوس "افحص دلوقتي". حساب فيه ألف أو اتنين بياخد حوالي دقيقة.',
    emptyLogin: 'سجّل دخول إنستجرام في التاب ده واللوحة هتتعرف على الحساب.',
    lastCheck: 'آخر فحص {when}',
    ledger: (v) => `بتتابع ${v.nf} حساب. بيتابعك ${v.nw}.`,
    tileNotback: 'مش بيردوا المتابعة',
    tileFans: 'مش بتردلهم المتابعة',
    tileMutual: 'متابعة متبادلة',
    tileHistory: 'السجل',
    subOfFollowing: '{pct} من اللي بتتابعهم',
    subOfFollowers: '{pct} من متابعينك',
    subHistory: 'تابعوك / سابوك في آخر فحص',
    subHistoryNone: 'من تاني فحص',
    titleNotback: (v) => `${v.n} حساب بتتابعه ومش بيتابعك`,
    titleFans: (v) => `${v.n} حساب بيتابعك وإنت مش بتتابعه`,
    titleMutual: (v) => `${v.n} متابعة متبادلة`,
    titleHistory: 'السجل، فحص بفحص',
    emptyNotback: 'كل اللي بتتابعهم بيتابعوك.',
    emptyFans: 'إنت بتتابع كل متابعينك.',
    emptyMutual: 'مفيش متابعة متبادلة لسه.',
    searchPh: 'ابحث باسم المستخدم',
    hideHandled: 'اخفي اللي خلصت منهم',
    copyUsernames: 'انسخ الأسماء',
    filterAll: 'كل الأحداث',
    filterOthers: 'أفعالهم بس',
    filterGained: 'تابعوك',
    filterLost: 'سابوك',
    filterYouFollowed: 'إنت تابعت',
    filterYouUnfollowed: 'إنت سيبت',
    showing: 'ظاهر {n}',
    handled: '{n} خلصت منهم',
    noMatch: 'مفيش نتيجة لـ "{q}".',
    allHandled: 'كل اللي هنا خلصت منهم. شيل علامة "اخفي اللي خلصت منهم" علشان تشوف القائمة.',
    histSince: (v) => `من ${v.date}: ${v.n} فحص · +${v.g} تابعوك · −${v.l} سابوك`,
    histGained: '+{n} تابعوك',
    histLost: '−{n} سابوك',
    histYouFollowed: 'إنت تابعت {n}',
    histYouUnfollowed: 'إنت سيبت {n}',
    evGained: 'تابعك',
    evLost: 'سابك',
    evYouFollowed: 'إنت تابعته',
    evYouUnfollowed: 'إنت سيبته',
    histEmptyFirst: 'التغييرات بتتسجل من تاني فحص. اعمل فحص تاني بعدين وهتلاقيها هنا بالتاريخ.',
    histEmptyFilter: 'مفيش أحداث مطابقة للفلتر ده.',
    histEmptyNone: 'مفيش تغييرات متسجلة لسه.',
    chartOne: 'الرسم بيبدأ من تاني فحص.',
    chartNone: 'مفيش فحوصات متسجلة لسه.',
    chartFollowers: 'متابعينك',
    chartFollowing: 'بتتابعهم',
    chartTip1: 'متابعينك {a} · بتتابعهم {b}',
    chartTip2: 'مش بيردوا {a} · متبادل {b}',
    chartAria: 'المتابعين والمتابَعين مع الوقت',
    progSlow: 'إنستجرام طلب نهدّي. مستنيين {s} ثانية قبل المحاولة تاني…',
    progInfo: 'بنتأكد من حسابك…',
    progFetch: 'بنجيب {phase}… {n}{of}',
    progOf: ' من {total}',
    phaseFollowing: 'اللي بتتابعهم',
    phaseFollowers: 'متابعينك',
    errNetwork: 'مشكلة في الاتصال بإنستجرام. اتأكد من النت وجرب تاني.',
    errSlow: 'إنستجرام طلب نهدّي.',
    errRefused: 'إنستجرام رفض الطلب (HTTP {s}). سجّل دخول تاني وجرب.',
    errLoggedOut: 'إنستجرام بعت صفحة بدل البيانات. غالباً إنت مش مسجل دخول، أو الموقع اتغير.',
    errUnreadable: 'إنستجرام بعت بيانات مش مفهومة.',
    errWantsLogin: 'إنستجرام عايزك تسجل دخول تاني ({m}).',
    errHttp: 'إنستجرام رد بـ HTTP {s}{m}.',
    errSlowTwice: 'إنستجرام طلب نهدّي أكتر من مرة. استنى من ربع لنص ساعة وجرب تاني.',
    errLoginTab: 'سجّل دخول إنستجرام في التاب ده الأول، وبعدين دوس "افحص دلوقتي".',
    errGeneric: 'حصلت مشكلة.',
    toastCancelled: 'اتلغى',
    toastChecked: 'اتفحص {a} بتتابعهم و{b} متابعين',
    toastNothing: 'مفيش حاجة تتنسخ',
    toastCopied: (v) => `اتنسخ ${v.n} اسم`,
    toastCopyBlocked: 'المتصفح منع النسخ.',
    pillFollows: 'بيتابعك',
    pillAsked: 'طلب يتابعك',
    pillNot: 'مش بيتابعك',
    pillChecking: 'بنتأكد…',
    pillCouldNot: 'مقدرناش نتأكد',
    pillPaused: 'متوقف لحد {t}',
    pillLogin: 'سجّل دخول علشان نتأكد',
    pillAsOf: '{text} · من فحص {when}',
    pillTitle: 'الحساب ده بيتابعك؟ دوس علشان تتأكد تاني.',
    pillTitleLive: 'إجابة لحظية. دوس علشان تتأكد تاني.',
    pillTitleLast: 'من آخر فحص كامل. دوس علشان تتأكد لحظياً.',
    pillTitleClick: 'دوس علشان تتأكد لحظياً.',
    pillSlowNote: 'إنستجرام طلب نهدّي. مفيش فحص لحظي لحد {t}.',
    pillFailed: 'الفحص اللحظي فشل ({r}).',
    pillRetry: ' دوس علشان تجرب تاني.',
    footer: 'جلستك إنت، وطلبات الموقع نفسه. افحص كل كام يوم، مش كل ساعة.',
    gripTitle: 'اسحب علشان تغير العرض. دبل كليك يرجّع الافتراضي.',
    privateTag: 'خاص',
    markHandled: 'علّم @{u} كمخلص منه',
    verify: 'تأكد دلوقتي',
    verifyTitle: 'القائمة من آخر فحص. اسأل إنستجرام عن الحساب ده دلوقتي.',
    liveChip: 'لحظي: {a} · {b}',
    liveFollowsYou: 'بيتابعك',
    liveNotFollowsYou: 'مش بيتابعك',
    liveTheyRequested: 'طلب يتابعك',
    liveYouFollow: 'إنت بتتابعه',
    liveYouNot: 'إنت مش بتتابعه',
    liveYouRequested: 'طلبك لسه معلق',
    liveFailed: 'مقدرناش نتأكد: {r}',
    partialWarn: 'إنستجرام رجّع {got} من {total} حساب {what}. ممكن يكون فيه حسابات ناقصة في القوائم دي، جرب الفحص تاني بعدين.',
    partialFollowing: 'بتتابعهم',
    partialFollowers: 'بيتابعوك',
  };

  return { en, ar };
});

;
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
  const { num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, profileUsername, describeRel } = CORE;
  const CSS = typeof FBC_CSS === 'string' ? FBC_CSS : '';
  const HOST = typeof window.FBC_HOST === 'string' ? window.FBC_HOST : 'extension';
  const MOBILE = HOST === 'android' || (window.innerWidth < 700 && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

  // Instagram web internals. If Instagram changes its site, these are the lines to revisit.
  const API = {
    appId: '936619743392459',
    asbdId: '129477',
    pageSize: 200,
    info: (id) => `/api/v1/users/${id}/info/`,
    following: (id, maxId, count) => `/api/v1/friendships/${id}/following/?count=${count || API.pageSize}` + (maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''),
    followers: (id, maxId, count) => `/api/v1/friendships/${id}/followers/?count=${count || API.pageSize}&search_surface=follow_list_page` + (maxId ? `&max_id=${encodeURIComponent(maxId)}` : ''),
  };
  // Pause between page requests, and the back-off when Instagram answers "wait a few minutes".
  const PACE = { minDelayMs: 1200, jitterMs: 1600, rateLimitWaitMs: 90000, rateLimitRetries: 2 };

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
  async function fetchList(kind, userId, onProgress, ctl, pageSize) {
    const out = new Map();
    let maxId = '', retries = 0;
    for (;;) {
      if (ctl.cancelled) throw new Cancelled();
      let j;
      try { j = await igGet(API[kind](userId, maxId, pageSize)); }
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
        if (rec && !out.has(rec.u)) out.set(rec.u, rec);
      }
      onProgress(out.size, null);
      maxId = j.next_max_id != null && j.next_max_id !== '' ? String(j.next_max_id) : '';
      if (!maxId || users.length === 0) break;
      await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
    }
    return out;
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
    // Instagram sometimes hands back fewer accounts than it says you have. When that happens the list
    // is fetched once more in smaller pages and merged, and whatever is still missing is reported on the panel.
    const short = (got, total) => typeof total === 'number' && got < total - Math.max(2, Math.ceil(total * 0.02));
    const fetchComplete = async (kind, total) => {
      const report = (n, wait) => prog({ phase: kind, n, total, wait });
      const list = await fetchList(kind, userId, report, ctl);
      if (short(list.size, total)) {
        await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
        const again = await fetchList(kind, userId, report, ctl, 50);
        again.forEach((rec, u) => { if (!list.has(u)) list.set(u, rec); });
      }
      return list;
    };
    await sleep(PACE.minDelayMs, ctl);
    const following = await fetchComplete('following', totals.following);
    await sleep(PACE.minDelayMs + Math.random() * PACE.jitterMs, ctl);
    const followers = await fetchComplete('followers', totals.followers);
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
  const state = { uid: '', snap: null, prev: null, done: {}, lists: null, hist: null, evFilter: 'all', tab: 'notback', q: '', hideDone: false, running: false, ctl: null, open: false, width: 640, cooldownUntil: 0 };
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
    ui.filterOpts = ['all', 'others', 'gained', 'lost', 'you_followed', 'you_unfollowed'].map((v) => h('option', { value: v }));
    ui.evFilter = h('select', { class: 'field sel', hidden: true, onchange: () => { state.evFilter = ui.evFilter.value; renderList(); } }, ui.filterOpts);
    ui.copy = h('button', { class: 'btn small', type: 'button', onclick: () => copyList() });
    ui.toolbar = h('div', { class: 'toolbar' }, ui.search, ui.hideDoneWrap, ui.evFilter, ui.copy);
    ui.listTitle = h('div', { class: 'listtitle' });
    ui.chart = h('div', { class: 'charthost', hidden: true });
    ui.list = h('div', { class: 'list' });
    ui.empty = h('div', { class: 'empty', hidden: true });
    ui.notice = h('div', { class: 'notice', hidden: true });
    ui.results = h('div', { class: 'results', hidden: true }, ui.ledger, ui.notice, ui.tiles, ui.toolbar, ui.listTitle, ui.chart, ui.list);
    ui.toast = h('div', { class: 'toast', role: 'status', hidden: true });
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
    );
    root.append(ui.fabwrap, ui.drawer);
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
    ui.foot.textContent = t('footer');
    ui.grip.title = t('gripTitle');
    ui.rel.title = t('pillTitle');
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
    else if (p.phase === 'info') text = t('progInfo');
    else text = t('progFetch', { phase: t(p.phase === 'followers' ? 'phaseFollowers' : 'phaseFollowing'), n: num(p.n), of: p.total ? t('progOf', { total: num(p.total) }) : '' });
    ui.ptext.textContent = text;
    const frac = p.total ? Math.min(1, (p.n || 0) / p.total) : 0;
    const base = p.phase === 'followers' ? 0.5 : 0;
    ui.pfill.style.width = Math.round((p.phase === 'info' ? 0.02 : base + frac * 0.5) * 100) + '%';
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
    const L = state.lists;
    setTile('notback', num(L.notback.length), t('subOfFollowing', { pct: pct(L.notback.length, nf) }));
    setTile('fans', num(L.fans.length), t('subOfFollowers', { pct: pct(L.fans.length, nw) }));
    setTile('mutual', num(L.mutual.length), t('subOfFollowing', { pct: pct(L.mutual.length, nf) }));
    const pts = state.hist && Array.isArray(state.hist.points) ? state.hist.points : [];
    const lastAt = pts.length ? pts[pts.length - 1].at : 0;
    const g = groupEvents(state.hist && Array.isArray(state.hist.events) ? state.hist.events : []).find((x) => x.at === lastAt);
    if (pts.length >= 2) setTile('changes', `+${num(g ? g.gained : 0)} / −${num(g ? g.lost : 0)}`, t('subHistory'), true);
    else setTile('changes', '—', t('subHistoryNone'));
    renderList();
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
    row.append(h('div', { class: 'who' },
      h('a', { class: 'handle', href: 'https://www.instagram.com/' + encodeURIComponent(r.u) + '/', target: '_blank', rel: 'noopener noreferrer' }, '@' + r.u, h('span', { class: 'arrow' }, '↗')),
      r.name ? h('div', { class: 'name', title: r.name }, r.name) : null));
    if (r.priv) row.append(h('span', { class: 'tag' }, t('privateTag')));
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
  function renderList() {
    for (const el of ui.tiles.children) el.setAttribute('aria-selected', String(el.dataset.tab === state.tab));
    ui.list.replaceChildren();
    if (!state.lists) return;
    const history = state.tab === 'changes';
    ui.chart.hidden = !history;
    ui.evFilter.hidden = !history;
    ui.hideDoneWrap.hidden = history;
    if (history) { renderHistory(); return; }
    const all = state.lists[state.tab];
    let rows = visible(all);
    if (state.hideDone) rows = rows.filter((r) => !isDone(r.u));
    rows = rows.slice().sort((a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : 0));
    const handled = all.filter((r) => isDone(r.u)).length;
    ui.listTitle.textContent = t(TABS[state.tab].title, { n: num(all.length), nRaw: all.length })
      + (rows.length !== all.length ? ' · ' + t('showing', { n: num(rows.length) }) : '')
      + (handled ? ' · ' + t('handled', { n: num(handled) }) : '');
    for (const r of rows) ui.list.append(rowNode(r, true));
    ui.list.hidden = rows.length === 0;
    ui.empty.hidden = rows.length !== 0;
    if (!rows.length) {
      ui.empty.textContent = all.length === 0 ? t(TABS[state.tab].empty)
        : state.q.trim() ? t('noMatch', { q: state.q.trim() })
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
    let rows = visible(state.lists[state.tab]);
    if (state.hideDone) rows = rows.filter((r) => !isDone(r.u));
    return rows.map((r) => r.u).sort();
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
    state.snap = null; state.prev = null; state.done = {}; state.lists = null; state.hist = null;
    state.tab = 'notback';
    applySnapshot();
    if (!uid) return;
    const r = await storageGet([acctStoreKey(uid), doneStoreKey(uid), histStoreKey(uid), 'fbc', 'fbcDone']);
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
    const st = await igGet('/api/v1/friendships/show/' + encodeURIComponent(id) + '/');
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
  function watchProfile() {
    const path = location.pathname;
    if (path === relPath) return;
    relPath = path;
    clearTimeout(relTimer);
    const username = profileUsername(path);
    if (!username) { relUser = ''; relSeq++; ui.rel.hidden = true; return; }
    relTimer = setTimeout(() => showRelFor(username), 600);
  }

  // --- boot
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open) toggle(false); }, true);
})();
