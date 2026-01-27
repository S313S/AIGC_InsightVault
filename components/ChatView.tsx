import React, { useState, useRef, useEffect } from 'react';
import { KnowledgeCard, ChatMessage } from '../types';
import { queryKnowledgeBase } from '../services/geminiService';
import { Send, Bot, User, Sparkles, Loader2, Database, Folder } from './Icons';

interface ChatViewProps {
  cards: KnowledgeCard[];
  contextTitle: string; // e.g., "Entire Vault" or "Collection: AIGC Tools"
}

export const ChatView: React.FC<ChatViewProps> = ({ cards, contextTitle }) => {
  // Initialize messages based on the current context
  const getInitialMessage = (count: number, title: string): ChatMessage => ({
    id: 'welcome',
    role: 'assistant',
    content: `Hello! I'm focused on **${title}**. \n\nI have access to **${count}** specific items in this context. Ask me to summarize key themes, extract common prompts, or find connections within this collection.`,
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
        content: "I'm having trouble connecting to the brain right now. Please try again.",
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
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${contextTitle === 'Entire Vault' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
            {contextTitle === 'Entire Vault' ? <Sparkles size={20} /> : <Folder size={20} />}
            </div>
            <div>
            <h2 className="font-semibold text-gray-900">Insight Assistant</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                    <Database size={10} /> Context: {contextTitle}
                </span>
                <span>•</span>
                <span>{cards.length} items</span>
            </div>
            </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot size={16} className="text-white" />
              </div>
            )}
            
            <div 
              className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-gray-900 text-white rounded-tr-none' 
                  : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-1">
                <User size={16} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-5 py-3 shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              <span className="text-sm text-gray-500">Reading collection data...</span>
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
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-12 py-3.5 focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all text-sm"
            placeholder={`Ask questions about "${contextTitle}"...`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          AI uses only the content within the current context to answer.
        </p>
      </div>
    </div>
  );
};