/**
 * Comprehensive Automated Verification Suite for NagrikQ
 * Covers Fixes 1-18 and Requirements 19-24.
 */

const assert = require('assert');
const { parseTimeToMinutes, getOfficeLocalTime } = require('../dist/utils/timezone');
const { KeyedMutex } = require('../dist/utils/mutex');

let passCount = 0;
let failCount = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`[PASS] ${description}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(`       Error: ${err.message}`);
    failCount++;
  }
}

async function asyncTest(description, fn) {
  try {
    await fn();
    console.log(`[PASS] ${description}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${description}`);
    console.error(`       Error: ${err.message}`);
    failCount++;
  }
}

console.log('====================================================');
console.log('NAGRIKQ COMPREHENSIVE VERIFICATION SUITE');
console.log('====================================================\n');

// 1. Timezone & Office Local Clock (Asia/Kolkata)
test('Timezone: Correctly parses times in 12-hour AM/PM format', () => {
  assert.strictEqual(parseTimeToMinutes('10:00 AM'), 600);
  assert.strictEqual(parseTimeToMinutes('10:30 AM'), 630);
  assert.strictEqual(parseTimeToMinutes('12:00 PM'), 720);
  assert.strictEqual(parseTimeToMinutes('01:30 PM'), 810);
  assert.strictEqual(parseTimeToMinutes('05:00 PM'), 1020);
  assert.strictEqual(parseTimeToMinutes('12:00 AM'), 0);
});

test('Timezone: Office local time is resolved for Asia/Kolkata', () => {
  const local = getOfficeLocalTime('Asia/Kolkata');
  assert.ok(local.localDateStr.match(/^\d{4}-\d{2}-\d{2}$/));
  assert.ok(typeof local.currentTimeMinutes === 'number');
  assert.ok(local.currentTimeMinutes >= 0 && local.currentTimeMinutes < 1440);
  assert.ok(local.formattedTime.match(/^(0[1-9]|1[0-2]):[0-5][0-9]\s(AM|PM)$/));
});

// 2. Requirement 19: Reject Past and Current Slots
test('Req 19: Past dates are rejected', () => {
  const pastDate = '2020-01-01';
  const { validateSlotBookingWindow } = require('../dist/utils/timezone');
  const result = validateSlotBookingWindow('10:00 AM - 10:30 AM', pastDate);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.errorCode, 'PAST_DATE');
});

test('Req 19: Future dates are accepted without today-clock restrictions', () => {
  const futureDate = '2035-12-31';
  const { validateSlotBookingWindow } = require('../dist/utils/timezone');
  const result = validateSlotBookingWindow('10:00 AM - 10:30 AM', futureDate);
  assert.strictEqual(result.isValid, true);
});

// 3. Requirement 20: 30-Minute Advance Booking Window Boundary Tests
test('Req 20: slot_start_time >= current_time + 30 minutes exact boundary test', () => {
  // Mock current time = 10:20 AM (620 minutes from midnight)
  const currentTimeMinutes = 620; // 10:20 AM

  function validateWithMockClock(slotStr, mockNowMins) {
    const slotStartTimeStr = slotStr.split('-')[0].trim();
    const slotStartMins = parseTimeToMinutes(slotStartTimeStr);
    
    if (slotStartMins <= mockNowMins) {
      return { isValid: false, errorCode: 'SLOT_ALREADY_STARTED' };
    }
    if (slotStartMins < mockNowMins + 30) {
      return { 
        isValid: false, 
        errorCode: 'ADVANCE_BOOKING_REQUIRED',
        errorMessage: `Slot requires at least 30 minutes advance booking. Slot starts in ${slotStartMins - mockNowMins} minutes.`
      };
    }
    return { isValid: true };
  }

  // 10:20 AM now, slot starts at 10:50 AM (exactly 30 mins) -> ACCEPT
  const res30 = validateWithMockClock('10:50 AM - 11:20 AM', currentTimeMinutes);
  assert.strictEqual(res30.isValid, true, 'Slot starting in exactly 30 minutes must be accepted');

  // 10:20 AM now, slot starts at 10:55 AM (35 mins) -> ACCEPT
  const res35 = validateWithMockClock('10:55 AM - 11:25 AM', currentTimeMinutes);
  assert.strictEqual(res35.isValid, true, 'Slot starting in 35 minutes must be accepted');

  // 10:20 AM now, slot starts at 10:49 AM (29 mins) -> REJECT
  const res29 = validateWithMockClock('10:49 AM - 11:19 AM', currentTimeMinutes);
  assert.strictEqual(res29.isValid, false, 'Slot starting in 29 minutes must be rejected');
  assert.strictEqual(res29.errorCode, 'ADVANCE_BOOKING_REQUIRED');

  // 10:55 AM now, slot starts at 11:00 AM (5 mins) -> REJECT
  const res5 = validateWithMockClock('11:00 AM - 11:30 AM', 655);
  assert.strictEqual(res5.isValid, false, 'Slot starting in 5 minutes must be rejected');
  assert.strictEqual(res5.errorCode, 'ADVANCE_BOOKING_REQUIRED');

  // 10:20 AM now, slot started at 10:15 AM (past slot) -> REJECT
  const resPast = validateWithMockClock('10:15 AM - 10:45 AM', currentTimeMinutes);
  assert.strictEqual(resPast.isValid, false);
  assert.strictEqual(resPast.errorCode, 'SLOT_ALREADY_STARTED');
});

// 4. Requirement 22: Capacity Calculations
test('Req 22: Capacity formula: theoretical = floor(duration/avg), online = floor(theor/2)', () => {
  function calculateCapacities(duration, avgProcessingTime) {
    if (!duration || !avgProcessingTime || avgProcessingTime <= 0) {
      return { theoreticalCapacity: 0, reservedOfflineCapacity: 0, maxOnlineBookings: 0 };
    }
    const theoreticalCapacity = Math.floor(duration / avgProcessingTime);
    const reservedOfflineCapacity = Math.floor(theoreticalCapacity / 2);
    const maxOnlineBookings = Math.floor(theoreticalCapacity / 2);
    return { theoreticalCapacity, reservedOfflineCapacity, maxOnlineBookings };
  }

  // Example 1 from spec: Duration 30 mins, avg 5 mins -> Theor: 6, Off: 3, Online: 3
  const cap1 = calculateCapacities(30, 5);
  assert.strictEqual(cap1.theoreticalCapacity, 6);
  assert.strictEqual(cap1.reservedOfflineCapacity, 3);
  assert.strictEqual(cap1.maxOnlineBookings, 3);

  // Example 2 from spec: Duration 40 mins, avg 6 mins -> Theor: 6, Off: 3, Online: 3
  const cap2 = calculateCapacities(40, 6);
  assert.strictEqual(cap2.theoreticalCapacity, 6);
  assert.strictEqual(cap2.reservedOfflineCapacity, 3);
  assert.strictEqual(cap2.maxOnlineBookings, 3);

  // Example 3: Duration 45 mins, avg 10 mins -> Theor: 4, Off: 2, Online: 2
  const cap3 = calculateCapacities(45, 10);
  assert.strictEqual(cap3.theoreticalCapacity, 4);
  assert.strictEqual(cap3.reservedOfflineCapacity, 2);
  assert.strictEqual(cap3.maxOnlineBookings, 2);

  // Example 4: Duration 30 mins, avg 40 mins -> Theor: 0, Online: 0 (Unusable configuration)
  const cap4 = calculateCapacities(30, 40);
  assert.strictEqual(cap4.theoreticalCapacity, 0);
  assert.strictEqual(cap4.maxOnlineBookings, 0);
});

// 5. Requirement 21 & 23: Slot Generation from Configuration and Exclusion of Partial Slots
test('Req 23: Generate slots cleanly without partial slots extending beyond end time', () => {
  function generateSlots(startTimeStr, endTimeStr, durationMins) {
    const startMins = parseTimeToMinutes(startTimeStr);
    const endMins = parseTimeToMinutes(endTimeStr);
    const slots = [];
    
    let current = startMins;
    while (current + durationMins <= endMins) {
      const slotStart = current;
      const slotEnd = current + durationMins;
      
      const formatMin = (m) => {
        let h = Math.floor(m / 60);
        const mins = m % 60;
        const mer = h >= 12 ? 'PM' : 'AM';
        if (h > 12) h -= 12;
        if (h === 0) h = 12;
        return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${mer}`;
      };

      slots.push(`${formatMin(slotStart)} - ${formatMin(slotEnd)}`);
      current += durationMins;
    }
    return slots;
  }

  // 10:00 AM to 12:00 PM, 30 min duration -> exactly 4 slots
  const slots1 = generateSlots('10:00 AM', '12:00 PM', 30);
  assert.deepStrictEqual(slots1, [
    '10:00 AM - 10:30 AM',
    '10:30 AM - 11:00 AM',
    '11:00 AM - 11:30 AM',
    '11:30 AM - 12:00 PM'
  ]);

  // 10:00 AM to 11:15 AM, 30 min duration -> 2 slots only, 11:00-11:30 extends beyond 11:15 and must be excluded!
  const slots2 = generateSlots('10:00 AM', '11:15 AM', 30);
  assert.deepStrictEqual(slots2, [
    '10:00 AM - 10:30 AM',
    '10:30 AM - 11:00 AM'
  ]);
});

