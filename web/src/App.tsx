import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Skeleton } from './components/Skeleton';
import { api } from './lib/api';
import { allNavItems } from './lib/nav';
import type { ConfigResponse } from './lib/types';
import { useAsync } from './lib/useAsync';
import { ComingSoon } from './views/ComingSoon';
import { Home } from './views/Home';
import { Services } from './views/Services';
import { Settings } from './views/Settings';
import { Startup } from './views/Startup';
import { Wizard } from './views/Wizard';

export const App = () => {
  const state = useAsync(() => api.get<ConfigResponse>('/api/config'));

  if (state.loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-16">
        <Skeleton className="h-10 w-72" /><Skeleton className="h-56" />
      </div>
    );
  }
  if (state.error || !state.data) {
    return <div className="p-10 text-danger">No se pudo contactar al servidor del panel: {state.error}</div>;
  }
  if (!state.data.configured) return <Wizard reason={state.data.reason} onSaved={state.reload} />;

  const config = state.data.config;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home config={config} />} />
        <Route path="servicios" element={<Services />} />
        <Route path="levantado" element={<Startup config={config} />} />
        <Route path="configuracion" element={<Settings config={config} onSaved={state.reload} />} />
        {allNavItems
          .filter((item) => item.phase !== null && !['/servicios', '/levantado'].includes(item.path))
          .map((item) => (
            <Route key={item.path} path={item.path.slice(1)} element={<ComingSoon item={item} />} />
          ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};
