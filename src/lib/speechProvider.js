/**
 * SpeechRecognitionProvider — abstraction layer for speech recognition backends.
 *
 * ── Active provider: WhisperProvider ──────────────────────────────────────────
 *   Recognition mode: CLOUD (whisper-api)
 *   Engine: OpenAI Whisper v2 via /v1/audio/transcriptions
 *   Accuracy: significantly higher than Web Speech API, especially on iOS
 *   Latency: ~1–3 s after end of utterance (VAD silence detection + API round-trip)
 *   Cost: ~$0.006/min of audio (only audio containing speech is sent)
 *   Requirements: OpenAI API key stored in localStorage under 'emit_whisper_key'
 *   Audio storage: audio blobs are sent to OpenAI and then discarded — never persisted locally
 *
 * ── Fallback: WebSpeechProvider ──────────────────────────────────────────────
 *   Used automatically when no Whisper API key is configured.
 *   Recognition mode: OFFLINE (browser-native Web Speech API)
 *   Limitations: unreliable on iOS Safari continuous mode
 *
 * ── How WhisperProvider works ─────────────────────────────────────────────────
 *   1. getUserMedia() opens the microphone.
 *   2. AudioContext + AnalyserNode performs RMS-based voice activity detection (VAD).
 *   3. MediaRecorder captures the raw audio stream.
 *   4. When the RMS level drops below the speech threshold for SILENCE_MS (1000 ms),
 *      the current recording chunk is flushed and sent to the Whisper API.
 *   5. The Whisper transcript is checked for a wake word ("EMIT" and variants).
 *   6. If found, onWakeWord() fires, the trailing text is extracted as the command,
 *      and onCommand() fires with { transcript, confidence: 0.92 }.
 *   7. isSpeakingSuppressed() (from speak.js) blocks processing during TTS playback
 *      so confirmation audio cannot re-trigger commands.
 *
 * ── Switching providers ───────────────────────────────────────────────────────
 *   Set/clear the API key via setWhisperApiKey() and the next createProvider()
 *   call automatically returns the correct provider.
 */

import { isSpeakingSuppressed } from './speak.js';

// ── Shared constants ──────────────────────────────────────────────────────────

const WAKE_WORDS = ['emit', 'emmet', 'emmit', 'emitt', 'e.m.i.t', 'e.m.i.t.', 'a mit', 'a-mit', 'e mit'];
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

// ── WhisperProvider ───────────────────────────────────────────────────────────

// Silence duration (ms) after last speech sample before the chunk is sent to Whisper.
// Shorter = faster response; longer = less likely to cut off slow speakers.
const SILENCE_MS = 1000;

// How long to wait for the command after a wake word that arrived in its own
// chunk (user said "EMIT", paused, then said the command). Without this buffer
// the command chunk has no wake word and is silently dropped — the #1 cause of
// "wake word flashes but nothing logs" on mobile, where the VAD naturally splits
// the wake word from the command across two chunks.
const WAKE_PENDING_TIMEOUT_MS = 4000;

// RMS amplitude threshold (0–128 scale) above which audio counts as speech.
// Raise if false triggers from background noise; lower if voice is not detected.
const SPEECH_RMS_THRESHOLD = 12;

// Ignore audio blobs smaller than this — they are almost certainly noise frames.
const MIN_CHUNK_BYTES = 3000;

// Whisper is highly accurate; treat its results as 0.92 confidence.
const WHISPER_CONFIDENCE = 0.92;

