// Follow Back Checker: pure logic shared by the extension, the Android app, the export reader and the tests.
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
  // The snapshot before the last one is only compared against (diff, history seeding), so it is kept without
  // the picture links and ids that make up most of a snapshot's size.
  function slimSnap(snap) {
    if (!isSnap(snap)) return null;
    const slim = (rows) => rows.filter((r) => r && typeof r.u === 'string').map((r) => ({ u: r.u, name: r.name || '', priv: !!r.priv }));
    return Object.assign({}, snap, { following: slim(snap.following), followers: slim(snap.followers) });
  }

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
    // A known-away account that reappears in one list only came back (both follows restored) and then
    // lost the other edge before this check: in following only, it unfollowed you; in followers only,
    // you unfollowed it. Neither is an action of yours to file as "you followed" or "they followed".
    const youFollowed = (d.youFollowed || []).filter((r) => !gone.has(r.u));
    const gained = (d.gained || []).filter((r) => !gone.has(r.u));
    const backThenLeft = (d.youFollowed || []).filter((r) => gone.has(r.u));
    const backThenDropped = (d.gained || []).filter((r) => gone.has(r.u));
    return [
      ...mk('gained', gained), ...mk('lost', d.lost),
      ...mk('you_followed', youFollowed), ...mk('you_unfollowed', d.youUnfollowed),
      ...mk('deactivated', d.gone), ...mk('reactivated', returned),
      ...mk('gained', fresh), ...mk('you_followed', fresh),
      ...mk('reactivated', backThenLeft), ...mk('lost', backThenLeft),
      ...mk('reactivated', backThenDropped), ...mk('you_unfollowed', backThenDropped),
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
    const push = (u, ts, id) => {
      const name = String(u || '').trim().replace(/^@/, '').toLowerCase();
      if (!USERNAME.test(name) || seen.has(name)) return;
      seen.add(name);
      const row = { u: name, ts: typeof ts === 'number' && ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : null };
      if (id && /^\d+$/.test(id)) row.id = id;
      out.push(row);
    };
    const walk = (v, depth) => {
      if (depth > 5 || v == null) return;
      if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
      if (typeof v !== 'object') return;
      if (Array.isArray(v.string_list_data)) {
        // Older files put the username in value; the current following.json only in the title and the link.
        for (const d of v.string_list_data) {
          if (!d) continue;
          const fromHref = typeof d.href === 'string' ? (d.href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/) || [])[1] : '';
          push(typeof d.value === 'string' && d.value ? d.value : (typeof v.title === 'string' && v.title ? v.title : fromHref), d.timestamp);
        }
        return;
      }
      if (Array.isArray(v.label_values)) {
        // The 2026 export: one entry per account with labelled values and the account id as fbid.
        const lv = v.label_values.find((x) => x && /^username$/i.test(String(x.label || '')));
        if (lv && typeof lv.value === 'string') push(lv.value, v.timestamp, v.fbid != null ? String(v.fbid) : '');
        return;
      }
      if (typeof v.username === 'string') { push(v.username, v.timestamp); return; }
      if (typeof v.u === 'string') { push(v.u, v.ts); return; }
      Object.values(v).forEach((x) => walk(x, depth + 1));
    };
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try { walk(JSON.parse(trimmed), 0); return out; } catch (e) { /* not JSON after all */ }
    }
    if (/<\s*(html|div|a)\b/i.test(trimmed)) {
      // The HTML export: one link per account, the date in the text that follows it.
      const re = /instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?["'][^>]*>[^<]*<\/a>([\s\S]{0,200}?)(?=<a |$)/g;
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
  // since: optional (username) -> { at } for the 'since' mode, which puts the longest-standing follow first.
  function sortRows(rows, mode, counts, since) {
    const byName = (a, b) => (a.u < b.u ? -1 : a.u > b.u ? 1 : 0);
    const c = (r) => (counts && counts[r.u]) || null;
    const UNKNOWN = -Number.MAX_SAFE_INTEGER; // no date at all: after every dated row
    const key = mode === 'followers' ? (r) => (c(r) ? c(r).fw : -1)
      : mode === 'ratio' ? (r) => (c(r) ? (c(r).fg === 0 ? Infinity : c(r).fw / c(r).fg) : -1)
      : mode === 'since' ? (r) => { const s = typeof since === 'function' ? since(r.u) : null; return s && typeof s.at === 'number' ? -s.at : UNKNOWN; }
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


  // --- "following since": one date per account. Exact when it comes from Instagram's own export,
  // approximate when a check noticed the change (then it is the check's date, at most one check gap late).
  // dates = { following: { u: { at, x } }, followers: { u: { at, x } }, floor, importedAt }
  // floor: the first check's date; an account that was already there then is "since before" it.
  function emptyDates(floor) { return { following: {}, followers: {}, floor: floor || 0, importedAt: 0 }; }
  function applyDateEvents(dates, events) {
    const d = dates && typeof dates === 'object' ? dates : emptyDates(0);
    const following = Object.assign({}, d.following || {}), followers = Object.assign({}, d.followers || {});
    for (const e of validEvents(events)) {
      if (e.type === 'you_followed') following[e.u] = { at: e.at, x: false };
      else if (e.type === 'you_unfollowed') delete following[e.u];
      else if (e.type === 'gained') followers[e.u] = { at: e.at, x: false };
      else if (e.type === 'lost') delete followers[e.u];
    }
    return { following, followers, floor: d.floor || 0, importedAt: d.importedAt || 0 };
  }
  // Rows from the export ({ u, ts }) replace what the checks guessed; rows without a date are skipped.
  function importDates(dates, rows, kind, now) {
    const d = dates && typeof dates === 'object' ? dates : emptyDates(0);
    const key = kind === 'followers' ? 'followers' : 'following';
    const map = Object.assign({}, d[key] || {});
    let added = 0;
    for (const r of rows || []) {
      if (!r || typeof r.u !== 'string' || typeof r.ts !== 'number' || !(r.ts > 0)) continue;
      map[r.u] = { at: r.ts, x: true };
      added++;
    }
    return { dates: Object.assign({}, d, { [key]: map, importedAt: added ? now : (d.importedAt || 0) }), added };
  }
  // What to show for one account: { at, exact, before }. before: it was already there at the first check.
  function sinceOf(dates, list, u) {
    if (!dates || typeof dates !== 'object') return null;
    const m = dates[list === 'followers' ? 'followers' : 'following'] || {};
    const e = m[u];
    if (e && typeof e.at === 'number') return { at: e.at, exact: !!e.x, before: false };
    if (typeof dates.floor === 'number' && dates.floor > 0) return { at: dates.floor, exact: false, before: true };
    return null;
  }
  // Which list an export file holds: its name says so; otherwise whichever of your lists it overlaps most.
  function guessListKind(name, rows, snap) {
    const n = String(name || '').toLowerCase().split('/').pop(); // the base name: every list sits in followers_and_following/
    if (/^following/.test(n)) return 'following';
    if (/^follower/.test(n)) return 'followers';
    if (!snap || !Array.isArray(snap.following) || !Array.isArray(snap.followers)) return null;
    const fg = new Set(snap.following.map((r) => r.u)), fw = new Set(snap.followers.map((r) => r.u));
    let a = 0, b = 0;
    for (const r of rows || []) { if (r && fg.has(r.u)) a++; if (r && fw.has(r.u)) b++; }
    if (!a && !b) return null;
    return a >= b ? 'following' : 'followers';
  }
  // The list files inside Instagram's export zip (connections/followers_and_following/).
  const EXPORT_LIST = /(^|\/)(following|followers(_\d+)?)\.(json|html)$/i;
  function exportListEntries(entries) {
    return (entries || []).filter((e) => e && typeof e.name === 'string' && EXPORT_LIST.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name));
  }
  // One export file by its base name, the json one when both json and html exist.
  function pickExportEntry(entries, kind) {
    const re = new RegExp('(^|/)' + kind + '\\.(json|html?)$', 'i');
    const hits = (entries || []).filter((e) => e && typeof e.name === 'string' && re.test(e.name) && !/(^|\/)__MACOSX\//.test(e.name));
    return hits.find((e) => /\.json$/i.test(e.name)) || hits[0] || null;
  }
  // A zip is read from its end: the end record points at the central directory, which lists every entry
  // and where its local header sits. Three small pieces, so a page can read a large export through
  // File.slice without loading the media inside it. No ZIP64.
  const u8 = (bytes) => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  // tail: the last bytes of the file (up to 64 KB + 22). Offsets count from the start of the file.
  function zipFindEocd(tail, fileSize) {
    const b = u8(tail);
    const n = b.length;
    if (n < 22) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
      if (dv.getUint32(i, true) !== 0x06054b50) continue;
      const out = { count: dv.getUint16(i + 10, true), cdSize: dv.getUint32(i + 12, true), cdOffset: dv.getUint32(i + 16, true) };
      const total = typeof fileSize === 'number' ? fileSize : n;
      return out.cdOffset + out.cdSize <= total ? out : null;
    }
    return null;
  }
  // cd: the central directory bytes. Returns [{ name, method, size, csize, lho }].
  function zipCentral(cd, count) {
    const b = u8(cd);
    const n = b.length;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const utf8 = new TextDecoder('utf-8');
    const out = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      if (p + 46 + nlen > n) break;
      out.push({ name: utf8.decode(b.subarray(p + 46, p + 46 + nlen)), method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), size: dv.getUint32(p + 24, true), lho: dv.getUint32(p + 42, true) });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }
  // lh: the 30 bytes of a local header. How far past the header's start the data begins, or -1.
  function zipDataStart(lh) {
    const b = u8(lh);
    if (b.length < 30) return -1;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint32(0, true) !== 0x04034b50) return -1;
    return 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  }
  // The entries of a whole zip held in memory, with the raw bytes attached.
  function zipEntries(bytes) {
    const b = u8(bytes);
    const e = zipFindEocd(b.subarray(Math.max(0, b.length - 65557)), b.length);
    if (!e) return [];
    const out = [];
    for (const c of zipCentral(b.subarray(e.cdOffset, e.cdOffset + e.cdSize), e.count)) {
      const at = zipDataStart(b.subarray(c.lho, c.lho + 30));
      if (at < 0 || c.lho + at + c.csize > b.length) continue;
      out.push(Object.assign({}, c, { data: b.subarray(c.lho + at, c.lho + at + c.csize) }));
    }
    return out;
  }
  // The text of one entry: stored ones as they are, deflated ones through the platform's decoder.
  async function zipText(entry) {
    if (!entry || !entry.data) return '';
    if (entry.method === 0) return new TextDecoder('utf-8').decode(entry.data);
    if (entry.method !== 8 || typeof DecompressionStream !== 'function') throw new Error('unsupported zip entry');
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(entry.data.slice());
    w.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder('utf-8').decode(buf);
  }
  // Reads entries out of a zip File or Blob through slice, so the media inside a big export is never loaded.
  // pick: which entries to read, the list files when not given. Returns [{ name, text }], or null for no zip.
  async function zipReadFile(file, pick) {
    const bytes = async (from, to) => new Uint8Array(await file.slice(from, to).arrayBuffer());
    const size = file.size;
    const e = zipFindEocd(await bytes(Math.max(0, size - 65557), size), size);
    if (!e) return null;
    const out = [];
    for (const c of (pick || exportListEntries)(zipCentral(await bytes(e.cdOffset, e.cdOffset + e.cdSize), e.count))) {
      const at = zipDataStart(await bytes(c.lho, c.lho + 30));
      if (at < 0) continue;
      out.push({ name: c.name, text: await zipText({ method: c.method, data: await bytes(c.lho + at, c.lho + at + c.csize) }) });
    }
    return out;
  }

  // --- profile pictures. Instagram hands out picture links on ISP-specific cache hosts
  // (instagram.fXXX-N.fna.fbcdn.net) that only answer from inside that network, so a phone that moves to
  // another network, or ran the check on another one, gets broken pictures while the site itself (which
  // mints fresh links on every page) looks fine. The generic host serves the same path with the same
  // signature. Returns the links to try, in order: the generic host first for a cache-host link.
  const GENERIC_PIC_HOST = 'scontent.cdninstagram.com';
  function picCandidates(url) {
    if (typeof url !== 'string' || !url) return [];
    let u;
    try { u = new URL(url); } catch (e) { return [url]; }
    if (u.protocol !== 'https:') return [url];
    const generic = new URL(url);
    generic.host = GENERIC_PIC_HOST;
    const g = generic.toString();
    if (g === url) return [url];
    return /\.fna\.fbcdn\.net$/i.test(u.host) ? [g, url] : [url, g];
  }

  // --- automatic check: on when the setting says so, the last check is older than maxAgeMs (or there is
  // none), nothing runs, Instagram has not asked for a pause, and it has not already run on this page.
  function shouldAutoCheck(s) {
    if (!s || !s.enabled || s.running || s.ranAlready) return false;
    if (typeof s.cooldownUntil === 'number' && s.now < s.cooldownUntil) return false;
    if (!s.lastAt) return true;
    return s.now - s.lastAt >= s.maxAgeMs;
  }
  // The app exists to check by itself; in a browser the user may be on Instagram for other reasons.
  const autoCheckDefault = (host) => host === 'android';

  // --- update notice: the latest GitHub release against what runs here.
  function compareVersions(a, b) {
    const parse = (v) => String(v || '').trim().replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
    const pa = parse(a), pb = parse(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d < 0 ? -1 : 1;
    }
    return 0;
  }
  // rel: the releases/latest object from GitHub's API. cur: { host, script, app }. The Android app compares its
  // APK version with the tag; the extension compares the script version the release notes carry.
  function parseRelease(rel, cur) {
    if (!rel || typeof rel !== 'object' || typeof rel.tag_name !== 'string' || rel.draft || rel.prerelease) return null;
    const tag = rel.tag_name.trim();
    if (!/^v?\d+\.\d+\.\d+$/.test(tag)) return null;
    const m = String(rel.body || '').match(/Script version (\d+\.\d+\.\d+)/i);
    const script = m ? m[1] : '';
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const find = (re) => {
      const a = assets.find((x) => x && typeof x.name === 'string' && re.test(x.name) && typeof x.browser_download_url === 'string');
      return a ? a.browser_download_url : '';
    };
    const out = { tag, version: tag.replace(/^v/i, ''), script, url: typeof rel.html_url === 'string' ? rel.html_url : '', apk: find(/\.apk$/i), ext: find(/extension.*\.zip$/i), newer: false, get: '' };
    const host = cur && cur.host;
    if (host === 'android') { out.newer = !!cur.app && compareVersions(out.version, cur.app) > 0; out.get = out.apk || out.url; }
    else if (host === 'extension') { out.newer = !!script && !!cur.script && compareVersions(script, cur.script) > 0; out.get = out.ext || out.url; }
    return out;
  }

  return { pickExportEntry, picCandidates, emptyDates, applyDateEvents, importDates, sinceOf, guessListKind, exportListEntries, zipFindEocd, zipCentral, zipDataStart, zipEntries, zipText, zipReadFile, shouldAutoCheck, autoCheckDefault, compareVersions, parseRelease, loopsFrom, carryMe, preCheck, shortNum, followBackOdds, sortRows, pruneCounts, UNDO, appendLog, markUndone, parsePending, mergePending, num, plural, pct, normalizeUser, derive, diff, isSnap, slimSnap, pointFrom, eventsFrom, appendHistory, groupEvents, niceTicks, RESERVED, profileUsername, describeRel, parseUsernames, toCsv, matchesKind, tokensFromHtml, jazoest, judgeAction, findFollowing, lostSince, whoLeft, computeStats, goneSet, reactivations, reclassifyEvents };
});
