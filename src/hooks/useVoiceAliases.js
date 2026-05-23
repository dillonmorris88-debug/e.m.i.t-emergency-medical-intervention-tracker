const STORAGE_KEY = 'emit_voice_aliases';

export function getVoiceAliases() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveVoiceAlias(key, phrases) {
  const aliases = getVoiceAliases();
  aliases[key] = phrases;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}

export function removeVoiceAlias(key, phrase) {
  const aliases = getVoiceAliases();
  if (!aliases[key]) return;
  aliases[key] = aliases[key].filter(p => p !== phrase);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}

/** Delete all custom voice aliases (used by the "Delete learned voice data" setting). */
export function clearAllVoiceAliases() {
  localStorage.removeItem(STORAGE_KEY);
}
