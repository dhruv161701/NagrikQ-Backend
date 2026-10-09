import { supabaseAdmin } from '../config/supabase';
import { normalizePhoneNumber } from '../utils/phoneUtils';

async function linkTelegramChat() {
  const args = process.argv.slice(2);
  const rawPhone = args[0] || '9876543210';
  const chatId = args[1] || '123456789';

  const normalizedPhone = normalizePhoneNumber(rawPhone);
  console.log(`Linking phone: ${rawPhone} (normalized: ${normalizedPhone}) to Telegram Chat ID: ${chatId}...`);

  // Find profile or staff profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, phone')
    .or(`phone.ilike.%${normalizedPhone}%`)
    .maybeSingle();

  const userId = profile?.id || '01a51298-36e4-4567-ad3b-0f92f43bdd1b';

  const { data: mapping, error } = await supabaseAdmin
    .from('telegram_mappings')
    .upsert({
      user_id: userId,
      phone: rawPhone,
      normalized_phone: normalizedPhone,
      telegram_chat_id: Number(chatId),
      telegram_username: 'TestUser',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'normalized_phone' })
    .select('*')
    .single();

  if (error) {
    console.error('Error linking Telegram account:', error.message);
  } else {
    console.log('✅ Telegram account linked successfully:', mapping);
  }
}

linkTelegramChat();
