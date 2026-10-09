"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerIdpCreatedWebhook = triggerIdpCreatedWebhook;
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../config/supabase");
const telegramBotService_1 = require("./telegramBotService");
dotenv_1.default.config();
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/idp-created';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'nagrikq_idp_secret_key_2026';
/**
 * Trigger n8n Webhook on IDP Creation
 */
async function triggerIdpCreatedWebhook(payload) {
    const { eventId, application } = payload;
    try {
        // 1. Idempotency Check: Prevent duplicate notifications
        try {
            const { data: existingLog } = await supabase_1.supabaseAdmin
                .from('idp_notification_logs')
                .select('id, status')
                .eq('event_id', eventId)
                .maybeSingle();
            if (existingLog && existingLog.status === 'DELIVERED') {
                console.log(`[N8N_WEBHOOK] Duplicate event ${eventId} ignored (already delivered).`);
                return { success: true, deliveredViaN8n: false, error: 'Duplicate event skipped.' };
            }
        }
        catch (e) {
            console.warn('[N8N_WEBHOOK_LOG_WARN]', e.message);
        }
        // 2. Fetch linked Telegram Chat ID from telegram_mappings using user_id or phone
        let chatId = null;
        try {
            const { data: mappings } = await supabase_1.supabaseAdmin
                .from('telegram_mappings')
                .select('telegram_chat_id, normalized_phone, user_id');
            if (mappings && mappings.length > 0) {
                // Try user_id match first
                let matched = mappings.find((m) => m.user_id === application.userId);
                // If not matched, try matching normalized phone
                if (!matched && application.phone) {
                    const appPhoneDigits = application.phone.replace(/\D/g, '').slice(-10);
                    matched = mappings.find((m) => m.normalized_phone === appPhoneDigits || m.normalized_phone.endsWith(appPhoneDigits));
                }
                if (matched?.telegram_chat_id) {
                    chatId = matched.telegram_chat_id;
                }
                else if (mappings.length > 0 && mappings[0].telegram_chat_id) {
                    // Dev Fallback: Use primary active Telegram Chat ID if specific phone has no mapping yet
                    chatId = mappings[0].telegram_chat_id;
                }
            }
        }
        catch (e) {
            console.warn('[N8N_WEBHOOK_MAP_WARN]', e.message);
        }
        // Add resolved chatId to payload before sending to n8n
        const webhookPayload = {
            ...payload,
            recipientTelegramChatId: chatId,
        };
        // 3. Dispatch HTTP POST request to n8n Webhook
        let n8nSuccess = false;
        let n8nError = '';
        const targetUrls = [
            N8N_WEBHOOK_URL,
            N8N_WEBHOOK_URL.includes('/webhook-test/')
                ? N8N_WEBHOOK_URL.replace('/webhook-test/', '/webhook/')
                : N8N_WEBHOOK_URL.replace('/webhook/', '/webhook-test/'),
        ];
        for (const url of targetUrls) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-webhook-secret': WEBHOOK_SECRET,
                    },
                    body: JSON.stringify(webhookPayload),
                });
                if (response.ok) {
                    n8nSuccess = true;
                    console.log(`[N8N_WEBHOOK] Successfully dispatched IDP event ${eventId} to n8n (${url}).`);
                    break;
                }
                else {
                    n8nError = `n8n (${url}) returned HTTP status ${response.status}`;
                }
            }
            catch (err) {
                n8nError = `n8n (${url}) connection failed: ${err.message}`;
            }
        }
        if (!n8nSuccess) {
            console.warn(`[N8N_WEBHOOK_WARN] ${n8nError}`);
        }
        // 4. Fallback: If n8n call fails or if chatId is resolved, also ensure direct Telegram delivery if chatId exists
        let directSuccess = false;
        if (chatId) {
            const msgText = `🔔 *New IDP / Application Created*\n\n` +
                `• *Application No*: \`${application.applicationNumber}\`\n` +
                `• *Service*: ${application.serviceName}\n` +
                `• *Status*: \`${application.status}\`\n` +
                `• *Date*: ${new Date(application.submittedAt).toLocaleDateString('en-IN')}\n\n` +
                `🔗 *View details on portal:*\nhttp://localhost:5173/user/applications`;
            const telegramRes = await (0, telegramBotService_1.sendTelegramMessage)(chatId, msgText);
            directSuccess = telegramRes.success;
        }
        // 5. Log notification delivery attempt for auditing & idempotency
        try {
            const finalStatus = (n8nSuccess || directSuccess) ? 'DELIVERED' : 'FAILED';
            await supabase_1.supabaseAdmin.from('idp_notification_logs').upsert({
                event_id: eventId,
                application_id: application.id,
                telegram_chat_id: chatId ? Number(chatId) : 0,
                status: finalStatus,
                error_message: n8nError || null,
                payload: webhookPayload,
            }, { onConflict: 'event_id' });
        }
        catch (e) {
            console.warn('[N8N_LOG_SAVE_WARN]', e.message);
        }
        return {
            success: n8nSuccess || directSuccess,
            deliveredViaN8n: n8nSuccess,
            deliveredViaDirect: directSuccess,
            chatId: chatId || undefined,
        };
    }
    catch (err) {
        console.error('[TRIGGER_IDP_WEBHOOK_ERROR]', err);
        return { success: false, error: err.message };
    }
}
