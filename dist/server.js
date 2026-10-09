"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const apiRoutes_1 = __importDefault(require("./routes/apiRoutes"));
const errorHandler_1 = require("./middleware/errorHandler");
const bootstrapService_1 = require("./services/bootstrapService");
const telegramBotService_1 = require("./services/telegramBotService");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// CORS configuration for frontend
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json({ limit: '25mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '25mb' }));
// Healthcheck Route
app.get('/health', (req, res) => {
    res.json({
        status: 'HEALTHY',
        service: 'NagrikQ Backend API',
        timestamp: new Date().toISOString(),
    });
});
// Trigger Super Admin Bootstrap via API
app.all('/api/bootstrap-superadmin', async (req, res) => {
    await (0, bootstrapService_1.ensureSuperAdminExists)();
    res.json({
        success: true,
        message: 'Super Admin account bootstrapped successfully: superadmin@nagrikq.org / SuperAdmin@123',
    });
});
// API Routes
app.use('/api', apiRoutes_1.default);
// Global Error Handler
app.use(errorHandler_1.errorHandler);
// Start Express Server
app.listen(PORT, async () => {
    console.log(`🚀 NagrikQ Backend API running on http://localhost:${PORT}`);
    // Automatically ensure Super Admin account exists in Supabase Auth & Profiles
    await (0, bootstrapService_1.ensureSuperAdminExists)();
    // Start Telegram bot polling loop
    (0, telegramBotService_1.startTelegramPolling)();
});
