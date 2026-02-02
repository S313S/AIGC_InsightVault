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
    scrollToBottom();
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
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            {contextTitle === 'Entire Vault' ? <Sparkles size={22} className="text-white" /> : <Folder size={22} className="text-white" />}
          </div>
          <div>
            <h2 className="font-semibold text-white text-lg">智能知识助手</h2>
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span className="flex items-center gap-1">
                <Database size={10} /> 当前上下文：{contextTitle}
              </span>
              <span>•</span>
              <span>{cards.length} 条内容</span>
            </div>
          </div>
        </div>
      </div>

      {/* Context Limit Warning */}
      {cards.length > 20 && (
        <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-700">
          <span className="font-semibold">📌 提示：</span>
          为确保响应速度，当前仅使用前 20 条内容作为上下文。
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-gradient-to-b from-gray-50 to-white">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            {msg.role === 'assistant' && (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1 shadow-md">
                <Bot size={18} className="text-white" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-sm shadow-md'
                : 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm'
                }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>

            {msg.role === 'user' && (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                <User size={18} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start animate-fade-in">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
              <Bot size={18} className="text-white" />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-5 py-3.5 shadow-sm flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              <span className="text-sm text-gray-500">正在阅读你的知识库...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-5 pr-14 py-4 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all text-sm placeholder:text-gray-400"
            placeholder={`有什么想问的？试试输入你的问题...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-2 p-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-xl transition-all shadow-sm hover:shadow-md disabled:shadow-none"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2.5">
          AI 仅基于当前上下文中的内容进行回答
        </p>
      </div>
    </div>
  );
};