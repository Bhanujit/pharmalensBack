// Client-side Firebase config for use by server-side requests that need the
// web/app config (NOT the private service account). Values are read from
// environment variables. Do NOT store private keys here.

const firebaseClientConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
};

export default firebaseClientConfig;
