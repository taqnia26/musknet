import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getAuthToken } from '@/lib/auth-token';
import { ThemeProvider } from 'next-themes';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

setAuthTokenGetter(getAuthToken);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="musk-ellolo-theme">
      <App />
    </ThemeProvider>
  </ErrorBoundary>,
);
