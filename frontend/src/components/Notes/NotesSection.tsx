import { useState, useEffect } from "react";
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
  onContextMenu: (
    e: React.MouseEvent,
    url: string,
    onDelete?: () => void
  ) => void;
}

export default function NotesSection({
  memories,
  memoriesLoading,
  deleteMemory,
  onContextMenu,
}: NotesSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState<{ 
    isOpen: boolean; 
    memoryId?: string; 
    memoryContent?: string 
  }>({ isOpen: false });

  const handleConfirmDelete = () => {
    if (confirmDelete.memoryId) {
      deleteMemory(confirmDelete.memoryId);
    }
    setConfirmDelete({ isOpen: false });
  };

  useEffect(() => {
    if (!confirmDelete.isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleConfirmDelete();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmDelete({ isOpen: false });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmDelete.isOpen, confirmDelete.memoryId]);
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
        <p
          style={{
            fontSize: "14px",
            color: "#666",
            margin: "0",
            marginLeft: "10px",
          }}
        >
          No notes yet.
        </p>
      </div>
    );
  }

  return (
    <div className="section-content">
      <div className="memories-container">
        {memories.map((memory) => (
          <div
            key={memory.id}
            style={{
              padding: "0px 15px",
              margin: "0px 0",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
              cursor: "pointer",
            }}
            onContextMenu={(e) =>
              onContextMenu(e, `/notes/${memory.id}`, () =>
                setConfirmDelete({
                  isOpen: true,
                  memoryId: memory.id,
                  memoryContent: memory.content
                })
              )
            }
          >
            <div style={{ color: "#333", lineHeight: "1.3" }}>
              <ReactMarkdown>{memory.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      
      {confirmDelete.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Delete Note</h3>
            </div>
            <div className="modal-body">
              <p>This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button 
                onClick={() => setConfirmDelete({ isOpen: false })}
                className="modal-button secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmDelete}
                className="modal-button danger"
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
