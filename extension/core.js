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

  return { carryMe, num, plural, pct, normalizeUser, derive, diff, isSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, RESERVED, profileUsername, describeRel, parseUsernames, toCsv, matchesKind, tokensFromHtml, jazoest, judgeAction, findFollowing, lostSince, whoLeft, computeStats };
});
