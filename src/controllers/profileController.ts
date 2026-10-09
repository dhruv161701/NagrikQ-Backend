import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { supabaseAdmin } from '../config/supabase';

export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated.' } });
      return;
    }

    const { data: profile, error } = await supabaseAdmin
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
      const { data: newProfile, error: insErr } = await supabaseAdmin
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

      res.json({ success: true, data: newProfile } as ApiResponse);
      return;
    }

    res.json({ success: true, data: profile } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated.' } });
      return;
    }

    const {
      fullName,
      dateOfBirth,
      age,
      preferredLanguage,
      preferredUIMode,
      onboardingCompleted,
      tourCompleted,
      phone,
    } = req.body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (fullName !== undefined) updates.full_name = fullName;
    if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth;
    if (age !== undefined) updates.age = age;
    if (preferredLanguage !== undefined) updates.preferred_language = preferredLanguage;
    if (preferredUIMode !== undefined) updates.ui_mode = preferredUIMode;
    if (onboardingCompleted !== undefined) updates.onboarding_completed = onboardingCompleted;
    if (tourCompleted !== undefined) updates.tour_completed = tourCompleted;
    if (phone !== undefined) updates.phone = phone;

    const { data: updatedProfile, error } = await supabaseAdmin
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

    res.json({ success: true, data: updatedProfile } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
