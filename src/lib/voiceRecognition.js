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
 * @param {(heard: {text: string, confidence: number|null, at: number}) => void} [onHeard]
 *   Every final transcript, whether or not it was addressed to EMIT.
 * @returns {WebSpeechProvider|null}
 */
export function startVoiceRecognition(onWakeWord, onResult, onInterim, onHeard) {
  const provider = createProvider();
  if (!provider.isSupported) return null;

  provider.onWakeWord(onWakeWord);
  provider.onCommand(({ transcript, confidence }) => onResult(transcript, confidence));
  provider.onInterim(onInterim);
  if (onHeard) provider.onHeard(onHeard);
  provider.startListening();
  return provider;
}

export function stopVoiceRecognition(provider) {
  provider?.stopListening();
}
