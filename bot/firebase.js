// ============================================
// COWBELL BOT - Data Layer (Firebase + In-Memory Fallback)
// ============================================
// For the hackathon prototype, Firebase Admin needs a service account
// which may not always be configured. This module provides a robust
// in-memory store that is always populated with realistic simulation
// data, and optionally syncs with Firestore when credentials exist.
// ============================================

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ============================================
// COW NAMES & POSITIONS (shared source of truth)
// ============================================

export const COW_NAMES = [
  'Lola', 'Mariposa', 'Estrella', 'Canela',
  'Luna', 'Paloma', 'Nieve', 'Valentina'
];

const INITIAL_POSITIONS = [
  { lat: 5.089145, lng: -73.890852 },
  { lat: 5.090214, lng: -73.889891 },
  { lat: 5.088682, lng: -73.887369 },
  { lat: 5.087574, lng: -73.888498 },
];

const CENTER_LAT = 5.088904;
const CENTER_LNG = -73.889153;

// ============================================
// FIREBASE INITIALIZATION (best-effort)
// ============================================

const projectId = process.env.FIREBASE_PROJECT_ID;
let db = null;
let firebaseAvailable = false;

try {
  if (getApps().length === 0) {
    initializeApp({ projectId });
  }
  db = getFirestore();
  // Quick connectivity test — we'll validate on first real use
  firebaseAvailable = true;
  console.log('  🔥 Firebase Admin inicializado (pendiente validación de credenciales)');
} catch (error) {
  console.warn('  ⚠️ Firebase Admin no disponible, usando almacenamiento en memoria:', error.message);
  firebaseAvailable = false;
}

// ============================================
// IN-MEMORY STORE — Always populated, always works
// ============================================

const ACTIVITIES = ['Pastando', 'Descansando', 'Caminando', 'Rumiando'];

function createInMemoryCattle() {
  return COW_NAMES.map((name, i) => {
    const pos = INITIAL_POSITIONS[i] ?? {
      lat: CENTER_LAT + (Math.random() - 0.5) * 0.0016,
      lng: CENTER_LNG + (Math.random() - 0.5) * 0.0016
    };
    return {
      id: `cow-${i + 1}`,
      name,
      number: i + 1,
      lat: pos.lat,
      lng: pos.lng,
      temperature: +(37.8 + Math.random() * 1.4).toFixed(1),
      heartRate: Math.floor(60 + Math.random() * 20),
      activity: ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)],
      status: 'normal',
      fenceId: 'fence-default',
      updatedAt: new Date().toISOString(),
      source: 'simulation'
    };
  });
}

function createInMemoryFences() {
  return [{
    id: 'fence-default',
    name: 'Potrero Principal',
    paths: [
      { lat: 5.091596, lng: -73.892498 },
      { lat: 5.091596, lng: -73.885808 },
      { lat: 5.086212, lng: -73.885808 },
      { lat: 5.086212, lng: -73.892498 }
    ],
    color: '#2DA855',
    cattleIds: COW_NAMES.map((_, i) => `cow-${i + 1}`),
    source: 'simulation'
  }];
}

// The in-memory stores — always populated
const memStore = {
  cattle: createInMemoryCattle(),
  fences: createInMemoryFences(),
  events: []
};

// After first Firebase failure, stop trying
let firebaseConfirmedDown = false;

/**
 * Try a Firebase operation, fallback silently on auth/connectivity errors
 */
async function tryFirebase(operation) {
  if (!firebaseAvailable || firebaseConfirmedDown || !db) return null;
  try {
    return await operation();
  } catch (error) {
    if (error.message?.includes('credentials') || error.message?.includes('UNAUTHENTICATED')) {
      console.warn('  ⚠️ Firebase sin credenciales, usando memoria permanentemente');
      firebaseConfirmedDown = true;
    }
    return null;
  }
}

// ============================================
// CATTLE OPERATIONS
// ============================================

/**
 * Get all cattle — tries Firebase first, falls back to in-memory
 */
