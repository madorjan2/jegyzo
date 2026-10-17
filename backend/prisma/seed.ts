import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const YEAR = new Date().getFullYear();
const HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES ?? 10);
const SERVICE_FEE = Number(process.env.SERVICE_FEE_PER_TICKET ?? 250);

// Deterministic seat index helper:一间 venue's section's seat ids, resolved
// at booking time from the precomputed structure.
interface SeatRef { venueIdx: number; sectionIdx: number; rowIdx?: number; num?: number }

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('Seed already loaded; skipping.');
    return;
  }

  const pw = (v: string) => bcrypt.hash(v, Number(process.env.BCRYPT_ROUNDS ?? 10));

  // 1 — Users (fixed order = fixed ids 1..7)
  const users = [
    { email: 'admin@jegyzo.local', pwv: 'Admin1234', fullName: 'Rendszer Admin', role: 'ADMIN' as const, locale: 'hu' as const, isActive: true },
    { email: 'szervezo@jegyzo.local', pwv: 'Szervezo1234', fullName: 'Kovács Anna', role: 'SZERVEZO' as const, locale: 'hu' as const, isActive: true },
    { email: 'szervezo2@jegyzo.local', pwv: 'Szervezo1234', fullName: 'Nagy Béla', role: 'SZERVEZO' as const, locale: 'hu' as const, isActive: true },
    { email: 'vasarlo@jegyzo.local', pwv: 'Vasarlo1234', fullName: 'Szabó Péter', role: 'VASARLO' as const, locale: 'hu' as const, isActive: true },
    { email: 'vevő2@jegyzo.local', pwv: 'Vasarlo1234', fullName: 'Tóth Kata', role: 'VASARLO' as const, locale: 'hu' as const, isActive: true },
    { email: 'buyer@jegyzo.local', pwv: 'Vasarlo1234', fullName: 'John Smith', role: 'VASARLO' as const, locale: 'en' as const, isActive: true },
    { email: 'inaktiv@jegyzo.local', pwv: 'Vasarlo1234', fullName: 'Régi Felhasználó', role: 'VASARLO' as const, locale: 'hu' as const, isActive: false },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: {
        email: u.email, passwordHash: await pw(u.pwv), fullName: u.fullName,
        role: u.role, locale: u.locale, isActive: u.isActive,
      },
    });
  }

  // 2 — Venues + sections + rows + seats
  const venueSpecs = [
    {
      name: 'Papp László Budapest Sportaréna', city: 'Budapest', address: 'Stadionok útja 2.',
      isActive: true,
      sections: [
        { name: 'Erkély A', kind: 'ULOHELYES' as const, rows: ['A', 'B', 'C', 'D', 'E', 'F'], perRow: 50 },
        { name: 'Erkély B', kind: 'ULOHELYES' as const, rows: ['A', 'B', 'C', 'D', 'E', 'F'], perRow: 50 },
        { name: 'Küzdőtér', kind: 'ALLOHELYES' as const, capacity: 400 },
      ],
    },
    {
      name: 'Müpa – Bartók Béla Nemzeti Hangversenyterem', city: 'Budapest', address: 'Pázmány Péter sétány 1.',
      isActive: true,
      sections: [
        { name: 'Földszint', kind: 'ULOHELYES' as const, rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], perRow: 20 },
        { name: 'Karzat', kind: 'ULOHELYES' as const, rows: ['A', 'B', 'C', 'D', 'E'], perRow: 20 },
      ],
    },
    {
      name: 'A38 Hajó', city: 'Budapest', address: 'Petőfi híd budai hídfő',
      isActive: true,
      sections: [{ name: 'Fedélzet', kind: 'ALLOHELYES' as const, capacity: 500 }],
    },
    {
      name: 'Szegedi Szabadtéri Színpad', city: 'Szeged', address: 'Deák Ferenc u. 6.',
      isActive: true,
      sections: [{ name: 'Nézőtér', kind: 'ULOHELYES' as const, rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], perRow: 25 }],
    },
    {
      name: 'Megszűnt Rendezvényhelyszín', city: 'Debrecen', address: 'Kossuth tér 1.',
      isActive: false,
      sections: [],
    },
  ];

  // venueData[venueIdx] = { sections: [{ id, seatIdsByRow: Map<label, id[]> }] }
  const venueData: { sections: { id: number; kind: string; seatIds: number[] }[] }[] = [];
  for (const spec of venueSpecs) {
    let totalCapacity = 0;
    for (const sec of spec.sections) {
      totalCapacity += sec.kind === 'ULOHELYES' ? sec.rows.length * sec.perRow : sec.capacity;
    }
    const venue = await prisma.venue.create({
      data: {
        name: spec.name, city: spec.city, address: spec.address,
        isActive: spec.isActive, totalCapacity,
      },
    });
    const sections: { id: number; kind: string; seatIds: number[] }[] = [];
    for (let s = 0; s < spec.sections.length; s++) {
      const sec = spec.sections[s];
      if (sec.kind === 'ULOHELYES') {
        const section = await prisma.section.create({
          data: { venueId: venue.id, name: sec.name, kind: sec.kind, position: s },
        });
        const seatIds: number[] = [];
        for (let r = 0; r < sec.rows.length; r++) {
          const row = await prisma.row.create({
            data: { sectionId: section.id, label: sec.rows[r], position: r },
          });
          for (let n = 1; n <= sec.perRow; n++) {
            const seat = await prisma.seat.create({
              data: { rowId: row.id, number: n, label: `${sec.rows[r]}${n}` },
            });
            seatIds.push(seat.id);
          }
        }
        sections.push({ id: section.id, kind: sec.kind, seatIds });
      } else {
        const section = await prisma.section.create({
          data: { venueId: venue.id, name: sec.name, kind: sec.kind, capacity: sec.capacity, position: s },
        });
        sections.push({ id: section.id, kind: sec.kind, seatIds: [] });
      }
    }
    venueData.push({ sections });
  }

  // 3 — Events (offset days, so the seed dataset stays "alive")
  const DAY = 86_400_000;
  const now = Date.now();
  const eventSpecs = [
    // [name, category, venueIdx(0-based), offsetDays, status, organizerSeq(1-based), durMin, poster]
    ['Budapest Rock Fesztivál 2026', 'KONCERT', 0, 30, 'PUBLIKALT' as const, 2, 180, 'rock'],
    ['Beethoven: IX. szimfónia', 'KONCERT', 1, 14, 'PUBLIKALT' as const, 2, 120, 'classical'],
    ['Elektronikus Éjszaka', 'KONCERT', 2, 7, 'PUBLIKALT' as const, 3, 240, 'electronic'],
    ['Néptánc Gála', 'SZINHAZ', 3, 45, 'PUBLIKALT' as const, 2, 150, 'folk'],
    ['Döntetlen – író-olvasó találkozó', 'EGYEB', 1, 3, 'PISZKOZAT' as const, 3, 90, 'talk'],
    ['Téli Fesztivál (előző évi)', 'FESZTIVAL', 0, -60, 'LEZAJLT' as const, 2, 180, 'festival'],
    ['Lemondott Koncert', 'KONCERT', 0, 20, 'LEMONDVA' as const, 2, 180, 'concert'],
    ['Telt Ház Próba', 'KONCERT', 2, 10, 'PUBLIKALT' as const, 3, 120, 'band'],
    ['Jegy nélküli Szünet', 'KONCERT', 0, 25, 'ERTEKESITES_SZUNETELT' as const, 2, 150, 'concert'],
    ['Publikálatlan Vázlat', 'EGYEB', 2, 5, 'PISZKOZAT' as const, 3, 90, 'talk'],
  ] as const;
  for (let e = 0; e < eventSpecs.length; e++) {
    const [name, category, venueIdx, offsetDays, status, organizerSeq, durMin, poster] = eventSpecs[e];
    const startsAt = new Date(now + offsetDays * DAY);
    const endsAt = new Date(startsAt.getTime() + durMin * 60_000);
    const salesStartAt = new Date(Math.min(now, startsAt.getTime() - 30 * DAY));
    await prisma.event.create({
      data: {
        name, category, venueId: venueIdx + 1, organizerUserId: organizerSeq,
        startsAt, durationMinutes: durMin, endsAt,
        posterUrl: `/posters/${poster}.jpg`,
        description:
          'Ez a demo esemény részletes leírása a Jegyzo sandbox adatkészletben: ' +
          'hosszabb, mint a publikáláshoz szükséges ötven karakter, és jól kereshető ékezetes szavakat tartalmaz.',
        status, salesStartAt, salesEndAt: startsAt,
        publishedAt: status === 'PISZKOZAT' ? null : new Date(now),
      },
    });
  }

  // 4 — TicketTypes
  // [eventId(1-based), venueIdx(0-based), sectionIdx(0-based within venue), name, price, kind, capacity, maxPerUser, active]
  const ticketTypeSpecs = [
    [1, 0, 0, 'Erkély A jegy', 12_500, 'ULOHELYES', null, 8, true],
    [1, 0, 1, 'Erkély B jegy', 9_900, 'ULOHELYES', null, 8, true],
    [1, 0, 2, 'Állóhely', 7_500, 'ALLOHELYES', 400, 8, true],
    [2, 1, 0, 'Földszint', 15_000, 'ULOHELYES', null, 6, true],
    [2, 1, 1, 'Karzat', 8_500, 'ULOHELYES', null, 6, true],
    [3, 2, 0, 'Belépő', 6_000, 'ALLOHELYES', 500, 4, true],
    [4, 3, 0, 'Nézőtér', 4_500, 'ULOHELYES', null, 8, true],
    [8, 2, 0, 'Belépő', 6_500, 'ALLOHELYES', 10, 2, true],
    [9, 0, 0, 'Erkély A jegy', 11_000, 'ULOHELYES', null, 8, true],
    [6, 0, 0, 'Erkély A jegy (lezárt)', 10_000, 'ULOHELYES', null, 8, false],
  ] as const;

  interface TtRow { eventId: number; sectionId: number; name: string; price: number; capacity: number | null; maxPerUser: number; isActive: boolean }
  const ttRows: TtRow[] = [];
  for (let i = 0; i < ticketTypeSpecs.length; i++) {
    const [eventId, venueIdx, sectionIdx, name, price, , capacity, maxPerUser, isActive] = ticketTypeSpecs[i];
    const sectionId = venueData[venueIdx].sections[sectionIdx].id;
    const tt = await prisma.ticketType.create({
      data: { eventId, sectionId, name, price, capacity, maxPerUser, isActive },
    });
    ttRows.push({ eventId, sectionId, name, price, capacity, maxPerUser, isActive });
    void tt;  // rely on autoincrement ids matching insertion order
  }

  // 6 — SeatStates for non-draft, seated events
  const SEATED_PUBLISHED = [1, 2, 4, 6, 7, 9];
  for (const eventId of SEATED_PUBLISHED) {
    const [, , venueIdx] = eventSpecs[eventId - 1];
    for (const section of venueData[venueIdx].sections) {
      for (const seatId of section.seatIds) {
        await prisma.seatState.create({ data: { eventId, seatId, state: 'SZABAD' } });
      }
    }
  }

  // 6 — Bookings + payments + tickets + ledger
  const HOLD_AT = new Date(now + HOLD_MINUTES * 60_000);
  const holdTime = new Date(now + HOLD_MINUTES * 60_000);
  void holdTime;

  const code = (n: number) => `JGY-${YEAR}-${String(n).padStart(6, '0')}`;

  function ttIndex(eventId: number, venueIdx: number, sectionIdx: number): number {
    for (let i = 0; i < ticketTypeSpecs.length; i++) {
      const t = ticketTypeSpecs[i];
      if (t[0] === eventId && t[1] === venueIdx && t[2] === sectionIdx) return i;
    }
    throw new Error(`No TicketType spec for event=${eventId} venue=${venueIdx} section=${sectionIdx}`);
  }

  interface BkRow {
    seq: number; userId: number; eventId: number;
    status: 'ZAROLT' | 'FIZETVE' | 'LEJART' | 'LEMONDVA' | 'VISSZATERITVE';
    items: { ttIdx: number; qty: number; seat: SeatRef | null }[];
    holdAt?: Date;
  }

  const seatIdsFor = (ref: SeatRef): number => {
    const section = venueData[ref.venueIdx].sections[ref.sectionIdx];
    if (section.seatIds.length === 0) throw new Error(`Section has no seats: ${JSON.stringify(ref)}`);
    if (ref.rowIdx === undefined || ref.num === undefined) throw new Error('SeatRef needs rowIdx and num');
    return section.seatIds[ref.rowIdx * 50 + (ref.num - 1)];
  };

  async function makeBooking(row: BkRow) {
    let qty = 0, subtotal = 0;
    const itemRows: { ticketTypeId: number; seatId: number | null; quantity: number; unitPrice: number; lineTotal: number }[] = [];
    for (const it of row.items) {
      const spec = ticketTypeSpecs[it.ttIdx];
      void spec;
      const unitPrice = ttRows[it.ttIdx].price;
      subtotal += unitPrice * it.qty;
      qty += it.qty;
      itemRows.push({
        ticketTypeId: it.ttIdx + 1,
        seatId: it.seat ? seatIdsFor(it.seat) : null,
        quantity: it.qty,
        unitPrice,
        lineTotal: unitPrice * it.qty,
      });
    }
    const serviceFee = SERVICE_FEE * qty;
    const holdAt = row.holdAt ?? HOLD_AT;
    const booking = await prisma.booking.create({
      data: {
        code: code(row.seq), userId: row.userId, eventId: row.eventId,
        status: row.status, subtotal, serviceFee, total: subtotal + serviceFee,
        currency: 'HUF', holdExpiresAt: holdAt,
        paidAt: row.status === 'FIZETVE' || row.status === 'VISSZATERITVE' ? new Date(now) : null,
        canceledAt: row.status === 'LEMONDVA' ? new Date(now) : null,
      },
    });
    for (const it of itemRows) {
      await prisma.bookingItem.create({ data: { bookingId: booking.id, ...it } });
    }

    // Seat states — upsert over the SZABAD baseline created above.
    for (const it of row.items) {
      if (it.seat) {
        const seatId = seatIdsFor(it.seat);
        const state = row.status === 'FIZETVE' || row.status === 'VISSZATERITVE' ? 'ELADOTT' : 'ZAROLT';
        await prisma.seatState.upsert({
          where: { eventId_seatId: { eventId: row.eventId, seatId } },
          create: { eventId: row.eventId, seatId, state, bookingId: booking.id, holdExpiresAt: state === 'ZAROLT' ? holdAt : null },
          update: { state, bookingId: booking.id, holdExpiresAt: state === 'ZAROLT' ? holdAt : null },
        });
      }
    }

    // Payment + tickets + ledger for paid states.
    if (row.status === 'FIZETVE' || row.status === 'VISSZATERITVE') {
      await prisma.paymentTransaction.create({
        data: {
          bookingId: booking.id, amount: subtotal + serviceFee, status: 'SIKERES',
          cardLast4: '0002', cardBrand: 'VISA', pspReference: `MOCK-${row.seq.toString(16).padStart(6, '0')}`,
          attemptNumber: 1, idempotencyKey: `seed-${booking.code}`,
        },
      });
      for (const it of itemRows) {
        if (it.seatId) {
          const ticketCode = `JG${row.seq}S${it.seatId.toString().slice(-5)}${String(row.seq).padStart(2, '0')}X1`;
          await prisma.ticket.create({
            data: {
              bookingId: booking.id, ticketTypeId: it.ticketTypeId, seatId: it.seatId,
              code: ticketCode, qrPayload: `JGY-TICKET:${ticketCode}`,
              status: row.status === 'VISSZATERITVE' ? 'VISSZAVONT' : 'ERVENYES',
              issuedAt: new Date(now), revokedAt: row.status === 'VISSZATERITVE' ? new Date(now) : null,
            },
          });
        } else {
          for (let q = 0; q < it.quantity; q++) {
            const ticketCode = `JG${row.seq}S${q + 1}${row.seq.toString().padStart(2, '0')}X${it.ticketTypeId}`;
            await prisma.ticket.create({
              data: {
                bookingId: booking.id, ticketTypeId: it.ticketTypeId,
                code: ticketCode, qrPayload: `JGY-TICKET:${ticketCode}`,
                status: row.status === 'VISSZATERITVE' ? 'VISSZAVONT' : 'ERVENYES',
                issuedAt: new Date(now), revokedAt: row.status === 'VISSZATERITVE' ? new Date(now) : null,
              },
            });
          }
        }
      }
      const total = subtotal + serviceFee;
      const isRefunded = row.status === 'VISSZATERITVE';
      await prisma.ledgerEntry.create({
        data: {
          type: 'BEVETEL', bookingId: booking.id, eventId: row.eventId,
          amount: total, createdAt: new Date(now),
        },
      });
      if (isRefunded) {
        await prisma.refund.create({
          data: {
            bookingId: booking.id, amount: total,
            reason: 'ESEMENY_LEMONDVA', status: 'SIKERES', initiatedByUserId: 1,
            completedAt: new Date(now),
          },
        });
        await prisma.ledgerEntry.create({
          data: { type: 'VISSZATERITES', bookingId: booking.id, eventId: row.eventId, amount: total, createdAt: new Date(now) },
        });
      }
    }
    return booking;
  }

  const EA = (row: number, num: number): SeatRef => ({ venueIdx: 0, sectionIdx: 0, rowIdx: row - 1, num });
  const EB = (row: number, num: number): SeatRef => ({ venueIdx: 0, sectionIdx: 1, rowIdx: row - 1, num });

  // Bookings in document order
  await makeBooking({ seq: 1, userId: 4, eventId: 1, status: 'FIZETVE', items: [{ ttIdx: 0, qty: 1, seat: EA(1, 1) }, { ttIdx: 0, qty: 1, seat: EA(1, 2) }] });
  await makeBooking({ seq: 2, userId: 4, eventId: 1, status: 'FIZETVE', items: [{ ttIdx: 2, qty: 3, seat: null }] });
  await makeBooking({ seq: 3, userId: 5, eventId: 1, status: 'FIZETVE', items: [{ ttIdx: 1, qty: 1, seat: EB(3, 10) }] });
  await makeBooking({ seq: 4, userId: 6, eventId: 3, status: 'FIZETVE', items: [{ ttIdx: 5, qty: 2, seat: null }] });
  await makeBooking({ seq: 5, userId: 5, eventId: 2, status: 'ZAROLT', items: [{ ttIdx: 3, qty: 1, seat: { venueIdx: 1, sectionIdx: 0, rowIdx: 0, num: 1 } }], holdAt: HOLD_AT });
  await makeBooking({ seq: 6, userId: 4, eventId: 8, status: 'LEJART', items: [{ ttIdx: 7, qty: 2, seat: null }], holdAt: new Date(now - 60_000) });
  await makeBooking({ seq: 7, userId: 5, eventId: 8, status: 'FIZETVE', items: [{ ttIdx: 7, qty: 2, seat: null }] });
  await makeBooking({ seq: 8, userId: 4, eventId: 7, status: 'VISSZATERITVE', items: [{ ttIdx: 8, qty: 1, seat: EA(1, 10) }] });
  await makeBooking({ seq: 9, userId: 4, eventId: 6, status: 'FIZETVE', items: [{ ttIdx: 9, qty: 1, seat: EA(2, 5) }] });
  await makeBooking({ seq: 10, userId: 6, eventId: 1, status: 'LEMONDVA', items: [{ ttIdx: 2, qty: 1, seat: null }] });

  console.log(`Seed finished: 7 users, 5 venues, 10 events, 10 ticket types.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
