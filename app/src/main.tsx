import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initTelegram } from './lib/telegram';
import { queryClient } from './lib/queries';
import { isNative } from './lib/platform';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';

initTelegram();
if (isNative) document.documentElement.dataset.native = '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
