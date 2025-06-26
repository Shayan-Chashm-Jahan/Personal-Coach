import React from 'react'
import './ContextMenu.css'

interface ContextMenuProps {
  x: number
  y: number
  onOpenNewTab: () => void
  onClose: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onOpenNewTab, onClose }) => {
  return (
    <div 
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={onClose}
    >
      <div 
        className="context-menu-item"
        onClick={(e) => {
          e.stopPropagation()
          onOpenNewTab()
          onClose()
        }}
      >
        Open in new tab
      </div>
    </div>
  )
}

export default ContextMenu