import { useState, useEffect } from 'react'
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
      <div className="material-tabs-container">
        <div className="material-tabs">
          <button
            className={`material-tab ${activeTab === 'books' ? 'active' : ''}`}
            onClick={() => navigate('/material/books')}
          >
            Books
          </button>
          <button
            className={`material-tab ${activeTab === 'videos' ? 'active' : ''}`}
            onClick={() => navigate('/material/videos')}
          >
            Videos
          </button>
        </div>
      </div>

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
                        onClick={() => {
                          setDiscussModal({ isOpen: true, book })
                          setCurrentChapterIndex(0)
                          fetchBookSummary(book)
                        }}
                      >
                        Discuss
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
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="material-link"
                    >
                      Watch Video
                    </a>
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
        <div className="discuss-modal-overlay" onClick={() => setDiscussModal({ isOpen: false, book: null })}>
          <div className="discuss-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="discuss-modal-close"
              onClick={() => {
                setDiscussModal({ isOpen: false, book: null })
                setBookSummary([])
                setCurrentChapterIndex(0)
              }}
            >
              ×
            </button>
            <div className="discuss-modal-content">
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
      )}
    </div>
  )
}