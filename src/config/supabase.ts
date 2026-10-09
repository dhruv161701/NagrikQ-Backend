import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Polyfill global WebSocket for Node.js < 22 environment
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://fcsrwywlhmcusqababtq.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: ws as any,
  },
});
