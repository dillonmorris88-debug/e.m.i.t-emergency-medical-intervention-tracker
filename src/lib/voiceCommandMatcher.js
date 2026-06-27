/**
 * Voice command matching via a priority-ordered keyword map.
 *
 * ── Bug fix (substring over-matching) ─────────────────────────────────────────
 * Earlier versions used `transcript.includes(keyword)`, which caused unrelated
 * phrases to incorrectly trigger procedure commands:
 *   "I have an idea"          → "iv"  → IV Access      ❌
 *   "no other intervention"   → "io"  → IO Access      ❌
 *   "give me the letter"      → "ett" → Intubation     ❌
 *   "five minutes"            → "iv"  → IV Access      ❌
 *
 * Now every keyword is compiled to a word-boundary regex:
 *   - Keywords ≥ 5 chars allow word-suffix matching (\b<kw>\w*\b), so
 *     "intubat" still matches "intubation", "intubated", "intubating".
 *   - Keywords ≤ 4 chars require exact whole-word match (\b<kw>\b), so
 *     "iv" matches only " iv " — never " ivy ", " five ", " give ".
 *
 * matchVoiceCommand() returns a confidence score so callers can decide
 * whether to auto-execute, prompt, or refuse.
 */

/**
 * COMMAND_MAP — single source of truth for built-in commands.
 *
 * Each entry is one of:
 *   { keywords, action: 'rosc' | 'cpr' | 'discontinue' }
 *   { keywords, label, category }
 *
 * Keep specific phrases ABOVE general ones (e.g. "dirty epi" before "epi"),
 * because the first matching entry wins.
 */
