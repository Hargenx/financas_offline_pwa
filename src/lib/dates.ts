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
  return day;
}
