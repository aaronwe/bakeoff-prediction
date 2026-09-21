import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import Nav from './components/Nav'
import Home from './pages/Home'
import Leaderboard from './pages/Leaderboard'
import EpisodeReveal from './pages/EpisodeReveal'
import RequireAuth from './components/RequireAuth'
import RequireAdmin from './components/RequireAdmin'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminRoster from './pages/admin/AdminRoster'
import AdminNewEpisode from './pages/admin/AdminNewEpisode'
import AdminEpisode from './pages/admin/AdminEpisode'

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
            <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
            <Route path="/admin/roster" element={<RequireAdmin><AdminRoster /></RequireAdmin>} />
            <Route path="/admin/episodes/new" element={<RequireAdmin><AdminNewEpisode /></RequireAdmin>} />
            <Route path="/admin/episodes/:number" element={<RequireAdmin><AdminEpisode /></RequireAdmin>} />
          </Routes>
        </main>
      </HashRouter>
    </AuthProvider>
  )
}
