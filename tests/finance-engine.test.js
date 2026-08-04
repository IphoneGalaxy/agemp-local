const test = require('node:test');
const assert = require('node:assert/strict');

const FinanceEngine = require('../js/finance-engine.js');

const ownSource = { id: 'own-default', type: 'own', name: 'Capital Próprio' };
const bankSource = {
    id: 'bank-main',
    type: 'bank',
    name: 'Banco de teste',
    receivedAmount: 11500,
    totalInstallments: 61,
    installmentValue: 302.47,
    totalToPay: 18450.67,
    firstDueDate: '2026-07-05',
    officialBalanceSnapshots: [{
        date: '2026-08-04',
        amount: 8766.53,
        nominalRemaining: 11493.86,
        remainingStart: 2,
        remainingEnd: 39
    }]
};

const bankLoanClients = [
    {
        id: 'client-a',
        name: 'Cliente A',
        loans: [{
            id: 'loan-a',
            date: '2026-06-02',
            amount: 1500,
            interestRate: 13,
            sourceId: bankSource.id,
            payments: [
                { id: 'a-jul', date: '2026-07-01', amount: 195 },
                { id: 'a-aug', date: '2026-08-03', amount: 195 }
            ]
        }]
    },
    {
        id: 'client-b',
        name: 'Cliente B',
        loans: [{
            id: 'loan-b',
            date: '2026-06-01',
            amount: 10000,
            interestRate: 13,
            sourceId: bankSource.id,
            payments: [
                { id: 'b-jul', date: '2026-07-01', amount: 1300 },
                { id: 'b-aug', date: '2026-08-03', amount: 1300 }
            ]
        }]
    }
];

const mixedFundingTransactions = [
    { id: 'own-jul', date: '2026-07-08', amount: -672.78, sourceId: ownSource.id },
    { id: 'own-aug', date: '2026-08-03', amount: -85.18, sourceId: ownSource.id }
];

const reconciledBankPayments = [
    {
        id: 'normal-jul',
        date: '2026-07-05',
        amount: 302.47,
        sourceId: bankSource.id,
        type: 'installment',
        installmentNumber: 1,
        status: 'confirmed',
        fundingBreakdown: [{ sourceId: bankSource.id, amount: 302.47 }]
    },
    {
        id: 'advance-jul',
        date: '2026-07-08',
        amount: 1865.31,
        sourceId: bankSource.id,
        type: 'amortization',
        installmentNumbers: FinanceEngine.rangeInclusive(48, 61),
        nominalAmount: 4234.58,
        discountAmount: 2369.27,
        fundingBreakdown: [
            { sourceId: bankSource.id, amount: 1192.53 },
            { sourceId: ownSource.id, amount: 672.78, fundsTransactionId: 'own-jul' }
        ]
    },
    {
        id: 'normal-aug',
        date: '2026-08-03',
        amount: 302.47,
        sourceId: bankSource.id,
        type: 'installment',
        installmentNumber: 2,
        status: 'withheld_pending_bank',
        fundingBreakdown: [{ sourceId: bankSource.id, amount: 302.47 }]
    },
    {
        id: 'advance-aug',
        date: '2026-08-03',
        amount: 1277.71,
        sourceId: bankSource.id,
        type: 'amortization',
        installmentNumbers: FinanceEngine.rangeInclusive(40, 47),
        nominalAmount: 2419.76,
        discountAmount: 1142.05,
        fundingBreakdown: [
            { sourceId: bankSource.id, amount: 1192.53 },
            { sourceId: ownSource.id, amount: 85.18, fundsTransactionId: 'own-aug' }
        ]
    }
];

test('representa valores monetários em centavos sem artefatos de ponto flutuante', () => {
    assert.equal(FinanceEngine.toCents(18450.670000000002), 1845067);
    assert.equal(FinanceEngine.fromCents(1845067), 18450.67);
    assert.equal(FinanceEngine.toCents('85,18'), 8518);
    assert.equal(FinanceEngine.toCents('1.234,56'), 123456);
});

