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
  assert.deepEqual(core.parseUsernames('name!! #tag @ok.name'), ['ok.name']);
  assert.deepEqual(core.parseUsernames(''), []);
  assert.deepEqual(core.parseUsernames('{broken json'), ['json'], 'broken JSON is read as plain words; tokens that are not usernames are dropped');
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

test('tokensFromHtml and jazoest read the write tokens from the page', () => {
  const html = 'x["DTSGInitialData",[],{"token":"AQHabc:123"}]y["LSD",[],{"token":"lsdTok"}]z"client_revision":1017 ';
  assert.deepEqual(core.tokensFromHtml(html), { fbDtsg: 'AQHabc:123', lsd: 'lsdTok', revision: '1017' });
  assert.equal(core.tokensFromHtml('nothing here'), null);
  assert.equal(core.tokensFromHtml('"dtsg":{"token":"T"} "LSD",[],{"token":"L"}').fbDtsg, 'T');
  assert.equal(core.jazoest('AB'), '2' + (65 + 66));
});

test('judgeAction tells accepted, blocked and failed answers apart', () => {
  assert.equal(core.judgeAction(200, { status: 'ok', friendship_status: { following: false } }), 'ok');
  assert.equal(core.judgeAction(200, { data: { xdt_destroy_friendship: { friendship_status: { following: false } } } }), 'ok');
  assert.equal(core.judgeAction(429, null), 'blocked');
  assert.equal(core.judgeAction(400, { message: 'feedback_required', status: 'fail' }), 'blocked');
  assert.equal(core.judgeAction(200, { spam: true }), 'blocked');
  assert.equal(core.judgeAction(200, null), 'failed', 'an HTML page is not an answer');
  assert.equal(core.judgeAction(404, { status: 'fail', message: 'not found' }), 'failed');
  assert.equal(core.judgeAction(200, { errors: [{ message: 'x' }] }), 'failed');
});

test('findFollowing digs the following flag out of any answer', () => {
  assert.equal(core.findFollowing({ status: 'ok', friendship_status: { following: false, followed_by: true } }), false);
  assert.equal(core.findFollowing({ data: { x: { friendship_status: { following: true, outgoing_request: false } } } }), true);
  assert.equal(core.findFollowing({ following: true }), null, 'a lone flag without the other fields is ignored');
  assert.equal(core.findFollowing(null), null);
});

test('lostSince and whoLeft find who unfollowed you and is still followed', () => {
  const events = [
    { at: 100, type: 'lost', u: 'a', name: '', priv: false },
    { at: 300, type: 'lost', u: 'a', name: '', priv: false },
    { at: 200, type: 'lost', u: 'b', name: '', priv: false },
    { at: 250, type: 'gained', u: 'c', name: '', priv: false },
    { at: 'x', type: 'lost', u: 'bad', name: '', priv: false },
  ];
  const lost = core.lostSince(events);
  assert.equal(lost.get('a'), 300, 'latest departure wins');
  assert.equal(lost.get('b'), 200);
  assert.equal(lost.has('c'), false);
  assert.equal(lost.has('bad'), false);
  const notback = [{ u: 'b' }, { u: 'a' }, { u: 'z' }];
  const left = core.whoLeft(notback, lost);
  assert.deepEqual(left.map((r) => r.u), ['a', 'b'], 'newest departure first, others dropped');
  assert.equal(left[0].leftAt, 300);
  assert.deepEqual(core.whoLeft([], lost), []);
});

test('computeStats: rate, week change, best and worst check', () => {
  const day = 86400000;
  const now = 20 * day;
  const pts = [
    { at: 1 * day, following: 100, followers: 50, mutual: 40, notback: 60 },
    { at: 10 * day, following: 102, followers: 56, mutual: 45, notback: 57 },
    { at: 15 * day, following: 104, followers: 53, mutual: 46, notback: 58 },
    { at: 19 * day, following: 104, followers: 58, mutual: 48, notback: 56 },
  ];
  const s = core.computeStats(pts, now);
  assert.equal(s.rate, 46, 'mutual over following of the last check');
  assert.deepEqual(s.week, { followers: 2, following: 2, since: 10 * day }, 'compared with the newest check at least a week old');
  assert.deepEqual(s.best, { at: 10 * day, delta: 6 });
  assert.deepEqual(s.worst, { at: 15 * day, delta: -3 });
  assert.equal(s.checks, 4);
  const short = core.computeStats(pts.slice(2), now);
  assert.equal(short.week.since, 15 * day, 'short history compares with the first check');
  const one = core.computeStats([pts[0]], now);
  assert.equal(one.week, null);
  assert.equal(one.best, null);
  assert.equal(core.computeStats([], now), null);
  assert.equal(core.computeStats([{ at: 1, following: 0, followers: 0, mutual: 0, notback: 0 }], now).rate, 0);
});

