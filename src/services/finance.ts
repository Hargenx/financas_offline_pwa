import { db } from '../db/db';
import type { FixedBill, InstallmentPlan, Transaction, TxStatus } from '../domain/types';
import { computeDueDate, computeStatementMonth, dueDateForBill, chargeDateForStatementMonth } from '../lib/dates';

export function uuid(): string {
  // bom o suficiente para app local
  return crypto.randomUUID();
}

export async function addTransaction(input: Omit<Transaction, 'id' | 'createdAt' | 'statementMonth' | 'dueDate' | 'refMonth'> & {
  dueDate?: string;
  refMonth?: string;
}): Promise<string> {
  const id = uuid();
  const createdAt = new Date().toISOString();

  let statementMonth: string | undefined = undefined;
  let dueDate: string | undefined = input.dueDate;
  let refMonth: string = input.refMonth ?? input.date.slice(0, 7);

  if (input.method === 'cartao' && input.cardId) {
    const card = await db.cards.get(input.cardId);
    if (card) {
      statementMonth = computeStatementMonth(input.date, card.closingDay);
      dueDate = computeDueDate(statementMonth, card.dueDay, card.dueOffsetMonths);
      // Para cartão, por padrão a competência é o mês da fatura.
      if (!input.refMonth) refMonth = statementMonth;
    }
  }

  await db.transactions.add({
    ...input,
    id,
    createdAt,
    refMonth,
    statementMonth,
    dueDate,
  });

  return id;
}

export async function updateTransaction(txId: string, patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>): Promise<void> {
  const current = await db.transactions.get(txId);
  if (!current) return;

  const merged: Transaction = { ...current, ...patch } as any;

  let statementMonth = merged.statementMonth;
  let dueDate = merged.dueDate;
  let refMonth = merged.refMonth ?? merged.date.slice(0, 7);

  if (merged.method === 'cartao' && merged.cardId) {
    const card = await db.cards.get(merged.cardId);
    if (card) {
      statementMonth = computeStatementMonth(merged.date, card.closingDay);
      dueDate = computeDueDate(statementMonth, card.dueDay, card.dueOffsetMonths);
      // mantém refMonth se o usuário setou manualmente; caso contrário, segue fatura
      if (!patch.refMonth) refMonth = statementMonth;
    }
  } else {
    // fora do cartão: statementMonth não faz sentido
    statementMonth = undefined;
    // refMonth padrão é o mês da data, se não vier manualmente
    if (!patch.refMonth) refMonth = merged.date.slice(0, 7);
  }

  await db.transactions.update(txId, { ...patch, statementMonth, dueDate, refMonth });
}

export async function deleteTransaction(txId: string): Promise<void> {
  await db.transactions.delete(txId);
}

export async function addInstallmentPlan(plan: Omit<InstallmentPlan, 'id' | 'createdAt'>): Promise<string> {
  const id = uuid();
  const createdAt = new Date().toISOString();

  const full: InstallmentPlan = { ...plan, id, createdAt };
  await db.installmentPlans.add(full);

  if (plan.mode === 'gerar_lancamentos') {
    const per = Math.round(plan.totalCents / plan.installments);
    for (let i = 1; i <= plan.installments; i++) {
      const dateISO = shiftMonth(plan.purchaseDate, i - 1);
      await addTransaction({
        date: dateISO,
        description: `${plan.description} (${i}/${plan.installments})`,
        categoryId: plan.categoryId,
        type: 'despesa',
        method: 'cartao',
        amountCents: i === plan.installments ? (plan.totalCents - per * (plan.installments - 1)) : per,
        status: 'pendente',
        cardId: plan.cardId,
        installmentPlanId: id,
        installmentIndex: i,
        installmentCount: plan.installments,
        projected: false,
        notes: '',
      });
    }
  } else {
    // modo projetar_fatura: cria transações "projetadas" para aparecer no dashboard/fatura, mas sem poluir o dia a dia.
    const per = Math.round(plan.totalCents / plan.installments);
    for (let i = 1; i <= plan.installments; i++) {
      const dateISO = shiftMonth(plan.purchaseDate, i - 1);
      const card = await db.cards.get(plan.cardId);
      const statementMonth = card ? computeStatementMonth(dateISO, card.closingDay) : dateISO.slice(0, 7);
      const dueDate = card ? computeDueDate(statementMonth, card.dueDay, card.dueOffsetMonths) : undefined;

      await db.transactions.add({
        id: uuid(),
        createdAt: new Date().toISOString(),
        date: dateISO,
        refMonth: statementMonth,
        description: `${plan.description} (proj. ${i}/${plan.installments})`,
        categoryId: plan.categoryId,
        type: 'despesa',
        method: 'cartao',
        amountCents: i === plan.installments ? (plan.totalCents - per * (plan.installments - 1)) : per,
        status: 'pendente',
        cardId: plan.cardId,
        statementMonth,
        dueDate,
        installmentPlanId: id,
        installmentIndex: i,
        installmentCount: plan.installments,
        projected: true,
        notes: '',
      });
    }
  }

  return id;
}

