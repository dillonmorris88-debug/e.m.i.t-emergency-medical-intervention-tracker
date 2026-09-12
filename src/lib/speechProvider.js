/**
 * SpeechRecognitionProvider — abstraction layer for speech recognition backends.
 *
 * ── Active provider: WhisperProvider ──────────────────────────────────────────
 *   Recognition mode: CLOUD (whisper-api)
 *   Engine: OpenAI Whisper v1 via /v1/audio/transcriptions
 *
 *   Architecture:
 *     Raw PCM samples are captured straight from the microphone through the
 *     Web Audio graph (no MediaRecorder). An adaptive VAD tracks the room's
 *     noise floor and detects speech segments on the same samples. When speech
 *     ends, the segment — including a short PRE-ROLL before speech was
 *     confirmed — is resampled to 16 kHz mono and encoded as a WAV file.
 *
 *     Why not MediaRecorder: a timesliced recorder only writes the container
 *     header (WebM EBML / MP4 init segment) into its FIRST chunk. Once the
 *     rolling buffer trimmed that chunk, every later utterance was uploaded as
 *     a headerless fragment that Whisper either rejected or mis-decoded — the
 *     main source of "works once, then gets flaky". WAV segments are always
 *     self-contained and decode identically on every browser, including iOS.
 *
 *   Whisper is asked for verbose_json so each result carries real per-segment
 *   confidence (avg_logprob) and no_speech_prob. These are used to discard
 *   hallucinations on noise ("thank you", prompt echoes) and are passed on as
 *   the utterance's recognition confidence.
 *
 *   Wake word: "EMIT" (and variants). Transcripts are normalized (punctuation,
 *   acronyms like "E.M.I.T.") before matching. Known variants match anywhere
 *   as whole words; a fuzzy match (edit distance 1) is accepted for the first
 *   non-filler word, so mis-hears like "emet" or "emt" still trigger.
 *
 *   Requirements: OpenAI API key stored in localStorage under 'emit_whisper_key'
 *
 * ── Fallback: WebSpeechProvider ──────────────────────────────────────────────
 *   Used automatically when no Whisper API key is configured.
 *   Recognition mode: OFFLINE (browser-native Web Speech API)
 *
 *   Switch providers via setWhisperApiKey() / getWhisperApiKey().
 */

import { isSpeakingSuppressed } from './speak.js';
import { matchVoiceCommand } from './voiceCommandMatcher.js';

const WHISPER_KEY_STORAGE = 'emit_whisper_key';

/** Read the stored Whisper API key. Returns '' if not set. */
export function getWhisperApiKey() {
  try { return localStorage.getItem(WHISPER_KEY_STORAGE) || ''; } catch { return ''; }
}

/** Persist the Whisper API key. Pass '' or null to clear (revert to WebSpeech). */
export function setWhisperApiKey(key) {
  try {
    if (key) { localStorage.setItem(WHISPER_KEY_STORAGE, key.trim()); }
    else      { localStorage.removeItem(WHISPER_KEY_STORAGE); }
  } catch {}
}

// ── Transcript normalization ─────────────────────────────────────────────────

/**
 * Normalize engine output so wake-word detection and keyword matching see the
 * same text regardless of how the engine punctuated it:
 *   "E.M.I.T., start CPR."  → "emit start cpr"
 *   "Emit — V-fib"          → "emit v fib"
 *   "O'Firmev given"        → "ofirmev given"
 */
