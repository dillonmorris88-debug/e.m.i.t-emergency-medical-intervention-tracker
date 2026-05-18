import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAllCalls, createNewCall, saveCall } from '@/lib/callStorage';
import { Plus, Clock, Heart, ChevronRight, Bot } from 'lucide-react';
import { format } from 'date-fns';

export default function Home() {
  const navigate = useNavigate();
  const [recentCalls, setRecentCalls] = useState([]);

  useEffect(() => {
    setRecentCalls(getAllCalls().slice(0, 3));
  }, []);

  const startNewCall = () => {
    const call = createNewCall();
    saveCall(call);
    navigate(`/call/${call.id}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto px-4">
      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-16 pb-12">
        <div className="mb-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4 mx-auto glow-red">
            <Heart className="w-9 h-9 text-primary" fill="currentColor" />
          </div>
          <h1 className="text-center">
            <span className="block text-4xl font-black tracking-[0.15em] text-foreground">E.M.i.T.</span>
            <span className="block text-xs font-semibold tracking-widest text-muted-foreground uppercase mt-1">
              Emergency Medical Intervention Tracker
            </span>
          </h1>
        </div>

        <button
          onClick={startNewCall}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg bg-primary text-primary-foreground hover:opacity-90 btn-tap glow-red transition-all shadow-lg"
        >
          <Plus className="w-6 h-6" />
          New Call
        </button>

        <p className="mt-4 text-xs text-muted-foreground text-center">
          Say <span className="font-bold text-primary">"EMIT"</span> + action to log hands-free
        </p>
      </div>

      {/* Recent Calls */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Recent Calls</h2>
          <button
            onClick={() => navigate('/history')}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 btn-tap transition-colors"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentCalls.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
            No calls recorded yet
          </div>
        ) : (
          <div className="space-y-2">
            {recentCalls.map(call => (
              <button
                key={call.id}
                onClick={() => navigate(`/call/${call.id}`)}
                className="w-full flex items-center justify-between bg-card border border-border rounded-xl p-4 hover:border-border/80 btn-tap transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {format(new Date(call.started_at), 'MMM d, yyyy · HH:mm')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(call.events || []).length} events logged
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {call.rosc && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-300 font-bold">ROSC</span>
                  )}
                  {!call.ended_at && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 font-bold pulse-red">Active</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="py-6 text-center text-xs text-muted-foreground/40">
        Saves last 10 calls · Auto-erases oldest
      </div>
    </div>
  );
}