import { useState } from 'react'

export default function Material() {
  const [activeTab, setActiveTab] = useState<'videos' | 'books'>('videos')

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
        {activeTab === 'videos' ? (
          <div className="material-empty">
            <p>No videos available yet</p>
          </div>
        ) : (
          <div className="material-empty">
            <p>No books available yet</p>
          </div>
        )}
      </div>
    </div>
  )
}