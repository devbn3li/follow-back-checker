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
