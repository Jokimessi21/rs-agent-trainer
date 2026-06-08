import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || ''

const STATUS_COLORS = {
  pending:  'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-gray-100 text-gray-600',
  applied:  'bg-green-100 text-green-800',
  error:    'bg-red-100 text-red-800',
}

const CONFIDENCE_COLORS = {
  high:   'text-green-600',
  medium: 'text-yellow-600',
  low:    'text-red-500',
}

export default function AgentTrainer({ token, onLogout }) {
  const [proposals, setProposals]       = useState([])
  const [filter, setFilter]             = useState('all')
  const [loading, setLoading]           = useState(true)
  const [expandedId, setExpandedId]     = useState(null)
  const [editedKB, setEditedKB]         = useState({})
  const [editedPrompt, setEditedPrompt] = useState({})
  const [toast, setToast]               = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const apiFetch = useCallback((url, options = {}) => {
    return fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })
  }, [token])

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await apiFetch('/api/agent-trainer/proposals')
      const data = await res.json()
      setProposals(data.proposals || [])
    } catch {
      showToast('Failed to load proposals', 'error')
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => { fetchProposals() }, [fetchProposals])

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter)

  const handleReview = async (proposal, status) => {
    const res = await apiFetch(`/api/agent-trainer/proposals/${proposal.id}/review`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        knowledge_base_additions: editedKB[proposal.id] ?? proposal.knowledge_base_additions,
        prompt_changes:           editedPrompt[proposal.id] ?? proposal.prompt_changes,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setProposals(prev => prev.map(p => p.id === updated.id ? updated : p))
      showToast(status === 'approved' ? 'Approved ✓' : 'Rejected', status === 'approved' ? 'success' : 'info')
    } else {
      showToast('Failed to update', 'error')
    }
  }

  const handleApply = async (proposal) => {
    showToast('Applying to agent…', 'info')
    const res  = await apiFetch(`/api/agent-trainer/proposals/${proposal.id}/apply`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: 'applied' } : p))
      showToast('Applied to agent ✓')
    } else {
      showToast(`Error: ${data.error}`, 'error')
    }
  }

  const handleRejectAll = async () => {
    if (!confirm(`Reject all ${filter === 'all' ? '' : filter} proposals?`)) return
    const res = await apiFetch('/api/agent-trainer/proposals/reject-all', {
      method: 'POST',
      body: JSON.stringify({ status: filter }),
    })
    const data = await res.json()
    if (res.ok) {
      await fetchProposals()
      showToast(`Rejected ${data.rejected} proposals`)
    } else {
      showToast('Failed to reject all', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Agent Trainer</h1>
            <p className="text-sm text-gray-500 mt-0.5">Review AI-suggested improvements to your ElevenLabs agent</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={fetchProposals} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Refresh
            </button>
            <button onClick={handleRejectAll} className="text-sm text-red-500 hover:text-red-700 font-medium">
              Reject All
            </button>
            <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600">
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-4xl mx-auto flex gap-1">
          {['all', 'pending', 'approved', 'applied', 'rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                filter === f
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
              {f !== 'all' && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({proposals.filter(p => p.status === f).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Proposals */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No proposals found</div>
        ) : filtered.map(proposal => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            expanded={expandedId === proposal.id}
            onToggle={() => setExpandedId(prev => prev === proposal.id ? null : proposal.id)}
            editedKB={editedKB[proposal.id] ?? proposal.knowledge_base_additions ?? ''}
            editedPrompt={editedPrompt[proposal.id] ?? proposal.prompt_changes ?? ''}
            onEditKB={val => setEditedKB(prev => ({ ...prev, [proposal.id]: val }))}
            onEditPrompt={val => setEditedPrompt(prev => ({ ...prev, [proposal.id]: val }))}
            onApprove={() => handleReview(proposal, 'approved')}
            onReject={() => handleReview(proposal, 'rejected')}
            onApply={() => handleApply(proposal)}
          />
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === 'error' ? 'bg-red-600 text-white' :
          toast.type === 'info'  ? 'bg-blue-600 text-white' :
                                   'bg-green-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function ProposalCard({
  proposal, expanded, onToggle,
  editedKB, editedPrompt, onEditKB, onEditPrompt,
  onApprove, onReject, onApply,
}) {
  const [showTranscript, setShowTranscript] = useState(false)
  const hasKB     = !!proposal.knowledge_base_additions
  const hasPrompt = !!proposal.prompt_changes
  const isLocked  = proposal.status === 'applied' || proposal.status === 'rejected'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[proposal.status]}`}>
            {proposal.status}
          </span>
          <span className="text-sm text-gray-500 font-mono text-xs">
            {proposal.conversation_id?.slice(0, 20)}…
          </span>
          {hasKB     && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">KB</span>}
          {hasPrompt && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">PROMPT</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{new Date(proposal.created_at).toLocaleString()}</span>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {/* Summary */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{proposal.summary}</p>
          </div>

          {/* Issues */}
          {proposal.issues_found?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Issues Found</p>
              <ul className="space-y-1">
                {proposal.issues_found.map((issue, i) => (
                  <li key={i} className="text-sm text-gray-600 flex gap-2">
                    <span className="text-red-400">·</span>{issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* KB — editable */}
          {hasKB && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                Proposed Knowledge Base Addition
                {!isLocked && <span className="text-blue-500 font-normal normal-case tracking-normal text-xs">✏ editable</span>}
              </p>
              <textarea
                value={editedKB}
                onChange={e => onEditKB(e.target.value)}
                disabled={isLocked}
                rows={4}
                className="w-full text-sm font-mono bg-gray-50 border border-blue-200 rounded-lg p-3 focus:outline-none focus:border-blue-400 resize-y disabled:opacity-50 disabled:cursor-default"
              />
            </div>
          )}

          {/* Prompt — editable */}
          {hasPrompt && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                Proposed Prompt Change
                {!isLocked && <span className="text-blue-500 font-normal normal-case tracking-normal text-xs">✏ editable</span>}
              </p>
              <textarea
                value={editedPrompt}
                onChange={e => onEditPrompt(e.target.value)}
                disabled={isLocked}
                rows={3}
                className="w-full text-sm font-mono bg-gray-50 border border-blue-200 rounded-lg p-3 focus:outline-none focus:border-blue-400 resize-y disabled:opacity-50 disabled:cursor-default"
              />
            </div>
          )}

          {/* Transcript */}
          <div>
            <button
              onClick={() => setShowTranscript(p => !p)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
            </button>
            {showTranscript && (
              <pre className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {proposal.transcript}
              </pre>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            {proposal.status === 'pending' && (
              <>
                <button onClick={onApprove} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  Approve
                </button>
                <button onClick={onReject} className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">
                  Reject
                </button>
              </>
            )}
            {proposal.status === 'approved' && (
              <>
                <button onClick={onApply} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                  Apply to Agent
                </button>
                <button onClick={onReject} className="px-4 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">
                  Reject
                </button>
              </>
            )}
            {proposal.status === 'applied'  && <span className="text-sm text-green-600 font-medium">✓ Applied to agent</span>}
            {proposal.status === 'rejected' && <span className="text-sm text-gray-400">Rejected</span>}
            {proposal.status === 'error'    && <span className="text-sm text-red-500">{proposal.error_message}</span>}
            <span className={`ml-auto text-xs font-medium ${CONFIDENCE_COLORS[proposal.confidence]}`}>
              confidence: {proposal.confidence}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
