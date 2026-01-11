import { addMonths, format, parseISO, setDate, startOfMonth } from 'date-fns';

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function toMonthKey(dISO: string): string {
  return dISO.slice(0, 7); // yyyy-mm
}

// Regra simples e configurável:
// Se a compra acontece APÓS o dia de fechamento, cai na próxima fatura.
export function computeStatementMonth(dateISO: string, closingDay: number): string {
  const d = parseISO(dateISO);
  const day = d.getDate();
  const base = startOfMonth(d);
  const month = day > closingDay ? addMonths(base, 1) : base;
  return format(month, 'yyyy-MM');
}

// Por padrão, o vencimento é (statementMonth + dueOffsetMonths) no dia dueDay.
export function computeDueDate(statementMonth: string, dueDay: number, dueOffsetMonths: number): string {
  const base = parseISO(statementMonth + '-01');
  const month = addMonths(base, dueOffsetMonths);
  const withDay = setDate(month, clampDay(dueDay));
  return format(withDay, 'yyyy-MM-dd');
}

export function dueDateForBill(monthKey: string, dueDay: number): string {
  const base = parseISO(monthKey + '-01');
  const withDay = setDate(base, clampDay(dueDay));
  return format(withDay, 'yyyy-MM-dd');
}

function clampDay(day: number): number {
  if (day < 1) return 1;
  if (day > 28) return 28; // evita estouro em fevereiro (simplificação)
  // ✅ simplificação proposital para evitar dias inexistentes (29/30/31)
  return Math.min(Math.max(1, day), 28);
}

// ✅ NOVO:
// Para garantir que uma cobrança recorrente no CARTÃO apareça no mês da FATURA (statementMonth),
// precisamos escolher uma data de compra que gere statementMonth === monthKey.
// Regra (igual ao seu computeStatementMonth):
// - se chargeDay > closingDay => a compra precisa cair no mês ANTERIOR
// - senão => a compra cai no próprio mêsKey
export function chargeDateForStatementMonth(
  statementMonthKey: string, // "YYYY-MM" (mês da fatura)
  chargeDay: number,         // dia da cobrança/compra recorrente
  closingDay: number         // dia de fechamento do cartão
): string {
  const base = parseISO(`${statementMonthKey}-01`);
  const monthForPurchase = chargeDay > closingDay ? addMonths(base, -1) : base;
  const d = setDate(monthForPurchase, clampDay(chargeDay));
  return toISODate(d);
}