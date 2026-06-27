/**
 * SpeechAdaptationAgent — the layer between raw speech recognition and event logging.
 *
 * Responsibilities:
 *   1. Per-command cooldown/debounce — prevents the same event from being logged
 *      twice in quick succession (the main IV Access hallucination path).
 *   2. IV Access false-positive penalty — if the command text does not contain
 *      one of the unambiguous IV phrases, confidence is lowered enough to drop
 *      below STRICT_PROCEDURE_MIN_CONFIDENCE (0.85), blocking auto-execution.
 *   3. Structured debug logging — every utterance through the pipeline is stamped
 *      and stored so developers can audit exactly why a command was accepted or
 *      rejected.
 *
 * This module is purely synchronous. It does NOT call the speech engine,
 * the keyword matcher, or the learning agent — the caller (ActiveCall.jsx)
 * orchestrates those and passes results here for final gating.
 *
 * Pipeline (managed by ActiveCall.handleVoiceCommand):
 *   raw speech text
 *   → [speechProvider]       wake phrase detection
 *   → [voiceCommandMatcher]  keyword / regex match
 *   → [voiceLearningAgent]   learned-phrase prediction
 *   → [HERE]                 cooldown check, IV penalty, debug log
 *   → [ActiveCall]           shouldConfirm() safety gate
 *   → [ActiveCall]           timeline event logged
 */

// ── Cooldown durations (ms) ───────────────────────────────────────────────────
// Prevents the same label from firing twice within its window.
// IV/IO are set high because background speech falsely triggers them most often.
const COOLDOWN_MS = {
  'IV Access':            30_000,
  'IO Access':            30_000,
  'Intubation':           60_000,
  'Defibrillation':       60_000,
  'Cardioversion':        60_000,
  'Efforts Discontinued': 120_000,
  'CPR Started':          120_000,
};
const DEFAULT_COOLDOWN_MS = 10_000;

/**
 * Phrases that unambiguously signal IV Access intent.
 * If NONE of these appear in the command text, we apply IV_PENALTY to the
 * confidence score. This kills phantom IV logs triggered by "I have access",
 * "he has access", "patient access", etc.
 */
const IV_STRICT_PHRASES = [
  'iv access',
  'start iv',
  'establish iv',
  'iv obtained',
  'iv in place',
  'started an iv',
  'iv started',
  'iv line',
  'intravenous',
  'get an iv',
];

/**
 * How much to subtract from IV Access confidence when no strict phrase is found.
 * Keyword hit (0.90) − 0.20 = 0.70 < STRICT_PROCEDURE_MIN_CONFIDENCE (0.85)
 * → command is rejected or requires confirmation, not auto-executed.
 */
const IV_PENALTY = 0.20;

const MAX_DEBUG_ENTRIES = 20;

class SpeechAdaptationAgentClass {
  constructor() {
    /** label → Date.now() of last successful fire */
    this._lastFired = new Map();
    /** Debug log, most-recent first */
    this._debugLog  = [];
  }

  // ── Cooldown ────────────────────────────────────────────────────────────────

  /** True if this label is still within its cooldown window. */
  isCoolingDown(label) {
    const last = this._lastFired.get(label);
    if (!last) return false;
    const ms = COOLDOWN_MS[label] ?? DEFAULT_COOLDOWN_MS;
    return (Date.now() - last) < ms;
  }

  /** Call after a command executes (auto or confirmed) to start its cooldown. */
  recordFired(label) {
    if (label) this._lastFired.set(label, Date.now());
  }

  /** Remaining cooldown in ms; 0 if not cooling. */
  cooldownRemaining(label) {
    const last = this._lastFired.get(label);
    if (!last) return 0;
    const ms = COOLDOWN_MS[label] ?? DEFAULT_COOLDOWN_MS;
    return Math.max(0, ms - (Date.now() - last));
  }

  /** Reset all cooldowns — call at the start of each new call session. */
  resetCooldowns() {
    this._lastFired.clear();
  }

  // ── IV false-positive penalty ────────────────────────────────────────────────

  /**
   * Apply a confidence penalty to IV Access matches that don't contain a clearly
   * intentional IV phrase. Returns the (possibly reduced) confidence number.
   *
   * For all other labels, returns confidence unchanged.
   *
   * @param {string} label        - The matched command label
   * @param {string} transcript   - Post-wake-word command text (already lowercased)
   * @param {number} confidence   - Current confidence score (0–1)
   * @returns {number}            - Adjusted confidence
   */
  applyIvFalsePositivePenalty(label, transcript, confidence) {
    if (label !== 'IV Access') return confidence;
    const t = (transcript || '').toLowerCase();
    const hasStrictPhrase = IV_STRICT_PHRASES.some(p => t.includes(p));
    if (hasStrictPhrase) return confidence;
    return Math.max(0, confidence - IV_PENALTY);
  }

  // ── Debug logging ─────────────────────────────────────────────────────────

  /**
   * Record one utterance's journey through the pipeline.
   *
   * @param {{
   *   commandText:             string,
   *   keywordMatch:            {label:string, confidence:number}|null,
   *   agentPrediction:         {command:string, confidence:number, reason:string}|null,
   *   bestLabel:               string|null,
   *   rawConfidence:           number,
   *   adjustedConfidence:      number,
   *   ivPenaltyApplied:        boolean,
   *   cooldownBlocked:         boolean,
   *   strictProcedureBlocked:  boolean,
   *   confirmationRequired:    boolean,
   *   action: 'execute'|'confirm'|'reject'|'cooldown'|'strict_blocked'|'no_match',
   *   reason:                  string,
   * }} entry
   */
  log(entry) {
    const stamped = { ...entry, ts: Date.now() };
    this._debugLog.unshift(stamped);
    if (this._debugLog.length > MAX_DEBUG_ENTRIES) this._debugLog.pop();

    // Print to console in non-production builds.
    // Production builds (Vite) tree-shake this via import.meta.env.PROD.
    if (!globalThis.__EMIT_SUPPRESS_VOICE_DEBUG__) {
      const flags = [
        entry.ivPenaltyApplied        && '⚠ IV-penalty',
        entry.cooldownBlocked         && '⏱ cooldown',
        entry.strictProcedureBlocked  && '🚫 strict-blocked',
        entry.confirmationRequired    && '❓ confirm',
      ].filter(Boolean).join(' ');

      console.debug(
        `[EMiT Speech] ${(entry.action ?? '?').toUpperCase()}`,
        `"${entry.commandText}"`,
        `→ ${entry.bestLabel ?? 'no match'}`,
        `(raw=${(entry.rawConfidence ?? 0).toFixed(2)}`,
        `adj=${(entry.adjustedConfidence ?? 0).toFixed(2)})`,
        entry.reason ? `| ${entry.reason}` : '',
        flags ? `| ${flags}` : '',
        '\n  keyword:', entry.keywordMatch
          ? `${entry.keywordMatch.label} (${entry.keywordMatch.confidence})` : 'none',
        '\n  agent:', entry.agentPrediction?.command
          ? `${entry.agentPrediction.command} (${entry.agentPrediction.confidence}, ${entry.agentPrediction.reason})` : 'none',
      );
    }
  }

  /** Return a snapshot of the debug log (most-recent first, max 20 entries). */
  getDebugLog() {
    return [...this._debugLog];
  }

  clearDebugLog() {
    this._debugLog = [];
  }
}

export const SpeechAdaptationAgent = new SpeechAdaptationAgentClass();
