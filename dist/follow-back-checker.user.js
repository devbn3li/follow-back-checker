// ==UserScript==
// @name         Follow Back Checker
// @namespace    https://github.com/devbn3li/follow-back-checker
// @version      1.10.1
// @description  Who you follow that does not follow you back, from your own logged-in instagram.com session. Nothing leaves the browser.
// @author       devbn3li
// @match        https://www.instagram.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/devbn3li/follow-back-checker/main/dist/follow-back-checker.user.js
// @downloadURL  https://raw.githubusercontent.com/devbn3li/follow-back-checker/main/dist/follow-back-checker.user.js
// ==/UserScript==

/* Follow Back Checker 1.10.1. Built from extension/ by scripts/build.js; do not edit by hand. https://github.com/devbn3li/follow-back-checker */
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
.row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 8px 12px; min-width: 0; }
.row.done { opacity: 0.5; }
.row.done .handle { text-decoration: line-through; }
.who { flex: 1 1 160px; min-width: 140px; display: grid; gap: 1px; align-content: center; }
.handle { flex: none; font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13.5px; font-weight: 500; color: var(--fg); text-decoration: none; overflow-wrap: anywhere; direction: ltr; unicode-bidi: isolate; }
.handle:hover { color: var(--accent); text-decoration: underline; }
.handle .arrow { color: var(--muted); font-size: 12px; margin-left: 4px; }
.name { min-width: 0; max-width: 100%; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.group { padding: 8px 12px 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg2); }
.chip { flex: none; font-size: 11px; border-radius: 999px; padding: 2px 8px; white-space: nowrap; border: 1px solid var(--border); color: var(--muted); }
.chip.good { color: var(--good); border-color: var(--good); }
.chip.warn { color: var(--warn); border-color: var(--warn); }
.chip.live { color: var(--fg); border-color: var(--accent); }
.avatar { flex: none; width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--bg2); cursor: zoom-in; }
.avatar.ph { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: var(--muted); cursor: default; }
.lightbox { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, 0.75); display: grid; place-items: center; padding: 16px; }
.lbbox { display: grid; justify-items: center; gap: 10px; max-width: 100%; }
.lbimg { max-width: min(90vw, 480px); max-height: 70vh; border-radius: 12px; background: var(--bg2); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); }
.lbname { color: #FFFFFF; font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 14px; direction: ltr; }
.lbbar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.lightbox .btn { background: var(--bg); color: var(--fg); }
.lightbox .btn.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.lightbox .btn:disabled { opacity: 0.6; cursor: progress; }
.tag.ver { color: var(--accent); border-color: var(--accent); }
.protect { flex: none; background: none; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; color: var(--muted); padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.protect:hover { border-color: var(--accent); color: var(--fg); }
.protect.on { background: var(--accent-soft); border-color: var(--accent); color: var(--fg); }
.unf { flex: none; background: none; border: 1px solid var(--danger); border-radius: 6px; font-size: 11px; color: var(--danger); padding: 2px 7px; cursor: pointer; white-space: nowrap; }
.unf:hover { background: var(--danger-soft); }
.unf.arm { background: var(--danger); color: var(--bg); }
.unf:disabled { opacity: 0.6; cursor: progress; }
.unf.follow { border-color: var(--accent); color: var(--accent); }
.unf.follow:hover { background: var(--accent-soft); }
.unf.follow.arm { background: var(--accent); color: var(--accent-ink); }
.unf.undo { border-color: var(--border); color: var(--fg); }
.unf.undo:hover { background: var(--accent-soft); border-color: var(--accent); }
.unf.undo.arm { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.chip.muted { opacity: 0.7; }
.chip.cnt { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.modal { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.45); display: grid; place-items: center; z-index: 5; padding: 16px; }
.modal .box { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; max-width: 380px; display: grid; gap: 10px; box-shadow: 0 12px 40px var(--shadow); }
.mtitle { font-weight: 700; font-size: 15px; }
.mtext { font-size: 13.5px; line-height: 1.5; }
.prot { display: grid; gap: 10px; }
.hint { font-size: 12.5px; color: var(--muted); }
.field.area { width: 100%; min-height: 64px; resize: vertical; font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; font-size: 13px; direction: ltr; }
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
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.drawer.narrow .stats { grid-template-columns: repeat(2, 1fr); }
.stat { border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: grid; gap: 2px; align-content: start; min-width: 0; }
.stat .value { font-size: 22px; font-weight: 600; line-height: 1.15; direction: ltr; unicode-bidi: isolate; overflow-wrap: anywhere; }
.stat .label { font-size: 11.5px; line-height: 1.3; color: var(--muted); }
.lbopt { color: #FFFFFF; font-size: 13px; display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
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
:host(.mobile) .row { padding: 11px 12px; flex-wrap: wrap; }
:host(.mobile) .who { flex-basis: 55%; }
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
  const USERNAME = /^[a-z0-9._]{1,30}$/;

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
      ver: !!u.is_verified,
      pic: typeof u.profile_pic_url === 'string' && /^https:\/\//.test(u.profile_pic_url) ? u.profile_pic_url : '',
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
    // An account that was in both of your lists and is now in neither did not unfollow you while you
    // unfollowed it in the same breath: it deactivated (or was removed). The mirror image is one that
    // shows up in both lists at once, which is a deactivated account coming back or a brand-new mutual.
    const goneNames = new Set(prev.following.filter((r) => pf.has(r.u) && !lg.has(r.u) && !lf.has(r.u)).map((r) => r.u));
    const backNames = new Set(last.following.filter((r) => lf.has(r.u) && !pg.has(r.u) && !pf.has(r.u)).map((r) => r.u));
    return {
      since: prev.at,
      gained: last.followers.filter((r) => !pf.has(r.u) && !backNames.has(r.u)),
      lost: prev.followers.filter((r) => !lf.has(r.u) && !goneNames.has(r.u)),
      youFollowed: last.following.filter((r) => !pg.has(r.u) && !backNames.has(r.u)),
      youUnfollowed: prev.following.filter((r) => !lg.has(r.u) && !goneNames.has(r.u)),
      gone: prev.following.filter((r) => goneNames.has(r.u)),
      back: last.following.filter((r) => backNames.has(r.u)),
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
  // priorGone: usernames whose account is currently recorded as deactivated (see goneSet). An account
  // that comes back to both lists is 'reactivated' when we saw it go; otherwise it is a new mutual follow.
  function eventsFrom(d, at, priorGone) {
    if (!d) return [];
    const gone = priorGone || new Set();
    const mk = (type, rows) => (rows || []).map((r) => ({ at, type, u: r.u, name: r.name || '', priv: !!r.priv }));
    const back = d.back || [];
    const returned = back.filter((r) => gone.has(r.u));
    const fresh = back.filter((r) => !gone.has(r.u));
    return [
      ...mk('gained', d.gained), ...mk('lost', d.lost),
      ...mk('you_followed', d.youFollowed), ...mk('you_unfollowed', d.youUnfollowed),
      ...mk('deactivated', d.gone), ...mk('reactivated', returned),
      ...mk('gained', fresh), ...mk('you_followed', fresh),
    ];
  }
  // Well-formed events, oldest first. Stored histories are trusted, but a damaged entry must not break a load.
  function validEvents(events) {
    return (Array.isArray(events) ? events : []).filter((e) => e && typeof e.u === 'string' && typeof e.at === 'number').sort((a, b) => a.at - b.at);
  }
  // Usernames whose latest deactivated/reactivated event says they are away right now.
  function goneSet(events) {
    const state = new Map();
    for (const e of validEvents(events)) {
      if (e.type === 'deactivated') state.set(e.u, true);
      else if (e.type === 'reactivated' || e.type === 'gained' || e.type === 'you_followed') state.set(e.u, false);
    }
    return new Set([...state.entries()].filter(([, away]) => away).map(([u]) => u));
  }
  // Accounts that deactivated and came back: username -> { goneAt, backAt } of the latest such pair.
  function reactivations(events) {
    const away = new Map(), out = new Map();
    for (const e of validEvents(events)) {
      if (e.type === 'deactivated') { away.set(e.u, e.at); out.delete(e.u); }
      else if (e.type === 'reactivated' && away.has(e.u)) { out.set(e.u, { goneAt: away.get(e.u), backAt: e.at }); away.delete(e.u); }
    }
    return out;
  }
  // Histories recorded before deactivations were understood hold a 'lost' and a 'you_unfollowed' for
  // the same account at the same check (and later a 'gained' plus 'you_followed'). Fold those pairs
  // into 'deactivated' / 'reactivated'. Idempotent; returns the same array when nothing changes.
  function reclassifyEvents(events) {
    const list = validEvents(events); // a damaged entry is dropped, which counts as a change
    const key = (e) => e.at + '\u0000' + e.u;
    const types = new Map();
    for (const e of list) {
      const k = key(e);
      if (!types.has(k)) types.set(k, new Set());
      types.get(k).add(e.type);
    }
    const isGone = (e) => { const s = types.get(key(e)); return s && s.has('lost') && s.has('you_unfollowed'); };
    const isBack = (e) => { const s = types.get(key(e)); return s && s.has('gained') && s.has('you_followed'); };
    let changed = list.length !== (Array.isArray(events) ? events.length : 0);
    const out = [];
    const away = new Set();
    const folded = new Set(); // at+user pairs already turned into a reactivation, so the twin is dropped too
    for (const e of list) {
      if (e.type === 'deactivated') { away.add(e.u); out.push(e); continue; }
      if (e.type === 'reactivated') { away.delete(e.u); out.push(e); continue; }
      if ((e.type === 'lost' || e.type === 'you_unfollowed') && isGone(e)) {
        changed = true;
        if (e.type === 'lost') { out.push(Object.assign({}, e, { type: 'deactivated' })); away.add(e.u); }
        continue; // the you_unfollowed twin is dropped
      }
      if ((e.type === 'gained' || e.type === 'you_followed') && isBack(e) && (away.has(e.u) || folded.has(key(e)))) {
        changed = true;
        folded.add(key(e));
        if (e.type === 'gained') { out.push(Object.assign({}, e, { type: 'reactivated' })); away.delete(e.u); }
        continue; // the you_followed twin is dropped
      }
      if (e.type === 'gained' || e.type === 'you_followed') away.delete(e.u);
      out.push(e);
    }
    return changed ? out : events;
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
      deactivated: list.filter((e) => e.type === 'deactivated').length,
      reactivated: list.filter((e) => e.type === 'reactivated').length,
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
    if (RESERVED.has(first) || !USERNAME.test(first)) return '';
    return first;
  }

  // Only their side of the relationship; the page's own button already shows yours.
  function describeRel(rel) {
    if (rel.followsYou) return { key: 'pillFollows', tone: 'good' };
    if (rel.theyRequested) return { key: 'pillAsked', tone: 'info' };
    return { key: 'pillNot', tone: 'warn' };
  }

  // Usernames out of pasted text or an imported file: plain lists (any separators, with or
  // without @), a JSON array of names or of objects with a username, or an object holding such
  // an array under any key. Lowercased, validated, deduplicated, in first-seen order.
  function parseUsernames(input) {
    const out = [];
    const seen = new Set();
    const push = (v) => {
      if (typeof v !== 'string') return;
      const u = v.trim().replace(/^@/, '').toLowerCase();
      if (USERNAME.test(u) && !seen.has(u)) { seen.add(u); out.push(u); }
    };
    const walk = (v, depth) => {
      if (depth > 4 || v == null) return;
      if (typeof v === 'string') { push(v); return; }
      if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
      if (typeof v === 'object') {
        if (typeof v.username === 'string') { push(v.username); return; }
        if (typeof v.u === 'string') { push(v.u); return; }
        Object.values(v).forEach((x) => walk(x, depth + 1));
      }
    };
    const text = String(input || '');
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try { walk(JSON.parse(trimmed), 0); return out; } catch (e) { /* not JSON after all */ }
    }
    for (const token of text.split(/[\s,;]+/)) push(token);
    return out;
  }

  // Rows of cells to CSV text (RFC 4180 quoting, CRLF lines).
  function toCsv(rows) {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return rows.map((cells) => cells.map(esc).join(',')).join('\r\n');
  }

  // Account filters for the lists.
  function matchesKind(rec, kind) {
    switch (kind) {
      case 'verified': return !!rec.ver;
      case 'notVerified': return !rec.ver;
      case 'private': return !!rec.priv;
      case 'public': return !rec.priv;
      default: return true;
    }
  }

  // The session tokens instagram.com sends with its own GraphQL writes, read from the page HTML.
  function tokensFromHtml(html) {
    const s = String(html || '');
    const dtsg = (/"DTSGInitialData",\[\],\{"token":"([^"]+)"/.exec(s) || /"dtsg":\{"token":"([^"]+)"/.exec(s) || [])[1];
    const lsd = (/"LSD",\[\],\{"token":"([^"]+)"/.exec(s) || [])[1];
    if (!dtsg || !lsd) return null;
    const revision = (/"client_revision":(\d+)/.exec(s) || [])[1] || '';
    return { fbDtsg: dtsg, lsd, revision };
  }
  // Instagram's checksum of fb_dtsg: "2" followed by the sum of its character codes.
  function jazoest(fbDtsg) {
    let sum = 0;
    for (let i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
    return '2' + sum;
  }
  // How Instagram answered a write (an unfollow): 'blocked' means it refused and we must pause,
  // 'ok' means it accepted (still to be verified), 'failed' covers missing routes, HTML pages and errors.
  function judgeAction(status, data) {
    const obj = data && typeof data === 'object' ? data : null;
    const errorText = obj ? JSON.stringify(obj.errors || obj.error || '') + ' ' + (obj.message || '') + ' ' + (obj.errorSummary || '') : '';
    if (status === 429 || (obj && obj.spam === true) || /feedback_required|checkpoint|action_blocked|try again later|rate limit/i.test(errorText)) return 'blocked';
    if (status >= 200 && status < 300 && obj && !obj.errors && !obj.error && obj.status !== 'fail' && (obj.status === 'ok' || obj.data)) return 'ok';
    return 'failed';
  }
  // The "following" flag inside any answer shape (a REST friendship_status or a GraphQL payload).
  function findFollowing(node, depth) {
    const d = depth || 0;
    if (!node || typeof node !== 'object' || d > 6) return null;
    if (typeof node.following === 'boolean' && ('followed_by' in node || 'outgoing_request' in node || 'is_private' in node || 'incoming_request' in node)) return node.following;
    for (const v of Object.values(node)) { const r = findFollowing(v, d + 1); if (r !== null) return r; }
    return null;
  }

  // Accounts you unfollowed and later followed again: username -> { unfollowedAt, followedAt } of the
  // latest such pair, from the history events (which cover both the panel's actions and what a check noticed).
  function loopsFrom(events) {
    const sorted = (events || []).filter((e) => e && typeof e.u === 'string' && typeof e.at === 'number').slice().sort((a, b) => a.at - b.at);
    const lastUnfollow = new Map(), out = new Map();
    for (const e of sorted) {
      if (e.type === 'you_unfollowed') { lastUnfollow.set(e.u, e.at); out.delete(e.u); }
      else if (e.type === 'you_followed' && lastUnfollow.has(e.u)) { out.set(e.u, { unfollowedAt: lastUnfollow.get(e.u), followedAt: e.at }); lastUnfollow.delete(e.u); }
    }
    return out;
  }
  // Who unfollowed you and when (the latest time), from the history events.
  function lostSince(events) {
    const m = new Map();
    for (const e of events || []) {
      if (!e || e.type !== 'lost' || typeof e.u !== 'string' || typeof e.at !== 'number') continue;
      const prev = m.get(e.u);
      if (prev == null || e.at > prev) m.set(e.u, e.at);
    }
    return m;
  }
  // Accounts you still follow although they unfollowed you, newest departure first.
  function whoLeft(notback, lost) {
    return (notback || []).filter((r) => lost.has(r.u)).map((r) => Object.assign({}, r, { leftAt: lost.get(r.u) })).sort((a, b) => b.leftAt - a.leftAt);
  }
  // Numbers for the stats strip: follow-back rate, change over the last week, best and worst check.
  function computeStats(points, now) {
    const pts = (points || []).filter((p) => p && typeof p.at === 'number').slice().sort((a, b) => a.at - b.at);
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    const rate = last.following ? Math.round((100 * last.mutual) / last.following) : 0;
    const weekAgo = now - 7 * 86400000;
    let ref = null;
    for (const p of pts) if (p.at <= weekAgo) ref = p; // the newest check that is at least a week old
    if (!ref && pts.length > 1) ref = pts[0];          // short history: compare with the first check
    const week = ref && ref !== last ? { followers: last.followers - ref.followers, following: last.following - ref.following, since: ref.at } : null;
    let best = null, worst = null;
    for (let i = 1; i < pts.length; i++) {
      const delta = pts[i].followers - pts[i - 1].followers;
      if (!best || delta > best.delta) best = { at: pts[i].at, delta };
      if (!worst || delta < worst.delta) worst = { at: pts[i].at, delta };
    }
    return { rate, week, best, worst, checks: pts.length, first: pts[0].at, last: last.at };
  }

  // The logged-in username for a new check: its own, else the one an earlier check of the same account recorded.
  function carryMe(snap, prev) {
    if (snap && typeof snap.me === 'string' && snap.me) return snap.me;
    if (snap && prev && prev.uid && prev.uid === snap.uid && typeof prev.me === 'string') return prev.me;
    return '';
  }

  // What a friendships/show answer says about an action that is about to run. 'go' means do it;
  // anything else is a reason to stop, and 'unknown' means the answer could not be read.
  function preCheck(kind, st) {
    const known = st && typeof st === 'object' && (typeof st.following === 'boolean' || typeof st.followed_by === 'boolean');
    if (!known) return 'unknown';
    if (kind === 'unfollow') {
      if (st.followed_by === true) return 'follows_you';
      if (st.following === false) return 'not_following';
      return st.following === true ? 'go' : 'unknown';
    }
    if (kind === 'follow') {
      if (st.followed_by === false) return 'left';
      if (st.following === true) return 'already';
      if (st.outgoing_request === true) return 'requested';
      return 'go';
    }
    if (kind === 'cancel') {
      if (st.following === true) return 'accepted';
      if (st.outgoing_request === true) return 'go';
      return st.outgoing_request === false ? 'gone' : 'unknown';
    }
    return 'unknown';
  }

  // The log of actions taken from the tool: newest last, capped.
  const UNDO = { unfollow: 'follow', follow: 'unfollow', request: 'cancel', cancel: 'follow' };
  function appendLog(log, entry, cap) {
    const base = Array.isArray(log) ? log.filter((e) => e && typeof e.at === 'number' && typeof e.u === 'string') : [];
    return base.concat([entry]).slice(-(cap || 500));
  }
  function markUndone(log, at, u, when) {
    return (log || []).map((e) => (e && e.at === at && e.u === u ? Object.assign({}, e, { undone: when }) : e));
  }

  // Follow requests you sent, out of Instagram's export (pending_follow_requests.json or its HTML
  // page) or any list of usernames. Each row: { u, ts } with ts in ms or null.
  function parsePending(input) {
    const text = String(input || '');
    const trimmed = text.trim();
    const out = [];
    const seen = new Set();
    const push = (u, ts) => {
      const name = String(u || '').trim().replace(/^@/, '').toLowerCase();
      if (!USERNAME.test(name) || seen.has(name)) return;
      seen.add(name);
      out.push({ u: name, ts: typeof ts === 'number' && ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : null });
    };
    const walk = (v, depth) => {
      if (depth > 5 || v == null) return;
      if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
      if (typeof v !== 'object') return;
      if (Array.isArray(v.string_list_data)) { for (const d of v.string_list_data) if (d && typeof d.value === 'string') push(d.value, d.timestamp); return; }
      if (typeof v.username === 'string') { push(v.username, v.timestamp); return; }
      if (typeof v.u === 'string') { push(v.u, v.ts); return; }
      Object.values(v).forEach((x) => walk(x, depth + 1));
    };
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try { walk(JSON.parse(trimmed), 0); return out; } catch (e) { /* not JSON after all */ }
    }
    if (/<\s*(html|div|a)\b/i.test(trimmed)) {
      // The HTML export: one link per account, the date in the text that follows it.
      const re = /instagram\.com\/([A-Za-z0-9._]{1,30})\/?["'][^>]*>[^<]*<\/a>([\s\S]{0,200}?)(?=<a |$)/g;
      let m;
      while ((m = re.exec(trimmed))) {
        const plain = m[2].replace(/<[^>]+>/g, ' ');
        const found = plain.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}[^,]*(?:,[^,]*)?/);
        const date = found ? Date.parse(found[0].trim()) : NaN;
        push(m[1], isNaN(date) ? null : date);
      }
      if (out.length) return out;
    }
    for (const u of parseUsernames(text)) push(u, null);
    return out;
  }
  // Adds rows to the pending list without duplicates; the earlier date and any known id are kept.
  function mergePending(pending, rows, now) {
    const map = new Map();
    for (const p of pending || []) if (p && typeof p.u === 'string') map.set(p.u, p);
    let added = 0;
    for (const r of rows || []) {
      if (!r || typeof r.u !== 'string') continue;
      const old = map.get(r.u);
      if (!old) { map.set(r.u, { u: r.u, id: r.id || '', name: r.name || '', pic: r.pic || '', priv: r.priv !== false, ts: r.ts || now }); added++; continue; }
      map.set(r.u, Object.assign({}, old, { id: old.id || r.id || '', name: old.name || r.name || '', pic: old.pic || r.pic || '', ts: Math.min(old.ts || now, r.ts || now) }));
    }
    return { pending: [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0)), added };
  }

  // Counts of another account: a short number for a chip, the follow-back odds, a sort and the cache.
  function shortNum(n) {
    n = Number(n || 0);
    if (n >= 1e6) return Math.round(n / 1e5) / 10 + 'M';
    if (n >= 1e4) return Math.round(n / 1e3) + 'K';
    if (n >= 1e3) return Math.round(n / 100) / 10 + 'K';
    return String(n);
  }
  // 'low': follows nobody, or a big account following ten times fewer than follow it. 'good': close to even.
  function followBackOdds(c) {
    if (!c || typeof c.fw !== 'number' || typeof c.fg !== 'number') return '';
    if (c.fg === 0) return 'low';
    const ratio = c.fw / c.fg;
    if (c.fw >= 1000 && ratio >= 10) return 'low';
    if (ratio <= 1.5) return 'good';
    return 'mid';
  }
  function sortRows(rows, mode, counts) {
    const byName = (a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : 0);
    const c = (r) => (counts && counts[r.u]) || null;
    const key = mode === 'followers' ? (r) => (c(r) ? c(r).fw : -1)
      : mode === 'ratio' ? (r) => (c(r) ? (c(r).fg === 0 ? Infinity : c(r).fw / c(r).fg) : -1)
      : null;
    const out = rows.slice();
    if (!key) return out.sort(byName);
    return out.sort((a, b) => (key(b) - key(a)) || byName(a, b));
  }
  // Drops stale entries and keeps the newest cap.
  function pruneCounts(counts, now, cap, ttl) {
    const entries = Object.entries(counts && typeof counts === 'object' ? counts : {})
      .filter(([u, v]) => v && typeof v.fw === 'number' && typeof v.fg === 'number' && typeof v.at === 'number' && now - v.at < ttl)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, cap);
    const out = {};
    for (const [u, v] of entries) out[u] = v;
    return out;
  }

  return { loopsFrom, carryMe, preCheck, shortNum, followBackOdds, sortRows, pruneCounts, UNDO, appendLog, markUndone, parsePending, mergePending, num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, RESERVED, profileUsername, describeRel, parseUsernames, toCsv, matchesKind, tokensFromHtml, jazoest, judgeAction, findFollowing, lostSince, whoLeft, computeStats, goneSet, reactivations, reclassifyEvents };
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
    evDeactivated: 'account gone (deactivated or blocked you)',
    evReactivated: 'account is back',
    evUnknown: 'changed',
    histDeactivated: '{n} gone',
    histReactivated: '{n} came back',
    filterDeactivated: 'Gone (deactivated or blocked)',
    filterReactivated: 'Came back',
    reactChip: 'was deactivated {d}, back now',
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
    partialWarn: 'Instagram says {total} accounts {what}; {got} came back. The rest may be deactivated accounts or ones Instagram skipped. Use Check live on a row to be sure.',
    partialFollowing: 'you follow',
    partialFollowers: 'following you',
    progVerify: 'Double-checking {n} of {total}…',
    ledgerLive: 'Fetching… {nf} you follow, {nw} follow you',
    protect: 'Protect',
    protectedLabel: 'Protected',
    protectTitle: 'Protected accounts stay out of “don’t follow you back”.',
    protectedBtn: 'Protected ({n})',
    protectedTitle: 'Protected accounts. They never show under “don’t follow you back”.',
    protectedHint: 'Accounts you follow on purpose even if they don’t follow back: friends, brands, news. Paste usernames below, one per line or separated by spaces or commas.',
    protectedPlaceholder: '@username another.name …',
    protectedEmpty: 'No protected accounts yet. Tap Protect on any row, or paste usernames above.',
    allProtected: 'Everyone left here is protected. Tick “Show protected” to see them.',
    showProtected: 'Show protected',
    nProtected: '{n} protected',
    add: 'Add',
    importBtn: 'Import file',
    exportBtn: 'Export JSON',
    remove: 'Remove',
    kindAll: 'All accounts',
    kindVerified: 'Verified only',
    kindNotVerified: 'Not verified',
    kindPrivate: 'Private only',
    kindPublic: 'Public only',
    verifiedTag: 'verified',
    download: 'Download CSV',
    toastSaved: 'Saved {name}',
    toastSaveFailed: 'Could not save the file.',
    toastAdded: 'Added {n}',
    toastNothingToAdd: 'No usernames found.',
    unfollow: 'Unfollow',
    unfollowConfirm: 'Sure? Tap again',
    unfollowTitle: 'Unfollows this account after a second tap. Spaced out and capped to protect your account.',
    unfollowedChip: 'unfollowed',
    toastUnfollowed: 'Unfollowed @{u}',
    unfollowWait: 'Wait {s}s before the next unfollow.',
    unfollowLimitHour: 'That is {n} unfollows this hour, the limit. Come back later.',
    unfollowLimitDay: 'That is {n} unfollows today, the limit. Come back tomorrow.',
    unfollowBlocked: 'Instagram is refusing actions right now. Unfollow is paused until {t}.',
    unfollowFailed: 'Could not unfollow: {r}',
    unfollowUnconfirmed: 'Instagram did not confirm it. Open the profile to check.',
    unfollowStill: 'Instagram says you still follow them.',
    unfollowBusy: 'Wait for the check to finish.',
    unfollowWarnTitle: 'Before you unfollow',
    unfollowWarn: 'Following or unfollowing many accounts quickly makes Instagram block actions on your account for a day or more. These buttons work one account at a time, 20 seconds apart, at most {h} actions per hour and {d} per day, and pause for two hours if Instagram objects. Use them for a few accounts at a time.',
    unfollowWarnOk: 'I understand',
    unfollowQuota: '{h} unfollows left this hour, {d} today',
    actionsQuota: '{h} actions left this hour, {d} today',
    follow: 'Follow back',
    followTitle: 'Follows this account after a second tap. Spaced out and capped to protect your account.',
    toastFollowed: 'Followed @{u}',
    toastRequested: 'Follow request sent to @{u}',
    followFailed: 'Could not follow: {r}',
    followUnconfirmed: 'Instagram did not confirm it. Open the profile to check.',
    lbFull: 'Full size',
    lbSave: 'Download image',
    lbFullFailed: 'Could not load the full size: {r}',
    lbSlow: 'Instagram asked to slow down. Full-size pictures are back after {t}; until then only the small one can be saved.',
    toastImgOpen: 'Opened in a new tab; save it from there.',
    onlyLeft: 'Only those who unfollowed you',
    leftChip: 'unfollowed you {d}',
    nLeft: '{n} unfollowed you',
    statRate: 'follow you back',
    statWeek: 'followers since {since}',
    statBest: 'best check, {d}',
    statWorst: 'worst check, {d}',
    statNeedMore: 'needs more checks',
    share: 'Share card',
    cardName: 'Share card',
    cardTitle: 'Follow Check',
    cardAnon: 'my Instagram',
    cardRate: 'of the accounts I follow follow me back',
    cardFollowing: 'following',
    cardFollowers: 'followers',
    cardMutual: 'follow each other',
    cardNotback: 'don’t follow back',
    cardWeek: '{n} followers since {since}',
    needUpdate: 'Update the app to save files.',
    cardFooter: 'made with Follow Check',
    showName: 'Show my username',
    cardFailed: 'Could not draw the card.',
    preFollowsYou: 'Skipped: @{u} follows you now.',
    preNotFollowing: 'Skipped: you already don’t follow @{u}.',
    preLeft: 'Skipped: @{u} no longer follows you.',
    preAlready: 'You already follow @{u}.',
    preAccepted: '@{u} accepted your request.',
    preGone: 'The request to @{u} is no longer pending.',
    preUnknown: 'Could not confirm with Instagram first, so nothing was done.',
    pendingBtn: 'Pending ({n})',
    pendingTitle: 'Follow requests you sent that were not accepted',
    pendingHint: 'Instagram’s site no longer lists the requests you sent. This list holds the requests sent from here, plus whatever you import from the pending_follow_requests file of Instagram’s “Download your information” export (JSON or HTML).',
    pendingEmpty: 'No pending requests known. Import the export file, or send one from “you don’t follow back”.',
    pendingChip: 'pending since {d}',
    pendingStill: 'still pending',
    stillPending: 'Still pending?',
    stillPendingTitle: 'Asks Instagram whether this request is still waiting.',
    cancelReq: 'Cancel request',
    cancelTitle: 'Withdraws this follow request after a second tap. Same spacing and caps as Unfollow.',
    toastReqCancelled: 'Request to @{u} cancelled',
    cancelFailed: 'Cancel failed: {r}',
    logBtn: 'Actions ({n})',
    logTitle: 'Actions taken from here, newest first',
    logEmpty: 'No actions yet. Unfollow, Follow back and Cancel request land here, each with an Undo.',
    actUnfollow: 'unfollowed {d}',
    actFollow: 'followed {d}',
    actRequest: 'requested {d}',
    actCancel: 'cancelled request {d}',
    undone: 'undone {d}',
    undo: 'Undo',
    undoTitle: 'Does the opposite after a second tap, under the same limits.',
    leftBackChip: 'unfollowed you {d}, back now',
    nLeftBefore: '{n} unfollowed you before',
    pillLeft: 'unfollowed you {d}',
    loopChip: 'you unfollowed, then followed again {d}',
    nLoop: '{n} followed again after an unfollow',
    pillLoop: 'you unfollowed and followed again {d}',
    loadCounts: 'Load counts',
    loadCountsTitle: 'Fetches followers and following of each account shown, one request per account, paced. Up to {n} per tap; tap again to stop.',
    loadingCounts: 'Counts {a}/{b}, tap to stop',
    countsDone: 'Counts loaded for {n}',
    countsStopped: 'Stopped after {n}',
    countsNothing: 'Every account shown already has counts.',
    countsTitle: '{fw} followers · {fg} following',
    oddsLow: 'unlikely to follow back',
    oddsGood: 'likely to follow back',
    sortName: 'Sort: username',
    sortFollowers: 'Sort: most followers',
    sortRatio: 'Sort: least likely to follow back',
    countsPaused: 'Counts paused until {t}: Instagram asked to slow down. What was loaded so far is kept.',
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
    evDeactivated: 'الحساب اختفى (قفله أو عمللك بلوك)',
    evReactivated: 'رجّع حسابه',
    evUnknown: 'اتغير',
    histDeactivated: '{n} اختفوا',
    histReactivated: '{n} رجعوا',
    filterDeactivated: 'اختفوا (قفلوا أو بلوك)',
    filterReactivated: 'رجعوا',
    reactChip: 'كان قافل حسابه {d}، ورجع',
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
    partialWarn: 'إنستجرام بيقول {total} حساب {what}، ورجع {got}. الباقي ممكن يكون حسابات متوقفة أو حسابات إنستجرام عداها. استخدم "تأكد دلوقتي" عند أي اسم علشان تتأكد.',
    partialFollowing: 'بتتابعهم',
    partialFollowers: 'بيتابعوك',
    progVerify: 'بنتأكد من {n} من {total}…',
    ledgerLive: 'بنجيب… بتتابع {nf}، بيتابعك {nw}',
    protect: 'احمي',
    protectedLabel: 'محمي',
    protectTitle: 'الحسابات المحمية مش بتظهر في "مش بيردوا المتابعة".',
    protectedBtn: 'المحمية ({n})',
    protectedTitle: 'الحسابات المحمية. مش بتظهر أبداً في "مش بيردوا المتابعة".',
    protectedHint: 'حسابات بتتابعها عن قصد حتى لو مش بتردلك المتابعة: أصحاب، براندات، أخبار. الزق الأسماء تحت، كل اسم في سطر أو مفصولين بمسافة أو فاصلة.',
    protectedPlaceholder: '@username اسم.تاني …',
    protectedEmpty: 'مفيش حسابات محمية لسه. دوس "احمي" جنب أي اسم، أو الزق أسماء فوق.',
    allProtected: 'كل اللي هنا محميين. علّم "اعرض المحمية" علشان تشوفهم.',
    showProtected: 'اعرض المحمية',
    nProtected: '{n} محمي',
    add: 'أضف',
    importBtn: 'استيراد ملف',
    exportBtn: 'تصدير JSON',
    remove: 'شيل',
    kindAll: 'كل الحسابات',
    kindVerified: 'الموثقة بس',
    kindNotVerified: 'غير الموثقة',
    kindPrivate: 'الخاصة بس',
    kindPublic: 'العامة بس',
    verifiedTag: 'موثق',
    download: 'تحميل CSV',
    toastSaved: 'اتحفظ {name}',
    toastSaveFailed: 'مقدرناش نحفظ الملف.',
    toastAdded: 'اتضاف {n}',
    toastNothingToAdd: 'مفيش أسماء مستخدمين.',
    unfollow: 'ألغي المتابعة',
    unfollowConfirm: 'متأكد؟ دوس تاني',
    unfollowTitle: 'بيلغي متابعة الحساب ده بعد ضغطة تانية. متباعد ومحدود علشان حسابك.',
    unfollowedChip: 'اتلغت المتابعة',
    toastUnfollowed: 'اتلغت متابعة @{u}',
    unfollowWait: 'استنى {s} ثانية قبل اللي بعده.',
    unfollowLimitHour: 'وصلت {n} إلغاء في الساعة دي، ده الحد. ارجع بعدين.',
    unfollowLimitDay: 'وصلت {n} إلغاء النهاردة، ده الحد. ارجع بكرة.',
    unfollowBlocked: 'إنستجرام رافض الأكشنات دلوقتي. إلغاء المتابعة متوقف لحد {t}.',
    unfollowFailed: 'مقدرناش نلغي المتابعة: {r}',
    unfollowUnconfirmed: 'إنستجرام ماأكدش. افتح البروفايل واتأكد.',
    unfollowStill: 'إنستجرام بيقول إنك لسه بتتابعه.',
    unfollowBusy: 'استنى الفحص يخلص.',
    unfollowWarnTitle: 'قبل ما تلغي متابعة',
    unfollowWarn: 'متابعة أو إلغاء متابعة حسابات كتير بسرعة بيخلي إنستجرام يقفل الأكشنات على حسابك يوم أو أكتر. الزراير دي بتشتغل حساب حساب، كل 20 ثانية، بحد أقصى {h} أكشن في الساعة و{d} في اليوم، وبتقف ساعتين لو إنستجرام اعترض. استخدمها لكام حساب في المرة.',
    unfollowWarnOk: 'فاهم',
    unfollowQuota: 'باقي {h} إلغاء الساعة دي، {d} النهاردة',
    actionsQuota: 'باقي {h} أكشن الساعة دي، {d} النهاردة',
    follow: 'رد المتابعة',
    followTitle: 'بيتابع الحساب ده بعد ضغطة تانية. متباعد ومحدود علشان حسابك.',
    toastFollowed: 'تابعت @{u}',
    toastRequested: 'اتبعت طلب متابعة لـ @{u}',
    followFailed: 'مقدرناش نتابع: {r}',
    followUnconfirmed: 'إنستجرام ماأكدش. افتح البروفايل واتأكد.',
    lbFull: 'الحجم الكامل',
    lbSave: 'تحميل الصورة',
    lbFullFailed: 'مقدرناش نجيب الحجم الكامل: {r}',
    lbSlow: 'إنستجرام طلب نهدّي شوية. الصور الكبيرة هترجع بعد {t}، ولحد ساعتها الصغيرة بس هي اللي بتتحمل.',
    toastImgOpen: 'اتفتحت في تاب جديد، احفظها من هناك.',
    onlyLeft: 'اللي سابوك بس',
    leftChip: 'سابك {d}',
    nLeft: '{n} سابوك',
    statRate: 'بيردوا المتابعة',
    statWeek: 'متابعين من {since}',
    statBest: 'أحسن فحص، {d}',
    statWorst: 'أسوأ فحص، {d}',
    statNeedMore: 'محتاج فحوصات أكتر',
    share: 'كارت للمشاركة',
    cardName: 'كارت المشاركة',
    cardTitle: 'Follow Check',
    cardAnon: 'حسابي على إنستجرام',
    cardRate: 'من اللي بتابعهم بيردوا لي المتابعة',
    cardFollowing: 'بتابعهم',
    cardFollowers: 'متابعين',
    cardMutual: 'متبادل',
    cardNotback: 'مش بيردوا',
    cardWeek: '{n} متابع من {since}',
    needUpdate: 'حدّث التطبيق علشان تحفظ الملفات.',
    cardFooter: 'اتعمل بـ Follow Check',
    showName: 'اعرض اسمي',
    cardFailed: 'مقدرناش نرسم الكارت.',
    preFollowsYou: 'اتلغى: @{u} بقى بيتابعك دلوقتي.',
    preNotFollowing: 'اتلغى: إنت أصلاً مش بتتابع @{u}.',
    preLeft: 'اتلغى: @{u} مابقاش بيتابعك.',
    preAlready: 'إنت أصلاً بتتابع @{u}.',
    preAccepted: '@{u} قبل طلبك.',
    preGone: 'الطلب لـ @{u} مابقاش معلّق.',
    preUnknown: 'مقدرناش نتأكد من إنستجرام الأول، فماتعملش حاجة.',
    pendingBtn: 'المعلّقة ({n})',
    pendingTitle: 'طلبات المتابعة اللي بعتّها ومحدش قبلها',
    pendingHint: 'موقع إنستجرام مابقاش بيعرض الطلبات اللي بعتّها. القائمة دي فيها الطلبات اللي اتبعتت من هنا، وأي حاجة تستوردها من ملف pending_follow_requests في تنزيل بياناتك من إنستجرام (JSON أو HTML).',
    pendingEmpty: 'مفيش طلبات معلّقة معروفة. استورد ملف التنزيل، أو ابعت طلب من "مش بتردلهم المتابعة".',
    pendingChip: 'معلّق من {d}',
    pendingStill: 'لسه معلّق',
    stillPending: 'لسه معلّق؟',
    stillPendingTitle: 'بيسأل إنستجرام لو الطلب ده لسه مستني.',
    cancelReq: 'الغي الطلب',
    cancelTitle: 'بيسحب طلب المتابعة ده بعد ضغطة تانية. نفس التباعد والحدود بتاعة إلغاء المتابعة.',
    toastReqCancelled: 'الطلب لـ @{u} اتلغى',
    cancelFailed: 'الإلغاء فشل: {r}',
    logBtn: 'الأكشنات ({n})',
    logTitle: 'الأكشنات اللي اتعملت من هنا، الأحدث الأول',
    logEmpty: 'مفيش أكشنات لسه. إلغاء المتابعة والمتابعة وإلغاء الطلب بيتسجلوا هنا، وكل واحد ليه زرار رجّع.',
    actUnfollow: 'ألغيت متابعته {d}',
    actFollow: 'تابعته {d}',
    actRequest: 'بعتله طلب {d}',
    actCancel: 'ألغيت الطلب {d}',
    undone: 'اترجّع {d}',
    undo: 'رجّع',
    undoTitle: 'بيعمل العكس بعد ضغطة تانية، بنفس الحدود.',
    leftBackChip: 'سابك {d} ورجع',
    nLeftBefore: '{n} سابوك قبل كده',
    pillLeft: 'سابك {d}',
    loopChip: 'ألغيت متابعته ورجعت تابعته {d}',
    nLoop: '{n} رجعت تابعتهم بعد إلغاء',
    pillLoop: 'ألغيت متابعته ورجعت تابعته {d}',
    loadCounts: 'هات الأرقام',
    loadCountsTitle: 'بيجيب عدد المتابعين والمتابَعين لكل حساب ظاهر، طلب لكل حساب، متباعد. لحد {n} في الضغطة، ودوس تاني علشان توقف.',
    loadingCounts: 'الأرقام {a}/{b}، دوس علشان توقف',
    countsDone: 'الأرقام جت لـ {n}',
    countsStopped: 'وقف بعد {n}',
    countsNothing: 'كل الحسابات الظاهرة أرقامها موجودة.',
    countsTitle: '{fw} متابع · بيتابع {fg}',
    oddsLow: 'صعب يرد المتابعة',
    oddsGood: 'غالباً هيرد المتابعة',
    sortName: 'ترتيب: الاسم',
    sortFollowers: 'ترتيب: الأكتر متابعين',
    sortRatio: 'ترتيب: الأصعب يردوا',
    countsPaused: 'الأرقام واقفة لحد {t}: إنستجرام طلب نهدّي. اللي اتحمّل لحد دلوقتي متحفوظ.',
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
  const { num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, profileUsername, describeRel, parseUsernames, toCsv, matchesKind, tokensFromHtml, jazoest, judgeAction, findFollowing, lostSince, whoLeft, computeStats, loopsFrom, carryMe, preCheck, UNDO, appendLog, markUndone, parsePending, mergePending, shortNum, followBackOdds, sortRows, pruneCounts, goneSet, reactivations, reclassifyEvents } = CORE;
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
  const logStoreKey = (uid) => 'fbc.log.' + uid;
  const pendStoreKey = (uid) => 'fbc.pending.' + uid;
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
  const state = { uid: '', snap: null, prev: null, done: {}, white: {}, actions: freshActions(), lists: null, hist: null, log: [], pending: [], counts: {}, countsRun: null, sort: 'name', left: new Map(), loops: new Map(), react: new Map(), onlyLeft: false, evFilter: 'all', kind: 'all', showProtected: false, tab: 'notback', q: '', hideDone: false, running: false, ctl: null, open: false, width: 640, cooldownUntil: 0, countsPausedUntil: 0 };
  const live = { following: 0, followers: 0 };
  const ui = {};
  // Small preferences, remembered across visits: language, panel width, and the pause after Instagram asks us to slow down.
  const UI_KEY = 'fbc.ui';
  function saveUi() { storageSet({ [UI_KEY]: { lang, width: state.width, cooldownUntil: state.cooldownUntil, countsPausedUntil: state.countsPausedUntil } }); }
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
    ui.onlyLeft = h('input', { type: 'checkbox', onchange: () => { state.onlyLeft = ui.onlyLeft.checked; renderList(); } });
    ui.onlyLeftText = h('span');
    ui.onlyLeftWrap = h('label', { class: 'chk', hidden: true }, ui.onlyLeft, ui.onlyLeftText);
    ui.share = h('button', { class: 'btn small', type: 'button', onclick: () => openShareCard() });
    ui.kindOpts = ['all', 'verified', 'notVerified', 'private', 'public'].map((v) => h('option', { value: v }));
    ui.kindFilter = h('select', { class: 'field sel', onchange: () => { state.kind = ui.kindFilter.value; renderList(); } }, ui.kindOpts);
    ui.sortOpts = ['name', 'followers', 'ratio'].map((v) => h('option', { value: v }));
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
    ui.pendFile = h('input', { type: 'file', accept: '.json,.html,.htm,.txt,application/json,text/html,text/plain', hidden: true, onchange: () => importPendingFile() });
    ui.pendImport = h('button', { class: 'btn small', type: 'button', onclick: () => ui.pendFile.click() });
    ui.pend = h('div', { class: 'prot', hidden: true }, ui.pendHint, h('div', { class: 'toolbar' }, ui.pendImport, ui.pendFile));
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
    const optKeys = ['filterAll', 'filterOthers', 'filterGained', 'filterLost', 'filterYouFollowed', 'filterYouUnfollowed', 'filterDeactivated', 'filterReactivated'];
    ui.filterOpts.forEach((o, i) => { o.textContent = t(optKeys[i]); });
    for (const k of Object.keys(TABS)) ui.tile[k].label.textContent = t(TABS[k].label);
    ui.showProtectedText.textContent = t('showProtected');
    ui.onlyLeftText.textContent = t('onlyLeft');
    ui.share.textContent = t('share');
    ui.lbShowNameText.textContent = t('showName');
    const kindKeys = ['kindAll', 'kindVerified', 'kindNotVerified', 'kindPrivate', 'kindPublic'];
    ui.kindOpts.forEach((o, i) => { o.textContent = t(kindKeys[i]); });
    const sortKeys = ['sortName', 'sortFollowers', 'sortRatio'];
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
    lb.rec = rec; lb.url = rec.pic; lb.hd = false; lb.loading = null; lb.card = null;
    ui.lbImg.src = rec.pic;
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
  function importPendingFile() {
    const f = ui.pendFile.files && ui.pendFile.files[0];
    ui.pendFile.value = '';
    if (!f) return;
    f.text().then((text) => {
      const rows = parsePending(text);
      if (!rows.length) { toast(t('toastNothingToAdd')); return; }
      const added = addPending(rows);
      toast(added ? t('toastAdded', { n: num(added) }) : t('toastNothingToAdd'));
      renderList();
    }, () => toast(t('toastNothingToAdd')));
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
      row.append(ub);
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
      row.append(fb);
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
    if ((state.tab === 'notback' || state.tab === 'fans') && state.onlyLeft) rows = rows.filter((r) => state.left.has(r.u));
    if (state.hideDone) rows = rows.filter((r) => !isDone(r.u));
    if (state.kind !== 'all') rows = rows.filter((r) => matchesKind(r, state.kind));
    return sortRows(rows, state.sort, state.counts);
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
      row.append(sb);
      row.append(armedButton('unf', t('cancelReq'), t('cancelTitle'), (btn) => cancelRow(p, row, btn)));
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
      else if (UNDO[e.type]) row.append(armedButton('unf undo', t('undo'), t('undoTitle'), (btn) => undoRow(e, row, btn)));
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
      snap.me = carryMe(snap, state.snap); // the account-info request can be throttled; keep the name we already know
      const knownEvents = state.hist && Array.isArray(state.hist.events) ? state.hist.events : [];
      state.hist = appendHistory(state.hist, pointFrom(snap), eventsFrom(diff(state.snap, snap), snap.at, goneSet(knownEvents)), HIST_CAPS);
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
    state.snap = null; state.prev = null; state.done = {}; state.white = {}; state.actions = freshActions(); state.lists = null; state.hist = null; state.log = []; state.pending = [];
    state.tab = 'notback';
    updateProtectedBtn();
    updateSideBtns();
    applySnapshot();
    if (!uid) return;
    const r = await storageGet([acctStoreKey(uid), doneStoreKey(uid), histStoreKey(uid), whiteStoreKey(uid), actStoreKey(uid), logStoreKey(uid), pendStoreKey(uid), COUNTS_KEY, 'fbc', 'fbcDone']);
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
    state.hist = appendHistory(state.hist, pointFrom(snap), [{ at: Date.now(), type: followsYou ? 'gained' : 'lost', u: r.u, name: r.name || '', priv: !!r.priv }], HIST_CAPS);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    refreshFlags();
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist });
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
    state.hist = appendHistory(state.hist, pointFrom(snap), silent ? [] : [{ at: Date.now(), type: 'you_unfollowed', u: r.u, name: r.name || '', priv: !!r.priv }], HIST_CAPS);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    refreshFlags();
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist });
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
    state.hist = appendHistory(state.hist, pointFrom(snap), silent ? [] : [{ at: Date.now(), type: 'you_followed', u: r.u, name: r.name || '', priv: !!r.priv }], HIST_CAPS);
    state.lists = derive(new Map(snap.following.map((x) => [x.u, x])), new Map(snap.followers.map((x) => [x.u, x])));
    refreshFlags();
    if (state.uid) storageSet({ [acctStoreKey(state.uid)]: { last: snap, prev: state.prev }, [histStoreKey(state.uid)]: state.hist });
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
        if (!chip) { chip = h('span', { class: 'chip live' }); row.append(chip); }
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
