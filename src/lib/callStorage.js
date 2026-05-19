import { markPending } from '@/lib/syncService';

const STORAGE_KEY = 'emit_calls';
const MAX_CALLS = 10;

export function getAllCalls() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCall(call) {
  const calls = getAllCalls();
  const existing = calls.findIndex(c => c.id === call.id);
  if (existing >= 0) {
    calls[existing] = call;
  } else {
    calls.unshift(call);
    if (calls.length > MAX_CALLS) {
      calls.splice(MAX_CALLS);
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
  markPending(call.id);
}

export function deleteCall(id) {
  const calls = getAllCalls().filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
}

export function getCall(id) {
  return getAllCalls().find(c => c.id === id) || null;
}

export function createNewCall() {
  return {
    id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    ended_at: null,
    events: [],
    cpr_active: false,
    rosc: false,
    discontinued: false,
    current_rhythm: null,
  };
}