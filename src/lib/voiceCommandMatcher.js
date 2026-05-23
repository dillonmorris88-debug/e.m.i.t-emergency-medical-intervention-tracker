/**
 * Voice command matching via a priority-ordered keyword map.
 * More specific phrases come before general ones to avoid false matches.
 *
 * matchVoiceCommand() now returns a confidence score alongside the match so
 * callers can decide whether to auto-execute or show a confirmation prompt.
 */

/**
 * COMMAND_MAP is exported so VoiceLearningAgent and TrainingModeModal can
 * enumerate all built-in command definitions without duplicating them.
 *
 * Each entry is one of:
 *   { keywords, action: 'rosc' | 'cpr' | 'discontinue' }
 *   { keywords, label, category, action?: undefined }
 */
export const COMMAND_MAP = [
  // ── CPR / Cardiac outcomes ─────────────────────────────────────────────────
  // Check before rhythm keywords to avoid "CPR" matching rhythm entries.
  { keywords: ['rosc', 'return of spontaneous', 'pulse back', 'got a pulse', 'pulse is back'], action: 'rosc' },
  { keywords: ['cpr', 'compressions', 'start compressions', 'start cpr', 'begin cpr'], action: 'cpr' },
  { keywords: ['discontinue', 'efforts discontinued', 'cease efforts', 'call it', 'stop resuscitation', 'call the code'], action: 'discontinue' },
  { keywords: ['patient contact', 'on scene', 'arrived on scene', 'patient on scene'], label: 'Patient Contact', category: 'notes' },

  // ── Rhythms ────────────────────────────────────────────────────────────────
  { keywords: ['vfib', 'v fib', 'v-fib', 'ventricular fib', 'v. fib', 'ventricular fibrillation'], label: 'V-Fib', category: 'rhythm' },
  { keywords: ['vtach', 'v tach', 'v-tach', 'ventricular tach', 'v. tach', 'ventricular tachycardia'], label: 'V-Tach', category: 'rhythm' },
  { keywords: ['pea', 'p.e.a', 'pulseless electrical'], label: 'PEA', category: 'rhythm' },
  { keywords: ['asystole', 'flatline', 'flat line', 'no rhythm'], label: 'Asystole', category: 'rhythm' },
  { keywords: ['normal sinus', 'nsr', 'sinus rhythm', 'normal rhythm'], label: 'Normal Sinus', category: 'rhythm' },
  { keywords: ['afib', 'a fib', 'a-fib', 'atrial fib', 'atrial fibrillation'], label: 'A-Fib', category: 'rhythm' },
  { keywords: ['svt', 's.v.t', 'supraventricular'], label: 'SVT', category: 'rhythm' },
  { keywords: ['brady', 'bradycardia', 'slow heart'], label: 'Bradycardia', category: 'rhythm' },

  // ── Interventions (specific before general) ────────────────────────────────
  { keywords: ['king airway', 'king ltd', 'king tube'], label: 'King Airway', category: 'intervention' },
  { keywords: ['intubat', 'ett', 'e.t.t', 'endotracheal'], label: 'Intubation', category: 'intervention' },
  { keywords: ['needle decompress', 'needle d', 'needle decompression', 'decompress'], label: 'Needle Decompression', category: 'intervention' },
  { keywords: ['cardiovert'], label: 'Cardioversion', category: 'intervention' },
  { keywords: ['defib', 'defibrillat', 'shock', 'shocked the patient', 'delivered shock'], label: 'Defibrillation', category: 'intervention' },
  { keywords: ['12 lead', 'twelve lead', '12-lead', 'ecg', 'ekg'], label: '12-Lead ECG', category: 'intervention' },
  { keywords: ['wound pack', 'packing', 'wound plug'], label: 'Wound Packing', category: 'intervention' },
  { keywords: ['iv', 'intravenous', 'i.v', 'iv access', 'started an iv'], label: 'IV Access', category: 'intervention' },
  { keywords: ['io', 'i.o', 'intraosseous', 'io access'], label: 'IO Access', category: 'intervention' },
  { keywords: ['spinal', 'spine', 'c-spine', 'cervical'], label: 'Spinal Restriction', category: 'intervention' },
  { keywords: ['bvm', 'bag valve', 'bag-valve', 'bagging'], label: 'BVM', category: 'intervention' },
  { keywords: ['airway', 'supraglottic'], label: 'Airway Placement', category: 'intervention' },
  { keywords: ['cpap', 'c-pap', 'c pap'], label: 'CPAP', category: 'intervention' },
  { keywords: ['tourniquet', 'tourni', 'tq'], label: 'Tourniquet', category: 'intervention' },
  { keywords: ['splint', 'immobiliz'], label: 'Splinting', category: 'intervention' },
  { keywords: ['oxygen', 'o2', 'o 2', 'o-2', 'oxygen applied', 'applied oxygen'], label: 'O2 Applied', category: 'intervention' },

  // ── Medications (specific before general) ─────────────────────────────────
  { keywords: ['dirty epi', 'epi drip', 'epinephrine drip', 'adrenaline drip', 'epi infusion'], label: 'Dirty Epi Drip', category: 'medication' },
  { keywords: ['epi', 'epinephrine', 'adrenaline', 'gave epi', 'pushed epi'], label: 'Epinephrine', category: 'medication' },
  { keywords: ['ofirmev', 'offirmev', 'o firmev', 'acetaminophen iv', 'tylenol iv'], label: 'Ofirmev', category: 'medication' },
  { keywords: ['fluid', 'bolus', 'normal saline', 'lactated', 'ns bolus'], label: 'Fluid Bolus', category: 'medication' },
  { keywords: ['fentanyl', 'fentanil', 'fent', 'pushed fentanyl'], label: 'Fentanyl', category: 'medication' },
  { keywords: ['ketamine', 'ketamin'], label: 'Ketamine', category: 'medication' },
  { keywords: ['ativan', 'lorazepam', 'loraze'], label: 'Ativan', category: 'medication' },
  { keywords: ['versed', 'midazolam', 'midaz'], label: 'Versed', category: 'medication' },
  { keywords: ['morphine', 'morph'], label: 'Morphine', category: 'medication' },
  { keywords: ['adenosine', 'adenazine', 'adeno'], label: 'Adenosine', category: 'medication' },
  { keywords: ['amiodarone', 'amiodaron', 'amio', 'cordarone'], label: 'Amiodarone', category: 'medication' },
  { keywords: ['aspirin', 'asa', 'a.s.a'], label: 'Aspirin', category: 'medication' },
  { keywords: ['narcan', 'naloxone', 'nalox'], label: 'Narcan', category: 'medication' },
  { keywords: ['dextrose', 'd50', 'd 50', 'glucose', 'sugar', 'dextrose 50'], label: 'Dextrose', category: 'medication' },
  { keywords: ['nitro', 'nitroglycerin', 'nitroglycerine'], label: 'Nitro', category: 'medication' },
  { keywords: ['albuterol', 'albuter', 'duoneb', 'nebulizer', 'neb treatment'], label: 'Albuterol', category: 'medication' },
];

