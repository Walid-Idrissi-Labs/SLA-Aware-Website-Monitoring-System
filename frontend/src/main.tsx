import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initGlass } from './lib/glass'
import './index.css'

// Restore the stored glass level before first paint so surfaces don't flash.
initGlass()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)