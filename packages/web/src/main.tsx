import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
// Served from the app's own origin, which the policy already allows. Every
// subset is declared, and the browser only fetches the ones a page uses.
import '@fontsource-variable/nunito';
import './index.css';
import App from './App.tsx';
import { createI18n } from './i18n/index.ts';
import { linkedCode } from './room/link.ts';
import { resumeRoom } from './room/session.ts';
import { recordFor } from './room/tabRecord.ts';

// Before the first render, so the sorting screen the screen store opened on
// already has the list to show.
const record = recordFor(linkedCode());
if (record) resumeRoom(record);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={createI18n()}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
