const WAKE_WORD = 'emit';

export function startVoiceRecognition(onWakeWord, onResult, onInterim) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += t;
      } else {
        interimTranscript += t;
      }
    }

    if (onInterim) onInterim(interimTranscript || finalTranscript);

    if (finalTranscript) {
      const transcript = finalTranscript.toLowerCase().trim();
      if (transcript.includes(WAKE_WORD)) {
        const command = transcript.split(WAKE_WORD).pop().trim();
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