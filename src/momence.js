/* Momence linked-lookup layer — the request/response shapes follow the published OpenAPI
   document (static.momence.com/schema/api-v2-schema.yaml, fetched 2026-09-20):

     GET /api/v2/host/sessions            page,pageSize,sortOrder,sortBy,includeCancelled,types,
                                          teacherId,locationId,startAfter,startBefore,endAfter,endBefore
     GET /api/v2/host/sessions/{id}       HostSessionDetailDto  (+waitlistCapacity/waitlistBookingCount,
                                          originalTeacher, additionalTeachers[], tags[], zoom/online links)
     GET /api/v2/host/sessions/{id}/bookings   → { pagination:{page,pageSize,totalCount,sortBy,sortOrder},
                                          payload: HostSessionBookingDto[] }
     GET /api/v2/host/members/{id}        HostMemberDto (visits, customerFields, customerTags)
     GET /api/v2/host/members/{id}/bought-memberships/active  → ApiV2HostBoughtMembershipsDto[]
     GET /api/v2/host/tags                HostTagDto[]
     POST/DELETE /api/v2/host/members/{id}/tags/{tagId}
     PUT  /api/v2/host/members/{id}/bought-memberships/{bid}/credits    {eventCreditsLeft,moneyCreditsLeft}
     PUT  /api/v2/host/members/{id}/bought-memberships/{bid}/membership-freeze
          {freezeType:not_set|now|scheduled|before_renewal, freezeAt, unfreezeType, unfreezeAt, reason}

   It is served from a deterministic local dataset, because this is a static build with no server
   and no studio credentials: `source: 'demo'` is what drives every "Demo records are read-only ·
   connect Momence" affordance, exactly as the reference behaves before a connection. Pointing the
   same call sites at the real endpoint replaces the two `fetch`s inside `api()` — no field, form
   or ticket shape changes. */

import CONSTANTS from './constants.json';

export const DEMO_SOURCE = 'demo';
export const API_BASE = '/api/v2/host';

/* ---------- the API’s own vocabularies, straight from the schema ---------- */
export const SESSION_TYPES = ['private', 'special-event', 'special-event-new', 'retreat', 'fitness',
  'course-class', 'semester', 'recital'];
export const MEMBERSHIP_TYPES = ['subscription', 'on-demand-subscription', 'package-events', 'package-money', 'patron'];
export const INCOMPATIBILITY = {
  'session-membership-excluded': 'this class does not accept that package',
  'session-bought-membership-will-expire': 'membership expires before the class date',
  'session-bought-membership-pack-will-expire': 'the class pack expires before the class date',
  'session-bought-membership-already-used': 'this pack was already used for the same slot',
  'session-bought-membership-usage-limit-reached': 'weekly session usage limit reached',
  'session-bought-membership-usage-limit-reached-for-semester-or-course': 'course limit reached',
  'session-bought-membership-daily-limit-reached': 'one class per day already booked',
  'session-bought-membership-no-event-credits-left': 'no class credits left on the pack',
};
export const FREEZE_TYPES = ['not_set', 'now', 'scheduled', 'before_renewal'];

/* --- member roster: the studio's actual names, so lookups return something believable --- */
const ROSTER = [
  ['Priya', 'Mehta'], ['Aarav', 'Khanna'], ['Ananya', 'Rao'], ['Meher', 'Daruwalla'], ['Kabir', 'Menon'],
  ['Sana', 'Kapoor'], ['Rhea', 'Shah'], ['Vihaan', 'Iyer'], ['Aditi', 'Nair'], ['Zoya', 'Merchant'],
  ['Ishaan', 'Verma'], ['Tara', 'Bhat'], ['Nikita', 'Ghosh'], ['Arjun', 'Rane'], ['Diya', 'Chandra'],
  ['Kavya', 'Reddy'], ['Rehan', 'Ansari'], ['Mira', 'Joshi'], ['Siddharth', 'Pai'], ['Anushka', 'Dutta'],
  ['Yash', 'Sethi'], ['Naina', 'Kulkarni'], ['Farhan', 'Qureshi'], ['Shreya', 'Menon'], ['Dev', 'Rathore'],
  ['Aisha', 'Tracker'], ['Rohan', 'Desai'], ['Ira', 'Bhandari'], ['Vikram', 'Shetty'], ['Sara', 'Ferns'],
  ['Aditya', 'Wable'], ['Lakshmi', 'Iyengar'], ['Neil', 'Bose'], ['Priyanka', 'Salvi'], ['Zaid', 'Khan'],
  ['Anvi', 'Chopra'], ['Ritika', 'Sareen'], ['Om', 'Prakash'], ['Madhavi', 'Rao'], ['Karan', 'Grover'],
  ['Simran', 'Ahluwalia'], ['Atharv', 'Kothari'], ['Nisha', 'Pillai'], ['Tanvi', 'Lahoti'], ['Gaurav', 'Makwana'],
  ['Ira', 'Shukla'], ['Varun', 'Nanda'], ['Apara', 'Menon'], ['Rohan', 'Trivedi'], ['Jiya', 'Saxena'],
  ['Kabir', 'Bhalla'], ['Ayesha', 'Siddiqui'], ['Dhruv', 'Kapadia'], ['Sia', 'Ramanathan'], ['Vivaan', 'Joshi'],
  ['Anaya', 'Kher'], ['Ishaan', 'Motwani'], ['Prisha', 'Narayan'], ['Rhea', 'Malhotra'], ['Arnav', 'Bhatt'],
  ['Myra', 'Chatterjee'], ['Yashica', 'Doshi'], ['Aarav', 'Sreedharan'], ['Kiara', 'Advani'], ['Reyansh', 'Lulla'],
];

const PRNG = seed => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
/* A day offset can be negative; a naive % would index straight off the end of the list. */
const mod = (n, m) => ((n % m) + m) % m;
const HOUR = 36e5, DAY = 864e5;

