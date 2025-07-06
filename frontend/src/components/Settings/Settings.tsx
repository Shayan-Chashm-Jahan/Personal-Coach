import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

interface Memory {
  id: string
  content: string
  timestamp: string
}

interface SettingsProps {
  onClose: () => void
}

const API_BASE_URL = 'http://localhost:8000'

export default function Settings({ onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState('memories')
  const [memories, setMemories] = useState<Memory[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean
    memoryId?: string
    memoryContent?: string
  }>({ isOpen: false })

  useEffect(() => {
    if (activeTab === 'memories') {
      fetchMemories()
    }
  }, [activeTab])

  const fetchMemories = async () => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    setMemoriesLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/memories`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setMemories(data.memories || [])
      }
    } catch (error) {
      console.error('Error fetching memories:', error)
    } finally {
      setMemoriesLoading(false)
    }
  }

  const deleteMemory = async (memoryId: string) => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setMemories(memories.filter(m => m.id !== memoryId))
      }
    } catch (error) {
      console.error('Error deleting memory:', error)
    }
  }

  const handleConfirmDelete = () => {
    if (confirmDelete.memoryId) {
      deleteMemory(confirmDelete.memoryId)
    }
    setConfirmDelete({ isOpen: false })
  }

  useEffect(() => {
    if (!confirmDelete.isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleConfirmDelete()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setConfirmDelete({ isOpen: false })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [confirmDelete.isOpen, confirmDelete.memoryId])

  const renderMemories = () => {
    if (memoriesLoading) {
      return (
        <div className="settings-tab-content">
          <div className="empty-state">
            <div className="loading-spinner"></div>
            <p>Loading your memories...</p>
          </div>
        </div>
      )
    }

    if (memories.length === 0) {
      return (
        <div className="settings-tab-content">
          <p style={{
            fontSize: "14px",
            color: "#666",
            margin: "0",
          }}>
            No memories yet.
          </p>
        </div>
      )
    }

    return (
      <div className="settings-tab-content">
        <div className="memories-container">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="memory-item"
            >
              <div style={{ color: "#333", lineHeight: "1.5", flex: 1 }}>
                <ReactMarkdown>{memory.content}</ReactMarkdown>
              </div>
              <button
                className="memory-delete-button"
                onClick={() => setConfirmDelete({
                  isOpen: true,
                  memoryId: memory.id,
                  memoryContent: memory.content
                })}
                title="Delete memory"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <button 
          className="settings-modal-close" 
          onClick={onClose}
        >
          ✕
        </button>
        
        <div className="settings-header">
          <h2>Settings</h2>
          <div className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === 'memories' ? 'active' : ''}`}
              onClick={() => setActiveTab('memories')}
            >
              Memories
            </button>
          </div>
        </div>

        <div className="settings-modal-content">
          {activeTab === 'memories' && renderMemories()}
        </div>

        {confirmDelete.isOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>Delete Memory</h3>
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
                  Delete Memory
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}