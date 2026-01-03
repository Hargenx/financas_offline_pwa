export type MoneyCents = number;

export type PaymentMethod = 'cartao' | 'pix' | 'dinheiro' | 'boleto' | 'transferencia';
export type TxType = 'despesa' | 'receita' | 'transferencia';
export type TxStatus = 'pendente' | 'pago';

export type Category = {
  id: string;
  name: string;
  kind: 'despesa' | 'receita' | 'ambos';
  colorHint?: string;
};

export type Card = {
  id: string;
  name: string; // "Santander"
  closingDay: number; // 1..28/31
  dueDay: number;     // 1..28/31
  dueOffsetMonths: number; // normalmente 1
  active: boolean;
};

export type Transaction = {
  id: string;
  createdAt: string; // ISO
  date: string;      // ISO yyyy-mm-dd (data do pagamento/compra)
  /**
   * Mês de referência (competência). Para cartão, por padrão é o mês da fatura (statementMonth).
   * Para despesas/receitas fora do cartão, por padrão é o mês da data.
   */
  refMonth: string;  // yyyy-mm
  description: string;
  categoryId?: string;
  type: TxType;
  method: PaymentMethod;
  /** Banco/Instituição (para PIX/boletos/transferência/dinheiro). */
  institution?: string;
  amountCents: MoneyCents; // sempre positivo
  status: TxStatus;

  // cartão
  cardId?: string;
  statementMonth?: string; // yyyy-mm (calculado quando method=cartao)
  dueDate?: string;        // yyyy-mm-dd (calculado quando method=cartao, ou manual)
  notes?: string;

  // vínculo com conta fixa (se gerado automaticamente)
  fixedBillId?: string;

  // parcela
  installmentPlanId?: string;
  installmentIndex?: number; // 1..N
  installmentCount?: number; // N
  projected?: boolean; // para parcelas "projetadas" (modo total)
};

export type InstallmentPlan = {
  id: string;
  createdAt: string;
  purchaseDate: string; // yyyy-mm-dd
  description: string;
  categoryId?: string;
  cardId: string;
  totalCents: MoneyCents;
  installments: number;
  mode: 'gerar_lancamentos' | 'projetar_fatura'; // duas formas aceitas
};

export type FixedBill = {
  id: string;
  createdAt: string;
  name: string;
  categoryId?: string;
  amountCents: MoneyCents;
  dueDay: number; // dia do mês
  type: 'despesa' | 'receita';
  method: PaymentMethod;
  institution?: string;
  cardId?: string;
  active: boolean;
  notes?: string;
};

export type AppSettings = {
  baseYearForLegacySheets: number; // importador do Excel antigo (meses sem sufixo)
  currency: 'BRL';
};