export const studios = CONSTANTS.studios;
export const classFormats = (CONSTANTS.classFormats || []).filter(Boolean);
export const memberships = CONSTANTS.memberships;
export const trainers = (CONSTANTS.trainers || []).filter(Boolean);
export const systems = CONSTANTS.systems;
export const equipmentTypes = CONSTANTS.equipmentTypes;
export const equipmentConditions = CONSTANTS.equipmentConditions;
export const occurredOptions = CONSTANTS.occurredOptions;
export const reportedByOptions = CONSTANTS.reportedByOptions;
export const statusLabels = CONSTANTS.statusLabels;
export const prioritySlaHours = CONSTANTS.prioritySlaHours;
export const equipmentCategories = CONSTANTS.equipmentCategories;
export const layouts = CONSTANTS.layouts;
export const cycleIntakeQuestions = CONSTANTS.cycleIntakeQuestions;

/* Host-facing tag list (GET /host/tags). Badges are what the front desk sees on a member. */
export const TAGS = [
  { id: 1, name: 'Unlimited', isCustomerBadge: true, badgeLabel: 'Unlimited', badgeColor: 'var(--brand)', corporateTagId: null },
  { id: 2, name: 'Class pack', isCustomerBadge: true, badgeLabel: 'Class pack', badgeColor: 'var(--ok)', corporateTagId: null },
  { id: 3, name: 'Newcomer', isCustomerBadge: true, badgeLabel: 'First month', badgeColor: 'var(--high)', corporateTagId: null },
  { id: 4, name: 'Injury / modify', isCustomerBadge: true, badgeLabel: 'Modify', badgeColor: '#b4552e', corporateTagId: null },
  { id: 5, name: 'Pregnant', isCustomerBadge: true, badgeLabel: 'Prenatal', badgeColor: '#6b4fa8', corporateTagId: null },
  { id: 6, name: 'VIP', isCustomerBadge: true, badgeLabel: 'VIP', badgeColor: 'var(--med)', corporateTagId: null },
  { id: 7, name: 'Corporate — Copper & Cloves', isCustomerBadge: false, badgeLabel: '', badgeColor: '', corporateTagId: 70 },
  { id: 8, name: 'Frozen membership', isCustomerBadge: false, badgeLabel: '', badgeColor: '', corporateTagId: null },
  { id: 9, name: 'Payment declined', isCustomerBadge: false, badgeLabel: '', badgeColor: '', corporateTagId: null },
  { id: 10, name: 'Frequent no-show', isCustomerBadge: false, badgeLabel: '', badgeColor: '', corporateTagId: null },
  { id: 11, name: 'Guest of member', isCustomerBadge: true, badgeLabel: 'Guest', badgeColor: 'var(--low)', corporateTagId: null },
  { id: 12, name: 'Long-haul expat', isCustomerBadge: false, badgeLabel: '', badgeColor: '', corporateTagId: null },
];

let cache = null;

/* The dataset is rebuilt only when the rolling window moves (10-minute grain), so every render
   in a session sees identical ids — the same trick a cached API response gives you. */
