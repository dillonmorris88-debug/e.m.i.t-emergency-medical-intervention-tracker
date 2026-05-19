import { Cloud, CloudOff, CloudUpload, AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * status: 'synced' | 'pending' | 'syncing' | 'offline' | 'error'
 * pendingCount: number
 */
export default function SyncIndicator({ status, pendingCount = 0 }) {
  const configs = {
    synced: {
      icon: CheckCircle2,
      label: 'Synced',
      color: 'text-green-400',
      bg: 'bg-green-500/10 border-green-500/25',
    },
    syncing: {
      icon: CloudUpload,
      label: 'Syncing…',
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/25',
      spin: true,
    },
    pending: {
      icon: Cloud,
      label: pendingCount > 0 ? `${pendingCount} pending` : 'Pending',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/25',
    },
    offline: {
      icon: CloudOff,
      label: 'Offline',
      color: 'text-muted-foreground',
      bg: 'bg-secondary border-border',
    },
    error: {
      icon: AlertCircle,
      label: 'Sync failed',
      color: 'text-destructive',
      bg: 'bg-destructive/10 border-destructive/25',
    },
  };

  const cfg = configs[status] || configs.offline;
  const Icon = cfg.icon;

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
      <Icon className={`w-3 h-3 ${cfg.spin ? 'animate-pulse' : ''}`} />
      <span>{cfg.label}</span>
    </div>
  );
}