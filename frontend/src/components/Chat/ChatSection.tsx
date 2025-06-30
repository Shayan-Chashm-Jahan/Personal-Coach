import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  text: string;
  sender: "user" | "coach";
}

interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface ChatSectionProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  getAuthHeaders: () => Record<string, string>;
  showNotification: (
    message: string,
    type: "error" | "success" | "info"
  ) => void;
  logout: () => void;
  saveMessage: (message: Message) => Promise<void>;
  messagesLoading?: boolean;
  clearChat: () => void;
  currentChatId: string | null;
  createChat: (title?: string) => Promise<string | null>;
  updateChatTitle: (chatId: string, title: string) => Promise<void>;
  generateChatTitle: (message: string) => Promise<string>;
}

const API_BASE_URL = "http://localhost:8000";

export default function ChatSection({
  messages,
  setMessages,
  inputValue,
  setInputValue,
  isLoading,
  setIsLoading,
  getAuthHeaders,
  showNotification,
  logout,
  saveMessage,
  messagesLoading = false,
  clearChat,
  currentChatId,
  createChat,
  updateChatTitle,
  generateChatTitle,
}: ChatSectionProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    if (messagesEndRef.current && !messagesLoading) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, messagesLoading]);

  useEffect(() => {
    if (inputRef.current && inputValue === "") {
      inputRef.current.style.height = "auto";
    }
  }, [inputValue]);

  const buildConversationHistory = (): HistoryItem[] => {
    return messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.text,
    }));
  };

  const addMessage = async (
    text: string,
    sender: "user" | "coach"
  ): Promise<number> => {
    const message: Message = { text, sender };
    setMessages((prev) => [...prev, message]);
    await saveMessage(message);
    return messages.length;
  };

  const processStreamChunk = (
    line: string,
    coachMessageIndex: number
  ): boolean => {
    if (!line.startsWith("data: ")) return false;

    const data = line.slice(6).trim();
    if (data === "[DONE]") return true;

    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.chunk) {
          setMessages((prev) => {
            const newMessages = [...prev];
            if (newMessages[coachMessageIndex]) {
              const currentText = newMessages[coachMessageIndex].text;
              newMessages[coachMessageIndex] = {
                ...newMessages[coachMessageIndex],
                text: currentText + parsed.chunk,
              };
            }
            return newMessages;
          });
        } else if (parsed.error) {
          showNotification(parsed.error, "error");
          setMessages((prev) => {
            const newMessages = [...prev];
            if (newMessages[coachMessageIndex]) {
              newMessages.pop();
            }
            return newMessages;
          });
        }
      } catch (error) {
        showNotification("Error parsing response", "error");
      }
    }
    return false;
  };

  const streamResponse = async (
    messageText: string,
    conversationHistory: HistoryItem[]
  ): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        message: messageText,
        history: conversationHistory,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(
            `AUTH_ERROR: ${errorData.detail || "Authentication failed"}`
          );
        } catch {
          throw new Error(`AUTH_ERROR: Authentication failed`);
        }
      }
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const coachMessageIndex = messages.length + 1;
    setMessages((prev) => [...prev, { text: "", sender: "coach" }]);
    setIsLoading(false);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const isDone = processStreamChunk(line, coachMessageIndex);
        if (isDone) {
          setMessages((prev) => {
            const finalMessage = prev[coachMessageIndex];
            if (
              finalMessage &&
              finalMessage.text.trim() &&
              !finalMessage.text.startsWith("Error:")
            ) {
              fullResponse = finalMessage.text;
              saveMessage({ text: fullResponse, sender: "coach" });
            }
            return prev;
          });
          return;
        }
      }
    }
  };

  const sendMessage = async (): Promise<void> => {
    if (!inputValue.trim()) return;

    const messageText = inputValue;
    const conversationHistory = buildConversationHistory();
    let chatId = currentChatId;
    const isNewChat = !chatId;

    if (!chatId) {
      chatId = await createChat();
      if (!chatId) return;
    }

    const isFirstMessageInChat = messages.length === 0;

    setInputValue("");
    setIsLoading(true);
    await addMessage(messageText, "user");

    setMessages((prev) => [...prev, { text: "", sender: "coach" }]);

    if ((isNewChat || isFirstMessageInChat) && chatId) {
      const newTitle = await generateChatTitle(messageText);
      await updateChatTitle(chatId, newTitle);
    }

    try {
      setMessages((prev) => prev.slice(0, -1));
      await streamResponse(messageText, conversationHistory);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";

      if (errorMessage.startsWith("AUTH_ERROR:")) {
        showNotification("Session expired. Please log in again.", "error");
        setMessages((prev) => prev.slice(0, -2));
        setTimeout(() => logout(), 2000);
      } else {
        showNotification(errorMessage, "error");
        setMessages((prev) => {
          const newMessages = [...prev];
          if (
            newMessages[newMessages.length - 1]?.sender === "coach" &&
            newMessages[newMessages.length - 1]?.text === ""
          ) {
            newMessages.pop();
          }
          return newMessages;
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ): void => {
    setInputValue(e.target.value);

    const textarea = e.target;
    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 120;

    if (scrollHeight <= maxHeight) {
      textarea.style.height = scrollHeight + "px";
    } else {
      textarea.style.height = maxHeight + "px";
    }
  };

  const handleClearChat = (): void => {
    setShowClearConfirm(false);
    clearChat();
  };

  const renderMessage = (message: Message, index: number) => (
    <div key={index} className={`message-wrapper ${message.sender}`}>
      <div className={`message ${message.sender}`}>
        <div className="message-content">
          {message.sender === "coach" ? (
            message.text ? (
              <ReactMarkdown>{message.text}</ReactMarkdown>
            ) : (
              <div className="typing-container">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className="typing-text">Coach is typing...</span>
              </div>
            )
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
          )}
        </div>
        <div className="message-timestamp">
          {new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </div>
    </div>
  );

  const renderChatInput = () => (
    <div className="input-container">
      <div className="input-field">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
          className="message-input"
          disabled={isLoading}
          rows={1}
          style={{ resize: "none", overflow: "hidden" }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !inputValue.trim()}
          className="send-button"
        >
          {isLoading ? (
            <div className="send-loading">
              <div className="loading-spinner-small"></div>
            </div>
          ) : null}
        </button>
      </div>
    </div>
  );

  return (
    <div className="section-content">
      <div className="messages-container">
        {messagesLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <div className="loading-message">Loading your messages...</div>
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      {renderChatInput()}

      {showClearConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Clear Chat History</h3>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete all messages? This action cannot
                be undone.
              </p>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="modal-button secondary"
              >
                Cancel
              </button>
              <button onClick={handleClearChat} className="modal-button danger">
                Delete All Messages
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
