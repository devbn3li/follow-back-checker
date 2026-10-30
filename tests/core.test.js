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

test('diff tells a deactivated account apart from an unfollow', () => {
  const prev = { at: 1, me: 'me', following: rows('mutual', 'onlyfollowing'), followers: rows('mutual', 'onlyfollower') };
  const last = { at: 2, me: 'me', following: rows('newmutual'), followers: rows('newmutual') };
  const d = core.diff(prev, last);
  assert.equal(names(d.gone), 'mutual', 'in both lists before, in neither now');
  assert.equal(names(d.back), 'newmutual', 'in both lists now, in neither before');
  assert.equal(names(d.lost), 'onlyfollower', 'a plain follower that vanished is still an unfollow');
  assert.equal(names(d.youUnfollowed), 'onlyfollowing');
  assert.equal(names(d.gained), '');
  assert.equal(names(d.youFollowed), '');
  const evs = core.eventsFrom(d, 2, new Set());
  const by = (type) => evs.filter((e) => e.type === type).map((e) => e.u).sort().join(',');
  assert.equal(by('deactivated'), 'mutual');
  assert.equal(by('gained'), 'newmutual', 'unknown newcomer in both lists is a new mutual');
  assert.equal(by('you_followed'), 'newmutual');
  assert.equal(by('reactivated'), '');
  const evs2 = core.eventsFrom(d, 2, new Set(['newmutual']));
  assert.equal(evs2.filter((e) => e.type === 'reactivated').map((e) => e.u).join(), 'newmutual', 'a known-away account coming back is reactivated');
  assert.equal(evs2.filter((e) => e.u === 'newmutual' && e.type !== 'reactivated').length, 0);
});

test('a known-away account that returns in one list only is back, then unfollowed or was unfollowed', () => {
  const by = (evs, type) => evs.filter((e) => e.type === type).map((e) => e.u).sort().join(',');
  const prev = { at: 1, me: 'me', following: rows('x'), followers: rows('y') };
  // d came back to both lists and then unfollowed you before this check: it is in following only now.
  const last = { at: 2, me: 'me', following: rows('x', 'd'), followers: rows('y') };
  const evs = core.eventsFrom(core.diff(prev, last), 2, new Set(['d']));
  assert.equal(by(evs, 'reactivated'), 'd');
  assert.equal(by(evs, 'lost'), 'd', 'it unfollowed you after coming back');
  assert.equal(by(evs, 'you_followed'), '', 'never recorded as your own follow');
  assert.equal(core.goneSet([{ at: 1, type: 'deactivated', u: 'd' }].concat(evs)).size, 0);
  assert.deepEqual(core.reactivations([{ at: 1, type: 'deactivated', u: 'd' }].concat(evs)).get('d'), { goneAt: 1, backAt: 2 });
  assert.equal(core.lostSince(evs).get('d'), 2);
  // The mirror: back in followers only means you unfollowed it after it came back.
  const last2 = { at: 3, me: 'me', following: rows('x'), followers: rows('y', 'd') };
  const evs2 = core.eventsFrom(core.diff(prev, last2), 3, new Set(['d']));
  assert.equal(by(evs2, 'reactivated'), 'd');
  assert.equal(by(evs2, 'you_unfollowed'), 'd');
  assert.equal(by(evs2, 'gained'), '');
  // An unknown account in one list is still a plain follow.
  const evs3 = core.eventsFrom(core.diff(prev, last), 2, new Set());
  assert.equal(by(evs3, 'you_followed'), 'd');
  assert.equal(by(evs3, 'reactivated'), '');
});

test('goneSet, reactivations and groupEvents follow the new event types', () => {
  const evs = [
    { at: 1, type: 'deactivated', u: 'a', name: '', priv: false },
    { at: 2, type: 'deactivated', u: 'b', name: '', priv: false },
    { at: 3, type: 'reactivated', u: 'a', name: '', priv: false },
  ];
  assert.deepEqual([...core.goneSet(evs)], ['b']);
  assert.deepEqual(core.reactivations(evs).get('a'), { goneAt: 1, backAt: 3 });
  assert.equal(core.reactivations(evs).has('b'), false);
  const g = core.groupEvents(evs);
  assert.equal(g[0].reactivated, 1);
  assert.equal(g[2].deactivated, 1);
});

