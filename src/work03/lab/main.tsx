import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Work03Lab } from './Work03Lab'
import './styles.css'

const root = document.getElementById('work03-lab-root')
if (root === null) throw new Error('Missing Work 03 Lab root element.')

createRoot(root).render(
  <StrictMode>
    <Work03Lab />
  </StrictMode>,
)