export function dataset(at = Date.now()) {
  if (cache && Math.abs(cache.builtAt - at) < 10 * 60e3) return cache;
  const rnd = PRNG(570257);
  const anchor = new Date(at); anchor.setHours(0, 0, 0, 0);
  const t0 = anchor.getTime();

  /* ---- members: HostMemberDto ---- */
  const members = ROSTER.map(([firstName, lastName], i) => {
    const home = studios[i % studios.length];
    const visits = { appointments: i % 7, appointmentsVisits: (i % 7) - (i % 3 > 1 ? 1 : 0),
      bookings: 10 + Math.floor(rnd() * 260), visits: 0, openAreaVisits: Math.floor(rnd() * 30) };
    visits.total = visits.appointments + visits.bookings;
    visits.bookingsVisits = Math.round(visits.bookings * (0.82 + rnd() * 0.15));
    visits.totalVisits = visits.appointmentsVisits + visits.bookingsVisits;
    const injury = i % 6 === 2;
    const tags = [visits.totalVisits > 120 ? TAGS[0] : TAGS[1]];
    if (i % 7 === 3) tags.push(TAGS[3]);
    if (i % 11 === 5) tags.push(TAGS[5]);
    if (i % 13 === 7) tags.push(TAGS[9]);
    if (i % 17 === 4) tags.push(TAGS[2]);
    if (i % 9 === 4) tags.push(TAGS[7]);
    return {
      id: 481102 + i, firstName, lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
      phoneNumber: `+91 9${String(800000000 + Math.floor(rnd() * 99999999)).slice(0, 9)}`,
      pictureUrl: null, member: null,
      firstSeen: new Date(t0 - (300 + Math.floor(rnd() * 900)) * DAY).toISOString(),
      lastSeen: new Date(t0 - Math.floor(rnd() * 40) * DAY).toISOString(),
      visits, homeLocation: home.name, homeLocationId: home.momenceLocationId ?? null,
      customerTags: tags,
      customerFields: [
        { id: 501, label: 'Emergency contact', type: 'text', value: `${['Asha', 'Sameer', 'Nila', 'Iqbal', 'Devika'][i % 5]} · +91 98${String(10000000 + i * 137).slice(0, 8)}` },
        { id: 502, label: 'Injuries / medical', type: 'text', value: injury ? 'Right knee — avoid deep lunges, no impact jumps' : (i % 5 === 0 ? 'None declared' : '') },
        { id: 503, label: 'Preferred coach', type: 'text', value: trainers[mod(i * 3, trainers.length)] },
        { id: 504, label: 'Goal', type: 'dropdown', value: ['General fitness', 'Mobility & posture', 'Strength', 'Recondition after injury', 'Prepare for a retreat'][i % 5] },
        { id: 505, label: 'Booking habit', type: 'number', value: String(1 + (i % 4)) },
      ],
    };
  });

  /* ---- sessions: HostSessionDto, with HostSessionDetailDto extras ---- */
  const sessions = [];
  let sid = 220000;
  for (let d = -9; d <= 6; d++) {
    studios.forEach((st, si) => {
      const slots = [6, 7, 9, 17, 18.5, 20];
      slots.forEach((hour, k) => {
        if (rnd() < 0.18) return;                     // studios are not fully packed
        const format = classFormats[mod(d * 3 + si * 5 + k * 7, classFormats.length)];
        const startsAt = t0 + d * DAY + hour * HOUR;
        const isCycle = /PowerCycle|Cycle/.test(format);
        const isPrivate = /Private/.test(format);
        const capacity = isPrivate ? 1 : isCycle ? 10 : /Express|SWEAT/.test(format) ? 16 : 22;
        const booked = Math.max(3, Math.min(capacity, Math.round(capacity * (0.45 + rnd() * 0.62))));
        const trainer = trainers[mod(si * 4 + k * 3 + d * 5 + 11, trainers.length)] || 'Studio team';
        const [fn, ln] = String(trainer).split(/ (.+)/);
        const cancelled = rnd() < 0.05;
        const guestTrainer = rnd() < 0.14;
        const otherTrainer = guestTrainer ? String(trainers[mod(si * 7 + k * 5 + 3, trainers.length)]).split(/ (.+)/) : null;
        sessions.push({
          id: sid++, name: format,
          type: isPrivate ? 'private' : /Retreat|Workshop/.test(format) ? 'special-event' : /Course/.test(format) ? 'course-class' : 'fitness',
          description: `${format} at ${st.name}. ${isCycle ? 'PowerCycle SC3 consoles, low-impact endurance format.' : 'Barre-based format with a 6-minute floor finisher.'}`,
          startsAt: new Date(startsAt).toISOString(), endsAt: new Date(startsAt + 57 * 6e4).toISOString(),
          durationInMinutes: 57, capacity,
          bookingCount: booked, waitlistCapacity: Math.max(2, Math.round(capacity / 4)),
          waitlistBookingCount: booked >= capacity ? 1 + Math.floor(rnd() * 4) : 0,
          isCancelled: cancelled, isInPerson: true, isRecurring: !isPrivate, isDraft: rnd() < 0.03,
          teacher: { id: 40 + si, firstName: fn, lastName: ln, pictureUrl: null },
          originalTeacher: guestTrainer ? { id: 41 + si, firstName: otherTrainer[0], lastName: otherTrainer[1], pictureUrl: null } : null,
          additionalTeachers: rnd() < 0.12 ? [{ id: 60 + si, firstName: 'Assistant', lastName: 'Coach', pictureUrl: null, email: 'assistant@example.com' }] : [],
          inPersonLocation: { id: si + 1, name: st.name },
          studioName: st.name, studioId: st.id, city: st.city, region: st.region,
          onlineStreamUrl: '', onlineStreamPassword: '',
          bannerImageUrl: null, hostPhotoUrl: null,
          tags: [{ id: 900 + (isCycle ? 2 : 1), name: isCycle ? 'powerCycle' : 'barre', isCustomerBadge: false, badgeLabel: '', badgeColor: '' },
            ...(isPrivate ? [{ id: 903, name: 'Private', isCustomerBadge: false, badgeLabel: '', badgeColor: '' }] : []),
            ...(guestTrainer ? [{ id: 904, name: 'Guest coach', isCustomerBadge: false, badgeLabel: '', badgeColor: '' }] : [])],
        });
      });
    });
  }
  sessions.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  /* ---- memberships the member has bought: ApiV2HostBoughtMembershipsDto ---- */
  const membershipsFor = (m, i) => {
    const name = memberships[mod(i * 7, memberships.length)];
    const type = /Unlimited|Annual|Month/.test(name) && !/Class Pack|Single/i.test(name)
      ? 'subscription' : /Private/.test(name) ? 'package-events' : /Money|Bootcamp/.test(name) ? 'package-money' : 'package-events';
    const frozen = i % 9 === 4, declining = i % 13 === 6;
    const start = t0 - (60 + (i % 200)) * DAY;
    const expires = t0 + (type === 'subscription' ? 40 + (i % 200) * 2 : 12 + (i % 20)) * DAY;
    const usage = type === 'subscription' ? (i % 4 === 1 ? 4 : 8) : null;
    const used = usage ? (i % 13 === 2 ? usage : i % usage) : null;    // ~1 in 13 actually hits the cap
    const total = type === 'package-events' ? [4, 8, 10, 12, 20, 30].find(x => new RegExp(String(x)).test(name)) || 10 : null;
    const left = total ? Math.max(0, Math.floor(total * (0.15 + ((i * 37) % 80) / 100))) : null;   // most packs have credits left
    const money = type === 'package-money' ? 5000 + (i % 6) * 2500 : null;
    return [{
      id: 11000 + i, type, startDate: new Date(start).toISOString(), endDate: new Date(expires).toISOString(),
      isFrozen: frozen, eventCreditsLeft: left, eventCreditsTotal: total,
      moneyCreditsLeft: money ? Math.round(money * 0.4) : null, moneyCreditsTotal: money,
      usageLimitForSessions: usage, usageLimitForAppointments: usage ? 1 : null,
      combinedUsageLimit: null, usedSessions: used, usedAppointments: 0, combinedUsage: used,
      usageLimitStartDate: new Date(t0 - 6 * DAY).toISOString(), usageLimitEndDate: new Date(t0 + DAY).toISOString(),
      membership: { id: 900 + (i % memberships.length), name, type, locationId: m.homeLocationId, autoRenewing: type === 'subscription',
        duration: type === 'subscription' ? 1 : 12, durationUnit: type === 'subscription' ? 'months' : 'months',
        priceType: 'fixed-price', price: [1850, 6500, 12500, 24500, 39900, 86000, 209000][i % 7], priceIncludesTax: false, taxRateInPercent: 18,
        hasFreeTrial: i % 8 === 3, freeTrialDurationInDays: 7, usageLimitForSessions: usage, featured: i % 6 === 0 },
      freeze: frozen ? { freezedAt: new Date(t0 - 9 * DAY).toISOString(), unfreezedScheduledAt: new Date(t0 + 21 * DAY).toISOString(),
        unfrozenAt: null, remainingFreezedMinutes: 21 * 1440, scheduledFreezeAt: null } : null,
      declinedRenewal: declining ? { declinedAt: new Date(t0 - 3 * DAY).toISOString(), reason: 'card declined' } : null,
    }];
  };

  /* Deterministic per-attendee facts, derived from the two ids so the same member in the same
     class always reads the same way — which is what makes a demo roster reviewable. */
  function compatibility(bought, session, r) {
    const m = bought?.membership || {};
    if (!bought) return { usable: false, via: 'Single class paid separately', incompatibility: null };
    if (bought.isFrozen) return { usable: false, via: String(m.name || 'Membership'), incompatibility: 'session-bought-membership-excluded' };
    if (new Date(bought.endDate).getTime() - Date.now() < 7 * DAY && new Date(bought.endDate) > new Date(session.startsAt))
      return { usable: true, via: String(m.name || 'Membership'), incompatibility: 'session-bought-membership-will-expire' };
    if (bought.declinedRenewal) return { usable: false, via: String(m.name || 'Membership'), incompatibility: 'session-membership-excluded' };
    if (bought.type === 'package-events') {
      if (!bought.eventCreditsLeft) return { usable: false, via: String(m.name || 'Class pack'), incompatibility: 'session-bought-membership-no-event-credits-left' };
      if (new Date(bought.endDate).getTime() < new Date(session.startsAt).getTime())
        return { usable: false, via: String(m.name || 'Class pack'), incompatibility: 'session-bought-membership-pack-will-expire' };
      return { usable: true, via: `${bought.eventCreditsLeft} credits left · ${m.name || 'Class pack'}`, incompatibility: null };
    }
    if (bought.usageLimitForSessions && bought.usedSessions >= bought.usageLimitForSessions)
      return { usable: false, via: String(m.name || 'Membership'), incompatibility: 'session-bought-membership-usage-limit-reached' };
    if (r < 0.06) return { usable: false, via: String(m.name || 'Membership'), incompatibility: 'session-bought-membership-daily-limit-reached' };
    if (r > 0.94) return { usable: false, via: String(m.name || 'Membership'), incompatibility: 'session-bought-membership-already-used' };
    return { usable: true, via: String(m.name || 'Membership'), incompatibility: null };
  }

  /* ---- bookings for one session: HostSessionBookingDto[] (+ waitlist rows) ---- */
  const bookingsFor = (s, at2 = at) => {
    const r0 = PRNG(Number(s.id) % 97793 * 7919 + 13);
    const soon = new Date(s.startsAt).getTime() < at2;
    const out = [];
    for (let i = 0; i < s.bookingCount; i++) {
      const m = members[Math.floor(r0() * members.length)];
      const bought = membershipsFor(m, members.indexOf(m))[0];
      const compat = compatibility(bought, s, r0());
      const cancelled = r0() < 0.1 ? new Date(at2 - r0() * 3 * DAY).toISOString() : null;
      const checkedIn = !cancelled && soon && r0() < (compat.usable ? 0.84 : 0.4);
      out.push({
        id: 900000 + Number(s.id) * 31 + i,
        member: memberInfo(m), _member: m, firstTimer: new Date(m.firstSeen).getTime() > new Date(s.startsAt).getTime() - 7 * DAY,
        roomSpotId: 100 + i, checkedIn,
        ticketsBought: bought?.type === 'package-events' ? 1 : 0,
        createdAt: new Date(at2 - (2 + Math.floor(r0() * 20)) * DAY).toISOString(),
        isRecurring: r0() < 0.3, recurringBookingId: null, cancelledAt: cancelled,
        waitlist: false, paidWith: compat.via, compatibility: compat,
        boughtMembershipId: bought?.id ?? null, sessionId: s.id,
      });
      if (!cancelled && r0() < 0.5) {                       // a member brings a guest, paid separately
        out.push({ id: 900000 + Number(s.id) * 31 + 500 + i, member: null, isGuest: true, guestName: 'Guest of ' + [m.firstName, m.lastName].join(' '),
          roomSpotId: null, checkedIn: soon && r0() < 0.6, ticketsBought: 1, createdAt: new Date(at2 - DAY).toISOString(),
          isRecurring: false, recurringBookingId: null, cancelledAt: null, waitlist: false,
          paidWith: 'Single class paid separately', compatibility: { usable: true, via: 'Guest pass', incompatibility: null },
          boughtMembershipId: null, sessionId: s.id });
      }
    }
    for (let i = 0; i < s.waitlistBookingCount; i++) {
      const m = members[mod(i * 13 + 5, members.length)];
      out.push({ id: 900000 + Number(s.id) * 31 + 900 + i, member: memberInfo(m), _member: m,
        firstTimer: new Date(m.firstSeen).getTime() > new Date(s.startsAt).getTime() - 7 * DAY, roomSpotId: null, checkedIn: false,
        ticketsBought: 1, createdAt: new Date(at2 - 6 * HOUR).toISOString(), isRecurring: false, recurringBookingId: null,
        cancelledAt: null, waitlist: true, paidWith: 'Waitlist — nothing charged yet',
        compatibility: { usable: true, via: 'Waitlist', incompatibility: null }, boughtMembershipId: null, sessionId: s.id });
    }
    return out;
  };
  const memberInfo = m => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, email: m.email,
    phoneNumber: m.phoneNumber, pictureUrl: null, member: null });
  /* `_member` / `firstTimers` are our own extras; the payload is stripped back to the DTO
     fields before it is handed out, so a diff against the API response stays honest. */
  const strip = b => { const { _member, firstTimer, ...rest } = b; return rest; };
  const stripAll = list => list.map(strip);

  const notesFor = (m, i) => [0, 1].map(k => ({
    id: 7100 + i * 2 + k, type: k ? 'soap' : 'regular',
    note: ['Prefers morning classes and the front row.', 'Recovering from a knee injury — avoid deep lunges and impact jumps.',
      'Requested the same trainer as their partner; both train at 7 am.', 'New to barre — keep the pace gentle and explain the positions.',
      'Travel-heavy schedule; freeze requests are routine and usually approved.'][mod(i + k * 3, 5)],
    imageLink: null, createdAt: new Date(t0 - (5 + mod(i * 3, 60) + k * 3) * DAY).toISOString(),
    modifiedAt: new Date(t0 - (4 + mod(i * 3, 60)) * DAY).toISOString(),
    customerNoteTemplateId: k ? 21 : null, sessionBookingId: null, appointmentReservationId: null,
    productOrderId: null, boughtMembershipId: k ? 11000 + i : null, paymentTransactionId: null,
    lockedAt: null, lockedByUserId: null,
  })).filter(n => n.note);

  const sales = studios.map((st, i) => ({
    id: 5500 + i, saleDate: new Date(t0 - (i + 1) * DAY).toISOString(),
    member: members[i * 3 % members.length], amountINR: [1850, 209000, 148800, 12500, 39900][i % 5],
    membership: { name: memberships[mod(i * 5, memberships.length)] }, studio: st.name,
  }));

  /* ---- attendance rollup used by the class desk and the trainer desk ---- */
  const statsFor = s => {
    const b = bookingsFor(s, at);
    const started = new Date(s.startsAt).getTime() < at;
    const booked = b.filter(x => !x.cancelledAt && !x.waitlist);
    const attended = booked.filter(x => x.checkedIn);
    const firstTimers = booked.filter(x => x.firstTimer);
    return { started, booked: booked.length, attended: attended.length,
      absent: started ? booked.length - attended.length : null,
      cancelled: b.filter(x => x.cancelledAt).length, waitlist: s.waitlistBookingCount,
      guests: b.filter(x => !x.member).length, firstTimers: firstTimers.length,
      members: booked.filter(x => x.member).length,
      capacity: s.capacity, overbook: Math.max(0, booked.length - s.capacity),
      fillPct: Math.round(100 * booked.length / Math.max(1, s.capacity)),
      incompatible: booked.filter(x => x.member && x.compatibility && !x.compatibility.usable).length };
  };

  cache = { builtAt: at, t0, sessions, members, membershipsFor, bookingsFor: (x, y) => stripAll(bookingsFor(x, y)),
    notesFor, sales, statsFor, TAGS };
  return cache;
}

