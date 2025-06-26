import { useState, useEffect } from 'react'
import ChatSection from './components/Chat/ChatSection'
import GoalsSection from './components/Goals/GoalsSection'
import NotesSection from './components/Notes/NotesSection'
import Sidebar from './components/Sidebar/Sidebar'
import './App.css'

const API_BASE_URL = 'http://localhost:8000'

const SECTIONS = {
  CHAT: 'chat',
  GOALS: 'goals',
  NOTES: 'notes'
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

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [activeSection, setActiveSection] = useState<string>(SECTIONS.CHAT)
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
    if (isAuthenticated && activeSection === SECTIONS.CHAT && chats.length === 0 && !chatsLoading) {
      createChat()
    }
  }, [isAuthenticated, activeSection, chats.length, chatsLoading])

  useEffect(() => {
    checkAuthStatus()
  }, [])

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
      console.error('Failed to save auth token:', error)
    }
  }

  const logout = (): void => {
    try {
      localStorage.removeItem('auth_token')
    } catch (error) {
      console.error('Failed to remove auth token:', error)
    } finally {
      setIsAuthenticated(false)
      setMessages([])
      setMemories([])
      setGoals([])
      setActiveSection(SECTIONS.CHAT)
    }
  }

  const getAuthHeaders = (): Record<string, string> => {
    try {
      const token = localStorage.getItem('auth_token')
      return token ? { 'Authorization': `Bearer ${token}` } : {}
    } catch (error) {
      console.error('Failed to get auth token:', error)
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
      console.error('Failed to fetch memories:', error)
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
      console.error('Failed to delete memory:', error)
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
      } else {
        console.error('Failed to save message, status:', response.status)
      }
    } catch (error) {
      console.error('Failed to save message:', error)
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

  const clearChat = async (): Promise<void> => {
    if (!currentChatId) return
    
    try {
      await deleteChat(currentChatId)
    } catch (error) {
      console.error('Failed to clear chat:', error)
      showNotification('Failed to clear chat', 'error')
    }
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
      console.error('Failed to fetch goals:', error)
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
      console.error('Failed to create goal:', error)
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
      console.error('Failed to delete goal:', error)
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
      console.error('Failed to fetch chats:', error)
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
      console.error('Failed to create chat:', error)
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
      }
    } catch (error) {
      console.error('Failed to update chat title:', error)
    }
  }

  const generateChatTitle = (message: string): string => {
    const words = message.trim().split(' ').slice(0, 5)
    let title = words.join(' ')
    if (title.length > 30) {
      title = title.substring(0, 27) + '...'
    }
    return title || 'New Chat'
  }

  const deleteChat = async (chatId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId))
        if (currentChatId === chatId) {
          const remainingChats = chats.filter(chat => chat.id !== chatId)
          if (remainingChats.length > 0) {
            setCurrentChatId(remainingChats[0].id)
          } else {
            setCurrentChatId(null)
            setMessages([])
          }
        }
        showNotification('Chat deleted', 'success')
      } else if (response.status === 401) {
        logout()
      } else {
        throw new Error('Failed to delete chat')
      }
    } catch (error) {
      console.error('Failed to delete chat:', error)
      showNotification('Failed to delete chat', 'error')
    }
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
      } else {
        console.error('Failed to fetch messages, status:', response.status)
      }
    } catch (error) {
      console.error('Failed to fetch chat messages:', error)
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
      console.error('Failed to update goal status:', error)
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

  const getSectionTitle = (): string => {
    const titles: Record<string, string> = {
      [SECTIONS.CHAT]: 'Chat',
      [SECTIONS.GOALS]: 'Goals',
      [SECTIONS.NOTES]: 'Coach Notes'
    }
    return titles[activeSection] || 'Chat'
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
            chats={chats}
            currentChatId={currentChatId}
            createChat={createChat}
            chatsLoading={chatsLoading}
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
            chats={chats}
            currentChatId={currentChatId}
            createChat={createChat}
            chatsLoading={chatsLoading}
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
        {activeSection === SECTIONS.CHAT && (
          <button 
            onClick={() => createChat()}
            className="header-new-chat-button"
            disabled={chatsLoading}
            title="New Chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
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
    <div className="app-container">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        logout={logout}
        chats={chats}
        currentChatId={currentChatId}
        setCurrentChatId={setCurrentChatId}
        deleteChat={deleteChat}
      />
      {renderMainContent()}
      {renderNotifications()}
    </div>
  )
}

export default App