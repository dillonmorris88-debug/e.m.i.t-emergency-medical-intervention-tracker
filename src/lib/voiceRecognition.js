/**
 * Legacy-compatible wrapper around WebSpeechProvider.
 * New code should import createProvider() from speechProvider.js directly.
 *
 * startVoiceRecognition() returns the provider instance.
 * stopVoiceRecognition() calls provider.stopListening().
 */
import { createProvider } from './speechProvider.js';

/**
 * @param {() => void} onWakeWord
 * @param {(transcript: string, confidence: number) => void} onResult
 * @param {(interim: string) => void} onInterim
 * @returns {WebSpeechProvider|null}
 */
export function startVoiceRecognition(onWakeWord, onResult, onInterim) {
  const provider = createProvider();
  if (!provider.isSupported) return null;

  provider.onWakeWord(onWakeWord);
  provider.onCommand(({ transcript, confidence }) => onResult(transcript, confidence));
  provider.onInterim(onInterim);
  provider.startListening();
  return provider;
}

export function stopVoiceRecognition(provider) {
  provider?.stopListening();
}
