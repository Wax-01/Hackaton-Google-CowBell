// ============================================
// COWBELL - Cattle Panel UI
// ============================================

import { bus, formatTime } from './utils.js';
import { getCattle } from './simulation.js';
import { centerOnCow } from './map.js';

const cattleListEl = document.getElementById('cattle-list');

/**
 * Initialize cattle panel
 */
export function initCattlePanel() {
  renderCattleList();

  // Update on every tick
  bus.on('simulation:tick', () => {
    renderCattleList();
  });

  // Highlight selected cow
  bus.on('cow:selected', (cow) => {
    highlightCow(cow.id);
  });
}

/**
 * Render the full cattle list
 */
function renderCattleList() {
  const cattle = getCattle();

  // Sort: danger first, then warning, then normal
  const sorted = [...cattle].sort((a, b) => {
    const order = { danger: 0, warning: 1, normal: 2 };
    return (order[a.status] || 2) - (order[b.status] || 2);
  });

  cattleListEl.innerHTML = sorted.map(cow => `
    <div class="cattle-card status-${cow.status}" data-cow-id="${cow.id}" id="cattle-card-${cow.id}">
      <div class="cattle-card-header">
        <div class="cattle-name">
          <span class="cow-emoji" style="width:8px;height:8px;border-radius:50%;background:var(--primary,#1B7A3D);display:inline-block"></span>
          ${cow.name} <span style="color:var(--text-muted);font-weight:400">#${cow.number}</span>
        </div>
        <span class="status-badge ${cow.status}">
          ${getStatusLabel(cow.status)}
        </span>
      </div>
      <div class="cattle-stats">
        <div class="cattle-stat">
          <span class="stat-icon" style="font-size:11px;font-weight:600">T°</span>
          <span class="stat-val">${cow.temperature}°C</span>
        </div>
        <div class="cattle-stat">
          <span class="stat-icon" style="font-size:11px;font-weight:600">HR</span>
          <span class="stat-val">${cow.heartRate} bpm</span>
        </div>
        <div class="cattle-stat">
          <span class="stat-icon" style="font-size:11px;font-weight:600">Act</span>
          <span class="stat-val">${cow.activity}</span>
        </div>
        <div class="cattle-stat">
          <span class="stat-icon" style="font-size:11px;font-weight:600">Loc</span>
          <span class="stat-val">${cow.fenceId ? 'OK' : '—'}</span>
        </div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  cattleListEl.querySelectorAll('.cattle-card').forEach(card => {
    card.addEventListener('click', () => {
      const cowId = card.dataset.cowId;
      centerOnCow(cowId);
      highlightCow(cowId);

      // On mobile, close cattle panel and show map
      if (window.innerWidth < 1024) {
        closeCattlePanel();
      }
    });
  });
}

/**
 * Highlight a cow card
 */
function highlightCow(cowId) {
  cattleListEl.querySelectorAll('.cattle-card').forEach(card => {
    card.style.outline = card.dataset.cowId === cowId
      ? '2px solid var(--primary)'
      : 'none';
  });
}

/**
 * Get status label
 */
function getStatusLabel(status) {
  const labels = {
    normal: 'Normal',
    warning: 'Alerta',
    danger: 'Fuera'
  };
  return labels[status] || 'Normal';
}

/**
 * Close cattle panel (mobile)
 */
function closeCattlePanel() {
  const panel = document.getElementById('cattle-panel');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('open');
  overlay.classList.remove('active');
}