test('migra dados antigos para a versão 2 e vincula registros sem origem ao Capital Próprio', () => {
    const migrated = FinanceEngine.migrateData({
        fundsTransactions: [{ id: 'fund-1', date: '2026-01-01', amount: 1000 }],
        clients: [{
            id: 'client-legacy',
            name: 'Cliente de teste',
            loans: [{ id: 'loan-legacy', date: '2026-01-02', amount: 500, payments: [] }]
        }],
        capitalSources: [bankSource, ownSource],
        bankPayments: []
    });

    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.fundsTransactions[0].sourceId, ownSource.id);
    assert.equal(migrated.clients[0].loans[0].sourceId, ownSource.id);
    assert.equal(migrated.capitalSources[0].totalToPay, 18450.67);
});

test('soma contratos antigos e explícitos do Capital Próprio no mesmo saldo', () => {
    const clientsBefore = [{
        id: 'client-own',
        name: 'Cliente de teste',
        loans: [
            { id: 'legacy', date: '2026-01-01', amount: 13285, interestRate: 10, payments: [] },
            { id: 'explicit', date: '2026-02-01', amount: 5200, interestRate: 10, sourceId: ownSource.id, payments: [] }
        ]
    }];
    const fundsTransactions = [{ id: 'capital', date: '2026-01-01', amount: 20485, sourceId: ownSource.id }];

    const before = FinanceEngine.getSourceSummary({
        sourceId: ownSource.id,
        capitalSources: [ownSource],
        fundsTransactions,
        clients: clientsBefore,
        bankPayments: []
    });

    const clientsAfter = [{
        ...clientsBefore[0],
        loans: [
            ...clientsBefore[0].loans,
            { id: 'new-loan', date: '2026-08-04', amount: 2000, interestRate: 10, sourceId: ownSource.id, payments: [] }
        ]
    }];
    const after = FinanceEngine.getSourceSummary({
        sourceId: ownSource.id,
        capitalSources: [ownSource],
        fundsTransactions,
        clients: clientsAfter,
        bankPayments: []
    });

    assert.equal(before.outstandingPrincipal, 18485);
    assert.equal(before.available, 2000);
    assert.equal(after.outstandingPrincipal, 20485);
    assert.equal(after.available, 0);
});

test('separa juros de amortização do principal com arredondamento em centavos', () => {
    const result = FinanceEngine.calculateLoan({
        amount: 1000,
        interestRate: 10,
        payments: [
            { id: 'interest', date: '2026-01-01', amount: 100 },
            { id: 'principal', date: '2026-02-01', amount: 600 }
        ]
    });

    assert.equal(result.totalInterestReceived, 200);
    assert.equal(result.totalPrincipalRecovered, 500);
    assert.equal(result.currentPrincipal, 500);
});

test('calcula a opção menor com sobra para o mês seguinte', () => {
    const choice = FinanceEngine.calculateAmortizationChoice({
        interestReceived: 1495,
        installmentAmount: 302.47,
        quoteAmount: 1109.27
    });

    assert.equal(choice.monthlyBase, 1192.53);
    assert.equal(choice.surplus, 83.26);
    assert.equal(choice.ownCapitalRequired, 0);
    assert.equal(choice.totalBankOutflow, 1411.74);
});

test('calcula a opção maior e o complemento exato do Capital Próprio', () => {
    const choice = FinanceEngine.calculateAmortizationChoice({
        interestReceived: 1495,
        installmentAmount: 302.47,
        quoteAmount: 1277.71,
        voluntaryOwnCapital: 100
    });

    assert.equal(choice.monthlyBase, 1192.53);
    assert.equal(choice.automaticComplement, 85.18);
    assert.equal(choice.ownCapitalRequired, 85.18);
    assert.equal(choice.unusedOwnCapitalBudget, 14.82);
    assert.equal(choice.totalBankOutflow, 1580.18);
});

test('consome o fundo bancário uma única vez e não duplica complementos já lançados no caixa', () => {
    const capitalSources = [bankSource, ownSource];
    const bankSummary = FinanceEngine.getSourceSummary({
        sourceId: bankSource.id,
        capitalSources,
        fundsTransactions: mixedFundingTransactions,
        clients: bankLoanClients,
        bankPayments: reconciledBankPayments
    });
    const ownSummary = FinanceEngine.getSourceSummary({
        sourceId: ownSource.id,
        capitalSources,
        fundsTransactions: mixedFundingTransactions,
        clients: bankLoanClients,
        bankPayments: reconciledBankPayments
    });

    assert.equal(bankSummary.clientInterestReceived, 2990);
    assert.equal(bankSummary.bankFunding, 2990);
    assert.equal(bankSummary.interestReserve, 0);
    assert.equal(bankSummary.available, 0);
    assert.equal(ownSummary.manualFunds, -757.96);
    assert.equal(ownSummary.bankFunding, 0);
    assert.equal(ownSummary.available, -757.96);
});

