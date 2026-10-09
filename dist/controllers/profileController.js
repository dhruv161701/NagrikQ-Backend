"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = void 0;
const supabase_1 = require("../config/supabase");
const getProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated.' } });
            return;
        }
        const { data: profile, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        if (error) {
            res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
            return;
        }
        if (!profile) {
            // Create initial profile for user if missing
            const { data: newProfile, error: insErr } = await supabase_1.supabaseAdmin
                .from('profiles')
                .insert({
                id: userId,
                email: req.user?.email || '',
                full_name: req.user?.fullName || 'Citizen User',
                role: req.user?.role || 'citizen',
                onboarding_completed: false,
                tour_completed: false,
            })
                .select('*')
                .single();
            if (insErr) {
                res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: insErr.message } });
                return;
            }
            res.json({ success: true, data: newProfile });
            return;
        }
        res.json({ success: true, data: profile });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated.' } });
            return;
        }
        const { fullName, dateOfBirth, age, preferredLanguage, preferredUIMode, onboardingCompleted, tourCompleted, phone, } = req.body;
        const updates = {
            updated_at: new Date().toISOString(),
        };
        if (fullName !== undefined)
            updates.full_name = fullName;
        if (dateOfBirth !== undefined)
            updates.date_of_birth = dateOfBirth;
        if (age !== undefined)
            updates.age = age;
        if (preferredLanguage !== undefined)
            updates.preferred_language = preferredLanguage;
        if (preferredUIMode !== undefined)
            updates.ui_mode = preferredUIMode;
        if (onboardingCompleted !== undefined)
            updates.onboarding_completed = onboardingCompleted;
        if (tourCompleted !== undefined)
            updates.tour_completed = tourCompleted;
        if (phone !== undefined)
            updates.phone = phone;
        const { data: updatedProfile, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .upsert({
            id: userId,
            email: req.user?.email || '',
            ...updates,
        })
            .select('*')
            .single();
        if (error) {
            res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: error.message } });
            return;
        }
        res.json({ success: true, data: updatedProfile });
    }
    catch (err) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
    }
};
exports.updateProfile = updateProfile;