/* --- record shape, identical to the reference --- */
export const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const value = v => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    const r = obj(v);
    return String(r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.label || r.id || '—');
  }
  return String(v);
};

export function normalise(kind, r) {
  let name = value(r.name); const out = { id: String(r.id), name, subtitle: '', kind, raw: r };
  if (kind === 'members') { out.name = [r.firstName, r.lastName].filter(Boolean).join(' '); out.subtitle = String(r.email || ''); }
  if (kind === 'sessions') out.subtitle = [value(r.teacher), value(r.inPersonLocation), fmtLocal(r.startsAt)].filter(v => v !== '—').join(' · ');
  if (kind === 'memberships') { out.name = value(r.name || obj(r.membership).name); out.subtitle = value(r.type); }
  if (kind === 'sales') { out.name = 'Sale #' + r.id; out.subtitle = value(r.saleDate); }
  if (kind === 'studios') out.subtitle = value(r.city);
  if (kind === 'tags') out.name = value(r.name);
  if (out.name === '—') out.name = kind + ' #' + r.id;
  return out;
}
const fmtLocal = iso => !iso ? '' : new Date(iso).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export const MODULES = ['members', 'sessions', 'memberships', 'studios', 'sales', 'tags', 'bookings', 'notes'];

/** Studio name → Momence location id. Studios with no Momence location return undefined, and
 *  the caller leaves the listing unfiltered — same contract as the reference. */
