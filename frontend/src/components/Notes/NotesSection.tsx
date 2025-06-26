import ReactMarkdown from "react-markdown";

interface Memory {
  id: string;
  content: string;
  timestamp: string;
}

interface NotesSectionProps {
  memories: Memory[];
  memoriesLoading: boolean;
  deleteMemory: (id: string) => Promise<void>;
}

export default function NotesSection({
  memories,
  memoriesLoading,
  deleteMemory,
}: NotesSectionProps) {
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return "Today";
    if (diffDays === 2) return "Yesterday";
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  if (memoriesLoading) {
    return (
      <div className="section-content">
        <div className="empty-state">
          <div className="loading-spinner"></div>
          <p>Loading your coach notes...</p>
        </div>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="section-content">
        <p style={{ fontSize: '14px', color: '#666', margin: '0', marginLeft: '10px' }}>No notes yet.</p>
      </div>
    );
  }

  return (
    <div className="section-content">
      <div className="memories-container">
        {memories.map((memory, index) => (
          <div
            key={memory.id}
            style={{
              padding: "0px 15px",
              margin: "0px 0",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minHeight: "auto",
            }}
          >
            <div style={{ flex: 1, color: "#333", lineHeight: "1.3" }}>
              <ReactMarkdown style={{ margin: 0 }}>
                {memory.content}
              </ReactMarkdown>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "#999",
                  whiteSpace: "nowrap",
                }}
              >
                {formatDate(memory.timestamp)}{" "}
                {new Date(memory.timestamp).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </div>
              <button
                onClick={() => deleteMemory(memory.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#999",
                  fontSize: "16px",
                  cursor: "pointer",
                  padding: "5px",
                  marginLeft: "10px",
                }}
                title="Delete note"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
