import { Clock } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/eventData';
import { format } from 'date-fns';

export default function EventLog({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No events logged yet.<br />
        <span className="text-xs opacity-60">Say "EMIT" + action or tap a button</span>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="space-y-2">
      {sorted.map((event) => (
        <div
          key={event.id}
          className={`flex items-start gap-3 p-3 rounded-lg border ${CATEGORY_COLORS[event.category] || CATEGORY_COLORS.notes} fade-in`}
        >
          <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-70" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{event.label}</div>
            {event.details && <div className="text-xs opacity-70 mt-0.5">{event.details}</div>}
          </div>
          <div className="font-mono text-xs opacity-60 flex-shrink-0">
            {format(new Date(event.timestamp), 'HH:mm:ss')}
          </div>
        </div>
      ))}
    </div>
  );
}