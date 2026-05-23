/**
 * VoiceLearningAgent — adaptive voice learning for EMiT commands.
 *
 * ── Privacy ───────────────────────────────────────────────────────────────────
 * No audio recordings are stored. Only lowercase text transcripts and
 * confidence scores are persisted, in localStorage under 'emit_voice_learning'.
 * Audio is never uploaded to any server by this module.
 * Call VoiceLearningAgent.clearAllData() to erase everything permanently.
 *
 * ── How learning improves accuracy ───────────────────────────────────────────
 * Every time the user says a command (whether in Training Mode or normal use)
 * and it is successfully matched, learn() records the transcript variant.
 * Frequently-confirmed phrases get a small confidence boost.
 * Misrecognitions (what was heard vs. what was intended) are tracked so the
 * agent can deprioritize ambiguous patterns.
 *
 * ── Confidence scoring pipeline ──────────────────────────────────────────────
 * predictCommand() scores a transcript against all known commands:
 *   1. Learned phrase exact / substring / phonetic match
 *   2. Built-in keyword substring match
 *   3. Edit-distance fuzzy match (phonetically normalized)
 *   4. Usage frequency boost (up to +12 %)
 * The result includes needsConfirmation based on command risk level and score.
 */

const STORAGE_KEY = 'emit_voice_learning';

/** Minimum score to consider any match valid. Below this → no prediction. */
const MIN_CONFIDENCE = 0.35;

/**
 * Below this score, show "Did you mean X?" — even for non-dangerous commands.
 * Commands that clear this bar AND are not in CONFIRMATION_REQUIRED_COMMANDS
 * will execute automatically.
 */
export const CONFIRMATION_CONFIDENCE_THRESHOLD = 0.72;

/**
 * These commands ALWAYS require an explicit user tap before executing,
 * regardless of confidence. They are irreversible or carry extreme clinical risk.
 */
export const CONFIRMATION_REQUIRED_COMMANDS = new Set([
  'Defibrillation',
  'Cardioversion',
  'Efforts Discontinued',
]);

/**
 * These commands require HIGH confidence (≥ CONFIRMATION_CONFIDENCE_THRESHOLD)
 * before auto-executing. Below threshold → show "Did you mean X?" confirmation.
 * Includes all medications, ROSC, and cardiac rhythm changes.
 */
export const HIGH_CONFIDENCE_REQUIRED_COMMANDS = new Set([
  // Medications
  'Epinephrine', 'Dirty Epi Drip', 'Fentanyl', 'Ketamine', 'Ativan', 'Versed',
  'Morphine', 'Adenosine', 'Amiodarone', 'Aspirin', 'Narcan', 'Dextrose', 'Nitro',
  'Albuterol', 'Ofirmev', 'Fluid Bolus',
  // Critical outcomes
  'ROSC',
  // Rhythms
  'V-Fib', 'V-Tach', 'PEA', 'Asystole', 'Normal Sinus', 'A-Fib', 'SVT', 'Bradycardia',
]);

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { commands: {}, totalInteractions: 0 };
  } catch {
    return { commands: {}, totalInteractions: 0 };
  }
}

function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

/** Normalized Levenshtein distance: 0 = completely different, 1 = identical. */
function editDistanceSimilarity(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

/**
 * Reduce a string to a phonetic skeleton by collapsing common sound-alike
 * patterns. This helps match "fib" with "v fib", "epi" with "epinephrine", etc.
 */
function phonetify(s) {
  return s.toLowerCase()
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/ae/g, 'e')
    .replace(/tion/g, 'shun').replace(/ous/g, 'us').replace(/ght/g, 't')
    .replace(/[aeiou]+/g, 'a')   // collapse all vowel runs
    .replace(/(.)\1+/g, '$1');   // collapse repeated consonants
}

