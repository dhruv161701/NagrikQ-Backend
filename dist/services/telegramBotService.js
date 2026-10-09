"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramMessage = sendTelegramMessage;
exports.handleTelegramUpdate = handleTelegramUpdate;
exports.handleCredentialsRetrieval = handleCredentialsRetrieval;
exports.startTelegramPolling = startTelegramPolling;
exports.stopTelegramPolling = stopTelegramPolling;
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../config/supabase");
const phoneUtils_1 = require("../utils/phoneUtils");
dotenv_1.default.config();
const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN || '';
const getTelegramApiBase = () => `https://api.telegram.org/bot${getBotToken()}`;
/**
 * Send a message via Telegram Bot API
 */
async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
    const token = getBotToken();
    if (!token) {
        return { success: false, error: 'Telegram bot token is not configured in backend environment.' };
    }
    try {
        const res = await fetch(`${getTelegramApiBase()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: parseMode,
                disable_web_page_preview: true,
            }),
        });
        const rawText = await res.text();
        let data = {};
        try {
            data = JSON.parse(rawText);
        }
        catch {
            console.warn('[TELEGRAM_SEND_WARN] Telegram returned non-JSON body:', rawText.slice(0, 150));
            return { success: false, error: 'Telegram API returned non-JSON response.' };
        }
        if (!data.ok) {
            if (data.error_code === 401 || data.error_code === 404) {
                console.warn('[TELEGRAM_BOT_NOTICE] Telegram bot token is invalid or unauthorized. Set a valid TELEGRAM_BOT_TOKEN in backend environment.');
            }
            else {
                console.warn('[TELEGRAM_SEND_NOTE]', data.description || 'Failed to send Telegram message.');
            }
            return { success: false, error: data.description || 'Failed to send Telegram message.' };
        }
        return { success: true, data: data.result };
    }
    catch (err) {
        console.warn('[TELEGRAM_SEND_EXCEPTION]', err.message || err);
        return { success: false, error: err.message || 'Telegram API connection error.' };
    }
}
/**
 * Handle incoming Telegram Update (via polling or webhook)
 */
async function handleTelegramUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.text)
        return;
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'User';
    const text = msg.text.trim();
    console.log(`[TELEGRAM_UPDATE] Chat ID: ${chatId}, User: ${username}, Text: ${text}`);
    // Handle Command: /start
    if (text === '/start' || text.startsWith('/start ')) {
        const welcomeMsg = `🏛️ *Welcome to NagrikQ Bot (@NagrikQbot)*\n\n` +
            `Hello *${username}*!\n` +
            `I can deliver your **Admin Login ID & Password** directly to your Telegram, notify you when a new IDP is created, and let you manage your account.\n\n` +
            `📲 *To get your ID & Password:*\n` +
            `Please reply with your *registered 10-digit phone number* (e.g., \`9876543210\`).\n\n` +
            `Commands:\n` +
            `• \`/start\` — Main menu\n` +
            `• \`/credentials\` — Get your Login ID & Password\n` +
            `• \`/myidps\` — Retrieve your IDP records\n` +
            `• \`/help\` — Get support & help`;
        await sendTelegramMessage(chatId, welcomeMsg);
        return;
    }
    // Handle Command: /help
    if (text === '/help') {
        const helpMsg = `ℹ️ *NagrikQ Telegram Bot Help*\n\n` +
            `1. *Account Linking*: Enter your registered mobile phone number to link your Telegram Chat ID with your Admin account.\n` +
            `2. *ID & Password Retrieval*: Send \`/credentials\` to receive your official Admin Login ID, Employee ID, and Password.\n` +
            `3. *IDP Notifications*: Once linked, you will automatically receive Telegram alerts whenever a new IDP/Application is generated.\n\n` +
            `🔒 *Security Notice*: Credentials and IDPs can only be retrieved from the exact Telegram account linked to your registered phone number.`;
        await sendTelegramMessage(chatId, helpMsg);
        return;
    }
    // Handle Command: /myidps
    if (text === '/myidps') {
        await handleIdpRetrieval(chatId, null);
        return;
    }
    // Handle Command: /credentials, /id, /password
    if (['/credentials', '/id', '/password'].includes(text.toLowerCase())) {
        await handleCredentialsRetrieval(chatId);
        return;
    }
    // Handle Phone Number Input
    const normalizedPhone = (0, phoneUtils_1.normalizePhoneNumber)(text);
    if ((0, phoneUtils_1.isValidPhoneNumber)(normalizedPhone)) {
        // Determine if account is linked or needs linking/retrieval
        await processPhoneSubmission(chatId, username, text, normalizedPhone);
        return;
    }
    // Default Fallback Response
    await sendTelegramMessage(chatId, `❓ *Unrecognized Input*\n\nPlease enter a valid 10-digit registered phone number (e.g. \`9876543210\`) or send \`/start\` to view options.`);
}
/**
 * Process phone number submission (Linking or Retrieval)
 */
async function processPhoneSubmission(chatId, username, rawPhone, normalizedPhone) {
    try {
        // 1. Check existing mapping for this Chat ID
        const { data: existingChatMapping } = await supabase_1.supabaseAdmin
            .from('telegram_mappings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .maybeSingle();
        // 2. Check existing mapping for this Phone Number
        const { data: existingPhoneMapping } = await supabase_1.supabaseAdmin
            .from('telegram_mappings')
            .select('*')
            .eq('normalized_phone', normalizedPhone)
            .maybeSingle();
        // SCENARIO 1: Phone is already linked to THIS Chat ID -> Return Credentials (ID & Password) & IDP records
        if (existingPhoneMapping && existingPhoneMapping.telegram_chat_id === chatId) {
            await handleCredentialsRetrieval(chatId);
            await handleIdpRetrieval(chatId, existingPhoneMapping);
            return;
        }
        // SCENARIO 2: Phone is linked to a DIFFERENT Chat ID -> Security warning! Refuse retrieval/unauthorized access.
        if (existingPhoneMapping && existingPhoneMapping.telegram_chat_id !== chatId) {
            await sendTelegramMessage(chatId, `⚠️ *Security Violation Notice*\n\n` +
                `The phone number \`+91 ${normalizedPhone}\` is already linked to a different Telegram account.\n\n` +
                `🔒 *Security Rule*: Entering a phone number alone does not grant access to IDP records. For security reasons, IDP retrieval is strictly prohibited from unverified Telegram accounts.\n\n` +
                `If you are the owner of this account, please switch to your original linked Telegram account or contact your Super Admin.`);
            return;
        }
        // SCENARIO 3: Chat ID is already linked to ANOTHER phone number -> Prevent conflict
        if (existingChatMapping && existingChatMapping.normalized_phone !== normalizedPhone) {
            await sendTelegramMessage(chatId, `⚠️ *Account Linking Conflict*\n\n` +
                `This Telegram account is already linked to phone number \`+91 ${existingChatMapping.normalized_phone}\`.\n\n` +
                `A single Telegram account cannot be linked to multiple different phone numbers simultaneously.`);
            return;
        }
        // SCENARIO 4: Attempting new link for unlinked phone -> Look up ALL profiles matching this phone number
        const { data: allProfiles } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('id, full_name, email, phone, role');
        const { data: allStaff } = await supabase_1.supabaseAdmin
            .from('staff_profiles')
            .select('id, user_id, employee_id, verification_ref, phone, role');
        const matchedProfiles = (allProfiles || []).filter((p) => {
            const pNorm = (0, phoneUtils_1.normalizePhoneNumber)(p.phone || '');
            return pNorm === normalizedPhone || (pNorm.length >= 10 && pNorm.endsWith(normalizedPhone));
        });
        const staffList = (allStaff || []).filter((s) => {
            const sNorm = (0, phoneUtils_1.normalizePhoneNumber)(s.phone || '');
            return sNorm === normalizedPhone || (sNorm.length >= 10 && sNorm.endsWith(normalizedPhone));
        });
        // Combine matching user accounts
        const allUsersMap = new Map();
        matchedProfiles?.forEach((p) => {
            allUsersMap.set(p.id, {
                id: p.id,
                full_name: p.full_name,
                email: p.email,
                phone: p.phone,
                role: p.role,
                employee_id: null,
                verification_ref: null,
            });
        });
        staffList?.forEach((s) => {
            const existing = allUsersMap.get(s.user_id || s.id);
            if (existing) {
                existing.employee_id = s.employee_id;
                existing.verification_ref = s.verification_ref;
                if (s.role)
                    existing.role = s.role;
            }
            else {
                allUsersMap.set(s.user_id || s.id, {
                    id: s.user_id || s.id,
                    full_name: 'Staff Account',
                    email: '',
                    phone: s.phone,
                    role: s.role || 'staff',
                    employee_id: s.employee_id,
                    verification_ref: s.verification_ref,
                });
            }
        });
        const userAccounts = Array.from(allUsersMap.values());
        // Filter to staff/admin/employee/citizen
        if (userAccounts.length === 0) {
            await sendTelegramMessage(chatId, `❌ *No Registered Account Found*\n\n` +
                `No registered Admin, Employee, or user account was found for phone number \`+91 ${normalizedPhone}\`.\n\n` +
                `Please contact your Super Admin to register your account first.`);
            return;
        }
        const primaryUser = userAccounts[0];
        // Create the secure mapping in telegram_mappings table
        const { data: newMapping, error: insertErr } = await supabase_1.supabaseAdmin
            .from('telegram_mappings')
            .insert({
            user_id: primaryUser.id,
            phone: rawPhone,
            normalized_phone: normalizedPhone,
            telegram_chat_id: chatId,
            telegram_username: username,
        })
            .select('*')
            .single();
        if (insertErr || !newMapping) {
            console.error('[TELEGRAM_LINK_ERROR]', insertErr);
            await sendTelegramMessage(chatId, `❌ Failed to save Telegram link. Please try again later.`);
            return;
        }
        // Format credentials for all matching accounts
        let credsText = `✅ *Telegram Account Successfully Linked!*\n\n` +
            `📱 *Phone*: +91 ${normalizedPhone}\n` +
            `🔑 *REGISTERED ACCOUNT CREDENTIALS (${userAccounts.length})*\n\n`;
        userAccounts.forEach((acc, idx) => {
            const empId = acc.employee_id || `ID-${acc.id.slice(0, 6).toUpperCase()}`;
            const password = acc.verification_ref || 'NagrikQ@2026';
            const emailStr = acc.email || 'admin@nagrikq.gov.in';
            credsText += `*Account #${idx + 1}: ${acc.full_name}*\n`;
            credsText += `• *Role*: \`${acc.role.toUpperCase()}\`\n`;
            credsText += `• *Login ID / Email*: \`${emailStr}\`\n`;
            credsText += `• *Employee ID*: \`${empId}\`\n`;
            credsText += `• *Password*: \`${password}\`\n\n`;
        });
        credsText += `🔗 *Portal Login:*\nhttp://localhost:5173/login\n\n` +
            `🎉 You will receive automated alerts whenever an IDP or application is processed.`;
        await sendTelegramMessage(chatId, credsText);
    }
    catch (err) {
        console.error('[PROCESS_PHONE_ERROR]', err);
        await sendTelegramMessage(chatId, `❌ An unexpected error occurred while processing your request.`);
    }
}
/**
 * Retrieve & send Login ID and Password for authenticated Chat ID
 */
async function handleCredentialsRetrieval(chatId) {
    try {
        const { data: mapping } = await supabase_1.supabaseAdmin
            .from('telegram_mappings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .maybeSingle();
        if (!mapping) {
            await sendTelegramMessage(chatId, `⚠️ *Account Not Linked*\n\n` +
                `Your Telegram account is not linked to any registered NagrikQ phone number.\n\n` +
                `Please send your 10-digit registered phone number to link your account first.`);
            return;
        }
        const norm = mapping.normalized_phone;
        const { data: allProfiles } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('id, full_name, email, phone, role');
        const { data: allStaff } = await supabase_1.supabaseAdmin
            .from('staff_profiles')
            .select('id, user_id, employee_id, verification_ref, phone, role');
        const matchedProfiles = (allProfiles || []).filter((p) => {
            const pNorm = (0, phoneUtils_1.normalizePhoneNumber)(p.phone || '');
            return pNorm === norm || (pNorm.length >= 10 && pNorm.endsWith(norm));
        });
        const staffList = (allStaff || []).filter((s) => {
            const sNorm = (0, phoneUtils_1.normalizePhoneNumber)(s.phone || '');
            return sNorm === norm || (sNorm.length >= 10 && sNorm.endsWith(norm));
        });
        const allUsersMap = new Map();
        matchedProfiles?.forEach((p) => {
            allUsersMap.set(p.id, {
                id: p.id,
                full_name: p.full_name,
                email: p.email,
                phone: p.phone,
                role: p.role,
                employee_id: null,
                verification_ref: null,
            });
        });
        staffList?.forEach((s) => {
            const existing = allUsersMap.get(s.user_id || s.id);
            if (existing) {
                existing.employee_id = s.employee_id;
                existing.verification_ref = s.verification_ref;
                if (s.role)
                    existing.role = s.role;
            }
            else {
                allUsersMap.set(s.user_id || s.id, {
                    id: s.user_id || s.id,
                    full_name: 'Staff Account',
                    email: '',
                    phone: s.phone,
                    role: s.role || 'staff',
                    employee_id: s.employee_id,
                    verification_ref: s.verification_ref,
                });
            }
        });
        const userAccounts = Array.from(allUsersMap.values());
        let msgText = `🔑 *NAGRIKQ ACCOUNT CREDENTIALS*\n\n` +
            `📱 *Phone*: +91 ${mapping.normalized_phone}\n\n`;
        userAccounts.forEach((acc, idx) => {
            const empId = acc.employee_id || `ID-${acc.id.slice(0, 6).toUpperCase()}`;
            const password = acc.verification_ref || 'NagrikQ@2026';
            const emailStr = acc.email || 'admin@nagrikq.gov.in';
            msgText += `*Account #${idx + 1}: ${acc.full_name}*\n`;
            msgText += `• *Role*: \`${acc.role.toUpperCase()}\`\n`;
            msgText += `• *Login ID / Email*: \`${emailStr}\`\n`;
            msgText += `• *Employee ID*: \`${empId}\`\n`;
            msgText += `• *Password*: \`${password}\`\n\n`;
        });
        msgText += `🔗 *Portal Login Link:*\nhttp://localhost:5173/login`;
        await sendTelegramMessage(chatId, msgText);
    }
    catch (err) {
        console.error('[CREDENTIALS_RETRIEVAL_ERROR]', err);
        await sendTelegramMessage(chatId, `❌ Failed to retrieve credentials.`);
    }
}
/**
 * Handle IDP Retrieval for authenticated Chat ID
 */
async function handleIdpRetrieval(chatId, mappingData) {
    try {
        let mapping = mappingData;
        // Fetch mapping if not passed
        if (!mapping) {
            const { data } = await supabase_1.supabaseAdmin
                .from('telegram_mappings')
                .select('*')
                .eq('telegram_chat_id', chatId)
                .maybeSingle();
            mapping = data;
        }
        // Security check: Must be linked
        if (!mapping) {
            await sendTelegramMessage(chatId, `⚠️ *Account Not Linked*\n\n` +
                `Your Telegram account is not linked to any registered NagrikQ phone number.\n\n` +
                `Please send your 10-digit registered phone number to link your account first.`);
            return;
        }
        // Fetch applications/IDPs associated with this user
        const { data: apps, error } = await supabase_1.supabaseAdmin
            .from('applications')
            .select('*, services(name, code, category), offices(name)')
            .eq('user_id', mapping.user_id)
            .order('submitted_at', { ascending: false })
            .limit(10);
        if (error) {
            console.error('[FETCH_IDPS_ERROR]', error);
            await sendTelegramMessage(chatId, `❌ Database error while retrieving IDP records.`);
            return;
        }
        if (!apps || apps.length === 0) {
            await sendTelegramMessage(chatId, `ℹ️ *No IDP Records Found*\n\n` +
                `No IDP or application records found for account linked to \`+91 ${mapping.normalized_phone}\`.`);
            return;
        }
        let msgText = `📋 *Your Authorized IDP / Application Records (${apps.length})*\n\n`;
        apps.forEach((app, idx) => {
            const statusEmoji = app.status === 'APPROVED' ? '✅' : app.status === 'REJECTED' ? '❌' : '⏳';
            const serviceName = app.services?.name || 'International Driving Permit / Service';
            const dateStr = app.submitted_at ? new Date(app.submitted_at).toLocaleDateString('en-IN') : 'Recent';
            msgText += `*${idx + 1}. ${serviceName}*\n`;
            msgText += `• *App No*: \`${app.application_number}\`\n`;
            msgText += `• *Status*: ${statusEmoji} \`${app.status}\`\n`;
            msgText += `• *Date*: ${dateStr}\n`;
            msgText += `• *Office*: ${app.offices?.name || 'Jan Seva Kendra'}\n\n`;
        });
        msgText += `🔗 *View complete sensitive details on NagrikQ Portal:*\nhttp://localhost:5173/user/applications`;
        await sendTelegramMessage(chatId, msgText);
    }
    catch (err) {
        console.error('[IDP_RETRIEVAL_ERROR]', err);
        await sendTelegramMessage(chatId, `❌ Failed to retrieve IDP records.`);
    }
}
/**
 * Start Telegram Long-Polling Listener
 */
let isPollingActive = false;
let lastOffset = 0;
function startTelegramPolling() {
    if (isPollingActive)
        return;
    isPollingActive = true;
    console.log(`🤖 Starting NagrikQ Telegram Bot polling loop (@NagrikQbot)...`);
    const pollLoop = async () => {
        while (isPollingActive) {
            try {
                const apiBase = getTelegramApiBase();
                if (!apiBase) {
                    await new Promise((resolve) => setTimeout(resolve, 30000));
                    continue;
                }
                const res = await fetch(`${apiBase}/getUpdates?offset=${lastOffset}&timeout=10`, {
                    signal: AbortSignal.timeout(15000),
                });
                if (!res.ok) {
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    continue;
                }
                const data = await res.json();
                if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
                    for (const update of data.result) {
                        lastOffset = Math.max(lastOffset, update.update_id + 1);
                        await handleTelegramUpdate(update);
                    }
                }
            }
            catch (err) {
                // Silently retry after short pause if network times out
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }
    };
    pollLoop();
}
function stopTelegramPolling() {
    isPollingActive = false;
}
