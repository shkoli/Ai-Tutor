import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface ChatHistoryProps {
  messages: ChatMessage[];
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center text-slate-400 text-sm italic min-h-[200px] h-full opacity-60">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <span className="text-xl grayscale">💬</span>
        </div>
        <p>Conversation transcript will appear here...</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 w-full overflow-y-auto space-y-6 pr-2 min-h-[200px] h-full scroll-smooth"
    >
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}
        >
          <div className={`
            max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-sm relative
            ${msg.role === 'user' 
              ? 'bg-blue-600 text-white rounded-br-none' 
              : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-bl-none'}
          `}>
            {msg.text}
          </div>
          <span className="text-[10px] text-slate-400 mt-1.5 px-1 uppercase tracking-wider font-bold opacity-70">
            {msg.role === 'user' ? 'You' : 'Koli'}
          </span>
        </div>
      ))}
      <div ref={bottomRef} className="h-2" />
    </div>
  );
};