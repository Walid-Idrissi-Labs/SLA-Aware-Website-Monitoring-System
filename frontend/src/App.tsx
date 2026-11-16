import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Callback from './pages/Callback'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import About from './pages/About'

// `motion` (~180 kB minified) is only reachable through RubberSegment and
// CodeSlots. Both live behind routes, so those routes are split out and Rollup
// hoists motion into one async chunk shared by them. The dashboard — the page
// people actually land on — never downloads it.
const ConfirmSignup = lazy(() => import('./pages/ConfirmSignup'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))

const routeFallback = <div className="grid min-h-screen place-items-center text-txt-lo">Loading…</div>

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/confirm"
          element={
            <Suspense fallback={routeFallback}>
              <ConfirmSignup />
            </Suspense>
          }
        />
        <Route path="/callback" element={<Callback />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={routeFallback}>
                <ProjectDetail />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <About />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