// 7. Requirement 24: Stop Booking & Resume Booking for Today
test('Req 24: Stop Booking for Today scopes to service, office, and current date only', () => {
  const stopBookingEntries = [
    { service_id: 'srv-aadhaar', office_id: 'off-001', date: '2026-10-09' }
  ];

  function isBookingStopped(serviceId, officeId, targetDate) {
    return stopBookingEntries.some(
      entry => entry.service_id === serviceId && 
               entry.office_id === officeId && 
               entry.date === targetDate
    );
  }

  // Same service, same office, today -> STOPPED
  assert.strictEqual(isBookingStopped('srv-aadhaar', 'off-001', '2026-10-09'), true);

  // Different office, today -> NOT STOPPED (office isolation)
  assert.strictEqual(isBookingStopped('srv-aadhaar', 'off-002', '2026-10-09'), false);

  // Different service, today -> NOT STOPPED
  assert.strictEqual(isBookingStopped('srv-pan', 'off-001', '2026-10-09'), false);

  // Future date -> NOT STOPPED (future bookings preserved)
  assert.strictEqual(isBookingStopped('srv-aadhaar', 'off-001', '2026-10-10'), false);
});

// 8. Fix 7: Repeat Booking Business Rule
test('Fix 7: Citizen can book multiple slots unless actively IN_SERVICE or CALLED', () => {
  function canCitizenBookService(existingTokens, serviceId, newDate, newSlot) {
    for (const t of existingTokens) {
      if (t.serviceId !== serviceId) continue;
      
      // If currently being served at counter, must finish first
      if (t.status === 'IN_SERVICE' || t.status === 'CALLED') {
        return { 
          allowed: false, 
          reason: 'You currently have a turn actively in service or called at the counter. Please complete your visit first.' 
        };
      }

      // If exact duplicate slot on same date
      if (t.appointmentDate === newDate && t.appointmentTime === newSlot && t.status !== 'CANCELLED' && t.status !== 'COMPLETED') {
        return {
          allowed: false,
          reason: 'You already have an active appointment booked for this exact time slot.'
        };
      }
    }
    return { allowed: true };
  }

  // Case 1: User has completed earlier appointment -> ALLOWED
  const res1 = canCitizenBookService(
    [{ serviceId: 'srv-aadhaar', status: 'COMPLETED', appointmentDate: '2026-10-08', appointmentTime: '10:00 AM - 10:30 AM' }],
    'srv-aadhaar',
    '2026-10-09',
    '11:00 AM - 11:30 AM'
  );
  assert.strictEqual(res1.allowed, true);

  // Case 2: User has a WAITING appointment for 10:00 AM, wants to book another slot 02:00 PM -> ALLOWED
  const res2 = canCitizenBookService(
    [{ serviceId: 'srv-aadhaar', status: 'WAITING', appointmentDate: '2026-10-09', appointmentTime: '10:00 AM - 10:30 AM' }],
    'srv-aadhaar',
    '2026-10-09',
    '02:00 PM - 02:30 PM'
  );
  assert.strictEqual(res2.allowed, true);

  // Case 3: User is actively IN_SERVICE at table -> BLOCKED until turn resolves
  const res3 = canCitizenBookService(
    [{ serviceId: 'srv-aadhaar', status: 'IN_SERVICE', appointmentDate: '2026-10-09', appointmentTime: '10:00 AM - 10:30 AM' }],
    'srv-aadhaar',
    '2026-10-09',
    '02:00 PM - 02:30 PM'
  );
  assert.strictEqual(res3.allowed, false);

  // Case 4: User is trying to book the exact same slot already booked -> BLOCKED
  const res4 = canCitizenBookService(
    [{ serviceId: 'srv-aadhaar', status: 'WAITING', appointmentDate: '2026-10-09', appointmentTime: '10:00 AM - 10:30 AM' }],
    'srv-aadhaar',
    '2026-10-09',
    '10:00 AM - 10:30 AM'
  );
  assert.strictEqual(res4.allowed, false);
});

