import React, { useState, useRef, useEffect } from 'react';
import { KnowledgeCard, ChatMessage } from '../types';
import { queryKnowledgeBase } from '../services/geminiService';
import { Send, Bot, User, Sparkles, Loader2, Database, Folder } from './Icons';

interface ChatViewProps {
  cards: KnowledgeCard[];
  contextTitle: string; // e.g., "Entire Vault" or "Collection: AIGC Tools"
}

export const ChatView: React.FC<ChatViewProps> = ({ cards, contextTitle }) => {
  // 根据当前上下文生成友善的中文开场白
  const getInitialMessage = (count: number, title: string): ChatMessage => ({
    id: 'welcome',
    role: 'assistant',
    content: `你好！我是 Insight Vault 知识助手，很高兴为你服务 ✨\n\n当前我正在关注「**${title}**」，这里共有 **${count}** 条知识内容。\n\n你可以问我：\n• 帮你总结这些内容的核心主题\n• 提取其中的常用提示词或技巧\n• 发现内容之间的关联和洞察\n\n有什么我可以帮到你的吗？`,
    timestamp: Date.now()
  });

  const [messages, setMessages] = useState<ChatMessage[]>([getInitialMessage(cards.length, contextTitle)]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset chat when context changes (e.g. switching from Global to a specific Album)
  useEffect(() => {
    setMessages([getInitialMessage(cards.length, contextTitle)]);
  }, [cards, contextTitle]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Only scroll to bottom after user sends a message, not on initial render
    if (messages.length > 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

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
      const responseText = await queryKnowledgeBase(userMsg.content, cards);

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "抱歉，我现在遇到了一些连接问题 😅\n请稍后再试一次，或者检查一下网络连接。",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
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
      `}</style>

      {/* ===== Main Content Container ===== */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Header - Floating glass pill */}
        <div className="flex justify-center pt-4 pb-2 shrink-0">
          <div className="inline-flex items-center gap-4 px-5 py-3 rounded-full bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.8) 0%, rgba(236,72,153,0.6) 100%)',
                  boxShadow: '0 0 20px rgba(139,92,246,0.4)',
                }}
              >
                {contextTitle === 'Entire Vault' ? <Sparkles size={18} className="text-white" /> : <Folder size={18} className="text-white" />}
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
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {cards.length > 20 && (
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/80">
                <span>📌</span>
                <span>为确保响应速度，当前仅使用前 20 条内容</span>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 mt-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center border border-white/20"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.9) 100%)',
                      boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                    }}
                  >
                    <Bot size={14} className="text-white" />
                  </div>
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
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
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center border border-white/10"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(139,92,246,0.5) 100%)',
                }}
              >
                <Bot size={14} className="text-white/60" />
              </div>
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
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="p-2.5 rounded-xl transition-all duration-200 disabled:opacity-30"
              style={{
                background: inputValue.trim() && !isLoading
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.9) 100%)'
                  : 'rgba(255,255,255,0.05)',
              }}
            >
              <Send size={16} className="text-white" />
            </button>
          </div>
          <p className="text-center text-[10px] text-white/30 mt-3">
            AI 仅基于当前上下文中的内容进行回答
          </p>
        </div>
      </div>
    </div>
  );
};