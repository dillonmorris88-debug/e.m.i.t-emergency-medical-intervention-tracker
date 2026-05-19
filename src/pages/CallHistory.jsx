import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCalls, deleteCall } from '@/lib/callStorage';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { Clock, Trash2, ChevronRight, Heart, Activity, ChevronLeft, GitBranch, Check, Loader2 } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/eventData';
import { base44 } from '@/api/base44Client';

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [syncingId, setSyncingId] = useState(null);
  const [syncedIds, setSyncedIds] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    setCalls(getAllCalls());
  }, []);

  const handleSync = async (call, e) => {
    e.stopPropagation();
    setSyncingId(call.id);
    const res = await base44.functions.invoke('syncToGithubProject', { call });
    setSyncingId(null);
    if (res.data?.success) {
      setSyncedIds(prev => ({ ...prev, [call.id]: true }));
    } else {
      alert('Sync failed: ' + (res.data?.error || 'Unknown error'));
    }
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this call record?')) {
      deleteCall(id);
      setCalls(getAllCalls());
    }
  };

  const getDuration = (call) => {
    if (!call.ended_at) return 'Active';
    const dur = intervalToDuration({ start: new Date(call.started_at), end: new Date(call.ended_at) });
    return formatDuration(dur, { format: ['hours', 'minutes', 'seconds'] }) || '< 1 sec';
  };

  const getEventCount = (call, category) =>
    (call.events || []).filter(e => e.category === category).length;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto px-4 py-6">
      <div className="mb-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors btn-tap mb-3">
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Home</span>
        </button>
        <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">E.M.i.T.</span>
        <h2 className="text-xl font-bold text-foreground mt-1">Call History</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Last {calls.length} of 10 calls</p>
      </div>

      {calls.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No calls recorded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => (
            <div
              key={call.id}
              onClick={() => navigate(`/call/${call.id}`)}
              className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-border/80 btn-tap transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-foreground">
                      {format(new Date(call.started_at), 'MMM d, yyyy')}
                    </span>
                    {call.rosc && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-300 font-semibold">ROSC</span>
                    )}
                    {call.discontinued && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 border border-slate-500/40 text-slate-400 font-semibold">Discontinued</span>
                    )}
                    {!call.ended_at && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 font-semibold">Active</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <Clock className="w-3 h-3" />
                    {format(new Date(call.started_at), 'HH:mm')} · {getDuration(call)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getEventCount(call, 'intervention') > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        {getEventCount(call, 'intervention')} interventions
                      </span>
                    )}
                    {getEventCount(call, 'medication') > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        {getEventCount(call, 'medication')} meds
                      </span>
                    )}
                    {getEventCount(call, 'cpr') > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-1">
                        <Heart className="w-3 h-3" /> CPR
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleSync(call, e)}
                    disabled={syncingId === call.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 btn-tap transition-colors disabled:opacity-50"
                    title="Sync to GitHub Project"
                  >
                    {syncingId === call.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : syncedIds[call.id] ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <GitBranch className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDelete(call.id, e)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 btn-tap transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}