import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { AuthProvider } from './lib/auth-context';
import './styles/app.css';
import './styles/visual.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster position="top-center" toastOptions={{ className: 'toast' }} />
    </BrowserRouter>
  </StrictMode>,
);