test('separa juros reservados de principal bancário recuperado e reutilizável', () => {
    const source = { ...bankSource, id: 'bank-recovered', receivedAmount: 1000 };
    const summary = FinanceEngine.getSourceSummary({
        sourceId: source.id,
        capitalSources: [source, ownSource],
        fundsTransactions: [],
        clients: [{
            id: 'client-recovered',
            name: 'Cliente de teste',
            loans: [{
                id: 'loan-recovered',
                date: '2026-01-01',
                amount: 1000,
                interestRate: 10,
                sourceId: source.id,
                payments: [{ id: 'payment-recovered', date: '2026-02-01', amount: 200 }]
            }]
        }],
        bankPayments: []
    });

    assert.equal(summary.cashBalance, 200);
    assert.equal(summary.interestReserve, 100);
    assert.equal(summary.available, 100);
});

test('gera os indicadores bancários reconciliados sem tratar principal recuperado como lucro', () => {
    const stats = FinanceEngine.calculateGlobalStats({
        clients: bankLoanClients,
        fundsTransactions: mixedFundingTransactions,
        capitalSources: [bankSource, ownSource],
        bankPayments: reconciledBankPayments,
        referenceDate: '2026-08-04'
    });
    const bank = stats.bankDetails.find(item => item.sourceId === bankSource.id);

    assert.equal(bank.interestFromClients, 2990);
    assert.equal(bank.totalPaidToBank, 3747.96);
    assert.equal(bank.reserveBalance, 0);
    assert.equal(bank.remainingDebt, 8766.53);
    assert.equal(stats.committedCapital, 0);
    assert.equal(stats.realProfit, 0);
});

test('resume parcelas confirmadas, pendentes e antecipadas sem dividir valores pela parcela nominal', () => {
    const summary = FinanceEngine.summarizeBankContract({
        bank: bankSource,
        bankPayments: reconciledBankPayments
    });

    assert.deepEqual(summary.confirmedNormalNumbers, [1]);
    assert.deepEqual(summary.pendingNormalNumbers, [2]);
    assert.equal(summary.anticipatedCount, 22);
    assert.deepEqual(summary.anticipatedNumbers, FinanceEngine.rangeInclusive(40, 61));
    assert.equal(summary.bankRemainingCount, 38);
    assert.deepEqual(summary.bankRemainingNumbers, FinanceEngine.rangeInclusive(2, 39));
    assert.equal(summary.accountingRemainingCount, 37);
    assert.deepEqual(summary.accountingRemainingNumbers, FinanceEngine.rangeInclusive(3, 39));
    assert.equal(summary.totalCashPaid, 3747.96);
    assert.equal(summary.confirmedCashPaid, 3445.49);
    assert.equal(summary.amortizationCashPaid, 3143.02);
    assert.equal(summary.anticipatedNominal, 6654.34);
    assert.equal(summary.anticipatedDiscount, 3511.32);
    assert.equal(summary.nextInstallmentNumber, 3);
    assert.equal(summary.nextInstallmentDueDate, '2026-09-05');
    assert.equal(summary.forecastDate, '2029-09-05');
    assert.equal(summary.officialBalance, 8766.53);
    assert.equal(summary.officialBalanceDate, '2026-08-04');
});

test('seleciona dinamicamente as últimas parcelas que ainda não foram resolvidas', () => {
    const selected = FinanceEngine.selectFinalInstallments({
        bank: bankSource,
        bankPayments: reconciledBankPayments,
        count: 8
    });

    assert.deepEqual(selected, FinanceEngine.rangeInclusive(32, 39));
});

