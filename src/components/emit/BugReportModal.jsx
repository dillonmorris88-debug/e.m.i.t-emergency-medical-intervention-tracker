import { useState } from 'react';
import { Bug, X, ExternalLink, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function BugReportModal({ call, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [issueUrl, setIssueUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const buildBody = () => {
    const events = (call?.events || [])
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(e => `- **[${new Date(e.timestamp).toLocaleTimeString()}]** ${e.category.toUpperCase()} — ${e.label}${e.details ? `: ${e.details}` : ''}`)
      .join('\n');

    return `## Clinical Bug Report — E.M.i.T.

**Call ID:** ${call?.id || 'N/A'}
**Started:** ${call?.started_at ? new Date(call.started_at).toLocaleString() : 'N/A'}
**CPR Active:** ${call?.cpr_active ? 'Yes' : 'No'}
**ROSC:** ${call?.rosc ? 'Yes' : 'No'}
**Discontinued:** ${call?.discontinued ? 'Yes' : 'No'}

## Description
${description || '_No description provided._'}

## Event Log
${events || '_No events recorded._'}

---
*Reported via E.M.i.T. App*`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !repo.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await base44.functions.invoke('createGithubIssue', {
        title: title.trim(),
        body: buildBody(),
        repo: repo.trim(),
      });
      setIssueUrl(res.data.url);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err?.response?.data?.error || err.message || 'Failed to create issue');
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-t-2xl p-5 pb-8 slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground">Log Clinical Bug Report</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground btn-tap">
            <X className="w-5 h-5" />
          </button>
        </div>

        {status === 'success' ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <Bug className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Issue Created!</p>
              <p className="text-sm text-muted-foreground mt-1">The bug report has been logged to GitHub.</p>
            </div>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary border border-border text-sm font-medium text-foreground hover:border-primary/50 btn-tap transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              View Issue on GitHub
            </a>
            <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">
                GitHub Repo <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                placeholder="owner/repository-name"
                value={repo}
                onChange={e => setRepo(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">
                Issue Title <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                placeholder="Brief summary of the bug..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1 block">
                Additional Details
              </label>
              <textarea
                placeholder="Describe the clinical issue or unexpected behavior..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The full event log for this call will be automatically attached to the issue.
            </p>
            {status === 'error' && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{errorMsg}</p>
            )}
            <button
              type="submit"
              disabled={status === 'loading' || !title.trim() || !repo.trim()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm bg-primary/20 border border-primary/60 text-primary hover:bg-primary/30 btn-tap transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating Issue...</>
              ) : (
                <><Bug className="w-4 h-4" /> Create GitHub Issue</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}