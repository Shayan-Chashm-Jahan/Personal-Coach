import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

interface Book {
  id: string
  title: string
  author: string
  description: string
  createdAt: string
}

interface Video {
  id: string
  title: string
  url: string
  description: string
  thumbnail?: string
  createdAt: string
}

interface ValidatedVideo extends Video {
  youtubeTitle: string
}

interface ValidatedBook extends Book {
  coverUrl: string | null
  dominantColor: string | null
  googleTitle: string | null
  bookUrl: string | null
}

interface MaterialFeedback {
  id: number
  rating: number
  review: string | null
  completed: boolean
  created_at: string
  updated_at: string
}

interface FeedbackModal {
  isOpen: boolean
  materialType: 'book' | 'video'
  materialId: string
  materialTitle: string
  existingFeedback?: MaterialFeedback | null
}

export default function Material() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<'books' | 'videos'>('books')
  const [validBooks, setValidBooks] = useState<ValidatedBook[]>([])
  const [validVideos, setValidVideos] = useState<ValidatedVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [discussModal, setDiscussModal] = useState<{ isOpen: boolean; book: ValidatedBook | null }>({
    isOpen: false,
    book: null
  })
  const [bookSummary, setBookSummary] = useState<{ chapter: string; content: string }[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0)
  const [chatMessages, setChatMessages] = useState<Array<{ text: string; sender: 'user' | 'assistant' }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [feedbacks, setFeedbacks] = useState<Record<string, MaterialFeedback>>({})
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModal>({
    isOpen: false,
    materialType: 'video',
    materialId: '',
    materialTitle: '',
    existingFeedback: null
  })
  const [feedbackFormData, setFeedbackFormData] = useState({
    rating: 0,
    review: ''
  })
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null)

  const getYouTubeThumbnail = (url: string): string => {
    const videoId = extractYouTubeVideoId(url)
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : ''
  }

  const extractYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const validateYouTubeVideo = async (url: string): Promise<string | null> => {
    const videoId = extractYouTubeVideoId(url)
    if (!videoId) return null

    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      if (response.ok) {
        const data = await response.json()
        return data.title || null
      }
      return null
    } catch {
      return null
    }
  }

  const validateVideos = async (videoList: Video[]) => {
    const deduplicatedVideos = deduplicateVideos(videoList)

    const validationPromises = deduplicatedVideos.map(async (video) => {
      const youtubeTitle = await validateYouTubeVideo(video.url)
      return youtubeTitle ? { ...video, youtubeTitle } : null
    })

    const results = await Promise.all(validationPromises)
    const filtered = results.filter((video): video is ValidatedVideo => video !== null)
    setValidVideos(filtered)
  }

  const deduplicateVideos = (videoList: Video[]): Video[] => {
    const seen = new Set<string>()
    return videoList.filter((video) => {
      const videoId = extractYouTubeVideoId(video.url)
      if (!videoId || seen.has(videoId)) {
        return false
      }
      seen.add(videoId)
      return true
    })
  }

  const fetchBookData = async (title: string, author: string): Promise<{ coverUrl: string | null; googleTitle: string | null; bookUrl: string | null }> => {
    try {
      const query = `${title} ${author}`.replace(/[^\w\s]/g, '').trim()
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`)

      if (response.ok) {
        const data = await response.json()
        const book = data.items?.[0]
        const imageLinks = book?.volumeInfo?.imageLinks
        const googleTitle = book?.volumeInfo?.title || null
        const coverUrl = imageLinks?.thumbnail || imageLinks?.smallThumbnail || null

        const bookUrl = book?.volumeInfo?.infoLink || null

        return { coverUrl, googleTitle, bookUrl }
      }
      return { coverUrl: null, googleTitle: null, bookUrl: null }
    } catch {
      return { coverUrl: null, googleTitle: null, bookUrl: null }
    }
  }

  const deriveBackgroundColor = (r: number, g: number, b: number): string => {
    const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
      r /= 255
      g /= 255
      b /= 255

      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      let h = 0, s = 0, l = (max + min) / 2

      if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break
          case g: h = (b - r) / d + 2; break
          case b: h = (r - g) / d + 4; break
        }
        h /= 6
      }

      return [h * 360, s, l]
    }

    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
      h /= 360

      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }

      if (s === 0) {
        return [l * 255, l * 255, l * 255]
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q

      return [
        Math.round(hue2rgb(p, q, h + 1/3) * 255),
        Math.round(hue2rgb(p, q, h) * 255),
        Math.round(hue2rgb(p, q, h - 1/3) * 255)
      ]
    }

    const [h, s, l] = rgbToHsl(r, g, b)

    const newS = Math.max(0.15, s * 0.3)
    const newL = Math.min(0.95, Math.max(0.85, l + 0.4))

    const [newR, newG, newB] = hslToRgb(h, newS, newL)
    return `rgb(${newR}, ${newG}, ${newB})`
  }

  const extractDominantColor = (imageUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve('#f5f5f5')
            return
          }

          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imageData.data
          const colorMap: { [key: string]: number } = {}

          for (let i = 0; i < data.length; i += 16) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const alpha = data[i + 3]

            if (alpha > 128) {
              const color = `${Math.floor(r / 32) * 32},${Math.floor(g / 32) * 32},${Math.floor(b / 32) * 32}`
              colorMap[color] = (colorMap[color] || 0) + 1
            }
          }

          if (Object.keys(colorMap).length === 0) {
            resolve('#f5f5f5')
            return
          }

          const dominantColor = Object.keys(colorMap).reduce((a, b) =>
            colorMap[a] > colorMap[b] ? a : b
          )

          const [r, g, b] = dominantColor.split(',').map(Number)
          const derivedColor = deriveBackgroundColor(r, g, b)
          resolve(derivedColor)
        } catch (error) {
          resolve('#f5f5f5')
        }
      }

      img.onerror = () => {
        resolve('#f5f5f5')
      }

      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}`
      img.src = proxyUrl
    })
  }

  const validateBooks = async (bookList: Book[]) => {
    const deduplicatedBooks = deduplicateBooks(bookList)

    const validationPromises = deduplicatedBooks.map(async (book) => {
      const { coverUrl, googleTitle, bookUrl } = await fetchBookData(book.title, book.author || '')
      let dominantColor = null

      if (coverUrl) {
        dominantColor = await extractDominantColor(coverUrl)
      }

      return { ...book, coverUrl, dominantColor, googleTitle, bookUrl }
    })

    const results = await Promise.all(validationPromises)
    setValidBooks(results)
  }

  const deduplicateBooks = (bookList: Book[]): Book[] => {
    const seen = new Set<string>()
    return bookList.filter((book) => {
      const key = `${book.title.toLowerCase()}-${(book.author || '').toLowerCase()}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  useEffect(() => {
    fetchMaterials()
  }, [])

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto'
      const newHeight = Math.min(chatTextareaRef.current.scrollHeight, 120)
      chatTextareaRef.current.style.height = `${newHeight}px`
      
      if (chatTextareaRef.current.scrollHeight > 120) {
        chatTextareaRef.current.style.overflowY = 'auto'
      } else {
        chatTextareaRef.current.style.overflowY = 'hidden'
      }
    }
  }, [chatInput])

  useEffect(() => {
    if (location.pathname === '/material/books') {
      setActiveTab('books')
    } else if (location.pathname === '/material/videos') {
      setActiveTab('videos')
    } else if (location.pathname === '/material') {
      setActiveTab('books')
    }
  }, [location.pathname])

  const fetchBookSummary = async (book: ValidatedBook) => {
    setSummaryLoading(true)
    setBookSummary([])

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const response = await fetch('/api/books/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: book.googleTitle || book.title,
          author: book.author || ''
        })
      })

      if (response.ok) {
        const data = await response.json()
        setBookSummary(data.chapters || [])
      }
    } catch (error) {
      console.error('Error fetching book summary:', error)
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading || !discussModal.book) return

    const userMessage = chatInput.trim()
    setChatMessages(prev => [...prev, { text: userMessage, sender: 'user' }])
    setChatInput('')
    setChatLoading(true)
    
    setChatMessages(prev => [...prev, { text: '', sender: 'assistant' }])

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const response = await fetch('/api/books/discuss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage,
          bookId: discussModal.book.id,
          bookTitle: discussModal.book.googleTitle || discussModal.book.title,
          bookAuthor: discussModal.book.author || '',
          currentChapterIndex: currentChapterIndex,
          chapters: bookSummary,
          history: chatMessages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          }))
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      setChatMessages(prev => {
        const newMessages = [...prev]
        newMessages[newMessages.length - 1] = {
          text: data.response,
          sender: 'assistant'
        }
        return newMessages
      })
    } catch (error) {
      console.error('Error sending chat message:', error)
      setChatMessages(prev => {
        const newMessages = [...prev]
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].sender === 'assistant') {
          newMessages[newMessages.length - 1] = {
            text: 'Sorry, I encountered an error. Please try again.',
            sender: 'assistant'
          }
        }
        return newMessages
      })
    } finally {
      setChatLoading(false)
    }
  }

  const fetchFeedback = async (materialType: 'book' | 'video', materialId: string) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return null

      const response = await fetch(`/api/feedback/${materialType}/${materialId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        return data.feedback
      }
    } catch (error) {
      console.error('Error fetching feedback:', error)
    }
    return null
  }

  const fetchAllFeedbacks = async (books: Book[], videos: Video[]) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const feedbackPromises = [
        ...books.map(book => fetchFeedback('book', book.id)),
        ...videos.map(video => fetchFeedback('video', video.id))
      ]

      const feedbackResults = await Promise.all(feedbackPromises)
      const newFeedbacks: Record<string, MaterialFeedback> = {}

      books.forEach((book, index) => {
        if (feedbackResults[index]) {
          newFeedbacks[`book-${book.id}`] = feedbackResults[index]
        }
      })

      videos.forEach((video, index) => {
        const feedbackIndex = books.length + index
        if (feedbackResults[feedbackIndex]) {
          newFeedbacks[`video-${video.id}`] = feedbackResults[feedbackIndex]
        }
      })

      setFeedbacks(newFeedbacks)
    } catch (error) {
      console.error('Error fetching feedbacks:', error)
    }
  }

  const submitFeedback = async () => {
    if (feedbackLoading || feedbackFormData.rating === 0) return

    setFeedbackLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          material_type: feedbackModal.materialType,
          material_id: parseInt(feedbackModal.materialId),
          rating: feedbackFormData.rating,
          review: feedbackFormData.review || null,
          completed: true
        })
      })

      if (response.ok) {
        const data = await response.json()
        const feedbackKey = `${feedbackModal.materialType}-${feedbackModal.materialId}`
        setFeedbacks(prev => ({
          ...prev,
          [feedbackKey]: data.feedback
        }))
        
        setFeedbackModal({
          isOpen: false,
          materialType: 'video',
          materialId: '',
          materialTitle: '',
          existingFeedback: null
        })
        setFeedbackFormData({ rating: 0, review: '' })
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
    } finally {
      setFeedbackLoading(false)
    }
  }

  const openFeedbackModal = (materialType: 'book' | 'video', materialId: string, materialTitle: string) => {
    const feedbackKey = `${materialType}-${materialId}`
    const existingFeedback = feedbacks[feedbackKey] || null

    setFeedbackModal({
      isOpen: true,
      materialType,
      materialId,
      materialTitle,
      existingFeedback
    })

    if (existingFeedback) {
      setFeedbackFormData({
        rating: existingFeedback.rating,
        review: existingFeedback.review || ''
      })
    } else {
      setFeedbackFormData({ rating: 0, review: '' })
    }
  }

  const fetchMaterials = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) return

      const [booksResponse, videosResponse] = await Promise.all([
        fetch('/api/books', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/videos', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      if (booksResponse.ok && videosResponse.ok) {
        const booksData = await booksResponse.json()
        const videosData = await videosResponse.json()
        
        await fetchAllFeedbacks(booksData.books, videosData.videos)
        
        await Promise.all([
          validateBooks(booksData.books),
          validateVideos(videosData.videos)
        ])
      }
    } catch (error) {
      console.error('Error fetching materials:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="section-content">
      <div className="material-content">
        {loading ? (
          <div className="material-loading">
            <div className="loading-dots">
              <span className="loading-dot"></span>
              <span className="loading-dot"></span>
              <span className="loading-dot"></span>
            </div>
            <p className="loading-text">Loading recommendations</p>
          </div>
        ) : activeTab === 'books' ? (
          validBooks.length > 0 ? (
            <div className="material-grid">
              {validBooks.map((book) => (
                <div key={book.id} className="material-card book-card">
                  {book.coverUrl ? (
                    <div
                      className="book-cover"
                      style={{ backgroundColor: book.dominantColor || '#f5f5f5' }}
                    >
                      <img
                        src={book.coverUrl}
                        alt={book.title}
                        className="cover-image"
                      />
                    </div>
                  ) : (
                    <div className="book-cover no-cover">
                      <div className="no-cover-placeholder">
                        <span>📚</span>
                        <p>No Cover</p>
                      </div>
                    </div>
                  )}
                  <div className="book-content">
                    <h3 className="material-title">{book.googleTitle || book.title}</h3>
                    <p className="material-author">by {book.author}</p>
                    <p className="material-description">{book.description}</p>
                    <div className="book-actions">
                      {book.bookUrl && (
                        <a
                          href={book.bookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="material-link"
                        >
                          View Book
                        </a>
                      )}
                      <button
                        className="material-link discuss-book-button"
                        onClick={async () => {
                          setChatMessages([])
                          setDiscussModal({ isOpen: true, book })
                          setCurrentChapterIndex(0)
                          setChatInput('')
                          setIsChatOpen(true)
                          fetchBookSummary(book)
                          
                          try {
                            const token = localStorage.getItem('auth_token')
                            if (token) {
                              const response = await fetch(`/api/books/${book.id}/chat`, {
                                headers: { Authorization: `Bearer ${token}` }
                              })
                              if (response.ok) {
                                const data = await response.json()
                                const formattedChat = data.chat.map((msg: any) => ({
                                  text: msg.content,
                                  sender: msg.role === 'user' ? 'user' : 'assistant'
                                }))
                                setChatMessages(formattedChat)
                              } else {
                                setChatMessages([])
                              }
                            }
                          } catch (error) {
                            console.error('Error loading chat history:', error)
                            setChatMessages([])
                          }
                        }}
                      >
                        Discuss
                      </button>
                      <button
                        className={`feedback-button ${feedbacks[`book-${book.id}`] ? 'has-feedback' : ''}`}
                        onClick={() => openFeedbackModal('book', book.id, book.googleTitle || book.title)}
                        title={feedbacks[`book-${book.id}`] ? 'Update feedback' : 'Mark as read & give feedback'}
                      >
                        {feedbacks[`book-${book.id}`] ? '✓ Read' : 'Mark as Read'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="material-empty">
              <p>No books available yet</p>
            </div>
          )
        ) : (
          validVideos.length > 0 ? (
            <div className="material-grid">
              {validVideos.map((video) => (
                <div key={video.id} className="material-card video-card">
                  {(video.thumbnail || getYouTubeThumbnail(video.url)) && (
                    <div className="video-thumbnail">
                      <img
                        src={video.thumbnail || getYouTubeThumbnail(video.url)}
                        alt={video.title}
                        className="thumbnail-image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          if (video.thumbnail && target.src === video.thumbnail) {
                            target.src = getYouTubeThumbnail(video.url)
                          }
                        }}
                      />
                    </div>
                  )}
                  <div className="video-content">
                    <h3 className="material-title">{video.youtubeTitle}</h3>
                    <p className="material-description">{video.description}</p>
                    <div className="video-actions">
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="material-link"
                      >
                        Watch Video
                      </a>
                      <button
                        className={`feedback-button ${feedbacks[`video-${video.id}`] ? 'has-feedback' : ''}`}
                        onClick={() => openFeedbackModal('video', video.id, video.youtubeTitle)}
                        title={feedbacks[`video-${video.id}`] ? 'Update feedback' : 'Mark as watched & give feedback'}
                      >
                        {feedbacks[`video-${video.id}`] ? '✓ Watched' : 'Mark as Watched'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="material-empty">
              <p>No videos available yet</p>
            </div>
          )
        )}
      </div>

      {discussModal.isOpen && (
        <div className="discuss-modal-overlay" onClick={() => {
          setDiscussModal({ isOpen: false, book: null })
          setBookSummary([])
          setCurrentChapterIndex(0)
          setChatMessages([])
          setChatInput('')
          setIsChatOpen(true)
        }}>
          <div className="discuss-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="discuss-modal-close"
              onClick={() => {
                setDiscussModal({ isOpen: false, book: null })
                setBookSummary([])
                setCurrentChapterIndex(0)
                setChatMessages([])
                setChatInput('')
                setIsChatOpen(true)
              }}
            >
              ×
            </button>
            <div className="discuss-modal-content">
              {isChatOpen && (
                <div className="discuss-modal-left">
                  <button 
                    className="chat-toggle-button chat-toggle-inside"
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    title="Hide chat"
                  >
                    ◀
                  </button>
                <div className="chat-container">
                  <div className="chat-messages">
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} className={`chat-message ${msg.sender}`}>
                        <div className="chat-message-content">
                          {msg.sender === 'assistant' ? (
                            msg.text ? (
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
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
                            msg.text
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={chatMessagesEndRef} />
                  </div>
                  <div className="chat-input-container">
                    <textarea
                      ref={chatTextareaRef}
                      className="chat-input"
                      placeholder="Ask about this book..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !chatLoading && chatInput.trim()) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      disabled={chatLoading}
                      rows={1}
                    />
                    <button 
                      className="chat-send-button" 
                      disabled={chatLoading || !chatInput.trim()}
                      onClick={handleSendMessage}
                    >
                      Send
                    </button>
                  </div>
                </div>
                </div>
              )}
              <div className={`discuss-modal-right ${!isChatOpen ? 'full-width' : ''}`}>
                {!isChatOpen && (
                  <button 
                    className="chat-toggle-button"
                    onClick={() => setIsChatOpen(!isChatOpen)}
                    title="Show chat"
                  >
                    ▶
                  </button>
                )}
                {discussModal.book && (
                  <div className="book-summary-header">
                    <h2>{discussModal.book.googleTitle || discussModal.book.title}</h2>
                    <p className="book-summary-author">by {discussModal.book.author}</p>
                  </div>
                )}

                {summaryLoading ? (
                <div className="summary-loading">
                  <div className="loading-dots">
                    <span className="loading-dot"></span>
                    <span className="loading-dot"></span>
                    <span className="loading-dot"></span>
                  </div>
                  <p className="loading-text">Generating chapter summaries...</p>
                </div>
              ) : bookSummary.length > 0 ? (
                <div className="chapter-viewer">
                  <div className="chapter-section">
                    <h3 className="chapter-title">{bookSummary[currentChapterIndex].chapter}</h3>
                    <div className="chapter-content">
                      <ReactMarkdown>{bookSummary[currentChapterIndex].content}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="chapter-navigation">
                    <button
                      className="chapter-nav-button"
                      onClick={() => setCurrentChapterIndex(prev => Math.max(0, prev - 1))}
                      disabled={currentChapterIndex === 0}
                    >
                      Previous
                    </button>
                    <span className="chapter-indicator">
                      Chapter {currentChapterIndex + 1} of {bookSummary.length}
                    </span>
                    <button
                      className="chapter-nav-button"
                      onClick={() => setCurrentChapterIndex(prev => Math.min(bookSummary.length - 1, prev + 1))}
                      disabled={currentChapterIndex === bookSummary.length - 1}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <div className="no-summary">
                  <p>No chapter summaries available</p>
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {feedbackModal.isOpen && (
        <div className="feedback-modal-overlay" onClick={() => {
          setFeedbackModal({
            isOpen: false,
            materialType: 'video',
            materialId: '',
            materialTitle: '',
            existingFeedback: null
          })
          setFeedbackFormData({ rating: 0, review: '' })
        }}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="feedback-modal-close"
              onClick={() => {
                setFeedbackModal({
                  isOpen: false,
                  materialType: 'video',
                  materialId: '',
                  materialTitle: '',
                  existingFeedback: null
                })
                setFeedbackFormData({ rating: 0, review: '' })
              }}
            >
              ×
            </button>
            <h2 className="feedback-modal-title">
              {feedbackModal.existingFeedback ? 'Update Your Feedback' : 'Give Your Feedback'}
            </h2>
            <p className="feedback-modal-subtitle">{feedbackModal.materialTitle}</p>
            
            <div className="feedback-rating">
              <p className="feedback-label">How did you like this {feedbackModal.materialType}?</p>
              <div className="rating-buttons">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    className={`rating-button ${feedbackFormData.rating === rating ? 'selected' : ''}`}
                    onClick={() => setFeedbackFormData(prev => ({ ...prev, rating }))}
                  >
                    <svg className="rating-icon" viewBox="0 0 24 24" fill="currentColor">
                      {rating === 1 && (
                        <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-3.5 3.5c-1.83 0-3.38.97-4.26 2.4-.16.26.04.6.35.6h7.82c.31 0 .51-.34.35-.6-.88-1.43-2.43-2.4-4.26-2.4z"/>
                      )}
                      {rating === 2 && (
                        <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-3.5 4c-1.19 0-2.21.51-2.81 1.3-.11.15.02.3.21.3h5.2c.19 0 .32-.15.21-.3-.6-.79-1.62-1.3-2.81-1.3z"/>
                      )}
                      {rating === 3 && (
                        <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 4h8v1.5h-8z"/>
                      )}
                      {rating === 4 && (
                        <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3.5-9c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm7 0c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-3.5 6.5c2.03 0 3.8-1.11 4.75-2.75.19-.33-.05-.75-.44-.75H7.69c-.38 0-.63.42-.44.75.95 1.64 2.72 2.75 4.75 2.75z"/>
                      )}
                      {rating === 5 && (
                        <>
                          <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                          <path d="M8.5 7.5l.75 1.55L11 9.5l-1.25.45L8.5 11.5l-.75-1.55L6 9.5l1.75-.45z"/>
                          <path d="M15.5 7.5l.75 1.55L18 9.5l-1.75.45-.75 1.55-.75-1.55L13 9.5l1.75-.45z"/>
                          <path d="M12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                        </>
                      )}
                    </svg>
                    <span className="rating-label">
                      {rating === 1 && 'Poor'}
                      {rating === 2 && 'Fair'}
                      {rating === 3 && 'Good'}
                      {rating === 4 && 'Very Good'}
                      {rating === 5 && 'Excellent'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="feedback-review">
              <label htmlFor="review" className="feedback-label">Your review (optional)</label>
              <textarea
                id="review"
                className="feedback-textarea"
                placeholder={`Share your thoughts about this ${feedbackModal.materialType}...`}
                value={feedbackFormData.review}
                onChange={(e) => setFeedbackFormData(prev => ({ ...prev, review: e.target.value }))}
                rows={4}
              />
            </div>
            
            <div className="feedback-actions">
              <button
                className="feedback-cancel"
                onClick={() => {
                  setFeedbackModal({
                    isOpen: false,
                    materialType: 'video',
                    materialId: '',
                    materialTitle: '',
                    existingFeedback: null
                  })
                  setFeedbackFormData({ rating: 0, review: '' })
                }}
              >
                Cancel
              </button>
              <button
                className="feedback-submit"
                onClick={submitFeedback}
                disabled={feedbackFormData.rating === 0 || feedbackLoading}
              >
                {feedbackLoading ? 'Submitting...' : feedbackModal.existingFeedback ? 'Update Feedback' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}