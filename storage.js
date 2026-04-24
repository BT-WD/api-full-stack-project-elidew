/**
 * storage.js — lightweight localStorage helpers for high score
 */
const HS_KEY = 'wordchainHighScore';

export function getHighScore() {
  const raw = localStorage.getItem(HS_KEY);
  return raw === null ? 0 : Math.max(0, Number(raw) || 0);
}

export function setHighScore(score) {
  if (!Number.isFinite(score)) return;
  localStorage.setItem(HS_KEY, String(Math.floor(score)));
}

export function updateHighScore(currentScore) {
  const prev = getHighScore();
  const score = Number(currentScore) || 0;
  if (score > prev) {
    setHighScore(score);
    renderHighScore(score);
    return true;
  }
  renderHighScore(prev);
  return false;
}

export function renderHighScore(score) {
  const el = document.getElementById('high-score');
  if (el) el.textContent = String(score);
}

// Initialize UI value on load
document.addEventListener('DOMContentLoaded', () => {
  renderHighScore(getHighScore());
});