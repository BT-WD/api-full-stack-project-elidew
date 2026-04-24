// ============================================================
//  ui.js — Crossword-style grid UI
// ============================================================

import { updateHighScore } from './storage.js';

const CELL = 52;
const GAP  = 4;
const STEP = CELL + GAP;

const CANVAS_OFFSET = 2000; // logical (0,0) sits 2000px into the large canvas

let grid = {
  cells: new Map(),  // "col,row" → { el, letter, wordIdx }
  words: [],         // [{ word, col, row, dir, anchorIdx }]
};

export const UI = {
  els: {},

  init() {
    this.els = {
      screens:     document.querySelectorAll('.screen'),
      score:       document.getElementById('score'),
      streak:      document.getElementById('streak'),
      timerText:   document.getElementById('timer-text'),
      ringProg:    document.getElementById('ring-progress'),
      promptHint:  document.getElementById('prompt-hint'),
      cwGrid:      document.getElementById('crossword-grid'),
      cwWrap:      document.getElementById('crossword-wrap'),
      input:       document.getElementById('word-input'),
      feedback:    document.getElementById('feedback'),
      finalScore:  document.getElementById('final-score'),
      finalWords:  document.getElementById('final-words'),
      finalStreak: document.getElementById('final-streak'),
      wordList:    document.getElementById('word-list'),
    };

    this.els.input.addEventListener('input', () => {
      this.els.input.value = this.els.input.value.toLowerCase().replace(/[^a-z]/g, '');
    });
  },

  showScreen(name, data = {}) {
    this.els.screens.forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name === 'over') this._fillOver(data);
  },

  updateScore(n)  { this.els.score.textContent  = n; },
  updateStreak(n) { this.els.streak.textContent = n; },

  scorePopup(points) {
    const rect = this.els.input.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'score-pop';
    el.textContent = `+${points}`;
    el.style.left = `${rect.left + rect.width / 2 - 20}px`;
    el.style.top  = `${rect.top - 16}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  },

  startTimerBar(duration) {
    const ring = this.els.ringProg;
    const C = 163.4;
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = '0';
    ring.classList.remove('warning', 'danger');
    this.els.timerText.classList.remove('danger');
    void ring.offsetWidth;
    ring.style.transition = `stroke-dashoffset ${duration}s linear`;
    ring.style.strokeDashoffset = C;
  },

  updateTimer(seconds, total) {
    this.els.timerText.textContent = seconds;
    const pct = seconds / total;
    const ring = this.els.ringProg;
    ring.classList.remove('warning', 'danger');
    this.els.timerText.classList.remove('danger');
    if (pct <= 0.15) {
      ring.classList.add('danger');
      this.els.timerText.classList.add('danger');
    } else if (pct <= 0.35) {
      ring.classList.add('warning');
    }
  },

  setPrompt(length, anchorLetter, anchorPos) {
    if (!anchorLetter) {
      this.els.promptHint.textContent = `Type any ${length}-letter word to start your chain`;
    } else {
      const posWord = anchorPos === 'start' ? 'starts' : 'ends';
      this.els.promptHint.textContent =
        `Type a ${length}-letter word that ${posWord} with "${anchorLetter.toUpperCase()}"`;
    }
  },

  clearInput()  { this.els.input.value = ''; },
  focusInput()  { this.els.input.focus(); },
  shakeInput()  {
    const el = this.els.input;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  },

  setFeedback(msg, type = '') {
    const el = this.els.feedback;
    el.textContent = msg;
    el.className = 'feedback' + (type ? ` ${type}` : '');
  },

  // ── Grid ────────────────────────────────────────────────────

  clearChain() {
    grid.cells.clear();
    grid.words = [];
    this.els.cwGrid.innerHTML = '';
    this._setCamera(0, 0, false);
  },

  // crossingIdx: index in `word` that must land on the previous word's exit anchor cell
  // exitAnchorIdx: index in `word` chosen as the anchor for the NEXT word
  addChainWord(word, crossingIdx, exitAnchorIdx) {
    const wordIdx = grid.words.length;
    const prevWord = wordIdx > 0 ? grid.words[wordIdx - 1] : null;

    // ── 1. Compute placement ──────────────────────────────────
    let col, row, dir;

    if (!prevWord) {
      // First word: horizontal, centred at origin
      col = -Math.floor(word.length / 2);
      row = 0;
      dir = 'h';
      // crossingIdx not used for first word placement
    } else {
      // Perpendicular. crossingIdx cell of new word lands on prev exit anchor.
      const ac = _anchorCell(prevWord);
      dir = prevWord.dir === 'h' ? 'v' : 'h';
      if (dir === 'h') {
        col = ac.col - crossingIdx;
        row = ac.row;
      } else {
        col = ac.col;
        row = ac.row - crossingIdx;
      }
    }

    // anchorIdx stored is the EXIT anchor (for next word placement)
    const wordEntry = { word, col, row, dir, anchorIdx: exitAnchorIdx !== undefined ? exitAnchorIdx : crossingIdx, crossingIdx, wordIdx };
    grid.words.push(wordEntry);

    // ── 2. Hide word older than 2 generations (wordIdx - 2) ──
    //    We remove its cells entirely UNLESS that cell is also
    //    owned by a more recent word (checked via cell.wordIdx).
    const removeIdx = wordIdx - 2;
    if (removeIdx >= 0) {
      _removeCellsForWord(grid.words[removeIdx], wordIdx);
    }

    // ── 3. Dim the word that is now 1 generation old ──────────
    //    (was active, becomes faded)
    if (prevWord) {
      _fadeCellsForWord(prevWord, wordIdx);
    }

    // ── 4. Paint the new word ─────────────────────────────────
    _paintWord(wordEntry, this.els.cwGrid);

    // ── 5. Pan camera to midpoint of new word ─────────────────
    const midIdx = Math.floor(word.length / 2);
    const camCol = dir === 'h' ? col + midIdx : col;
    const camRow = dir === 'v' ? row + midIdx : row;
    this._setCamera(camCol, camRow, wordIdx > 0);
  },

  _setCamera(camCol, camRow, animate) {
    const wrap = this.els.cwWrap;
    const ww = wrap.clientWidth  || wrap.offsetWidth  || window.innerWidth;
    const wh = wrap.clientHeight || wrap.offsetHeight || 300;

    const cellPxX = CANVAS_OFFSET + camCol * STEP;
    const cellPxY = CANVAS_OFFSET + camRow * STEP;
    const tx = ww / 2 - cellPxX - CELL / 2;
    const ty = wh / 2 - cellPxY - CELL / 2;

    const g = this.els.cwGrid;
    g.style.transition = animate
      ? 'transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      : 'none';
    g.style.transform = `translate(${tx}px, ${ty}px)`;
  },

  _fillOver({ score, words, streak, wordsUsed }) {
    this.els.finalScore.textContent  = score;
    this.els.finalWords.textContent  = words;
    this.els.finalStreak.textContent = streak;

    // update persistent high score
    try { updateHighScore(Number(score)); } catch (e) { /* ignore */ }

    this.els.wordList.innerHTML = '';
    (wordsUsed || []).forEach(({ word, anchorIdx }) => {
      const chip = document.createElement('div');
      chip.className = 'wl-chip';
      chip.innerHTML = [...word].map((ch, i) =>
        i === anchorIdx ? `<span class="wl-anchor">${ch}</span>` : ch
      ).join('');
      this.els.wordList.appendChild(chip);
    });
  },
};

// ── Internal helpers ─────────────────────────────────────────

function _key(col, row) { return `${col},${row}`; }

function _anchorCell({ col, row, dir, anchorIdx }) {
  return {
    col: dir === 'h' ? col + anchorIdx : col,
    row: dir === 'v' ? row + anchorIdx : row,
  };
}

// Iterate every cell position belonging to a word entry.
function _iterCells(wordEntry, cb) {
  const { word, col, row, dir } = wordEntry;
  for (let i = 0; i < word.length; i++) {
    const c = dir === 'h' ? col + i : col;
    const r = dir === 'v' ? row + i : row;
    cb(c, r, i);
  }
}

// Fade cells of `wordEntry` that are still owned by it (not re-claimed
// by a newer word).  currentLatestIdx = index of the word being added now.
function _fadeCellsForWord(wordEntry, currentLatestIdx) {
  _iterCells(wordEntry, (c, r) => {
    const entry = grid.cells.get(_key(c, r));
    // Only fade if this cell is still "owned" by this word
    if (entry && entry.wordIdx === wordEntry.wordIdx) {
      entry.el.classList.remove('active', 'anchor');
      entry.el.classList.add('faded');
    }
  });
}

// Remove cells belonging to `wordEntry` that haven't been reclaimed
// by any word newer than removeIdx.
function _removeCellsForWord(wordEntry, currentLatestIdx) {
  _iterCells(wordEntry, (c, r) => {
    const k = _key(c, r);
    const entry = grid.cells.get(k);
    if (!entry) return;
    // Only remove if still owned by this (old) word
    if (entry.wordIdx === wordEntry.wordIdx) {
      entry.el.remove();
      grid.cells.delete(k);
    }
  });
}

function _paintWord(wordEntry, container) {
  const { word, col, row, dir, crossingIdx, wordIdx } = wordEntry;

  for (let i = 0; i < word.length; i++) {
    const c = dir === 'h' ? col + i : col;
    const r = dir === 'v' ? row + i : row;
    const k = _key(c, r);
    // The crossing cell (shared with previous word) gets the dark anchor style
    const isAnchor = i === crossingIdx;
    const letter = word[i].toUpperCase();

    const px = CANVAS_OFFSET + c * STEP;
    const py = CANVAS_OFFSET + r * STEP;

    const existing = grid.cells.get(k);

    if (existing) {
      // ── Cell already exists (shared crossing letter) ──
      // ALWAYS update letter to the new word's letter at this position.
      // This fixes the stale-letter bug.
      existing.el.textContent = letter;
      existing.el.classList.remove('faded', 'ghost');
      existing.el.classList.add('active');
      if (isAnchor) existing.el.classList.add('anchor');
      // Re-claim ownership so removal logic works correctly
      existing.wordIdx = wordIdx;
    } else {
      // ── Create a new cell ──
      const el = document.createElement('div');
      el.className = 'cw-cell active' + (isAnchor ? ' anchor' : '');
      el.textContent = letter;
      el.style.left = `${px}px`;
      el.style.top  = `${py}px`;
      el.style.transitionDelay = `${i * 50}ms`;
      container.appendChild(el);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.classList.add('visible');
        setTimeout(() => { el.style.transitionDelay = '0ms'; }, i * 50 + 420);
      }));

      grid.cells.set(k, { el, letter: word[i], wordIdx });
    }
  }
}
