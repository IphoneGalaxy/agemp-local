const test = require('node:test');
const assert = require('node:assert/strict');

const FinanceEngine = require('../js/finance-engine.js');
const ProjectionEngine = require('../js/projection-engine.js');
const ReportEngine = require('../js/report-engine.js');
const BankDocumentImporter = require('../js/bank-document-importer.js');

const pay99 = {
    id: 'bank-99', type: 'bank', name: '99Pay', receivedAmount: 5000, financedAmount: 5043.9,
    totalInstallments: 3, installmentValue: 1831.75, nominalInstallmentValue: 1831.75, totalToPay: 5495.25,
    firstDueDate: '2026-09-03', projectionMode: 'fixed_installments',
    installments: [
        { number: 1, dueDate: '2026-09-03', amount: 1831.75 },
        { number: 2, dueDate: '2026-10-05', amount: 1831.75 },
        { number: 3, dueDate: '2026-11-03', amount: 1831.75 }
    ]
};
const mello99 = [{ id: 'mello', name: 'Mello', loans: [{
    id: 'mello-99', date: '2026-08-06', firstInterestDueDate: '2026-09-03',
    amount: 5000, interestRate: 20, sourceId: pay99.id, payments: []
}] }];

test('projeta a 99Pay com os quatro marcos e separa o principal do lucro', () => {
    const result = ProjectionEngine.projectBank({ bank: pay99, clients: mello99, bankPayments: [], referenceDate: '2026-08-06' });
    assert.equal(result.bankPaidDate, '2026-11-03');
    assert.equal(result.interestPrincipalDate, '2027-01-03');
    assert.equal(result.bankCoverageDate, '2027-02-03');
    assert.equal(result.positiveDate, '2027-02-03');
    assert.equal(result.projectedFinalPaid, 5495.25);
    assert.equal(result.ownCapitalProjected, 2495.25);
    assert.equal(result.timeline.find(row => row.date === '2027-02-03').operationResult, 504.75);
    assert.equal(result.linkedLoans[0].currentPrincipal, 5000);
});

test('projeta individualmente o marco de 100% e interrompe dívida quitada', () => {
    const mello = ProjectionEngine.analyzeLoan({
        loan: { id: 'mello-old', date: '2025-11-06', amount: 1000, interestRate: 13, payments: [{ date: '2026-08-06', amount: 924, kind: 'interest_only' }] },
        client: { id: 'mello', name: 'Mello' }, source: { id: 'own', name: 'Capital Próprio', type: 'own' }, referenceDate: '2026-08-08'
    });
    const pereira = ProjectionEngine.analyzeLoan({
        loan: { id: 'pereira', date: '2026-01-01', amount: 1000, interestRate: 10, payments: [{ date: '2026-04-01', amount: 1000, kind: 'principal_settlement' }] },
        client: { id: 'pereira', name: 'Pereira' }, source: { id: 'own', name: 'Capital Próprio', type: 'own' }, referenceDate: '2026-08-08'
    });
    assert.equal(mello.interestReceived, 924);
    assert.equal(mello.milestoneProgress, 92.4);
    assert.equal(mello.projectedMilestoneDate.slice(0, 7), '2026-09');
    assert.equal(pereira.status, 'paid_off');
    assert.equal(pereira.projectedMilestoneDate, null);
});

test('preserva a parcela nominal do Santander e importa saldo, abertas e antecipadas', () => {
    const draft = BankDocumentImporter.parseSantander(`Banco Santander (Brasil) S.A.
Documento Descritivo de Crédito Nr. Contrato: 796465673 Data Emissão DDC: 06/08/2026 Dt. Formalização: 01/06/2026
Valor Solicitado: 11.500,00 Vlr. Financiado: 11.854,41 Dívida para Liquidação: 8.472,78 Em: 06/08/2026
IOF: 354,41 Dt. 1º Vcto: 05/07/2026 Nr. Parcelas: 61
Custo Efet Total CET: 1,67 % a.m. 21,92 % a.a. Tx. Efet. do contrato: 1,5268 % a.m. 19,9419 % a.a.
Movimentações Efetuadas
 1 05/07/2026 06/07/2026 302,47 297,32 5,15 302,47 0,00 0,00 0,00 302,47 1,5268 0,00
 40 05/10/2029 03/08/2026 302,47 163,16 5,28 168,44 0,00 0,00 134,03 168,44 1,5268 0,00
PARCELAS A VENCER
 3 05/09/2026 297,92 288,15 9,77 297,92 0,00 0,00 0,00 0,00 1,5268 297,92
 4 05/10/2026 293,44 283,82 9,62 293,44 0,00 0,00 0,00 0,00 1,5268 293,44
RESUMO`);
    assert.equal(draft.source.nominalInstallmentValue, 302.47);
    assert.equal(draft.source.installments.find(item => item.number === 3).presentValue, 297.92);
    assert.equal(draft.source.installments.find(item => item.number === 3).amount, 302.47);
    assert.equal(draft.source.officialBalanceSnapshots[0].amount, 8472.78);
    assert.deepEqual(draft.source.officialBalanceSnapshots[0].remainingInstallmentNumbers, [3, 4]);
    assert.deepEqual(draft.source.documentFindings.anticipatedInstallments.map(item => item.number), [40]);
    assert.equal(draft.source.documentFindings.requiresMovementReview, true);
});

