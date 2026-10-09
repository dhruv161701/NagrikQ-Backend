import { Request, Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { supabaseAdmin } from '../config/supabase';
import { handleTelegramUpdate, sendTelegramMessage } from '../services/telegramBotService';
import { triggerIdpCreatedWebhook } from '../services/n8nService';
import { normalizePhoneNumber, isValidPhoneNumber } from '../utils/phoneUtils';

/**
 * Telegram Webhook Handler (called by Telegram API when webhook is active)
 */
export const handleTelegramWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const update = req.body;
    if (update && update.update_id) {
      await handleTelegramUpdate(update);
    }
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[TELEGRAM_WEBHOOK_HTTP_ERROR]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Manual API endpoint to link a user account to a Telegram Chat ID
 */
export const linkTelegramAccount = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { phone, telegramChatId, telegramUsername } = req.body;
    const userId = req.user?.id;

    if (!phone || !telegramChatId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Phone number and Telegram Chat ID are required.' },
      });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(normalizedPhone)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PHONE', message: 'Please provide a valid 10-digit phone number.' },
      });
      return;
    }

    // Check if phone or chat ID is linked to another user
    const { data: existingChat } = await supabaseAdmin
      .from('telegram_mappings')
      .select('*')
      .eq('telegram_chat_id', telegramChatId)
      .maybeSingle();

    if (existingChat && existingChat.user_id !== userId && existingChat.normalized_phone !== normalizedPhone) {
      res.status(409).json({
        success: false,
        error: { code: 'LINK_CONFLICT', message: 'This Telegram account is already linked to another phone number.' },
      });
      return;
    }

    const { data: mapping, error } = await supabaseAdmin
      .from('telegram_mappings')
      .upsert(
        {
          user_id: userId || existingChat?.user_id,
          phone,
          normalized_phone: normalizedPhone,
          telegram_chat_id: Number(telegramChatId),
          telegram_username: telegramUsername || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'normalized_phone' }
      )
      .select('*')
      .single();

    if (error || !mapping) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error?.message || 'Failed to save mapping.' },
      });
      return;
    }

    res.json({ success: true, data: mapping } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * Webhook endpoint for n8n or backend to dispatch IDP notification to Telegram
 */
export const sendIdpNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const authSecret = req.headers['x-webhook-secret'];
    const expectedSecret = process.env.WEBHOOK_SECRET || 'nagrikq_idp_secret_key_2026';

    if (authSecret !== expectedSecret) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret key.' } });
      return;
    }

    const { eventId, application, recipientTelegramChatId } = req.body;

    if (!application || !application.id || !application.applicationNumber) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Invalid application payload.' } });
      return;
    }

    // Resolve Chat ID if not provided in payload
    let chatId = recipientTelegramChatId;
    if (!chatId && application.userId) {
      const { data: mapping } = await supabaseAdmin
        .from('telegram_mappings')
        .select('telegram_chat_id')
        .eq('user_id', application.userId)
        .maybeSingle();

      if (mapping) chatId = mapping.telegram_chat_id;
    }

    if (!chatId) {
      res.status(404).json({
        success: false,
        error: { code: 'RECIPIENT_NOT_LINKED', message: 'No linked Telegram account found for this recipient.' },
      });
      return;
    }

    const messageText =
      `🔔 *New IDP Notification*\n\n` +
      `• *Application No*: \`${application.applicationNumber}\`\n` +
      `• *Service*: ${application.serviceName || 'International Driving Permit (IDP)'}\n` +
      `• *Status*: \`${application.status || 'SUBMITTED'}\`\n\n` +
      `🔗 *View details on portal:*\nhttp://localhost:5173/user/applications`;

    const result = await sendTelegramMessage(chatId, messageText);

    if (!result.success) {
      res.status(500).json({ success: false, error: { code: 'TELEGRAM_SEND_FAILED', message: result.error } });
      return;
    }

    res.json({ success: true, message: 'Notification delivered to Telegram successfully.', chatId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * Get list of active Telegram mappings (Admin / Super Admin only)
 */
export const getTelegramMappings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { data: mappings, error } = await supabaseAdmin
      .from('telegram_mappings')
      .select('*, profiles:user_id(full_name, email, role)')
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } });
      return;
    }

    res.json({ success: true, data: mappings || [] } as ApiResponse);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

/**
 * Get Telegram Bot status and info
 */
export const getTelegramStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const n8nUrl = process.env.N8N_WEBHOOK_URL;

    res.json({
      success: true,
      data: {
        botName: '@NagrikQbot',
        botConfigured: Boolean(token),
        n8nWebhookConfigured: Boolean(n8nUrl),
        n8nWebhookUrl: n8nUrl,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};
