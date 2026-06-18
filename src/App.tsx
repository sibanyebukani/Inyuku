import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Platform from './pages/Platform'
import Impact from './pages/Impact'
import Solutions from './pages/Solutions'
import Stories from './pages/Stories'
import About from './pages/About'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/platform" element={<Platform />} />
        <Route path="/impact" element={<Impact />} />
        <Route path="/solutions" element={<Solutions />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/about" element={<About />} />
      </Route>
    </Routes>
  )
}
