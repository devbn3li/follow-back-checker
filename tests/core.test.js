'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');

const raw = (username, extra) => Object.assign({ pk: '1', username, full_name: username.toUpperCase(), is_private: false }, extra || {});
const rows = (...names) => names.map((n) => core.normalizeUser(raw(n)));
const toMap = (list) => new Map(list.map((r) => [r.u, r]));
const names = (list) => list.map((r) => r.u).sort().join(',');

test('normalizeUser lowercases, trims, keeps id/name/private and rejects junk', () => {
  assert.equal(core.normalizeUser(raw('  MixedCase ')).u, 'mixedcase');
  assert.equal(core.normalizeUser(raw('x', { pk: 42 })).id, '42');
  assert.equal(core.normalizeUser(raw('x', { pk: undefined, pk_id: '7' })).id, '7');
  assert.equal(core.normalizeUser(raw('x', { is_private: true })).priv, true);
  assert.equal(core.normalizeUser({ username: 7 }), null);
  assert.equal(core.normalizeUser(null), null);
  assert.equal(core.normalizeUser({ username: '   ' }), null);
});

test('derive splits following/followers into not-back, fans and mutual', () => {
  const L = core.derive(toMap(rows('alice', 'carol', 'frank')), toMap(rows('alice', 'erin', 'gina')));
  assert.equal(names(L.notback), 'carol,frank');
  assert.equal(names(L.fans), 'erin,gina');
  assert.equal(names(L.mutual), 'alice');
});

test('diff reports gained, lost and your own changes, only for the same account', () => {
  const prev = { at: 1, me: 'acct_a', following: rows('alice', 'bob', 'carol'), followers: rows('alice', 'dave', 'erin') };
  const last = { at: 2, me: 'acct_a', following: rows('alice', 'carol', 'frank'), followers: rows('alice', 'erin', 'gina') };
  const d = core.diff(prev, last);
  assert.equal(names(d.gained), 'gina');
  assert.equal(names(d.lost), 'dave');
  assert.equal(names(d.youFollowed), 'frank');
  assert.equal(names(d.youUnfollowed), 'bob');
  assert.equal(d.since, 1);
  assert.equal(core.diff(null, last), null);
  assert.equal(core.diff(prev, { ...last, me: 'acct_b' }), null, 'different usernames never compare');
  assert.notEqual(core.diff({ ...prev, me: '' }, last), null, 'unknown username still compares');
  assert.notEqual(core.diff(prev, { ...last, me: 'ACCT_A' }), null, 'case-insensitive');
});

test('isSnap guards the stored shape', () => {
  assert.equal(core.isSnap({ at: 1, following: [], followers: [] }), true);
  assert.equal(core.isSnap({ at: 'x', following: [], followers: [] }), false);
  assert.equal(core.isSnap(null), false);
});

test('history: points, events, caps and grouping', () => {
  const prev = { at: 1000, me: 'me', following: rows('a', 'b', 'c'), followers: rows('a', 'd', 'e') };
  const last = { at: 2000, me: 'me', following: rows('a', 'c', 'f'), followers: rows('a', 'e', 'g') };
  const p = core.pointFrom(last);
  assert.deepEqual(p, { at: 2000, following: 3, followers: 3, mutual: 1, notback: 2 });

  const evs = core.eventsFrom(core.diff(prev, last), last.at);
  const by = (type) => evs.filter((e) => e.type === type).map((e) => e.u).join(',');
  assert.equal(by('gained'), 'g');
  assert.equal(by('lost'), 'd');
  assert.equal(by('you_followed'), 'f');
  assert.equal(by('you_unfollowed'), 'b');
  assert.ok(evs.every((e) => e.at === 2000));
  assert.equal(evs[0].name, 'G');
  assert.equal(core.eventsFrom(null, 1).length, 0);

  const caps = { points: 400, events: 3000 };
  let hist = core.appendHistory(null, core.pointFrom(prev), [], caps);
  hist = core.appendHistory(hist, p, evs, caps);
  assert.equal(hist.points.length, 2);
  assert.equal(hist.points[0].at, 1000);
  hist = core.appendHistory(hist, core.pointFrom(last), [], caps);
  assert.equal(hist.points.length, 2, 'same check time is not duplicated');

  const capped = core.appendHistory(hist, { at: 3000, following: 1, followers: 1, mutual: 0, notback: 1 }, [{ at: 3000, type: 'gained', u: 'z', name: '', priv: false }], { points: 2, events: 2 });
  assert.equal(capped.points.length, 2);
  assert.equal(capped.points[0].at, 2000);
  assert.equal(capped.events.length, 2);
  assert.equal(capped.events[1].u, 'z');

  const groups = core.groupEvents(evs.concat([{ at: 3000, type: 'gained', u: 'z', name: '', priv: false }]));
  assert.equal(groups[0].at, 3000);
  assert.equal(groups[0].gained, 1);
  assert.equal(groups[1].at, 2000);
  assert.equal(groups[1].lost, 1);
  assert.equal(groups[1].youUnfollowed, 1);
});

