import { useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import Settings from '../Settings/Settings'

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
  deleteChat: (chatId: string) => void
  onContextMenu: (e: React.MouseEvent, url: string, onDelete?: () => void) => void
}

const SECTIONS = {
  CHAT: 'chat',
  GOALS: 'goals',
  MATERIAL: 'material'
} as const

export default function Sidebar({
  activeSection,
  setActiveSection,
  logout,
  chats,
  currentChatId,
  deleteChat,
  onContextMenu
}: SidebarProps) {
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)

  const getRouteForSection = (section: string): string => {
    switch (section) {
      case SECTIONS.CHAT:
        return '/chat'
      case SECTIONS.GOALS:
        return '/goals'
      case SECTIONS.MATERIAL:
        return '/material'
      default:
        return '/chat'
    }
  }

  const renderNavigationItem = (section: string, label: string) => (
    <Link
      key={section}
      to={getRouteForSection(section)}
      className={`nav-item ${activeSection === section ? 'active' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        setActiveSection(section)
      }}
      onContextMenu={(e) => onContextMenu(e, getRouteForSection(section))}
    >
      {label}
    </Link>
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
            <Link
              key={chat.id}
              to={`/chat/${chat.id}`}
              className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                handleChatClick(chat.id)
              }}
              onContextMenu={(e) => onContextMenu(e, `/chat/${chat.id}`, () => deleteChat(chat.id))}
            >
              <div className="chat-item-title">{chat.title}</div>
            </Link>
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
        {renderNavigationItem(SECTIONS.MATERIAL, 'Material')}
      </nav>
      {renderChatList()}
      <div className="sidebar-footer">
        <button className="icon-button logout-icon" onClick={logout} title="Logout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 21H19a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="8 17 3 12 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="3" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="icon-button settings-icon" onClick={() => setShowSettings(true)} title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}