test('reclassifyEvents folds old lost+you_unfollowed pairs into deactivated/reactivated', () => {
  const old = [
    { at: 10, type: 'lost', u: 'x', name: 'X', priv: false },
    { at: 10, type: 'you_unfollowed', u: 'x', name: 'X', priv: false },
    { at: 10, type: 'lost', u: 'real', name: '', priv: false },
    { at: 20, type: 'gained', u: 'x', name: 'X', priv: false },
    { at: 20, type: 'you_followed', u: 'x', name: 'X', priv: false },
    { at: 20, type: 'gained', u: 'fresh', name: '', priv: false },
    { at: 20, type: 'you_followed', u: 'fresh', name: '', priv: false },
  ];
  const fixed = core.reclassifyEvents(old);
  const list = fixed.map((e) => e.type + ':' + e.u + '@' + e.at).sort();
  assert.deepEqual(list, ['deactivated:x@10', 'gained:fresh@20', 'lost:real@10', 'reactivated:x@20', 'you_followed:fresh@20']);
  assert.equal(core.reclassifyEvents(fixed), fixed, 'idempotent: the same array comes back');
  const untouched = [{ at: 1, type: 'lost', u: 'q', name: '', priv: false }];
  assert.equal(core.reclassifyEvents(untouched), untouched);
});

test('goneSet, reactivations and reclassifyEvents survive damaged entries', () => {
  const junk = [null, { type: 'deactivated' }, { at: 'x', type: 'deactivated', u: 'a', name: '', priv: false }];
  const good = { at: 5, type: 'deactivated', u: 'b', name: '', priv: false };
  assert.deepEqual([...core.goneSet(junk.concat([good]))], ['b']);
  assert.equal(core.goneSet(null).size, 0);
  assert.equal(core.reactivations(junk).size, 0);
  assert.deepEqual(core.reclassifyEvents(junk.concat([good])), [good], 'damaged entries are dropped, which counts as a change');
  assert.equal(core.reclassifyEvents([good])[0], good, 'a clean history comes back as is');
});

// A small zip built by hand (local headers, central directory, end record), like a real export.
function zipOf(entries) {
  const zlib = require('node:zlib');
  const locals = [], centrals = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), raw = Buffer.from(e.text, 'utf8');
    const data = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, data); centrals.push(ch, name);
    off += lh.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('zipEntries and zipText read stored and deflated entries of an export zip', async () => {
  const following = JSON.stringify({ relationships_following: [{ title: 'alice', string_list_data: [{ href: 'https://www.instagram.com/alice', value: 'alice', timestamp: 1700000000 }] }] });
  const followers = JSON.stringify([{ title: '', string_list_data: [{ href: 'https://www.instagram.com/bob', value: 'bob', timestamp: 1600000000 }] }]);
  const zip = zipOf([
    { name: 'connections/followers_and_following/following.json', text: following, deflate: true },
    { name: 'connections/followers_and_following/followers_1.json', text: followers, deflate: false },
    { name: 'connections/followers_and_following/pending_follow_requests.json', text: '[]', deflate: true },
    { name: '__MACOSX/connections/followers_and_following/._following.json', text: 'junk', deflate: false },
    { name: 'media/posts/1.jpg', text: 'not a list', deflate: false },
  ]);
  const entries = core.zipEntries(new Uint8Array(zip));
  assert.equal(entries.length, 5);
  const lists = core.exportListEntries(entries).map((e) => e.name.split('/').pop()).sort();
  assert.deepEqual(lists, ['followers_1.json', 'following.json']);
  const texts = {};
  for (const e of core.exportListEntries(entries)) texts[e.name.split('/').pop()] = await core.zipText(e);
  assert.equal(texts['following.json'], following, 'deflated entry');
  assert.equal(texts['followers_1.json'], followers, 'stored entry');
  assert.deepEqual(core.parsePending(texts['following.json']), [{ u: 'alice', ts: 1700000000000 }]);
  assert.deepEqual(core.zipEntries(new Uint8Array([1, 2, 3])), [], 'not a zip');
  assert.deepEqual(core.zipEntries(Buffer.from('PK\u0003\u0004 truncated garbage that is long enough')), []);
  // The pieces a page uses to read a big zip through File.slice: the tail, the directory, one local header.
  const e = core.zipFindEocd(zip.subarray(zip.length - 40), zip.length);
  assert.equal(e.count, 5);
  assert.equal(core.zipCentral(zip.subarray(e.cdOffset, e.cdOffset + e.cdSize), e.count).length, 5);
  assert.equal(core.zipDataStart(zip.subarray(0, 30)), 30 + 'connections/followers_and_following/following.json'.length);
  assert.equal(core.zipDataStart(new Uint8Array(30)), -1);
  assert.equal(core.zipFindEocd(zip.subarray(zip.length - 40), 10), null, 'directory beyond the file');
});