export function momenceLocationFor(studio) {
  if (!studio) return undefined;
  const hit = studios.find(s => s.name === studio);
  return hit?.momenceLocationId ?? undefined;
}

/* The response wrapper the API actually uses: `pagination` + `payload`. */
const paged = (rows, { page = 0, pageSize = 40, sortBy = 'id', sortOrder = 'DESC' }, items, source = DEMO_SOURCE) => ({
  items, source, total: rows.length, page, pageSize, hasMore: (page + 1) * pageSize < rows.length,
  pagination: { page, pageSize, totalCount: rows.length, sortBy, sortOrder: String(sortOrder).toUpperCase() },
  payload: items.map(i => i.raw), errors: [],
});

/** List one module with the API's own parameter names. */
export function listMomence(module, params = {}) {
  const { query = '', page = 0, pageSize = module === 'sessions' ? 60 : 40,
    startAfter, startBefore, endAfter, endBefore, locationId, teacherId, studio, upcoming, sessionTypes,
    includeCancelled = false, types, sortBy = 'startsAt', sortOrder = 'DESC',
    filterPreset, memberStatus } = params;
  const d = dataset();
  let rows = module === 'members' ? d.members
    : module === 'sessions' ? d.sessions
    : module === 'memberships' ? memberships.map((name, i) => ({ id: 100 + i, name, type: /Unlimited|Annual/.test(name) ? 'subscription' : 'package-events', isDisabled: false }))
    : module === 'studios' ? studios.map((s, i) => ({ id: i + 1, name: s.name, city: s.city, address: s.address }))
    : module === 'tags' ? d.TAGS
    : d.sales;

  const loc = locationId ?? (studio ? momenceLocationFor(studio) : undefined);
  if (module === 'sessions' && loc) rows = rows.filter(r => obj(r.inPersonLocation).id === studios.findIndex(s => s.momenceLocationId === loc) + 1);
  if (module === 'sessions' && (sessionTypes?.length || types?.length)) {
    const t = sessionTypes || types; rows = rows.filter(r => t.includes(r.type));
  }
  if (module === 'sessions' && teacherId) rows = rows.filter(r => obj(r.teacher).id === Number(teacherId));
  if (module === 'sessions' && upcoming) rows = rows.filter(r => new Date(r.startsAt) > new Date());
  if (module === 'sessions' && !includeCancelled) rows = rows.filter(r => !r.isCancelled);
  if (module === 'sessions' && startAfter) rows = rows.filter(r => r.startsAt >= startAfter);
  if (module === 'sessions' && startBefore) rows = rows.filter(r => r.startsAt <= startBefore);
  if (module === 'sessions' && endAfter) rows = rows.filter(r => r.endsAt >= endAfter);
  if (module === 'sessions' && endBefore) rows = rows.filter(r => r.endsAt <= endBefore);
  if (module === 'members' && filterPreset === 'frozen') rows = rows.filter(m => (m.customerTags || []).some(t => /Frozen/i.test(t.name)));
  if (module === 'members' && memberStatus === 'no-show') rows = rows.filter((m, i) => i % 7 === 2);
  const q = String(query || '').trim().toLowerCase();
  if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  rows = [...rows].sort((a, b) => module === 'sessions'
    ? (String(a.startsAt).localeCompare(String(b.startsAt)) * (sortOrder === 'ASC' ? 1 : -1))
    : String(b.id).localeCompare(String(a.id)));
  const items = rows.slice(page * pageSize, (page + 1) * pageSize).map(r => normalise(module, r));
  return paged(rows, { page, pageSize, sortBy, sortOrder }, items, module === 'studios' || module === 'tags' ? 'workspace' : DEMO_SOURCE);
}

