import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import Nav from './components/Nav'
import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import EpisodeReveal from './pages/EpisodeReveal'
import RequireAuth from './components/RequireAuth'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Nav />
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/leaderboard" element={<RequireAuth><Leaderboard /></RequireAuth>} />
            <Route path="/episodes/:number" element={<RequireAuth><EpisodeReveal /></RequireAuth>} />
          </Routes>
        </main>
      </HashRouter>
    </AuthProvider>
  )
}
