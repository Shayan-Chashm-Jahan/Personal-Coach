import React from 'react'
import './ContextMenu.css'

interface ContextMenuProps {
  x: number
  y: number
  onOpenNewTab: () => void
  onClose: () => void
  onDelete?: () => void
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onOpenNewTab, onClose, onDelete }) => {
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
      {onDelete && (
        <div 
          className="context-menu-item context-menu-item-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
            onClose()
          }}
        >
          Delete
        </div>
      )}
    </div>
  )
}

export default ContextMenu