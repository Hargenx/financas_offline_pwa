import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../db/db';
import { Section } from '../ui/Section';
import { uuid } from '../services/finance';
import type { Transaction } from '../domain/types';
import { brlToCents, centsToBrl } from '../lib/money';

const monthMap: Record<string, number> = {
  'Janeiro': 1, 'Fevereiro': 2, 'Março': 3, 'Abril': 4, 'Maio': 5, 'Junho': 6,
  'Julho': 7, 'Agosto': 8, 'Setembro': 9, 'Outubro': 10, 'Novembro': 11, 'Dezembro': 12,
};

export function ImportExport() {
  const [log, setLog] = useState<string>('');

  async function resetAll() {
    const ok = confirm('Apagar TODOS os dados do app (lançamentos, parcelas, cartões, categorias)? Essa ação não pode ser desfeita.');
    if (!ok) return;
    await db.delete();
    location.reload();
  }

  async function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      cards: await db.cards.toArray(),
      categories: await db.categories.toArray(),
      fixedBills: await db.fixedBills.toArray(),
      installmentPlans: await db.installmentPlans.toArray(),
      transactions: await db.transactions.toArray(),
      settings: await db.settings.get('settings'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financas-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    const text = await file.text();
    const payload = JSON.parse(text);

    // cuidado: aqui fazemos um "merge" simples
    if (payload.cards) await db.cards.bulkPut(payload.cards);
    if (payload.categories) await db.categories.bulkPut(payload.categories);
    if (payload.fixedBills) await db.fixedBills.bulkPut(payload.fixedBills);
    if (payload.installmentPlans) await db.installmentPlans.bulkPut(payload.installmentPlans);
    if (payload.transactions) await db.transactions.bulkPut(payload.transactions);
    if (payload.settings?.value) await db.settings.put({ id: 'settings', value: payload.settings.value });

    setLog(`Backup JSON importado com sucesso. Itens: ${payload.transactions?.length ?? 0} transações.`);
  }

  async function exportXlsx() {
    const txs = await db.transactions.toArray();
    const rows = txs.map(t => ({
      Data: t.date,
      Competencia: t.refMonth ?? t.date.slice(0,7),
      Tipo: t.type,
      Meio: t.method,
      Instituicao: t.institution ?? '',
      Cartao: t.cardId ?? '',
      Descricao: t.description,
      Categoria: t.categoryId ?? '',
      Valor: (t.amountCents / 100),
      Status: t.status,
      Vencimento: t.dueDate ?? '',
      FaturaMes: t.statementMonth ?? '',
      Projetado: t.projected ? 'sim' : 'nao'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lancamentos');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financas-export-${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importLegacyExcel(file: File) {
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });

    const settings = await db.settings.get('settings');
    const baseYear = settings?.value.baseYearForLegacySheets ?? 2024;

    let imported = 0;
    let warnings: string[] = [];

    for (const sheetName of wb.SheetNames) {
      // ignora aba vazia
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      // tenta detectar o seu modelo antigo: meses (com ou sem sufixo 25)
      const m = sheetName.match(/^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)(\d{2})?$/);
      if (!m) continue;

      const month = monthMap[m[1]];
      const year = m[2] ? (2000 + Number(m[2])) : baseYear;

      // lê linhas A/B/C como: categoria, entradas, saídas
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const row = rows[i];
        const label = String(row?.[0] ?? '').trim();
        if (!label) continue;

        const entrada = Number(row?.[1] ?? 0);
        const saida = Number(row?.[2] ?? 0);

        if (entrada && Number.isFinite(entrada) && entrada > 0) {
          const monthKey = `${year}-${String(month).padStart(2,'0')}`;
          const tx: Transaction = {
            id: uuid(),
            createdAt: new Date().toISOString(),
            date: `${year}-${String(month).padStart(2,'0')}-01`,
            refMonth: monthKey,
            description: `[IMPORT] ${label}`,
            categoryId: undefined,
            type: 'receita',
            method: 'transferencia',
            institution: 'Outro',
            amountCents: Math.round(entrada * 100),
            status: 'pago',
            notes: 'Importado do Excel (modelo antigo).',
          };
          await db.transactions.add(tx);
          imported++;
        }

        if (saida && Number.isFinite(saida) && saida > 0) {
          const monthKey = `${year}-${String(month).padStart(2,'0')}`;
          const tx: Transaction = {
            id: uuid(),
            createdAt: new Date().toISOString(),
            date: `${year}-${String(month).padStart(2,'0')}-01`,
            refMonth: monthKey,
            description: `[IMPORT] ${label}`,
            categoryId: undefined,
            type: 'despesa',
            method: 'transferencia',
            institution: 'Outro',
            amountCents: Math.round(saida * 100),
            status: 'pago',
            notes: 'Importado do Excel (modelo antigo).',
          };
          await db.transactions.add(tx);
          imported++;
        }
      }
    }

    if (imported === 0) {
      warnings.push('Nenhuma aba de mês (Janeiro..Dezembro) foi detectada. Se sua planilha é diferente, exporte para XLSX e ajuste o importador.');
    }

    setLog(`Importação finalizada. Registros criados: ${imported}.\n${warnings.join('\n')}`);
  }

  async function clearAll() {
    if (!confirm('Isso apaga todos os dados locais do app. Deseja continuar?')) return;
    await db.delete();
    location.reload();
  }

  return (
    <div className="space-y-4">
      <Section title="Backup (recomendado)" subtitle="Gere um arquivo e salve numa pasta do seu Drive local (como backup).">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={exportJson}>Baixar backup JSON</button>
          <label className="btn-secondary cursor-pointer">
            Importar backup JSON
            <input className="hidden" type="file" accept="application/json" onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
          <button className="btn-secondary" onClick={exportXlsx}>Exportar Excel (XLSX)</button>
          <button className="btn-secondary" onClick={resetAll}>Apagar todos os dados do app</button>
        </div>
        {log ? <pre className="mt-3 text-xs text-slate-300 whitespace-pre-wrap">{log}</pre> : null}
      </Section>

      <Section title="Importar sua planilha antiga" subtitle="Importa suas abas (Janeiro..Dezembro e Abril25 etc) como registros agregados por mês.">
        <div className="flex flex-wrap gap-2">
          <label className="btn cursor-pointer">
            Importar Excel (XLSX)
            <input className="hidden" type="file" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && importLegacyExcel(e.target.files[0])} />
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Observação: como sua planilha antiga não tem “gasto diário”, o importador cria lançamentos “mensais agregados”.
          Daqui pra frente você lança diário no app.
        </p>
      </Section>

      <Section title="Zerar dados locais" subtitle="Se quiser começar do zero (não mexe no seu Excel).">
        <button className="btn-secondary" onClick={clearAll}>Apagar tudo</button>
      </Section>
    </div>
  );
}
