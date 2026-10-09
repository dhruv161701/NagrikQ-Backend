import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { supabaseAdmin } from '../config/supabase';

export const submitComplaint = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
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

    const { data: complaint, error } = await supabaseAdmin
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

    res.status(201).json({ success: true, data: complaint } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

export const getComplaints = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.json({ success: true, data: [] } as ApiResponse);
      return;
    }

    const { data: complaints, error } = await supabaseAdmin
      .from('complaints')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !complaints) {
      res.json({ success: true, data: [] } as ApiResponse);
      return;
    }

    res.json({ success: true, data: complaints } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
