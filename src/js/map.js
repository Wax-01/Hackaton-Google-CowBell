// ============================================
// COWBELL - Google Maps Integration
// ============================================

import { bus } from './utils.js';
import { getSimulationCenter, getCattle } from './simulation.js';
import {
  createDefaultFence, addFence, setFencePolygon, getFences,
  checkAllCattleInFences, getFencePolygon
} from './fences.js';

let map = null;
let markers = new Map(); // cowId -> marker
let fencePolygons = new Map(); // fenceId -> google polygon
let drawingManager = null;
let pendingPolygon = null; // polygon being created
let infoWindow = null;

// Custom map styles for a clean look
const MAP_STYLES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'landscape.natural',
    elementType: 'geometry.fill',
    stylers: [{ color: '#e8f5e9' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry.fill',
    stylers: [{ color: '#bbdefb' }]
  }
];

/**
 * Load Google Maps API dynamically
 */
export function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=drawing,geometry&callback=__initGoogleMaps`;
    script.async = true;
    script.defer = true;

    window.__initGoogleMaps = () => {
      delete window.__initGoogleMaps;
      resolve();
    };

    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize the map
 */
export function initMap() {
  const center = getSimulationCenter();

  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: center.lat, lng: center.lng },
    zoom: 15,
    mapTypeId: 'hybrid',
    styles: MAP_STYLES,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.RIGHT_CENTER
    },
    mapTypeControl: true,
    mapTypeControlOptions: {
      style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: google.maps.ControlPosition.TOP_RIGHT,
      mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain']
    },
    fullscreenControl: false,
    gestureHandling: 'greedy'
  });

  infoWindow = new google.maps.InfoWindow();

  // Create default fence
  const defaultFence = createDefaultFence(center);
  renderFenceOnMap(defaultFence);

  // Assign all cattle to default fence
  const cattle = getCattle();
  cattle.forEach(cow => {
    cow.fenceId = defaultFence.id;
  });
  defaultFence.cattleIds = cattle.map(c => c.id);

  // Initialize markers for all cattle
  cattle.forEach(cow => {
    createCowMarker(cow);
  });

  // Setup drawing manager
  setupDrawingManager();

  // Listen for simulation ticks
  bus.on('simulation:tick', ({ cattle }) => {
    updateMarkers(cattle);
    checkFences(cattle);
  });

  console.log('🗺️ Mapa inicializado');
}

/**
 * Create a marker for a cow
 */
function createCowMarker(cow) {
  const marker = new google.maps.Marker({
    position: { lat: cow.lat, lng: cow.lng },
    map: map,
    title: `${cow.name} (#${cow.number})`,
    icon: getCowIcon(cow.status),
    optimized: false,
    zIndex: 10
  });

  marker.addListener('click', () => {
    showCowInfoWindow(cow, marker);
    bus.emit('cow:selected', cow);
  });

  markers.set(cow.id, marker);
}

/**
 * Get cow marker icon based on status
 */
function getCowIcon(status) {
  const colors = {
    normal: '#27AE60',
    warning: '#F5A623',
    danger: '#E74C3C'
  };

  const color = colors[status] || colors.normal;

  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#FFFFFF',
    strokeWeight: 3,
    scale: 10
  };
}

/**
 * Show info window for a cow
 */
function showCowInfoWindow(cow, marker) {
  const statusLabels = {
    normal: '<span style="color:#27AE60;font-weight:700">✅ Normal</span>',
    warning: '<span style="color:#F5A623;font-weight:700">⚠️ Advertencia</span>',
    danger: '<span style="color:#E74C3C;font-weight:700">🚨 Fuera de zona</span>'
  };

  const content = `
    <div style="font-family:Inter,sans-serif;padding:8px;min-width:200px">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">
        🐄 ${cow.name} <span style="color:#888">#${cow.number}</span>
      </div>
      <div style="margin-bottom:6px">${statusLabels[cow.status]}</div>
      <div style="font-size:13px;color:#555;line-height:1.8">
        🌡️ Temp: <strong>${cow.temperature}°C</strong><br/>
        💓 Pulso: <strong>${cow.heartRate} bpm</strong><br/>
        🏃 Actividad: <strong>${cow.activity}</strong><br/>
        📍 ${cow.lat.toFixed(5)}, ${cow.lng.toFixed(5)}
      </div>
    </div>
  `;

  infoWindow.setContent(content);
  infoWindow.open(map, marker);
}

/**
 * Update all markers positions
 */
