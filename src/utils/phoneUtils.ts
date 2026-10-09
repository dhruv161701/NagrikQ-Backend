/**
 * Phone Number Normalization Utility for NagrikQ Telegram Integration
 */

export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';

  // 1. Remove all non-digit characters
  let digits = rawPhone.replace(/\D/g, '');

  // 2. Handle Indian country code (91) or leading zero
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // 3. Return last 10 digits if valid length, otherwise stripped digits
  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
}

export function isValidPhoneNumber(rawPhone: string): boolean {
  const normalized = normalizePhoneNumber(rawPhone);
  return /^[6-9]\d{9}$/.test(normalized);
}