test('follow dates: from the checks, from the export, and what a row shows', () => {
  const ev = (at, type, u) => ({ at, type, u, name: '', priv: false });
  let d = core.applyDateEvents(core.emptyDates(100), [ev(200, 'you_followed', 'a'), ev(200, 'gained', 'b'), ev(300, 'you_followed', 'c'), ev(400, 'you_unfollowed', 'a'), ev(400, 'lost', 'b'), ev(500, 'deactivated', 'c'), null]);
  assert.deepEqual(d.following, { c: { at: 300, x: false } }, 'unfollowed accounts drop out, deactivation keeps the date');
  assert.deepEqual(d.followers, {});
  assert.equal(d.floor, 100);
  assert.deepEqual(core.sinceOf(d, 'following', 'c'), { at: 300, exact: false, before: false });
  assert.deepEqual(core.sinceOf(d, 'following', 'old'), { at: 100, exact: false, before: true }, 'already there at the first check');
  assert.equal(core.sinceOf(core.emptyDates(0), 'following', 'old'), null, 'no first check known');
  assert.equal(core.sinceOf(null, 'following', 'x'), null);
  const imp = core.importDates(d, [{ u: 'c', ts: 250 }, { u: 'old', ts: 50 }, { u: 'nodate', ts: null }, null], 'following', 999);
  assert.equal(imp.added, 2);
  assert.deepEqual(core.sinceOf(imp.dates, 'following', 'c'), { at: 250, exact: true, before: false }, 'the export is exact and wins');
  assert.deepEqual(core.sinceOf(imp.dates, 'following', 'old'), { at: 50, exact: true, before: false });
  assert.equal(imp.dates.importedAt, 999);
  assert.deepEqual(imp.dates.followers, {}, 'the other list is untouched');
  assert.equal(core.importDates(imp.dates, [], 'followers', 1000).dates.importedAt, 999, 'nothing added, date kept');
  const later = core.applyDateEvents(imp.dates, [ev(2000, 'you_unfollowed', 'c'), ev(2100, 'you_followed', 'c')]);
  assert.deepEqual(core.sinceOf(later, 'following', 'c'), { at: 2100, exact: false, before: false }, 'a new follow after the export restarts the clock');
});

test('guessListKind reads the file name, then the overlap with your lists', () => {
  const snap = { following: rows('a', 'b', 'c'), followers: rows('c', 'd') };
  assert.equal(core.guessListKind('following.json', [], null), 'following');
  assert.equal(core.guessListKind('followers_1.json', [], null), 'followers');
  assert.equal(core.guessListKind('followers_2.html', [], null), 'followers');
  assert.equal(core.guessListKind('export.json', [{ u: 'a' }, { u: 'b' }, { u: 'd' }], snap), 'following');
  assert.equal(core.guessListKind('export.json', [{ u: 'd' }, { u: 'zzz' }], snap), 'followers');
  assert.equal(core.guessListKind('export.json', [{ u: 'zzz' }], snap), null);
  assert.equal(core.guessListKind('export.json', [{ u: 'a' }], null), null);
});