export const COMMAND_MAP = [
  // ── CPR / Cardiac outcomes ─────────────────────────────────────────────────
  { keywords: ['rosc', 'return of spontaneous', 'pulse back', 'got a pulse', 'pulse is back'], action: 'rosc' },
  { keywords: ['cpr', 'compressions', 'start compressions', 'start cpr', 'begin cpr'],          action: 'cpr' },
  { keywords: ['discontinue', 'efforts discontinued', 'cease efforts', 'call it', 'stop resuscitation', 'call the code'], action: 'discontinue' },
  { keywords: ['patient contact', 'on scene', 'arrived on scene', 'patient on scene'],          label: 'Patient Contact', category: 'notes' },

  // ── Rhythms ────────────────────────────────────────────────────────────────
  { keywords: ['vfib', 'v fib', 'v-fib', 'ventricular fib', 'v. fib', 'ventricular fibrillation'],   label: 'V-Fib', category: 'rhythm' },
  { keywords: ['vtach', 'v tach', 'v-tach', 'ventricular tach', 'v. tach', 'ventricular tachycardia'], label: 'V-Tach', category: 'rhythm' },
  { keywords: ['pea', 'p.e.a', 'pulseless electrical'],                       label: 'PEA',         category: 'rhythm' },
  { keywords: ['asystole', 'flatline', 'flat line', 'no rhythm'],            label: 'Asystole',    category: 'rhythm' },
  { keywords: ['normal sinus', 'nsr', 'sinus rhythm', 'normal rhythm'],      label: 'Normal Sinus',category: 'rhythm' },
  { keywords: ['afib', 'a fib', 'a-fib', 'atrial fib', 'atrial fibrillation'], label: 'A-Fib',     category: 'rhythm' },
  { keywords: ['svt', 's.v.t', 'supraventricular'],                          label: 'SVT',         category: 'rhythm' },
  { keywords: ['brady', 'bradycardia', 'slow heart'],                        label: 'Bradycardia', category: 'rhythm' },

  // ── Interventions (specific before general) ────────────────────────────────
  { keywords: ['king airway', 'king ltd', 'king tube'],                                                   label: 'King Airway',         category: 'intervention' },
  // "intubat" is long enough (7 chars) that the matcher will also accept
  // "intubation", "intubated", "intubating" via the \w* suffix rule.
  { keywords: ['intubat', 'endotracheal', 'e.t.t'],                                                       label: 'Intubation',          category: 'intervention' },
  { keywords: ['needle decompress', 'needle decompression'],                                              label: 'Needle Decompression',category: 'intervention' },
  { keywords: ['cardiovert', 'cardioversion'],                                                            label: 'Cardioversion',       category: 'intervention' },
  { keywords: ['defibrillat', 'defibrillation', 'defibrillated', 'shocked the patient', 'delivered shock'], label: 'Defibrillation',    category: 'intervention' },
  { keywords: ['12 lead', 'twelve lead', '12-lead', 'ekg', 'e.k.g'],                                      label: '12-Lead ECG',         category: 'intervention' },
  { keywords: ['wound pack', 'wound packing'],                                                            label: 'Wound Packing',       category: 'intervention' },
  // IV / IO: DO NOT use bare acronyms ('iv', 'io', 'i.v', 'i.o') as standalone keywords.
  // Even with word-boundary regexes, Whisper occasionally transcribes ambiguous speech
  // ("I have", "I've", "aye") as "iv", which caused phantom IV Access logs.
  // Only compound phrases that unambiguously mean IV/IO are permitted here.
  // The SpeechAdaptationAgent additionally applies an IV false-positive penalty if the
  // post-match transcript lacks one of the strict phrases (see speechAdaptationAgent.js).
  { keywords: ['iv access', 'start iv', 'establish iv', 'iv obtained', 'iv in place', 'started an iv', 'iv started', 'intravenous access', 'get an iv', 'iv line'], label: 'IV Access', category: 'intervention' },
  { keywords: ['io access', 'start io', 'establish io', 'io obtained', 'io in place', 'intraosseous', 'io line', 'i.o. line'],                                       label: 'IO Access', category: 'intervention' },
  { keywords: ['spinal', 'c-spine', 'c spine', 'cervical collar', 'spinal restriction'],                  label: 'Spinal Restriction',  category: 'intervention' },
  { keywords: ['bvm', 'b.v.m', 'bag valve', 'bag-valve', 'bagging the patient'],                          label: 'BVM',                 category: 'intervention' },
  // "airway" alone is ambiguous; require a qualifier or supraglottic term.
  { keywords: ['airway placement', 'placed airway', 'supraglottic'],                                      label: 'Airway Placement',    category: 'intervention' },
  { keywords: ['cpap', 'c-pap', 'c pap'],                                                                 label: 'CPAP',                category: 'intervention' },
  { keywords: ['tourniquet'],                                                                             label: 'Tourniquet',          category: 'intervention' },
  { keywords: ['splint', 'immobiliz'],                                                                    label: 'Splinting',           category: 'intervention' },
  { keywords: ['oxygen', 'o2', 'oxygen applied', 'applied oxygen'],                                       label: 'O2 Applied',          category: 'intervention' },

  // ── Medications (specific before general) ─────────────────────────────────
  { keywords: ['dirty epi', 'epi drip', 'epinephrine drip', 'adrenaline drip', 'epi infusion'],                  label: 'Dirty Epi Drip', category: 'medication' },
  { keywords: ['epi', 'epinephrine', 'adrenaline', 'gave epi', 'pushed epi'],                                    label: 'Epinephrine',    category: 'medication' },
  { keywords: ['ofirmev', 'offirmev', 'o firmev', 'acetaminophen iv', 'tylenol iv'],                             label: 'Ofirmev',        category: 'medication' },
  { keywords: ['fluid bolus', 'normal saline', 'lactated ringers', 'ns bolus', 'saline bolus'],                  label: 'Fluid Bolus',    category: 'medication' },
  { keywords: ['fentanyl', 'fentanil', 'pushed fentanyl'],                                                        label: 'Fentanyl',       category: 'medication' },
  { keywords: ['ketamine', 'ketamin'],                                                                            label: 'Ketamine',       category: 'medication' },
  { keywords: ['ativan', 'lorazepam'],                                                                            label: 'Ativan',         category: 'medication' },
  { keywords: ['versed', 'midazolam'],                                                                            label: 'Versed',         category: 'medication' },
  { keywords: ['morphine'],                                                                                       label: 'Morphine',       category: 'medication' },
  { keywords: ['adenosine'],                                                                                      label: 'Adenosine',      category: 'medication' },
  { keywords: ['amiodarone', 'amiodaron', 'amio', 'cordarone'],                                                  label: 'Amiodarone',     category: 'medication' },
  { keywords: ['aspirin', 'asa'],                                                                                 label: 'Aspirin',        category: 'medication' },
  { keywords: ['narcan', 'naloxone'],                                                                             label: 'Narcan',         category: 'medication' },
  { keywords: ['dextrose', 'd50', 'd 50', 'dextrose 50'],                                                         label: 'Dextrose',       category: 'medication' },
  { keywords: ['nitro', 'nitroglycerin', 'nitroglycerine'],                                                       label: 'Nitro',          category: 'medication' },
  { keywords: ['albuterol', 'duoneb', 'nebulizer treatment'],                                                     label: 'Albuterol',      category: 'medication' },
];

/**
 * Procedures that ABSOLUTELY MUST NOT be triggered from unclear or
 * low-confidence speech. These were over-matching short transcripts that
 * happened to contain the substring "iv", "io", or "intubat".
 *
 * Enforced in two places:
 *   1. The NLU fallback in ActiveCall.jsx refuses to fire these labels.
 *   2. Strict-procedure matches under STRICT_PROCEDURE_MIN_CONFIDENCE
 *      become "Command not recognized" instead of executing or prompting.
 */
export const STRICT_PROCEDURE_COMMANDS = new Set([
  'IV Access',
  'IO Access',
  'Intubation',
]);

/** Minimum confidence required to log a strict procedure command. */
export const STRICT_PROCEDURE_MIN_CONFIDENCE = 0.92;

