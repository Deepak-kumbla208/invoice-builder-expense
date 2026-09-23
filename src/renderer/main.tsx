import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { createAppRoutes } from './app/routes';
import './globalErrorHandlers';
import './i18n';
import reportWebVitals from './reportWebVitals';
import { GlobalErrorBoundaryWrapper } from './shared/components/feedback/globalErrorBoundaryWrapper/GlobalErrorBoundaryWrapper';
import { store } from './state/configureStore';

const mockEnabled = import.meta.env.VITE_ENABLE_MOCKS;

const startApp = async () => {
  if (mockEnabled === 'true' || mockEnabled === true) {
    try {
      const { worker } = await import('./mocks/browser');
      await worker.start();
    } catch (err) {
      console.error('Failed to load mocks:', err);
    }
  }

  const router = createBrowserRouter(createAppRoutes());

  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <StrictMode>
      <Provider store={store}>
        <GlobalErrorBoundaryWrapper>
          <RouterProvider router={router} />
        </GlobalErrorBoundaryWrapper>
      </Provider>
    </StrictMode>
  );

  reportWebVitals();
};

startApp();
