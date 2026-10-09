"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const ws_1 = __importDefault(require("ws"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Polyfill global WebSocket for Node.js < 22 environment
if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = ws_1.default;
}
const supabaseUrl = process.env.SUPABASE_URL || 'https://fcsrwywlhmcusqababtq.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
    realtime: {
        transport: ws_1.default,
    },
});
