const WAKE_WORD = 'emit';

export function startVoiceRecognition(onWakeWord, onResult) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
    if (transcript.includes(WAKE_WORD)) {
      const command = transcript.split(WAKE_WORD).pop().trim();
      onWakeWord();
      if (command) onResult(command);
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      setTimeout(() => {
        try { recognition.start(); } catch {}
      }, 1000);
    }
  };

  recognition.onend = () => {
    setTimeout(() => {
      try { recognition.start(); } catch {}
    }, 500);
  };

  try { recognition.start(); } catch {}
  return recognition;
}

export function stopVoiceRecognition(recognition) {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}