test('sortRows since: longest follow first, undated rows last', () => {
  const list = rows('new', 'old', 'nodate', 'mid');
  const since = (u) => ({ new: { at: 300 }, old: { at: 100 }, mid: { at: 200 } }[u] || null);
  assert.deepEqual(core.sortRows(list, 'since', {}, since).map((r) => r.u), ['old', 'mid', 'new', 'nodate']);
  assert.deepEqual(core.sortRows(list, 'since', {}, null).map((r) => r.u), ['mid', 'new', 'nodate', 'old'], 'no dates: by name');
});

test('picCandidates tries the generic picture host when the link points at an ISP cache host', () => {
  const q = '?stp=dst-jpg_s150x150&_nc_ht=instagram.fcai19-1.fna.fbcdn.net&oh=00_abc&oe=68B0C8DF';
  const fna = 'https://instagram.fcai19-1.fna.fbcdn.net/v/t51.2885-19/1_n.jpg' + q;
  assert.deepEqual(core.picCandidates(fna), ['https://scontent.cdninstagram.com/v/t51.2885-19/1_n.jpg' + q, fna], 'generic first, the cache host as fallback, query untouched');
  const scontent = 'https://scontent-fra3-1.cdninstagram.com/v/t51.2885-19/2_n.jpg?oh=x&oe=y';
  assert.deepEqual(core.picCandidates(scontent), [scontent, 'https://scontent.cdninstagram.com/v/t51.2885-19/2_n.jpg?oh=x&oe=y'], 'the given link first, the generic host as fallback');
  const generic = 'https://scontent.cdninstagram.com/v/t51.2885-19/3_n.jpg?oh=x';
  assert.deepEqual(core.picCandidates(generic), [generic]);
  assert.deepEqual(core.picCandidates('http://example.com/a.jpg'), ['http://example.com/a.jpg']);
  assert.deepEqual(core.picCandidates('not a url'), ['not a url']);
  assert.deepEqual(core.picCandidates(''), []);
  assert.deepEqual(core.picCandidates(null), []);
});

test('shouldAutoCheck and autoCheckDefault', () => {
  const day = 86400000, now = 10 * day;
  const base = { enabled: true, lastAt: now - 4 * day, now, running: false, cooldownUntil: 0, maxAgeMs: 3 * day, ranAlready: false };
  assert.equal(core.shouldAutoCheck(base), true);
  assert.equal(core.shouldAutoCheck(Object.assign({}, base, { lastAt: now - 2 * day })), false, 'recent enough');
  assert.equal(core.shouldAutoCheck(Object.assign({}, base, { lastAt: 0 })), true, 'never checked');
  assert.equal(core.shouldAutoCheck(Object.assign({}, base, { enabled: false })), false);
  assert.equal(core.shouldAutoCheck(Object.assign({}, base, { running: true })), false);
  assert.equal(core.shouldAutoCheck(Object.assign({}, base, { ranAlready: true })), false);
  assert.equal(core.shouldAutoCheck(Object.assign({}, base, { cooldownUntil: now + 1000 })), false, 'Instagram asked for a pause');
  assert.equal(core.shouldAutoCheck(null), false);
  assert.equal(core.autoCheckDefault('android'), true);
  assert.equal(core.autoCheckDefault('extension'), false);
});

