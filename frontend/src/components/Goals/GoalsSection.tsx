import { useState } from 'react'

interface Goal {
  id: string
  title: string
  description: string
  status: 'Active' | 'Completed' | 'Paused'
  createdAt: string
}

interface GoalsSectionProps {
  createGoal: (goalData: any) => Promise<void>
  showAddForm: boolean
  setShowAddForm: React.Dispatch<React.SetStateAction<boolean>>
  goals: Goal[]
  goalsLoading: boolean
  deleteGoal: (goalId: string) => Promise<void>
}

export default function GoalsSection({ createGoal, showAddForm, setShowAddForm, goals, goalsLoading, deleteGoal }: GoalsSectionProps) {
  const [newGoal, setNewGoal] = useState({
    description: ''
  })
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; goalId?: string; goalDescription?: string }>({ isOpen: false })

  const addGoal = async () => {
    if (!newGoal.description.trim()) return

    const goalData = {
      title: newGoal.description.trim().split(' ').slice(0, 10).join(' '),
      description: newGoal.description.trim()
    }

    await createGoal(goalData)
    setNewGoal({
      description: ''
    })
    setShowAddForm(false)
  }

  const renderAddGoalForm = () => (
    <div className="modal-overlay">
      <div className="goal-modal-content" style={{ padding: '20px', maxHeight: '300px', position: 'relative' }}>
        <button 
          onClick={() => setShowAddForm(false)}
          style={{
            position: 'absolute',
            top: '10px',
            right: '15px',
            background: 'transparent',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#999',
            padding: '0',
            lineHeight: '1',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>
        
        <div style={{ marginTop: '10px' }}>
          <label className="goal-label" style={{ marginBottom: '8px', display: 'block' }}>What's your goal?</label>
          <textarea
            placeholder="I want to..."
            value={newGoal.description}
            onChange={(e) => setNewGoal(prev => ({ ...prev, description: e.target.value }))}
            className="goal-main-textarea"
            rows={3}
            autoFocus
            style={{ width: '100%', marginBottom: '15px' }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => setShowAddForm(false)}
            className="goal-cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={addGoal}
            className="goal-add-button"
            disabled={!newGoal.description.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="section-content">
      {goalsLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-message">Loading your goals...</div>
        </div>
      ) : (
        <div className="goals-list">
          {goals.map((goal) => (
            <div key={goal.id} className="goal-item" style={{ 
              padding: '15px', 
              margin: '10px 0', 
              border: '1px solid #e0e0e0', 
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <p style={{ margin: '0', lineHeight: '1.4', color: '#333', flex: 1 }}>{goal.description}</p>
              <button
                onClick={() => setConfirmDelete({ 
                  isOpen: true, 
                  goalId: goal.id, 
                  goalDescription: goal.description 
                })}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#999',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: '5px',
                  marginLeft: '10px'
                }}
                title="Delete goal"
              >
                ×
              </button>
            </div>
          ))}
          {goals.length === 0 && (
            <p style={{ fontSize: '14px', color: '#666', margin: '0', marginLeft: '10px' }}>No goals yet.</p>
          )}
        </div>
      )}
      {showAddForm && renderAddGoalForm()}
      
      {confirmDelete.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Delete Goal</h3>
            </div>
            <div className="modal-body">
              <p>This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button 
                onClick={() => setConfirmDelete({ isOpen: false })}
                className="modal-button secondary"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (confirmDelete.goalId) {
                    deleteGoal(confirmDelete.goalId)
                  }
                  setConfirmDelete({ isOpen: false })
                }}
                className="modal-button danger"
              >
                Delete Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}