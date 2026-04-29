// ============================================
// COWBELL - Fence Management
// ============================================

import { bus, generateId } from './utils.js';
import { saveFence as saveFenceToFirebase } from './firebase-config.js';

let fences = [];
let activeFencePolygons = new Map(); // fenceId -> Google Maps Polygon

/**
 * Get all fences
 */
export function getFences() {
  return fences;
}

/**
 * Get a fence by ID
 */
export function getFence(id) {
  return fences.find(f => f.id === id);
}

/**
 * Create a default demo fence that wraps the 4 real field coordinates
 * with a small buffer (~100-120m) so all cows start inside.
 *
 * Real field corners (user-provided):
 *   5.089387, -73.892552   (NW)
 *   5.091524, -73.890631   (NE)
 *   5.088462, -73.885586   (SE)
 *   5.086245, -73.887844   (SW)
 *
 * Buffer: ~0.001° ≈ 110m
 */
export function createDefaultFence(_center) {
  const defaultFence = {
    id: generateId(),
    name: 'Zona Principal',
    paths: [
      { lat: 5.089386701322959, lng: -73.89255219568926 },
      { lat: 5.091524011299184, lng: -73.890630607694 },
      { lat: 5.0884615948446745, lng: -73.8855864391714 },
      { lat: 5.086244523836297, lng: -73.88784430508152 }
    ],
    color: '#1B7A3D',
    cattleIds: [],
    createdAt: new Date()
  };

  fences.push(defaultFence);
  saveFenceToFirebase(defaultFence);
  bus.emit('fence:created', defaultFence);
  return defaultFence;
}

/**
 * Add a new fence from a Google Maps polygon
 */
export function addFence(name, polygon) {
  const path = polygon.getPath();
  const paths = [];

  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    paths.push({ lat: point.lat(), lng: point.lng() });
  }

  const fence = {
    id: generateId(),
    name: name || `Cerca ${fences.length + 1}`,
    paths: paths,
    color: getNextFenceColor(),
    cattleIds: [],
    createdAt: new Date()
  };

  fences.push(fence);
  saveFenceToFirebase(fence);
  bus.emit('fence:created', fence);
  return fence;
}

/**
 * Assign cattle to a fence
 */
export function assignCattleToFence(fenceId, cattleIds) {
  const fence = fences.find(f => f.id === fenceId);
  if (fence) {
    fence.cattleIds = cattleIds;
    bus.emit('fence:cattleAssigned', { fence, cattleIds });
  }
}

/**
 * Delete a fence
 */
export function deleteFence(fenceId) {
  fences = fences.filter(f => f.id !== fenceId);
  bus.emit('fence:deleted', fenceId);
}

/**
 * Store reference to a Google Maps Polygon for a fence
 */
export function setFencePolygon(fenceId, polygon) {
  activeFencePolygons.set(fenceId, polygon);
}

/**
 * Get the Google Maps Polygon for a fence
 */
export function getFencePolygon(fenceId) {
  return activeFencePolygons.get(fenceId);
}

/**
 * Check if a point (lat, lng) is inside a fence polygon
 */
export function isInsideFence(fenceId, lat, lng) {
  const polygon = activeFencePolygons.get(fenceId);
  if (!polygon || !window.google) return true; // Default to inside if can't check

  const point = new google.maps.LatLng(lat, lng);
  return google.maps.geometry.poly.containsLocation(point, polygon);
}

/**
 * Check all cattle against their assigned fences
 */
export function checkAllCattleInFences(cattle) {
  const results = [];

  cattle.forEach(cow => {
    if (!cow.fenceId) return;

    const inside = isInsideFence(cow.fenceId, cow.lat, cow.lng);
    const fence = getFence(cow.fenceId);

    // Calculate distance to nearest fence edge for warning zone
    let nearEdge = false;
    if (inside && fence) {
      nearEdge = isNearFenceEdge(cow.fenceId, cow.lat, cow.lng, 0.001);
    }

    let status = 'normal';
    if (!inside) {
      status = 'danger';
    } else if (nearEdge) {
      status = 'warning';
    }

    results.push({
      cowId: cow.id,
      fenceId: cow.fenceId,
      inside,
      nearEdge,
      status,
      fenceName: fence ? fence.name : 'Desconocida'
    });
  });

  return results;
}

/**
 * Check if point is near the edge of a fence (within threshold)
 */
function isNearFenceEdge(fenceId, lat, lng, threshold) {
  const fence = fences.find(f => f.id === fenceId);
  if (!fence) return false;

  // Simple check: shrink the fence and see if point is outside shrunk version
  const center = getCentroid(fence.paths);
  const shrinkFactor = 0.7;

  const shrunkPaths = fence.paths.map(p => ({
    lat: center.lat + (p.lat - center.lat) * shrinkFactor,
    lng: center.lng + (p.lng - center.lng) * shrinkFactor
  }));

  // Check if point is outside the shrunk polygon (= near edge)
  return !isPointInPolygon(lat, lng, shrunkPaths);
}

/**
 * Get centroid of polygon paths
 */
function getCentroid(paths) {
  let lat = 0, lng = 0;
  paths.forEach(p => { lat += p.lat; lng += p.lng; });
  return { lat: lat / paths.length, lng: lng / paths.length };
}

/**
 * Ray casting point-in-polygon (fallback without Google Maps)
 */
function isPointInPolygon(lat, lng, paths) {
  let inside = false;
  for (let i = 0, j = paths.length - 1; i < paths.length; j = i++) {
    const xi = paths[i].lat, yi = paths[i].lng;
    const xj = paths[j].lat, yj = paths[j].lng;

    const intersect = ((yi > lng) !== (yj > lng))
      && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Get next fence color from palette
 */
function getNextFenceColor() {
  const colors = ['#2DA855', '#3498DB', '#E67E22', '#9B59B6', '#E74C3C', '#1ABC9C'];
  return colors[fences.length % colors.length];
}
