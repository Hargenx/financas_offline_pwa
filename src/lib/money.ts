export function brlToCents(input: string): number {
  const raw = input.trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function centsToBrl(cents: number): string {
  const v = (cents / 100);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Variante mais "curta" pra listas (mantém o sinal).
export function centsToBrlCompact(cents: number): string {
  const v = (cents / 100);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return sign + abs.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
