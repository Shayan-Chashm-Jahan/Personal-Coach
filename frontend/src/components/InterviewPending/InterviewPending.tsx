import { useState, useRef, useEffect } from "react";

interface Message {
  text: string;
  sender: "user" | "coach";
}

export default function InterviewPending() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (inputRef.current && inputValue === "") {
      inputRef.current.style.height = 'auto';
    }
  }, [inputValue]);

  const sendMessage = (): void => {
    if (!inputValue.trim()) return;

    const messageText = inputValue;
    setInputValue("");
    
    setMessages(prev => [...prev, { text: messageText, sender: "user" }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInputValue(e.target.value);
    
    const textarea = e.target;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 120;
    
    if (scrollHeight <= maxHeight) {
      textarea.style.height = scrollHeight + 'px';
    } else {
      textarea.style.height = maxHeight + 'px';
    }
  };

  const renderMessage = (message: Message, index: number) => (
    <div key={index} className={`initial-call-message-wrapper ${message.sender}`}>
      <div className={`initial-call-message ${message.sender}`}>
        <div className="initial-call-message-content">
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="interview-pending-container">
      <div className="initial-call-chat-container">
        <div className="initial-call-header">
          <h2>Welcome to Your Personal Coach</h2>
          <p>Let's start with your initial call</p>
        </div>
        
        <div className="initial-call-messages-container">
          {messages.map(renderMessage)}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="initial-call-input-container">
          <div className="initial-call-input-field">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about yourself..."
              className="initial-call-message-input"
              rows={1}
              style={{ resize: 'none', overflow: 'hidden' }}
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim()}
              className="initial-call-send-button"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}