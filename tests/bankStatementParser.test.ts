import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  detectBankColumns,
  AMOUNT_BALANCE_WARNING,
  DESCRIPTION_TIME_WARNING,
  generateBankTransactionFingerprint,
  normaliseBankTransactionRow,
  parseCsvStatement,
  parseXlsxStatement,
  validateBankTransactionRow,
} from '@/lib/banking/statement-parser';

describe('bank statement parser', () => {
  it('uses stable column keys while displaying real headers', () => {
    const csv = [
      'Exported from Example Bank',
      'Account,Current',
      'Date,Description,Reference,Money In,Money Out,Balance',
      '28/04/2026,Sunday giving,SG-1,100.00,,1000.00',
      '29/04/2026,Utilities,INV-9,,25.50,974.50',
    ].join('\n');

    const parsed = parseCsvStatement(csv);
    const detected = detectBankColumns(parsed);

    expect(parsed.hasHeaders).toBe(true);
    expect(parsed.headerRowIndex).toBe(2);
    expect(parsed.columns[0]).toMatchObject({ columnKey: 'col_0', displayName: 'Date' });
    expect(parsed.rows[0]).toMatchObject({ col_0: '28/04/2026', col_1: 'Sunday giving' });
    expect(detected.mapping.date).toBe('col_0');
    expect(detected.mapping.description).toBe('col_1');
    expect(detected.mapping.money_in).toBe('col_3');
    expect(detected.mapping.money_out).toBe('col_4');
    expect(detected.mapping.amountMode).toBe('separate');
    expect(detected.confidence).toBe('high');
  });

  it('generates column labels for headerless files and keeps sample values out of mapping keys', () => {
    const csv = [
      '31Jul2025,18:59,Service Charge,-6.00,13807.70',
      '01Aug2025,09:30,Sunday Giving,125.00,13932.70',
    ].join('\n');

    const parsed = parseCsvStatement(csv);
    const detected = detectBankColumns(parsed);

    expect(parsed.hasHeaders).toBe(false);
    expect(parsed.columns.map((column) => column.displayName)).toEqual(['Column A', 'Column B', 'Column C', 'Column D', 'Column E']);
    expect(parsed.columns.map((column) => column.columnKey)).toEqual(['col_0', 'col_1', 'col_2', 'col_3', 'col_4']);
    expect(detected.mapping.date).toBe('col_0');
    expect(detected.mapping.time).toBe('col_1');
    expect(detected.mapping.description).toBe('col_2');
    expect(detected.mapping.amount).toBe('col_3');
    expect(Object.values(detected.mapping)).not.toContain('31Jul2025');
  });

  it('detects transaction amount, running balance, additional details and empty columns in church bank exports', () => {
    const csv = [
      '31Jul2025,18:59,Service Charge,,Monthly fee,-6.00,13807.70',
      '01Aug2025,09:30,Charity Giving,,Standing order,2500.00,16307.70',
      '02Aug2025,10:15,BAPTIST UNION LOAN,,Loan payment,-230.00,16077.70',
      '03Aug2025,11:45,Donation,,RELATIONAL COMMUNICATION PRACTICE,520.00,16597.70',
    ].join('\n');

    const parsed = parseCsvStatement(csv);
    const detected = detectBankColumns(parsed);
    const row = normaliseBankTransactionRow({
      row: parsed.rows[0],
      rowNumber: 1,
      mapping: detected.mapping,
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
    });

    expect(parsed.columns[3]).toMatchObject({ displayName: 'Column D', detectedType: 'unknown' });
    expect(detected.mapping.date).toBe('col_0');
    expect(detected.mapping.time).toBe('col_1');
    expect(detected.mapping.description).toBe('col_2');
    expect(detected.mapping.additional_description).toBe('col_4');
    expect(detected.mapping.amount).toBe('col_5');
    expect(detected.mapping.balance).toBe('col_6');
    expect(row.money_out_pence).toBe(600);
    expect(row.money_in_pence).toBe(0);
    expect(row.display_description).toBe('Service Charge - Monthly fee');
    expect(row.running_balance_pence).toBe(1380770);
  });

  it('parses XLSX statements and normalises split credit/debit columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Statement');
    sheet.addRow(['Statement export']);
    sheet.addRow(['Date', 'Description', 'Reference', 'Credit', 'Debit', 'Balance']);
    sheet.addRow(['28/04/2026', 'Giving', 'BANKREF', '10.00', '', '200.00']);
    sheet.addRow(['29/04/2026', 'Fees', '', '', '2.50', '197.50']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseXlsxStatement(buffer);
    const detected = detectBankColumns(parsed);

    const income = normaliseBankTransactionRow({
      row: parsed.rows[0],
      rowNumber: 2,
      mapping: detected.mapping,
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
    });
    const payment = normaliseBankTransactionRow({
      row: parsed.rows[1],
      rowNumber: 3,
      mapping: detected.mapping,
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
    });

    expect(parsed.rows).toHaveLength(2);
    expect(income.transaction_date).toBe('2026-04-28');
    expect(income.amount_pence).toBe(1000);
    expect(payment.amount_pence).toBe(-250);
    expect(payment.validation_errors).toEqual([]);
  });

  it('supports signed amount mode, time mapping and DDMMMYYYY dates', () => {
    const parsed = parseCsvStatement('31Jul2025,18:59,Service Charge,-6.00,13807.70');
    const row = normaliseBankTransactionRow({
      row: parsed.rows[0],
      rowNumber: 1,
      mapping: {
        date: 'col_0',
        time: 'col_1',
        description: 'col_2',
        amount: 'col_3',
        amountMode: 'signed',
        balance: 'col_4',
      },
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
    });

    expect(row.transaction_date).toBe('2025-07-31');
    expect(row.transaction_time).toBe('18:59');
    expect(row.amount_pence).toBe(-600);
    expect(row.money_out_pence).toBe(600);
    expect(row.running_balance_pence).toBe(1380770);
    expect(row.validation_status).toBe('valid');
  });

  it('warns when description is mapped to time and amount is mapped as balance', () => {
    const parsed = parseCsvStatement('31Jul2025,18:59,Service Charge,13807.70,13807.70');
    const row = normaliseBankTransactionRow({
      row: parsed.rows[0],
      rowNumber: 1,
      mapping: {
        date: 'col_0',
        description: 'col_1',
        amount: 'col_3',
        amountMode: 'signed',
        balance: 'col_4',
      },
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
    });

    expect(row.validation_warnings).toEqual(expect.arrayContaining([
      DESCRIPTION_TIME_WARNING,
      AMOUNT_BALANCE_WARNING,
    ]));
    expect(row.validation_status).toBe('warning');
  });

  it('includes workspace, account, amount, description, reference and balance in fingerprints', () => {
    const base = {
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
      transactionDate: '2026-04-28',
      amountPence: 1000,
      description: 'Sunday Giving',
      reference: 'ABC',
      runningBalancePence: 120000,
    };

    expect(generateBankTransactionFingerprint(base)).toBe(generateBankTransactionFingerprint({
      ...base,
      description: '  sunday   giving ',
    }));
    expect(generateBankTransactionFingerprint(base)).not.toBe(generateBankTransactionFingerprint({
      ...base,
      workspaceId: 'workspace-b',
    }));
    expect(generateBankTransactionFingerprint(base)).not.toBe(generateBankTransactionFingerprint({
      ...base,
      runningBalancePence: 120100,
    }));
  });

  it('reports invalid rows for missing date, description and amount', () => {
    const row = normaliseBankTransactionRow({
      row: { col_0: '', col_1: '', col_2: '' },
      rowNumber: 4,
      mapping: { date: 'col_0', description: 'col_1', amount: 'col_2', amountMode: 'signed' },
      workspaceId: 'workspace-a',
      bankAccountId: 'bank-a',
    });

    expect(validateBankTransactionRow(row)).toEqual(expect.arrayContaining([
      'Transaction date is missing or invalid.',
      'Description is required.',
      'Transaction amount is zero or missing.',
    ]));
    expect(row.validation_status).toBe('error');
  });
});
