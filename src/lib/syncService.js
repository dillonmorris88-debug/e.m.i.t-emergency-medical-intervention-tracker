/**
 * Sync Service — offline-first strategy for E.M.i.T.
 *
 * All writes go to localStorage first (instant, works offline).
 * This service attempts to sync local calls to the CallRecord entity
 * whenever connectivity is available.
 *
 * Sync state per call is stored in localStorage under 'emit_sync_state':
 *   { [callId]: 'pending' | 'synced' | 'error' }
 */

import { base44 } from '@/api/base44Client';
import { getAllCalls } from '@/lib/callStorage';

const SYNC_STATE_KEY = 'emit_sync_state';

export function getSyncState() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STATE_KEY)) || {};
  } catch {
    return {};
  }
}

function setSyncState(state) {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

export function markPending(callId) {
  const state = getSyncState();
  if (state[callId] !== 'synced') {
    state[callId] = 'pending';
    setSyncState(state);
  }
}

export function getPendingCount() {
  const state = getSyncState();
  return Object.values(state).filter(s => s === 'pending' || s === 'error').length;
}

/**
 * Attempt to sync all pending calls to the server.
 * Returns { synced: number, failed: number }
 */
export async function syncPendingCalls() {
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  const state = getSyncState();
  const calls = getAllCalls();
  let synced = 0;
  let failed = 0;

  for (const call of calls) {
    const status = state[call.id];
    if (status === 'synced') continue;

    try {
      // Try to find an existing server record for this call
      const existing = await base44.entities.CallRecord.filter({ call_number: call.id });

      const payload = {
        call_number: call.id,
        started_at: call.started_at,
        ended_at: call.ended_at || null,
        events: call.events || [],
        cpr_active: !!call.cpr_active,
        rosc: !!call.rosc,
        discontinued: !!call.discontinued,
        current_rhythm: call.current_rhythm || null,
      };

      if (existing && existing.length > 0) {
        await base44.entities.CallRecord.update(existing[0].id, payload);
      } else {
        await base44.entities.CallRecord.create(payload);
      }

      state[call.id] = 'synced';
      synced++;
    } catch {
      state[call.id] = 'error';
      failed++;
    }
  }

  setSyncState(state);
  return { synced, failed };
}

/**
 * Subscribe to online/offline events and trigger sync automatically.
 * Returns an unsubscribe function.
 */
export function autoSync(onStatusChange) {
  const handleOnline = async () => {
    onStatusChange?.('syncing');
    const result = await syncPendingCalls();
    onStatusChange?.(result.failed > 0 ? 'error' : 'synced');
  };

  const handleOffline = () => {
    onStatusChange?.('offline');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Trigger an initial sync if we're already online
  if (navigator.onLine) {
    handleOnline();
  } else {
    onStatusChange?.('offline');
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}