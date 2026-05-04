// ============================================
// COWBELL - Dashboard Entry Point
// ============================================

import { bus } from './utils.js';
import { loadGoogleMaps, initMap, enableDrawing, cancelDrawing, confirmFence, centerOnCow } from './map.js';
import { startSimulation, stopSimulation, toggleSimulation, isSimulationRunning, getCattle } from './simulation.js';
import { getFences, assignCattleToFence } from './fences.js';
import { initCattlePanel } from './cattle.js';
import { initAlerts, resetAlertCount } from './alerts.js';
import './firebase-config.js';

// ---------- DOM References ----------
const btnDrawFence = document.getElementById('btn-draw-fence');
const btnToggleSim = document.getElementById('btn-toggle-sim');
const btnAlerts = document.getElementById('btn-alerts');
const btnHistory = document.getElementById('btn-history');
const cattlePanel = document.getElementById('cattle-panel');
const alertsPanel = document.getElementById('alerts-panel');
const historyPanel = document.getElementById('history-panel');
const panelOverlay = document.getElementById('panel-overlay');
const fenceNameInput = document.getElementById('fence-name-input');
const fenceNameField = document.getElementById('fence-name');
const btnSaveFence = document.getElementById('btn-save-fence');
const btnCancelFence = document.getElementById('btn-cancel-fence');
const fenceModal = document.getElementById('fence-modal');
const fenceCattleList = document.getElementById('fence-cattle-list');
const btnConfirmAssign = document.getElementById('btn-confirm-assign');
const btnCancelAssign = document.getElementById('btn-cancel-assign');
const simControl = document.getElementById('sim-control');
const simLabel = document.getElementById('sim-label');
const closeCattlePanel = document.getElementById('close-cattle-panel');
const closeAlertsPanel = document.getElementById('close-alerts-panel');
const closeHistoryPanel = document.getElementById('close-history-panel');

// Bottom nav items
const navMap = document.getElementById('nav-map');
const navCattle = document.getElementById('nav-cattle');
const navAlertsMobile = document.getElementById('nav-alerts-mobile');
const navHistoryMobile = document.getElementById('nav-history-mobile');

let currentFenceForAssignment = null;