test('compareVersions and parseRelease', () => {
  assert.equal(core.compareVersions('1.10.2', '1.9.9'), 1);
  assert.equal(core.compareVersions('v1.0.16', '1.0.16'), 0);
  assert.equal(core.compareVersions('1.0.9', '1.0.16'), -1);
  assert.equal(core.compareVersions('', '1.0.0'), -1);
  const rel = {
    tag_name: 'v1.0.17', html_url: 'https://github.com/devbn3li/follow-back-checker/releases/tag/v1.0.17',
    body: 'Script version 1.11.0\n\n## What changed', published_at: '2026-10-25T10:00:00Z',
    assets: [
      { name: 'FollowCheck-v1.0.17.apk', browser_download_url: 'https://x/apk' },
      { name: 'follow-back-checker-extension-v1.0.17.zip', browser_download_url: 'https://x/ext' },
      { name: 'follow-back-checker.user.js', browser_download_url: 'https://x/user' },
    ],
  };
  const android = core.parseRelease(rel, { host: 'android', app: '1.0.16', script: '1.10.1' });
  assert.equal(android.newer, true);
  assert.equal(android.get, 'https://x/apk');
  assert.equal(core.parseRelease(rel, { host: 'android', app: '1.0.17', script: '1.0.0' }).newer, false, 'same APK');
  assert.equal(core.parseRelease(rel, { host: 'android', app: '', script: '1.0.0' }).newer, false, 'unknown app version');
  const ext = core.parseRelease(rel, { host: 'extension', script: '1.10.1' });
  assert.equal(ext.newer, true);
  assert.equal(ext.get, 'https://x/ext');
  assert.equal(core.parseRelease(rel, { host: 'extension', script: '1.11.0' }).newer, false);
  assert.equal(core.parseRelease(Object.assign({}, rel, { body: 'no version line' }), { host: 'extension', script: '0.0.1' }).newer, false, 'release notes without a script version never nag');
  assert.equal(core.parseRelease(rel, { host: 'bookmarklet', script: '0.0.1' }).newer, false);
  assert.equal(core.parseRelease(Object.assign({}, rel, { prerelease: true }), { host: 'android', app: '1.0.0' }), null);
  assert.equal(core.parseRelease(Object.assign({}, rel, { tag_name: 'nightly' }), { host: 'android', app: '1.0.0' }), null);
  assert.equal(core.parseRelease(null, { host: 'android' }), null);
  assert.equal(core.parseRelease(Object.assign({}, rel, { assets: [] }), { host: 'android', app: '1.0.0' }).get, rel.html_url, 'no asset: the release page');
});

test('parsePending reads the 2026 export shape with label_values and takes fbid as the id', () => {
  const json = JSON.stringify([
    { timestamp: 1792900154, media: [], label_values: [{ label: 'URL', value: '' }, { label: 'Name', value: 'Some One' }, { label: 'Username', value: 'Some.One' }], fbid: '17841467683111290' },
    { timestamp: 1792900000, media: [], label_values: [{ label: 'Username', value: 'other' }], fbid: 'not-a-number' },
    { timestamp: 1, media: [], label_values: [{ label: 'Name', value: 'no username here' }] },
  ]);
  assert.deepEqual(core.parsePending(json), [
    { u: 'some.one', ts: 1792900154000, id: '17841467683111290' },
    { u: 'other', ts: 1792900000000 },
  ]);
});

test('pickExportEntry finds one export file in the zip, json before html', () => {
  const entries = [
    { name: 'connections/followers_and_following/pending_follow_requests.html' },
    { name: '__MACOSX/connections/followers_and_following/._pending_follow_requests.json' },
    { name: 'connections/followers_and_following/pending_follow_requests.json' },
    { name: 'connections/followers_and_following/recently_unfollowed_profiles.json' },
    { name: 'connections/followers_and_following/following.json' },
  ];
  assert.equal(core.pickExportEntry(entries, 'pending_follow_requests').name, 'connections/followers_and_following/pending_follow_requests.json');
  assert.equal(core.pickExportEntry(entries.slice(0, 1), 'pending_follow_requests').name, entries[0].name, 'html when it is the only one');
  assert.equal(core.pickExportEntry(entries, 'recently_unfollowed_profiles').name, entries[3].name);
  assert.equal(core.pickExportEntry(entries, 'followers_1'), null);
  assert.equal(core.pickExportEntry(null, 'x'), null);
});

test('guessListKind reads the base name, not the folder that holds every list', () => {
  assert.equal(core.guessListKind('connections/followers_and_following/followers_1.json', [], null), 'followers');
  assert.equal(core.guessListKind('connections/followers_and_following/following.json', [], null), 'following');
  assert.equal(core.guessListKind('followers.html', [], null), 'followers');
});

