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

interface InterviewPendingProps {
  getAuthHeaders: () => Record<string, string>;
  showNotification: (
    message: string,
    type: "error" | "success" | "info"
  ) => void;
  logout: () => void;
  navigate: (section: string) => void;
  setInitialCallCompleted: (completed: boolean) => void;
}

const API_BASE_URL = "http://localhost:8000";

export default function InterviewPending({
  getAuthHeaders,
  showNotification,
  logout,
  navigate,
  setInitialCallCompleted,
}: InterviewPendingProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showCompletionButton, setShowCompletionButton] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
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
      inputRef.current.style.height = "auto";
    }
  }, [inputValue]);

  const buildConversationHistory = (): HistoryItem[] => {
    return messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.text,
    }));
  };

  const preprocessMarkdown = (text: string): string => {
    return text
      .replace(/\n#/g, "\n\n#")
      .replace(/^#/g, "\n#")
      .replace(/\n\n\n+/g, "\n\n");
  };

  const startInitialization = async (): Promise<void> => {
    try {
      setIsInitializing(true);
      const response = await fetch(`${API_BASE_URL}/api/initial-call/initialize`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        setIsInitializing(false);
      } else if (response.status === 401) {
        logout();
      } else {
        throw new Error("Failed to initialize profile");
      }
    } catch (error) {
      showNotification("Failed to initialize profile", "error");
      setIsInitializing(false);
    }
  };

  const handleStartJourney = (): void => {
    setInitialCallCompleted(true);
    navigate("chat");
  };

  const processChunk = (line: string, coachMessageIndex: number): boolean => {
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
              const newText = currentText + parsed.chunk;
              newMessages[coachMessageIndex] = {
                ...newMessages[coachMessageIndex],
                text: newText,
              };
              
              if (newText.includes("It was wonderful getting to know you!") && newText.includes("Let me prepare everything for our journey ahead!")) {
                setShowCompletionButton(true);
                startInitialization();
              }
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

  const sendMessage = async (): Promise<void> => {
    if (!inputValue.trim()) return;

    const messageText = inputValue;
    const conversationHistory = buildConversationHistory();

    setInputValue("");
    setIsLoading(true);
    setMessages((prev) => [...prev, { text: messageText, sender: "user" }]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/initial-call/chat`, {
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const isDone = processChunk(line, coachMessageIndex);
          if (isDone) {
            return;
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";

      if (errorMessage.startsWith("AUTH_ERROR:")) {
        showNotification("Session expired. Please log in again.", "error");
        setMessages((prev) => prev.slice(0, -1));
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

  const renderMessage = (message: Message, index: number) => (
    <div
      key={index}
      className={`initial-call-message-wrapper ${message.sender}`}
    >
      <div className={`initial-call-message ${message.sender}`}>
        <div className="initial-call-message-content">
          {message.sender === "coach" ? (
            message.text ? (
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p style={{ margin: "0.5rem 0" }}>{children}</p>
                  ),
                  h1: ({ children }) => (
                    <h1 style={{ margin: "1rem 0 0.5rem 0" }}>{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 style={{ margin: "1rem 0 0.5rem 0" }}>{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 style={{ margin: "1rem 0 0.5rem 0" }}>{children}</h3>
                  ),
                  h4: ({ children }) => (
                    <h4 style={{ margin: "0.8rem 0 0.4rem 0" }}>{children}</h4>
                  ),
                  h5: ({ children }) => (
                    <h5 style={{ margin: "0.8rem 0 0.4rem 0" }}>{children}</h5>
                  ),
                  h6: ({ children }) => (
                    <h6 style={{ margin: "0.8rem 0 0.4rem 0" }}>{children}</h6>
                  ),
                }}
              >
                {preprocessMarkdown(message.text)}
              </ReactMarkdown>
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

        {showCompletionButton ? (
          <div className="completion-button-container">
            <button
              onClick={handleStartJourney}
              disabled={isInitializing}
              className="completion-button"
            >
              {isInitializing ? "Preparing..." : "Let's start!"}
            </button>
          </div>
        ) : (
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
                style={{ resize: "none", overflow: "hidden" }}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputValue.trim()}
                className="initial-call-send-button"
              >
                {isLoading ? "..." : "→"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