test('niceTicks gives round steps from zero', () => {
  assert.equal(core.niceTicks(37, 3).join(), '0,20,40');
  assert.equal(core.niceTicks(182, 3).join(), '0,100,200');
  assert.equal(core.niceTicks(1200, 3).join(), '0,500,1000,1500');
  assert.equal(core.niceTicks(0, 3).join(), '0,1');
});

test('profileUsername recognises profile paths only', () => {
  assert.equal(core.profileUsername('/0uck_fff/'), '0uck_fff');
  assert.equal(core.profileUsername('/0uck_fff/followers/'), '0uck_fff');
  assert.equal(core.profileUsername('/Some.User_1'), 'some.user_1');
  assert.equal(core.profileUsername('/'), '');
  assert.equal(core.profileUsername(''), '');
  for (const p of ['/explore/', '/p/Cabc123/', '/reels/xyz/', '/direct/inbox/', '/stories/user/1/', '/accounts/edit/']) assert.equal(core.profileUsername(p), '', p);
  assert.equal(core.profileUsername('/weird%20name/'), '');
});

test('describeRel only describes their side', () => {
  assert.deepEqual(core.describeRel({ followsYou: true, youFollow: true }), { key: 'pillFollows', tone: 'good' });
  assert.deepEqual(core.describeRel({ followsYou: false, youFollow: true }), { key: 'pillNot', tone: 'warn' });
  assert.deepEqual(core.describeRel({ followsYou: false, theyRequested: true }), { key: 'pillAsked', tone: 'info' });
  assert.deepEqual(core.describeRel({ followsYou: true, theyRequested: true }), { key: 'pillFollows', tone: 'good' });
});

test('num and pct format for the panel', () => {
  assert.equal(core.num(1234), '1,234');
  assert.equal(core.pct(2, 3), '67%');
  assert.equal(core.pct(1, 0), '0%');
  assert.equal(core.plural(1, 'account'), 'account');
  assert.equal(core.plural(2, 'account'), 'accounts');
});

test('normalizeUser keeps the picture link and the verified flag', () => {
  const r = core.normalizeUser(raw('x', { is_verified: true, profile_pic_url: 'https://cdn.example/x.jpg' }));
  assert.equal(r.ver, true);
  assert.equal(r.pic, 'https://cdn.example/x.jpg');
  assert.equal(core.normalizeUser(raw('y', { profile_pic_url: 'javascript:alert(1)' })).pic, '', 'only https pictures');
  assert.equal(core.normalizeUser(raw('z')).ver, false);
});

test('parseUsernames reads pasted text and exported files', () => {
  assert.deepEqual(core.parseUsernames('@Alice, bob.b\n carol_1 ; dave  alice'), ['alice', 'bob.b', 'carol_1', 'dave']);
  assert.deepEqual(core.parseUsernames('["x", "Y", {"username": "Z"}]'), ['x', 'y', 'z']);
  assert.deepEqual(core.parseUsernames('{"protected": ["one", "two"]}'), ['one', 'two']);
  assert.deepEqual(core.parseUsernames('[{"id": "1", "username": "deep"}, {"u": "er"}]'), ['deep', 'er']);
  assert.deepEqual(core.parseUsernames('not valid name!! @ok.name'), ['ok.name']);
  assert.deepEqual(core.parseUsernames(''), []);
  assert.deepEqual(core.parseUsernames('{broken json'), ['broken', 'json'], 'broken JSON is read as plain words');
});

test('toCsv quotes every cell and escapes quotes', () => {
  assert.equal(core.toCsv([['a', 'b'], ['x "q"', null]]), '"a","b"\r\n"x ""q""",""');
});

test('matchesKind filters by verified and private', () => {
  const v = { ver: true, priv: false }, p = { ver: false, priv: true };
  assert.equal(core.matchesKind(v, 'verified'), true);
  assert.equal(core.matchesKind(p, 'verified'), false);
  assert.equal(core.matchesKind(p, 'notVerified'), true);
  assert.equal(core.matchesKind(p, 'private'), true);
  assert.equal(core.matchesKind(v, 'public'), true);
  assert.equal(core.matchesKind(v, 'all'), true);
});
