import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isLoading = message.role === 'assistant' && !message.content && (!message.tool_calls || message.tool_calls.length === 0);

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-primary" />
        </div>
      )}
      <div className={cn('max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {isLoading ? (
          <div className="rounded-2xl px-4 py-3 bg-card border border-border">
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          </div>
        ) : message.content ? (
          <div className={cn(
            'rounded-2xl px-4 py-2.5',
            isUser ? 'bg-primary/20 border border-primary/40 text-foreground' : 'bg-card border border-border'
          )}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="my-0.5">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  code: ({ children }) => <code className="px-1 py-0.5 rounded bg-secondary text-xs font-mono">{children}</code>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        ) : null}

        {/* Tool calls */}
        {message.tool_calls?.map((tc, i) => (
          <div key={i} className="mt-1.5 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              tc.status === 'completed' ? 'bg-green-400' :
              tc.status === 'failed' || tc.status === 'error' ? 'bg-red-400' :
              'bg-amber-400 animate-pulse'
            )} />
            <span className="font-mono">{tc.name || 'function'}</span>
            <span className="text-muted-foreground/60">
              {tc.status === 'completed' ? '✓ done' : tc.status === 'running' || tc.status === 'in_progress' ? 'running…' : tc.status || ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}