test('carryMe keeps the username when the account-info request failed', () => {
  assert.equal(core.carryMe({ uid: '1', me: 'new' }, { uid: '1', me: 'old' }), 'new');
  assert.equal(core.carryMe({ uid: '1', me: '' }, { uid: '1', me: 'old' }), 'old');
  assert.equal(core.carryMe({ uid: '1', me: '' }, { uid: '2', me: 'other' }), '', 'never borrow another account’s name');
  assert.equal(core.carryMe({ uid: '1', me: '' }, null), '');
});

test('preCheck reads a friendship answer before an action', () => {
  const p = core.preCheck;
  assert.equal(p('unfollow', { following: true, followed_by: true }), 'follows_you');
  assert.equal(p('unfollow', { following: false, followed_by: false }), 'not_following');
  assert.equal(p('unfollow', { following: true, followed_by: false }), 'go');
  assert.equal(p('unfollow', null), 'unknown');
  assert.equal(p('unfollow', { status: 'ok' }), 'unknown');
  assert.equal(p('follow', { following: false, followed_by: false }), 'left');
  assert.equal(p('follow', { following: true, followed_by: true }), 'already');
  assert.equal(p('follow', { following: false, followed_by: true, outgoing_request: true }), 'requested');
  assert.equal(p('follow', { following: false, followed_by: true }), 'go');
  assert.equal(p('cancel', { following: true, followed_by: false }), 'accepted');
  assert.equal(p('cancel', { following: false, outgoing_request: true }), 'go');
  assert.equal(p('cancel', { following: false, outgoing_request: false }), 'gone');
  assert.equal(p('cancel', { following: false }), 'unknown');
});

test('appendLog caps and drops junk, markUndone flags one entry, UNDO pairs actions', () => {
  let log = core.appendLog(null, { at: 1, u: 'a', type: 'unfollow' }, 3);
  log = core.appendLog(log.concat([null, { u: 'x' }]), { at: 2, u: 'b', type: 'follow' }, 3);
  log = core.appendLog(log, { at: 3, u: 'c', type: 'request' }, 3);
  log = core.appendLog(log, { at: 4, u: 'd', type: 'cancel' }, 3);
  assert.deepEqual(log.map((e) => e.u), ['b', 'c', 'd'], 'oldest dropped at the cap, junk ignored');
  const marked = core.markUndone(log, 3, 'c', 99);
  assert.equal(marked[1].undone, 99);
  assert.equal(marked[0].undone, undefined);
  assert.deepEqual(core.UNDO, { unfollow: 'follow', follow: 'unfollow', request: 'cancel', cancel: 'follow' });
});

test('parsePending reads the export JSON, its HTML page and plain lists', () => {
  const json = JSON.stringify({ relationships_follow_requests_sent: [
    { title: '', string_list_data: [{ href: 'https://www.instagram.com/Some.One', value: 'Some.One', timestamp: 1700000000 }] },
    { title: '', string_list_data: [{ href: 'https://www.instagram.com/other', value: 'other', timestamp: 1700000500 }] },
    { title: '', string_list_data: [{ value: 'some.one', timestamp: 1 }] },
  ] });
  assert.deepEqual(core.parsePending(json), [{ u: 'some.one', ts: 1700000000000 }, { u: 'other', ts: 1700000500000 }]);
  const html = '<html><body><div><a href="https://www.instagram.com/first_one/">first_one</a><div>Nov 14, 2023, 10:13 PM</div></div><div><a href="https://www.instagram.com/second">second</a><div>no date here</div></div></body></html>';
  const fromHtml = core.parsePending(html);
  assert.deepEqual(fromHtml.map((r) => r.u), ['first_one', 'second']);
  assert.equal(fromHtml[0].ts, Date.parse('Nov 14, 2023, 10:13 PM'));
  assert.equal(fromHtml[1].ts, null);
  assert.deepEqual(core.parsePending('@alpha, beta\nbad-name!'), [{ u: 'alpha', ts: null }, { u: 'beta', ts: null }]);
  assert.deepEqual(core.parsePending(''), []);
});

