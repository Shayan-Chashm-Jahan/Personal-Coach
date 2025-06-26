import ReactMarkdown from 'react-markdown'

interface Memory {
  id: string
  content: string
  timestamp: string
}

interface NotesSectionProps {
  memories: Memory[]
  memoriesLoading: boolean
  deleteMemory: (id: string) => Promise<void>
}

export default function NotesSection({
  memories,
  memoriesLoading,
  deleteMemory
}: NotesSectionProps) {
  
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return 'Today'
    if (diffDays === 2) return 'Yesterday'
    if (diffDays <= 7) return `${diffDays - 1} days ago`
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    })
  }

  const getMemoryIcon = (content: string) => {
    if (content.toLowerCase().includes('goal')) return '🎯'
    if (content.toLowerCase().includes('progress')) return '📈'
    if (content.toLowerCase().includes('challenge')) return '💪'
    if (content.toLowerCase().includes('insight')) return '💡'
    if (content.toLowerCase().includes('achievement')) return '🏆'
    return '📋'
  }

  if (memoriesLoading) {
    return (
      <div className="section-content">
        <div className="empty-state">
          <div className="loading-spinner"></div>
          <p>Loading your coach notes...</p>
        </div>
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="section-content">
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>No Coach Notes Yet</h3>
          <p>Your AI coach will automatically take notes about your progress, insights, and important moments during your conversations. These notes help provide personalized guidance over time.</p>
          <div className="empty-suggestion">
            <p>💡 Start a conversation in the Chat section to begin building your personal coaching history!</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="section-content">
      <div className="notes-header">
        <div className="notes-stats">
          <div className="stat-item">
            <span className="stat-number">{memories.length}</span>
            <span className="stat-label">Total Notes</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{new Set(memories.map(m => new Date(m.timestamp).toDateString())).size}</span>
            <span className="stat-label">Days Active</span>
          </div>
        </div>
      </div>
      <div className="memories-container">
        {memories.map((memory, index) => (
          <div key={memory.id} className="memory-card" style={{ animationDelay: `${index * 0.05}s` }}>
            <div className="memory-header">
              <div className="memory-icon">{getMemoryIcon(memory.content)}</div>
              <div className="memory-meta">
                <div className="memory-timestamp">
                  {formatDate(memory.timestamp)}
                </div>
                <div className="memory-time">
                  {new Date(memory.timestamp).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                  })}
                </div>
              </div>
              <button
                className="delete-button"
                onClick={() => deleteMemory(memory.id)}
                title="Delete this note"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="memory-content">
              <ReactMarkdown>{memory.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}