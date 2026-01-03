import Dexie, { type Table } from 'dexie';
import type { AppSettings, Card, Category, FixedBill, InstallmentPlan, Transaction } from '../domain/types';

export class FinanceDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  cards!: Table<Card, string>;
  installmentPlans!: Table<InstallmentPlan, string>;
  fixedBills!: Table<FixedBill, string>;
  settings!: Table<{ id: 'settings'; value: AppSettings }, 'settings'>;

  constructor() {
    super('finance-offline-db');
    this.version(1).stores({
      transactions: 'id, date, type, method, cardId, statementMonth, dueDate, status, createdAt',
      categories: 'id, name, kind',
      cards: 'id, name, active',
      installmentPlans: 'id, purchaseDate, cardId, createdAt',
      fixedBills: 'id, active, dueDay',
      settings: 'id',
    });

    // v2: adiciona refMonth (competência), institution e fixedBillId
    this.version(2)
      .stores({
        transactions: 'id, date, refMonth, type, method, cardId, statementMonth, dueDate, status, createdAt, fixedBillId',
        categories: 'id, name, kind',
        cards: 'id, name, active',
        installmentPlans: 'id, purchaseDate, cardId, createdAt',
        fixedBills: 'id, active, dueDay, type, method',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx.table('transactions').toCollection().modify((t: any) => {
          if (!t.refMonth) {
            t.refMonth = t.method === 'cartao' ? (t.statementMonth ?? String(t.date).slice(0, 7)) : String(t.date).slice(0, 7);
          }
        });

        await tx.table('fixedBills').toCollection().modify((b: any) => {
          if (!b.type) b.type = 'despesa';
          if (!b.method) b.method = 'boleto';
        });
      });
  }
}

export const db = new FinanceDB();