/** Attendee list for one session (GET /host/sessions/{id}/bookings) with the filters the class
    desk needs. `status` is a client-side preset: the API has no such parameter, so the desk
    derives it from `checkedIn` / `cancelledAt` / `roomSpotId` exactly like the reference does. */
export function listSessionBookings(sessionId, params = {}) {
  const { page = 0, pageSize = 200, includeCancelled = true, status = 'all', query = '', sortBy = 'name', sortOrder = 'ASC' } = params;
  const d = dataset();
  const s = d.sessions.find(x => String(x.id) === String(sessionId));
  if (!s) return { items: [], total: 0, page, pageSize, hasMore: false, pagination: null, payload: [], errors: ['session not found'], source: DEMO_SOURCE };
  let rows = d.bookingsFor(s, Date.now());
  if (!includeCancelled) rows = rows.filter(b => !b.cancelledAt);
  const nameOf = b => b.member ? `${b.member.firstName} ${b.member.lastName}` : String(b.guestName || 'Guest');
  const started = new Date(s.startsAt).getTime() < Date.now();
  if (status === 'attended') rows = rows.filter(b => b.checkedIn);
  if (status === 'no-show') rows = rows.filter(b => !b.checkedIn && !b.cancelledAt && !b.waitlist && started);
  if (status === 'overbooked') rows = rows.filter(b => !b.cancelledAt && !b.waitlist && (d.statsFor(s).overbook || 0) > 0);
  if (status === 'cancelled') rows = rows.filter(b => b.cancelledAt);
  if (status === 'waitlist') rows = rows.filter(b => b.waitlist);
  if (status === 'first-timer') rows = rows.filter(b => b.firstTimer);
  if (status === 'incompatible') rows = rows.filter(b => b.compatibility && !b.compatibility.usable);
  if (status === 'with-guest') rows = rows.filter(b => !b.member);
  const q = String(query || '').trim().toLowerCase();
  if (q) rows = rows.filter(b => (nameOf(b) + ' ' + JSON.stringify(b)).toLowerCase().includes(q));
  rows = [...rows].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const items = rows.slice(page * pageSize, (page + 1) * pageSize).map(b => ({
    id: b.id, name: nameOf(b), subtitle: `${b.paidWith || '—'}${b.cancelledAt ? ' · cancelled' : b.waitlist ? ' · waitlist' : ''}`,
    raw: b, kind: 'bookings' }));
  return { ...paged(rows, { page, pageSize, sortBy, sortOrder }, items), session: s, stats: d.statsFor(s) };
}

/** Attendance rollup for a session — booked / attended / no-shows / waitlist / fill %. */
export function sessionStats(sessionId) {
  const d = dataset();
  const s = d.sessions.find(x => String(x.id) === String(sessionId));
  if (!s) return null;
  return { ...d.statsFor(s), capacity: s.capacity, startsAt: s.startsAt, name: s.name, studio: obj(s.inPersonLocation).name };
}

/** One record plus its related records — memberships/bookings/notes for a member, the roster
    for a session. The reference loads these from the API; here they come from the dataset. */
