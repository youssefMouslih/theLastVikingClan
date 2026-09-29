import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { Providers } from './app/providers';
import { LocaleProvider } from './i18n/LocaleContext';
import './index.css';

export default function App() {
  return (
    <LocaleProvider>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </LocaleProvider>
  );
}
