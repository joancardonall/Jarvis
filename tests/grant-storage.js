import assert from 'node:assert/strict';

const hash = letter => letter.repeat(64);
const at = seconds => new Date(Date.UTC(2030, 0, 1, 0, 0, seconds));

// One storage scenario executed against every implementation (the in-memory simulator and real
// PostgreSQL), so the simulator used by the fast tests cannot drift from the SQL in production.
export async function exerciseGrantStorage(storage, owner) {
  const grant = { id: crypto.randomUUID(), owner_id: owner, client_hash: hash('c'),
    redirect_uri: 'http://localhost:3118/callback', code_hash: hash('1'), code_challenge: 'k'.repeat(43), code_expires_at: at(60) };
  const tokens = (access, refresh, from) => ({ access_hash: hash(access), refresh_hash: hash(refresh),
    access_expires_at: at(from + 3600), refresh_expires_at: at(from + 86400) });
  await storage.createGrant(grant);
  const found = await storage.findGrantByCode(grant.code_hash);
  assert.equal(found.id, grant.id);
  assert.equal(found.code_used_at, null);
  assert.equal(new Date(found.code_expires_at).getTime(), at(60).getTime());
  assert.equal(await storage.findGrantByCode(hash('9')), undefined);

  // Expired code is not redeemable; a valid one is redeemable exactly once.
  assert.equal(await storage.redeemCode(grant.code_hash, tokens('a', 'b', 61), at(61)), false);
  assert.equal(await storage.redeemCode(grant.code_hash, tokens('a', 'b', 10), at(10)), true);
  assert.equal(await storage.redeemCode(grant.code_hash, tokens('d', 'e', 11), at(11)), false);
  assert.ok((await storage.findGrantByCode(grant.code_hash)).code_used_at);

  assert.equal((await storage.findGrantByAccess(hash('a'), at(20))).owner_id, owner);
  assert.equal(await storage.findGrantByAccess(hash('a'), at(10 + 3600)), undefined); // expired
  assert.equal(await storage.findGrantByAccess(hash('b'), at(20)), undefined); // a refresh hash is not an access hash

  // Rotation: wrong client refused, right client rotates, replaced access token stops working.
  assert.equal(await storage.rotateRefresh(hash('b'), hash('f'), tokens('d', 'e', 100), at(100), at(40)), false);
  assert.equal(await storage.rotateRefresh(hash('b'), hash('c'), tokens('d', 'e', 100), at(100), at(40)), true);
  assert.equal(await storage.findGrantByAccess(hash('a'), at(101)), undefined);
  assert.ok(await storage.findGrantByAccess(hash('d'), at(101)));
  // Retry with the previous token inside the window; unknown token changes nothing.
  assert.equal(await storage.rotateRefresh(hash('b'), hash('c'), tokens('2', '3', 130), at(130), at(70)), true);
  assert.equal(await storage.rotateRefresh(hash('9'), hash('c'), tokens('4', '5', 131), at(131), at(71)), false);
  assert.ok(await storage.findGrantByAccess(hash('2'), at(132)));
  // Previous token after the window: the grant is revoked for good.
  assert.equal(await storage.rotateRefresh(hash('b'), hash('c'), tokens('4', '5', 200), at(200), at(140)), false);
  assert.equal(await storage.findGrantByAccess(hash('2'), at(201)), undefined);
  assert.equal(await storage.rotateRefresh(hash('3'), hash('c'), tokens('4', '5', 202), at(202), at(142)), false);
  assert.ok((await storage.findGrantByCode(grant.code_hash)).revoked_at);

  // Explicit revocation and expired refresh token on a second grant.
  const second = { ...grant, id: crypto.randomUUID(), code_hash: hash('6') };
  await storage.createGrant(second);
  assert.equal(await storage.redeemCode(second.code_hash, tokens('7', '8', 10), at(10)), true);
  assert.equal(await storage.rotateRefresh(hash('8'), hash('c'), tokens('4', '5', 90000), at(10 + 86400), at(0)), false);
  assert.ok(await storage.findGrantByAccess(hash('7'), at(20)));
  await storage.revokeGrant(second.id, at(30));
  assert.equal(await storage.findGrantByAccess(hash('7'), at(31)), undefined);
  assert.equal(await storage.rotateRefresh(hash('8'), hash('c'), tokens('4', '5', 40), at(40), at(0)), false);
  // A revoked grant's unused code can no longer be redeemed.
  const third = { ...grant, id: crypto.randomUUID(), code_hash: hash('0') };
  await storage.createGrant(third);
  await storage.revokeGrant(third.id, at(5));
  assert.equal(await storage.redeemCode(third.code_hash, tokens('4', '5', 6), at(6)), false);

  // Stolen refresh token replayed inside the retry window: the retry works once, and as soon as
  // the token it displaced appears, the whole grant is revoked (two holders detected).
  const fourth = { ...grant, id: crypto.randomUUID(), code_hash: hash('5') };
  await storage.createGrant(fourth);
  const set = (letters, from) => ({ access_hash: letters[0].repeat(63) + 'a',
    refresh_hash: letters[1].repeat(63) + 'b', access_expires_at: at(from + 3600), refresh_expires_at: at(from + 86400) });
  assert.equal(await storage.redeemCode(fourth.code_hash, set('01', 10), at(10)), true);
  assert.equal(await storage.rotateRefresh(set('01', 0).refresh_hash, hash('c'), set('23', 100), at(100), at(40)), true);
  assert.equal(await storage.rotateRefresh(set('01', 0).refresh_hash, hash('c'), set('45', 110), at(110), at(50)), true);
  assert.ok(await storage.findGrantByAccess(set('45', 0).access_hash, at(111)));
  assert.equal(await storage.rotateRefresh(set('23', 0).refresh_hash, hash('c'), set('67', 120), at(120), at(60)), false);
  assert.equal(await storage.findGrantByAccess(set('45', 0).access_hash, at(121)), undefined);
  assert.equal(await storage.rotateRefresh(set('45', 0).refresh_hash, hash('c'), set('67', 122), at(122), at(62)), false);

  // The retry is granted only once per renewal: a second replay of the same old token revokes.
  const fifth = { ...grant, id: crypto.randomUUID(), code_hash: hash('4') };
  await storage.createGrant(fifth);
  assert.equal(await storage.redeemCode(fifth.code_hash, set('89', 10), at(10)), true);
  assert.equal(await storage.rotateRefresh(set('89', 0).refresh_hash, hash('c'), set('ab', 100), at(100), at(40)), true);
  assert.equal(await storage.rotateRefresh(set('89', 0).refresh_hash, hash('c'), set('cd', 105), at(105), at(45)), true);
  assert.equal(await storage.rotateRefresh(set('89', 0).refresh_hash, hash('c'), set('ef', 106), at(106), at(46)), false);
  assert.equal(await storage.findGrantByAccess(set('cd', 0).access_hash, at(107)), undefined);
  // A normal renewal clears the superseded marker, so later retries work again.
  const sixth = { ...grant, id: crypto.randomUUID(), code_hash: hash('3') };
  await storage.createGrant(sixth);
  const step = (letters, from) => ({ ...set(letters, from), access_hash: letters[0].repeat(62) + 'aa', refresh_hash: letters[1].repeat(62) + 'bb' });
  assert.equal(await storage.redeemCode(sixth.code_hash, step('01', 10), at(10)), true);
  assert.equal(await storage.rotateRefresh(step('01', 0).refresh_hash, hash('c'), step('23', 100), at(100), at(40)), true);
  assert.equal(await storage.rotateRefresh(step('01', 0).refresh_hash, hash('c'), step('45', 101), at(101), at(41)), true);
  assert.equal(await storage.rotateRefresh(step('45', 0).refresh_hash, hash('c'), step('67', 500), at(500), at(440)), true);
  assert.equal(await storage.rotateRefresh(step('45', 0).refresh_hash, hash('c'), step('89', 501), at(501), at(441)), true);
  assert.ok(await storage.findGrantByAccess(step('89', 0).access_hash, at(502)));

  // Kept last: a constraint error aborts the surrounding transaction when one is in use.
  await assert.rejects(storage.createGrant({ ...grant, id: crypto.randomUUID() })); // duplicate code hash
}
