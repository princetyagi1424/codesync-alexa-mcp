import React, { useState } from 'react';
import { Terminal, Trash2, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, Wrench } from 'lucide-react';

export interface InspectorEntry {
  id: string;
  type: 'request' | 'response' | 'tool';
  method: string;
  status: 'pending' | 'success' | 'error';
  payload: unknown;
  durationMs: number;
  toolUsed?: string | null;
  timestamp: Date;
}

interface Props {
  entries: InspectorEntry[];
  onClear: () => void;
}

function StatusIcon({ status }: { status: InspectorEntry['status'] }) {
  if (status === 'pending') return <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
  if (status === 'success') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
  return <XCircle className="w-3.5 h-3.5 text-red-400" />;
}

function TypeBadge({ type }: { type: InspectorEntry['type'] }) {
  const colors = {
    request: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    response: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    tool: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${colors[type]}`}>
      {type}
    </span>
  );
}

function EntryCard({ entry }: { entry: InspectorEntry }) {
  const [open, setOpen] = useState(entry.type === 'tool' || entry.status === 'error');

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900/60 overflow-hidden animate-fade-in">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/40 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
        <StatusIcon status={entry.status} />
        <TypeBadge type={entry.type} />
        <span className="text-xs font-mono text-slate-200 truncate flex-1">{entry.method}</span>
        {entry.toolUsed && (
          <span className="flex items-center gap-1 text-[10px] text-indigo-300">
            <Wrench className="w-3 h-3" />
            {entry.toolUsed}
          </span>
        )}
        <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
          {entry.durationMs > 0 ? `${entry.durationMs}ms` : '—'}
        </span>
        <span className="text-[10px] text-slate-600 shrink-0">
          {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </button>
      {open && (
        <div className="border-t border-slate-800 bg-slate-950/80">
          <pre className="p-3 text-[11px] leading-relaxed font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto inspector-scroll">
            {JSON.stringify(entry.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function McpInspector({ entries, onClear }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold">MCP Live Inspector</h2>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            JSON-RPC style
          </span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors"
          title="Clear inspector"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      <div className="px-3 py-2 border-b border-slate-800/60 bg-slate-900/30">
        <p className="text-[11px] text-slate-500 leading-snug">
          Real-time payloads of every <code className="text-indigo-300">/api/alexa/process</code> call and MCP tool
          execution. Proves the backend never exposes secrets to the browser.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 inspector-scroll">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
            <Terminal className="w-8 h-8 opacity-40" />
            <p>No MCP traffic yet</p>
            <p className="text-xs text-center max-w-[200px]">
              Send a command in the Alexa simulator to see live JSON-RPC style payloads.
            </p>
          </div>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
