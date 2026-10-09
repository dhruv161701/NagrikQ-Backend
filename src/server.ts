import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/apiRoutes';
import { errorHandler } from './middleware/errorHandler';
import { ensureSuperAdminExists } from './services/bootstrapService';
import { startTelegramPolling } from './services/telegramBotService';

dotenv.config();

const app = express();


// CORS configuration for frontend
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Healthcheck Route
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'HEALTHY',
    service: 'NagrikQ Backend API',
    timestamp: new Date().toISOString(),
  });
});

// Trigger Super Admin Bootstrap via API
app.all('/api/bootstrap-superadmin', async (req: Request, res: Response) => {
  await ensureSuperAdminExists();
  res.json({
    success: true,
    message: 'Super Admin account bootstrapped successfully: superadmin@nagrikq.org / SuperAdmin@123',
  });
});

// API Routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use(errorHandler);

// Start Express Server

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 NagrikQ Backend API running on port ${PORT}`);

  // Automatically ensure Super Admin account exists in Supabase Auth & Profiles
  await ensureSuperAdminExists();

  // Start Telegram bot polling loop
  startTelegramPolling();
});
