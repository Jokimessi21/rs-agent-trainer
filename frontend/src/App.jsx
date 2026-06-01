import { useState } from 'react'
import AgentTrainer from './pages/AgentTrainer'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('trainer_token') || '')
  const [input, setInput]   = useState('')
  const [error, setError]   = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/agent-trainer/proposals`, {
      headers: { Authorization: `Bearer ${input}` }
    })
    if (res.ok) {
      localStorage.setItem('trainer_token', input)
      setToken(input)
      setError('')
    } else {
      setError('Invalid token')
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-sm">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Agent Trainer</h1>
          <p className="text-sm text-gray-500 mb-6">Enter your dashboard token to continue</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Dashboard token"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <AgentTrainer token={token} onLogout={() => { localStorage.removeItem('trainer_token'); setToken('') }} />
}
