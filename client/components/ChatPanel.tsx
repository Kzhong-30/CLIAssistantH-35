import React, { useState, useRef, useEffect } from 'react';

interface ChatMessage {
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  playerId: string | null;
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  playerId,
  onSendMessage,
  disabled = false
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="panel chat-panel">
      <div className="panel-title">聊天</div>
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className="chat-message">
            <span
              className="chat-sender"
              style={{
                color: msg.sender === playerId ? '#4ECDC4' : '#FF6B6B'
              }}
            >
              {msg.senderName}:
            </span>
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>
              {msg.text}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="chat-input-wrapper">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? '观战中无法发言' : '发送消息...'}
          className="chat-input"
          disabled={disabled}
        />
        <button type="submit" className="chat-send-btn" disabled={disabled}>
          发送
        </button>
      </form>
      <div className="controls-hint">
        <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> 移动<br />
        <kbd>空格</kbd> 加速（消耗长度）
      </div>
    </div>
  );
};