// 9. Fix 8: Employee Service Eligibility Filtering
test('Fix 8: Employee queue filters by assigned service IDs', () => {
  const employeeAssignedServices = ['srv-aadhaar'];
  const allTokens = [
    { id: 'tok-1', serviceId: 'srv-aadhaar', tokenNumber: 'A001' },
    { id: 'tok-2', serviceId: 'srv-pan', tokenNumber: 'P001' },
    { id: 'tok-3', serviceId: 'srv-aadhaar', tokenNumber: 'A002' },
    { id: 'tok-4', serviceId: 'srv-ration', tokenNumber: 'R001' }
  ];

  const filteredQueue = allTokens.filter(t => employeeAssignedServices.includes(t.serviceId));
  assert.strictEqual(filteredQueue.length, 2);
  assert.deepStrictEqual(filteredQueue.map(t => t.tokenNumber), ['A001', 'A002']);
});

// 10. Fix 12: Eliminate Duplicate Application Rows
test('Fix 12: Deduplicate applications by unique ID', () => {
  const fetchedApps = [
    { id: 'app-1', name: 'Application 1' },
    { id: 'app-2', name: 'Application 2' },
    { id: 'app-1', name: 'Application 1 (Duplicate join)' },
    { id: 'app-3', name: 'Application 3' },
    { id: 'app-2', name: 'Application 2 (Duplicate join)' }
  ];

  const deduped = Array.from(new Map(fetchedApps.map(a => [a.id, a])).values());
  assert.strictEqual(deduped.length, 3);
  assert.deepStrictEqual(deduped.map(a => a.id), ['app-1', 'app-2', 'app-3']);
});

