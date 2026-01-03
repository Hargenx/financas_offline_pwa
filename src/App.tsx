import React, { useEffect, useState } from 'react';
import { Tabs, type TabKey } from './ui/Tabs';
import { Topbar } from './ui/Topbar';
import { Dashboard } from './pages/Dashboard';
import { Lancamentos } from './pages/Lancamentos';
import { Parcelas } from './pages/Parcelas';
import { Vencimentos } from './pages/Vencimentos';
import { Config } from './pages/Config';
import { ImportExport } from './pages/ImportExport';

export function App() {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="p-6 text-sm text-slate-300">Preparando app…</div>;
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <Topbar
          title="Finanças Offline"
          right={<Tabs active={tab} onChange={setTab} />}
        />
        {tab === 'dashboard' ? <Dashboard /> : null}
        {tab === 'lancamentos' ? <Lancamentos /> : null}
        {tab === 'parcelas' ? <Parcelas /> : null}
        {tab === 'vencimentos' ? <Vencimentos /> : null}
        {tab === 'config' ? <Config /> : null}
        {tab === 'importar' ? <ImportExport /> : null}

        <footer className="text-xs text-slate-500 py-6">
          Dica: faça backup (JSON) e salve numa pasta sincronizada do seu Drive/OneDrive local.
        </footer>
      </div>
    </div>
  );
}
