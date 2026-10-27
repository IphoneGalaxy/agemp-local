const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = { console, Date, Intl };
for (const file of ['finance-engine', 'projection-engine', 'report-engine', 'excel-report-exporter']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js', `${file}.js`), 'utf8'), sandbox);
const bank = { id: 'bank-a', type: 'bank', name: 'Banco A', receivedAmount: 1000, totalInstallments: 3, installmentValue: 350, totalToPay: 1050, firstDueDate: '2026-11-05' };
const data = { capitalSources: [{ id: 'own-default', type: 'own', name: 'Capital próprio' }, bank], clients: [{ id: 'c1', name: 'Cliente A', loans: [{ id: 'l1', sourceId: bank.id, amount: 1000, interestRate: 10, date: '2026-09-01', payments: [] }] }, { id: 'c2', name: 'Cliente B', loans: [{ id: 'l2', sourceId: 'own-default', amount: 8000, interestRate: 10, date: '2026-09-01', payments: [] }] }], bankPayments: [], fundsTransactions: [] };
const makeReport = filters => sandbox.ReportEngine.buildReport({ data, referenceDate: '2026-10-26', filters });
test('resumo usa o banco selecionado, sem incluir o capital de outra origem', () => {
 const report = makeReport({ sourceIds: ['bank-a'] });
 assert.equal(report.sheets.Resumo[0]['Total originalmente emprestado'], 1000);
 assert.equal(report.sheets['Empréstimos'].length, 1);
 assert.equal(report.context.sourceLabel, 'Banco A');
});
test('período limita vencimentos e projeções sem excluir contratos anteriores', () => {
 const report = makeReport({ sourceIds: ['bank-a'], startDate: '2026-12-01', endDate: '2026-12-31' });
 assert.equal(report.sheets['Empréstimos'].length, 1);
 assert.ok(report.sheets['Parcelas bancárias'].length > 0);
 assert.ok(report.sheets['Parcelas bancárias'].every(row => row.Vencimento.startsWith('2026-12')));
 assert.ok(report.sheets['Projeções'].every(row => row.Mês === '2026-12'));
 assert.throws(() => makeReport({ startDate: '2026-12-01', endDate: '2026-11-01' }), /data inicial/);
});
test('desativar estimativas remove indicadores projetados do resumo e dos bancos', () => {
 const report = makeReport({ includeEstimated: false });
 assert.equal(report.sheets.Projeções, undefined);
 assert.equal(report.sheets.Resumo[0]['Custo bancário projetado'], undefined);
 assert.equal(report.sheets['Operações bancárias'][0]['Total final projetado'], undefined);
});
test('Excel real preserva estilos, links, fórmulas e unidades financeiras', () => {
 const libSandbox = { console };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/vendor/xlsx-js-style-1.2.0.min.js'), 'utf8'), libSandbox);
 const XLSX = libSandbox.XLSX;
 const wb = sandbox.ExcelReportExporter.buildWorkbook({ report: makeReport({ sourceIds: ['bank-a'] }), XLSX });
 const output = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
 const restored = XLSX.read(output, { type: 'buffer', cellStyles: true, cellNF: true });
 assert.equal(restored.Sheets.Resumo.A1.s.fgColor?.rgb || restored.Sheets.Resumo.A1.s.fill?.fgColor?.rgb, '183153');
 assert.equal(restored.Sheets.Resumo.A8.v, 'Data-base');
 assert.equal(restored.Sheets.Resumo.B9.v, 1000);
 assert.ok(Object.values(restored.Sheets.Resumo).some(cell => cell?.l?.Target?.includes('Empréstimos')));
 assert.equal(restored.Sheets['Parcelas bancárias'].B8.v, 1);
 assert.ok(!restored.Sheets['Parcelas bancárias'].B8.z.includes('R$'));
 assert.ok(Object.values(restored.Sheets['Empréstimos']).some(cell => cell?.f?.startsWith('SUM(')));
 if (process.env.REPORT_QA_PATH) fs.writeFileSync(process.env.REPORT_QA_PATH, output);
});
