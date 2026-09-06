import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { ProductionBatch, BatchChatMessage, FarmMember } from '../types';
import { getBatchMessages, addBatchMessage } from '../lib/farmService';
import ReactMarkdown from 'react-markdown';
import {
  MessageSquare,
  Bot,
  User as UserIcon,
  Send,
  Loader2,
  X,
  Sparkles,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface BatchChatModalProps {
  farmId: string;
  batch: ProductionBatch | null;
  user: User;
  member: FarmMember;
  isOpen: boolean;
  onClose: () => void;
}

export const BatchChatModal: React.FC<BatchChatModalProps> = ({
  farmId,
  batch,
  user,
  member,
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<BatchChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load message history from Firestore on open
  useEffect(() => {
    if (isOpen && batch && farmId) {
      loadMessages();
    }
  }, [isOpen, batch?.id, farmId]);

  const loadMessages = async () => {
    if (!batch) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const fetched = await getBatchMessages(farmId, batch.id);
      setMessages(fetched);
    } catch (err: any) {
      console.error('Failed to load batch chat messages:', err);
      setErrorMessage('Could not load chat history from database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  if (!isOpen || !batch) return null;

  const quickQuestions = [
    `Why is ${batch.conditions.temperature || 'this temperature'} recommended for ${batch.productName}?`,
    'What if ambient humidity rises significantly during processing?',
    'What sensory checks confirm target readiness without lab equipment?',
    'How should we package this batch once ready to maximize shelf life?',
  ];

  const handleSendMessage = async (queryToSend?: string) => {
    const text = (queryToSend || inputQuery).trim();
    if (!text || isSending) return;

    setInputQuery('');
    setErrorMessage(null);
    setIsSending(true);

    const userMessageObj: BatchChatMessage = {
      id: 'msg_temp_' + Date.now(),
      role: 'user',
      content: text,
      senderUid: user.uid,
      senderName: user.displayName || member.roleLabel || 'Team Member',
      createdAt: new Date(),
    };

    // Optimistically update UI
    setMessages((prev) => [...prev, userMessageObj]);

    try {
      // 1. Save user message to Firestore
      const userMsgId = await addBatchMessage(farmId, batch.id, {
        role: 'user',
        content: text,
        senderUid: user.uid,
        senderName: user.displayName || member.roleLabel || 'Team Member',
      });
      userMessageObj.id = userMsgId;

      // 2. Call server-side multi-turn chat endpoint
      const response = await fetch(`/api/batches/${batch.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: batch.productName,
          processingType: batch.processingType,
          conditions: batch.conditions,
          schedule: batch.schedule,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          query: text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'AI server responded with error');
      }

      const modelReply = data.reply || 'No response generated.';

      // 3. Save model reply to Firestore
      const modelMsgId = await addBatchMessage(farmId, batch.id, {
        role: 'model',
        content: modelReply,
        senderName: `Gemini (${data.modelUsed || 'AI'})`,
      });

      const modelMessageObj: BatchChatMessage = {
        id: modelMsgId,
        role: 'model',
        content: modelReply,
        senderName: `Gemini (${data.modelUsed || 'AI'})`,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, modelMessageObj]);
    } catch (err: any) {
      console.error('Error in batch chat:', err);
      setErrorMessage(err?.message || 'Failed to get answer from Gemini.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col h-[88vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Ask AI: {batch.productName}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  {batch.processingType}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-turn process consultation grounded in batch conditions &amp; schedule
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Batch Condition Sub-strip */}
        <div className="px-5 py-2.5 bg-slate-100 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Temp: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.temperature || 'N/A'}</strong>
          </span>
          <span>
            Humidity: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.humidity || 'N/A'}</strong>
          </span>
          <span>
            Method: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.method || 'Standard'}</strong>
          </span>
          <span>
            Target: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.duration || 'Standard'}</strong>
          </span>
        </div>

        {/* Chat Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/50 dark:bg-slate-900/50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-xs">Loading batch conversation thread...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                Start technical consultation for this batch
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                Ask anything about moisture targets, drying rates, fermentation progression, spice heat preservation, or contingency measures.
              </p>

              {/* Quick suggestion chips */}
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                {quickQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(q)}
                    className="text-left text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition shadow-sm"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id || i}
                    className={`flex items-start space-x-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-emerald-600 text-white rounded-tr-none'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-white/20 dark:border-slate-700/60 text-[10px] opacity-80">
                        <span className="font-semibold">
                          {isUser ? msg.senderName || 'Team Member' : msg.senderName || 'Gemini 3.6 Flash'}
                        </span>
                      </div>

                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="prose prose-xs dark:prose-invert max-w-none text-slate-800 dark:text-slate-100">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-start space-x-2.5 justify-start animate-in fade-in">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-3.5 shadow-sm flex items-center space-x-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Gemini is reasoning over batch specs...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/80 border-t border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => handleSendMessage()}
              className="text-xs font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Input Footer */}
        <div className="p-3 sm:p-4 bg-white dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              placeholder={`Ask Gemini about this ${batch.productName} batch...`}
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isSending}
              className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={isSending || !inputQuery.trim()}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs sm:text-sm transition flex items-center space-x-1.5 shadow"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
