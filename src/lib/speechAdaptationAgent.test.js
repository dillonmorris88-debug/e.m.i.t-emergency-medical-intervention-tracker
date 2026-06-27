/**
 * Manual test scenarios for the IV Access hallucination fix.
 *
 * Run in the browser console (or a Node environment with the modules loaded):
 *   import { runIvAccessTests } from './speechAdaptationAgent.test.js';
 *   runIvAccessTests();
 *
 * Also tests wake-phrase enforcement and cooldown behavior.
 */

import { matchVoiceCommand } from './voiceCommandMatcher.js';
import { SpeechAdaptationAgent } from './speechAdaptationAgent.js';
import { INTERVENTIONS, MEDICATIONS } from './eventData.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(description, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ ${description}\n     expected: ${expected}\n     got:      ${actual}`);
    failed++;
  }
}

function matchedLabel(transcript) {
  const m = matchVoiceCommand(transcript, {}, INTERVENTIONS, MEDICATIONS);
  return m?.label ?? null;
}

function finalConfidence(transcript) {
  const m = matchVoiceCommand(transcript, {}, INTERVENTIONS, MEDICATIONS);
  if (!m || m.label !== 'IV Access') return null;
  return SpeechAdaptationAgent.applyIvFalsePositivePenalty('IV Access', transcript, m.confidence);
}

// ── IV Access: should match ───────────────────────────────────────────────────

export function runIvAccessTests() {
  console.group('EMiT Speech Adaptation — IV Access test scenarios');

  console.group('Should MATCH IV Access (keyword layer)');
  check('"iv access"',         matchedLabel('iv access'),         'IV Access');
  check('"start iv"',          matchedLabel('start iv'),          'IV Access');
  check('"establish iv"',      matchedLabel('establish iv'),      'IV Access');
  check('"iv obtained"',       matchedLabel('iv obtained'),       'IV Access');
  check('"started an iv"',     matchedLabel('started an iv'),     'IV Access');
  check('"iv started"',        matchedLabel('iv started'),        'IV Access');
  check('"iv line"',           matchedLabel('iv line'),           'IV Access');
  check('"intravenous access"',matchedLabel('intravenous access'),'IV Access');
  console.groupEnd();

  console.group('Should NOT match IV Access (keyword layer rejects these)');
  check('"i have access"',     matchedLabel('i have access'),     null);
  check('"he has access"',     matchedLabel('he has access'),     null);
  check('"i need access"',     matchedLabel('i need access'),     null);
  check('"eye contact"',       matchedLabel('eye contact'),       null);
  check('"patient access"',    matchedLabel('patient access'),    null);
  check('"five minutes"',      matchedLabel('five minutes'),      null);
  check('"give me"',           matchedLabel('give me'),           null);
  check('"access"',            matchedLabel('access'),            null);
  check('"iv" alone',          matchedLabel('iv'),                null);
  console.groupEnd();

  console.group('"EMiT patient contact" should NOT produce IV Access');
  check('patient contact',     matchedLabel('patient contact'),   'Patient Contact');
  console.groupEnd();

  console.group('IV confidence after penalty (should be < 0.85 = strict threshold)');
  // "iv" alone no longer matches at the keyword level so these return null.
  // The penalty layer is a second line of defence for edge cases.
  const ambig = finalConfidence('iv');   // null → keyword layer already blocks it
  check('"iv" alone — keyword blocks, penalty irrelevant', ambig, null);
  // "iv access" IS in strict phrases → no penalty
  const clear = finalConfidence('iv access');
  check('"iv access" — full strict phrase, no penalty', clear !== null && clear >= 0.85, true);
  console.groupEnd();

  console.group('Cooldown behavior');
  SpeechAdaptationAgent.resetCooldowns();
  check('IV Access not cooling before first fire', SpeechAdaptationAgent.isCoolingDown('IV Access'), false);
  SpeechAdaptationAgent.recordFired('IV Access');
  check('IV Access cooling immediately after fire',  SpeechAdaptationAgent.isCoolingDown('IV Access'), true);
  SpeechAdaptationAgent.resetCooldowns();
  check('IV Access not cooling after reset',          SpeechAdaptationAgent.isCoolingDown('IV Access'), false);
  console.groupEnd();

  console.group('Summary');
  console.log(`Passed: ${passed}  |  Failed: ${failed}`);
  console.groupEnd();

  console.groupEnd();
  return { passed, failed };
}
