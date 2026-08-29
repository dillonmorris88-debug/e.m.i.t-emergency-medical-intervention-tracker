/**
 * SpeechRecognitionProvider — abstraction layer for speech recognition backends.
 *
 * ── Active provider: WhisperProvider ──────────────────────────────────────────
 *   Recognition mode: CLOUD (whisper-api)
 *   Engine: OpenAI Whisper v1 via /v1/audio/transcriptions
 *
 *   Architecture (rebuilt for reliability):
 *     ONE long-lived MediaRecorder runs for the entire session and streams
 *     timestamped audio chunks into a rolling buffer. A hysteresis VAD
 *     (AnalyserNode RMS) detects speech segments. When speech ends, the
 *     segment — including a PRE-ROLL window before speech was confirmed — is
 *     sliced from the buffer and sent to Whisper as a single complete
 *     utterance. The recorder is never stopped mid-session, which eliminates
 *     the iOS Safari "recorder won't restart" failure and the audio gaps
 *     between utterances that were dropping commands.
 *
 *   Wake word: "EMIT" (and variants). Detection is fuzzy — the first word of
 *   the transcript is accepted if it is within edit distance 2 of "emit",
 *   so common Whisper mis-hears ("amit", "emet", "emit") still trigger.
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

// ── Shared constants ──────────────────────────────────────────────────────────

const WAKE_WORDS = [
  'hey emit', 'hey emmet',
  'emit', 'emmet', 'emmit', 'emitt',
  'e mit', 'e-mit', 'a mit', 'a-mit',
  'e.m.i.t', 'e.m.i.t.',
];
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

// ── Wake-word matching helpers ───────────────────────────────────────────────

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

const WAKE_TARGETS = ['emit', 'emmet', 'emitt'];

/**
 * Detect a wake word in a lowercased transcript.
 * Returns { word, index } where index >= 0 for a substring hit, or -1 for a
 * fuzzy first-word hit. Returns null if no wake word.
 */
function detectWakeWord(text) {
  // 1. Exact substring match (preferred).
  for (const w of WAKE_WORDS) {
    const i = text.indexOf(w);
    if (i >= 0) return { word: w, index: i };
  }
  // 2. Fuzzy first-word match — covers Whisper mis-hears ("amit", "emet", "imit").
  const firstWord = (text.split(/\s+/)[0] || '').replace(/[^a-z]/g, '');
  if (firstWord.length >= 3 && (firstWord[0] === 'e' || firstWord[0] === 'a')) {
    for (const target of WAKE_TARGETS) {
      if (levenshtein(firstWord, target) <= 2) return { word: target, index: -1 };
    }
  }
  return null;
}

/** Extract the command text that follows a detected wake word. */
function extractCommand(text, wake) {
  if (wake.index >= 0) {
    return text.slice(wake.index + wake.word.length).trim();
  }
  // Fuzzy first-word match — drop the first word, keep the rest.
  return text.split(/\s+/).slice(1).join(' ').trim();
}

// ── WhisperProvider ───────────────────────────────────────────────────────────

// VAD thresholds on the 0–128 RMS scale. Hysteresis: RMS must exceed START to
// begin a speech segment, then drop below END for the silence timer to elapse.
const VAD_START_THRESHOLD = 10;
const VAD_END_THRESHOLD   = 6;
// RMS must stay above START this long before speech is confirmed (debounces
// transient clicks / door slams).
const SPEECH_CONFIRM_MS = 140;
// Silence after confirmed speech before the utterance is sent to Whisper.
const SILENCE_MS = 1200;
// Audio retained before speech confirmation so the wake word is never cut off.
const PREROLL_MS = 1500;
// Max utterance length sent to Whisper (safety against runaway segments).
const MAX_UTTERANCE_MS = 15000;
// Drop segments smaller than this — they are noise frames, not speech.
const MIN_SEGMENT_BYTES = 500;
// How long the rolling buffer keeps audio (bounds memory between utterances).
const BUFFER_KEEP_MS = 3000;
// Whisper is highly accurate; treat its results as 0.92 confidence.
const WHISPER_CONFIDENCE = 0.92;
// If a wake word arrives in its own utterance, wait this long for the command
// in the next utterance (user paused between "EMIT" and the command).
const WAKE_PENDING_TIMEOUT_MS = 4000;

/**
 * Medical-context prompt sent with every Whisper request. Biases the model
 * toward medication names and EMS acronyms it would otherwise mishear.
 * Keep under ~224 tokens (Whisper's prompt limit).
 */
