import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

// One tool, one ground. The city map is dark because a hundred thousand plot colours need a
// ground that recedes; the study screen was light, and switching between them read as switching
// products. The tokens carry it, so nothing in App.tsx had to change.
document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <App />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
