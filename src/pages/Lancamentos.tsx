import React, { useEffect, useMemo, useState, useId } from "react";
import { format, parseISO } from "date-fns";

import { db } from "../db/db";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { Section } from "../ui/Section";

import { brlToCents, centsToBrl, centsToBrlCompact } from "../lib/money";
import { DEFAULT_INSTITUTIONS } from "../domain/institutions";

import type {
  FixedBill,
  PaymentMethod,
  Transaction,
  TxType,
} from "../domain/types";

import {
  addInstallmentPlan,
  addTransaction,
  deleteTransaction,
  setTransactionStatus,
  updateTransaction,
  uuid,
} from "../services/finance";

type Toast = { kind: "success" | "error"; text: string };
type TxPatch = Partial<Omit<Transaction, "id" | "createdAt">>;

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toMonthKey(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function clampDay28(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(n)));
}

function dayFromISO(iso: string) {
  // iso: YYYY-MM-DD
  const d = parseISO(iso);
  const day = d.getDate();
  return clampDay28(day);
}

function ToastView({ toast }: { toast: Toast }) {
  return (
    <div
      className={cls(
        "fixed top-4 right-4 z-50 card p-3 text-sm border",
        toast.kind === "success"
          ? "border-emerald-700 text-emerald-200"
          : "border-rose-700 text-rose-200"
      )}
      role="status"
      aria-live="polite"
    >
      {toast.text}
    </div>
  );
}

async function upsertFixedBillFromForm(args: {
  // chave “humana” para encontrar/evitar duplicados
  name: string;
  type: TxType;
  method: PaymentMethod;
  institution?: string;
  cardId?: string;

  // dados do template
  amountCents: number;
  dueDay: number;
  categoryId?: string;
  notes?: string;

  // se já existir: atualizar ou não
  updateIfExists: boolean;
}): Promise<string> {
  const normalizedName = args.name.trim().toLowerCase();
  const normalizedInst = (args.institution ?? "").trim().toLowerCase();

  const all = await db.fixedBills.toArray();

  const existing = all.find((b) => {
    const sameName = b.name.trim().toLowerCase() === normalizedName;
    const sameType = b.type === args.type;
    const sameMethod = b.method === args.method;
    if (!sameName || !sameType || !sameMethod) return false;

    if (args.method === "cartao")
      return (b.cardId ?? "") === (args.cardId ?? "");
    return (b.institution ?? "").trim().toLowerCase() === normalizedInst;
  });

  if (existing) {
    if (args.updateIfExists) {
      await db.fixedBills.update(existing.id, {
        amountCents: args.amountCents,
        dueDay: args.dueDay,
        categoryId: args.categoryId,
        notes: args.notes ?? "",
        active: true,
        // mantém coerência por método
        institution: args.method === "cartao" ? undefined : args.institution,
        cardId: args.method === "cartao" ? args.cardId : undefined,
      });
    }
    return existing.id;
  }

  const id = uuid();
  const bill: FixedBill = {
    id,
    type: args.type as any,
    name: args.name.trim(),
    amountCents: args.amountCents,
    dueDay: args.dueDay,
    method: args.method,
    institution: args.method === "cartao" ? undefined : args.institution,
    cardId: args.method === "cartao" ? args.cardId : undefined,
    categoryId: args.categoryId,
    active: true,
    notes: args.notes ?? "",
  };

  await db.fixedBills.add(bill);
  return id;
}

