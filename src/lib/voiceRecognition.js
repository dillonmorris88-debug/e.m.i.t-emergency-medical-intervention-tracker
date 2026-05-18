const WAKE_WORDS = ['emit', 'emmet', 'emmit', 'emitt', 'e.m.i.t', 'e.m.i.t.', 'a mit', 'a-mit', 'e mit'];

export function startVoiceRecognition(onWakeWord, onResult, onInterim) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 5; // Check multiple transcription candidates

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    let allFinalAlternatives = [];

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        // Collect all alternatives for the best wake-word match
        for (let a = 0; a < result.length; a++) {
          allFinalAlternatives.push(result[a].transcript.toLowerCase().trim());
        }
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    if (onInterim) onInterim(interimTranscript || finalTranscript);

    if (allFinalAlternatives.length > 0) {
      // Find the best alternative that contains a wake word
      let matchedTranscript = null;
      let matchedWake = null;

      for (const alt of allFinalAlternatives) {
        for (const w of WAKE_WORDS) {
          if (alt.includes(w)) {
            matchedTranscript = alt;
            matchedWake = w;
            break;
          }
        }
        if (matchedTranscript) break;
      }

      if (matchedTranscript && matchedWake) {
        // Extract everything after the wake word
        const idx = matchedTranscript.indexOf(matchedWake);
        const command = matchedTranscript.slice(idx + matchedWake.length).trim();
        onWakeWord();
        if (onInterim) onInterim('');
        if (command) onResult(command);
      }
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      setTimeout(() => {
        try { recognition.start(); } catch {}
      }, 300);
    }
  };

  recognition.onend = () => {
    setTimeout(() => {
      try { recognition.start(); } catch {}
    }, 200);
  };

  try { recognition.start(); } catch {}
  return recognition;
}

export function stopVoiceRecognition(recognition) {
  if (recognition) {
    recognition.onend = null; // Prevent auto-restart
    try { recognition.stop(); } catch {}
  }
}