test('parsePending takes the username from the title or the link when value is missing', () => {
  const json = JSON.stringify({ relationships_following: [
    { title: 'From.Title', string_list_data: [{ href: 'https://www.instagram.com/From.Title', timestamp: 1700000001 }] },
    { title: '', string_list_data: [{ href: 'https://www.instagram.com/from_link/', timestamp: 1700000002 }] },
    { title: 'ignored', string_list_data: [{ href: 'https://www.instagram.com/x', value: 'from_value', timestamp: 1700000003 }] },
  ] });
  assert.deepEqual(core.parsePending(json), [
    { u: 'from.title', ts: 1700000001000 },
    { u: 'from_link', ts: 1700000002000 },
    { u: 'from_value', ts: 1700000003000 },
  ]);
});

test('parsePending reads /_u/ profile links in the JSON and the HTML export', () => {
  const json = JSON.stringify({ relationships_following: [{ title: '', string_list_data: [{ href: 'https://www.instagram.com/_u/via_u', timestamp: 1700000004 }] }] });
  assert.deepEqual(core.parsePending(json), [{ u: 'via_u', ts: 1700000004000 }]);
  const html = '<div><a target="_blank" href="https://www.instagram.com/_u/html_u">html_u</a></div><div>Oct 25, 2026 7:24 am</div>';
  assert.deepEqual(core.parsePending(html).map((r) => r.u), ['html_u']);
});

test('zipReadFile reads only the picked entries of a zip Blob, through slice', async () => {
  const following = JSON.stringify({ relationships_following: [{ title: 'alice', string_list_data: [{ href: 'https://www.instagram.com/alice', timestamp: 1700000000 }] }] });
  const zip = zipOf([
    { name: 'connections/followers_and_following/following.json', text: following, deflate: true },
    { name: 'media/posts/big.jpg', text: 'x'.repeat(5000) },
    { name: 'connections/followers_and_following/followers_1.json', text: '[]' },
  ]);
  const blob = new Blob([zip]);
  const read = [];
  const spy = { size: blob.size, slice: (a, b) => { read.push(b - a); return blob.slice(a, b); } };
  const files = await core.zipReadFile(spy);
  assert.deepEqual(files.map((f) => f.name.split('/').pop()).sort(), ['followers_1.json', 'following.json']);
  assert.deepEqual(core.parsePending(files.find((f) => /following/.test(f.name)).text), [{ u: 'alice', ts: 1700000000000 }]);
  assert.ok(!read.includes(5000), 'the media entry is never read');
  const picked = await core.zipReadFile(blob, (all) => all.filter((e) => /followers_1/.test(e.name)));
  assert.deepEqual(picked, [{ name: 'connections/followers_and_following/followers_1.json', text: '[]' }]);
  assert.equal(await core.zipReadFile(new Blob(['not a zip'])), null);
});

test('slimSnap keeps what a comparison needs and drops pictures and ids', () => {
  const snap = { at: 5, uid: '9', me: 'me', following: [{ u: 'a', id: '1', name: 'A', priv: true, ver: true, pic: 'https://x/very/long' }], followers: [{ u: 'b', id: '2', pic: 'https://y' }, null] };
  const slim = core.slimSnap(snap);
  assert.deepEqual(slim, { at: 5, uid: '9', me: 'me', following: [{ u: 'a', name: 'A', priv: true }], followers: [{ u: 'b', name: '', priv: false }] });
  assert.ok(core.isSnap(slim));
  assert.equal(snap.following[0].pic, 'https://x/very/long', 'the snapshot itself is untouched');
  assert.equal(core.slimSnap(null), null);
  assert.equal(core.slimSnap({ at: 1 }), null);
  const prev = { at: 1, following: [{ u: 'a' }, { u: 'gone' }], followers: [{ u: 'gone' }] };
  const last = { at: 2, following: [{ u: 'a' }], followers: [] };
  const who = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.map((r) => r.u) : v]));
  assert.deepEqual(who(core.diff(core.slimSnap(prev), last)), who(core.diff(prev, last)), 'the same changes either way');
});
