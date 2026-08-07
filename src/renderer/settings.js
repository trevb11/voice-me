/**
 * settings.js
 * Voice Me — Settings panel with theme selection.
 * Persists theme choice in localStorage across sessions.
 */

const THEMES = [
  { id: 'light', label: 'Light', desc: 'Black on light olive & beige' },
  { id: 'dark',  label: 'Dark',  desc: 'White on dark cappuccino'      },
];
const VALID_THEMES = new Set(THEMES.map(t => t.id));
const DEFAULT_THEME = 'light';
// Old builds had bright/studio/rhodes/neon-jazz — fold them into the two survivors.
function normalizeTheme(id) {
  if (VALID_THEMES.has(id)) return id;
  return (id === 'studio' || id === 'rhodes' || id === 'neon-jazz') ? 'dark' : DEFAULT_THEME;
}

// ── Apply theme ────────────────────────────────────────────────────────────

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  localStorage.setItem('voice-me-theme', themeId);
  updateThemeSelection(themeId);
}

function updateThemeSelection(themeId) {
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.theme === themeId);
  });
}

// ── Load persisted theme on startup ────────────────────────────────────────

function loadSavedTheme() {
  const saved = normalizeTheme(localStorage.getItem('voice-me-theme'));
  document.documentElement.setAttribute('data-theme', saved);
  localStorage.setItem('voice-me-theme', saved);
  return saved;
}

// ── Render the panel ───────────────────────────────────────────────────────

function renderSettingsPanel() {
  const list = document.getElementById('theme-list');
  if (!list) return;

  list.innerHTML = THEMES.map(t => `
    <div class="theme-option" data-theme="${t.id}">
      <div class="theme-preview theme-preview-${t.id}"></div>
      <div class="theme-info">
        <div class="theme-name">${t.label}</div>
        <div class="theme-desc">${t.desc}</div>
      </div>
    </div>
  `).join('');

  const currentTheme = normalizeTheme(localStorage.getItem('voice-me-theme'));
  updateThemeSelection(currentTheme);

  list.querySelectorAll('.theme-option').forEach(el => {
    el.addEventListener('click', () => applyTheme(el.dataset.theme));
  });
}

// ── Panel open/close ───────────────────────────────────────────────────────

function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('settings-btn');
  if (!panel || !btn) return;
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
}

function closeSettings() {
  document.getElementById('settings-panel')?.classList.remove('open');
  document.getElementById('settings-btn')?.classList.remove('active');
}

// ── Init ───────────────────────────────────────────────────────────────────

loadSavedTheme();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderSettingsPanel);
} else {
  renderSettingsPanel();
}

document.getElementById('settings-btn')?.addEventListener('click', toggleSettings);

// Close settings on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

// Close settings when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('settings-btn');
  if (!panel?.classList.contains('open')) return;
  if (panel.contains(e.target) || btn.contains(e.target)) return;
  closeSettings();
});

window.VoiceMeSettings = { applyTheme, toggleSettings };