test('mergePending keeps one row per account with the earliest date and any known id', () => {
  const now = 5000;
  const first = core.mergePending([], [{ u: 'a', ts: 3000 }, { u: 'b', ts: null }], now);
  assert.equal(first.added, 2);
  assert.deepEqual(first.pending.map((r) => [r.u, r.ts]), [['a', 3000], ['b', 5000]]);
  const second = core.mergePending(first.pending, [{ u: 'a', ts: 1000, id: '9', name: 'A' }, { u: 'a', ts: 4000 }], now);
  assert.equal(second.added, 0);
  assert.deepEqual(second.pending[0], { u: 'a', id: '9', name: 'A', pic: '', priv: true, ts: 1000 });
  assert.equal(second.pending.length, 2);
});

test('shortNum, followBackOdds, sortRows and pruneCounts', () => {
  assert.deepEqual([0, 950, 3492, 12345, 2500000].map(core.shortNum), ['0', '950', '3.5K', '12K', '2.5M']);
  assert.equal(core.followBackOdds({ fw: 3492, fg: 95 }), 'low', 'big account following few');
  assert.equal(core.followBackOdds({ fw: 50, fg: 0 }), 'low', 'follows nobody');
  assert.equal(core.followBackOdds({ fw: 120, fg: 110 }), 'good');
  assert.equal(core.followBackOdds({ fw: 400, fg: 100 }), 'mid', 'small account, ratio alone is not enough');
  assert.equal(core.followBackOdds(null), '');
  assert.equal(core.followBackOdds({ fw: 1 }), '');
  const rows = [{ u: 'b' }, { u: 'a' }, { u: 'c' }, { u: 'd' }];
  const counts = { a: { fw: 3492, fg: 95 }, b: { fw: 500, fg: 500 }, c: { fw: 10, fg: 0 } };
  assert.deepEqual(core.sortRows(rows, 'name', counts).map((r) => r.u), ['a', 'b', 'c', 'd']);
  assert.deepEqual(core.sortRows(rows, 'followers', counts).map((r) => r.u), ['a', 'b', 'c', 'd'], 'most followers first, unknown last');
  assert.deepEqual(core.sortRows(rows, 'ratio', counts).map((r) => r.u), ['c', 'a', 'b', 'd'], 'following nobody counts as the worst odds');
  assert.deepEqual(core.sortRows(rows, 'ratio', null).map((r) => r.u), ['a', 'b', 'c', 'd'], 'no counts: by name');
  const day = 86400000, now = 100 * day;
  const pruned = core.pruneCounts({ old: { fw: 1, fg: 1, at: now - 20 * day }, x: { fw: 1, fg: 1, at: now - 1 * day }, y: { fw: 2, fg: 2, at: now - 2 * day }, bad: { fw: 'no' }, z: { fw: 3, fg: 3, at: now - 3 * day } }, now, 2, 14 * day);
  assert.deepEqual(Object.keys(pruned), ['x', 'y'], 'stale and junk dropped, newest kept up to the cap');
  assert.deepEqual(core.pruneCounts(null, now, 5, day), {});
});

test('loopsFrom finds accounts you unfollowed and then followed again', () => {
  const ev = (at, type, u) => ({ at, type, u, name: '', priv: false });
  const loops = core.loopsFrom([
    ev(5, 'you_followed', 'a'), ev(1, 'you_unfollowed', 'a'),           // out of order on purpose
    ev(2, 'you_unfollowed', 'b'),                                        // never followed again
    ev(3, 'you_followed', 'c'),                                          // followed without an unfollow before
    ev(4, 'you_unfollowed', 'd'), ev(6, 'you_followed', 'd'), ev(7, 'you_unfollowed', 'd'), // looped, then unfollowed again
    ev(8, 'lost', 'a'), null, { type: 'you_followed' },
  ]);
  assert.deepEqual(loops.get('a'), { unfollowedAt: 1, followedAt: 5 });
  assert.equal(loops.has('b'), false);
  assert.equal(loops.has('c'), false);
  assert.equal(loops.has('d'), false, 'an unfollow after the loop clears the flag until the next follow');
  assert.equal(core.loopsFrom(null).size, 0);
});
