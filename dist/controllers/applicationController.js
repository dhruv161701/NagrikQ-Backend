"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDocumentStatus = exports.updateApplicationStatus = exports.getApplications = exports.createApplication = void 0;
const supabase_1 = require("../config/supabase");
const n8nService_1 = require("../services/n8nService");
const createApplication = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { serviceId, serviceName, officeId, documents } = req.body;
        if (!userId || !serviceId) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_INPUT', message: 'serviceId and authentication required.' },
            });
            return;
        }
        // Resolve valid service UUID if needed
        let resolvedServiceId = serviceId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serviceId);
        if (!isUuid) {
            const { data: matchedSvc } = await supabase_1.supabaseAdmin
                .from('services')
                .select('id')
                .or(`name.ilike.%${serviceName || ''}%,code.ilike.%${serviceId}%`)
                .limit(1)
                .maybeSingle();
            if (matchedSvc) {
                resolvedServiceId = matchedSvc.id;
            }
            else {
                const { data: firstSvc } = await supabase_1.supabaseAdmin.from('services').select('id').limit(1).single();
                if (firstSvc)
                    resolvedServiceId = firstSvc.id;
            }
        }
        // Resolve valid office UUID
        let resolvedOfficeId = officeId;
        const isOfficeUuid = officeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(officeId);
        if (!isOfficeUuid) {
            const { data: firstOffice } = await supabase_1.supabaseAdmin.from('offices').select('id').limit(1).single();
            if (firstOffice)
                resolvedOfficeId = firstOffice.id;
        }
        const applicationNumber = `APP-2026-${Math.floor(10000 + Math.random() * 90000)}`;
        const { data: app, error } = await supabase_1.supabaseAdmin
            .from('applications')
            .insert({
            application_number: applicationNumber,
            user_id: userId,
            service_id: resolvedServiceId,
            office_id: resolvedOfficeId,
            status: 'SUBMITTED',
        })
            .select('*, services(id, name, code, category), offices(id, name), profiles:user_id(full_name, email, phone)')
            .single();
        if (error || !app) {
            console.error('[CREATE_APP_ERROR]', error);
            res.status(500).json({
                success: false,
                error: { code: 'DATABASE_ERROR', message: error?.message || 'Failed to create application.' },
            });
            return;
        }
        // Insert documents if provided
        if (Array.isArray(documents) && documents.length > 0) {
            const docRows = documents.map((d) => ({
                application_id: app.id,
                user_id: userId,
                requirement_name: d.requirementName || d.name || 'Verified Certificate',
                storage_path: d.storagePath || `docs/${app.id}/${d.fileName || 'file.pdf'}`,
                file_name: d.fileName || 'document.pdf',
                verification_status: 'PENDING',
                notes: d.notes || null,
            }));
            await supabase_1.supabaseAdmin.from('documents').insert(docRows);
        }
        // Insert citizen notification
        await supabase_1.supabaseAdmin.from('notifications').insert({
            user_id: userId,
            title: 'Application Submitted',
            message: `Your application ${applicationNumber} for ${serviceName || app.services?.name || 'Service'} has been submitted.`,
            type: 'application',
            link_url: '/user/applications',
        });
        // Dispatch n8n Webhook for Automatic IDP Notification (Asynchronously)
        const eventId = `evt_idp_${app.id}_${Date.now()}`;
        (0, n8nService_1.triggerIdpCreatedWebhook)({
            eventId,
            eventType: 'IDP_CREATED',
            timestamp: new Date().toISOString(),
            application: {
                id: app.id,
                applicationNumber: app.application_number,
                userId: app.user_id,
                serviceName: app.services?.name || serviceName || 'International Driving Permit (IDP)',
                serviceCode: app.services?.code || 'SRV-IDP-001',
                status: app.status,
                phone: app.profiles?.phone || '',
                submittedAt: app.submitted_at || new Date().toISOString(),
            },
        }).catch((err) => console.warn('[IDP_WEBHOOK_BACKGROUND_WARN]', err));
        res.status(201).json({ success: true, data: app });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.createApplication = createApplication;
const getApplications = async (req, res) => {
    try {
        const userRole = req.user?.role;
        const userId = req.user?.id;
        const { serviceIds, status } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('applications')
            .select('*, services(id, name, code, category), offices(id, name), profiles:user_id(id, full_name, email, phone), documents(*)')
            .order('submitted_at', { ascending: false });
        if (userRole === 'citizen') {
            query = query.eq('user_id', userId);
        }
        else if (serviceIds && typeof serviceIds === 'string') {
            const ids = serviceIds.split(',').filter(Boolean);
            if (ids.length > 0) {
                query = query.in('service_id', ids);
            }
        }
        if (status && typeof status === 'string' && status !== 'ALL') {
            query = query.eq('status', status);
        }
        const { data: apps, error } = await query;
        if (error || !apps) {
            console.warn('[GET_APPS_QUERY_WARN]', error);
            res.json({ success: true, data: [] });
            return;
        }
        res.json({ success: true, data: apps });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getApplications = getApplications;
const updateApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;
        const { data: app, error } = await supabase_1.supabaseAdmin
            .from('applications')
            .update({ status, remarks, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('*, services(name)')
            .single();
        if (error) {
            res.status(400).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
            return;
        }
        // Log security audit log
        await supabase_1.supabaseAdmin.from('audit_logs').insert({
            actor_user_id: req.user?.id,
            actor_user_name: req.user?.fullName || 'Officer',
            actor_user_role: req.user?.role || 'employee',
            action: 'UPDATE_APPLICATION_STATUS',
            entity_type: 'application',
            entity_id: id,
            details: `Officer updated application status to ${status}. Remarks: ${remarks || 'None'}`,
        });
        // Notify citizen
        if (app?.user_id) {
            await supabase_1.supabaseAdmin.from('notifications').insert({
                user_id: app.user_id,
                title: `Application ${status}`,
                message: `Your application status for ${app.services?.name || 'Service'} is now: ${status}.`,
                type: 'application',
                link_url: '/user/applications',
            });
        }
        res.json({ success: true, data: app });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.updateApplicationStatus = updateApplicationStatus;
const updateDocumentStatus = async (req, res) => {
    try {
        const { docId } = req.params;
        const { status, notes } = req.body;
        const { data: doc, error } = await supabase_1.supabaseAdmin
            .from('documents')
            .update({
            verification_status: status,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        })
            .eq('id', docId)
            .select('*')
            .single();
        if (error) {
            res.status(400).json({ success: false, error: { code: 'DOC_UPDATE_FAILED', message: error.message } });
            return;
        }
        res.json({ success: true, data: doc });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.updateDocumentStatus = updateDocumentStatus;
