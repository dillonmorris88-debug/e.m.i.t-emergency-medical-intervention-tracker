/**
 * Voice command matching via a priority-ordered keyword map.
 * More specific phrases are listed before general ones to avoid false matches.
 */

// Each entry: { keywords: string[], label: string, category: string }
// Order matters — more specific entries MUST come before general ones.
const COMMAND_MAP = [
  // --- CPR / Cardiac outcomes (check before rhythm keywords) ---
  { keywords: ['rosc', 'return of spontaneous', 'pulse back', 'got a pulse'], action: 'rosc' },
  { keywords: ['cpr', 'compressions', 'start compressions', 'start cpr'], action: 'cpr' },

  // --- Rhythms ---
  { keywords: ['vfib', 'v fib', 'v-fib', 'ventricular fib', 'v. fib'], label: 'V-Fib', category: 'rhythm' },
  { keywords: ['vtach', 'v tach', 'v-tach', 'ventricular tach', 'v. tach'], label: 'V-Tach', category: 'rhythm' },
  { keywords: ['pea', 'p.e.a', 'pulseless electrical'], label: 'PEA', category: 'rhythm' },
  { keywords: ['asystole', 'flatline', 'flat line', 'no rhythm'], label: 'Asystole', category: 'rhythm' },
  { keywords: ['normal sinus', 'nsr', 'sinus rhythm', 'normal rhythm'], label: 'Normal Sinus', category: 'rhythm' },
  { keywords: ['afib', 'a fib', 'a-fib', 'atrial fib'], label: 'A-Fib', category: 'rhythm' },
  { keywords: ['svt', 's.v.t', 'supraventricular'], label: 'SVT', category: 'rhythm' },
  { keywords: ['brady', 'bradycardia', 'slow heart'], label: 'Bradycardia', category: 'rhythm' },

  // --- Interventions (specific before general) ---
  { keywords: ['king airway', 'king ltd', 'king tube'], label: 'King Airway', category: 'intervention' },
  { keywords: ['intubat', 'ett', 'e.t.t', 'endotracheal'], label: 'Intubation', category: 'intervention' },
  { keywords: ['needle decompress', 'needle d', 'needle decompression', 'decompress'], label: 'Needle Decompression', category: 'intervention' },
  { keywords: ['cardiovert'], label: 'Cardioversion', category: 'intervention' },
  { keywords: ['defib', 'defibrillat', 'shock'], label: 'Defibrillation', category: 'intervention' },
  { keywords: ['12 lead', 'twelve lead', '12-lead', 'ecg', 'ekg'], label: '12-Lead ECG', category: 'intervention' },
  { keywords: ['wound pack', 'packing', 'wound plug'], label: 'Wound Packing', category: 'intervention' },
  { keywords: ['iv', 'intravenous', 'i.v'], label: 'IV Access', category: 'intervention' },
  { keywords: ['io', 'i.o', 'intraosseous'], label: 'IO Access', category: 'intervention' },
  { keywords: ['spinal', 'spine', 'c-spine', 'cervical'], label: 'Spinal Restriction', category: 'intervention' },
  { keywords: ['bvm', 'bag valve', 'bag-valve', 'bagging'], label: 'BVM', category: 'intervention' },
  { keywords: ['airway', 'supraglottic'], label: 'Airway Placement', category: 'intervention' },
  { keywords: ['cpap', 'c-pap', 'c pap'], label: 'CPAP', category: 'intervention' },
  { keywords: ['tourniquet', 'tourni', 'tq'], label: 'Tourniquet', category: 'intervention' },
  { keywords: ['splint', 'immobiliz'], label: 'Splinting', category: 'intervention' },
  { keywords: ['oxygen', 'o2', 'o 2', 'o-2', '02 applied', 'oxygen applied'], label: 'O2 Applied', category: 'intervention' },

  // --- Medications (specific before general) ---
  { keywords: ['dirty epi', 'epi drip', 'epinephrine drip', 'adrenaline drip', 'epi infusion'], label: 'Dirty Epi Drip', category: 'medication' },
  { keywords: ['epi', 'epinephrine', 'adrenaline'], label: 'Epinephrine', category: 'medication' },
  { keywords: ['ofirmev', 'offirmev', 'o firmev', 'acetaminophen iv', 'tylenol iv'], label: 'Ofirmev', category: 'medication' },
  { keywords: ['fluid', 'bolus', 'normal saline', 'lactated', 'ns bolus'], label: 'Fluid Bolus', category: 'medication' },
  { keywords: ['fentanyl', 'fentanil', 'fent'], label: 'Fentanyl', category: 'medication' },
  { keywords: ['ketamine', 'ketamin'], label: 'Ketamine', category: 'medication' },
  { keywords: ['ativan', 'lorazepam', 'loraze'], label: 'Ativan', category: 'medication' },
  { keywords: ['versed', 'midazolam', 'midaz'], label: 'Versed', category: 'medication' },
  { keywords: ['morphine', 'morph'], label: 'Morphine', category: 'medication' },
  { keywords: ['adenosine', 'adenazine', 'adeno'], label: 'Adenosine', category: 'medication' },
  { keywords: ['amiodarone', 'amiodaron', 'amio', 'cordarone'], label: 'Amiodarone', category: 'medication' },
  { keywords: ['aspirin', 'asa', 'a.s.a'], label: 'Aspirin', category: 'medication' },
  { keywords: ['narcan', 'naloxone', 'nalox'], label: 'Narcan', category: 'medication' },
  { keywords: ['dextrose', 'd50', 'd 50', 'glucose', 'sugar'], label: 'Dextrose', category: 'medication' },
  { keywords: ['nitro', 'nitroglycerin', 'nitroglycerine'], label: 'Nitro', category: 'medication' },
  { keywords: ['albuterol', 'albuter', 'duoneb', 'nebulizer', 'neb treatment'], label: 'Albuterol', category: 'medication' },
];

/**
 * Match a voice command string to an action.
 * Returns { type: 'event', label, category } | { type: 'rosc' } | { type: 'cpr' } | null
 */
export function matchVoiceCommand(transcript, aliases = {}, interventions = [], medications = []) {
  const t = transcript.toLowerCase();

  // 1. Check user-taught aliases first (highest priority)
  const allItems = [...interventions, ...medications];
  for (const item of allItems) {
    const itemAliases = aliases[item.key] || [];
    if (itemAliases.some(phrase => t.includes(phrase))) {
      const cat = interventions.find(i => i.key === item.key) ? 'intervention' : 'medication';
      return { type: 'event', label: item.label, category: cat };
    }
  }

  // 2. Walk the priority-ordered command map
  for (const entry of COMMAND_MAP) {
    if (entry.keywords.some(kw => t.includes(kw))) {
      if (entry.action === 'rosc') return { type: 'rosc' };
      if (entry.action === 'cpr') return { type: 'cpr' };
      return { type: 'event', label: entry.label, category: entry.category };
    }
  }

  return null;
}