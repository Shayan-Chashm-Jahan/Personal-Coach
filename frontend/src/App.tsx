import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import ChatSection from './components/Chat/ChatSection'
import GoalsSection from './components/Goals/GoalsSection'
import NotesSection from './components/Notes/NotesSection'
import Sidebar from './components/Sidebar/Sidebar'
import ContextMenu from './components/ContextMenu/ContextMenu'
import ConfirmDialog from './components/ConfirmDialog/ConfirmDialog'
import './App.css'

const API_BASE_URL = 'http://localhost:8000'

const SECTIONS = {
  CHAT: 'chat',
  GOALS: 'goals',
  NOTES: 'coach-notes'
} as const

interface Message {
  text: string
  sender: 'user' | 'coach'
}

interface Chat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface Memory {
  id: string
  content: string
  timestamp: string
}

interface Notification {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

function AppRoutes() {
  const [messages, setMessages] = useState<Message[]>([])
  const navigate = useNavigate()
  const location = useLocation()
  const { chat_id } = useParams<{ chat_id: string }>()
  const [inputValue, setInputValue] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [activeSection, setActiveSection] = useState<string>('')
  const [memories, setMemories] = useState<Memory[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState<boolean>(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [authLoading, setAuthLoading] = useState<boolean>(true)
  const [isLogin, setIsLogin] = useState<boolean>(true)
  const [authEmail, setAuthEmail] = useState<string>('')
  const [authPassword, setAuthPassword] = useState<string>('')
  const [authError, setAuthError] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false)
  const [goals, setGoals] = useState<any[]>([])
  const [goalsLoading, setGoalsLoading] = useState<boolean>(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [chatsLoading, setChatsLoading] = useState<boolean>(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; url: string; onDelete?: () => void } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; chatId?: string; chatTitle?: string }>({ isOpen: false })

  useEffect(() => {
    if (activeSection === SECTIONS.NOTES) {
      fetchMemories()
    }
    if (activeSection === SECTIONS.GOALS && isAuthenticated) {
      fetchGoals()
    }
    if (activeSection === SECTIONS.CHAT && isAuthenticated) {
      fetchChats()
    }
  }, [activeSection, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated && currentChatId) {
      fetchChatMessages(currentChatId)
    }
  }, [isAuthenticated, currentChatId])

  useEffect(() => {
    if (isAuthenticated && activeSection === SECTIONS.CHAT && chats.length === 0 && !chatsLoading && !currentChatId) {
      createChat().then(newChatId => {
        if (newChatId) {
          navigate(`/chat/${newChatId}`)
        }
      })
    }
  }, [isAuthenticated, activeSection, chats.length, chatsLoading, currentChatId, navigate])

  useEffect(() => {
    checkAuthStatus()
    
    const handleClickOutside = () => {
      setContextMenu(null)
    }
    
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    const path = location.pathname
    if (path.startsWith('/chat/')) {
      setActiveSection(SECTIONS.CHAT)
    } else if (path === '/goals') {
      setActiveSection(SECTIONS.GOALS)
    } else if (path === '/coach-notes') {
      setActiveSection(SECTIONS.NOTES)
    } else if (path === '/chat' || path === '/') {
      setActiveSection(SECTIONS.CHAT)
    }
  }, [location.pathname])

  useEffect(() => {
    if (chat_id && chat_id !== currentChatId) {
      setCurrentChatId(chat_id)
    }
  }, [chat_id, currentChatId])

  const validateToken = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/memories`, {
        method: 'GET',
        headers: getAuthHeaders()
      })
      return response.ok
    } catch {
      return false
    }
  }

  const checkAuthStatus = async (): Promise<void> => {
    try {
      const token = localStorage.getItem('auth_token')
      if (token) {
        const isValid = await validateToken()
        if (isValid) {
          setIsAuthenticated(true)
        } else {
          localStorage.removeItem('auth_token')
          setIsAuthenticated(false)
        }
      } else {
        setIsAuthenticated(false)
      }
    } catch (error) {
      localStorage.removeItem('auth_token')
      setIsAuthenticated(false)
    } finally {
      setAuthLoading(false)
    }
  }

  const saveAuthToken = (token: string): void => {
    try {
      localStorage.setItem('auth_token', token)
      setIsAuthenticated(true)
    } catch (error) {
      showNotification('Failed to save auth token', 'error')
    }
  }

  const logout = (): void => {
    try {
      localStorage.removeItem('auth_token')
    } catch (error) {
      showNotification('Failed to remove auth token', 'error')
    } finally {
      setIsAuthenticated(false)
      setMessages([])
      setMemories([])
      setGoals([])
      navigate('/chat')
    }
  }

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem('auth_token')
      return token ? { 'Authorization': `Bearer ${token}` } : {}
    } catch (error) {
      return {}
    }
  }

  const fetchMemories = async (): Promise<void> => {
    try {
      setMemoriesLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/memories`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setMemories(data.memories || [])
      }
    } catch (error) {
      showNotification('Failed to fetch memories', 'error')
    } finally {
      setMemoriesLoading(false)
    }
  }

  const deleteMemory = async (memoryId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/memories/${memoryId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        setMemories(prev => prev.filter(memory => memory.id !== memoryId))
      }
    } catch (error) {
      showNotification('Failed to delete memory', 'error')
    }
  }


  const saveMessage = async (message: Message): Promise<void> => {
    if (!currentChatId) {
      return
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          content: message.text,
          sender: message.sender,
          chat_id: parseInt(currentChatId)
        })
      })
      
      if (response.ok) {
        moveCurrentChatToTop()
      }
    } catch (error) {
      showNotification('Failed to save message', 'error')
    }
  }

  const moveCurrentChatToTop = (): void => {
    if (!currentChatId) return
    
    setChats(prev => {
      const currentChat = prev.find(chat => chat.id === currentChatId)
      if (!currentChat) return prev
      
      const otherChats = prev.filter(chat => chat.id !== currentChatId)
      return [currentChat, ...otherChats]
    })
  }

  const clearChat = () => {
    if (!currentChatId) return
    confirmDeleteChat(currentChatId)
  }

  const fetchGoals = async (): Promise<void> => {
    try {
      setGoalsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/goals`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setGoals(data.goals || [])
      } else if (response.status === 401) {
        logout()
      }
    } catch (error) {
      showNotification('Failed to fetch goals', 'error')
    } finally {
      setGoalsLoading(false)
    }
  }

  const createGoal = async (goalData: any): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          title: goalData.title,
          description: goalData.description,
          category: goalData.category || null,
          priority: goalData.priority || null,
          target_date: goalData.targetDate || null
        })
      })

      if (response.ok) {
        const newGoal = await response.json()
        setGoals(prev => [newGoal, ...prev])
        showNotification('Goal created successfully!', 'success')
      } else if (response.status === 401) {
        logout()
      } else {
        throw new Error('Failed to create goal')
      }
    } catch (error) {
      showNotification('Failed to create goal', 'error')
    }
  }

  const deleteGoal = async (goalId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/goals/${goalId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        setGoals(prev => prev.filter(goal => goal.id !== goalId))
        showNotification('Goal deleted successfully', 'success')
      } else if (response.status === 401) {
        logout()
      } else {
        throw new Error('Failed to delete goal')
      }
    } catch (error) {
      showNotification('Failed to delete goal', 'error')
    }
  }

  const fetchChats = async (): Promise<void> => {
    try {
      setChatsLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/chats`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setChats(data.chats || [])
        if (data.chats?.length > 0 && !currentChatId) {
          setCurrentChatId(data.chats[0].id)
        } else if (data.chats?.length === 0) {
          setCurrentChatId(null)
          setMessages([])
        }
      } else if (response.status === 401) {
        logout()
      }
    } catch (error) {
      showNotification('Failed to fetch chats', 'error')
    } finally {
      setChatsLoading(false)
    }
  }

  const createChat = async (title: string = 'New Chat'): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ title })
      })

      if (response.ok) {
        const data = await response.json()
        setChats(prev => [data, ...prev])
        setCurrentChatId(data.id)
        setMessages([])
        if (title !== 'New Chat') {
          showNotification('New chat created', 'success')
        }
        return data.id
      } else if (response.status === 401) {
        logout()
      } else {
        throw new Error('Failed to create chat')
      }
    } catch (error) {
      if (title !== 'New Chat') {
        showNotification('Failed to create chat', 'error')
      }
    }
    return null
  }

  const updateChatTitle = async (chatId: string, title: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ title })
      })

      if (response.ok) {
        setChats(prev => prev.map(chat => 
          chat.id === chatId ? { ...chat, title } : chat
        ))
      } else {
        showNotification('Failed to update chat title', 'error')
      }
    } catch (error) {
      showNotification('Failed to update chat title', 'error')
    }
  }

  const generateChatTitle = async (message: string): Promise<string> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/generate-title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ message })
      })
      
      if (response.ok) {
        const data = await response.json()
        return data.title
      } else if (response.status === 401) {
        logout()
      }
    } catch (error) {
      showNotification('Failed to generate title', 'error')
    }
    
    const words = message.trim().split(' ').slice(0, 5)
    let title = words.join(' ')
    if (title.length > 30) {
      title = title.substring(0, 27) + '...'
    }
    return title || 'New Chat'
  }

  const confirmDeleteChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId)
    setConfirmDialog({
      isOpen: true,
      chatId,
      chatTitle: chat?.title || 'this chat'
    })
  }

  const deleteChat = async (chatId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const remainingChats = chats.filter(chat => chat.id !== chatId)
        setChats(remainingChats)
        
        if (currentChatId === chatId) {
          setCurrentChatId(null)
          setMessages([])
          const newChatId = await createChat()
          if (newChatId) {
            navigate(`/chat/${newChatId}`)
          }
        }
        showNotification('Chat deleted', 'success')
      } else if (response.status === 401) {
        logout()
      } else {
        throw new Error('Failed to delete chat')
      }
    } catch (error) {
      showNotification('Failed to delete chat', 'error')
    }
  }

  const handleConfirmDelete = () => {
    if (confirmDialog.chatId) {
      deleteChat(confirmDialog.chatId)
    }
    setConfirmDialog({ isOpen: false })
  }

  const fetchChatMessages = async (chatId: string): Promise<void> => {
    try {
      setMessagesLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/messages`, {
        method: 'GET',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      } else if (response.status === 401) {
        logout()
      } else if (response.status === 404) {
        setMessages([])
        setCurrentChatId(null)
      } else {
        showNotification('Failed to fetch messages', 'error')
      }
    } catch (error) {
      showNotification('Failed to fetch chat messages', 'error')
    } finally {
      setMessagesLoading(false)
    }
  }

  const updateGoalStatus = async (goalId: string, status: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/goals/${goalId}/status?status=${status}`, {
        method: 'PUT',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        const updatedGoal = await response.json()
        setGoals(prev => prev.map(goal => 
          goal.id === goalId ? updatedGoal : goal
        ))
        showNotification(`Goal marked as ${status.toLowerCase()}`, 'success')
      } else if (response.status === 401) {
        logout()
      } else {
        throw new Error('Failed to update goal status')
      }
    } catch (error) {
      showNotification('Failed to update goal status', 'error')
    }
  }

  const login = async (email: string, password: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (response.ok) {
        const data = await response.json()
        saveAuthToken(data.access_token)
      } else {
        const error = await response.json()
        throw new Error(error.detail || 'Login failed')
      }
    } catch (error) {
      throw error
    }
  }

  const register = async (email: string, password: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (response.ok) {
        const data = await response.json()
        saveAuthToken(data.access_token)
      } else {
        const error = await response.json()
        throw new Error(error.detail || 'Registration failed')
      }
    } catch (error) {
      throw error
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setAuthError('')
    setIsSubmitting(true)

    try {
      if (isLogin) {
        await login(authEmail, authPassword)
      } else {
        await register(authEmail, authPassword)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const showNotification = (message: string, type: 'error' | 'success' | 'info') => {
    const id = Date.now().toString()
    const notification: Notification = { id, message, type }
    
    setNotifications(prev => [...prev, notification])
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  const handleContextMenu = (e: React.MouseEvent, url: string, onDelete?: () => void) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, url, onDelete })
  }

  const handleOpenInNewTab = () => {
    if (contextMenu) {
      window.open(contextMenu.url, '_blank')
    }
  }

  const getSectionTitle = (): string => {
    const titles: Record<string, string> = {
      [SECTIONS.CHAT]: 'Chat',
      [SECTIONS.GOALS]: 'Goals',
      [SECTIONS.NOTES]: 'Coach Notes'
    }
    return titles[activeSection] || 'Chat'
  }

  const handleSectionChange = (section: string) => {
    if (section === SECTIONS.CHAT) {
      navigate('/chat')
    } else if (section === SECTIONS.GOALS) {
      navigate('/goals')
    } else if (section === SECTIONS.NOTES) {
      navigate('/coach-notes')
    }
  }


  const renderActiveSection = (): React.JSX.Element => {
    switch (activeSection) {
      case SECTIONS.CHAT:
        return (
          <ChatSection
            messages={messages}
            setMessages={setMessages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            getAuthHeaders={getAuthHeaders}
            showNotification={showNotification}
            logout={logout}
            saveMessage={saveMessage}
            messagesLoading={messagesLoading}
            clearChat={clearChat}
            currentChatId={currentChatId}
            createChat={createChat}
            updateChatTitle={updateChatTitle}
            generateChatTitle={generateChatTitle}
          />
        )
      case SECTIONS.GOALS:
        return (
          <GoalsSection 
            goals={goals}
            goalsLoading={goalsLoading}
            createGoal={createGoal}
            deleteGoal={deleteGoal}
            updateGoalStatus={updateGoalStatus}
          />
        )
      case SECTIONS.NOTES:
        return (
          <NotesSection
            memories={memories}
            memoriesLoading={memoriesLoading}
            deleteMemory={deleteMemory}
          />
        )
      default:
        return (
          <ChatSection
            messages={messages}
            setMessages={setMessages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            getAuthHeaders={getAuthHeaders}
            showNotification={showNotification}
            logout={logout}
            saveMessage={saveMessage}
            messagesLoading={messagesLoading}
            clearChat={clearChat}
            currentChatId={currentChatId}
            createChat={createChat}
            updateChatTitle={updateChatTitle}
            generateChatTitle={generateChatTitle}
          />
        )
    }
  }

  const renderAuthForm = (): React.JSX.Element => {
    return (
      <div className="auth-container">
        <div className="auth-form">
          <h2>{isLogin ? 'Login' : 'Register'}</h2>
          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <input
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group">
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
            </button>
          </form>
          <p className="auth-switch">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button" 
              className="link-button" 
              onClick={() => setIsLogin(!isLogin)}
              disabled={isSubmitting}
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    )
  }

  const renderMainContent = () => (
    <div className="main-content">
      <div className="section-header">
        <h1>{getSectionTitle()}</h1>
        {activeSection === SECTIONS.CHAT && messages.length > 0 && (
          <Link 
            to="/chat"
            onClick={async (e) => {
              e.preventDefault()
              const newChatId = await createChat()
              if (newChatId) {
                navigate(`/chat/${newChatId}`)
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, '/chat')}
            className="header-new-chat-button"
            title="New Chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </Link>
        )}
      </div>
      {renderActiveSection()}
    </div>
  )

  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-message">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return renderAuthForm()
  }

  const renderNotifications = () => (
    <div className="notifications-container">
      {notifications.map((notification) => (
        <div 
          key={notification.id} 
          className={`notification notification-${notification.type}`}
        >
          <div className="notification-content">
            <div className="notification-message">{notification.message}</div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="app-container" onContextMenu={(e) => e.preventDefault()}>
      <Sidebar
        activeSection={activeSection}
        setActiveSection={handleSectionChange}
        logout={logout}
        chats={chats}
        currentChatId={currentChatId}
        deleteChat={confirmDeleteChat}
        onContextMenu={handleContextMenu}
      />
      {renderMainContent()}
      {renderNotifications()}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onOpenNewTab={handleOpenInNewTab}
          onClose={() => setContextMenu(null)}
          onDelete={contextMenu.onDelete}
        />
      )}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Delete Chat"
        message={`Are you sure you want to delete "${confirmDialog.chatTitle}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDialog({ isOpen: false })}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppRoutes />} />
        <Route path="/chat" element={<AppRoutes />} />
        <Route path="/chat/:chat_id" element={<AppRoutes />} />
        <Route path="/goals" element={<AppRoutes />} />
        <Route path="/coach-notes" element={<AppRoutes />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App