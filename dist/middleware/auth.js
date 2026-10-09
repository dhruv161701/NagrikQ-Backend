"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const supabase_1 = require("../config/supabase");
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication token required.' },
        });
        return;
    }
    try {
        const { data, error } = await supabase_1.supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session.' },
            });
            return;
        }
        // Fetch user profile from database to obtain authoritative role
        const { data: profile } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();
        let resolvedRole = profile?.role || data.user.user_metadata?.role;
        // If role is still citizen, check staff_profiles
        if (!resolvedRole || resolvedRole === 'citizen') {
            try {
                const { data: staff } = await supabase_1.supabaseAdmin
                    .from('staff_profiles')
                    .select('role')
                    .eq('id', data.user.id)
                    .maybeSingle();
                if (staff?.role) {
                    resolvedRole = staff.role;
                }
            }
            catch {
                // ignore
            }
        }
        // Email fallback for administrative accounts
        if (!resolvedRole || resolvedRole === 'citizen') {
            const userEmail = (data.user.email || '').toLowerCase();
            if (userEmail.includes('superadmin') || userEmail === 'superadmin@nagrikq.gov.in') {
                resolvedRole = 'superadmin';
            }
            else if (userEmail.includes('admin') || userEmail === 'admin@nagrikq.gov.in') {
                resolvedRole = 'admin';
            }
            else if (userEmail.includes('employee') || userEmail.includes('officer')) {
                resolvedRole = 'employee';
            }
            else {
                resolvedRole = 'citizen';
            }
        }
        req.user = {
            id: data.user.id,
            email: data.user.email || '',
            fullName: profile?.full_name || data.user.user_metadata?.full_name || 'Nagrik User',
            role: resolvedRole,
            onboardingCompleted: profile?.onboarding_completed ?? true,
        };
        next();
    }
    catch (err) {
        res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication error.' },
        });
    }
};
exports.authenticateToken = authenticateToken;
