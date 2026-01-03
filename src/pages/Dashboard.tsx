import { useMemo, useState } from "react";
import { db } from "../db/db";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { centsToBrl } from "../lib/money";
import { format, parseISO } from "date-fns";
import { Section } from "../ui/Section";
import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { ensureBillsForMonth } from "../services/finance";

type Slice = { name: string; valueCents: number };

export function Dashboard() {
  const [monthKey, setMonthKey] = useState(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${mm}`;
  });

  const [includeProjected, setIncludeProjected] = useState(true);

  const { data: cats } = useLiveQuery(() => db.categories.toArray(), []);
  const { data: cards } = useLiveQuery(() => db.cards.toArray(), []);

  const { data: txs } = useLiveQuery(async () => {
    await ensureBillsForMonth(monthKey);
    const all = await db.transactions
      .where("refMonth")
      .equals(monthKey)
      .toArray();
    return includeProjected ? all : all.filter((t) => !t.projected);
  }, [monthKey, includeProjected]);

  const { incomeCents, expenseCents, byCategory } = useMemo(() => {
    const map = new Map<string, number>();
    let inc = 0;
    let exp = 0;

    (txs ?? []).forEach((t) => {
      if (t.type === "receita") inc += t.amountCents;

      if (t.type === "despesa") {
        exp += t.amountCents;
        const key = t.categoryId ?? "sem-categoria";
        map.set(key, (map.get(key) ?? 0) + t.amountCents);
      }
    });

    // monta slices em CENTAVOS (sem dividir por 100)
    const slices: Slice[] = [];
    for (const [k, v] of map.entries()) {
      const label =
        cats?.find((c) => c.id === k)?.name ??
        (k === "sem-categoria" ? "Sem categoria" : k);

      slices.push({ name: label, valueCents: v });
    }

    slices.sort((a, b) => b.valueCents - a.valueCents);

    // agrupa categorias pequenas em "Outros"
    const MAX_SLICES = 8;
    let finalSlices = slices;

    if (slices.length > MAX_SLICES) {
      const head = slices.slice(0, MAX_SLICES - 1);
      const tail = slices.slice(MAX_SLICES - 1);
      const others = tail.reduce((acc, s) => acc + s.valueCents, 0);
      finalSlices = [...head, { name: "Outros", valueCents: others }];
    }

    return { incomeCents: inc, expenseCents: exp, byCategory: finalSlices };
  }, [txs, cats]);

  const balance = incomeCents - expenseCents;

  return (
    <div className="space-y-4">
      <Section
        title="Resumo do mês"
        subtitle="Receitas, despesas e saldo (baseado em lançamentos)."
        right={
          <div className="flex items-center gap-2">
            {/* label escondido para acessibilidade (evita warning) */}
            <label className="sr-only" htmlFor="dashboard-month">
              Selecione o mês
            </label>
            <input
              id="dashboard-month"
              className="input w-[140px]"
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              aria-label="Selecione o mês"
            />
          </div>
        }
      >
        <div className="grid md:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="text-xs text-slate-400">Receitas</div>
            <div className="mt-1 text-lg font-semibold">
              {centsToBrl(incomeCents)}
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs text-slate-400">Despesas</div>
            <div className="mt-1 text-lg font-semibold">
              {centsToBrl(expenseCents)}
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs text-slate-400">Saldo</div>
            <div className="mt-1 text-lg font-semibold">
              {centsToBrl(balance)}
            </div>

            <div className="mt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={includeProjected}
                  onChange={(e) => setIncludeProjected(e.target.checked)}
                />
                Incluir parcelas projetadas
              </label>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Despesas por categoria"
        subtitle="Visão rápida do que mais pesa."
      >
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                dataKey="valueCents"
                data={byCategory}
                outerRadius={95}
                innerRadius={55}
                paddingAngle={2}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
                labelLine={false}
                label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
              >
                {byCategory.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={`hsl(${(i * 47) % 360} 70% 55%)`}
                  />
                ))}
              </Pie>

              <Tooltip
                formatter={(value) => centsToBrl(Number(value))}
                labelFormatter={(label) => `Categoria: ${label}`}
              />

              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 grid md:grid-cols-2 gap-2">
          {byCategory.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between text-sm border-b border-slate-800 py-2"
            >
              <span className="text-slate-200">{s.name}</span>
              <span className="text-slate-300">{centsToBrl(s.valueCents)}</span>
            </div>
          ))}
        </div>

        {byCategory.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">
            Nenhuma despesa no mês selecionado.
          </div>
        ) : null}
      </Section>

      <Section
        title="Cartão"
        subtitle="Total por fatura (baseado em statementMonth)."
      >
        <div className="space-y-2">
          {(cards ?? [])
            .filter((c) => c.active)
            .map((card) => {
              const cardTxs = (txs ?? []).filter(
                (t) => t.method === "cartao" && t.cardId === card.id
              );

              const total = cardTxs.reduce(
                (acc, t) => acc + (t.type === "despesa" ? t.amountCents : 0),
                0
              );

              const due = cardTxs.find((t) => t.dueDate)?.dueDate;

              return (
                <div
                  key={card.id}
                  className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold">{card.name}</div>
                    <div className="text-xs text-slate-400">
                      Fecha dia {card.closingDay} • Vence dia {card.dueDay}
                      {due
                        ? ` • Venc.: ${format(parseISO(due), "dd/MM/yyyy")}`
                        : ""}
                    </div>
                  </div>

                  <div className="text-lg font-semibold">
                    {centsToBrl(total)}
                  </div>
                </div>
              );
            })}

          {(cards ?? []).filter((c) => c.active).length === 0 ? (
            <div className="text-sm text-slate-400">Nenhum cartão ativo.</div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
