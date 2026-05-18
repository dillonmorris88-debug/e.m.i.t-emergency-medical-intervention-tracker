import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bot, Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import MessageBubble from '@/components/emit/MessageBubble';

export default function Scribe() {
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  // Create a new conversation on mount
  useEffect(() => {
    base44.agents.createConversation({
      agent_name: 'emit_scribe',
      metadata: { name: 'E.M.i.T. Scribe Session' },
    }).then(c => {
      setConversation(c);
      setMessages(c.messages || []);
    });
  }, []);

  // Subscribe to live updates
  useEffect(() => {
    if (!conversation?.id) return;
    const unsub = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return unsub;
  }, [conversation?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !conversation || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    await base44.agents.addMessage(conversation, { role: 'user', content: text });
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors btn-tap"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Home</span>
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">E.M.i.T.</span>
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-semibold">Scribe</span>
          </div>
        </div>
        <div className="w-16" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!conversation && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        )}
        {messages.length === 0 && conversation && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">E.M.i.T. Scribe</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Tell me what was given or done on your call — I'll structure and log it to the record. Start with your call ID.
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-2 w-full max-w-xs">
              {[
                'Call ID abc123 — gave epi 1mg IV push, started CPR',
                'Call ID abc123 — patient in V-Fib, defibrillated',
                'Call ID abc123 — Narcan 2mg IN, fluid bolus 500mL',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 btn-tap transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id || i} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what was given or done…"
            rows={2}
            className="flex-1 bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !conversation || sending}
            className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/60 text-primary flex items-center justify-center btn-tap hover:bg-primary/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}