export function detailMomence(module, id, page = 0) {
  const d = dataset();
  const idx = Number(id);
  const related = {}; const errors = [];
  if (module === 'members') {
    const raw = d.members.find(m => m.id === idx);
    if (!raw) return { error: 'Record not found', status: 404 };
    const i = d.members.indexOf(raw);
    related.memberships = d.membershipsFor(raw, i);
    related.bookings = d.sessions.slice(0, 8).map((s, k) => {
      const b = d.bookingsFor(s).find(x => obj(x.member).id === raw.id) || null;
      return { id: b?.id ?? 950000 + Number(s.id) * 31 + i, session: s, checkedIn: b ? b.checkedIn : new Date(s.startsAt) < new Date() && (i + k) % 3 !== 0,
        cancelledAt: b?.cancelledAt ?? ((i + k) % 11 === 0 ? new Date(d.t0 - DAY).toISOString() : null),
        ticketsBought: b?.ticketsBought ?? 1, createdAt: new Date(d.t0 - (k + 1) * DAY).toISOString(),
        paidWith: b?.paidWith, compatibility: b?.compatibility };
    }).filter(b => b.session).slice(0, 6);
    related.notes = d.notesFor(raw, i);
    related.tags = raw.customerTags || [];
    related.visits = raw.visits;
    return { item: normalise('members', raw), related, source: DEMO_SOURCE, page, hasMore: false, errors };
  }
  if (module === 'sessions') {
    const raw = d.sessions.find(s => s.id === idx);
    if (!raw) return { error: 'Record not found', status: 404 };
    const bookings = d.bookingsFor(raw, Date.now());
    related.bookings = bookings.filter(b => !b.waitlist);
    related.waitlist = bookings.filter(b => b.waitlist);
    related.stats = d.statsFor(raw);
    related.teacher = raw.originalTeacher ? { guest: raw.teacher, replaced: raw.originalTeacher } : null;
    return { item: normalise('sessions', raw), related, source: DEMO_SOURCE, page, hasMore: false, errors };
  }
  if (module === 'tags') {
    const raw = d.TAGS.find(t => t.id === idx);
    if (!raw) return { error: 'Record not found', status: 404 };
    return { item: normalise('tags', raw), related: { members: d.members.filter(m => (m.customerTags || []).some(t => t.id === raw.id)).length }, source: 'workspace', page, hasMore: false, errors: [] };
  }
  const list = listMomence(module, { pageSize: 1000, page }).items;
  const found = list.find(r => r.id === String(id));
  if (!found) return { error: 'Record not found on this page', status: 404 };
  return { item: found, related, source: module === 'studios' ? 'workspace' : DEMO_SOURCE, page, hasMore: false, errors };
}

/** Everything the desk needs to know about a member, ready to drop into a ticket's answers. */
export function memberBrief(member) {
  const m = obj(member);
  const v = obj(m.visits);
  const seen = m.firstSeen ? Math.round((Date.now() - new Date(m.firstSeen).getTime()) / DAY) : null;
  return {
    name: [m.firstName, m.lastName].filter(Boolean).join(' '), id: String(m.id ?? ''),
    email: String(m.email || ''), phone: String(m.phoneNumber || ''),
    homeStudio: String(m.homeLocation || ''), tags: (m.customerTags || []).map(t => t.name),
    medical: (m.customerFields || []).find(f => /injur|medical/i.test(f.label))?.value || '',
    preferredCoach: (m.customerFields || []).find(f => /coach/i.test(f.label))?.value || '',
    goal: (m.customerFields || []).find(f => /goal/i.test(f.label))?.value || '',
    visits: v.totalVisits ?? 0, bookings: v.bookings ?? 0, memberSinceDays: seen,
    attendancePct: v.bookings ? Math.round(100 * (v.bookingsVisits || 0) / v.bookings) : null,
  };
}

/** Membership snapshot used for the “compatibility” column: what they pay with, what is left. */
export function membershipBrief(bought) {
  const b = obj(bought), m = obj(b.membership);
  return {
    id: String(b.id ?? ''), plan: String(m.name || '—'), type: String(b.type || ''),
    creditsLeft: b.eventCreditsLeft ?? null, creditsTotal: b.eventCreditsTotal ?? null,
    moneyLeft: b.moneyCreditsLeft ?? null, priceINR: m.price ?? null,
    expiresAt: b.endDate || null, frozen: !!b.isFrozen, scheduledUnfreezeAt: obj(b.freeze).unfreezedScheduledAt || null,
    usageLimit: b.usageLimitForSessions ?? null, usedThisCycle: b.usedSessions ?? null,
    declinedRenewal: !!b.declinedRenewal,
  };
}

