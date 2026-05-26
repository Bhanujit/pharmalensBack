# PharmaLens Backend

This backend serves secure API routes for medicine detection and medicine details lookup using Google Gemini. It keeps the Gemini API key and Firebase auth credentials on the server, not in the client.

## Setup

1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the secrets.

3. Start the backend locally:
   ```bash
   npm run dev
   ```

## Environment variables

Required:
- `GEMINI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FRONTEND_ORIGIN`
- `PORT`

Optional:
- `FIREBASE_SERVICE_ACCOUNT` for JSON service account data instead of the individual fields.

Client / web config (optional):
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`

Notes:
- The server uses the Firebase Admin SDK (service account) for authentication and does not require the public `apiKey` to verify ID tokens. Add the client config only if you need the web/app Firebase config on the server for a specific integration.
- `FRONTEND_ORIGIN` must match your frontend URL exactly. For local Expo development use `http://localhost:19006`; for deployed production use your real web/app origin.
- If you run Expo Go on a physical device, the backend cannot use `localhost`; set `BACKEND_URL` in `app.json` to your computer's LAN IP, for example `http://192.168.x.x:3002`.
- If you run Expo on an Android emulator, you may need `http://10.0.2.2:3002` instead of `localhost`.
- For frontend (Expo): put client keys under `expo.extra` in [app.json](../app.json) or use your environment provider. For web builds with Vite, use environment variables like `VITE_FIREBASE_API_KEY` and access via `import.meta.env`.
- For production builds, set `expo.extra.BACKEND_URL_PROD` in `app.json` or `BACKEND_URL_PROD` in your environment to point at the deployed backend.

## API endpoints

- `POST /api/detect-medicine`
- `POST /api/medicine-details`
- `GET /health`

## Security

- Validates Firebase ID tokens with `Authorization: Bearer <token>`
- Limits requests with rate limiting
- Restricts CORS to the configured frontend origin
- Stores all secret keys on the backend only
