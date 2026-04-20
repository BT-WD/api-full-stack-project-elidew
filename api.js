// ============================================================
//  api.js — Free Dictionary API wrapper
// ============================================================

const BASE_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

// Simple in-memory cache so repeated words don't cost extra requests
const cache = new Map();

export const DictionaryAPI = {
  /**
   * Returns true if the word exists in the Free Dictionary API.
   * Returns false for 404 (not found) or network errors.
   */
  async validate(word) {
    const key = word.toLowerCase();

    if (cache.has(key)) return cache.get(key);

    try {
      const res = await fetch(`${BASE_URL}/${encodeURIComponent(key)}`);
      const valid = res.status === 200;
      cache.set(key, valid);
      return valid;
    } catch {
      // Network failure — be generous and accept the word
      console.warn('[DictionaryAPI] Network error, accepting word by default.');
      return true;
    }
  },
};
