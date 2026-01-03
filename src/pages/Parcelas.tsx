import React, { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { Section } from '../ui/Section';
import { brlToCents } from '../lib/money';
import { addInstallmentPlan } from '../services/finance';

export function Parcelas() {
  const { data: cats } = useLiveQuery(() => db.categories.toArray(), []);
  const { data: cards } = useLiveQuery(() => db.cards.toArray(), []);

  const [form, setForm] = useState({
    purchaseDate: new Date().toISOString().slice(0,10),
    description: '',
    categoryId: 'cat-outros',
    cardId: 'card-santander',
    total: '',
    installments: 10,
    mode: 'projetar_fatura'
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const totalCents = brlToCents(form.total);
    if (!totalCents || !form.description.trim()) return;

    await addInstallmentPlan({
      purchaseDate: form.purchaseDate,
      description: form.description.trim(),
      categoryId: form.categoryId || undefined,
      cardId: form.cardId,
      totalCents,
      installments: Number(form.installments),
      mode: form.mode as any
    });

    setForm(f => ({ ...f, description: '', total: '' }));
    alert('Parcelamento criado!');
  }

  return (
    <div className="space-y-4">
      <Section
        title="Novo parcelamento"
        subtitle="Escolha como você quer controlar: gerar lançamentos (parcela por parcela) ou projetar na fatura."
      >
        <form className="grid md:grid-cols-6 gap-3" onSubmit={submit}>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Data da compra</label>
            <input className="input mt-1" type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} />
          </div>
          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Descrição</label>
            <input className="input mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Cartão</label>
            <select className="select mt-1" value={form.cardId} onChange={e => setForm({ ...form, cardId: e.target.value })}>
              {(cards ?? []).filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Categoria</label>
            <select className="select mt-1" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
              {(cats ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Total (R$)</label>
            <input className="input mt-1" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300">Nº parcelas</label>
            <input className="input mt-1" type="number" min={1} max={48} value={form.installments}
              onChange={e => setForm({ ...form, installments: Number(e.target.value) })} />
          </div>

          <div className="md:col-span-4">
            <label className="text-xs text-slate-300">Modo</label>
            <select className="select mt-1" value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
              <option value="projetar_fatura">Projetar na fatura (não polui o dia a dia)</option>
              <option value="gerar_lancamentos">Gerar lançamentos (parcela por parcela)</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Dica: “Projetar” é ótimo quando você só quer ver o peso do parcelado na fatura.
            </p>
          </div>

          <div className="md:col-span-6 flex justify-end">
            <button className="btn" type="submit">Criar parcelamento</button>
          </div>
        </form>
      </Section>

      <Section title="Planos cadastrados" subtitle="Lista simples (você pode apagar/edit mais tarde).">
        <Planos />
      </Section>
    </div>
  );
}

function Planos() {
  const { data: plans } = useLiveQuery(() => db.installmentPlans.orderBy('createdAt').reverse().toArray(), []);
  const { data: cards } = useLiveQuery(() => db.cards.toArray(), []);
  const { data: cats } = useLiveQuery(() => db.categories.toArray(), []);

  return (
    <div className="space-y-2">
      {(plans ?? []).map(p => (
        <div key={p.id} className="card p-3">
          <div className="flex items-center gap-2">
            <span className="badge">{p.mode === 'gerar_lancamentos' ? 'gera lançamentos' : 'projeta fatura'}</span>
            <span className="badge">{p.installments}x</span>
            <span className="badge">{cards?.find(c => c.id === p.cardId)?.name ?? 'Cartão'}</span>
            <span className="badge">{cats?.find(c => c.id === p.categoryId)?.name ?? 'Categoria'}</span>
          </div>
          <div className="mt-1 font-semibold">{p.description}</div>
          <div className="text-xs text-slate-400 mt-1">Compra: {p.purchaseDate}</div>
        </div>
      ))}
      {(plans ?? []).length === 0 ? <div className="text-sm text-slate-400">Nenhum parcelamento ainda.</div> : null}
    </div>
  );
}
