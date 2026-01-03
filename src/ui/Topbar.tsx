import React from 'react';

export function Topbar(props: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
        <p className="text-xs text-slate-400">Offline-first • dados ficam no seu aparelho</p>
      </div>
      <div className="flex items-center gap-2">{props.right}</div>
    </div>
  );
}