test('distribui uma operação mensal entre fundo bancário, complemento e sobra', () => {
    const higher = FinanceEngine.calculateMonthlyBankSettlement({
        reserveAvailable: 1495,
        installmentAmount: 302.47,
        quoteAmount: 1277.71
    });
    const lower = FinanceEngine.calculateMonthlyBankSettlement({
        reserveAvailable: 1495,
        installmentAmount: 302.47,
        quoteAmount: 1109.27
    });

    assert.equal(higher.reserveForInstallment, 302.47);
    assert.equal(higher.reserveForAmortization, 1192.53);
    assert.equal(higher.ownForAmortization, 85.18);
    assert.equal(higher.ownCapitalRequired, 85.18);
    assert.equal(higher.reserveCarryover, 0);
    assert.equal(higher.totalBankOutflow, 1580.18);

    assert.equal(lower.ownCapitalRequired, 0);
    assert.equal(lower.reserveCarryover, 83.26);
    assert.equal(lower.totalBankOutflow, 1411.74);
});

test('detecta pagamentos órfãos e possíveis duplicações sem apagar registros', () => {
    const issues = FinanceEngine.findIntegrityIssues({
        capitalSources: [ownSource, bankSource],
        clients: [],
        fundsTransactions: [],
        bankPayments: [
            { id: 'old-1', date: '2026-07-01', amount: 302.47, sourceId: 'removed-bank', type: 'installment' },
            { id: 'old-2', date: '2026-07-01', amount: 302.47, sourceId: 'removed-bank', type: 'installment' }
        ]
    });

    assert.equal(issues.filter(issue => issue.type === 'orphan-bank-payment').length, 2);
    assert.equal(issues.filter(issue => issue.type === 'possible-duplicate-bank-payment').length, 1);
});

test('preserva juros históricos utilizados fora do extrato bancário', () => {
    const migrated = FinanceEngine.migrateData({
        capitalSources: [ownSource, bankSource],
        clients: [],
        fundsTransactions: [],
        bankPayments: [],
        historicalInterestAllocations: [
            { id: 'interest-jul', date: '2026-07-01', amount: 1495, sourceId: bankSource.id },
            { id: 'interest-aug', date: '2026-08-01', amount: 1495, sourceId: bankSource.id }
        ]
    });

    assert.equal(migrated.historicalInterestAllocations.length, 2);
    assert.equal(FinanceEngine.sumCents(migrated.historicalInterestAllocations, item => item.amount), 299000);
    assert.equal(FinanceEngine.findIntegrityIssues(migrated).length, 0);
});

test('valida o backup antes da importação e resume o conteúdo preservado', () => {
    const valid = FinanceEngine.validateBackup({
        clients: [{ id: 'client-1', name: 'Cliente', loans: [{ id: 'loan-1', amount: 100, payments: [] }] }],
        capitalSources: [{ id: 'own-1', type: 'own', name: 'Capital Próprio' }],
        fundsTransactions: [{ id: 'fund-1', date: '2026-08-01', amount: 100, sourceId: 'own-1' }],
        bankPayments: []
    });

    assert.equal(valid.valid, true);
    assert.deepEqual(valid.summary, {
        clients: 1,
        loans: 1,
        capitalSources: 1,
        fundsTransactions: 1,
        bankPayments: 0
    });

    const invalid = FinanceEngine.validateBackup({ clients: 'não é uma lista' });
    assert.equal(invalid.valid, false);
    assert.match(invalid.errors[0], /clientes/i);
});

test('aceita saldo oficial zero como contrato quitado', () => {
    const summary = FinanceEngine.summarizeBankContract({
        bank: {
            ...bankSource,
            officialBalanceSnapshots: [{
                date: '2026-09-01',
                amount: 0,
                remainingInstallmentNumbers: []
            }]
        },
        bankPayments: []
    });

    assert.equal(summary.officialBalance, 0);
    assert.equal(summary.bankRemainingCount, 0);
    assert.equal(summary.accountingRemainingCount, 0);
    assert.equal(summary.forecastDate, null);
});

test('mantém o vencimento no último dia quando o mês é mais curto', () => {
    assert.equal(FinanceEngine.getInstallmentDueDate('2026-01-31', 2), '2026-02-28');
    assert.equal(FinanceEngine.getInstallmentDueDate('2024-01-31', 2), '2024-02-29');
});
