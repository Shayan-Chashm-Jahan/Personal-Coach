import { useState, useEffect } from 'react'

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
  createdAt: string
}

export default function Material() {
  const [activeTab, setActiveTab] = useState<'videos' | 'books'>('videos')
  const [books, setBooks] = useState<Book[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)

  const getYouTubeThumbnail = (url: string): string => {
    const videoId = extractYouTubeVideoId(url)
    return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : ''
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

  useEffect(() => {
    fetchMaterials()
  }, [])

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
        setBooks(booksData.books)
        setVideos(videosData.videos)
      }
    } catch (error) {
      console.error('Error fetching materials:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="material-section">
      <div className="material-header">
        <div className="material-tabs">
          <button
            className={`material-tab ${activeTab === 'videos' ? 'active' : ''}`}
            onClick={() => setActiveTab('videos')}
          >
            Videos
          </button>
          <button
            className={`material-tab ${activeTab === 'books' ? 'active' : ''}`}
            onClick={() => setActiveTab('books')}
          >
            Books
          </button>
        </div>
      </div>

      <div className="material-content">
        {loading ? (
          <div className="material-loading">
            <p>Loading recommendations...</p>
          </div>
        ) : activeTab === 'videos' ? (
          videos.length > 0 ? (
            <div className="material-grid">
              {videos.map((video) => (
                <div key={video.id} className="material-card video-card">
                  {getYouTubeThumbnail(video.url) && (
                    <div className="video-thumbnail">
                      <img 
                        src={getYouTubeThumbnail(video.url)} 
                        alt={video.title}
                        className="thumbnail-image"
                      />
                    </div>
                  )}
                  <div className="video-content">
                    <h3 className="material-title">{video.title}</h3>
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
        ) : (
          books.length > 0 ? (
            <div className="material-grid">
              {books.map((book) => (
                <div key={book.id} className="material-card">
                  <h3 className="material-title">{book.title}</h3>
                  <p className="material-author">by {book.author}</p>
                  <p className="material-description">{book.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="material-empty">
              <p>No books available yet</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}