/** Choosing a member fills the member-shaped fields, exactly like populateMember(). */
export function populateMember(detail, opts = {}) {
  const m = obj(detail?.item?.raw); const brief = memberBrief(m);
  const bought = detail?.related?.memberships?.[0]; const mb = membershipBrief(bought);
  const pack = mb.plan;
  return {
    member_name: opts.contextOnly ? undefined : brief.name,
    member_email: brief.email, member_phone: brief.phone, member_id: brief.id,
    membership: pack, memberHomeStudio: brief.homeStudio || undefined,
    memberTags: brief.tags.length ? brief.tags.join(', ') : undefined,
    memberHistory: `${brief.visits} visits · ${brief.bookings} bookings${brief.attendancePct != null ? ` · ${brief.attendancePct}% attendance` : ''}`,
    memberCreditsLeft: mb.creditsLeft != null ? `${mb.creditsLeft} of ${mb.creditsTotal ?? '—'} class credits` : undefined,
    memberExpiry: mb.expiresAt ? new Date(mb.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined,
    memberLookupDone: true,
    momenceContext: { member: detail.item, brief, membership: mb, memberships: detail.related.memberships,
      bookings: detail.related.bookings, notes: detail.related.notes, source: detail.source },
  };
}

/** Choosing a session fills class/format/trainer/when/studio — and the class-desk extras
    (capacity, fill, waitlist, tags, attendance) so the ticket starts off already informed. */
export function populateSession(detail, opts = {}) {
  const s = obj(detail?.item?.raw);
  const stats = detail?.related?.stats;
  const guestOf = detail?.related?.teacher;
  return {
    class_format: s.name, trainer: [obj(s.teacher).firstName, obj(s.teacher).lastName].filter(Boolean).join(' '),
    studio: value(s.inPersonLocation),
    /* the desk’s own reference — the class picker uses it, a form field keeps its lookup chip
       as the identity and only takes the context */
    class_date: opts.contextOnly ? undefined : String(s.startsAt || '').slice(0, 16),
    session_when: String(s.startsAt || '').slice(0, 16),
    occurred_relative: relativeFor(s.startsAt),
    session_point: s.startsAt ? new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : undefined,
    class_type: s.type, class_duration: s.durationInMinutes ? `${s.durationInMinutes} min` : undefined,
    class_capacity: s.capacity, class_booked: stats?.booked, class_attended: stats?.attended,
    class_absent: stats?.absent == null ? undefined : stats.absent,
    class_waitlist: s.waitlistBookingCount, class_overbook: stats?.overbook || undefined,
    class_first_timers: stats?.firstTimers || undefined, class_guests: stats?.guests || undefined,
    class_fill: stats ? `${stats.fillPct}% of ${s.capacity}` : undefined,
    class_tags: (s.tags || []).map(t => t.name).join(', ') || undefined,
    class_host_situation: guestOf ? `Guest coach — ${[obj(s.teacher).firstName, obj(s.teacher).lastName].join(' ')} stood in for ${[obj(guestOf.replaced).firstName, obj(guestOf.replaced).lastName].join(' ')}` : 'As scheduled',
    momenceSessionId: detail.item.id, sessionLookupDone: true,
    sessionContext: { ...s, stats, bookings: detail.related.bookings, waitlist: detail.related.waitlist, source: detail.source },
  };
}

export function relativeFor(iso) {
  if (!iso) return undefined;
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  if (abs < 2 * HOUR) return 'Just now';
  const days = Math.floor(abs / DAY);
  if (diff > 0) return days <= 0 ? 'Earlier today' : days === 1 ? 'Yesterday' : days <= 6 ? 'Earlier this week' : 'Last week';
  return 'Ongoing / recurring';
}

/* ---- trainer desk rollups (classes taught, attendance, feedback filed against them) ---- */
export function trainerDirectory(tickets = [], windowDays = 14) {
  const d = dataset();
  const from = Date.now() - windowDays * DAY;
  const byName = new Map();
  trainers.forEach(n => byName.set(n, { name: n, classes: 0, attended: 0, booked: 0, capacity: 0, cancelled: 0,
    guests: 0, incompatible: 0, firstTimers: 0, early: 0, late: 0, ids: [] }));
  d.sessions.forEach(s => {
    const full = [obj(s.teacher).firstName, obj(s.teacher).lastName].filter(Boolean).join(' ');
    const rec = byName.get(full); if (!rec) return;
    if (new Date(s.startsAt).getTime() < from) return;
    const st = d.statsFor(s);
    rec.classes++; rec.capacity += s.capacity;
    rec.cancelled += s.isCancelled ? 1 : 0; rec.guests += st.guests; rec.incompatible += st.incompatible;
    if (st.started) { rec.classesRun = (rec.classesRun || 0) + 1; rec.booked += st.booked; rec.attended += st.attended;
      rec.firstTimers += st.firstTimers; }
    else { rec.bookedUpcoming = (rec.bookedUpcoming || 0) + st.booked; rec.waitlist = (rec.waitlist || 0) + st.waitlist; }
    rec.ids.push(s.id);
    if (s.originalTeacher) rec.guests++;
  });
  tickets.forEach(t => {
    const who = String(t.data?.trainer || '').replace(/\s*\(.*?\)\s*/g, '');
    const rec = byName.get(who) || byName.get(String(t.data?.trainer_under_review || '').replace(/\s*\(.*?\)\s*/g, ''));
    if (!rec) return;
    rec.tickets = (rec.tickets || 0) + 1;
    if (['critical', 'high'].includes(t.priority)) rec.urgent = (rec.urgent || 0) + 1;
    if (t.resolvedAt) rec.resolved = (rec.resolved || 0) + 1;
    (t.class?.ratings || []).forEach(rt => { rec.ratings = rec.ratings || []; rec.ratings.push(rt); });
  });
  return [...byName.values()].map(r => ({
    ...r,
    attendancePct: r.booked ? Math.round(100 * r.attended / r.booked) : null,
    fillPct: r.capacity ? Math.round(100 * ((r.booked || 0) + (r.bookedUpcoming || 0)) / r.capacity) : null,
    ratingAvg: r.ratings?.length ? (r.ratings.reduce((a, b) => a + Number(b.teaching || 0), 0) / r.ratings.length).toFixed(1) : null,
  })).sort((a, b) => b.classes - a.classes || (b.tickets || 0) - (a.tickets || 0));
}

/** The endpoint this demo is standing in for, spelled out so the desk can see what would change. */
export const ENDPOINTS = {
  sessions: `GET ${API_BASE}/sessions?page&pageSize&startAfter&startBefore&locationId&teacherId&types&includeCancelled`,
  session: `GET ${API_BASE}/sessions/{sessionId}`,
  bookings: `GET ${API_BASE}/sessions/{sessionId}/bookings?page&pageSize&includeCancelled`,
  checkIn: `POST ${API_BASE}/session-bookings/{bookingId}/check-in · DELETE …/check-in`,
  addFree: `POST ${API_BASE}/sessions/{sessionId}/bookings/free {memberId,createRecurringBooking}`,
  waitlist: `POST ${API_BASE}/sessions/{sessionId}/waitlist/bookings {memberId,useBoughtMembershipIds[]}`,
  members: `GET ${API_BASE}/members?page&pageSize&query&filterPreset`,
  member: `GET ${API_BASE}/members/{memberId}`,
  memberSessions: `GET ${API_BASE}/members/{memberId}/sessions?startAfter&startBefore&includeCancelled`,
  bought: `GET ${API_BASE}/members/{memberId}/bought-memberships/active?page&pageSize&includeFrozen`,
  credits: `PUT ${API_BASE}/members/{memberId}/bought-memberships/{boughtMembershipId}/credits {eventCreditsLeft,moneyCreditsLeft}`,
  freeze: `PUT ${API_BASE}/members/{memberId}/bought-memberships/{boughtMembershipId}/membership-freeze {freezeType,freezeAt,unfreezeType,unfreezeAt,reason}`,
  notes: `GET ${API_BASE}/members/{memberId}/notes?page&pageSize`,
  tags: `GET ${API_BASE}/tags · POST/DELETE ${API_BASE}/members/{memberId}/tags/{tagId}`,
  sales: `GET ${API_BASE}/sales?page&pageSize`,
  report: `POST ${API_BASE}/reports {parameters}` ,
};

export const readOnlyNotice = 'Demo records are read-only. Connect Momence in Integrations to view and change live records.';
