import { useState } from 'react'

interface Goal {
  id: string
  title: string
  description: string
  category?: 'Health' | 'Career' | 'Personal' | 'Financial' | 'Learning' | 'Other'
  priority?: 'High' | 'Medium' | 'Low'
  status: 'Active' | 'Completed' | 'Paused'
  createdAt: string
  targetDate?: string
}

interface GoalsSectionProps {
  goals: Goal[]
  goalsLoading: boolean
  createGoal: (goalData: any) => Promise<void>
  deleteGoal: (goalId: string) => Promise<void>
  updateGoalStatus: (goalId: string, status: string) => Promise<void>
}

export default function GoalsSection({
  goals,
  goalsLoading,
  createGoal,
  deleteGoal,
  updateGoalStatus
}: GoalsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newGoal, setNewGoal] = useState({
    description: '',
    category: undefined as Goal['category'] | undefined,
    priority: undefined as Goal['priority'] | undefined,
    targetDate: ''
  })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const addGoal = async () => {
    if (!newGoal.description.trim()) return

    const goalData = {
      title: newGoal.description.trim().split(' ').slice(0, 10).join(' '), // Use first 10 words as title
      description: newGoal.description.trim(),
      category: newGoal.category,
      priority: newGoal.priority,
      targetDate: newGoal.targetDate
    }

    await createGoal(goalData)
    setNewGoal({
      description: '',
      category: undefined,
      priority: undefined,
      targetDate: ''
    })
    setShowAddForm(false)
    setShowAdvanced(false)
  }

  const removeGoal = (goalId: string) => {
    deleteGoal(goalId)
  }

  const toggleGoalStatus = (goalId: string) => {
    const goal = goals.find(g => g.id === goalId)
    if (goal) {
      const newStatus = goal.status === 'Completed' ? 'Active' : 'Completed'
      updateGoalStatus(goalId, newStatus)
    }
  }

  const getCategoryIcon = (category?: Goal['category']) => {
    if (!category) return '⚪'
    const icons = {
      Health: '💪',
      Career: '💼',
      Personal: '🎯',
      Financial: '💰',
      Learning: '📚',
      Other: '⭐'
    }
    return icons[category]
  }

  const getPriorityColor = (priority?: Goal['priority']) => {
    if (!priority) return '#6c757d'
    const colors = {
      High: '#dc3545',
      Medium: '#ffc107',
      Low: '#28a745'
    }
    return colors[priority]
  }

  const renderAddGoalForm = () => (
    <div className="modal-overlay">
      <div className="goal-modal-content">
        <div className="goal-modal-header">
          <h3>✨ Add New Goal</h3>
          <button 
            onClick={() => {
              setShowAddForm(false)
              setShowAdvanced(false)
            }}
            className="modal-close-button"
          >
            ✕
          </button>
        </div>
        
        <div className="goal-modal-body">
          <div className="main-input-group">
            <label className="goal-label">What's your goal?</label>
            <textarea
              placeholder="I want to..."
              value={newGoal.description}
              onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
              className="goal-main-textarea"
              rows={4}
              autoFocus
            />
          </div>

          <div className="expand-section">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="expand-button"
            >
              <span className={`expand-icon ${showAdvanced ? 'expanded' : ''}`}>🔽</span>
              {showAdvanced ? 'Hide details' : 'Add details'}
            </button>
          </div>

          {showAdvanced && (
            <div className="advanced-options">
              <div className="advanced-row">
                <div className="advanced-group">
                  <label className="advanced-label">Category</label>
                  <select
                    value={newGoal.category || ''}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, category: e.target.value ? e.target.value as Goal['category'] : undefined }))}
                    className="goal-advanced-select"
                  >
                    <option value="">Choose category...</option>
                    <option value="Health">💪 Health</option>
                    <option value="Career">💼 Career</option>
                    <option value="Personal">🎯 Personal</option>
                    <option value="Financial">💰 Financial</option>
                    <option value="Learning">📚 Learning</option>
                    <option value="Other">⭐ Other</option>
                  </select>
                </div>

                <div className="advanced-group">
                  <label className="advanced-label">Priority</label>
                  <select
                    value={newGoal.priority || ''}
                    onChange={(e) => setNewGoal(prev => ({ ...prev, priority: e.target.value ? e.target.value as Goal['priority'] : undefined }))}
                    className="goal-advanced-select"
                  >
                    <option value="">Choose priority...</option>
                    <option value="High">🔴 High</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="Low">🟢 Low</option>
                  </select>
                </div>
              </div>

              <div className="advanced-group">
                <label className="advanced-label">Target Date</label>
                <input
                  type="date"
                  value={newGoal.targetDate}
                  onChange={(e) => setNewGoal(prev => ({ ...prev, targetDate: e.target.value }))}
                  className="goal-advanced-input"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="goal-modal-actions">
          <button 
            onClick={() => {
              setShowAddForm(false)
              setShowAdvanced(false)
            }}
            className="goal-cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={addGoal}
            className="goal-add-button"
            disabled={!newGoal.description.trim()}
          >
            🎯 Add Goal
          </button>
        </div>
      </div>
    </div>
  )

  const renderGoalCard = (goal: Goal) => (
    <div key={goal.id} className={`goal-card ${goal.status.toLowerCase()}`}>
      <div className="goal-header">
        <div className="goal-category">
          <span className="category-icon">{getCategoryIcon(goal.category)}</span>
          <span className="category-text">{goal.category || 'Uncategorized'}</span>
        </div>
        <div className="goal-actions">
          {goal.priority && (
            <div 
              className="priority-badge" 
              style={{ backgroundColor: getPriorityColor(goal.priority) }}
            >
              {goal.priority}
            </div>
          )}
          <button
            onClick={() => removeGoal(goal.id)}
            className="goal-remove-button"
            title="Remove goal"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="goal-content">
        <h3 className="goal-title">{goal.title}</h3>
        {goal.description && (
          <p className="goal-description">{goal.description}</p>
        )}
        
        <div className="goal-meta">
          <span className="goal-created">
            Created: {new Date(goal.createdAt).toLocaleDateString()}
          </span>
          {goal.targetDate && (
            <span className="goal-target">
              Target: {new Date(goal.targetDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      <div className="goal-footer">
        <button
          onClick={() => toggleGoalStatus(goal.id)}
          className={`goal-status-button ${goal.status.toLowerCase()}`}
        >
          {goal.status === 'Completed' ? '✅ Completed' : '⭕ Mark Complete'}
        </button>
      </div>
    </div>
  )

  const renderEmptyState = () => (
    <div className="goals-empty-state">
      <div className="empty-icon">🎯</div>
      <h3>No Goals Yet</h3>
      <p>Start your journey by setting your first goal!</p>
      <button 
        onClick={() => setShowAddForm(true)}
        className="add-first-goal-button"
      >
        Add Your First Goal
      </button>
    </div>
  )

  const renderGoalsHeader = () => (
    <div className="goals-header">
      <div className="goals-stats">
        <div className="stat-card">
          <div className="stat-number">{goals.length}</div>
          <div className="stat-label">Total Goals</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{goals.filter(g => g.status === 'Active').length}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{goals.filter(g => g.status === 'Completed').length}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>
      
      <button 
        onClick={() => setShowAddForm(true)}
        className="add-goal-button"
      >
        <span className="button-icon">➕</span>
        Add New Goal
      </button>
    </div>
  )

  return (
    <div className="section-content">
      {goalsLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-message">Loading your goals...</div>
        </div>
      ) : goals.length === 0 ? (
        renderEmptyState()
      ) : (
        <>
          {renderGoalsHeader()}
          <div className="goals-container">
            {goals.map(renderGoalCard)}
          </div>
        </>
      )}
      
      {showAddForm && renderAddGoalForm()}
    </div>
  )
}