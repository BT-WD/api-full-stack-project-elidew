// ============================================================
//  ui.js — Crossword-style grid UI
//
//  Grid coordinate system: each cell occupies one (col, row)
//  on an infinite logical grid. The CSS grid is absolutely
//  positioned elements inside .crossword-grid, which is
//  translated so the active word stays centred in the viewport.
// ============================================================

const CELL = 52;   // px — must match --cell-size in CSS
const GAP  = 4;    // px gap between cells (border accounted for separately)
const STEP = CELL + GAP;

// ── Internal state ───────────────────────────────────────────
let grid = {
  cells: new Map(),      // "col,row" → { el, letter, wordIdx }
  words: [],             // [{ word, col, row, dir, anchorIdx }]
  // camera offset so active word stays centred
  camCol: 0,
  camRow: 0,
};

// ── Public API ───────────────────────────────────────────────
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
      input:       document.getElementById('word-input'),
      feedback:    document.getElementById('feedback'),
      finalScore:  document.getElementById('final-score'),
      finalWords:  document.getElementById('final-words'),
      finalStreak: document.getElementById('final-streak'),
      wordList:    document.getElementById('word-list'),
    };
    // keep input lowercase only
    this.els.input.addEventListener('input', () => {
      this.els.input.value = this.els.input.value.toLowerCase().replace(/[^a-z]/g, '');
    });
  },

  showScreen(name, data = {}) {
    this.els.screens.forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name === 'over') this._fillOver(data);
  },

  // ── Score / Streak ──────────────────────────────────────────
  updateScore(n)  { this.els.score.textContent  = n; },
  updateStreak(n) { this.els.streak.textContent = n; },

  scorePopup(points) {
    const rect = this.els.input.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'score-pop';
    el.textContent = `+${points}`;
    el.style.left = `${rect.left + rect.width / 2 - 20}px`;
    el.style.top  = `${rect.top - 10}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  },

  // ── Timer ───────────────────────────────────────────────────
  startTimerBar(duration) {
    const ring = this.els.ringProg;
    const C = 163.4; // 2π×26
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

  // ── Prompt ──────────────────────────────────────────────────
  setPrompt(length, anchorLetter, anchorPos) {
    if (!anchorLetter) {
      this.els.promptHint.textContent =
        `Type any ${length}-letter word to start your chain`;
      return;
    }
    const posWord = anchorPos === 'start' ? 'starts' : 'ends';
    this.els.promptHint.textContent =
      `Type a ${length}-letter word that ${posWord} with "${anchorLetter.toUpperCase()}"`;
  },

  // ── Input ───────────────────────────────────────────────────
  clearInput()  { this.els.input.value = ''; },
  focusInput()  { this.els.input.focus(); },
  shakeInput()  {
    const el = this.els.input;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
  },

  // ── Feedback ────────────────────────────────────────────────
  setFeedback(msg, type = '') {
    const el = this.els.feedback;
    el.textContent = msg;
    el.className = 'feedback' + (type ? ` ${type}` : '');
  },

  // ── Crossword grid ───────────────────────────────────────────

  clearChain() {
    grid.cells.clear();
    grid.words = [];
    grid.camCol = 0;
    grid.camRow = 0;
    this.els.cwGrid.innerHTML = '';
    this._reframe(0, 0, 0, 0, false);
  },

  /**
   * Called after a word is accepted.
   * Lays the new word on the grid, fades the previous active cells,
   * and re-centres the view.
   */
  addChainWord(word, anchorIdx) {
    const wordIdx = grid.words.length;
    const prevWord = wordIdx > 0 ? grid.words[wordIdx - 1] : null;

    // Determine placement
    let col, row, dir;

    if (!prevWord) {
      // First word: horizontal, centred at origin
      col = 0;
      row = 0;
      dir = 'h';
    } else {
      // The anchor cell of the PREVIOUS word determines where this word attaches
      const anchorCell = _getAnchorCell(prevWord);
      const prevDir = prevWord.dir;

      // New word goes perpendicular to the previous
      dir = prevDir === 'h' ? 'v' : 'h';

      // Place so that anchorIdx of the new word lands on anchorCell
      if (dir === 'h') {
        col = anchorCell.col - anchorIdx;
        row = anchorCell.row;
      } else {
        col = anchorCell.col;
        row = anchorCell.row - anchorIdx;
      }
    }

    const wordEntry = { word, col, row, dir, anchorIdx };
    grid.words.push(wordEntry);

    // Fade previous word's cells (but keep anchor cell highlighted)
    if (prevWord) {
      _fadePrevWord(prevWord, grid.cells);
    }

    // Paint new cells
    _paintWord(wordEntry, wordIdx, grid.cells, this.els.cwGrid);

    // Re-centre view on new word's midpoint
    const midIdx = Math.floor(word.length / 2);
    const midCol = dir === 'h' ? col + midIdx : col;
    const midRow = dir === 'v' ? row + midIdx : row;
    this._reframe(midCol, midRow, col, row, true);
  },

  // ── Private ──────────────────────────────────────────────────

  _reframe(camCol, camRow, wordCol, wordRow, animate) {
    grid.camCol = camCol;
    grid.camRow = camRow;

    const wrap = this.els.cwGrid.parentElement;
    const ww = wrap.offsetWidth;
    const wh = wrap.offsetHeight;

    // Translate grid so camCol,camRow appears in the centre of the wrap
    const tx = ww / 2 - camCol * STEP - CELL / 2;
    const ty = wh / 2 - camRow * STEP - CELL / 2;

    const gridEl = this.els.cwGrid;
    if (animate) {
      gridEl.style.transition = 'transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    } else {
      gridEl.style.transition = 'none';
    }
    gridEl.style.transform = `translate(${tx}px, ${ty}px)`;
  },

  _fillOver({ score, words, streak, wordsUsed }) {
    this.els.finalScore.textContent  = score;
    this.els.finalWords.textContent  = words;
    this.els.finalStreak.textContent = streak;

    this.els.wordList.innerHTML = '';
    wordsUsed.forEach(({ word, anchorIdx }) => {
      const chip = document.createElement('div');
      chip.className = 'wl-chip';
      chip.innerHTML = [...word].map((ch, i) =>
        i === anchorIdx
          ? `<span class="wl-anchor">${ch}</span>`
          : ch
      ).join('');
      this.els.wordList.appendChild(chip);
    });
  },
};

// ── Grid helpers ─────────────────────────────────────────────

function _key(col, row) { return `${col},${row}`; }

function _getAnchorCell(wordEntry) {
  const { col, row, dir, anchorIdx } = wordEntry;
  return {
    col: dir === 'h' ? col + anchorIdx : col,
    row: dir === 'v' ? row + anchorIdx : row,
  };
}

function _fadePrevWord(prevWord, cells) {
  const { word, col, row, dir, anchorIdx } = prevWord;
  for (let i = 0; i < word.length; i++) {
    const c = dir === 'h' ? col + i : col;
    const r = dir === 'v' ? row + i : row;
    const k = _key(c, r);
    const entry = cells.get(k);
    if (!entry) continue;

    // Keep the anchor cell as-is (it'll be shared / overdrawn by new word)
    if (i === anchorIdx) continue;

    entry.el.classList.remove('active');
    entry.el.classList.add('faded');
  }
}

function _paintWord(wordEntry, wordIdx, cells, container) {
  const { word, col, row, dir, anchorIdx } = wordEntry;

  for (let i = 0; i < word.length; i++) {
    const c = dir === 'h' ? col + i : col;
    const r = dir === 'v' ? row + i : row;
    const k = _key(c, r);
    const letter = word[i];
    const isAnchor = (i === anchorIdx);

    let entry = cells.get(k);

    if (entry) {
      // Cell already exists (shared anchor). Update classes.
      entry.el.classList.remove('faded', 'ghost');
      entry.el.classList.add('active');
      if (isAnchor) entry.el.classList.add('anchor');
      // letter should already match — skip inner text update
    } else {
      // Create new cell element
      const el = document.createElement('div');
      el.className = 'cw-cell active' + (isAnchor ? ' anchor' : '');
      el.textContent = letter.toUpperCase();
      el.style.left = `${c * STEP}px`;
      el.style.top  = `${r * STEP}px`;

      // Stagger reveal: cells appear one by one along the word
      const delay = i * 55;
      el.style.transitionDelay = `${delay}ms`;

      container.appendChild(el);

      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('visible');
          // Clear delay after animation so fading works promptly later
          setTimeout(() => { el.style.transitionDelay = '0ms'; }, delay + 400);
        });
      });

      entry = { el, letter, wordIdx };
      cells.set(k, entry);
    }
  }
}
