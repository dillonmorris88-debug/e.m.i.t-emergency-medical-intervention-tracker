/**
 * Text-to-speech confirmation using the Web Speech API.
 *
 * isSpeakingSuppressed() is exported for speechProvider.js, which calls it
 * before processing any recognition result. This prevents the device speaker
 * from re-triggering the same command it just confirmed.
 */

let _suppressUntil = 0;

/**
 * Returns true while TTS is active plus a trailing buffer.
 * Call this before processing any voice recognition result.
 */
export function isSpeakingSuppressed() {
  return Date.now() < _suppressUntil;
}

export function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 1.1;
  utt.pitch = 1.0;
  utt.volume = 1.0;

  // Set suppression before speak() returns so the first recognition frames
  // during TTS startup are already blocked. ~80 ms/char is a safe upper bound
  // at rate 1.1; we add 1.2 s of headroom.
  const estimatedMs = text.length * 80 + 1200;
  _suppressUntil = Date.now() + estimatedMs;

  // Extend 1 s after the utterance actually ends (covers audio tail + mic settling).
  utt.onend = () => { _suppressUntil = Date.now() + 1000; };

  window.speechSynthesis.speak(utt);
}
