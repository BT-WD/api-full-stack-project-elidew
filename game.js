// ============================================================
//  WordChain — game.js
//  Dictionary validation via Free Dictionary API
// ============================================================

import { DictionaryAPI } from './api.js';
import { UI }            from './ui.js';
import { pickRandom, pickWeighted } from './utils.js';

// ── Config ────────────────────────────────────────────────
const GAME_DURATION   = 60;        // seconds
const MIN_WORD_LEN    = 3;
const MAX_WORD_LEN    = 8;
const SCORE_PER_LETTER = 10;       // points per letter in accepted word

// ── State ─────────────────────────────────────────────────
let state = {
  running:       false,
  timeLeft:      GAME_DURATION,
  score:         0,
  streak:        0,
  bestStreak:    0,
  wordsUsed:     [],               // { word, anchorIdx, anchorPos }
  pendingLength: 0,
  anchorLetter:  null,
  anchorPos:     null,             // 'start' | 'end'
  timerInterval: null,
  submitLocked:  false,
};

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  UI.init();

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-submit').addEventListener('click', handleSubmit);
  document.getElementById('word-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });
});

// ── Game lifecycle ─────────────────────────────────────────
function startGame() {
  clearInterval(state.timerInterval);

  state = {
    running:       true,
    timeLeft:      GAME_DURATION,
    score:         0,
    streak:        0,
    bestStreak:    0,
    wordsUsed:     [],
    pendingLength: pickRandom(MIN_WORD_LEN, MAX_WORD_LEN),
    anchorLetter:  null,
    anchorPos:     null,
    timerInterval: null,
    submitLocked:  false,
  };

  UI.showScreen('game');
  UI.updateScore(0);
  UI.updateStreak(0);
  UI.clearChain();
  UI.setFeedback('');
  UI.setPrompt(state.pendingLength, null, null);
  UI.focusInput();
  UI.clearInput();

  state.timerInterval = setInterval(tick, 1000);
  UI.startTimerBar(GAME_DURATION);
}

function tick() {
  state.timeLeft--;
  UI.updateTimer(state.timeLeft, GAME_DURATION);

  if (state.timeLeft <= 0) {
    endGame();
  }
}

function endGame() {
  clearInterval(state.timerInterval);
  state.running = false;
  UI.showScreen('over', {
    score:      state.score,
    words:      state.wordsUsed.length,
    streak:     state.bestStreak,
    wordsUsed:  state.wordsUsed,
  });
}

// ── Submit handler ─────────────────────────────────────────
async function handleSubmit() {
  if (!state.running || state.submitLocked) return;

  const raw = document.getElementById('word-input').value.trim().toLowerCase();

  // Basic checks
  if (!raw) return;

  if (!/^[a-z]+$/.test(raw)) {
    UI.setFeedback('Letters only!', 'error');
    UI.shakeInput();
    return;
  }

  if (raw.length !== state.pendingLength) {
    UI.setFeedback(`Must be exactly ${state.pendingLength} letters.`, 'error');
    UI.shakeInput();
    return;
  }

  // Anchor constraint check
  if (state.anchorLetter) {
    const satisfies =
      (state.anchorPos === 'start' && raw[0] === state.anchorLetter) ||
      (state.anchorPos === 'end'   && raw[raw.length - 1] === state.anchorLetter);

    if (!satisfies) {
      const hint = state.anchorPos === 'start'
        ? `Must START with "${state.anchorLetter.toUpperCase()}"`
        : `Must END with "${state.anchorLetter.toUpperCase()}"`;
      UI.setFeedback(hint, 'error');
      UI.shakeInput();
      return;
    }
  }

  // Duplicate check
  if (state.wordsUsed.some(w => w.word === raw)) {
    UI.setFeedback('Already used!', 'error');
    UI.shakeInput();
    return;
  }

  // API validation
  state.submitLocked = true;
  UI.setFeedback('checking...', '');

  const valid = await DictionaryAPI.validate(raw);

  if (!valid) {
    state.submitLocked = false;
    state.streak = 0;
    UI.updateStreak(0);
    UI.setFeedback('Not in dictionary!', 'error');
    UI.shakeInput();
    return;
  }

  // ── Accepted! ──
  acceptWord(raw);
}

function acceptWord(word) {
  // Pick anchor from this word
  const anchorIdx = pickWeighted(word.length);  // slight bias toward middle
  const anchorPos = Math.random() < 0.5 ? 'start' : 'end';

  // Record
  state.wordsUsed.push({ word, anchorIdx, anchorPos });

  // Score
  const points = word.length * SCORE_PER_LETTER;
  state.score  += points;
  state.streak++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;

  UI.updateScore(state.score);
  UI.updateStreak(state.streak);
  UI.scorePopup(points);
  // crossingIdx: where this word crosses into previous anchor (0 or last letter)
  const crossingIdx = state.anchorPos === 'start' ? 0 : word.length - 1;
  UI.addChainWord(word, crossingIdx, anchorIdx);

  // Next round
  state.anchorLetter  = word[anchorIdx];
  state.anchorPos     = anchorPos;
  state.pendingLength = pickRandom(MIN_WORD_LEN, MAX_WORD_LEN);

  UI.clearInput();
  UI.setFeedback('', 'ok');
  UI.setPrompt(state.pendingLength, state.anchorLetter, state.anchorPos);
  UI.focusInput();

  state.submitLocked = false;
}
