import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeTestDatabase,
  db,
  getBookingsForFlight,
  getSeatLocksForFlight,
  resetTestDatabase,
  seedFlight,
  seedTestUsers,
} from './harness';

test('US-10A: el harness local inicializa, siembra y limpia datos aislados', async () => {
  await resetTestDatabase();
  const users = await seedTestUsers('smoke');
  const seeded = await seedFlight({ tag: 'smoke', seatCount: 2 });

  assert.equal(users.web.email, 'us10a.web.smoke@example.test');
  assert.equal(users.mobile.email, 'us10a.mobile.smoke@example.test');
  assert.equal(await db.seat.count({ where: { aircraftId: seeded.aircraft.id } }), 2);
  assert.equal((await getBookingsForFlight(seeded.flight.id)).length, 0);
  assert.equal((await getSeatLocksForFlight(seeded.flight.id)).length, 0);

  await resetTestDatabase();
  assert.equal(await db.user.count(), 0);
});

after(async () => {
  await resetTestDatabase().catch(() => undefined);
  await closeTestDatabase();
});