// ── Internal: regex compilation ───────────────────────────────────────────────

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Build a word-boundary regex for a keyword.
 *
 *   - keywords ≥ 5 chars: \b<kw>\w*\b   (allows suffix — "intubat" → "intubation")
 *   - keywords ≤ 4 chars: \b<kw>\b      (exact whole word — prevents "iv" matching "five")
 *
 * Short medical acronyms (iv, io, asa, tq, ett, bvm, svt, pea, nsr) MUST be
 * matched as standalone words; otherwise they fire on common English text.
 */
function makeKeywordRegex(kw) {
  const escaped = kw.replace(REGEX_SPECIALS, '\\$&');
  const allowSuffix = kw.length >= 5;
  const pattern = allowSuffix ? `\\b${escaped}\\w*\\b` : `\\b${escaped}\\b`;
  return new RegExp(pattern, 'i');
}

// Precompile patterns once at module load — matchVoiceCommand runs on every
// recognized utterance, so we don't want to rebuild regexes per call.
const COMPILED_MAP = COMMAND_MAP.map(entry => ({
  ...entry,
  patterns: entry.keywords.map(makeKeywordRegex),
}));

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Match a voice command transcript to an EMiT action.
 *
 * Returns one of:
 *   { type: 'event',       label, category, confidence }
 *   { type: 'rosc',                 confidence }
 *   { type: 'cpr',                  confidence }
 *   { type: 'discontinue',          confidence }
 *   null   (no match)
 *
 * Confidence ladder:
 *   0.95 — user-taught alias OR built-in keyword/regex hit (both high-trust)
 *
 * NOTE: keyword hits must score at or above STRICT_PROCEDURE_MIN_CONFIDENCE
 * (0.92), otherwise strict procedures (IV/IO/Intubation) can NEVER fire from a
 * keyword match — which was a regression when the threshold was raised to 0.92
 * while keyword hits still returned 0.90.
 *
 * @param {string} transcript
 * @param {Object} aliases      - { [itemKey]: string[] } from useVoiceAliases
 * @param {Array}  interventions
 * @param {Array}  medications
 */
export function matchVoiceCommand(transcript, aliases = {}, interventions = [], medications = []) {
  if (!transcript) return null;
  const t = transcript.toLowerCase();

  // 1. User-taught aliases first — these are explicit training data and
  //    take priority over the built-in keyword map.
  const allItems = [...interventions, ...medications];
  for (const item of allItems) {
    const itemAliases = aliases[item.key] || [];
    // Apply the same word-boundary rule to aliases too, otherwise a user
    // who trained "iv" would re-introduce the substring bug.
    if (itemAliases.some(phrase => makeKeywordRegex(phrase).test(t))) {
      const cat = interventions.find(i => i.key === item.key) ? 'intervention' : 'medication';
      return { type: 'event', label: item.label, category: cat, confidence: 0.95 };
    }
  }

  // 2. Built-in keyword map (priority-ordered).
  for (const entry of COMPILED_MAP) {
    if (entry.patterns.some(p => p.test(t))) {
      if (entry.action === 'rosc')        return { type: 'rosc',        confidence: 0.95 };
      if (entry.action === 'cpr')         return { type: 'cpr',         confidence: 0.95 };
      if (entry.action === 'discontinue') return { type: 'discontinue', confidence: 0.95 };
      return { type: 'event', label: entry.label, category: entry.category, confidence: 0.95 };
    }
  }

  return null;
}

/**
 * NLU fallback — calls InvokeLLM to interpret natural-language commands that
 * keyword matching missed. Only call this when matchVoiceCommand() returns null.
 *
 * IMPORTANT: callers must NOT auto-execute STRICT_PROCEDURE_COMMANDS returned
 * by this function — the 0.65 confidence is too low for those procedures.
 */
export async function matchVoiceCommandNLU(transcript, interventions = [], medications = [], invokeLLM) {
  if (!invokeLLM || !transcript) return null;
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
- If nothing clearly matches, return null. Do NOT guess.
- Never match unclear or partial phrases to IV Access, IO Access, or Intubation — those require an explicit clear utterance.
- Be liberal for clear medication mentions: "gave the epi" → Epinephrine, "shocked" → Defibrillation, "pushed amio" → Amiodarone.

Interventions: ${interventions.map(i => i.label).join(', ')}
Medications: ${medications.map(m => m.label).join(', ')}`,
      response_json_schema: {
        type: 'object',
        properties: { matched: { type: ['string', 'null'] } },
      },
    });

    const matched = result?.matched;
    if (!matched) return null;
    if (matched === 'CPR')                  return { type: 'cpr',         confidence: 0.65 };
    if (matched === 'ROSC')                 return { type: 'rosc',        confidence: 0.65 };
    if (matched === 'Efforts Discontinued') return { type: 'discontinue', confidence: 0.65 };
    if (interventions.find(i => i.label === matched))
      return { type: 'event', label: matched, category: 'intervention', confidence: 0.65 };
    if (medications.find(m => m.label === matched))
      return { type: 'event', label: matched, category: 'medication', confidence: 0.65 };
  } catch {}
  return null;
}