export function Lancamentos() {
  const baseId = useId();

  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const { data: cats } = useLiveQuery(() => db.categories.toArray(), []);
  const { data: cards } = useLiveQuery(() => db.cards.toArray(), []);

  const activeCards = useMemo(
    () => (cards ?? []).filter((c) => c.active),
    [cards]
  );

  const { data: txs, loading } = useLiveQuery(async () => {
    const all = await db.transactions
      .where("refMonth")
      .equals(monthKey)
      .toArray();
    return all.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [monthKey]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Parcelamento (somente cartão + despesa)
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState(2);
  const [installmentMode, setInstallmentMode] = useState<
    "projetar_fatura" | "gerar_lancamentos"
  >("projetar_fatura");

  // ✅ Recorrência (conta fixa)
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState<number>(() =>
    clampDay28(new Date().getDate())
  );
  const [updateRecurringTemplate, setUpdateRecurringTemplate] = useState(true);

  const [form, setForm] = useState(() => ({
    refMonth: monthKey,
    date: todayISO,
    description: "",
    categoryId: "",
    type: "despesa" as TxType,
    method: "cartao" as PaymentMethod,
    institution: DEFAULT_INSTITUTIONS[0] ?? "",
    amount: "",
    status: "pendente" as const,
    cardId: "",
    dueDate: "",
    notes: "",
  }));

  // Sincroniza competência com o mês selecionado quando NÃO estiver no avançado
  useEffect(() => {
    if (!showAdvanced) {
      setForm((f) => ({ ...f, refMonth: monthKey }));
    }
  }, [monthKey, showAdvanced]);

  // Se não há categoria selecionada, escolhe a primeira disponível
  useEffect(() => {
    if (!form.categoryId && (cats?.length ?? 0) > 0) {
      setForm((f) => ({ ...f, categoryId: cats![0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats]);

  // Se método é cartão e não tem cardId, escolhe o primeiro cartão ativo
  useEffect(() => {
    if (form.method === "cartao" && !form.cardId && activeCards.length > 0) {
      setForm((f) => ({ ...f, cardId: activeCards[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.method, activeCards.length]);

  // Se trocar para não-cartão, não faz sentido parcelado
  useEffect(() => {
    if (form.method !== "cartao") setIsInstallment(false);
  }, [form.method]);

  // Se trocar tipo para receita/transferência, parcelado não faz sentido
  useEffect(() => {
    if (form.type !== "despesa") setIsInstallment(false);
  }, [form.type]);

  const showCard = form.method === "cartao";
  const showInstitution = form.method !== "cartao";
  const showDueManual =
    form.method !== "cartao" && form.type !== "transferencia";

  const canUseInstallment = showCard && form.type === "despesa";
  const canBeRecurring = form.type !== "transferencia";

  // Total do mês (saldo por competência)
  const total = useMemo(() => {
    return (txs ?? []).reduce((acc, t) => {
      if (t.type === "receita") return acc + t.amountCents;
      if (t.type === "despesa") return acc - t.amountCents;
      return acc;
    }, 0);
  }, [txs]);

  const amountCents = useMemo(() => brlToCents(form.amount), [form.amount]);

  const canSubmit =
    !!amountCents &&
    amountCents > 0 &&
    form.description.trim().length > 0 &&
    (showCard ? form.cardId.trim().length > 0 : true) &&
    (showInstitution ? form.institution.trim().length > 0 : true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!canSubmit) {
      setToast({
        kind: "error",
        text: "Preencha descrição e valor corretamente.",
      });
      return;
    }

    const desc = form.description.trim();

    try {
      // 1) Parcelado (seu fluxo original)
      if (showCard && canUseInstallment && isInstallment && installments > 1) {
        await addInstallmentPlan({
          purchaseDate: form.date,
          description: desc,
          categoryId: form.categoryId || undefined,
          cardId: form.cardId,
          totalCents: amountCents,
          installments:
            clampDay28(installments) === installments
              ? installments
              : installments, // só evita NaN
          mode: installmentMode,
        });

        setToast({
          kind: "success",
          text: "Parcelamento registrado com sucesso.",
        });

        // limpa campos rápidos
        setForm((f) => ({
          ...f,
          description: "",
          amount: "",
          notes: "",
          dueDate: "",
        }));
        setIsInstallment(false);
        setInstallments(2);
        setInstallmentMode("projetar_fatura");
        return;
      }

      // 2) Recorrente: cria/atualiza o template (FixedBill) e liga o lançamento a ele
      let fixedBillId: string | undefined;

      if (makeRecurring && canBeRecurring) {
        const dueDay = clampDay28(recurringDay);

        fixedBillId = await upsertFixedBillFromForm({
          name: desc,
          type: form.type,
          method: form.method,
          institution: showInstitution ? form.institution : undefined,
          cardId: showCard ? form.cardId : undefined,
          amountCents,
          dueDay,
          categoryId: form.categoryId || undefined,
          notes: form.notes || "",
          updateIfExists: updateRecurringTemplate,
        });
      }

      // 3) Normal (com ou sem fixedBillId)
      await addTransaction({
        refMonth: form.refMonth,
        date: form.date,
        description: desc,
        categoryId: form.categoryId || undefined,
        type: form.type,
        method: form.method,
        institution: showInstitution ? form.institution : undefined,
        amountCents,
        status: form.status,
        cardId: showCard ? form.cardId : undefined,
        dueDate: showDueManual && form.dueDate ? form.dueDate : undefined,
        notes: form.notes || "",
        projected: false,
        fixedBillId, // ✅ se marcado como recorrente, liga ao template
      });

      setToast({
        kind: "success",
        text:
          makeRecurring && canBeRecurring
            ? "Recorrência criada e lançamento adicionado."
            : "Lançamento adicionado.",
      });

      // limpa campos rápidos
      setForm((f) => ({
        ...f,
        description: "",
        amount: "",
        notes: "",
        dueDate: "",
      }));

      // opcional: manter recorrente ligado ou não? (aqui desliga para evitar “surpresas”)
      setMakeRecurring(false);
    } catch {
      setToast({ kind: "error", text: "Falha ao salvar. Tente novamente." });
    }
  }

  const [editing, setEditing] = useState<Transaction | null>(null);

  return (
    <div className="space-y-4">
      {toast ? <ToastView toast={toast} /> : null}

      <Section
        title="Lançamento rápido"
        subtitle="Use o mês como competência e registre a data real do pagamento/compra."
        right={
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${baseId}-month`}>
              Selecione o mês (competência)
            </label>
            <input
              id={`${baseId}-month`}
              className="input w-[140px]"
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              aria-label="Selecione o mês (competência)"
            />
          </div>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <div className="text-xs text-slate-300">Tipo</div>
              <div
                className="mt-1 flex gap-2"
                role="group"
                aria-label="Tipo do lançamento"
              >
                <button
                  type="button"
                  className={cls(
                    "flex-1",
                    form.type === "despesa" ? "btn" : "btn-secondary"
                  )}
                  onClick={() => setForm((f) => ({ ...f, type: "despesa" }))}
                  aria-pressed={form.type === "despesa"}
                >
                  Despesa
                </button>

                <button
                  type="button"
                  className={cls(
                    "flex-1",
                    form.type === "receita" ? "btn" : "btn-secondary"
                  )}
                  onClick={() => setForm((f) => ({ ...f, type: "receita" }))}
                  aria-pressed={form.type === "receita"}
                >
                  Receita
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${baseId}-amount`}
              >
                Valor (R$)
              </label>
              <input
                id={`${baseId}-amount`}
                className="input mt-1 text-lg"
                inputMode="decimal"
                placeholder="Ex.: 123,45"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                aria-label="Valor em reais"
              />
            </div>

            <div className="md:col-span-2">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${baseId}-method`}
              >
                Meio
              </label>
              <select
                id={`${baseId}-method`}
                className="select mt-1"
                value={form.method}
                onChange={(e) => {
                  const m = e.target.value as PaymentMethod;
                  setForm((f) => ({ ...f, method: m }));
                  if (m !== "cartao") setIsInstallment(false);
                }}
                aria-label="Meio de pagamento"
              >
                <option value="cartao">Cartão</option>
                <option value="pix">Pix</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferência</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${baseId}-desc`}
              >
                Descrição
              </label>
              <input
                id={`${baseId}-desc`}
                className="input mt-1"
                placeholder="Ex.: mercado, gasolina, internet…"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                aria-label="Descrição"
              />
            </div>

            <div className="md:col-span-2">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${baseId}-cat`}
              >
                Categoria
              </label>
              <select
                id={`${baseId}-cat`}
                className="select mt-1"
                value={form.categoryId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, categoryId: e.target.value }))
                }
                aria-label="Categoria"
              >
                {(cats ?? []).length === 0 ? (
                  <option value="">(sem categorias cadastradas)</option>
                ) : null}
                {(cats ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {showCard ? (
              <div className="md:col-span-3">
                <label
                  className="text-xs text-slate-300"
                  htmlFor={`${baseId}-card`}
                >
                  Cartão
                </label>
                <select
                  id={`${baseId}-card`}
                  className="select mt-1"
                  value={form.cardId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cardId: e.target.value }))
                  }
                  aria-label="Cartão"
                  disabled={activeCards.length === 0}
                >
                  {activeCards.length === 0 ? (
                    <option value="">(nenhum cartão ativo)</option>
                  ) : null}
                  {activeCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="md:col-span-3">
                <label
                  className="text-xs text-slate-300"
                  htmlFor={`${baseId}-inst`}
                >
                  Banco / Instituição
                </label>
                <select
                  id={`${baseId}-inst`}
                  className="select mt-1"
                  value={form.institution}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, institution: e.target.value }))
                  }
                  aria-label="Banco ou instituição"
                >
                  {DEFAULT_INSTITUTIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-3">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${baseId}-date`}
              >
                Data (pagamento/compra)
              </label>
              <input
                id={`${baseId}-date`}
                className="input mt-1"
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                aria-label="Data do pagamento ou compra"
              />
            </div>

            {/* ✅ Linha de “opções” (recorrente e parcelado) */}
            <div className="md:col-span-6 flex flex-wrap items-center gap-3">
              <label
                className={cls(
                  "inline-flex items-center gap-2 text-sm",
                  !canBeRecurring && "opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  checked={canBeRecurring ? makeRecurring : false}
                  disabled={!canBeRecurring}
                  onChange={(e) => setMakeRecurring(e.target.checked)}
                />
                Recorrente (conta fixa)
              </label>

              {makeRecurring && canBeRecurring ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300">
                      {showCard ? "Dia da cobrança" : "Dia do vencimento"}
                    </span>
                    <input
                      className="input w-[90px]"
                      type="number"
                      min={1}
                      max={28}
                      value={recurringDay}
                      onChange={(e) =>
                        setRecurringDay(Number(e.target.value || 1))
                      }
                      aria-label={
                        showCard ? "Dia da cobrança" : "Dia do vencimento"
                      }
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={updateRecurringTemplate}
                      onChange={(e) =>
                        setUpdateRecurringTemplate(e.target.checked)
                      }
                    />
                    Atualizar valor padrão (próximos meses)
                  </label>

                  <span className="text-xs text-slate-400">
                    * A recorrência aparece nos próximos meses via “Contas
                    fixas”.
                  </span>
                </>
              ) : null}

              {showCard ? (
                <>
                  <span
                    className="mx-2 h-5 w-px bg-slate-800"
                    aria-hidden="true"
                  />

                  <label
                    className={cls(
                      "inline-flex items-center gap-2 text-sm",
                      !canUseInstallment && "opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={canUseInstallment ? isInstallment : false}
                      disabled={!canUseInstallment}
                      onChange={(e) => setIsInstallment(e.target.checked)}
                    />
                    Parcelado
                  </label>

                  {canUseInstallment && isInstallment ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300">Parcelas</span>
                        <input
                          className="input w-[90px]"
                          type="number"
                          min={2}
                          max={48}
                          value={installments}
                          onChange={(e) =>
                            setInstallments(Number(e.target.value || 2))
                          }
                          aria-label="Número de parcelas"
                        />
                      </div>

                      <label
                        className="sr-only"
                        htmlFor={`${baseId}-install-mode`}
                      >
                        Modo de parcelamento
                      </label>
                      <select
                        id={`${baseId}-install-mode`}
                        className="select"
                        value={installmentMode}
                        onChange={(e) =>
                          setInstallmentMode(e.target.value as any)
                        }
                        aria-label="Modo de parcelamento"
                      >
                        <option value="projetar_fatura">
                          Projetar na fatura
                        </option>
                        <option value="gerar_lancamentos">
                          Gerar lançamentos
                        </option>
                      </select>

                      <span className="text-xs text-slate-400">
                        * “Projetar” = aparece na fatura sem poluir o dia a dia.
                      </span>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? "Menos opções" : "Mais opções"}
            </button>

            <button className="btn" type="submit" disabled={!canSubmit}>
              Adicionar
            </button>
          </div>

          {showAdvanced ? (
            <div className="grid md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <label
                  className="text-xs text-slate-300"
                  htmlFor={`${baseId}-refMonth`}
                >
                  Competência (mês)
                </label>
                <input
                  id={`${baseId}-refMonth`}
                  className="input mt-1"
                  type="month"
                  value={form.refMonth}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, refMonth: e.target.value }))
                  }
                  aria-label="Competência (mês)"
                />
              </div>

              {showDueManual ? (
                <div className="md:col-span-2">
                  <label
                    className="text-xs text-slate-300"
                    htmlFor={`${baseId}-due`}
                  >
                    Vencimento (opcional)
                  </label>
                  <input
                    id={`${baseId}-due`}
                    className="input mt-1"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dueDate: e.target.value }))
                    }
                    aria-label="Vencimento"
                  />
                </div>
              ) : (
                <div className="md:col-span-2" />
              )}

              <div className="md:col-span-2">
                <label
                  className="text-xs text-slate-300"
                  htmlFor={`${baseId}-status`}
                >
                  Status
                </label>
                <select
                  id={`${baseId}-status`}
                  className="select mt-1"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as any }))
                  }
                  aria-label="Status"
                >
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                </select>
              </div>

              <div className="md:col-span-6">
                <label
                  className="text-xs text-slate-300"
                  htmlFor={`${baseId}-notes`}
                >
                  Observações (opcional)
                </label>
                <input
                  id={`${baseId}-notes`}
                  className="input mt-1"
                  placeholder="Ex.: pago via app, reembolso, etc."
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  aria-label="Observações"
                />
              </div>
            </div>
          ) : null}
        </form>
      </Section>

      <Section
        title="Lançamentos do mês"
        subtitle="Lista pela competência (mês). Você ainda vê a data real e o vencimento, quando houver."
        right={
          <div className="text-sm text-slate-300">
            Saldo do mês:{" "}
            <span className="font-semibold">{centsToBrl(total)}</span>
          </div>
        }
      >
        <div className="space-y-2">
          {loading ? (
            <div className="text-sm text-slate-400">Carregando...</div>
          ) : null}

          {(txs ?? [])
            .slice()
            .reverse()
            .map((tx) => (
              <div
                key={tx.id}
                className="card p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{tx.type}</span>
                    <span className="badge">{tx.method}</span>

                    {tx.fixedBillId ? (
                      <span className="badge">recorrente</span>
                    ) : null}

                    {tx.institution && tx.method !== "cartao" ? (
                      <span className="badge">{tx.institution}</span>
                    ) : null}

                    {tx.projected ? (
                      <span className="badge">projetado</span>
                    ) : null}

                    <span
                      className={cls(
                        "badge",
                        tx.status === "pago"
                          ? "border-emerald-700 text-emerald-300"
                          : "border-amber-700 text-amber-300"
                      )}
                    >
                      {tx.status}
                    </span>
                  </div>

                  <div className="mt-1 font-semibold truncate">
                    {tx.description}
                  </div>

                  <div className="text-xs text-slate-400 mt-1">
                    {format(parseISO(tx.date), "dd/MM/yyyy")}
                    {tx.dueDate
                      ? ` • vence ${format(parseISO(tx.dueDate), "dd/MM/yyyy")}`
                      : ""}
                    {tx.statementMonth ? ` • fatura ${tx.statementMonth}` : ""}
                    {tx.refMonth ? ` • competência ${tx.refMonth}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-base font-semibold">
                    {centsToBrlCompact(
                      tx.type === "despesa" ? -tx.amountCents : tx.amountCents
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={async () => {
                      try {
                        await setTransactionStatus(
                          tx.id,
                          tx.status === "pago" ? "pendente" : "pago"
                        );
                        setToast({
                          kind: "success",
                          text: "Status atualizado.",
                        });
                      } catch {
                        setToast({
                          kind: "error",
                          text: "Falha ao atualizar status.",
                        });
                      }
                    }}
                  >
                    Pago?
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditing(tx)}
                  >
                    Editar
                  </button>
                </div>
              </div>
            ))}

          {(txs ?? []).length === 0 ? (
            <div className="text-sm text-slate-400">
              Sem lançamentos neste mês.
            </div>
          ) : null}
        </div>
      </Section>

      {editing ? (
        <EditModal
          tx={editing}
          cats={cats ?? []}
          cards={activeCards}
          onClose={() => setEditing(null)}
          onDelete={async () => {
            try {
              await deleteTransaction(editing.id);
              setEditing(null);
              setToast({ kind: "success", text: "Lançamento excluído." });
            } catch {
              setToast({ kind: "error", text: "Não foi possível excluir." });
            }
          }}
          onSave={async (patch, opts) => {
            try {
              // ✅ opcional: atualizar o template da recorrência
              if (opts?.updateRecurring && editing.fixedBillId) {
                const dueDay =
                  patch.method === "cartao"
                    ? dayFromISO(patch.date ?? editing.date)
                    : patch.dueDate
                    ? dayFromISO(patch.dueDate)
                    : dayFromISO(patch.date ?? editing.date);

                await db.fixedBills.update(editing.fixedBillId, {
                  name: (patch.description ?? editing.description).trim(),
                  type: (patch.type ?? editing.type) as any,
                  method: (patch.method ?? editing.method) as any,
                  amountCents: patch.amountCents ?? editing.amountCents,
                  categoryId: patch.categoryId ?? editing.categoryId,
                  notes: patch.notes ?? editing.notes ?? "",
                  dueDay,
                  institution:
                    (patch.method ?? editing.method) === "cartao"
                      ? undefined
                      : patch.institution ?? editing.institution,
                  cardId:
                    (patch.method ?? editing.method) === "cartao"
                      ? patch.cardId ?? editing.cardId
                      : undefined,
                  active: true,
                });
              }

              await updateTransaction(editing.id, patch);
              setEditing(null);
              setToast({
                kind: "success",
                text: "Lançamento atualizado com sucesso.",
              });
            } catch {
              setToast({
                kind: "error",
                text: "Não foi possível salvar as alterações.",
              });
              throw new Error("save_failed");
            }
          }}
        />
      ) : null}
    </div>
  );
}

function EditModal(props: {
  tx: Transaction;
  cats: Array<{ id: string; name: string }>;
  cards: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onSave: (
    patch: TxPatch,
    opts?: { updateRecurring?: boolean }
  ) => Promise<void>;
}) {
  const idBase = useId();

  const [local, setLocal] = useState(() => ({
    date: props.tx.date,
    refMonth: props.tx.refMonth,
    description: props.tx.description,
    categoryId: props.tx.categoryId ?? "",
    type: props.tx.type,
    method: props.tx.method,
    institution: props.tx.institution ?? DEFAULT_INSTITUTIONS[0] ?? "",
    amount: String((props.tx.amountCents / 100).toFixed(2)).replace(".", ","),
    status: props.tx.status,
    cardId: props.tx.cardId ?? "",
    dueDate: props.tx.dueDate ?? "",
    notes: props.tx.notes ?? "",
    updateRecurring: false, // ✅ opcional: aplicar ao “template” também
  }));

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showCard = local.method === "cartao";
  const showInstitution = local.method !== "cartao";
  const showDueManual =
    local.method !== "cartao" && local.type !== "transferencia";

  const amountCents = useMemo(() => brlToCents(local.amount), [local.amount]);

  const canSave =
    !!amountCents &&
    amountCents > 0 &&
    local.description.trim().length > 0 &&
    (showCard ? local.cardId.trim().length > 0 : true) &&
    (showInstitution ? local.institution.trim().length > 0 : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="card w-full max-w-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Editar lançamento</div>
            <div className="text-xs text-slate-400">
              Ajuste e salve. Para cartão, fatura/vencimento podem ser
              recalculados pelo serviço ao mudar data/cartão.
            </div>
          </div>

          <button
            className="btn-secondary"
            onClick={props.onClose}
            disabled={saving}
            type="button"
          >
            Fechar
          </button>
        </div>

        {errorMsg ? (
          <div className="mt-3 text-sm text-rose-200 border border-rose-700 rounded-xl p-2">
            {errorMsg}
          </div>
        ) : null}

        <div className="grid md:grid-cols-6 gap-3 mt-4">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-300" htmlFor={`${idBase}-ref`}>
              Competência
            </label>
            <input
              id={`${idBase}-ref`}
              className="input mt-1"
              type="month"
              value={local.refMonth}
              onChange={(e) =>
                setLocal((s) => ({ ...s, refMonth: e.target.value }))
              }
              aria-label="Competência"
            />
          </div>

          <div className="md:col-span-2">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-date`}
            >
              Data
            </label>
            <input
              id={`${idBase}-date`}
              className="input mt-1"
              type="date"
              value={local.date}
              onChange={(e) =>
                setLocal((s) => ({ ...s, date: e.target.value }))
              }
              aria-label="Data"
            />
          </div>

          <div className="md:col-span-2">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-amount`}
            >
              Valor (R$)
            </label>
            <input
              id={`${idBase}-amount`}
              className="input mt-1"
              inputMode="decimal"
              placeholder="Ex.: 123,45"
              value={local.amount}
              onChange={(e) =>
                setLocal((s) => ({ ...s, amount: e.target.value }))
              }
              aria-label="Valor"
            />
          </div>

          <div className="md:col-span-4">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-desc`}
            >
              Descrição
            </label>
            <input
              id={`${idBase}-desc`}
              className="input mt-1"
              value={local.description}
              onChange={(e) =>
                setLocal((s) => ({ ...s, description: e.target.value }))
              }
              aria-label="Descrição"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-300" htmlFor={`${idBase}-cat`}>
              Categoria
            </label>
            <select
              id={`${idBase}-cat`}
              className="select mt-1"
              value={local.categoryId}
              onChange={(e) =>
                setLocal((s) => ({ ...s, categoryId: e.target.value }))
              }
              aria-label="Categoria"
            >
              {props.cats.length === 0 ? (
                <option value="">(sem categorias)</option>
              ) : null}
              {props.cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-type`}
            >
              Tipo
            </label>
            <select
              id={`${idBase}-type`}
              className="select mt-1"
              value={local.type}
              onChange={(e) =>
                setLocal((s) => ({ ...s, type: e.target.value as TxType }))
              }
              aria-label="Tipo"
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-method`}
            >
              Meio
            </label>
            <select
              id={`${idBase}-method`}
              className="select mt-1"
              value={local.method}
              onChange={(e) =>
                setLocal((s) => ({
                  ...s,
                  method: e.target.value as PaymentMethod,
                }))
              }
              aria-label="Meio"
            >
              <option value="cartao">Cartão</option>
              <option value="pix">Pix</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>

          {showCard ? (
            <div className="md:col-span-2">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${idBase}-card`}
              >
                Cartão
              </label>
              <select
                id={`${idBase}-card`}
                className="select mt-1"
                value={local.cardId}
                onChange={(e) =>
                  setLocal((s) => ({ ...s, cardId: e.target.value }))
                }
                aria-label="Cartão"
                disabled={props.cards.length === 0}
              >
                {props.cards.length === 0 ? (
                  <option value="">(nenhum cartão ativo)</option>
                ) : null}
                {props.cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-2">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${idBase}-inst`}
              >
                Banco / Instituição
              </label>
              <select
                id={`${idBase}-inst`}
                className="select mt-1"
                value={local.institution}
                onChange={(e) =>
                  setLocal((s) => ({ ...s, institution: e.target.value }))
                }
                aria-label="Banco ou instituição"
              >
                {DEFAULT_INSTITUTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showDueManual ? (
            <div className="md:col-span-2">
              <label
                className="text-xs text-slate-300"
                htmlFor={`${idBase}-due`}
              >
                Vencimento
              </label>
              <input
                id={`${idBase}-due`}
                className="input mt-1"
                type="date"
                value={local.dueDate}
                onChange={(e) =>
                  setLocal((s) => ({ ...s, dueDate: e.target.value }))
                }
                aria-label="Vencimento"
              />
            </div>
          ) : (
            <div className="md:col-span-2" />
          )}

          <div className="md:col-span-2">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-status`}
            >
              Status
            </label>
            <select
              id={`${idBase}-status`}
              className="select mt-1"
              value={local.status}
              onChange={(e) =>
                setLocal((s) => ({ ...s, status: e.target.value as any }))
              }
              aria-label="Status"
            >
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </select>
          </div>

          <div className="md:col-span-6">
            <label
              className="text-xs text-slate-300"
              htmlFor={`${idBase}-notes`}
            >
              Observações
            </label>
            <input
              id={`${idBase}-notes`}
              className="input mt-1"
              placeholder="Ex.: ajuste, reembolso, detalhes…"
              value={local.notes}
              onChange={(e) =>
                setLocal((s) => ({ ...s, notes: e.target.value }))
              }
              aria-label="Observações"
            />
          </div>

          {props.tx.fixedBillId ? (
            <div className="md:col-span-6">
              <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={local.updateRecurring}
                  onChange={(e) =>
                    setLocal((s) => ({
                      ...s,
                      updateRecurring: e.target.checked,
                    }))
                  }
                />
                Aplicar estas mudanças também na recorrência (próximos meses)
              </label>
              <div className="text-xs text-slate-400 mt-1">
                Isso atualiza a “Conta fixa” vinculada a este lançamento.
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between mt-4">
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={async () => {
              if (!window.confirm("Excluir este lançamento?")) return;
              setSaving(true);
              try {
                await props.onDelete();
              } finally {
                setSaving(false);
              }
            }}
          >
            Excluir
          </button>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={props.onClose}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="btn"
              disabled={!canSave || saving}
              onClick={async () => {
                setErrorMsg(null);
                setSaving(true);

                try {
                  const patch: TxPatch = {
                    refMonth: local.refMonth,
                    date: local.date,
                    description: local.description.trim(),
                    categoryId: local.categoryId || undefined,
                    type: local.type,
                    method: local.method,
                    institution: showInstitution
                      ? local.institution
                      : undefined,
                    amountCents,
                    status: local.status,
                    cardId: showCard ? local.cardId : undefined,
                    dueDate: showDueManual
                      ? local.dueDate || undefined
                      : undefined,
                    notes: local.notes,
                  };

                  await props.onSave(patch, {
                    updateRecurring: local.updateRecurring,
                  });
                } catch {
                  setSaving(false);
                  setErrorMsg("Falha ao salvar. Tente novamente.");
                }
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