const MEDICAL_PROMPT = [
  'Paramedic logging emergency interventions. Wake word: EMIT or Hey EMIT.',
  'Medications: epinephrine, dirty epi drip, fluid bolus, Ofirmev, fentanyl, ketamine, Ativan, lorazepam, Versed, midazolam, morphine, adenosine, amiodarone, aspirin, Narcan, naloxone, dextrose, D50, nitroglycerin, albuterol, DuoNeb.',
  'Interventions: spinal restriction, c-spine, BVM, intubation, King airway, CPAP, defibrillation, cardioversion, 12-lead ECG, EKG, needle decompression, tourniquet, wound packing, splinting, oxygen.',
  'Rhythms: V-fib, V-tach, PEA, asystole, normal sinus, A-fib, SVT, bradycardia, supraventricular tachycardia.',
  'Actions: start CPR, ROSC, return of spontaneous circulation, efforts discontinued, patient contact, on scene.',
].join(' ');

export class WhisperProvider {
  constructor(apiKey) {
    this._apiKey     = apiKey;
    this._wakeWordCb = null;
    this._commandCb  = null;
    this._interimCb  = null;
    this._active     = false;
    this._stream     = null;
    this._recorder   = null;
    this._audioCtx   = null;
    this._analyser   = null;
    // Rolling buffer of { blob, time } chunks from the long-lived recorder.
    this._chunks     = [];
    // VAD state
    this._vadTimer    = null;
    this._silenceTimer = null;
    this._loudSince    = 0;     // when RMS first rose above START (confirm window)
    this._speaking     = false; // speech confirmed and ongoing
    this._speechStart  = 0;     // segment start (incl. pre-roll), set on confirm
    // Pending wake word from a wake-only utterance, awaiting the command.
    this._wakePending   = false;
    this._wakePendingAt = 0;
  }

  onWakeWord(cb) { this._wakeWordCb = cb; }
  onCommand(cb)  { this._commandCb  = cb; }
  onInterim(cb)  { this._interimCb  = cb; }

  get isSupported() {
    return !!(navigator.mediaDevices?.getUserMedia) &&
           !!(window.AudioContext || window.webkitAudioContext) &&
           !!(window.MediaRecorder);
  }

  async startListening() {
    if (!this.isSupported || this._active) return false;
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      return false;
    }

    // AudioContext + Analyser for RMS voice-activity detection.
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source   = this._audioCtx.createMediaStreamSource(this._stream);
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 512;
    source.connect(this._analyser);

    this._active = true;

