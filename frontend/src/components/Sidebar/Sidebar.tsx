import { useNavigate, Link } from 'react-router-dom'

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
  NOTES: 'coach-notes',
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
  
  const getRouteForSection = (section: string): string => {
    switch (section) {
      case SECTIONS.CHAT:
        return '/chat'
      case SECTIONS.GOALS:
        return '/goals'
      case SECTIONS.NOTES:
        return '/coach-notes'
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
        {renderNavigationItem(SECTIONS.NOTES, 'Coach Notes')}
        {renderNavigationItem(SECTIONS.MATERIAL, 'Material')}
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