function updateMarkers(cattle) {
  cattle.forEach(cow => {
    const marker = markers.get(cow.id);
    if (marker) {
      marker.setPosition({ lat: cow.lat, lng: cow.lng });
      marker.setIcon(getCowIcon(cow.status));
    }
  });
}

/**
 * Check if cattle are inside their fences
 */
function checkFences(cattle) {
  const results = checkAllCattleInFences(cattle);
  bus.emit('fence:checkResults', results);

  // Update fence polygon colors
  const fenceStatus = {};
  results.forEach(r => {
    if (!fenceStatus[r.fenceId]) {
      fenceStatus[r.fenceId] = { hasDanger: false, hasWarning: false };
    }
    if (r.status === 'danger') fenceStatus[r.fenceId].hasDanger = true;
    if (r.status === 'warning') fenceStatus[r.fenceId].hasWarning = true;
  });

  Object.entries(fenceStatus).forEach(([fenceId, status]) => {
    const polygon = fencePolygons.get(fenceId);
    if (polygon) {
      if (status.hasDanger) {
        polygon.setOptions({
          strokeColor: '#E74C3C',
          fillColor: '#E74C3C',
          fillOpacity: 0.12
        });
      } else if (status.hasWarning) {
        polygon.setOptions({
          strokeColor: '#F5A623',
          fillColor: '#F5A623',
          fillOpacity: 0.08
        });
      } else {
        polygon.setOptions({
          strokeColor: '#1B7A3D',
          fillColor: '#1B7A3D',
          fillOpacity: 0.06
        });
      }
    }
  });
}

/**
 * Render a fence polygon on the map
 */
function renderFenceOnMap(fence) {
  const polygon = new google.maps.Polygon({
    paths: fence.paths,
    strokeColor: fence.color || '#1B7A3D',
    strokeOpacity: 0.9,
    strokeWeight: 3,
    fillColor: fence.color || '#1B7A3D',
    fillOpacity: 0.06,
    map: map,
    editable: false,
    clickable: true
  });

  // Add fence label
  const center = getPolygonCenter(fence.paths);
  new google.maps.Marker({
    position: center,
    map: map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 0
    },
    label: {
      text: fence.name,
      color: '#1B7A3D',
      fontWeight: '700',
      fontSize: '13px',
      className: 'fence-label'
    }
  });

  // Click to select fence
  polygon.addListener('click', () => {
    bus.emit('fence:selected', fence);
  });

  fencePolygons.set(fence.id, polygon);
  setFencePolygon(fence.id, polygon);
}

/**
 * Setup drawing manager for creating new fences
 */
function setupDrawingManager() {
  drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: null,
    drawingControl: false,
    polygonOptions: {
      strokeColor: '#3498DB',
      strokeOpacity: 0.9,
      strokeWeight: 3,
      fillColor: '#3498DB',
      fillOpacity: 0.15,
      editable: true
    }
  });

  drawingManager.setMap(map);

  // When polygon is completed
  google.maps.event.addListener(drawingManager, 'polygoncomplete', (polygon) => {
    drawingManager.setDrawingMode(null);
    pendingPolygon = polygon;
    bus.emit('fence:polygonDrawn', polygon);
  });
}

/**
 * Enable drawing mode
 */
export function enableDrawing() {
  if (drawingManager) {
    drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    bus.emit('map:drawingStarted');
  }
}

/**
 * Cancel drawing
 */
export function cancelDrawing() {
  if (drawingManager) {
    drawingManager.setDrawingMode(null);
  }
  if (pendingPolygon) {
    pendingPolygon.setMap(null);
    pendingPolygon = null;
  }
}

/**
 * Confirm and save the drawn fence
 */
export function confirmFence(name) {
  if (!pendingPolygon) return null;

  const fence = addFence(name, pendingPolygon);
  pendingPolygon.setMap(null); // Remove temp polygon
  pendingPolygon = null;

  renderFenceOnMap(fence); // Render final styled polygon
  return fence;
}

/**
 * Center map on a specific cow
 */
export function centerOnCow(cowId) {
  const marker = markers.get(cowId);
  if (marker && map) {
    map.panTo(marker.getPosition());
    map.setZoom(17);

    const cow = getCattle().find(c => c.id === cowId);
    if (cow) {
      showCowInfoWindow(cow, marker);
    }
  }
}

/**
 * Get center of polygon paths
 */
function getPolygonCenter(paths) {
  let lat = 0, lng = 0;
  paths.forEach(p => { lat += p.lat; lng += p.lng; });
  return { lat: lat / paths.length, lng: lng / paths.length };
}

/**
 * Get the map instance
 */
export function getMap() {
  return map;
}