test('projeta o Santander pelo saldo oficial e reproduz a liquidação de referência', () => {
    const santander = {
        id: 'bank-santander', type: 'bank', name: 'Santander', receivedAmount: 11500,
        financedAmount: 11854.41, totalInstallments: 61, nominalInstallmentValue: 302.47,
        installmentValue: 302.47, totalToPay: 18450.67, firstDueDate: '2026-07-05',
        contractRateMonthly: 1.5268, projectionMode: 'discounted_last_installments',
        officialBalanceSnapshots: [{
            date: '2026-08-06', amount: 8472.78,
            remainingInstallmentNumbers: Array.from({ length: 37 }, (_, index) => index + 3)
        }]
    };
    const clients = [{ id: 'mello', name: 'Mello', loans: [{
        id: 'mello-santander', date: '2026-06-01', amount: 11500, interestRate: 13,
        sourceId: santander.id, payments: [
            { date: '2026-07-05', amount: 1495, kind: 'interest_only' },
            { date: '2026-08-05', amount: 1495, kind: 'interest_only' }
        ]
    }] }];
    const bankPayments = [
        { id: 'p1', sourceId: santander.id, type: 'installment', status: 'confirmed', date: '2026-07-06', amount: 302.47, installmentNumber: 1 },
        { id: 'p2', sourceId: santander.id, type: 'installment', status: 'confirmed', date: '2026-08-05', amount: 302.47, installmentNumber: 2 },
        { id: 'a1', sourceId: santander.id, type: 'amortization', status: 'confirmed', date: '2026-08-03', amount: 1865.31, installmentStart: 40, installmentEnd: 52 },
        { id: 'a2', sourceId: santander.id, type: 'amortization', status: 'confirmed', date: '2026-08-04', amount: 1277.71, installmentStart: 53, installmentEnd: 61 }
    ];
    const result = ProjectionEngine.projectBank({ bank: santander, clients, bankPayments, referenceDate: '2026-08-06' });
    assert.equal(result.bankPaidDate, '2027-02-05');
    assert.equal(result.positiveDate, '2027-03-05');
    assert.equal(result.projectedFinalPaid, 12677.71);
    assert.equal(result.projectedCost, 1177.71);
    assert.equal(result.projectedSavings, 5772.96);
});

test('gera relatório configurável sem misturar projeções sem identificação', () => {
    const report = ReportEngine.buildReport({
        data: { schemaVersion: 3, capitalSources: [{ id: 'own-default', type: 'own', name: 'Capital Próprio' }, pay99], clients: mello99, fundsTransactions: [], bankPayments: [] },
        referenceDate: '2026-08-06', sections: ['summary', 'loans', 'banks', 'projections'], filters: { includeEstimated: true }
    });
    assert.deepEqual(Object.keys(report.sheets), ['Resumo', 'Empréstimos', 'Operações bancárias', 'Projeções']);
    assert.ok(report.sheets.Projeções.length >= 6);
    assert.ok(report.sheets.Projeções.every(row => row.Qualidade === 'Estimado'));
    assert.equal(report.sheets['Empréstimos'][0]['Principal pendente'], 5000);
});

test('migração V3 é idempotente e preserva parâmetros de projeção', () => {
    const once = FinanceEngine.migrateData({ capitalSources: [{ id: 'own-default', type: 'own', name: 'Capital Próprio' }, pay99], clients: mello99, fundsTransactions: [], bankPayments: [] });
    const twice = FinanceEngine.migrateData(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice, once);
    assert.equal(twice.schemaVersion, 3);
    assert.equal(twice.capitalSources[1].projectionMode, 'fixed_installments');
    assert.equal(twice.clients[0].loans[0].projectionEnabled, true);
});
