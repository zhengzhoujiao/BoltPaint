import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import App from './App';
import i18n from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </HelmetProvider>
  </React.StrictMode>
);

// React 挂载完成后移除首屏骨架屏
const firstScreenLoading = document.getElementById('first-screen-loading');
if (firstScreenLoading) {
  firstScreenLoading.style.transition = 'opacity 0.3s ease';
  firstScreenLoading.style.opacity = '0';
  setTimeout(() => firstScreenLoading.remove(), 300);
}