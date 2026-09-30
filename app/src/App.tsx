import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { Providers } from './app/providers';
import { LocaleProvider } from './i18n/LocaleContext';
import { ThemeProvider } from './theme';
import './index.css';

export default function App() {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </ThemeProvider>
    </LocaleProvider>
  );
}
