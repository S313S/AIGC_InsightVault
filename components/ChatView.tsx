import React, { useState, useRef, useEffect } from 'react';
import { KnowledgeCard, ChatMessage } from '../types';
import { queryKnowledgeBase } from '../services/geminiService';
import { Send, User, Sparkles, Database, Folder, Copy, Check, X, Plus } from './Icons';

interface ChatViewProps {
  cards: KnowledgeCard[];
  contextTitle: string; // e.g., "全部知识库" or "Collection: AIGC Tools"
}

const RobotAvatar: React.FC<{ size?: number; isThinking?: boolean }> = ({ size = 32, isThinking = false }) => {
  const eyeHeight = Math.max(8, Math.floor(size * 0.45));
  const eyeWidth = Math.max(5, Math.floor(size * 0.17));
  const eyeGap = Math.max(6, Math.floor(size * 0.18));

  return (
    <div
      className="rounded-full overflow-hidden border border-white/30 shadow-[0_4px_14px_rgba(146,161,255,0.25)] relative flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: `
          radial-gradient(120% 90% at 20% 0%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.25) 35%, rgba(255,255,255,0.12) 100%),
          linear-gradient(145deg, rgba(214,225,255,0.55) 0%, rgba(167,156,255,0.6) 38%, rgba(145,139,255,0.62) 68%, rgba(198,216,255,0.5) 100%)
        `,
      }}
    >
      <div className="flex items-center" style={{ gap: eyeGap }}>
        <div
          className={`bg-white/95 rounded-full ${isThinking ? 'robot-eye-think left-eye' : ''}`}
          style={{ width: eyeWidth, height: eyeHeight }}
        />
        <div
          className={`bg-white/95 rounded-full ${isThinking ? 'robot-eye-think right-eye' : ''}`}
          style={{ width: eyeWidth, height: eyeHeight }}
        />
      </div>
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({ cards, contextTitle }) => {
  // 根据当前上下文生成友善的中文开场白
  const getInitialMessage = (count: number, title: string): ChatMessage => ({
    id: 'welcome',
    role: 'assistant',
    content: `你好！我是知识助手，很高兴为你服务。\n\n当前我正在关注「${title}」，这里共有 ${count} 条知识内容。\n\n你可以问我：\n1. 帮你总结这些内容的核心主题\n2. 提取其中的常用提示词或技巧\n3. 发现内容之间的关联和洞察\n\n有什么我可以帮到你的吗？`,
    timestamp: Date.now()
  });

  const [messages, setMessages] = useState<ChatMessage[]>([getInitialMessage(cards.length, contextTitle)]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  // Reset chat only when scope title changes (e.g. switching from Global to a specific Album)
  useEffect(() => {
    setMessages([getInitialMessage(cards.length, contextTitle)]);
  }, [contextTitle]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Only scroll to bottom after user sends a message, not on initial render
    if (messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
    };
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const responseText = await queryKnowledgeBase(userMsg.content, cards, controller.signal);

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "抱歉，我现在遇到了一些连接问题 😅\n请稍后再试一次，或者检查一下网络连接。",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setIsLoading(false);
    }
  };

  const handleCancelResponse = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setIsLoading(false);
  };

  const handleNewChat = () => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setIsLoading(false);
    setInputValue('');
    setCopiedMessageId(null);
    setMessages([getInitialMessage(cards.length, contextTitle)]);
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(prev => (prev === message.id ? null : prev)), 1400);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* ===== Flowing Gradient Background ===== */}
      <div className="absolute inset-0">
        {/* Base gradient - softer, more ethereal */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a1f3c] via-[#0f1629] to-[#0a0e1a]" />

        {/* Large flowing orbs - prominent and slow */}
        <div
          className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(99,102,241,0.2) 40%, transparent 70%)',
            filter: 'blur(60px)',
            animation: 'float 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 w-[90%] h-[90%] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(236,72,153,0.3) 0%, rgba(167,139,250,0.15) 50%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float 10s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 w-[60%] h-[60%] rounded-full opacity-25"
          style={{
            background: 'radial-gradient(circle, rgba(56,189,248,0.3) 0%, rgba(99,102,241,0.1) 50%, transparent 70%)',
            filter: 'blur(50px)',
            animation: 'float 6s ease-in-out infinite',
            animationDelay: '2s',
          }}
        />

        {/* Subtle wave overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(139,92,246,0.03) 50px, rgba(139,92,246,0.03) 51px)',
            animation: 'wave 20s linear infinite',
          }}
        />
      </div>

      {/* ===== CSS Keyframes ===== */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(3%, -3%) scale(1.02); }
          66% { transform: translate(-2%, 2%) scale(0.98); }
        }
        @keyframes wave {
          0% { background-position: 0 0; }
          100% { background-position: 0 100px; }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes robotEyeThink {
          0%, 14% { transform: translateY(0) scaleY(1); }
          20% { transform: translateY(-2px) scaleY(1); }
          32% { transform: translateY(1px) scaleY(1); }
          46% { transform: translateY(2px) scaleY(1); }
          58% { transform: translateY(0) scaleY(1); }
          72% { transform: translateY(-1px) scaleY(1); }
          80% { transform: translateY(0) scaleY(0.25); }
          86%, 100% { transform: translateY(0) scaleY(1); }
        }
        .robot-eye-think {
          transform-origin: center center;
          animation: robotEyeThink 1.2s ease-in-out infinite;
        }
        .robot-eye-think.right-eye {
          animation-delay: 0.12s;
        }
      `}</style>

      {/* ===== Main Content Container ===== */}
      <div className="relative z-10 flex flex-col h-full min-h-0">

        {/* Header - Floating glass pill */}
        <div className="flex justify-center pt-4 pb-2 shrink-0">
          <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.8) 0%, rgba(236,72,153,0.6) 100%)',
                  boxShadow: '0 0 20px rgba(139,92,246,0.4)',
                }}
              >
                {contextTitle === '全部知识库' ? <Sparkles size={18} className="text-white" /> : <Folder size={18} className="text-white" />}
              </div>
              <div>
                <h2 className="font-semibold text-white/90 text-sm">智能知识助手</h2>
                <p className="text-[10px] text-white/50 flex items-center gap-1">
                  <Database size={8} /> {contextTitle} · {cards.length} 条
                </p>
              </div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full bg-emerald-400"
                style={{ animation: 'glow 2s ease-in-out infinite' }}
              />
              <span className="text-xs text-emerald-300/80">在线</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={handleNewChat}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/5 hover:bg-white/12 border border-white/10 text-white/80 hover:text-white text-xs transition-colors"
              title="开始新的对话"
            >
              <Plus size={12} />
              <span>新聊天</span>
            </button>
          </div>
        </div>
        {cards.length > 40 && (
          <div className="flex justify-center pb-2 shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/12 border border-amber-500/25 text-[11px] text-amber-300/85">
              <span>⏳</span>
              <span>当前数据量较大，AI 正在处理全量内容，响应可能稍慢</span>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 mt-1">
                  <RobotAvatar size={32} />
                </div>
              )}

              <div
                className={`group relative max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                  ? 'rounded-tr-md text-white'
                  : 'rounded-tl-md text-white/90'
                  }`}
                style={msg.role === 'user' ? {
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.85) 0%, rgba(139,92,246,0.85) 100%)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 8px 32px rgba(99,102,241,0.2)',
                } : {
                  background: 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.role === 'assistant' && msg.id !== 'welcome' && (
                  <button
                    onClick={() => handleCopyMessage(msg)}
                    className="absolute -top-2 -right-2 h-7 px-2 rounded-lg border border-white/15 bg-[#131b35]/90 text-white/70 hover:text-white hover:bg-[#182248] transition-all opacity-0 group-hover:opacity-100"
                    title="复制回复"
                  >
                    <span className="flex items-center gap-1">
                      {copiedMessageId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                      <span className="text-[11px]">{copiedMessageId === msg.id ? '已复制' : '复制'}</span>
                    </span>
                  </button>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="flex-shrink-0 mt-1">
                  <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                    <User size={14} className="text-white/70" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <RobotAvatar size={32} isThinking />
              <div
                className="rounded-2xl rounded-tl-md px-4 py-3 flex items-center gap-2"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <div
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-violet-400"
                      style={{ animation: `float 1s ease-in-out infinite`, animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-white/50">思考中...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - Floating glass bar */}
        <div className="px-6 pb-6 pt-2 shrink-0">
          <div
            className="relative rounded-2xl p-1 flex items-center transition-all duration-300 focus-within:shadow-lg focus-within:shadow-violet-500/20"
            style={{
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <input
              type="text"
              className="flex-1 bg-transparent px-4 py-3 focus:outline-none text-sm text-white/90 placeholder:text-white/30"
              placeholder="输入你的问题，开始探索知识..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {isLoading ? (
              <button
                onClick={handleCancelResponse}
                className="p-2.5 rounded-xl transition-all duration-200 bg-rose-500/80 hover:bg-rose-500"
                title="中断生成"
              >
                <X size={16} className="text-white" />
              </button>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30"
                style={{
                  background: inputValue.trim()
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.9) 100%)'
                    : 'rgba(255,255,255,0.05)',
                }}
              >
                <Send size={16} className="text-white" />
              </button>
            )}
          </div>
          <p className="text-center text-[10px] text-white/30 mt-3">
            AI 仅基于当前上下文中的内容进行回答
          </p>
        </div>
      </div>
    </div>
  );
};
