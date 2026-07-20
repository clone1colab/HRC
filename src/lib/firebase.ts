/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app;
let db: any = null;
let auth: any = null;
let isUsingRealFirebase = false;

// We consider Firebase configured if we have an API Key and Project ID
if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    isUsingRealFirebase = true;
    console.log('Firebase initialized successfully!');
  } catch (error) {
    console.warn('Firebase initialization failed, falling back to LocalStorage:', error);
  }
} else {
  console.log('No Firebase credentials found. Running in LocalStorage Mock Mode (Realtime Enabled).');
}

export { db, auth, isUsingRealFirebase };
