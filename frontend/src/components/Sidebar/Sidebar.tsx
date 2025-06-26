import { useNavigate } from 'react-router-dom'

interface Chat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface SidebarProps {
  activeSection: string
  setActiveSection: (section: string) => void
  logout: () => void
  chats: Chat[]
  currentChatId: string | null
  setCurrentChatId: (chatId: string | null) => void
  deleteChat: (chatId: string) => Promise<void>
}

const SECTIONS = {
  CHAT: 'chat',
  GOALS: 'goals',
  NOTES: 'coach-notes'
} as const

export default function Sidebar({
  activeSection,
  setActiveSection,
  logout,
  chats,
  currentChatId,
  setCurrentChatId,
  deleteChat
}: SidebarProps) {
  const navigate = useNavigate()
  
  const renderNavigationItem = (section: string, label: string) => (
    <button 
      key={section}
      className={`nav-item ${activeSection === section ? 'active' : ''}`}
      onClick={() => setActiveSection(section)}
    >
      {label}
    </button>
  )

  const handleChatClick = (chatId: string) => {
    navigate(`/chat/${chatId}`)
  }

  const renderChatList = () => {
    if (activeSection !== SECTIONS.CHAT) return null
    
    const nonEmptyChats = chats.filter(chat => chat.title !== 'New Chat')
    
    if (nonEmptyChats.length === 0) return null

    return (
      <div className="chat-list">
        <div className="chat-list-header">
          <span className="chat-list-title">Chats</span>
        </div>
        <div className="chat-items">
          {nonEmptyChats.map(chat => (
            <div 
              key={chat.id}
              className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
              onClick={() => handleChatClick(chat.id)}
            >
              <div className="chat-item-title">{chat.title}</div>
              <button 
                className="chat-delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteChat(chat.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>AI Coach</h2>
      </div>
      <nav className="sidebar-nav">
        {renderNavigationItem(SECTIONS.CHAT, 'Chat')}
        {renderNavigationItem(SECTIONS.GOALS, 'Goals')}
        {renderNavigationItem(SECTIONS.NOTES, 'Coach Notes')}
      </nav>
      {renderChatList()}
      <div className="sidebar-footer">
        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  )
}