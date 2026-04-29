// ============================================
// COWBELL - Cattle Simulation Engine
// ============================================

import { bus, randomBetween, gaussianRandom, clamp, COW_NAMES } from './utils.js';

// Center point: calculated centroid of the provided field coordinates
const CENTER_LAT = 5.088904;
const CENTER_LNG = -73.889153;
const SPREAD = 0.0008; // ~80m spread for initial scatter of extra cows

// Fixed initial positions moved closer to the center to avoid spawning on edges
const INITIAL_POSITIONS = [
  { lat: 5.089145, lng: -73.890852 }, // Cow 1 (NWish)
  { lat: 5.090214, lng: -73.889891 }, // Cow 2 (NEish)
  { lat: 5.088682, lng: -73.887369 }, // Cow 3 (SEish - will escape)
  { lat: 5.087574, lng: -73.888498 }, // Cow 4 (SWish)
];

/**
 * Initial cattle data
 */
function createInitialCattle() {
  return COW_NAMES.slice(0, 8).map((name, i) => {
    // Use fixed positions for the first 4 cows, scatter the rest nearby
    const pos = INITIAL_POSITIONS[i] ?? {
      lat: CENTER_LAT + randomBetween(-SPREAD, SPREAD),
      lng: CENTER_LNG + randomBetween(-SPREAD, SPREAD)
    };
    return {
      id: `cow-${i + 1}`,
      name: name,
      number: i + 1,
      lat: pos.lat,
      lng: pos.lng,
      temperature: randomBetween(37.8, 39.2),
      activity: ['Pastando', 'Descansando', 'Caminando', 'Rumiando'][Math.floor(Math.random() * 4)],
      heartRate: Math.floor(randomBetween(60, 80)),
      status: 'normal', // normal | warning | danger
      fenceId: null,
      trail: [],
      escapeScheduled: i === 2, // Cow #3 (Estrella) will escape for demo
      escapeTimer: null
    };
  });
}

let cattle = createInitialCattle();
let simulationInterval = null;
let isRunning = false;
let tickCount = 0;
const TICK_MS = 2500; // Update every 2.5 seconds

/**
 * Get all cattle
 */
export function getCattle() {
  return cattle;
}

/**
 * Get a single cow by ID
 */
export function getCow(id) {
  return cattle.find(c => c.id === id);
}

/**
 * Start the simulation
 */
export function startSimulation() {
  if (isRunning) return;
  isRunning = true;

  simulationInterval = setInterval(() => {
    tickCount++;
    updateCattle();
    bus.emit('simulation:tick', { cattle, tickCount });
  }, TICK_MS);

  bus.emit('simulation:started');
  console.log('▶️ Simulación iniciada');
}

/**
 * Stop the simulation
 */
export function stopSimulation() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(simulationInterval);
  bus.emit('simulation:stopped');
  console.log('⏸️ Simulación pausada');
}

/**
 * Toggle simulation
 */
export function toggleSimulation() {
  if (isRunning) {
    stopSimulation();
  } else {
    startSimulation();
  }
  return isRunning;
}

/**
 * Check if simulation is running
 */
export function isSimulationRunning() {
  return isRunning;
}

/**
 * Update all cattle positions and stats
 */
function updateCattle() {
  cattle.forEach(cow => {
    // Save previous position to trail (keep last 20)
    cow.trail.push({ lat: cow.lat, lng: cow.lng });
    if (cow.trail.length > 20) cow.trail.shift();

    // Normal brownian movement — small steps (~4-5m per tick)
    let deltaLat = gaussianRandom(0, 0.00004);
    let deltaLng = gaussianRandom(0, 0.00004);

    // Cow #3 escape behavior after ~15 seconds (6 ticks)
    if (cow.escapeScheduled && tickCount >= 6 && tickCount < 20) {
      // Move consistently toward the fence edge to exit
      deltaLat = 0.00012;
      deltaLng = 0.00008;
    }

    // After escaping, slow random drift outside
    if (cow.escapeScheduled && tickCount >= 20) {
      deltaLat = gaussianRandom(0.00002, 0.00004);
      deltaLng = gaussianRandom(0.00002, 0.00004);
    }

    cow.lat += deltaLat;
    cow.lng += deltaLng;

    // Keep within reasonable bounds (~2km around center)
    cow.lat = clamp(cow.lat, CENTER_LAT - 0.018, CENTER_LAT + 0.018);
    cow.lng = clamp(cow.lng, CENTER_LNG - 0.018, CENTER_LNG + 0.018);

    // Update temperature with slight noise
    cow.temperature = clamp(
      cow.temperature + gaussianRandom(0, 0.1),
      37.0, 40.5
    );
    cow.temperature = Math.round(cow.temperature * 10) / 10;

    // Update heart rate
    cow.heartRate = clamp(
      Math.floor(cow.heartRate + gaussianRandom(0, 2)),
      55, 100
    );

    // Randomly change activity
    if (Math.random() < 0.1) {
      const activities = ['Pastando', 'Descansando', 'Caminando', 'Rumiando'];
      cow.activity = activities[Math.floor(Math.random() * activities.length)];
    }

    // If cow is escaping, set higher activity metrics
    if (cow.escapeScheduled && tickCount >= 6 && tickCount < 20) {
      cow.activity = 'Corriendo';
      cow.heartRate = clamp(cow.heartRate + 3, 80, 110);
      cow.temperature = clamp(cow.temperature + 0.05, 38.5, 41.0);
    }
  });
}

/**
 * Update cow status based on fence check
 */
export function updateCowStatus(cowId, status) {
  const cow = cattle.find(c => c.id === cowId);
  if (cow) {
    const oldStatus = cow.status;
    cow.status = status;
    if (oldStatus !== status) {
      bus.emit('cow:statusChanged', { cow, oldStatus, newStatus: status });
    }
  }
}

/**
 * Assign a fence to a cow
 */
export function assignFenceToCow(cowId, fenceId) {
  const cow = cattle.find(c => c.id === cowId);
  if (cow) {
    cow.fenceId = fenceId;
    bus.emit('cow:fenceAssigned', { cow, fenceId });
  }
}

/**
 * Get simulation center coordinates
 */
export function getSimulationCenter() {
  // Center is the centroid of the 4 provided field coordinates
  return { lat: CENTER_LAT, lng: CENTER_LNG };
}