/** Score how well a transcript matches a target phrase: 0–1. */
function phraseScore(transcript, target) {
  const t = transcript.toLowerCase().trim();
  const tgt = target.toLowerCase().trim();
  if (!t || !tgt) return 0;

  if (t === tgt) return 1.0;
  if (t.includes(tgt) || tgt.includes(t)) return 0.92;

  const tPhon = phonetify(t), tgtPhon = phonetify(tgt);
  if (tPhon === tgtPhon || tPhon.includes(tgtPhon) || tgtPhon.includes(tPhon)) return 0.85;

  // Word-overlap score — partial phrase matches (accent, speed, truncation)
  const tWords = t.split(/\s+/);
  const tgtWords = tgt.split(/\s+/);
  const matchedWords = tWords.filter(w =>
    tgtWords.some(tw => tw === w || editDistanceSimilarity(w, tw) > 0.75)
  );
  if (matchedWords.length > 0) {
    const wordScore = matchedWords.length / Math.max(tWords.length, tgtWords.length);
    if (wordScore >= 0.5) return 0.55 + wordScore * 0.28;
  }

  // Phonetic edit-distance fallback
  const edScore = editDistanceSimilarity(tPhon, tgtPhon);
  return edScore > 0.55 ? edScore * 0.65 : 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

class VoiceLearningAgentClass {
  /**
   * Record the outcome of a recognition attempt.
   *
   * Call this after every successful command — whether triggered automatically
   * or confirmed by the user — so the agent improves from normal app usage.
   *
   * @param {string} command            - Command label ('Epinephrine') or type ('cpr', 'rosc')
   * @param {URL|null} audioURL         - Reserved; audio is NOT stored or uploaded here
   * @param {string} expectedTranscript - The text the user intended (what was heard or corrected)
   * @param {string|null} recognizedTranscript - Raw engine output (for misrecognition tracking)
   * @param {number} confidence         - Provider confidence for this result (0–1)
   */
  learn(command, audioURL, expectedTranscript, recognizedTranscript, confidence) {
    if (!command || !expectedTranscript) return;
    const data = loadData();
    const key = command.toLowerCase().replace(/[^a-z0-9]/g, '_');

    if (!data.commands[key]) {
      data.commands[key] = { label: command, phrases: [], misrecognitions: [], successCount: 0 };
    }
    const entry = data.commands[key];

    const phraseText = expectedTranscript.toLowerCase().trim();
    const existing = entry.phrases.find(p => p.text === phraseText);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = Date.now();
      // Weighted running average of confidence scores
      existing.avgConfidence = ((existing.avgConfidence ?? confidence) + confidence) / 2;
    } else {
      entry.phrases.push({ text: phraseText, count: 1, lastSeen: Date.now(), avgConfidence: confidence });
    }

    // Track misrecognitions: what the engine heard vs. what was intended
    if (recognizedTranscript) {
      const wrong = recognizedTranscript.toLowerCase().trim();
      if (wrong !== phraseText) {
        const mis = entry.misrecognitions.find(m => m.wrong === wrong);
        if (mis) { mis.count++; } else { entry.misrecognitions.push({ wrong, count: 1 }); }
      }
    }

    entry.successCount = (entry.successCount || 0) + 1;
    data.totalInteractions = (data.totalInteractions || 0) + 1;
    saveData(data);
  }

  /**
   * Record that a recognition was WRONG — the user marked an event as
   * incorrectly interpreted in the Event Log.
   *
   * Effects:
   *   - Decrements (or removes) any learned phrase under `label` that matches
   *     the transcript, so we stop reinforcing the bad mapping.
   *   - Logs the transcript as a misrecognition under `label` for diagnostics.
   *   - Decrements successCount so this command is less heavily weighted.
   *
   * Pass an empty/null transcript when the event was added via button (we still
   * remove the entry from the log, but there's nothing for the agent to learn).
   *
   * @param {string} label       - The (wrong) command label that was triggered
   * @param {string|null} transcript - The original spoken phrase, if any
   */
  recordIncorrectMatch(label, transcript) {
    if (!label) return;
    const data = loadData();
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const entry = data.commands[key];
    if (!entry) return;

    if (transcript) {
      const phraseText = transcript.toLowerCase().trim();

      // Find any learned phrase that matches this transcript and weaken it
      const idx = entry.phrases.findIndex(p => p.text === phraseText);
      if (idx >= 0) {
        const phrase = entry.phrases[idx];
        phrase.count = Math.max(0, (phrase.count || 1) - 2); // strong penalty
        if (phrase.count === 0) {
          entry.phrases.splice(idx, 1); // forget the bad mapping entirely
        }
      }

      // Track as a misrecognition for diagnostics / Training Mode display
      const mis = entry.misrecognitions.find(m => m.wrong === phraseText);
      if (mis) { mis.count++; } else { entry.misrecognitions.push({ wrong: phraseText, count: 1 }); }
    }

    entry.successCount = Math.max(0, (entry.successCount || 0) - 1);
    saveData(data);
  }

  /**
   * Predict which EMiT command the user most likely said.
   *
   * @param {string} transcript
   *   Recognized speech after the wake word has been stripped.
   * @param {Array<{label: string, keywords: string[]}>} knownCommands
   *   All valid command definitions (built from COMMAND_MAP + special commands).
   * @param {Object|null} audioFeatures
   *   Reserved for future use (accent detection, speaking rate, etc.).
   *
   * @returns {{ command: string|null, confidence: number, reason: string, needsConfirmation: boolean }}
   */
  predictCommand(transcript, knownCommands = [], audioFeatures = null) {
    const data = loadData();
    const t = transcript.toLowerCase().trim();
    let bestScore = 0;
    let bestLabel = null;
    let scoreSource = '';

    // 1. Score against learned phrase variants (highest weight)
    for (const [, entry] of Object.entries(data.commands)) {
      for (const phrase of (entry.phrases || [])) {
        const s = phraseScore(t, phrase.text);
        // Frequency boost: phrases confirmed more often get up to +12% confidence
        const freqBoost = Math.min((phrase.count || 1) / 25, 0.12);
        const total = Math.min(s + freqBoost, 1.0);
        if (total > bestScore) {
          bestScore = total;
          bestLabel = entry.label;
          scoreSource = 'learned';
        }
      }
    }

    // 2. Score against built-in keyword definitions
    for (const cmd of knownCommands) {
      for (const kw of (cmd.keywords || [])) {
        const s = phraseScore(t, kw);
        if (s > bestScore) {
          bestScore = s;
          bestLabel = cmd.label;
          scoreSource = 'keyword';
        }
      }
    }

    if (bestScore < MIN_CONFIDENCE || !bestLabel) {
      return { command: null, confidence: 0, reason: 'no_match', needsConfirmation: false };
    }

    const needsConfirmation =
      CONFIRMATION_REQUIRED_COMMANDS.has(bestLabel) ||
      (HIGH_CONFIDENCE_REQUIRED_COMMANDS.has(bestLabel) && bestScore < CONFIRMATION_CONFIDENCE_THRESHOLD) ||
      bestScore < CONFIRMATION_CONFIDENCE_THRESHOLD;

    return {
      command: bestLabel,
      confidence: Math.round(bestScore * 100) / 100,
      reason: scoreSource,
      needsConfirmation,
    };
  }

  /** Return all stored learning data (for Training Mode display). */
  getLearningData() {
    return loadData().commands;
  }

  /** Total voice interactions recorded across all sessions. */
  getTotalInteractions() {
    return loadData().totalInteractions || 0;
  }

  /**
   * Delete all learned voice data.
   * This removes only the text transcripts stored by this agent.
   * No audio files exist to delete — the agent never stores audio.
   */
  clearAllData() {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const VoiceLearningAgent = new VoiceLearningAgentClass();
