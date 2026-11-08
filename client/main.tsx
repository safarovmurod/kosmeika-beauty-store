import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import Store from './store';
const Admin = React.lazy(() => import('./admin'));
createRoot(document.getElementById('root')!).render(<Suspense fallback={<p className="loading">Загрузка…</p>}>{location.pathname.startsWith('/admin') ? <Admin /> : <Store />}</Suspense>);
