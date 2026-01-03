import React from 'react';

export type TabKey = 'dashboard' | 'lancamentos' | 'parcelas' | 'vencimentos' | 'config' | 'importar';

export function Tabs(props: { active: TabKey; onChange: (t: TabKey) => void }) {
  const items: { key: TabKey; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'lancamentos', label: 'Lançamentos' },
    { key: 'parcelas', label: 'Parcelas' },
    { key: 'vencimentos', label: 'Vencimentos' },
    { key: 'config', label: 'Config' },
    { key: 'importar', label: 'Importar/Exportar' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(it => (
        <button
          key={it.key}
          className={it.key === props.active ? 'btn' : 'btn-secondary'}
          onClick={() => props.onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
