import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  requiresApproval?: boolean;
  isFallback?: boolean;
}

interface PendingApproval {
  approvalId: string;
  tool: string;
  draftComment: string;
}

interface AvailablePullRequest {
  number: number;
  title: string;
}

interface QuickAction {
  label: string;
  utterance: string;
  isApprove?: boolean;
}

interface Props {
  availablePullRequests: AvailablePullRequest[];
  messages: ChatMessage[];
  isProcessing: boolean;
  onSend: (utterance: string, approve?: boolean) => void;
  pendingApproval: PendingApproval | null;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Check open PRs', utterance: 'Alexa, check open PRs' },
  { label: 'Approve & post', utterance: 'Approve and post comment', isApprove: true },
];

// Browser SpeechRecognition types (Chrome / Edge)
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [index: number]: { transcript: string; confidence: number };
  readonly length: number;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((this: SpeechRecognitionLike, ev: Event & { error: string }) => void) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function AlexaSimulator({ availablePullRequests, messages, isProcessing, onSend, pendingApproval }: Props) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef('');

  const quickActions: QuickAction[] = [
    QUICK_ACTIONS[0],
    ...availablePullRequests.slice(0, 5).map((pr) => ({
      label: `Analyze PR #${pr.number}`,
      utterance: `Analyze PR number ${pr.number} for security issues`,
    })),
    QUICK_ACTIONS[1],
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing, interimTranscript]);

  // Check support on mount
  useEffect(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setMicSupported(false);
      setMicError('Voice not supported in this browser. Use Chrome or Edge.');
    }
  }, []);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(() => {
    if (isProcessing || isListening) return;

    const SR = getSpeechRecognition();
    if (!SR) {
      setMicSupported(false);
      setMicError('Voice not supported. Please use Chrome or Edge.');
      return;
    }

    setMicError(null);
    finalTranscriptRef.current = '';
    setInterimTranscript('');

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setMicError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      if (final) {
        finalTranscriptRef.current += final;
      }
      setInterimTranscript(interim || finalTranscriptRef.current);

      // Auto-send when we get a final result (single utterance mode)
      if (final && finalTranscriptRef.current.trim()) {
        const utterance = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = '';
        setInterimTranscript('');
        setInput('');
        // Small delay so UI can show "heard" state
        setTimeout(() => {
          onSend(utterance);
        }, 150);
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      const err = event.error || 'unknown';
      setIsListening(false);
      setInterimTranscript('');

      if (err === 'not-allowed' || err === 'permission-denied') {
        setMicError('Microphone permission denied. Allow mic access in browser settings.');
      } else if (err === 'no-speech') {
        setMicError('No speech detected. Tap the mic and try again.');
      } else if (err === 'aborted') {
        // user or code stopped — no error message needed
        setMicError(null);
      } else if (err === 'network') {
        setMicError('Network error during speech recognition. Check your connection.');
      } else {
        setMicError(`Mic error: ${err}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // If we still have interim text that never finalized, put it in the input box
      if (finalTranscriptRef.current.trim()) {
        const leftover = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = '';
        setInput(leftover);
        setInterimTranscript('');
      } else if (interimTranscript && !finalTranscriptRef.current) {
        // keep interim visible briefly via input if needed
      }
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      setIsListening(false);
      setMicError('Could not start microphone. Try again.');
      recognitionRef.current = null;
    }
  }, [isProcessing, isListening, onSend, interimTranscript]);

  const toggleMic = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;
    if (isListening) stopListening();
    onSend(input.trim());
    setInput('');
  };

  const handleQuick = (action: QuickAction) => {
    if (isProcessing) return;
    if (isListening) stopListening();
    if (action.isApprove) {
      if (pendingApproval) {
        onSend('Approve and post comment', true);
      } else {
        onSend(action.utterance);
      }
    } else {
      onSend(action.utterance);
    }
  };

  const statusText = isListening
    ? interimTranscript
      ? `Hearing: "${interimTranscript}"`
      : 'Listening… speak now'
    : isProcessing
    ? 'Listening & thinking…'
    : pendingApproval
    ? 'Awaiting your approval'
    : 'Ready — tap mic to speak';

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-950">
      {/* Echo Show style frame header */}
      <div className="flex items-center justify-center gap-3 py-4 border-b border-slate-800/80">
        <div className="relative">
          {/* Clickable mic ring */}
          <button
            type="button"
            onClick={toggleMic}
            disabled={isProcessing || !micSupported}
            title={
              !micSupported
                ? 'Voice not supported in this browser'
                : isListening
                ? 'Tap to stop listening'
                : 'Tap to speak'
            }
            className={`w-14 h-14 rounded-full border-4 flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-alexa-blue/50 disabled:opacity-50 disabled:cursor-not-allowed ${
              isListening
                ? 'border-alexa-ring alexa-ring animate-pulse-ring bg-alexa-blue/10 cursor-pointer'
                : isProcessing
                ? 'border-alexa-ring/60 alexa-ring bg-slate-900'
                : 'border-slate-600 hover:border-alexa-ring hover:alexa-ring bg-slate-900 cursor-pointer'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center ${
                isListening ? 'bg-alexa-blue/20' : 'bg-slate-900'
              }`}
            >
              {isListening ? (
                <Mic className="w-5 h-5 text-alexa-blue animate-pulse" />
              ) : isProcessing ? (
                <Loader2 className="w-5 h-5 text-alexa-blue animate-spin" />
              ) : (
                <Mic className={`w-5 h-5 ${micSupported ? 'text-slate-300' : 'text-slate-600'}`} />
              )}
            </div>
          </button>
          {/* Listening indicator dots */}
          {isListening && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-alexa-blue animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-alexa-blue animate-pulse [animation-delay:150ms]" />
              <span className="w-1 h-1 rounded-full bg-alexa-blue animate-pulse [animation-delay:300ms]" />
            </span>
          )}
        </div>
        <div className="text-center min-w-0 max-w-[220px]">
          <p className="text-sm font-medium text-slate-200">Echo Show Simulator</p>
          <p
            className={`text-xs truncate ${
              isListening ? 'text-alexa-blue' : micError ? 'text-amber-400' : 'text-slate-500'
            }`}
            title={micError || statusText}
          >
            {micError || statusText}
          </p>
        </div>
      </div>

      {/* Chat history */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 inspector-scroll">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`animate-fade-in flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : msg.role === 'system'
                  ? 'bg-slate-800/80 text-slate-300 border border-slate-700/50 rounded-bl-md'
                  : 'bg-slate-800 text-slate-100 rounded-bl-md border border-slate-700/40'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] opacity-60">
                <span>
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                {msg.isFallback && (
                  <span className="flex items-center gap-0.5 text-amber-400">
                    <AlertTriangle className="w-2.5 h-2.5" /> offline
                  </span>
                )}
                {msg.requiresApproval && (
                  <span className="flex items-center gap-0.5 text-emerald-400">
                    <CheckCircle2 className="w-2.5 h-2.5" /> needs approval
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {isListening && interimTranscript && (
          <div className="flex justify-end animate-fade-in">
            <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-indigo-600/40 border border-indigo-500/40 text-indigo-100 italic">
              {interimTranscript}…
            </div>
          </div>
        )}
        {isProcessing && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-alexa-blue" />
              CodeSync AI is working…
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-slate-800/60">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => handleQuick(action)}
            disabled={isProcessing || (action.isApprove && !pendingApproval)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              action.isApprove
                ? pendingApproval
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-slate-700 text-slate-600 cursor-not-allowed'
                : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:border-indigo-500/50'
            } disabled:opacity-50`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input + mic button */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-slate-800 flex gap-2">
        <button
          type="button"
          onClick={toggleMic}
          disabled={isProcessing || !micSupported}
          title={isListening ? 'Stop listening' : 'Start voice input'}
          className={`shrink-0 px-3 py-2.5 rounded-xl border transition-colors ${
            isListening
              ? 'bg-alexa-blue/20 border-alexa-blue text-alexa-blue'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-alexa-blue/50 hover:text-alexa-blue'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <input
          type="text"
          value={isListening && interimTranscript ? interimTranscript : input}
          onChange={(e) => {
            if (!isListening) setInput(e.target.value);
          }}
          placeholder={
            isListening
              ? 'Listening… speak now'
              : 'Try: "Alexa, check open PRs" or tap the mic'
          }
          disabled={isProcessing}
          readOnly={isListening}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/60 placeholder:text-slate-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isProcessing || isListening || !input.trim()}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
    </div>
  );
}