export function normalizeTranscript(text) {
  return (text || '')
    .toLowerCase()
    // Collapse dotted acronyms: "e.m.i.t." → "emit", "i.v." → "iv".
    .replace(/\b(?:[a-z]\.){2,}[a-z]?\.?/g, (m) => m.replace(/\./g, ''))
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Wake-word matching ───────────────────────────────────────────────────────

/** Levenshtein edit distance between two short strings. */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array(m + 1);
  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      curr[i] = Math.min(
        curr[i - 1] + 1,
        prev[i] + 1,
        prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// Single-token spellings engines produce for "EMIT". Matched anywhere.
const WAKE_TOKENS = new Set([
  'emit', 'emmet', 'emmett', 'emmit', 'emmitt', 'emitt', 'emet', 'amit', 'imit',
]);
// Two-token splits ("e mit"). Matched anywhere.
const WAKE_PAIRS = new Set(['e mit', 'e mitt', 'a mit', 'a mitt', 'e met']);
// Fuzzy targets, only for the first non-filler word of an utterance.
const WAKE_FUZZY_TARGETS = ['emit', 'emmet'];
// Real words within edit distance 1 of a target that must never wake the app.
const WAKE_FUZZY_BLOCKLIST = new Set(['edit', 'exit', 'emil', 'emits']);
// Words people (or engines) put before the wake word.
const LEADING_FILLERS = new Set(['hey', 'hi', 'ok', 'okay', 'so', 'um', 'uh', 'and', 'alright']);

/**
 * Detect a wake word in a NORMALIZED transcript.
 * Returns { command } — the text after the wake word ('' if none) — or null.
 */
export function detectWakeWord(text) {
  const tokens = text ? text.split(' ') : [];

  // 1. Known spellings, anywhere in the utterance.
  for (let i = 0; i < tokens.length; i++) {
    if (WAKE_TOKENS.has(tokens[i])) {
      return { command: tokens.slice(i + 1).join(' ') };
    }
    if (i + 1 < tokens.length && WAKE_PAIRS.has(`${tokens[i]} ${tokens[i + 1]}`)) {
      return { command: tokens.slice(i + 2).join(' ') };
    }
  }

  // 2. Fuzzy match on the first non-filler word only — covers mis-hears
  //    ("emt", "emot") without waking on the same sounds mid-conversation.
  let i = 0;
  while (i < tokens.length && LEADING_FILLERS.has(tokens[i])) i++;
  const word = tokens[i] || '';
  if (word.length >= 3 && word.length <= 6 && !WAKE_FUZZY_BLOCKLIST.has(word) &&
      (word[0] === 'e' || word[0] === 'a' || word[0] === 'i')) {
    if (WAKE_FUZZY_TARGETS.some((t) => levenshtein(word, t) <= 1)) {
      return { command: tokens.slice(i + 1).join(' ') };
    }
  }
  return null;
}

// ── Shared routing (wake word → command) ─────────────────────────────────────

// If a wake word arrives in its own utterance, the next utterance that STARTS
// within this window is treated as the command (user paused after "EMIT").
const WAKE_PENDING_TIMEOUT_MS = 4000;

class BaseProvider {
  constructor() {
    this._wakeWordCb = null;
    this._commandCb  = null;
    this._interimCb  = null;
    this._active     = false;
    // Wake word heard without a command: commands starting before this time
    // are accepted without repeating the wake word.
    this._wakePendingUntil = 0;
  }

  onWakeWord(cb) { this._wakeWordCb = cb; }
  onCommand(cb)  { this._commandCb  = cb; }
  onInterim(cb)  { this._interimCb  = cb; }

  /**
   * Route one final, normalized transcript.
   * @param {string} text          normalized transcript
   * @param {number|null} confidence recognition confidence (null = unknown)
   * @param {number} startedAt     when the speech began (ms epoch)
   * @param {number} endedAt       when the speech ended (ms epoch)
   * @returns {boolean} true if it was a wake word or command
   */
  _route(text, confidence, startedAt, endedAt) {
    if (!text) return false;

    const wake = detectWakeWord(text);
    if (wake) {
      if (this._interimCb) this._interimCb('');
      if (this._wakeWordCb) this._wakeWordCb();
      if (wake.command) {
        this._wakePendingUntil = 0;
        if (this._commandCb) this._commandCb({ transcript: wake.command, confidence });
      } else {
        this._wakePendingUntil = endedAt + WAKE_PENDING_TIMEOUT_MS;
      }
      return true;
    }

    if (this._wakePendingUntil && startedAt <= this._wakePendingUntil) {
      this._wakePendingUntil = 0;
      if (this._interimCb) this._interimCb('');
      if (this._commandCb) this._commandCb({ transcript: text, confidence });
      return true;
    }
    this._wakePendingUntil = 0;
    return false;
  }
}

// ── WhisperProvider ───────────────────────────────────────────────────────────

const WHISPER_URL   = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';
const TARGET_SAMPLE_RATE = 16000;
// ScriptProcessor block size: ~43 ms at 48 kHz — the VAD's time resolution.
const FRAME_SIZE = 2048;

// Adaptive VAD on float RMS (0–1). Thresholds follow the measured noise floor
// so the same settings work in a quiet room and a moving ambulance.
const START_RATIO   = 3.0;    // speech starts above floor × 3 …
const END_RATIO     = 2.0;    // … and continues while above floor × 2
const MIN_START_RMS = 0.02;   // absolute lower bounds for very quiet rooms
const MIN_END_RMS   = 0.012;
const MAX_NOISE_FLOOR = 0.04; // never adapt so high that speech can't clear it
const FLOOR_ALPHA_QUIET = 0.05;  // floor tracks quiet frames quickly (~1 s)
const FLOOR_ALPHA_LOUD  = 0.005; // and sustained loud noise slowly (~9 s)
const CALIBRATION_MS = 300;   // measure the room before detecting speech
// Loudness must be sustained this long before speech is confirmed (debounces
// clicks and bumps).
const SPEECH_CONFIRM_MS = 140;
// Silence after speech before the utterance is sent.
const SILENCE_MS = 1000;
// Trailing silence kept on the clip — long silent tails make Whisper hallucinate.
const TRAILING_SILENCE_KEEP_MS = 300;
// Audio kept from before speech was confirmed so the wake word's soft onset
// is never clipped.
const PREROLL_MS = 700;
// Longest single clip. Longer speech is sent in consecutive pieces.
const MAX_UTTERANCE_MS = 15000;
// Segments with less voiced audio than this are noise, not speech.
const MIN_VOICED_MS = 250;
// Quiet clips are boosted toward this peak level (gain capped below).
const TARGET_PEAK = 0.9;
const MAX_GAIN    = 8;

const REQUEST_TIMEOUT_MS = 10000;
const REQUEST_ATTEMPTS   = 2;
// Whisper segment filters (values from Whisper's own decoding heuristics).
const NO_SPEECH_PROB_MAX    = 0.6;
const LOW_LOGPROB           = -1.0;
const MAX_COMPRESSION_RATIO = 2.4;
// Used only if a response arrives without per-segment scores.
const WHISPER_DEFAULT_CONFIDENCE = 0.9;

/**
 * Prompt sent with every Whisper request. Whisper treats the prompt as the
 * transcript that came BEFORE the audio, so it is written as example log lines
 * in the exact style we want back: "EMIT," spelled consistently, followed by
 * medications and EMS terms it would otherwise mishear.
 * Keep under ~224 tokens (Whisper's prompt limit).
 */
const MEDICAL_PROMPT = [
  'EMIT, start CPR. EMIT, epinephrine. EMIT, amiodarone. EMIT, V-fib. EMIT, ROSC.',
  'EMIT, dirty epi drip. EMIT, fluid bolus. EMIT, Ofirmev. EMIT, fentanyl. EMIT, ketamine.',
  'EMIT, Ativan. EMIT, Versed. EMIT, morphine. EMIT, adenosine. EMIT, aspirin. EMIT, Narcan.',
  'EMIT, D50. EMIT, nitro. EMIT, albuterol. EMIT, DuoNeb.',
  'EMIT, BVM. EMIT, King airway. EMIT, intubation. EMIT, CPAP. EMIT, defibrillation.',
  'EMIT, cardioversion. EMIT, 12-lead. EMIT, needle decompression. EMIT, tourniquet.',
  'EMIT, wound packing. EMIT, C-spine. EMIT, splint. EMIT, oxygen.',
  'EMIT, PEA. EMIT, asystole. EMIT, V-tach. EMIT, A-fib. EMIT, SVT. EMIT, bradycardia.',
  'EMIT, normal sinus. EMIT, patient contact. EMIT, efforts discontinued.',
].join(' ');
const NORMALIZED_PROMPT = normalizeTranscript(MEDICAL_PROMPT);

// Stock phrases Whisper emits for silence or noise. Never valid commands.
const HALLUCINATIONS = new Set([
  'you', 'thank you', 'thank you very much', 'thanks', 'thanks for watching',
  'thank you for watching', 'please subscribe', 'bye', 'bye bye', 'so', 'uh', 'um',
]);

/**
 * Turn a verbose_json Whisper response into { text, confidence }, or null when
 * the audio was noise or a hallucination.
 */
export function assessWhisperResult(json) {
  if (!json) return null;
  let text;
  let confidence = WHISPER_DEFAULT_CONFIDENCE;

  if (Array.isArray(json.segments) && json.segments.length) {
    const kept = json.segments.filter((s) =>
      !(s.no_speech_prob > NO_SPEECH_PROB_MAX && s.avg_logprob < LOW_LOGPROB) &&
      !(s.compression_ratio > MAX_COMPRESSION_RATIO)
    );
    if (!kept.length) return null;
    text = normalizeTranscript(kept.map((s) => s.text).join(' '));

    // Duration-weighted mean token probability.
    let weight = 0, sum = 0;
    for (const s of kept) {
      const w = Math.max(0.1, (s.end ?? 0) - (s.start ?? 0));
      weight += w;
      sum += w * Math.exp(s.avg_logprob ?? 0);
    }
    confidence = Math.round(Math.min(1, sum / weight) * 100) / 100;
  } else {
    text = normalizeTranscript(json.text);
  }

  if (!text || HALLUCINATIONS.has(text)) return null;
  // Prompt echo: Whisper sometimes returns chunks of the prompt on noise.
  const wakeCount = text.split(' ').filter((t) => t === 'emit').length;
  if (wakeCount >= 2 && NORMALIZED_PROMPT.includes(text)) return null;

  return { text, confidence };
}

/** Linear-phase box-filter downsampling (adequate anti-aliasing for speech). */
function downsample(samples, inRate, outRate) {
  if (outRate >= inRate) return samples;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  let pos = 0;
  for (let i = 0; i < out.length; i++) {
    const next = Math.min(samples.length, Math.round((i + 1) * ratio));
    let sum = 0;
    for (let j = pos; j < next; j++) sum += samples[j];
    out[i] = next > pos ? sum / (next - pos) : 0;
    pos = next;
  }
  return out;
}

/** Encode mono float samples as a 16-bit PCM WAV blob. */
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0 ? Math.min(MAX_GAIN, Math.max(1, TARGET_PEAK / peak)) : 1;

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] * gain));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function frameRms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WhisperProvider extends BaseProvider {
  constructor(apiKey) {
    super();
    this._apiKey    = apiKey;
    this._session   = 0;      // bumped on every start/stop; stale async work checks it
    this._stream    = null;
    this._audioCtx  = null;
    this._source    = null;
    this._processor = null;
    this._sampleRate = 48000;
    // Results are handled in the order utterances were spoken, even when
    // transcription requests finish out of order.
    this._resultChain = Promise.resolve();
    this._resumeAudio = this._resumeAudio.bind(this);
    this._resetVadState();
  }

  get isSupported() {
    return !!(navigator.mediaDevices?.getUserMedia) &&
           !!(window.AudioContext || window.webkitAudioContext);
  }

  async startListening() {
    if (!this.isSupported || this._active) return false;
    const session = ++this._session;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      return false;
    }
    // stopListening() (or another start) ran while the permission prompt was open.
    if (session !== this._session || this._active) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this._audioCtx   = new Ctx();
      this._sampleRate = this._audioCtx.sampleRate;
      this._source     = this._audioCtx.createMediaStreamSource(stream);
      this._processor  = this._audioCtx.createScriptProcessor(FRAME_SIZE, 1, 1);
      this._processor.onaudioprocess = (e) => {
        // The input buffer is reused by the browser — copy before storing.
        this._onFrame(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      this._source.connect(this._processor);
      // Must be connected to a destination for onaudioprocess to fire; the
      // output buffer is left silent.
      this._processor.connect(this._audioCtx.destination);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      this._teardownAudio();
      return false;
    }

    this._stream = stream;
    this._active = true;
    this._resetVadState();

    // iOS starts (and re-suspends after interruptions) the AudioContext in a
    // suspended state. Resume now, on state changes, and on the next tap.
    this._audioCtx.onstatechange = () => { if (this._active) this._resumeAudio(); };
    document.addEventListener('visibilitychange', this._resumeAudio);
    document.addEventListener('touchend', this._resumeAudio);
    document.addEventListener('click', this._resumeAudio);
    this._resumeAudio();

    // The mic track can end on device changes (Bluetooth headset, call
    // interruption). Reacquire it instead of silently going deaf.
    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        if (!this._active || session !== this._session) return;
        this.stopListening();
        setTimeout(() => this.startListening(), 500);
      };
    });

    return true;
  }

  stopListening() {
    this._session++;
    this._active = false;
    document.removeEventListener('visibilitychange', this._resumeAudio);
    document.removeEventListener('touchend', this._resumeAudio);
    document.removeEventListener('click', this._resumeAudio);
    if (this._stream) {
      this._stream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      this._stream = null;
    }
    this._teardownAudio();
    this._resetVadState();
    this._wakePendingUntil = 0;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _teardownAudio() {
    if (this._processor) {
      this._processor.onaudioprocess = null;
      try { this._processor.disconnect(); } catch {}
      this._processor = null;
    }
    if (this._source) {
      try { this._source.disconnect(); } catch {}
      this._source = null;
    }
    if (this._audioCtx) {
      this._audioCtx.onstatechange = null;
      if (this._audioCtx.state !== 'closed') this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
  }

  _resumeAudio() {
    const ctx = this._audioCtx;
    if (this._active && ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
      ctx.resume().catch(() => {});
    }
  }

  _resetVadState() {
    this._frames        = [];   // Float32Array blocks: pre-roll, then the segment
    this._frameSamples  = 0;
    this._noiseFloor    = null;
    this._calibratedMs  = 0;
    this._loudMs        = 0;
    this._speaking      = false;
    this._speechStartedAt = 0;
    this._segmentMs     = 0;
    this._voicedMs      = 0;
    this._silentMs      = 0;
  }

  _onFrame(frame) {
    if (!this._active) return;
    const ms  = (frame.length / this._sampleRate) * 1000;
    const rms = frameRms(frame);

    // Don't capture while TTS is playing — prevents the app's own voice
    // confirmations from re-triggering commands.
    if (isSpeakingSuppressed()) {
      if (this._speaking && this._interimCb) this._interimCb('');
      const floor = this._noiseFloor;
      this._resetVadState();
      this._noiseFloor = floor;
      this._calibratedMs = CALIBRATION_MS;
      return;
    }

    this._frames.push(frame);
    this._frameSamples += frame.length;

    if (this._noiseFloor === null) this._noiseFloor = rms;

    if (this._calibratedMs < CALIBRATION_MS) {
      this._calibratedMs += ms;
      this._noiseFloor += (rms - this._noiseFloor) * 0.3;
      this._trimToPreroll();
      return;
    }

    if (!this._speaking) {
      const startThreshold = Math.max(MIN_START_RMS, this._noiseFloor * START_RATIO);
      const loud = rms > startThreshold;
      this._noiseFloor += (rms - this._noiseFloor) * (loud ? FLOOR_ALPHA_LOUD : FLOOR_ALPHA_QUIET);
      this._noiseFloor = Math.min(this._noiseFloor, MAX_NOISE_FLOOR);

      if (loud) {
        this._loudMs += ms;
        if (this._loudMs >= SPEECH_CONFIRM_MS) {
          this._speaking        = true;
          this._speechStartedAt = Date.now() - this._loudMs;
          this._voicedMs        = this._loudMs;
          this._segmentMs       = 0;
          this._silentMs        = 0;
          if (this._interimCb) this._interimCb('…');
          return;
        }
      } else {
        this._loudMs = 0;
      }
      this._trimToPreroll();
      return;
    }

    // Speaking: hysteresis — stay in speech while above the (lower) end threshold.
    this._segmentMs += ms;
    const endThreshold = Math.max(MIN_END_RMS, this._noiseFloor * END_RATIO);
    if (rms > endThreshold) {
      this._voicedMs += ms;
      this._silentMs = 0;
    } else {
      this._silentMs += ms;
    }

    if (this._silentMs >= SILENCE_MS) this._endSegment(true);
    else if (this._segmentMs >= MAX_UTTERANCE_MS) this._endSegment(false);
  }

  /** Drop blocks older than the pre-roll window while no speech is in progress. */
  _trimToPreroll() {
    const keep = (PREROLL_MS / 1000) * this._sampleRate + this._loudMs / 1000 * this._sampleRate;
    while (this._frames.length > 1 && this._frameSamples - this._frames[0].length >= keep) {
      this._frameSamples -= this._frames.shift().length;
    }
  }

  _endSegment(endedOnSilence) {
    const frames   = this._frames;
    const total    = this._frameSamples;
    const voicedMs = this._voicedMs;
    const trailingMs = endedOnSilence ? this._silentMs : 0;
    const endedAt  = Date.now() - trailingMs;
    const startedAt = this._speechStartedAt;

    const floor = this._noiseFloor;
    this._resetVadState();
    this._noiseFloor   = floor;
    this._calibratedMs = CALIBRATION_MS;

    if (voicedMs < MIN_VOICED_MS) {
      if (this._interimCb) this._interimCb('');
      return;
    }

    // Concatenate, trimming most of the trailing silence.
    const dropSamples = Math.floor(
      (Math.max(0, trailingMs - TRAILING_SILENCE_KEEP_MS) / 1000) * this._sampleRate
    );
    const pcm = new Float32Array(Math.max(0, total - dropSamples));
    let offset = 0;
    for (const f of frames) {
      if (offset >= pcm.length) break;
      const n = Math.min(f.length, pcm.length - offset);
      pcm.set(n === f.length ? f : f.subarray(0, n), offset);
      offset += n;
    }

    const wav = encodeWav(downsample(pcm, this._sampleRate, TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
    const session = this._session;
    const pending = this._transcribe(wav);

    this._resultChain = this._resultChain
      .then(() => pending)
      .then((result) => {
        if (session !== this._session) return;
        if (!result) {
          if (this._interimCb) this._interimCb('');
          return;
        }
        const routed = this._route(result.text, result.confidence, startedAt, endedAt);
        // Not addressed to EMIT — show the raw transcript so the user can see
        // the mic is working.
        if (!routed && this._interimCb) this._interimCb(result.text);
      })
      .catch(() => {});
  }

  async _transcribe(wav) {
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt++) {
      const form = new FormData();
      form.append('file', wav, 'audio.wav');
      form.append('model', WHISPER_MODEL);
      form.append('language', 'en');
      form.append('prompt', MEDICAL_PROMPT);
      form.append('temperature', '0');
      form.append('response_format', 'verbose_json');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(WHISPER_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this._apiKey}` },
          body: form,
          signal: controller.signal,
        });
        if (res.ok) return assessWhisperResult(await res.json());

        const err = await res.text().catch(() => res.status);
        console.warn('[WhisperProvider] API error:', res.status, err);
        // Only rate limits and server errors are worth retrying.
        if (res.status !== 429 && res.status < 500) return null;
      } catch (e) {
        console.warn('[WhisperProvider] request failed:', e.message);
      } finally {
        clearTimeout(timer);
      }
      if (attempt + 1 < REQUEST_ATTEMPTS) await sleep(400);
    }
    return null;
  }
}

// ── WebSpeechProvider (offline fallback) ─────────────────────────────────────

// Web Speech gives no timestamps; a final result typically arrives this long
// after the speech in it began.
const WEB_SPEECH_RESULT_LAG_MS = 2000;
const WEB_SPEECH_RESTART_MIN_MS = 250;
const WEB_SPEECH_RESTART_MAX_MS = 3000;

export class WebSpeechProvider extends BaseProvider {
  constructor() {
    super();
    this._recognition  = null;
    this._restartDelay = WEB_SPEECH_RESTART_MIN_MS;
    this._fatalError   = false;
  }

  get isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || this._active) return false;

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 5;

    r.onresult = (event) => {
      this._restartDelay = WEB_SPEECH_RESTART_MIN_MS;
      if (isSpeakingSuppressed()) return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          interim += result[0].transcript;
          continue;
        }
        const best = this._pickAlternative(result);
        if (!best) continue;
        const now = Date.now();
        const routed = this._route(best.text, best.confidence, now - WEB_SPEECH_RESULT_LAG_MS, now);
        if (!routed && this._interimCb) this._interimCb(best.text);
      }
      if (interim && this._interimCb) this._interimCb(interim);
    };

    r.onerror = (e) => {
      // Permission problems won't fix themselves — stop the restart loop.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this._fatalError = true;
        console.warn('[WebSpeechProvider] recognition unavailable:', e.error);
      }
    };

    // Chrome ends continuous sessions periodically and after errors; onend
    // always follows onerror, so all restarts happen here (with backoff).
    r.onend = () => {
      if (!this._active || this._fatalError || this._recognition !== r) return;
      const delay = this._restartDelay;
      this._restartDelay = Math.min(delay * 2, WEB_SPEECH_RESTART_MAX_MS);
      setTimeout(() => {
        if (this._active && this._recognition === r) { try { r.start(); } catch {} }
      }, delay);
    };

    try { r.start(); } catch { return false; }
    this._recognition = r;
    this._active = true;
    this._fatalError = false;
    return true;
  }

  stopListening() {
    this._active = false;
    this._wakePendingUntil = 0;
    if (this._recognition) {
      this._recognition.onend = this._recognition.onerror = this._recognition.onresult = null;
      try { this._recognition.abort(); } catch {}
      this._recognition = null;
    }
  }

  /**
   * Choose the most useful alternative from one final result: prefer ones
   * containing the wake word, then ones whose command text matches a known
   * command, then the engine's confidence. The top alternative is often a
   * near-miss ("emit give eppy") while alternative 2 is right ("emit give epi").
   */
  _pickAlternative(result) {
    let best = null;
    for (let a = 0; a < result.length; a++) {
      const text = normalizeTranscript(result[a].transcript);
      if (!text) continue;
      const raw = result[a].confidence;
      // Safari and some Chrome alternatives report 0 — that means "unknown".
      const confidence = raw > 0 ? raw : null;
      const wake = detectWakeWord(text);
      const commandText = wake ? wake.command : text;
      const score =
        (wake ? 4 : 0) +
        (commandText && matchVoiceCommand(commandText) ? 2 : 0) +
        (confidence ?? 0);
      if (!best || score > best.score) best = { text, confidence, score };
    }
    return best;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Human-readable label for the active recognition mode. */
export const RECOGNITION_MODE = getWhisperApiKey() ? 'whisper-api' : 'offline';

/**
 * Return a configured provider.
 *   - Whisper API key present → WhisperProvider (cloud, high accuracy)
 *   - No key                  → WebSpeechProvider (offline, browser-native fallback)
 */
export function createProvider() {
  const key = getWhisperApiKey();
  if (key) return new WhisperProvider(key);
  return new WebSpeechProvider();
}