    // ONE long-lived MediaRecorder for the whole session. It is never stopped
    // until stopListening() — eliminating the iOS Safari restart failure and
    // the inter-utterance audio gaps that were dropping commands.
    const mimeType = this._bestMimeType();
    let rec;
    try {
      rec = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});
    } catch {
      this._teardownStream();
      this._active = false;
      return false;
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._chunks.push({ blob: e.data, time: Date.now() });
      }
    };
    this._recorder = rec;
    try { rec.start(200); } catch {} // 200 ms timeslice → rolling buffer

    this._vadTimer = setInterval(() => this._pollVAD(), 50);
    return true;
  }

  stopListening() {
    this._active = false;
    clearInterval(this._vadTimer);
    clearTimeout(this._silenceTimer);
    this._vadTimer = null;
    this._silenceTimer = null;

    if (this._recorder && this._recorder.state !== 'inactive') {
      try { this._recorder.stop(); } catch {}
    }
    this._teardownStream();
    this._recorder = null;
    this._analyser  = null;
    this._chunks    = [];
    this._loudSince = 0;
    this._speaking  = false;
    this._speechStart = 0;
    this._wakePending   = false;
    this._wakePendingAt = 0;
  }

  _teardownStream() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._audioCtx && this._audioCtx.state !== 'closed') {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _bestMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',           // iOS Safari
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  _pollVAD() {
    if (!this._analyser || !this._active) return;

    const buf = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteTimeDomainData(buf);

    // RMS energy: centre is 128 (silence); deviation = amplitude.
    let sum = 0;
    for (const v of buf) sum += (v - 128) ** 2;
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();

    if (rms > VAD_START_THRESHOLD) {
      if (!this._loudSince) this._loudSince = now;
      // Confirm speech only after a brief sustained loudness (debounces clicks).
      if (!this._speaking && now - this._loudSince >= SPEECH_CONFIRM_MS) {
        this._speaking = true;
        // Start the segment a bit BEFORE confirmation so the wake word — often
        // spoken right at the start of the utterance — is captured in full.
        this._speechStart = now - PREROLL_MS;
        if (this._interimCb) this._interimCb('…');
      }
      if (this._speaking) {
        // Reset the silence countdown on every loud sample while speaking.
        clearTimeout(this._silenceTimer);
        this._silenceTimer = setTimeout(() => this._endOfUtterance(), SILENCE_MS);
      }
    } else if (rms < VAD_END_THRESHOLD) {
      // Brief loudness that never confirmed was just a click — reset.
      if (!this._speaking) this._loudSince = 0;
    }

    // Bound memory: drop chunks older than the keep window — but ONLY while
    // silent. While speech is ongoing we keep every chunk so the pre-roll and
    // the full utterance (including the wake word) survive until the segment
    // is sliced and sent to Whisper. Trimming during speech was discarding the
    // wake-word audio, so Whisper never saw a wake word and nothing triggered.
    if (!this._speaking) {
      const cutoff = now - BUFFER_KEEP_MS;
      while (this._chunks.length && this._chunks[0].time < cutoff) {
        this._chunks.shift();
      }
    }
  }

  _endOfUtterance() {
    if (!this._active || !this._speaking) return;
    this._speaking  = false;
    this._loudSince = 0;

    const end = Date.now();
    let start = this._speechStart;
    if (end - start > MAX_UTTERANCE_MS) start = end - MAX_UTTERANCE_MS;

    // Slice the speech segment (pre-roll → now) from the rolling buffer.
    const blobs = [];
    for (const c of this._chunks) {
      if (c.time >= start) blobs.push(c.blob);
    }
    if (!blobs.length) return;

    // Don't process audio while TTS is playing — prevents echo re-triggers.
    if (isSpeakingSuppressed()) return;

    const mimeType = this._recorder?.mimeType || 'audio/webm';
    this._transcribe(blobs, mimeType);
  }

  async _transcribe(blobs, mimeType) {
    const total = blobs.reduce((n, b) => n + b.size, 0);
    if (total < MIN_SEGMENT_BYTES) return;

    const blob = new Blob(blobs, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'm4a'
              : mimeType.includes('ogg') ? 'ogg'
              : 'webm';

    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    form.append('prompt', MEDICAL_PROMPT);
    form.append('temperature', '0');

    let text;
    try {
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this._apiKey}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => res.status);
        console.warn('[WhisperProvider] API error:', err);
        return;
      }
      text = (await res.json()).text?.toLowerCase().trim();
    } catch (e) {
      console.warn('[WhisperProvider] fetch failed:', e.message);
      return;
    }

    if (!text) return;
    if (this._interimCb) this._interimCb('');

    const wake = detectWakeWord(text);
    if (wake) {
      const command = extractCommand(text, wake);
      if (this._wakeWordCb) this._wakeWordCb();
      if (command && this._commandCb) {
        this._wakePending = false;
        this._commandCb({ transcript: command, confidence: WHISPER_CONFIDENCE });
      } else {
        // Wake word with no command — buffer and wait for the next utterance
        // (user paused between the wake word and the command).
        this._wakePending   = true;
        this._wakePendingAt = Date.now();
      }
      return;
    }

    // No wake word here, but a recent utterance ended on a wake word — treat
    // this whole utterance as the command.
    if (this._wakePending && Date.now() - this._wakePendingAt < WAKE_PENDING_TIMEOUT_MS) {
      this._wakePending = false;
      if (this._commandCb) this._commandCb({ transcript: text, confidence: WHISPER_CONFIDENCE });
      return;
    }
    this._wakePending = false;

    // No wake word, nothing pending — show the raw transcript so the user can
    // see the mic is working.
    if (this._interimCb) this._interimCb(text);
  }
}

// ── WebSpeechProvider (offline fallback) ─────────────────────────────────────

export class WebSpeechProvider {
  constructor() {
    this._recognition = null;
    this._wakeWordCb  = null;
    this._commandCb   = null;
    this._interimCb   = null;
    this._active      = false;
  }

  onWakeWord(cb) { this._wakeWordCb = cb; }
  onCommand(cb)  { this._commandCb  = cb; }
  onInterim(cb)  { this._interimCb  = cb; }

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
      if (isSpeakingSuppressed()) return;

      let interim = '';
      const finalAlts = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a++) {
            finalAlts.push({
              transcript: result[a].transcript.toLowerCase().trim(),
              confidence: result[a].confidence ?? 0.5,
            });
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (this._interimCb) this._interimCb(interim);

      if (finalAlts.length > 0) {
        let best = null;
        for (const alt of finalAlts) {
          const wake = detectWakeWord(alt.transcript);
          if (wake && (!best || alt.confidence > best.confidence)) {
            best = { ...alt, wake };
          }
        }
        if (best) {
          const command = extractCommand(best.transcript, best.wake);
          if (this._wakeWordCb) this._wakeWordCb();
          if (this._interimCb)  this._interimCb('');
          if (command && this._commandCb) this._commandCb({ transcript: command, confidence: best.confidence });
        }
      }
    };

    r.onerror = (e) => { if (e.error !== 'no-speech' && this._active) setTimeout(() => { try { r.start(); } catch {} }, 300); };
    r.onend   = () => { if (this._active) setTimeout(() => { try { r.start(); } catch {} }, 200); };

    try { r.start(); } catch { return false; }
    this._recognition = r;
    this._active = true;
    return true;
  }

  stopListening() {
    this._active = false;
    if (this._recognition) {
      this._recognition.onend = this._recognition.onerror = this._recognition.onresult = null;
      try { this._recognition.abort(); } catch {}
      this._recognition = null;
    }
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