export async function getCattle() {
  const fromFirebase = await tryFirebase(async () => {
    const snapshot = await db.collection('cattle').get();
    if (snapshot.empty) return null; // null = "empty, try memory"
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  if (fromFirebase && fromFirebase.length > 0) return fromFirebase;

  // Refresh in-memory data with small random variations for realism
  refreshMemoryData();
  return memStore.cattle;
}

/**
 * Get a single cow by name (case-insensitive, partial match)
 */
export async function getCowByName(name) {
  const cattle = await getCattle();
  const lowerName = name.toLowerCase();

  // Exact match first
  let found = cattle.find(c => c.name.toLowerCase() === lowerName);
  if (found) return found;

  // Partial match (e.g. "Loli" → "Lola", "Mari" → "Mariposa")
  found = cattle.find(c => c.name.toLowerCase().includes(lowerName));
  if (found) return found;

  // Reverse partial (e.g. "la vaca mariposa bonita" contains "mariposa")
  found = cattle.find(c => lowerName.includes(c.name.toLowerCase()));
  return found || null;
}

/**
 * Get a cow by number
 */
export async function getCowByNumber(number) {
  const cattle = await getCattle();
  return cattle.find(c => c.number === number) || null;
}

/**
 * Register a new cow
 */
export async function registerCow(name, number) {
  const existingCattle = await getCattle();
  const newNumber = number || (existingCattle.length > 0
    ? Math.max(...existingCattle.map(c => c.number || 0)) + 1
    : 1);

  const cowId = `cow-${Date.now()}`;
  const cowData = {
    id: cowId,
    name,
    number: newNumber,
    temperature: +(37.8 + Math.random() * 1.4).toFixed(1),
    heartRate: Math.floor(60 + Math.random() * 20),
    activity: 'Descansando',
    status: 'normal',
    fenceId: null,
    lat: CENTER_LAT + (Math.random() - 0.5) * 0.001,
    lng: CENTER_LNG + (Math.random() - 0.5) * 0.001,
    updatedAt: new Date().toISOString(),
    source: 'telegram'
  };

  // Add to memory
  memStore.cattle.push(cowData);

  // Try Firebase
  await tryFirebase(async () => {
    await db.collection('cattle').doc(cowId).set({
      ...cowData,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return cowData;
}

/**
 * Delete a cow by name
 */
export async function deleteCow(name) {
  const cow = await getCowByName(name);
  if (!cow) return null;

  // Remove from memory
  memStore.cattle = memStore.cattle.filter(c => c.id !== cow.id);

  // Try Firebase
  await tryFirebase(async () => {
    await db.collection('cattle').doc(cow.id).delete();
  });

  return cow;
}

// ============================================
// FENCE OPERATIONS
// ============================================

/**
 * Get all fences
 */
export async function getFences() {
  const fromFirebase = await tryFirebase(async () => {
    const snapshot = await db.collection('fences').get();
    if (snapshot.empty) return null;
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  if (fromFirebase && fromFirebase.length > 0) return fromFirebase;
  return memStore.fences;
}

/**
 * Get a fence by name (case-insensitive)
 */
export async function getFenceByName(name) {
  const fences = await getFences();
  const lowerName = name.toLowerCase();
  return fences.find(f =>
    f.name.toLowerCase() === lowerName ||
    f.name.toLowerCase().includes(lowerName)
  ) || null;
}

/**
 * Move a cow to a different fence
 */
export async function moveCowToFence(cowName, fenceName) {
  const cow = await getCowByName(cowName);
  if (!cow) return { success: false, error: `No encontré una vaca llamada "${cowName}"` };

  const fence = await getFenceByName(fenceName);
  if (!fence) return { success: false, error: `No encontré una cerca/zona llamada "${fenceName}"` };

  // Update in memory
  const memCow = memStore.cattle.find(c => c.id === cow.id);
  if (memCow) {
    memCow.fenceId = fence.id;
    memCow.status = 'normal';
  }

  // Try Firebase
  await tryFirebase(async () => {
    await db.collection('cattle').doc(cow.id).update({
      fenceId: fence.id,
      status: 'normal'
    });
    const cattleIds = fence.cattleIds || [];
    if (!cattleIds.includes(cow.id)) {
      cattleIds.push(cow.id);
      await db.collection('fences').doc(fence.id).update({ cattleIds });
    }
  });

  await logEvent({
    type: 'info',
    message: `🐄 ${cow.name} fue movida a "${fence.name}" vía Telegram`,
    cowId: cow.id,
    cowName: cow.name,
    source: 'telegram'
  });

  return { success: true, cow, fence };
}

/**
 * Create a new fence
 */
export async function createFence(name) {
  const existing = await getFenceByName(name);
  if (existing) return { success: false, error: `Ya existe una cerca llamada "${existing.name}"` };

  const fenceId = `fence-${Date.now()}`;
  const offset = 0.004 + Math.random() * 0.003;
  const angle = Math.random() * Math.PI * 2;
  const centerLat = CENTER_LAT + Math.cos(angle) * offset;
  const centerLng = CENTER_LNG + Math.sin(angle) * offset;
  const size = 0.003;

  const fenceData = {
    id: fenceId,
    name,
    paths: [
      { lat: centerLat + size, lng: centerLng - size },
      { lat: centerLat + size, lng: centerLng + size },
      { lat: centerLat - size, lng: centerLng + size },
      { lat: centerLat - size, lng: centerLng - size }
    ],
    color: getRandomFenceColor(),
    cattleIds: [],
    source: 'telegram'
  };

  // Add to memory
  memStore.fences.push(fenceData);

  // Try Firebase
  await tryFirebase(async () => {
    await db.collection('fences').doc(fenceId).set({
      ...fenceData,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  await logEvent({
    type: 'system',
    message: `🗺️ Cerca "${name}" creada vía Telegram`,
    source: 'telegram'
  });

  return { success: true, fence: fenceData };
}

// ============================================
// ALERTS / EVENTS
// ============================================

/**
 * Get recent alerts/events
 */
export async function getRecentAlerts(limitCount = 10) {
  const fromFirebase = await tryFirebase(async () => {
    const snapshot = await db.collection('events')
      .orderBy('timestamp', 'desc')
      .limit(limitCount)
      .get();
    if (snapshot.empty) return null;
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  if (fromFirebase && fromFirebase.length > 0) return fromFirebase;

  // Return recent in-memory events
  return memStore.events.slice(-limitCount).reverse();
}

/**
 * Log an event
 */
export async function logEvent(eventData) {
  const event = {
    ...eventData,
    timestamp: new Date().toISOString()
  };

  // Add to memory (keep last 50)
  memStore.events.push(event);
  if (memStore.events.length > 50) memStore.events.shift();

  // Try Firebase
  await tryFirebase(async () => {
    await db.collection('events').add({
      ...eventData,
      timestamp: FieldValue.serverTimestamp()
    });
  });
}

// ============================================
// FARM SUMMARY
// ============================================

/**
 * Get a full farm summary
 */
export async function getFarmSummary() {
  const [cattle, fences, alerts] = await Promise.all([
    getCattle(),
    getFences(),
    getRecentAlerts(5)
  ]);

  const safe = cattle.filter(c => c.status === 'normal').length;
  const warning = cattle.filter(c => c.status === 'warning').length;
  const danger = cattle.filter(c => c.status === 'danger').length;

  return {
    totalCattle: cattle.length,
    totalFences: fences.length,
    safe,
    warning,
    danger,
    cattle,
    fences,
    recentAlerts: alerts
  };
}

// ============================================
// DATA INITIALIZATION
// ============================================

/**
 * Initialize data on bot startup.
 * In-memory store is always ready. If Firebase is available, try to seed it.
 */
export async function initializeData() {
  console.log('  📦 Inicializando datos...');
  console.log(`  🐄 ${memStore.cattle.length} vacas en memoria: ${COW_NAMES.join(', ')}`);
  console.log(`  🗺️ ${memStore.fences.length} cerca(s) en memoria`);

  // If Firebase works, try to seed data there too
  const firebaseTest = await tryFirebase(async () => {
    const snapshot = await db.collection('cattle').get();
    return snapshot;
  });

  if (firebaseTest) {
    console.log('  🔥 Firebase disponible — sincronizando datos...');
    if (firebaseTest.empty) {
      // Seed Firebase from memory
      const batch = db.batch();
      for (const cow of memStore.cattle) {
        const ref = db.collection('cattle').doc(cow.id);
        const { id, ...data } = cow;
        batch.set(ref, { ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      for (const fence of memStore.fences) {
        const ref = db.collection('fences').doc(fence.id);
        const { id, ...data } = fence;
        batch.set(ref, { ...data, createdAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      await batch.commit();
      console.log('  ✅ Datos sembrados en Firebase');
    } else {
      console.log(`  ✅ Firebase ya tiene ${firebaseTest.size} vacas`);
    }
  } else {
    console.log('  📦 Modo local: datos en memoria (Firebase no disponible)');
  }

  console.log('  📦 Datos listos.');
  console.log('');
}

// ============================================
// HELPERS
// ============================================

function getRandomFenceColor() {
  const colors = ['#2DA855', '#3498DB', '#E67E22', '#9B59B6', '#E74C3C', '#1ABC9C'];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Add small random variations to in-memory data on each read
 * to simulate real-time sensor updates
 */
function refreshMemoryData() {
  memStore.cattle.forEach(cow => {
    // Slight temperature drift
    cow.temperature = +(cow.temperature + (Math.random() - 0.5) * 0.2).toFixed(1);
    cow.temperature = Math.max(37.0, Math.min(40.5, cow.temperature));

    // Slight heart rate drift
    cow.heartRate = Math.max(55, Math.min(100, cow.heartRate + Math.floor((Math.random() - 0.5) * 4)));

    // Occasionally change activity
    if (Math.random() < 0.15) {
      cow.activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
    }

    // Small position drift
    cow.lat += (Math.random() - 0.5) * 0.00008;
    cow.lng += (Math.random() - 0.5) * 0.00008;

    cow.updatedAt = new Date().toISOString();
  });
}

export { db };
