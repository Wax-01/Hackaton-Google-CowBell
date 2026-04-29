// ============================================
// COWBELL - Firebase Configuration
// ============================================

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app;
let db;
let firebaseReady = false;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseReady = true;
  console.log('🔥 Firebase conectado correctamente');
} catch (error) {
  console.warn('⚠️ Firebase no disponible, usando modo local:', error.message);
}

/**
 * Check if Firebase is available
 */
export function isFirebaseReady() {
  return firebaseReady;
}

/**
 * Save a fence to Firestore
 */
export async function saveFence(fenceData) {
  if (!firebaseReady) {
    console.log('📦 Fence saved locally:', fenceData);
    return fenceData.id;
  }
  try {
    const ref = doc(db, 'fences', fenceData.id);
    await setDoc(ref, {
      ...fenceData,
      createdAt: serverTimestamp()
    });
    return fenceData.id;
  } catch (error) {
    console.error('Error saving fence:', error);
    return fenceData.id;
  }
}

/**
 * Load all fences from Firestore
 */
export async function loadFences() {
  if (!firebaseReady) return [];
  try {
    const snapshot = await getDocs(collection(db, 'fences'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error loading fences:', error);
    return [];
  }
}

/**
 * Log an event to Firestore
 */
export async function logEvent(eventData) {
  if (!firebaseReady) {
    console.log('📝 Event logged locally:', eventData);
    return;
  }
  try {
    await addDoc(collection(db, 'events'), {
      ...eventData,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging event:', error);
  }
}

/**
 * Listen to events in real-time
 */
export function onEvents(callback) {
  if (!firebaseReady) return () => {};
  try {
    const q = query(
      collection(db, 'events'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(events);
    });
  } catch (error) {
    console.error('Error listening to events:', error);
    return () => {};
  }
}

export { db };
