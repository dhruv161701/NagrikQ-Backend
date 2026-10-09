import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { notificationService } from '../services/notificationService';
import { supabaseAdmin } from '../config/supabase';

export const registerFcmToken = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { fcmToken, deviceInfo } = req.body;

    if (!userId || !fcmToken) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'userId and fcmToken are required.' },
      });
      return;
    }

    await notificationService.registerDeviceToken(userId, fcmToken, deviceInfo);

    res.json({
      success: true,
      message: 'FCM device token registered successfully.',
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
};

export const sendPushNotification = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { userId, title, body, data, eventType } = req.body;
    const targetUserId = userId || req.user?.id;

    if (!targetUserId || !title || !body) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'userId, title, and body are required.' },
      });
      return;
    }

    const success = await notificationService.sendQueuePushNotification({
      userId: targetUserId,
      tokenId: data?.tokenId,
      tokenNumber: data?.tokenNumber || 'A101',
      serviceName: data?.serviceName || 'Government Service',
      counterNumber: data?.counterNumber,
      nextCounter: data?.nextCounter,
      eventType: eventType || 'BOOKING_CONFIRMED',
      title,
      body,
      metadata: data,
    });

    res.json({
      success: true,
      delivered: success,
      message: 'Push notification processed.',
    } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
};

export const getUserNotifications = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const { data: list, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } });
      return;
    }

    res.json({ success: true, data: list || [] } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
