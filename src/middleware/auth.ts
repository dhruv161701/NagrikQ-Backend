import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types';
import { supabaseAdmin } from '../config/supabase';

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session.' },
      });
      return;
    }

    // Fetch user profile from database to obtain authoritative role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    let resolvedRole: UserRole = (profile?.role as UserRole) || (data.user.user_metadata?.role as UserRole);

    // If role is still citizen, check staff_profiles
    if (!resolvedRole || resolvedRole === 'citizen') {
      try {
        const { data: staff } = await supabaseAdmin
          .from('staff_profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (staff?.role) {
          resolvedRole = staff.role as UserRole;
        }
      } catch {
        // ignore
      }
    }

    // Email fallback for administrative accounts
    if (!resolvedRole || resolvedRole === 'citizen') {
      const userEmail = (data.user.email || '').toLowerCase();
      if (userEmail.includes('superadmin') || userEmail === 'superadmin@nagrikq.gov.in') {
        resolvedRole = 'superadmin';
      } else if (userEmail.includes('admin') || userEmail === 'admin@nagrikq.gov.in') {
        resolvedRole = 'admin';
      } else if (userEmail.includes('employee') || userEmail.includes('officer')) {
        resolvedRole = 'employee';
      } else {
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
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication error.' },
    });
  }
};
