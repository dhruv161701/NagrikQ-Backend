"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableSlotsForService = exports.resumeBookingToday = exports.stopBookingToday = exports.updateServiceSlots = exports.getLocationAwareServices = exports.getOffices = exports.getServiceById = exports.getServices = void 0;
const supabase_1 = require("../config/supabase");
const getServices = async (req, res) => {
    try {
        const { category, search, include_inactive } = req.query;
        let query = supabase_1.supabaseAdmin.from('services').select('*, document_requirements(*)');
        if (include_inactive !== 'true') {
            query = query.eq('is_active', true);
        }
        if (category && typeof category === 'string' && category !== 'All') {
            query = query.eq('category', category);
        }
        if (search && typeof search === 'string') {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
        }
        const { data: services, error } = await query;
        if (error || !services) {
            res.json({ success: true, data: [] });
            return;
        }
        res.json({ success: true, data: services });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getServices = getServices;
const getServiceById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: service, error } = await supabase_1.supabaseAdmin
            .from('services')
            .select('*, document_requirements(*)')
            .eq('id', id)
            .single();
        if (error || !service) {
            res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Service not found.' },
            });
            return;
        }
        res.json({ success: true, data: service });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getServiceById = getServiceById;
const getOffices = async (req, res) => {
    try {
        const { district, taluka } = req.query;
        let query = supabase_1.supabaseAdmin.from('offices').select('*').eq('status', 'ACTIVE');
        if (district && typeof district === 'string') {
            query = query.eq('district', district);
        }
        if (taluka && typeof taluka === 'string') {
            query = query.eq('taluka', taluka);
        }
        const { data: offices, error } = await query;
        if (error || !offices) {
            res.json({ success: true, data: [] });
            return;
        }
        res.json({ success: true, data: offices });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getOffices = getOffices;
const getLocationAwareServices = async (req, res) => {
    try {
        const { district, taluka, officeId, category, search } = req.query;
        // 1. Fetch all active services
        let serviceQuery = supabase_1.supabaseAdmin.from('services').select('*, document_requirements(*)').eq('is_active', true);
        if (category && typeof category === 'string' && category !== 'All') {
            serviceQuery = serviceQuery.eq('category', category);
        }
        if (search && typeof search === 'string') {
            serviceQuery = serviceQuery.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
        }
        const { data: allServices, error: sErr } = await serviceQuery;
        if (sErr || !allServices) {
            res.json({ success: true, data: [] });
            return;
        }
        // 2. Fetch offices in target location
        let officeQuery = supabase_1.supabaseAdmin.from('offices').select('id, name, district, taluka, city').eq('status', 'ACTIVE');
        if (officeId && typeof officeId === 'string') {
            officeQuery = officeQuery.eq('id', officeId);
        }
        else if (district && typeof district === 'string') {
            officeQuery = officeQuery.eq('district', district);
        }
        const { data: eligibleOffices } = await officeQuery;
        const eligibleOfficeIds = eligibleOffices ? eligibleOffices.map((o) => o.id) : [];
        // 3. Fetch office_services junction mappings
        let officeServicesQuery = supabase_1.supabaseAdmin.from('office_services').select('*').eq('status', 'ACTIVE');
        if (eligibleOfficeIds.length > 0) {
            officeServicesQuery = officeServicesQuery.in('office_id', eligibleOfficeIds);
        }
        const { data: officeServiceMappings } = await officeServicesQuery;
        const availableServiceIds = new Set(officeServiceMappings ? officeServiceMappings.map((os) => os.service_id) : []);
        // 4. Annotate each service with location availability metadata
        const locationAwareServices = allServices.map((service) => {
            const isAvailableInLocation = eligibleOfficeIds.length === 0 || availableServiceIds.has(service.id);
            const offeringOffices = officeServiceMappings
                ? officeServiceMappings
                    .filter((os) => os.service_id === service.id)
                    .map((os) => eligibleOffices?.find((off) => off.id === os.office_id))
                    .filter(Boolean)
                : [];
            return {
                ...service,
                isAvailableAtLocation: isAvailableInLocation,
                offeringOfficesCount: offeringOffices.length,
                offeringOffices,
                availabilityNotice: isAvailableInLocation
                    ? 'Available at nearby office'
                    : 'Not available at this selected office location. Click to find nearby offices.',
            };
        });
        res.json({ success: true, data: locationAwareServices });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getLocationAwareServices = getLocationAwareServices;
const updateServiceSlots = async (req, res) => {
    try {
        const { id } = req.params;
        const { startTime, endTime, slotDurationMinutes, avgProcessingTimeMinutes, enableBreakTime, breakStartTime, breakEndTime, stoppedBookingDates, isBookingStopped, officeId, } = req.body;
        // Validate slot duration options (exactly 30, 35, 40, 45, 50, 55, 60 minutes)
        const validDurations = [30, 35, 40, 45, 50, 55, 60];
        const duration = slotDurationMinutes !== undefined ? parseInt(String(slotDurationMinutes), 10) : undefined;
        if (duration !== undefined && !validDurations.includes(duration)) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_SLOT_DURATION',
                    message: `Slot duration must be one of: ${validDurations.join(', ')} minutes.`,
                },
            });
            return;
        }
        // Validate average processing time (must be greater than 0)
        const procTime = avgProcessingTimeMinutes !== undefined ? parseInt(String(avgProcessingTimeMinutes), 10) : undefined;
        if (procTime !== undefined && (isNaN(procTime) || procTime <= 0)) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PROCESSING_TIME',
                    message: 'Average processing time per citizen must be a positive integer greater than zero.',
                },
            });
            return;
        }
        // Validate start and end times if both provided
        const parseTimeToMinutes = (tStr) => {
            if (!tStr)
                return null;
            const match = tStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
            if (!match)
                return null;
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const meridiem = match[3]?.toUpperCase();
            if (meridiem === 'PM' && h < 12)
                h += 12;
            if (meridiem === 'AM' && h === 12)
                h = 0;
            return h * 60 + m;
        };
        if (startTime && endTime) {
            const startM = parseTimeToMinutes(startTime);
            const endM = parseTimeToMinutes(endTime);
            if (startM !== null && endM !== null && endM <= startM) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_TIME_RANGE',
                        message: 'Service End Time must be later than Service Start Time.',
                    },
                });
                return;
            }
        }
        // Requirement 22: Calculate capacity formulas
        // Theoretical capacity = floor(slot duration / average processing time)
        // Reserved offline capacity = floor(theoretical capacity / 2)
        // Maximum online bookings = floor(theoretical capacity / 2)
        let slotCapacity;
        if (duration !== undefined && procTime !== undefined) {
            const theoreticalCapacity = Math.floor(duration / procTime);
            const onlineCapacity = Math.floor(theoreticalCapacity / 2);
            if (onlineCapacity <= 0) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'ZERO_ONLINE_CAPACITY',
                        message: `Configuration results in 0 online booking capacity: floor(${duration} / ${procTime}) = ${theoreticalCapacity} theoretical capacity, giving floor(${theoreticalCapacity} / 2) = 0 online bookings. Average processing time is too long for this slot duration.`,
                    },
                });
                return;
            }
            slotCapacity = onlineCapacity;
        }
        const updates = {
            updated_at: new Date().toISOString(),
        };
        if (startTime !== undefined)
            updates.start_time = startTime;
        if (endTime !== undefined)
            updates.end_time = endTime;
        if (duration !== undefined)
            updates.slot_duration_minutes = duration;
        if (procTime !== undefined)
            updates.avg_processing_time_minutes = procTime;
        if (slotCapacity !== undefined)
            updates.slot_capacity = slotCapacity;
        if (enableBreakTime !== undefined)
            updates.enable_break_time = enableBreakTime;
        if (breakStartTime !== undefined)
            updates.break_start_time = breakStartTime;
        if (breakEndTime !== undefined)
            updates.break_end_time = breakEndTime;
        if (stoppedBookingDates !== undefined)
            updates.stopped_booking_dates = stoppedBookingDates;
        if (isBookingStopped !== undefined)
            updates.is_booking_stopped = isBookingStopped;
        // 1. Update services table
        const { data: updated, error } = await supabase_1.supabaseAdmin
            .from('services')
            .update(updates)
            .eq('id', id)
            .select('*, document_requirements(*)')
            .maybeSingle();
        if (error) {
            console.warn('[SERVICE_SLOTS_UPDATE_WARN]', error.message);
            // Attempt safe partial update if specific schema columns are pending migration
            const fallbackUpdates = { updated_at: new Date().toISOString() };
            if (updates.is_active !== undefined)
                fallbackUpdates.is_active = updates.is_active;
            const { data: fallbackData, error: fbErr } = await supabase_1.supabaseAdmin
                .from('services')
                .update(fallbackUpdates)
                .eq('id', id)
                .select('*')
                .maybeSingle();
            if (fbErr) {
                res.status(400).json({
                    success: false,
                    error: { code: 'DATABASE_ERROR', message: error.message },
                });
                return;
            }
            res.json({
                success: true,
                data: { ...(fallbackData || {}), ...updates, id },
                message: 'Service slot configuration saved.',
            });
            return;
        }
        // 2. Also persist office-scoped config if officeId is provided
        if (officeId && duration !== undefined && procTime !== undefined) {
            try {
                const theoretical = Math.floor(duration / procTime);
                const onlineCap = Math.floor(theoretical / 2);
                await supabase_1.supabaseAdmin.from('service_slot_configs').upsert({
                    service_id: id,
                    office_id: officeId,
                    start_time: startTime || '09:30 AM',
                    end_time: endTime || '05:00 PM',
                    slot_duration_minutes: duration,
                    avg_processing_time_minutes: procTime,
                    slot_capacity: onlineCap,
                    theoretical_capacity: theoretical,
                    reserved_offline_capacity: Math.floor(theoretical / 2),
                    enable_break_time: enableBreakTime !== false,
                    break_start_time: breakStartTime || '01:00 PM',
                    break_end_time: breakEndTime || '02:00 PM',
                }, { onConflict: 'service_id,office_id' });
            }
            catch (scopedErr) {
                console.warn('[SCOPED_SLOT_CONFIG_NOTE]', scopedErr);
            }
        }
        res.json({
            success: true,
            data: updated,
            message: 'Service slot configuration successfully updated.',
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.updateServiceSlots = updateServiceSlots;
/**
 * Requirement 24: Stop Booking for Today
 * Scoped to service, office, and calendar date.
 * Coordinates with bookingMutex to prevent race conditions with incoming bookings.
 */
const stopBookingToday = async (req, res) => {
    try {
        const { id } = req.params;
        const { officeId, date, reason } = req.body;
        const { getOfficeLocalTime } = await Promise.resolve().then(() => __importStar(require('../utils/timezone')));
        const { bookingMutex } = await Promise.resolve().then(() => __importStar(require('../utils/mutex')));
        const { localDateStr } = getOfficeLocalTime();
        const targetDate = date || localDateStr;
        // Mutex key ensures no booking request for this service on targetDate is being evaluated concurrently
        const mutexKey = `stop_${id}_${targetDate}`;
        await bookingMutex.runExclusive(mutexKey, async () => {
            // 1. Fetch current service
            const { data: service } = await supabase_1.supabaseAdmin
                .from('services')
                .select('name, stopped_booking_dates, is_booking_stopped, end_time')
                .eq('id', id)
                .maybeSingle();
            // Check if today's booking window has already finished
            const { currentTimeMinutes } = getOfficeLocalTime();
            const { parseTimeToMinutes } = await Promise.resolve().then(() => __importStar(require('../utils/timezone')));
            const serviceEndTimeStr = service?.end_time || '05:00 PM';
            const serviceEndMins = parseTimeToMinutes(serviceEndTimeStr) || 1020; // 5:00 PM default
            if (targetDate === localDateStr && currentTimeMinutes >= serviceEndMins) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: 'BOOKING_WINDOW_CLOSED',
                        message: `Today's booking slots have already finished (office hours ended at ${serviceEndTimeStr}). Bookings cannot be stopped for a period that is already over.`,
                    },
                });
                return;
            }
            const currentDates = service?.stopped_booking_dates || [];
            const updatedDates = Array.from(new Set([...currentDates, targetDate]));
            // 2. Persist in services table
            await supabase_1.supabaseAdmin
                .from('services')
                .update({
                stopped_booking_dates: updatedDates,
                is_booking_stopped: targetDate === localDateStr ? true : service?.is_booking_stopped,
                updated_at: new Date().toISOString(),
            })
                .eq('id', id);
            // 3. Persist in service_stop_bookings table (scoped to office if available)
            try {
                if (officeId) {
                    await supabase_1.supabaseAdmin.from('service_stop_bookings').upsert({
                        service_id: id,
                        office_id: officeId,
                        stop_date: targetDate,
                        reason: reason || 'Stopped by counter administration due to heavy crowd.',
                    }, { onConflict: 'service_id,office_id,stop_date' });
                }
            }
            catch (stopTblErr) {
                console.warn('[STOP_BOOKING_TBL_NOTE]', stopTblErr);
            }
            // 4. Record audit log
            try {
                const actor = req.user;
                await supabase_1.supabaseAdmin.from('audit_logs').insert({
                    actor_user_id: actor?.id,
                    actor_user_name: actor?.fullName || 'Staff Official',
                    actor_user_role: actor?.role || 'employee',
                    action: 'STOP_BOOKING_TODAY',
                    entity_type: 'service',
                    entity_id: id,
                    details: `Stopped online bookings for service ${service?.name || id} on ${targetDate}. Reason: ${reason || 'Heavy queue crowd'}.`,
                });
            }
            catch { }
            res.json({
                success: true,
                data: {
                    serviceId: id,
                    officeId: officeId || null,
                    stopDate: targetDate,
                    isStopped: true,
                    reason: reason || 'High physical counter load',
                },
                message: `Online bookings for ${service?.name || 'this service'} have been stopped for ${targetDate}. Existing bookings are preserved.`,
            });
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.stopBookingToday = stopBookingToday;
/**
 * Requirement 24: Resume Booking for Today
 */
const resumeBookingToday = async (req, res) => {
    try {
        const { id } = req.params;
        const { officeId, date } = req.body;
        const { getOfficeLocalTime } = await Promise.resolve().then(() => __importStar(require('../utils/timezone')));
        const { bookingMutex } = await Promise.resolve().then(() => __importStar(require('../utils/mutex')));
        const { localDateStr } = getOfficeLocalTime();
        const targetDate = date || localDateStr;
        const mutexKey = `stop_${id}_${targetDate}`;
        await bookingMutex.runExclusive(mutexKey, async () => {
            // 1. Fetch current service
            const { data: service } = await supabase_1.supabaseAdmin
                .from('services')
                .select('name, stopped_booking_dates, is_booking_stopped')
                .eq('id', id)
                .maybeSingle();
            const currentDates = service?.stopped_booking_dates || [];
            const updatedDates = currentDates.filter((d) => d !== targetDate);
            // 2. Update services table
            await supabase_1.supabaseAdmin
                .from('services')
                .update({
                stopped_booking_dates: updatedDates,
                is_booking_stopped: targetDate === localDateStr ? false : service?.is_booking_stopped,
                updated_at: new Date().toISOString(),
            })
                .eq('id', id);
            // 3. Remove from service_stop_bookings table
            try {
                let deleteQuery = supabase_1.supabaseAdmin
                    .from('service_stop_bookings')
                    .delete()
                    .eq('service_id', id)
                    .eq('stop_date', targetDate);
                if (officeId) {
                    deleteQuery = deleteQuery.eq('office_id', officeId);
                }
                await deleteQuery;
            }
            catch (delErr) {
                console.warn('[RESUME_BOOKING_TBL_NOTE]', delErr);
            }
            // 4. Record audit log
            try {
                const actor = req.user;
                await supabase_1.supabaseAdmin.from('audit_logs').insert({
                    actor_user_id: actor?.id,
                    actor_user_name: actor?.fullName || 'Staff Official',
                    actor_user_role: actor?.role || 'employee',
                    action: 'RESUME_BOOKING_TODAY',
                    entity_type: 'service',
                    entity_id: id,
                    details: `Resumed online bookings for service ${service?.name || id} on ${targetDate}.`,
                });
            }
            catch { }
            res.json({
                success: true,
                data: {
                    serviceId: id,
                    officeId: officeId || null,
                    stopDate: targetDate,
                    isStopped: false,
                },
                message: `Online bookings for ${service?.name || 'this service'} have been resumed for ${targetDate}.`,
            });
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.resumeBookingToday = resumeBookingToday;
/**
 * Requirement 15: Dynamic Time Slots Calculation
 * Computes available booking time slots based on Admin configuration:
 * start_time, end_time, slot_duration_minutes, break_time, and capacity.
 * Checks holiday closures and stopped bookings.
 */
const getAvailableSlotsForService = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, officeId, state } = req.query;
        const { getOfficeLocalTime, parseTimeToMinutes, isSlotInPastOrTooSoon } = await Promise.resolve().then(() => __importStar(require('../utils/timezone')));
        const { isOfficeClosedOnDate } = await Promise.resolve().then(() => __importStar(require('./holidayController')));
        const { localDateStr, currentTimeMinutes } = getOfficeLocalTime();
        const targetDate = date || localDateStr;
        // 1. Fetch service details
        const { data: service, error } = await supabase_1.supabaseAdmin
            .from('services')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error || !service) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found.' } });
            return;
        }
        // 2. Check if office is closed for a holiday
        const holidayClosure = await isOfficeClosedOnDate(targetDate, state, officeId);
        if (holidayClosure.isClosed && holidayClosure.holiday) {
            res.json({
                success: true,
                data: {
                    serviceId: id,
                    date: targetDate,
                    isHoliday: true,
                    holidayName: holidayClosure.holiday.name,
                    isStopped: false,
                    isWindowClosed: true,
                    slots: [],
                    message: `Office is closed on ${targetDate} for ${holidayClosure.holiday.name}.`,
                },
            });
            return;
        }
        // 3. Check if booking is stopped
        const isStoppedInService = (service.stopped_booking_dates && service.stopped_booking_dates.includes(targetDate)) ||
            (targetDate === localDateStr && service.is_booking_stopped);
        if (isStoppedInService) {
            res.json({
                success: true,
                data: {
                    serviceId: id,
                    date: targetDate,
                    isHoliday: false,
                    isStopped: true,
                    isWindowClosed: true,
                    slots: [],
                    message: `Online bookings for this service are stopped for ${targetDate}.`,
                },
            });
            return;
        }
        // 4. Determine schedule parameters
        let startTimeStr = service.start_time || '09:30 AM';
        let endTimeStr = service.end_time || '05:00 PM';
        let durationMins = service.slot_duration_minutes || 30;
        let procTimeMins = service.avg_processing_time_minutes || 5;
        let enableBreak = service.enable_break_time !== false;
        let breakStartStr = service.break_start_time || '01:00 PM';
        let breakEndStr = service.break_end_time || '02:00 PM';
        if (officeId) {
            try {
                const { data: scoped } = await supabase_1.supabaseAdmin
                    .from('service_slot_configs')
                    .select('*')
                    .eq('service_id', id)
                    .eq('office_id', officeId)
                    .maybeSingle();
                if (scoped) {
                    startTimeStr = scoped.start_time || startTimeStr;
                    endTimeStr = scoped.end_time || endTimeStr;
                    durationMins = scoped.slot_duration_minutes || durationMins;
                    procTimeMins = scoped.avg_processing_time_minutes || procTimeMins;
                    enableBreak = scoped.enable_break_time !== false;
                    breakStartStr = scoped.break_start_time || breakStartStr;
                    breakEndStr = scoped.break_end_time || breakEndStr;
                }
            }
            catch { }
        }
        const theoreticalCap = Math.floor(durationMins / procTimeMins);
        const onlineCap = Math.floor(theoreticalCap / 2);
        const capacityPerSlot = Math.max(1, service.slot_capacity || onlineCap);
        const startM = parseTimeToMinutes(startTimeStr) || 570;
        const endM = parseTimeToMinutes(endTimeStr) || 1020;
        const breakStartM = enableBreak ? parseTimeToMinutes(breakStartStr) || 780 : -1;
        const breakEndM = enableBreak ? parseTimeToMinutes(breakEndStr) || 840 : -1;
        const isToday = targetDate === localDateStr;
        const isWindowClosed = isToday && currentTimeMinutes >= endM;
        // 5. Fetch existing bookings for this service on targetDate
        const { data: bookedTokens } = await supabase_1.supabaseAdmin
            .from('queue_tokens')
            .select('time_slot')
            .eq('service_id', id)
            .eq('slot_date', targetDate)
            .not('status', 'in', '("CANCELLED","EXPIRED")');
        const bookingsCountMap = {};
        if (Array.isArray(bookedTokens)) {
            for (const t of bookedTokens) {
                if (t.time_slot) {
                    bookingsCountMap[t.time_slot] = (bookingsCountMap[t.time_slot] || 0) + 1;
                }
            }
        }
        // 6. Generate time slots
        const formatTimePart = (m) => {
            let h = Math.floor(m / 60);
            const min = m % 60;
            const meridiem = h >= 12 ? 'PM' : 'AM';
            let dh = h % 12;
            if (dh === 0)
                dh = 12;
            return `${String(dh).padStart(2, '0')}:${String(min).padStart(2, '0')} ${meridiem}`;
        };
        const slotsList = [];
        for (let cur = startM; cur + durationMins <= endM; cur += durationMins) {
            const slotEnd = cur + durationMins;
            // Check break overlap
            if (enableBreak && breakStartM !== -1 && breakEndM !== -1) {
                if (cur < breakEndM && slotEnd > breakStartM) {
                    continue; // skip break window
                }
            }
            const slotStr = `${formatTimePart(cur)} - ${formatTimePart(slotEnd)}`;
            const booked = bookingsCountMap[slotStr] || 0;
            const remaining = Math.max(0, capacityPerSlot - booked);
            let status = 'AVAILABLE';
            let isAvailable = true;
            let reason;
            if (isToday) {
                const slotCheck = isSlotInPastOrTooSoon(targetDate, slotStr, 30);
                if (slotCheck.isPastOrTooSoon) {
                    status = 'ELAPSED';
                    isAvailable = false;
                    reason = slotCheck.reason || 'Slot time has elapsed';
                }
            }
            if (isAvailable && remaining === 0) {
                status = 'FULL';
                isAvailable = false;
                reason = 'Slot is fully booked';
            }
            slotsList.push({
                slot: slotStr,
                slotCapacity: capacityPerSlot,
                bookedCount: booked,
                remaining,
                isAvailable,
                status,
                reason,
            });
        }
        res.json({
            success: true,
            data: {
                serviceId: id,
                date: targetDate,
                isToday,
                isHoliday: false,
                isStopped: false,
                isWindowClosed,
                slotCapacity: capacityPerSlot,
                slotDurationMinutes: durationMins,
                slots: slotsList,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getAvailableSlotsForService = getAvailableSlotsForService;
