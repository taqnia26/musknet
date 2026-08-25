import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getAuthToken } from '@/lib/auth-token';

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
    <App />
  </ErrorBoundary>,
);
