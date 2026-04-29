// ============================================
// COWBELL BOT - Firebase Admin Configuration
// ============================================

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;

// Initialize Firebase Admin (without service account for hackathon simplicity)
if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();

// ============================================
// CATTLE OPERATIONS
// ============================================

/**
 * Get all cattle from Firestore
 */
export async function getCattle() {
  try {
    const snapshot = await db.collection('cattle').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting cattle:', error);
    return [];
  }
}

/**
 * Get a single cow by name (case-insensitive)
 */
export async function getCowByName(name) {
  try {
    const cattle = await getCattle();
    return cattle.find(c =>
      c.name.toLowerCase() === name.toLowerCase() ||
      c.name.toLowerCase().includes(name.toLowerCase())
    );
  } catch (error) {
    console.error('Error finding cow:', error);
    return null;
  }
}

/**
 * Get a cow by number
 */
export async function getCowByNumber(number) {
  try {
    const snapshot = await db.collection('cattle')
      .where('number', '==', number)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('Error finding cow by number:', error);
    return null;
  }
}

/**
 * Register a new cow
 */
export async function registerCow(name, number) {
  try {
    const cowId = `cow-${Date.now()}`;
    const cowData = {
      name,
      number: number || (await getNextCowNumber()),
      temperature: 38.5,
      heartRate: 70,
      activity: 'Descansando',
      status: 'normal',
      fenceId: null,
      lat: 5.067 + (Math.random() - 0.5) * 0.01,
      lng: -75.517 + (Math.random() - 0.5) * 0.01,
      createdAt: FieldValue.serverTimestamp(),
      source: 'telegram'
    };
    await db.collection('cattle').doc(cowId).set(cowData);
    return { id: cowId, ...cowData };
  } catch (error) {
    console.error('Error registering cow:', error);
    throw error;
  }
}

/**
 * Delete a cow by name
 */
export async function deleteCow(name) {
  try {
    const cow = await getCowByName(name);
    if (!cow) return null;
    await db.collection('cattle').doc(cow.id).delete();
    return cow;
  } catch (error) {
    console.error('Error deleting cow:', error);
    throw error;
  }
}

/**
 * Get next cow number
 */
async function getNextCowNumber() {
  const cattle = await getCattle();
  if (cattle.length === 0) return 1;
  const maxNumber = Math.max(...cattle.map(c => c.number || 0));
  return maxNumber + 1;
}

// ============================================
// FENCE OPERATIONS
// ============================================

/**
 * Get all fences
 */
export async function getFences() {
  try {
    const snapshot = await db.collection('fences').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting fences:', error);
    return [];
  }
}

/**
 * Get a fence by name (case-insensitive)
 */
export async function getFenceByName(name) {
  try {
    const fences = await getFences();
    return fences.find(f =>
      f.name.toLowerCase() === name.toLowerCase() ||
      f.name.toLowerCase().includes(name.toLowerCase())
    );
  } catch (error) {
    console.error('Error finding fence:', error);
    return null;
  }
}

/**
 * Move a cow to a different fence
 */
export async function moveCowToFence(cowName, fenceName) {
  try {
    const cow = await getCowByName(cowName);
    if (!cow) return { success: false, error: `No encontré una vaca llamada "${cowName}"` };

    const fence = await getFenceByName(fenceName);
    if (!fence) return { success: false, error: `No encontré una cerca/zona llamada "${fenceName}"` };

    // Update cow's fence assignment
    await db.collection('cattle').doc(cow.id).update({
      fenceId: fence.id,
      status: 'normal'
    });

    // Update fence's cattle list
    const cattleIds = fence.cattleIds || [];
    if (!cattleIds.includes(cow.id)) {
      cattleIds.push(cow.id);
      await db.collection('fences').doc(fence.id).update({ cattleIds });
    }

    // Log event
    await logEvent({
      type: 'info',
      message: `🐄 ${cow.name} fue movida a "${fence.name}" vía Telegram`,
      cowId: cow.id,
      cowName: cow.name,
      source: 'telegram'
    });

    return { success: true, cow, fence };
  } catch (error) {
    console.error('Error moving cow:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new fence (simple, without polygon coordinates — defined later in dashboard)
 */
export async function createFence(name) {
  try {
    const existing = await getFenceByName(name);
    if (existing) return { success: false, error: `Ya existe una cerca llamada "${existing.name}"` };

    const fenceId = `fence-${Date.now()}`;
    const CENTER_LAT = 5.067;
    const CENTER_LNG = -75.517;
    const offset = 0.004 + Math.random() * 0.003;
    const angle = Math.random() * Math.PI * 2;

    const centerLat = CENTER_LAT + Math.cos(angle) * offset;
    const centerLng = CENTER_LNG + Math.sin(angle) * offset;
    const size = 0.003;

    const fenceData = {
      name,
      paths: [
        { lat: centerLat + size, lng: centerLng - size },
        { lat: centerLat + size, lng: centerLng + size },
        { lat: centerLat - size, lng: centerLng + size },
        { lat: centerLat - size, lng: centerLng - size }
      ],
      color: getRandomFenceColor(),
      cattleIds: [],
      createdAt: FieldValue.serverTimestamp(),
      source: 'telegram'
    };

    await db.collection('fences').doc(fenceId).set(fenceData);

    await logEvent({
      type: 'system',
      message: `🗺️ Cerca "${name}" creada vía Telegram`,
      source: 'telegram'
    });

    return { success: true, fence: { id: fenceId, ...fenceData } };
  } catch (error) {
    console.error('Error creating fence:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ALERTS / EVENTS
// ============================================

/**
 * Get recent alerts/events
 */
export async function getRecentAlerts(limitCount = 10) {
  try {
    const snapshot = await db.collection('events')
      .orderBy('timestamp', 'desc')
      .limit(limitCount)
      .get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting alerts:', error);
    return [];
  }
}

/**
 * Log an event to Firestore
 */
export async function logEvent(eventData) {
  try {
    await db.collection('events').add({
      ...eventData,
      timestamp: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging event:', error);
  }
}

// ============================================
// FARM SUMMARY
// ============================================

/**
 * Get a full farm summary
 */
export async function getFarmSummary() {
  try {
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
  } catch (error) {
    console.error('Error getting farm summary:', error);
    throw error;
  }
}

// ============================================
// HELPERS
// ============================================

function getRandomFenceColor() {
  const colors = ['#2DA855', '#3498DB', '#E67E22', '#9B59B6', '#E74C3C', '#1ABC9C'];
  return colors[Math.floor(Math.random() * colors.length)];
}

export { db };