/**
 * Medical-context prompt sent with every Whisper request.
 *
 * Whisper's `prompt` parameter biases the model toward the listed vocabulary —
 * critical for medication names and acronyms it would otherwise mishear
 * ("amio" → "ammo", "Ofirmev" → "off her math", "PEA" → "pee a", etc).
 * Keep under ~224 tokens (Whisper's limit). Order matters less than coverage.
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
    this._chunks     = [];
    this._speaking   = false;
    this._silenceTimer = null;
    this._vadTimer   = null;
    // Pending wake word — true when a chunk contained a wake word with no
    // command, waiting for the next chunk to deliver the command.
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
        audio: { channelCount: 1, sampleRate: 16000 },
      });
    } catch {
      return false;
    }

    // AudioContext for VAD
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source   = this._audioCtx.createMediaStreamSource(this._stream);
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 256;
    source.connect(this._analyser);

    // MediaRecorder — pick the best format iOS / Android / Chrome all support
    const mimeType = this._bestMimeType();
    this._recorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : {});
    this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.onstop = () => this._handleStop();
    this._recorder.start(100); // 100 ms timeslice — fine-grained chunks

    this._active = true;

    // VAD polling loop
    this._vadTimer = setInterval(() => this._pollVAD(), 80);
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
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    if (this._audioCtx && this._audioCtx.state !== 'closed') {
      this._audioCtx.close().catch(() => {});
      this._audioCtx = null;
    }
    this._recorder = null;
    this._analyser  = null;
    this._chunks    = [];
    this._speaking  = false;
    this._wakePending   = false;
    this._wakePendingAt = 0;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _bestMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',           // iOS Safari
    ];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  _pollVAD() {
    if (!this._analyser || !this._active) return;

    const buf = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteTimeDomainData(buf);

    // RMS energy: centre value is 128 (silence), deviation = amplitude
    let sum = 0;
    for (const v of buf) sum += (v - 128) ** 2;
    const rms = Math.sqrt(sum / buf.length);

    if (rms > SPEECH_RMS_THRESHOLD) {
      if (!this._speaking) {
        this._speaking = true;
        // Show a live "listening" dot in the UI while the user is speaking
        if (this._interimCb) this._interimCb('…');
      }
      // Reset the silence countdown every time voice is detected
      clearTimeout(this._silenceTimer);
      this._silenceTimer = setTimeout(() => {
        if (this._active && this._speaking) {
          this._speaking = false;
          this._flush();
        }
      }, SILENCE_MS);
    }
  }

  _flush() {
    if (!this._recorder || this._recorder.state !== 'recording') return;
    // stop() triggers onstop → _handleStop()
    try { this._recorder.stop(); } catch {}
  }

  _handleStop() {
    // Snapshot and reset the chunk buffer immediately so the restarted
    // recorder writes into a fresh array.
    const chunks = this._chunks.splice(0);

    // Restart recording right away to avoid missing the next utterance
    if (this._active && this._recorder) {
      try { this._recorder.start(100); } catch {}
    }

    // Don't process audio while TTS is playing — prevents echo re-triggers
    if (isSpeakingSuppressed()) return;

    this._transcribe(chunks, this._recorder?.mimeType || 'audio/webm');
  }

  async _transcribe(chunks, mimeType) {
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size < MIN_CHUNK_BYTES) return;

    // Derive a filename extension Whisper will accept
    const ext = mimeType.includes('mp4') ? 'm4a'
              : mimeType.includes('ogg') ? 'ogg'
              : 'webm';

    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    // Bias Whisper toward medical vocabulary — dramatically improves
    // recognition of drug names, acronyms (PEA, SVT, BVM), and EMS jargon.
    form.append('prompt', MEDICAL_PROMPT);
    // Lower temperature = more deterministic; we want stable, repeatable matches.
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

    // 1. A wake word in THIS chunk takes precedence over a pending one.
    for (const w of WAKE_WORDS) {
      if (text.includes(w)) {
        const command = text.slice(text.indexOf(w) + w.length).trim();
        if (this._wakeWordCb) this._wakeWordCb();
        if (command && this._commandCb) {
          this._wakePending = false;
          this._commandCb({ transcript: command, confidence: WHISPER_CONFIDENCE });
        } else {
          // Wake word with no command — buffer and wait for the next chunk
          // (user paused between the wake word and the command).
          this._wakePending   = true;
          this._wakePendingAt = Date.now();
        }
        return;
      }
    }

    // 2. No wake word here, but a recent chunk ended on a wake word — treat
    //    this whole chunk as the command. This is what makes "EMIT … epi"
    //    (spoken with a pause) actually log.
    if (this._wakePending && (Date.now() - this._wakePendingAt) < WAKE_PENDING_TIMEOUT_MS) {
      this._wakePending = false;
      if (this._commandCb) this._commandCb({ transcript: text, confidence: WHISPER_CONFIDENCE });
      return;
    }
    this._wakePending = false;

    // 3. No wake word, nothing pending — show the raw transcript so the user
    //    can see the mic is working.
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
          for (const w of WAKE_WORDS) {
            if (alt.transcript.includes(w)) {
              if (!best || alt.confidence > best.confidence) best = { ...alt, wakeWord: w };
              break;
            }
          }
        }
        if (best) {
          const command = best.transcript.slice(best.transcript.indexOf(best.wakeWord) + best.wakeWord.length).trim();
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

/**
 * Human-readable label for the active recognition mode.
 * Derived at module load time — reflects whatever key is stored right now.
 * The VoiceIndicator reads this to show the mode badge.
 */
export const RECOGNITION_MODE = getWhisperApiKey() ? 'whisper-api' : 'offline';

/**
 * Return a configured provider.
 *   - Whisper API key present → WhisperProvider (cloud, high accuracy)
 *   - No key             → WebSpeechProvider (offline, browser-native fallback)
 */
export function createProvider() {
  const key = getWhisperApiKey();
  if (key) return new WhisperProvider(key);
  return new WebSpeechProvider();
}