export async function addFixedBill(bill: Omit<FixedBill, 'id' | 'createdAt'>): Promise<string> {
  const id = uuid();
  const createdAt = new Date().toISOString();
  await db.fixedBills.add({ ...bill, id, createdAt });
  return id;
}

export async function setTransactionStatus(txId: string, status: TxStatus): Promise<void> {
  await db.transactions.update(txId, { status });
}

export async function ensureBillsForMonth(monthKey: string): Promise<void> {
  const bills = await db.fixedBills.toArray();
  const activeBills = bills.filter((b) => b.active);

  for (const b of activeBills) {
    // ✅ Evita duplicar: sempre checa se já existe um tx gerado para este mês (refMonth)
    const existing = await db.transactions
      .where('refMonth')
      .equals(monthKey)
      .and((t) => t.fixedBillId === b.id)
      .first();

    if (existing) continue;

    // ✅ CARTÃO: gerar data de compra correta para cair no statementMonth == monthKey
    if (b.method === 'cartao' && b.cardId) {
      const card = await db.cards.get(b.cardId);
      if (!card) continue;

      const purchaseDate = chargeDateForStatementMonth(
        monthKey,
        b.dueDay,         // aqui passa a ser o "dia da cobrança/compra" recorrente
        card.closingDay
      );

      await addTransaction({
        // Não setamos refMonth: o addTransaction calcula e vai cair em monthKey corretamente
        date: purchaseDate,
        description: b.name,
        categoryId: b.categoryId,
        type: b.type as any,
        method: b.method as any,
        amountCents: b.amountCents,
        status: 'pendente',
        cardId: b.cardId,
        fixedBillId: b.id,
        notes: b.notes ?? '',
      });

      continue;
    }

    // ✅ NÃO-CARTÃO: vencimento dentro do próprio mês (competência)
    const dueDate = dueDateForBill(monthKey, b.dueDay);

    await addTransaction({
      refMonth: monthKey,
      date: dueDate, // “data” aqui é a data padrão que aparece se você não mexer
      description: b.name,
      categoryId: b.categoryId,
      type: b.type as any,
      method: b.method as any,
      amountCents: b.amountCents,
      status: 'pendente',
      institution: b.institution,
      dueDate,
      fixedBillId: b.id,
      notes: b.notes ?? '',
    });
  }
}


  function shiftMonth(dateISO: string, add: number): string {
    const y = Number(dateISO.slice(0, 4));
    const m = Number(dateISO.slice(5, 7));
    const d = Number(dateISO.slice(8, 10));
    const total = (y * 12 + (m - 1)) + add;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    const mm = String(nm).padStart(2, '0');
    const dd = String(Math.min(d, 28)).padStart(2, '0');
    return `${ny}-${mm}-${dd}`;
  }
