import React, { useMemo, useState, useId } from "react";
import { db } from "../db/db";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { Section } from "../ui/Section";
import type { Card, Category, FixedBill, PaymentMethod } from "../domain/types";
import { addFixedBill, uuid } from "../services/finance";
import { brlToCents, centsToBrl } from "../lib/money";
import { DEFAULT_INSTITUTIONS } from "../domain/institutions";

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function centsToInputBRL(amountCents: number) {
  return String((amountCents / 100).toFixed(2)).replace(".", ",");
}

export function Config() {
  return (
    <div className="space-y-4">
      <Cards />
      <FixedBills />
      <Categories />
    </div>
  );
}

/* ----------------------------- CARTÕES ----------------------------- */

function Cards() {
  const nameId = useId();
  const closingId = useId();
  const dueId = useId();
  const offsetId = useId();
  const activeId = useId();

  const { data: cards } = useLiveQuery(() => db.cards.toArray(), []);

  const [form, setForm] = useState({
    name: "",
    closingDay: 8,
    dueDay: 15,
    dueOffsetMonths: 1,
    active: true,
  });

  async function add() {
    const trimmed = form.name.trim();
    if (!trimmed) return;

    const card: Card = {
      id: uuid(),
      name: trimmed,
      closingDay: Number(form.closingDay),
      dueDay: Number(form.dueDay),
      dueOffsetMonths: Number(form.dueOffsetMonths),
      active: !!form.active,
    };

    await db.cards.add(card);

    setForm({
      name: "",
      closingDay: 8,
      dueDay: 15,
      dueOffsetMonths: 1,
      active: true,
    });
  }

  return (
    <Section
      title="Cartões"
      subtitle="Configure fechamento/vencimento. Você pode cadastrar mais de um cartão e ativar/desativar quando quiser."
    >
      <div className="grid md:grid-cols-10 gap-3">
        <div className="md:col-span-3">
          <label className="text-xs text-slate-300" htmlFor={nameId}>
            Nome do cartão
          </label>
          <input
            id={nameId}
            className="input mt-1 w-full"
            placeholder="Ex.: Santander"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Nome do cartão"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300" htmlFor={closingId}>
            Dia de fechamento
          </label>
          <input
            id={closingId}
            className="input mt-1 w-full"
            type="number"
            min={1}
            max={31}
            value={form.closingDay}
            onChange={(e) =>
              setForm({ ...form, closingDay: Number(e.target.value) })
            }
            aria-label="Dia de fechamento"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300" htmlFor={dueId}>
            Dia de vencimento
          </label>
          <input
            id={dueId}
            className="input mt-1 w-full"
            type="number"
            min={1}
            max={31}
            value={form.dueDay}
            onChange={(e) =>
              setForm({ ...form, dueDay: Number(e.target.value) })
            }
            aria-label="Dia de vencimento"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300" htmlFor={offsetId}>
            Offset (meses)
          </label>
          <input
            id={offsetId}
            className="input mt-1 w-full"
            type="number"
            min={0}
            max={2}
            value={form.dueOffsetMonths}
            onChange={(e) =>
              setForm({ ...form, dueOffsetMonths: Number(e.target.value) })
            }
            aria-label="Offset em meses"
          />
        </div>

        <div className="md:col-span-1 flex items-end">
          <label
            className="inline-flex items-center gap-2 text-sm text-slate-200"
            htmlFor={activeId}
          >
            <input
              id={activeId}
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Ativo
          </label>
        </div>

        <div className="md:col-span-10 flex justify-end">
          <button className="btn" type="button" onClick={add}>
            Adicionar
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(cards ?? []).map((c) => (
          <div
            key={c.id}
            className="card p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
          >
            <div>
              <div className="font-semibold">
                {c.name} {c.active ? "" : "(inativo)"}
              </div>
              <div className="text-xs text-slate-400">
                Fecha dia {c.closingDay} • Vence dia {c.dueDay} • Offset{" "}
                {c.dueOffsetMonths} mês(es)
              </div>
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => db.cards.update(c.id, { active: !c.active })}
            >
              {c.active ? "Desativar" : "Ativar"}
            </button>
          </div>
        ))}
        {(cards ?? []).length === 0 ? (
          <div className="text-sm text-slate-400">
            Nenhum cartão cadastrado.
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ---------------------------- CONTAS FIXAS ---------------------------- */

type FixedBillDraft = {
  type: "despesa" | "receita";
  name: string;
  amount: string;
  dueDay: number;
  method: PaymentMethod;
  institution: string;
  cardId: string;
  categoryId: string;
  active: boolean;
  notes: string;
};

function FixedBills() {
  const { data: bills } = useLiveQuery(() => db.fixedBills.toArray(), []);
  const { data: cats } = useLiveQuery(() => db.categories.toArray(), []);
  const { data: cards } = useLiveQuery(() => db.cards.toArray(), []);

  const cardsActive = useMemo(
    () => (cards ?? []).filter((c) => c.active),
    [cards]
  );

  const cardNameById = useMemo(() => {
    const m = new Map<string, string>();
    (cards ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [cards]);

  const categoryOptions = useMemo(() => cats ?? [], [cats]);

  const [form, setForm] = useState<FixedBillDraft>({
    type: "despesa",
    name: "",
    amount: "",
    dueDay: 10,
    method: "boleto",
    institution: "Santander",
    cardId: "card-santander",
    categoryId: "cat-contas",
    active: true,
    notes: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FixedBillDraft | null>(null);

  async function add() {
    const trimmed = form.name.trim();
    if (!trimmed) return;

    const amountCents = brlToCents(form.amount || "0");

    await addFixedBill({
      type: form.type,
      name: trimmed,
      amountCents,
      dueDay: Number(form.dueDay),
      method: form.method,
      institution: form.method === "cartao" ? undefined : form.institution,
      cardId: form.method === "cartao" ? form.cardId : undefined,
      categoryId: form.categoryId || undefined,
      active: !!form.active,
      notes: form.notes || "",
    });

    setForm({ ...form, name: "", amount: "", notes: "" });
  }

  function startEdit(b: FixedBill) {
    setEditingId(b.id);
    setEditing({
      type: b.type,
      name: b.name,
      amount: centsToInputBRL(b.amountCents),
      dueDay: b.dueDay,
      method: b.method,
      institution: b.institution ?? "Santander",
      cardId: b.cardId ?? "card-santander",
      categoryId: b.categoryId ?? "cat-contas",
      active: b.active,
      notes: b.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) return;

    const amountCents = brlToCents(editing.amount || "0");

    await db.fixedBills.update(id, {
      type: editing.type,
      name: trimmed,
      amountCents,
      dueDay: Number(editing.dueDay),
      method: editing.method,
      institution:
        editing.method === "cartao" ? undefined : editing.institution,
      cardId: editing.method === "cartao" ? editing.cardId : undefined,
      categoryId: editing.categoryId || undefined,
      active: !!editing.active,
      notes: editing.notes || "",
    });

    setEditingId(null);
    setEditing(null);
  }

  return (
    <Section
      title="Contas fixas"
      subtitle="Cadastre contas recorrentes com dia de vencimento. O app usa isso para projetar/organizar por mês (competência)."
    >
      <div className="grid md:grid-cols-12 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Tipo</label>
          <select
            className="select mt-1 w-full"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as any })}
            aria-label="Tipo"
          >
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
        </div>

        <div className="md:col-span-4">
          <label className="text-xs text-slate-300">Nome</label>
          <input
            className="input mt-1 w-full"
            placeholder="Ex.: Financiamento"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Nome da conta fixa"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Valor</label>
          <input
            className="input mt-1 w-full"
            placeholder="Ex.: 3400,00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            aria-label="Valor"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Dia</label>
          <input
            className="input mt-1 w-full"
            type="number"
            min={1}
            max={31}
            value={form.dueDay}
            onChange={(e) =>
              setForm({ ...form, dueDay: Number(e.target.value) })
            }
            aria-label="Dia de vencimento"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs text-slate-300">Meio</label>
          <select
            className="select mt-1 w-full"
            value={form.method}
            onChange={(e) =>
              setForm({ ...form, method: e.target.value as any })
            }
            aria-label="Meio de pagamento"
          >
            <option value="boleto">Boleto</option>
            <option value="pix">Pix</option>
            <option value="transferencia">Transferência</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="cartao">Cartão</option>
          </select>
        </div>

        <div className="md:col-span-4">
          <label className="text-xs text-slate-300">
            {form.method === "cartao" ? "Cartão" : "Banco / Instituição"}
          </label>

          {form.method === "cartao" ? (
            <select
              className="select mt-1 w-full"
              value={form.cardId}
              onChange={(e) => setForm({ ...form, cardId: e.target.value })}
              aria-label="Cartão"
            >
              {cardsActive.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="select mt-1 w-full"
              value={form.institution}
              onChange={(e) =>
                setForm({ ...form, institution: e.target.value })
              }
              aria-label="Banco ou instituição"
            >
              {DEFAULT_INSTITUTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="md:col-span-4">
          <label className="text-xs text-slate-300">Categoria</label>
          <select
            className="select mt-1 w-full"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            aria-label="Categoria"
          >
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Ativa
          </label>
        </div>

        <div className="md:col-span-2 flex items-end justify-end">
          <button className="btn" type="button" onClick={add}>
            Adicionar
          </button>
        </div>

        <div className="md:col-span-12">
          <label className="text-xs text-slate-300">Observações</label>
          <input
            className="input mt-1 w-full"
            placeholder="Opcional"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            aria-label="Observações"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(bills ?? []).map((b) => {
          const catName =
            (cats ?? []).find((c) => c.id === b.categoryId)?.name ?? "—";
          const isEditing = editingId === b.id;

          if (isEditing && editing) {
            return (
              <div key={b.id} className="card p-3 space-y-2">
                <div className="grid md:grid-cols-12 gap-2">
                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-300">Tipo</label>
                    <select
                      className="select mt-1 w-full"
                      value={editing.type}
                      onChange={(e) =>
                        setEditing({ ...editing, type: e.target.value as any })
                      }
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs text-slate-300">Nome</label>
                    <input
                      className="input mt-1 w-full"
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-300">Valor</label>
                    <input
                      className="input mt-1 w-full"
                      value={editing.amount}
                      onChange={(e) =>
                        setEditing({ ...editing, amount: e.target.value })
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-300">Dia</label>
                    <input
                      className="input mt-1 w-full"
                      type="number"
                      min={1}
                      max={31}
                      value={editing.dueDay}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          dueDay: Number(e.target.value),
                        })
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-300">Meio</label>
                    <select
                      className="select mt-1 w-full"
                      value={editing.method}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          method: e.target.value as any,
                        })
                      }
                    >
                      <option value="boleto">Boleto</option>
                      <option value="pix">Pix</option>
                      <option value="transferencia">Transferência</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="cartao">Cartão</option>
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs text-slate-300">
                      {editing.method === "cartao"
                        ? "Cartão"
                        : "Banco / Instituição"}
                    </label>

                    {editing.method === "cartao" ? (
                      <select
                        className="select mt-1 w-full"
                        value={editing.cardId}
                        onChange={(e) =>
                          setEditing({ ...editing, cardId: e.target.value })
                        }
                      >
                        {cardsActive.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className="select mt-1 w-full"
                        value={editing.institution}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            institution: e.target.value,
                          })
                        }
                      >
                        {DEFAULT_INSTITUTIONS.map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="md:col-span-4">
                    <label className="text-xs text-slate-300">Categoria</label>
                    <select
                      className="select mt-1 w-full"
                      value={editing.categoryId}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          categoryId: e.target.value,
                        })
                      }
                    >
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={editing.active}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            active: e.target.checked,
                          })
                        }
                      />
                      Ativa
                    </label>
                  </div>

                  <div className="md:col-span-2 flex items-end justify-end gap-2">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => saveEdit(b.id)}
                    >
                      Salvar
                    </button>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditing(null);
                      }}
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="md:col-span-12">
                    <label className="text-xs text-slate-300">
                      Observações
                    </label>
                    <input
                      className="input mt-1 w-full"
                      value={editing.notes}
                      onChange={(e) =>
                        setEditing({ ...editing, notes: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          }

          const cardLabel =
            b.method === "cartao" && b.cardId
              ? cardNameById.get(b.cardId) ?? b.cardId
              : "";

          return (
            <div
              key={b.id}
              className="card p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
            >
              <div>
                <div className="font-semibold">
                  {b.name} {b.active ? "" : "(inativa)"}
                </div>
                <div className="text-xs text-slate-400">
                  {b.type} • dia {b.dueDay} • {centsToBrl(b.amountCents)} •{" "}
                  {b.method}
                  {b.method !== "cartao" && b.institution
                    ? ` • ${b.institution}`
                    : ""}
                  {b.method === "cartao" && cardLabel ? ` • ${cardLabel}` : ""}
                  {b.categoryId ? ` • ${catName}` : ""}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => startEdit(b)}
                >
                  Editar
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() =>
                    db.fixedBills.update(b.id, { active: !b.active })
                  }
                >
                  {b.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => db.fixedBills.delete(b.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          );
        })}

        {(bills ?? []).length === 0 ? (
          <div className="text-sm text-slate-400">
            Nenhuma conta fixa cadastrada.
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ---------------------------- CATEGORIAS ---------------------------- */

function Categories() {
  const inputId = useId();
  const selectId = useId();

  const { data: cats } = useLiveQuery(() => db.categories.toArray(), []);
  const { data: txs } = useLiveQuery(() => db.transactions.toArray(), []);
  const { data: bills } = useLiveQuery(() => db.fixedBills.toArray(), []);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"despesa" | "receita" | "ambos">("despesa");

  const [cleanMode, setCleanMode] = useState(false);
  const [onlyUnused, setOnlyUnused] = useState(false);

  const usageById = useMemo(() => {
    const m = new Map<string, number>();

    (txs ?? []).forEach((t) => {
      if (!t.categoryId) return;
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1);
    });

    (bills ?? []).forEach((b) => {
      if (!b.categoryId) return;
      m.set(b.categoryId, (m.get(b.categoryId) ?? 0) + 1);
    });

    return m;
  }, [txs, bills]);

  const visibleCats = useMemo(() => {
    const list = cats ?? [];
    if (!onlyUnused) return list;
    return list.filter((c) => (usageById.get(c.id) ?? 0) === 0);
  }, [cats, onlyUnused, usageById]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const exists = (cats ?? []).some(
      (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      alert("Já existe uma categoria com esse nome.");
      return;
    }

    const c: Category = { id: uuid(), name: trimmed, kind };
    await db.categories.add(c);

    setName("");
    setKind("despesa");
  }

  async function removeCategory(c: Category) {
    const usedCount = usageById.get(c.id) ?? 0;

    if (usedCount > 0) {
      alert(
        `Não dá para excluir "${c.name}" porque está em uso (${usedCount}).`
      );
      return;
    }

    const ok = window.confirm(`Excluir a categoria "${c.name}"?`);
    if (!ok) return;

    await db.categories.delete(c.id);
  }

  async function removeAllUnused() {
    const unused = (cats ?? []).filter((c) => (usageById.get(c.id) ?? 0) === 0);
    if (unused.length === 0) {
      alert("Não há categorias sem uso para excluir.");
      return;
    }

    const ok = window.confirm(
      `Excluir ${unused.length} categoria(s) sem uso? (Isso NÃO apaga categorias em uso)`
    );
    if (!ok) return;

    await db.transaction("rw", db.categories, async () => {
      for (const c of unused) {
        await db.categories.delete(c.id);
      }
    });
  }

  return (
    <Section
      title="Categorias"
      subtitle="Crie categorias extras para melhorar seus relatórios. Use o modo limpeza para remover as de teste com segurança."
      right={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cleanMode ? "btn" : "btn-secondary"}
            onClick={() => setCleanMode((v) => !v)}
            aria-pressed={cleanMode}
          >
            {cleanMode ? "Modo limpeza: ON" : "Modo limpeza"}
          </button>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={onlyUnused}
              onChange={(e) => setOnlyUnused(e.target.checked)}
            />
            Mostrar apenas sem uso
          </label>

          {cleanMode ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={removeAllUnused}
              title="Exclui somente categorias sem uso"
            >
              Excluir todas sem uso
            </button>
          ) : null}
        </div>
      }
    >
      <div className="grid md:grid-cols-5 gap-3">
        <div className="md:col-span-3">
          <label className="text-xs text-slate-300" htmlFor={inputId}>
            Nome da categoria
          </label>
          <input
            id={inputId}
            className="input mt-1 w-full"
            placeholder="Ex.: Internet, Luz, Mercado..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome da categoria"
          />
        </div>

        <div>
          <label className="text-xs text-slate-300" htmlFor={selectId}>
            Tipo
          </label>
          <select
            id={selectId}
            className="select mt-1 w-full"
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            aria-label="Tipo da categoria"
          >
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>

        <div className="flex items-end">
          <button className="btn w-full" type="button" onClick={add}>
            Adicionar
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {visibleCats.map((c) => {
          const usedCount = usageById.get(c.id) ?? 0;
          const canDelete = cleanMode && usedCount === 0;

          return (
            <span key={c.id} className="badge inline-flex items-center gap-2">
              <span className="truncate max-w-[260px]">{c.name}</span>

              {cleanMode ? (
                <>
                  <span className="text-[10px] text-slate-400">
                    {usedCount > 0 ? `em uso: ${usedCount}` : "livre"}
                  </span>

                  <button
                    type="button"
                    className={cls(
                      "px-1 rounded border text-xs",
                      canDelete
                        ? "border-rose-700 text-rose-200 hover:bg-rose-950/30"
                        : "border-slate-700 text-slate-500 cursor-not-allowed"
                    )}
                    onClick={() => removeCategory(c)}
                    disabled={!canDelete}
                    title={
                      usedCount > 0
                        ? `Em uso (${usedCount}) — não pode excluir`
                        : "Excluir categoria"
                    }
                    aria-label={`Excluir categoria ${c.name}`}
                  >
                    ✕
                  </button>
                </>
              ) : null}
            </span>
          );
        })}
      </div>

      {(cats ?? []).length === 0 ? (
        <div className="text-sm text-slate-400 mt-3">
          Nenhuma categoria cadastrada.
        </div>
      ) : null}
    </Section>
  );
}
