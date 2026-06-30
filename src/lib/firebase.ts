import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Hardcoded fallback config from firebase-applet-config.json
const FALLBACK_CONFIG = {
  projectId: "kaggle-learning-499603",
  appId: "1:580502144972:web:3e917ced7d84f870a37f69",
  apiKey: "AIzaSyCdWgpIm1IImhOIV3KxVhFU0FIGQuzOfGA",
  authDomain: "kaggle-learning-499603.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-f7a711e1-2bbf-4389-b06a-c2809fc40b27",
  storageBucket: "kaggle-learning-499603.firebasestorage.app",
  messagingSenderId: "580502144972"
};

const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || FALLBACK_CONFIG.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || FALLBACK_CONFIG.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || FALLBACK_CONFIG.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || FALLBACK_CONFIG.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || FALLBACK_CONFIG.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || FALLBACK_CONFIG.appId
};

const databaseId = metaEnv.VITE_FIREBASE_DATABASE_ID || FALLBACK_CONFIG.firestoreDatabaseId;

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with specific database ID
const db = initializeFirestore(app, {}, databaseId || '(default)');

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, auth, googleProvider };
