import { Request, Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { supabaseAdmin } from '../config/supabase';
import { getOfficeLocalTime } from '../utils/timezone';
import { notificationService } from '../services/notificationService';

export interface HolidayItem {
  id: string;
  name: string;
  holiday_date: string;
  holiday_type: 'NATIONAL' | 'STATE' | 'REGIONAL' | 'OFFICE';
  state?: string | null;
  office_id?: string | null;
  description?: string | null;
  is_closed: boolean;
  created_at?: string;
}

// Authoritative Indian Gazetted & State Holidays Base Calendar
const DEFAULT_HOLIDAYS: Omit<HolidayItem, 'id'>[] = [
  { name: 'Republic Day', holiday_date: '2026-01-26', holiday_type: 'NATIONAL', state: null, description: 'National Holiday - Republic Day', is_closed: true },
  { name: 'Maha Shivratri', holiday_date: '2026-02-15', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Maha Shivratri', is_closed: true },
  { name: 'Holi (Dhuleti)', holiday_date: '2026-03-04', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Holi', is_closed: true },
  { name: 'Mahavir Jayanti', holiday_date: '2026-03-31', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Mahavir Janma Kalyanak', is_closed: true },
  { name: 'Good Friday', holiday_date: '2026-04-03', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Good Friday', is_closed: true },
  { name: 'Dr. B.R. Ambedkar Jayanti', holiday_date: '2026-04-14', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Ambedkar Jayanti', is_closed: true },
  { name: 'Eid-ul-Fitr', holiday_date: '2026-03-21', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Eid-ul-Fitr', is_closed: true },
  { name: 'Gujarat Foundation Day', holiday_date: '2026-05-01', holiday_type: 'STATE', state: 'Gujarat', description: 'State Holiday - Gujarat Day', is_closed: true },
  { name: 'Maharashtra Day', holiday_date: '2026-05-01', holiday_type: 'STATE', state: 'Maharashtra', description: 'State Holiday - Maharashtra Day', is_closed: true },
  { name: 'Buddha Purnima', holiday_date: '2026-05-31', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Buddha Purnima', is_closed: true },
  { name: 'Muharram', holiday_date: '2026-06-26', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Muharram', is_closed: true },
  { name: 'Independence Day', holiday_date: '2026-08-15', holiday_type: 'NATIONAL', state: null, description: 'National Holiday - 80th Independence Day', is_closed: true },
  { name: 'Janmashtami', holiday_date: '2026-09-04', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Shri Krishna Janmashtami', is_closed: true },
  { name: 'Mahatma Gandhi Jayanti', holiday_date: '2026-10-02', holiday_type: 'NATIONAL', state: null, description: 'National Holiday - Gandhi Jayanti', is_closed: true },
  { name: 'Dussehra (Vijayadashami)', holiday_date: '2026-10-20', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Vijaya Dashami', is_closed: true },
  { name: 'Diwali (Deepavali)', holiday_date: '2026-11-09', holiday_type: 'NATIONAL', state: null, description: 'Festival Holiday - Deepavali', is_closed: true },
  { name: 'New Year Day (Bestu Varas)', holiday_date: '2026-11-10', holiday_type: 'STATE', state: 'Gujarat', description: 'State Holiday - Gujarati New Year', is_closed: true },
  { name: 'Bhai Dooj', holiday_date: '2026-11-11', holiday_type: 'NATIONAL', state: null, description: 'Festival Holiday - Bhai Dooj', is_closed: true },
  { name: 'Guru Nanak Jayanti', holiday_date: '2026-11-24', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Guru Nanak Jayanti', is_closed: true },
  { name: 'Christmas Day', holiday_date: '2026-12-25', holiday_type: 'NATIONAL', state: null, description: 'Gazetted Holiday - Christmas', is_closed: true },
  { name: 'Republic Day', holiday_date: '2027-01-26', holiday_type: 'NATIONAL', state: null, description: 'National Holiday - Republic Day', is_closed: true },
  { name: 'Independence Day', holiday_date: '2027-08-15', holiday_type: 'NATIONAL', state: null, description: 'National Holiday - Independence Day', is_closed: true },
  { name: 'Mahatma Gandhi Jayanti', holiday_date: '2027-10-02', holiday_type: 'NATIONAL', state: null, description: 'National Holiday - Gandhi Jayanti', is_closed: true },
];

/**
 * Checks if a specific date and office is closed for a national/state/office holiday.
 */
export async function isOfficeClosedOnDate(
  dateStr: string,
  state?: string,
  officeId?: string
): Promise<{ isClosed: boolean; holiday?: HolidayItem }> {
  try {
    // 1. Query Supabase holidays table
    let query = supabaseAdmin
      .from('holidays')
      .select('*')
      .eq('holiday_date', dateStr)
      .eq('is_closed', true);

    const { data: dbHolidays, error } = await query;
    if (!error && Array.isArray(dbHolidays) && dbHolidays.length > 0) {
      // Find matching holiday
      const match = dbHolidays.find((h) => {
        if (h.holiday_type === 'NATIONAL') return true;
        if (h.holiday_type === 'STATE' && state && h.state && h.state.toLowerCase() === state.toLowerCase()) return true;
        if (h.holiday_type === 'OFFICE' && officeId && h.office_id === officeId) return true;
        return h.holiday_type === 'NATIONAL';
      });

      if (match) {
        return { isClosed: true, holiday: match };
      }
    }
  } catch (err) {
    console.warn('[HOLIDAY_CHECK_WARN]', err);
  }

  // 2. Authoritative calendar fallback
  const matchDef = DEFAULT_HOLIDAYS.find((h) => {
    if (h.holiday_date !== dateStr || !h.is_closed) return false;
    if (h.holiday_type === 'NATIONAL') return true;
    if (h.holiday_type === 'STATE' && state && h.state && h.state.toLowerCase() === state.toLowerCase()) return true;
    return false;
  });

  if (matchDef) {
    return {
      isClosed: true,
      holiday: {
        id: `def-${matchDef.holiday_date}`,
        ...matchDef,
      },
    };
  }

  return { isClosed: false };
}

/**
 * GET /api/holidays
 * List upcoming or date-filtered holidays
 */
export const getHolidays = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, state, officeId, upcoming } = req.query;
    const { localDateStr } = getOfficeLocalTime();

    let holidays: HolidayItem[] = [];

    try {
      let query = supabaseAdmin.from('holidays').select('*').order('holiday_date', { ascending: true });

      if (date && typeof date === 'string') {
        query = query.eq('holiday_date', date);
      } else if (upcoming === 'true') {
        query = query.gte('holiday_date', localDateStr);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        holidays = data;
      }
    } catch {
      // ignore
    }

    // Merge default calendar if DB list is empty
    if (holidays.length === 0) {
      holidays = DEFAULT_HOLIDAYS.map((h, i) => ({
        id: `h-seed-${i + 1}`,
        ...h,
      }));

      if (date && typeof date === 'string') {
        holidays = holidays.filter((h) => h.holiday_date === date);
      } else if (upcoming === 'true') {
        holidays = holidays.filter((h) => h.holiday_date >= localDateStr);
      }
    }

    // Filter by state or office if requested
    if (state && typeof state === 'string') {
      holidays = holidays.filter((h) => !h.state || h.state.toLowerCase() === state.toLowerCase() || h.holiday_type === 'NATIONAL');
    }

    if (officeId && typeof officeId === 'string') {
      holidays = holidays.filter((h) => !h.office_id || h.office_id === officeId || h.holiday_type === 'NATIONAL');
    }

    res.json({
      success: true,
      data: holidays,
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * GET /api/holidays/check-closure
 */
export const checkClosure = async (req: Request, res: Response): Promise<void> => {
  try {
    const dateStr = String(req.query.date || '');
    const stateStr = req.query.state ? String(req.query.state) : undefined;
    const officeIdStr = req.query.officeId ? String(req.query.officeId) : undefined;

    if (!dateStr) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'date query parameter is required.' } });
      return;
    }

    const closure = await isOfficeClosedOnDate(dateStr, stateStr, officeIdStr);
    res.json({
      success: true,
      data: closure,
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * POST /api/holidays
 */
export const createHoliday = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, holidayDate, holidayType, state, officeId, description, isClosed } = req.body;

    if (!name || !holidayDate) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Holiday name and holidayDate are required.' },
      });
      return;
    }

    const payload = {
      name,
      holiday_date: holidayDate,
      holiday_type: holidayType || 'NATIONAL',
      state: state || null,
      office_id: officeId || null,
      description: description || null,
      is_closed: isClosed !== false,
    };

    const { data, error } = await supabaseAdmin
      .from('holidays')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      res.status(400).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
      return;
    }

    res.status(201).json({ success: true, data } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * PUT /api/holidays/:id
 */
export const updateHoliday = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, holidayDate, holidayType, state, officeId, description, isClosed } = req.body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (holidayDate !== undefined) updates.holiday_date = holidayDate;
    if (holidayType !== undefined) updates.holiday_type = holidayType;
    if (state !== undefined) updates.state = state;
    if (officeId !== undefined) updates.office_id = officeId;
    if (description !== undefined) updates.description = description;
    if (isClosed !== undefined) updates.is_closed = isClosed;

    const { data, error } = await supabaseAdmin
      .from('holidays')
      .update(updates)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      res.status(400).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
      return;
    }

    res.json({ success: true, data } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * DELETE /api/holidays/:id
 */
export const deleteHoliday = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('holidays').delete().eq('id', id);
    if (error) {
      res.status(400).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
      return;
    }
    res.json({ success: true, message: 'Holiday deleted successfully.' } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * POST /api/holidays/advance-notifications
 * Dispatches push notifications to affected users 5 days prior to an office closure.
 */
export const sendAdvanceHolidayNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { localDateStr } = getOfficeLocalTime();
    // Compute date 5 days ahead
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 5);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find holidays on targetDateStr
    const { holiday, isClosed } = await isOfficeClosedOnDate(targetDateStr);

    if (!isClosed || !holiday) {
      res.json({
        success: true,
        message: `No office closure scheduled for 5 days ahead (${targetDateStr}).`,
        notificationsSent: 0,
      });
      return;
    }

    // Find tokens or applications booked for targetDateStr
    const { data: bookedTokens } = await supabaseAdmin
      .from('queue_tokens')
      .select('user_id, token_number, service_name, office_id')
      .eq('slot_date', targetDateStr)
      .not('status', 'eq', 'CANCELLED');

    let count = 0;
    const notifiedUserIds = new Set<string>();

    if (Array.isArray(bookedTokens)) {
      for (const tok of bookedTokens) {
        if (!tok.user_id || notifiedUserIds.has(tok.user_id)) continue;
        notifiedUserIds.add(tok.user_id);

        await notificationService.sendQueuePushNotification({
          userId: tok.user_id,
          tokenNumber: tok.token_number || 'APPOINTMENT',
          serviceName: tok.service_name || 'Government Service',
          title: 'Upcoming Office Closure Alert',
          body: `Notice: Government offices will be closed on ${targetDateStr} for ${holiday.name}. If you hold an appointment, please check your status or reschedule.`,
          eventType: 'OFFICE_CLOSURE_ALERT',
          metadata: {
            holidayName: holiday.name,
            closureDate: targetDateStr,
            serviceName: tok.service_name || '',
          },
        });
        count++;
      }
    }

    res.json({
      success: true,
      message: `Advance holiday notice sent for ${holiday.name} on ${targetDateStr}.`,
      notificationsSent: count,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
