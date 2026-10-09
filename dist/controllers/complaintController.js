"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComplaints = exports.submitComplaint = void 0;
const supabase_1 = require("../config/supabase");
const submitComplaint = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { applicationId, subject, description } = req.body;
        if (!userId || !subject || !description) {
            res.status(400).json({
                success: false,
                error: { code: 'INVALID_INPUT', message: 'Subject and description are required.' },
            });
            return;
        }
        const { data: complaint, error } = await supabase_1.supabaseAdmin
            .from('complaints')
            .insert({
            user_id: userId,
            application_id: applicationId,
            subject,
            description,
            status: 'PENDING',
        })
            .select('*')
            .single();
        if (error) {
            res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } });
            return;
        }
        res.status(201).json({ success: true, data: complaint });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.submitComplaint = submitComplaint;
const getComplaints = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.json({ success: true, data: [] });
            return;
        }
        const { data: complaints, error } = await supabase_1.supabaseAdmin
            .from('complaints')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error || !complaints) {
            res.json({ success: true, data: [] });
            return;
        }
        res.json({ success: true, data: complaints });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getComplaints = getComplaints;
