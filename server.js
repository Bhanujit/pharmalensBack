import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import { verifyFirebaseToken } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimiter.js';

import { detectMedicineHandler } from './api/detect-medicine.js';
import { medicineDetailsHandler } from './api/medicine-details.js';
import { checkGeminiHandler } from './api/check-gemini.js';

const app = express();

const PORT = Number(process.env.PORT || 3002);

// Your PC local IPv4
const LOCAL_IP = '192.168.29.245';

// Allowed origins for Expo + local development
const allowedOrigins = [
  'http://localhost:19006',
  'http://127.0.0.1:19006',
  'http://10.0.2.2:19006',
  `http://${LOCAL_IP}:19006`,
  /^http:\/\/192\.168\.\d+\.\d+:19006$/,
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }

      const isAllowed = allowedOrigins.some((allowedOrigin) => {
        if (typeof allowedOrigin === 'string') {
          return allowedOrigin === origin;
        }

        return allowedOrigin.test(origin);
      });

      if (isAllowed) {
        return callback(null, true);
      }

      console.error('❌ Blocked by CORS:', origin);

      return callback(new Error('CORS policy: Origin not allowed'));
    },

    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Handle preflight requests
app.options('*', cors());

// Increased payload limit for image uploads
app.use(express.json({ limit: '50mb' }));

// --------------------
// Health Check
// --------------------
app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: `http://${LOCAL_IP}:${PORT}`,
  });
});

// --------------------
// Debug Route
// --------------------
const DEBUG_GEMINI_SECRET = process.env.DEBUG_GEMINI_SECRET;

app.get('/debug/gemini', (req, res) => {
  if (
    DEBUG_GEMINI_SECRET &&
    req.header('x-debug-secret') !== DEBUG_GEMINI_SECRET
  ) {
    return res.status(403).json({
      error: 'Forbidden',
    });
  }

  return checkGeminiHandler(req, res);
});

// --------------------
// Protected API Routes
// --------------------
app.use('/api', verifyFirebaseToken, apiLimiter);

app.post('/api/detect-medicine', detectMedicineHandler);

app.post('/api/medicine-details', medicineDetailsHandler);

// --------------------
// 404 Handler
// --------------------
app.use((_req, res) => {
  return res.status(404).json({
    error: 'Not Found',
  });
});

// --------------------
// Global Error Handler
// --------------------
app.use((err, _req, res, _next) => {
  console.error('🔥 Unhandled server error:', err);

  return res.status(500).json({
    error: 'Internal server error',
  });
});

// --------------------
// Start Server
// --------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 PharmaLens Backend Running');
  console.log(`🌐 Local Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`📱 Expo Device Access Enabled`);
  console.log(`🛡️ CORS Configured`);
  console.log(`\n✅ Server listening on 0.0.0.0:${PORT}\n`);
});