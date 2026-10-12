import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyAdminTheme, loadPreferences } from './preferences'
import './styles.css'
import './feature-pages.css'

applyAdminTheme(loadPreferences())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
