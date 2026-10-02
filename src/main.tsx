import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PlatformAdmin from './PlatformAdmin';
import './styles.css';

const isPlatformAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPlatformAdminRoute ? <PlatformAdmin /> : <App />}
  </React.StrictMode>,
);