/**
 * Match a voice command string to an EMiT action.
 *
 * Returns one of:
 *   { type: 'event', label, category, confidence }
 *   { type: 'rosc', confidence }
 *   { type: 'cpr', confidence }
 *   { type: 'discontinue', confidence }
 *   null
 *
 * Confidence values:
 *   0.95 — user-taught alias (most trusted)
 *   0.90 — built-in keyword hit (well-tested)
 *
 * @param {string} transcript
 * @param {Object} aliases   - { [itemKey]: string[] } from useVoiceAliases
 * @param {Array}  interventions
 * @param {Array}  medications
 */
export function matchVoiceCommand(transcript, aliases = {}, interventions = [], medications = []) {
  const t = transcript.toLowerCase();

  // 1. User-taught aliases (highest priority — the user explicitly trained these)
  const allItems = [...interventions, ...medications];
  for (const item of allItems) {
    const itemAliases = aliases[item.key] || [];
    if (itemAliases.some(phrase => t.includes(phrase))) {
      const cat = interventions.find(i => i.key === item.key) ? 'intervention' : 'medication';
      return { type: 'event', label: item.label, category: cat, confidence: 0.95 };
    }
  }

  // 2. Built-in keyword map (priority-ordered — do not reorder without care)
  for (const entry of COMMAND_MAP) {
    if (entry.keywords.some(kw => t.includes(kw))) {
      if (entry.action === 'rosc')        return { type: 'rosc', confidence: 0.90 };
      if (entry.action === 'cpr')         return { type: 'cpr', confidence: 0.90 };
      if (entry.action === 'discontinue') return { type: 'discontinue', confidence: 0.90 };
      return { type: 'event', label: entry.label, category: entry.category, confidence: 0.90 };
    }
  }

  return null;
}

/**
 * NLU fallback — calls InvokeLLM to interpret a natural-language command.
 * Only call this when matchVoiceCommand() returns null.
 * Async; requires an internet connection.
 */
export async function matchVoiceCommandNLU(transcript, interventions = [], medications = [], invokeLLM) {
  if (!invokeLLM) return null;
  const validLabels = [
    'CPR', 'ROSC', 'Efforts Discontinued',
    ...interventions.map(i => i.label),
    ...medications.map(m => m.label),
  ];
  try {
    const result = await invokeLLM({
      prompt: `You are a voice command parser for an emergency medical app used by paramedics.
The paramedic said: "${transcript}"

Match this to one of these valid actions: ${validLabels.join(', ')}

Rules:
- "CPR" triggers CPR start
- "ROSC" means return of spontaneous circulation
- "Efforts Discontinued" means resuscitation efforts stopped
- All others are interventions or medications
- If nothing matches, return null
- Be liberal: "gave the epi" means Epinephrine, "shocked" means Defibrillation, "pushed amio" means Amiodarone

Interventions: ${interventions.map(i => i.label).join(', ')}
Medications: ${medications.map(m => m.label).join(', ')}`,
      response_json_schema: {
        type: 'object',
        properties: { matched: { type: ['string', 'null'] } },
      },
    });

    const matched = result?.matched;
    if (!matched) return null;
    if (matched === 'CPR')                 return { type: 'cpr', confidence: 0.65 };
    if (matched === 'ROSC')                return { type: 'rosc', confidence: 0.65 };
    if (matched === 'Efforts Discontinued') return { type: 'discontinue', confidence: 0.65 };
    if (interventions.find(i => i.label === matched))
      return { type: 'event', label: matched, category: 'intervention', confidence: 0.65 };
    if (medications.find(m => m.label === matched))
      return { type: 'event', label: matched, category: 'medication', confidence: 0.65 };
  } catch {}
  return null;
}
