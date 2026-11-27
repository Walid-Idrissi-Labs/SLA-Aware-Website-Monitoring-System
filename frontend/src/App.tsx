import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isAuthenticated } from './lib/auth'
import { DEMO } from './lib/demo'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Callback from './pages/Callback'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

// `motion` (~180 kB minified) is only reachable through RubberSegment and
// CodeSlots. Both live behind routes, so those routes are split out and Rollup
// hoists motion into one async chunk shared by them. The dashboard — the page
// people actually land on — never downloads it.
const ConfirmSignup = lazy(() => import('./pages/ConfirmSignup'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const About = lazy(() => import('./pages/About'))

const routeFallback = <div className="grid min-h-screen place-items-center text-txt-lo">Loading…</div>

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!DEMO && !isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    // Under /demo every link resolves inside the demo, with no link edits.
    <BrowserRouter basename={DEMO ? '/demo' : undefined}>
      <Routes>
        {!DEMO && (
          <>
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
          </>
        )}
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
          path="/about/:view?"
          element={
            <ProtectedRoute>
              <Suspense fallback={routeFallback}>
                <About />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