// ---------- Initialize Application ----------
async function init() {
  console.log('[CowBell] Dashboard - Inicializando...');

  try {
    // Load Google Maps
    await loadGoogleMaps();
    console.log('[OK] Google Maps cargado');

    // Initialize map
    initMap();

    // Initialize UI modules
    initCattlePanel();
    initAlerts();

    // Start simulation
    startSimulation();

    // Setup event listeners
    setupEventListeners();
    setupBottomNav();

    // Set initial active nav
    setActiveNav('map');

    // On desktop, show cattle panel by default
    if (window.innerWidth >= 1024 && cattlePanel) {
      cattlePanel.classList.add('open');
    }

    console.log('[OK] CowBell Dashboard listo');
  } catch (error) {
    console.error('[ERROR] Error inicializando:', error);
    document.getElementById('map').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;background:#F7F8FA;flex-direction:column;gap:16px;padding:20px;text-align:center">
        <div style="width:64px;height:64px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center"><svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='#10b981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6'/><line x1='8' y1='2' x2='8' y2='18'/><line x1='16' y1='6' x2='16' y2='22'/></svg></div>
        <h2 style="font-family:'Inter',sans-serif;color:#1a1a2e;font-size:1.2rem">Error al cargar el mapa</h2>
        <p style="color:#6b7280;font-size:0.85rem">Verifica tu conexion a internet y la API Key de Google Maps.</p>
        <p style="color:#6b7280;font-size:0.78rem">${error.message}</p>
      </div>
    `;
  }
}

// ---------- Event Listeners ----------
function setupEventListeners() {
  // Draw fence button
  btnDrawFence?.addEventListener('click', () => {
    if (btnDrawFence.classList.contains('active')) {
      // Cancel drawing
      cancelDrawing();
      btnDrawFence.classList.remove('active');
      btnDrawFence.innerHTML = '<i data-lucide="pen-tool" style="width:14px;height:14px"></i> Nueva Cerca';
      if(window.lucide) lucide.createIcons();
    } else {
      enableDrawing();
      btnDrawFence.classList.add('active');
      btnDrawFence.innerHTML = '<i data-lucide="x" style="width:14px;height:14px"></i> Cancelar';
      if(window.lucide) lucide.createIcons();
    }
  });

  // When polygon is drawn, show name input
  bus.on('fence:polygonDrawn', () => {
    fenceNameInput?.classList.add('show');
    if (fenceNameField) {
      fenceNameField.value = '';
      fenceNameField.focus();
    }
    if (btnDrawFence) {
      btnDrawFence.classList.remove('active');
      btnDrawFence.innerHTML = '<i data-lucide="pen-tool" style="width:14px;height:14px"></i> Nueva Cerca';
      if(window.lucide) lucide.createIcons();
    }
  });

  // Save fence
  btnSaveFence?.addEventListener('click', () => {
    const name = fenceNameField?.value.trim() || `Cerca ${getFences().length + 1}`;
    const fence = confirmFence(name);
    fenceNameInput?.classList.remove('show');

    if (fence) {
      // Show assignment modal
      showAssignmentModal(fence);
    }
  });

  // Cancel fence
  btnCancelFence?.addEventListener('click', () => {
    cancelDrawing();
    fenceNameInput?.classList.remove('show');
  });

  // Enter key on fence name
  fenceNameField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveFence?.click();
  });

  // Toggle simulation
  btnToggleSim?.addEventListener('click', () => {
    const running = toggleSimulation();
    const simIcon = document.getElementById('sim-icon');
    const simBtnLabel = document.getElementById('sim-btn-label');
    if(simIcon) simIcon.setAttribute('data-lucide', running ? 'pause' : 'play');
    if(simBtnLabel) simBtnLabel.textContent = running ? 'Pausar' : 'Reanudar';
    if(window.lucide) lucide.createIcons();
    simControl?.classList.toggle('paused', !running);
    if (simLabel) simLabel.textContent = running ? 'Simulacion activa' : 'Simulacion pausada';
  });

  // Alerts panel
  btnAlerts?.addEventListener('click', () => togglePanel('alerts'));
  closeAlertsPanel?.addEventListener('click', () => closeAllPanels());

  // History panel
  btnHistory?.addEventListener('click', () => togglePanel('history'));
  closeHistoryPanel?.addEventListener('click', () => closeAllPanels());

  // Cattle panel close (mobile)
  closeCattlePanel?.addEventListener('click', () => {
    cattlePanel?.classList.remove('open');
    panelOverlay?.classList.remove('active');
  });

  // Overlay click closes panels
  panelOverlay?.addEventListener('click', closeAllPanels);

  // Fence assignment modal
  btnConfirmAssign?.addEventListener('click', () => {
    if (currentFenceForAssignment) {
      const checkedBoxes = fenceCattleList?.querySelectorAll('input:checked') || [];
      const cattleIds = Array.from(checkedBoxes).map(cb => cb.value);
      assignCattleToFence(currentFenceForAssignment.id, cattleIds);

      // Update cattle objects
      const cattle = getCattle();
      cattleIds.forEach(id => {
        const cow = cattle.find(c => c.id === id);
        if (cow) cow.fenceId = currentFenceForAssignment.id;
      });

      fenceModal?.classList.remove('active');
      currentFenceForAssignment = null;
    }
  });

  btnCancelAssign?.addEventListener('click', () => {
    fenceModal?.classList.remove('active');
    currentFenceForAssignment = null;
  });

  // Update stats on tick
  bus.on('simulation:tick', () => {
    updateStatusStats();
  });
}

// ---------- Panel Management ----------
function togglePanel(panelName) {
  const panels = {
    cattle: cattlePanel,
    alerts: alertsPanel,
    history: historyPanel
  };

  const targetPanel = panels[panelName];
  if (!targetPanel) return;

  const isOpen = targetPanel.classList.contains('open');

  // Close all panels first
  closeAllPanels();

  // Open target if it wasn't open
  if (!isOpen) {
    targetPanel.classList.add('open');
    panelOverlay?.classList.add('active');

    if (panelName === 'alerts') {
      resetAlertCount();
    }
  }
}

function closeAllPanels() {
  // Don't close cattle panel on desktop
  if (window.innerWidth < 1024) {
    cattlePanel?.classList.remove('open');
  }
  alertsPanel?.classList.remove('open');
  historyPanel?.classList.remove('open');
  panelOverlay?.classList.remove('active');
}

// ---------- Bottom Navigation (Mobile) ----------
function setupBottomNav() {
  navMap?.addEventListener('click', () => {
    closeAllPanels();
    setActiveNav('map');
  });

  navCattle?.addEventListener('click', () => {
    togglePanel('cattle');
    setActiveNav('cattle');
  });

  navAlertsMobile?.addEventListener('click', () => {
    togglePanel('alerts');
    setActiveNav('alerts');
  });

  navHistoryMobile?.addEventListener('click', () => {
    togglePanel('history');
    setActiveNav('history');
  });
}

function setActiveNav(id) {
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.remove('active');
  });

  const map = { map: navMap, cattle: navCattle, alerts: navAlertsMobile, history: navHistoryMobile };
  map[id]?.classList.add('active');
}

// ---------- Assignment Modal ----------
function showAssignmentModal(fence) {
  currentFenceForAssignment = fence;
  const cattle = getCattle();

  fenceCattleList.innerHTML = cattle.map(cow => `
    <div class="checkbox-item">
      <input type="checkbox" id="assign-${cow.id}" value="${cow.id}" ${!cow.fenceId ? 'checked' : ''} />
      <label for="assign-${cow.id}">${cow.name} #${cow.number}</label>
    </div>
  `).join('');

  fenceModal.classList.add('active');
}

// ---------- Status Stats ----------
function updateStatusStats() {
  const cattle = getCattle();
  const safe = cattle.filter(c => c.status === 'normal').length;
  const warn = cattle.filter(c => c.status === 'warning').length;
  const danger = cattle.filter(c => c.status === 'danger').length;

  const safeEl = document.getElementById('stat-safe');
  const warnEl = document.getElementById('stat-warning');
  const dangerEl = document.getElementById('stat-danger');

  if (safeEl) safeEl.textContent = safe;
  if (warnEl) warnEl.textContent = warn;
  if (dangerEl) dangerEl.textContent = danger;
}

// ---------- Start! ----------
init();
