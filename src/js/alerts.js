// ============================================
// COWBELL - Alert System (WhatsApp-style)
// ============================================

import { bus, formatTime, formatRelativeTime } from './utils.js';
import { logEvent } from './firebase-config.js';

let alerts = [];
let history = [];
let alertCount = 0;
let previousStatuses = {}; // Track previous statuses to avoid duplicate alerts

const alertsListEl = document.getElementById('alerts-list');
const historyListEl = document.getElementById('history-list');
const toastContainer = document.getElementById('toast-container');
const alertBtnDesktop = document.getElementById('btn-alerts');

/**
 * Initialize alert system
 */
export function initAlerts() {
  // Listen for fence check results
  bus.on('fence:checkResults', (results) => {
    results.forEach(result => {
      const prevStatus = previousStatuses[result.cowId];
      previousStatuses[result.cowId] = result.status;

      // Only alert on status change
      if (prevStatus === result.status) return;

      // Import dynamically to avoid circular deps
      import('./simulation.js').then(({ getCow, updateCowStatus }) => {
        const cow = getCow(result.cowId);
        if (!cow) return;

        updateCowStatus(result.cowId, result.status);

        if (result.status === 'danger') {
          addAlert({
            type: 'critical',
            emoji: '🚨',
            message: `Vaca #${cow.number} (${cow.name}) salió de la ${result.fenceName}`,
            cow: cow
          });
        } else if (result.status === 'warning' && prevStatus !== 'danger') {
          addAlert({
            type: 'warning',
            emoji: '⚠️',
            message: `Vaca #${cow.number} (${cow.name}) se acerca al límite de la ${result.fenceName}`,
            cow: cow
          });
        } else if (result.status === 'normal' && prevStatus === 'danger') {
          addAlert({
            type: 'info',
            emoji: '✅',
            message: `Vaca #${cow.number} (${cow.name}) regresó a la ${result.fenceName}`,
            cow: cow
          });
        }
      });
    });
  });

  // Listen for fence creation
  bus.on('fence:created', (fence) => {
    addHistoryEvent({
      type: 'system',
      text: `Cerca "${fence.name}" creada exitosamente`,
      time: new Date()
    });
  });

  // Listen for simulation events
  bus.on('simulation:started', () => {
    addHistoryEvent({
      type: 'system',
      text: 'Simulación iniciada',
      time: new Date()
    });
  });

  bus.on('simulation:stopped', () => {
    addHistoryEvent({
      type: 'system',
      text: 'Simulación pausada',
      time: new Date()
    });
  });

  // Add initial welcome event
  addHistoryEvent({
    type: 'system',
    text: 'Sistema CowBell iniciado. Monitoreo activo.',
    time: new Date()
  });

  // Update relative times every 30 seconds
  setInterval(() => {
    renderAlerts();
    renderHistory();
  }, 30000);
}

/**
 * Add a new alert
 */
function addAlert(alert) {
  const alertData = {
    ...alert,
    id: `alert-${Date.now()}`,
    time: new Date()
  };

  alerts.unshift(alertData);
  alertCount++;

  // Also add to history
  addHistoryEvent({
    type: alert.type === 'critical' ? 'critical' : alert.type === 'warning' ? 'warning' : 'info',
    text: `${alert.emoji} ${alert.message}`,
    time: new Date()
  });

  // Show toast notification
  showToast(alertData);

  // Update badge
  updateAlertBadge();

  // Render alerts list
  renderAlerts();

  // Log to Firebase
  logEvent({
    type: alert.type,
    message: alert.message,
    cowId: alert.cow?.id,
    cowName: alert.cow?.name
  });

  // Emit for other components
  bus.emit('alert:new', alertData);
}

/**
 * Render alerts list (WhatsApp-style)
 */
function renderAlerts() {
  if (!alertsListEl) return;

  if (alerts.length === 0) {
    alertsListEl.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:12px">🔔</div>
        <p>No hay alertas todavía</p>
        <p style="font-size:12px;margin-top:4px">Las alertas aparecerán aquí cuando una vaca salga de su zona segura</p>
      </div>
    `;
    return;
  }

  alertsListEl.innerHTML = alerts.map(alert => `
    <div class="alert-bubble" id="${alert.id}">
      <div class="alert-avatar ${alert.type}">
        ${alert.type === 'critical' ? '🚨' : alert.type === 'warning' ? '⚠️' : '✅'}
      </div>
      <div class="alert-body">
        <div class="alert-message ${alert.type}">
          ${alert.message}
        </div>
        <div class="alert-time">${formatTime(alert.time)} · ${formatRelativeTime(alert.time)}</div>
      </div>
    </div>
  `).join('');

  // Auto-scroll to latest
  alertsListEl.scrollTop = 0;
}

/**
 * Add a history event
 */
function addHistoryEvent(event) {
  history.unshift({
    ...event,
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
  });

  // Keep last 50 events
  if (history.length > 50) history.pop();

  renderHistory();
}

/**
 * Render history list
 */
function renderHistory() {
  if (!historyListEl) return;

  historyListEl.innerHTML = history.map(event => `
    <div class="history-item">
      <div class="history-dot ${event.type}"></div>
      <div class="history-content">
        <div class="history-text">${event.text}</div>
        <div class="history-time">${formatTime(event.time)} · ${formatRelativeTime(event.time)}</div>
      </div>
    </div>
  `).join('');
}

/**
 * Show toast notification
 */
function showToast(alert) {
  const toast = document.createElement('div');
  toast.className = `toast ${alert.type === 'critical' ? '' : alert.type === 'warning' ? 'warning' : 'info'}`;
  toast.innerHTML = `
    <span class="toast-icon">${alert.emoji}</span>
    <span class="toast-text">${alert.message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  toastContainer.appendChild(toast);

  // Auto-remove after 6 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 6000);
}

/**
 * Update alert badge counter
 */
function updateAlertBadge() {
  // Desktop button badge
  const existingBadge = alertBtnDesktop?.querySelector('.badge');
  if (existingBadge) existingBadge.remove();

  if (alertCount > 0 && alertBtnDesktop) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = alertCount > 9 ? '9+' : alertCount;
    alertBtnDesktop.appendChild(badge);
  }

  // Mobile nav badge
  const mobileAlertNav = document.getElementById('nav-alerts-mobile');
  if (mobileAlertNav) {
    const existingDot = mobileAlertNav.querySelector('.badge-dot');
    if (!existingDot && alertCount > 0) {
      const dot = document.createElement('span');
      dot.className = 'badge-dot';
      mobileAlertNav.appendChild(dot);
    }
  }

  // Update stats
  updateStatusStats();
}

/**
 * Update the map stats overlay
 */
function updateStatusStats() {
  import('./simulation.js').then(({ getCattle }) => {
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
  });
}

/**
 * Reset alert count (when panel is opened)
 */
export function resetAlertCount() {
  alertCount = 0;
  const existingBadge = alertBtnDesktop?.querySelector('.badge');
  if (existingBadge) existingBadge.remove();
}

/**
 * Get alerts
 */
export function getAlerts() {
  return alerts;
}

/**
 * Get history
 */
export function getHistory() {
  return history;
}
