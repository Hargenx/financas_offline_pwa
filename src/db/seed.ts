import { db } from './db';
import type { AppSettings, Card, Category, FixedBill } from '../domain/types';

const defaultCategories: Category[] = [
  { id: 'cat-moradia', name: 'Moradia', kind: 'despesa' },
  { id: 'cat-contas', name: 'Contas', kind: 'despesa' },
  { id: 'cat-alimentacao', name: 'Alimentação', kind: 'despesa' },
  { id: 'cat-transporte', name: 'Transporte', kind: 'despesa' },
  { id: 'cat-saude', name: 'Saúde', kind: 'despesa' },
  { id: 'cat-lazer', name: 'Lazer', kind: 'despesa' },
  { id: 'cat-educacao', name: 'Educação', kind: 'despesa' },
  { id: 'cat-salario', name: 'Salário', kind: 'receita' },
  { id: 'cat-outros', name: 'Outros', kind: 'ambos' },
];

const defaultCards: Card[] = [
  {
    id: 'card-santander',
    name: 'Santander',
    // conforme sua regra: fechamento dia 08
    closingDay: 8,
    // vencimento varia por pessoa; deixe configurável (padrão: 15)
    dueDay: 15,
    dueOffsetMonths: 1,
    active: true,
  }
];

// Contas fixas iniciais (você pode editar em Config)
const defaultFixedBills: FixedBill[] = [
  {
    id: 'bill-financiamento',
    createdAt: new Date().toISOString(),
    name: 'Financiamento (imóvel)',
    categoryId: 'cat-moradia',
    amountCents: 340000,
    dueDay: 7,
    type: 'despesa',
    method: 'boleto',
    institution: 'Santander',
    active: true,
    notes: 'Valor pode variar; ajuste no mês se necessário.',
  },
  {
    id: 'bill-condominio',
    createdAt: new Date().toISOString(),
    name: 'Condomínio',
    categoryId: 'cat-moradia',
    amountCents: 60000,
    dueDay: 10,
    type: 'despesa',
    method: 'boleto',
    institution: 'Santander',
    active: true,
    notes: 'Valor pode variar; ajuste no mês se necessário.',
  },
  {
    id: 'bill-luz',
    createdAt: new Date().toISOString(),
    name: 'Luz',
    categoryId: 'cat-contas',
    amountCents: 20000,
    dueDay: 14,
    type: 'despesa',
    method: 'boleto',
    institution: 'Santander',
    active: true,
    notes: 'Valor pode variar; ajuste no mês se necessário.',
  },
  {
    id: 'bill-gas',
    createdAt: new Date().toISOString(),
    name: 'Gás',
    categoryId: 'cat-contas',
    amountCents: 20000,
    dueDay: 5,
    type: 'despesa',
    method: 'boleto',
    institution: 'Santander',
    active: true,
    notes: 'Valor pode variar; ajuste no mês se necessário.',
  },
];

const defaultSettings: AppSettings = {
  baseYearForLegacySheets: 2024,
  currency: 'BRL'
};

export async function ensureSeed(): Promise<void> {
  const settings = await db.settings.get('settings');
  if (!settings) {
    await db.settings.put({ id: 'settings', value: defaultSettings });
  }

  const catCount = await db.categories.count();
  if (catCount === 0) {
    await db.categories.bulkAdd(defaultCategories);
  }

  const cardCount = await db.cards.count();
  if (cardCount === 0) {
    await db.cards.bulkAdd(defaultCards);
  }

  const billCount = await db.fixedBills.count();
  if (billCount === 0) {
    await db.fixedBills.bulkAdd(defaultFixedBills);
  }
}