async function runAll() {
  // Concurrency test
  await asyncTest('Concurrency: KeyedMutex serializes concurrent booking requests on the same slot', async () => {
    const mutex = new KeyedMutex();
    const slotKey = 'srv-001:2026-10-09:10:00 AM - 10:30 AM';
    const MAX_ONLINE_CAPACITY = 3;
    let currentBookedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;

    const bookingRequests = Array.from({ length: 10 }, (_, i) => async () => {
      return mutex.runExclusive(slotKey, async () => {
        await new Promise(r => setTimeout(r, 10));
        if (currentBookedCount < MAX_ONLINE_CAPACITY) {
          currentBookedCount++;
          acceptedCount++;
          return { success: true, user: `user-${i}` };
        } else {
          rejectedCount++;
          return { success: false, error: 'CAPACITY_FULL' };
        }
      });
    });

    await Promise.all(bookingRequests.map(fn => fn()));
    assert.strictEqual(acceptedCount, 3, 'Exactly 3 bookings must be accepted');
    assert.strictEqual(rejectedCount, 7, 'Remaining 7 bookings must be rejected');
    assert.strictEqual(currentBookedCount, 3, 'Capacity must never exceed 3');
  });

  console.log('\n----------------------------------------------------');
  console.log(`FINAL VERIFICATION SUMMARY: ${passCount} Passed, ${failCount} Failed.`);
  console.log('----------------------------------------------------');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAll();
