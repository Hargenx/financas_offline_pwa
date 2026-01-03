import React from 'react';

export function Section(props: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{props.title}</h2>
          {props.subtitle ? <p className="text-xs text-slate-400 mt-1">{props.subtitle}</p> : null}
        </div>
        {props.right}
      </div>
      <div className="mt-4">{props.children}</div>
    </div>
  );
}
