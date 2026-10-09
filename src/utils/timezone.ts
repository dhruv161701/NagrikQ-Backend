/**
 * Office Local Timezone Utilities
 * Enforces office-local timezone calculations (IST - Asia/Kolkata)
 * independent of server host OS or browser timezone.
 */

export interface OfficeTimeInfo {
  localDateStr: string; // YYYY-MM-DD
  currentTimeMinutes: number; // minutes from midnight
  formattedTime: string; // HH:MM AM/PM
  rawDate: Date;
}

export const getOfficeLocalTime = (timeZone: string = 'Asia/Kolkata'): OfficeTimeInfo => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'), 10);
  const minute = parseInt(getPart('minute'), 10);

  const localDateStr = `${year}-${month}-${day}`;
  const currentTimeMinutes = hour * 60 + minute;

  const meridiem = hour >= 12 ? 'PM' : 'AM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const formattedTime = `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${meridiem}`;

  return {
    localDateStr,
    currentTimeMinutes,
    formattedTime,
    rawDate: now,
  };
};

/**
 * Parses time string like "09:30 AM" or "09:30 AM - 10:00 AM" into minutes from midnight.
 */
export const parseTimeToMinutes = (tStr: string): number | null => {
  if (!tStr) return null;
  const match = tStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

/**
 * Validates a slot against current office local time:
 * - Rejects past slots on today
 * - Enforces minimum 30-minute advance booking window on today
 */
export const validateSlotBookingWindow = (
  timeSlot: string,
  bookingDate: string,
  timeZone: string = 'Asia/Kolkata'
): { isValid: boolean; errorCode?: string; errorMessage?: string } => {
  const { localDateStr, currentTimeMinutes } = getOfficeLocalTime(timeZone);

  // Future dates are not subject to today's clock restrictions
  if (bookingDate > localDateStr) {
    return { isValid: true };
  }

  // Past dates are strictly rejected
  if (bookingDate < localDateStr) {
    return {
      isValid: false,
      errorCode: 'PAST_DATE',
      errorMessage: 'Bookings cannot be made for past calendar dates.',
    };
  }

  // If slot is for today, evaluate 30-minute advance window
  const slotStartTimeStr = timeSlot.split('-')[0].trim();
  const slotStartMins = parseTimeToMinutes(slotStartTimeStr);

  if (slotStartMins === null) {
    return {
      isValid: false,
      errorCode: 'INVALID_SLOT_FORMAT',
      errorMessage: 'Invalid time slot format.',
    };
  }

  // Past slot check
  if (slotStartMins <= currentTimeMinutes) {
    return {
      isValid: false,
      errorCode: 'SLOT_ALREADY_STARTED',
      errorMessage: `Slot ${timeSlot} has already started or elapsed. Only future eligible slots can be booked.`,
    };
  }

  // 30-minute advance window check: slot_start_time >= current_time + 30 minutes
  if (slotStartMins < currentTimeMinutes + 30) {
    return {
      isValid: false,
      errorCode: 'ADVANCE_BOOKING_REQUIRED',
      errorMessage: `Slot ${timeSlot} is within the 30-minute advance booking window (slot_start_time >= current_time + 30 minutes). Please choose a slot starting at least 30 minutes from now.`,
    };
  }

  return { isValid: true };
};

export const isSlotInPastOrTooSoon = (
  bookingDate: string,
  timeSlot: string,
  minAdvanceMinutes: number = 30,
  timeZone: string = 'Asia/Kolkata'
): { isPastOrTooSoon: boolean; reason?: string } => {
  const result = validateSlotBookingWindow(timeSlot, bookingDate, timeZone);
  return {
    isPastOrTooSoon: !result.isValid,
    reason: result.errorMessage,
  };
};
