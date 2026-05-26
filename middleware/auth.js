import admin from 'firebase-admin';

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON');
    }
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Missing Firebase service account environment variables');
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = getServiceAccount();
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

let firebaseApp = null;

function getFirebaseApp() {
  if (!firebaseApp) {
    firebaseApp = initFirebaseAdmin();
  }
  return firebaseApp;
}

export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }

  const idToken = authHeader.split(' ')[1];
  try {
    const app = getFirebaseApp();
    const decodedToken = await app.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    return next();
  } catch (error) {
    console.error('Firebase auth error:', error);
    return res.status(401).json({ error: 'Invalid or expired authorization token' });
  }
}
