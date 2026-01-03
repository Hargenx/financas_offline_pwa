import React, { useMemo, useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { Section } from '../ui/Section';
import { centsToBrl } from '../lib/money';
import { format, parseISO } from 'date-fns';

export function Vencimentos() {
  const [fromISO, setFromISO] = useState(() => new Date().toISOString().slice(0,10));
  const [days, setDays] = useState(14);

  const { data: txs } = useLiveQuery(async () => {
    const from = fromISO;
    const toDate = new Date(fromISO);
    toDate.setDate(toDate.getDate() + days);
    const to = toDate.toISOString().slice(0,10);

    const all = await db.transactions
      .where('dueDate').between(from, to, true, true)
      .toArray();

    return all
      .filter(t => t.type === 'despesa')
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  }, [fromISO, days]);

  const total = useMemo(() => (txs ?? []).reduce((acc, t) => acc + t.amountCents, 0), [txs]);

  return (
    <div className="space-y-4">
      <Section
        title="Próximos vencimentos"
        subtitle="Filtra por período e mostra tudo que tem dueDate."
        right={
          <div className="flex items-center gap-2">
            <input className="input w-[150px]" type="date" value={fromISO} onChange={e => setFromISO(e.target.value)} />
            <input className="input w-[110px]" type="number" min={1} max={90} value={days} onChange={e => setDays(Number(e.target.value))} />
          </div>
        }
      >
        <div className="text-sm text-slate-300 mb-3">
          Total no período: <span className="font-semibold">{centsToBrl(total)}</span>
        </div>

        <div className="space-y-2">
          {(txs ?? []).map(tx => (
            <div key={tx.id} className="card p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{tx.description}</div>
                <div className="text-xs text-slate-400">
                  Vence {tx.dueDate ? format(parseISO(tx.dueDate), 'dd/MM/yyyy') : '—'} • {tx.status}
                  {tx.method === 'cartao' && tx.statementMonth ? ` • fatura ${tx.statementMonth}` : ''}
                </div>
              </div>
              <div className="font-semibold">{centsToBrl(tx.amountCents)}</div>
            </div>
          ))}
          {(txs ?? []).length === 0 ? <div className="text-sm text-slate-400">Nada a vencer no período.</div> : null}
        </div>
      </Section>
    </div>
  );
}
