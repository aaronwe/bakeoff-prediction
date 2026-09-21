import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import Nav from './components/Nav'
import Home from './pages/Home'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Nav />
        <main className="container">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
      </HashRouter>
    </AuthProvider>
  )
}
