import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { ShortcutsProvider } from './lib/useShortcuts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ShortcutsProvider>
          <App />
        </ShortcutsProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
