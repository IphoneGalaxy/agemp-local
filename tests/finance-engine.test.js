const test = require('node:test');
const assert = require('node:assert/strict');

const FinanceEngine = require('../js/finance-engine.js');
const BankDocumentImporter = require('../js/bank-document-importer.js');

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

test('permite quitar somente o principal sem cobrar juros no mesmo lançamento', () => {
    const result = FinanceEngine.calculateLoan({ amount: 5000, interestRate: 20, payments: [
        { date: '2026-09-03', amount: 1000, kind: 'interest_only' },
        { date: '2026-10-03', amount: 5000, kind: 'principal_settlement' }
    ]});
    assert.equal(result.totalInterestReceived, 1000);
    assert.equal(result.totalPrincipalRecovered, 5000);
    assert.equal(result.currentPrincipal, 0);
});

test('registra juros e quitação total no mesmo lançamento sem deixar saldo artificial', () => {
    const result = FinanceEngine.calculateLoan({ amount: 5000, interestRate: 20, payments: [
        { date: '2026-09-03', amount: 6000, kind: FinanceEngine.CLIENT_PAYMENT_KIND.INTEREST_AND_PRINCIPAL_SETTLEMENT }
    ]});
    assert.equal(result.totalInterestReceived, 1000);
    assert.equal(result.totalPrincipalRecovered, 5000);
    assert.equal(result.currentPrincipal, 0);
});

test('lista apenas vínculos explícitos de clientes para regularizar uma operação bancária', () => {
    const links = FinanceEngine.getBankOperationLinks({ bank: bankSource, clients: bankLoanClients });
    assert.equal(links.clientCount, 2);
    assert.equal(links.outstandingPrincipal, 11500);
    assert.equal(links.monthlyInterest, 1495);

    const noLinks = FinanceEngine.getBankOperationLinks({ bank: { id: 'bank-99' }, clients: bankLoanClients });
    assert.equal(noLinks.loans.length, 0);
    assert.equal(noLinks.monthlyInterest, 0);
});

test('usa vencimentos individuais quando o contrato os informa', () => {
    const summary = FinanceEngine.summarizeBankContract({ bank: {
        id: '99', totalInstallments: 3, installmentValue: 1831.75, firstDueDate: '2026-09-03',
        installments: [{ number: 1, dueDate: '2026-09-03' }, { number: 2, dueDate: '2026-10-05' }, { number: 3, dueDate: '2026-11-03' }]
    }});
    assert.equal(summary.forecastDate, '2026-11-03');
});

test('importa contrato 99Pay como rascunho com cronograma individual e sem pagamentos', () => {
    const draft = BankDocumentImporter.parse(`CÉDULA DE CRÉDITO BANCÁRIO Nº. abc99
        Valor Principal*: R$5.043,90 Valor Liberado: R$5.000,00 IOF: R$43,90
        Juros Remuneratórios: Juros pré-fixados de 4,4900 % a.m. exponencial ao mês, equivalente à taxa
        de 69,3935 % a.a. exponencial ao ano
        Custo Efetivo Total (CET) Mensal: 5,0333%
        Custo Efetivo Total (CET) Anual: 80,2713%
        1 03/09/2026 R$1.831,75 2 05/10/2026 R$1.831,75 3 03/11/2026 R$1.831,75
        Data de Emissão desta CÉDULA: 06/08/2026`);
    assert.equal(draft.provider, '99Pay');
    assert.equal(draft.source.receivedAmount, 5000);
    assert.equal(draft.source.financedAmount, 5043.9);
    assert.equal(draft.source.contractRateAnnual, 69.3935);
    assert.equal(draft.source.cetAnnual, 80.2713);
    assert.deepEqual(draft.source.installments.map(item => item.dueDate), ['2026-09-03', '2026-10-05', '2026-11-03']);
    assert.equal(draft.source.importMetadata.importMode, 'draft_review_required');
});

test('importa demonstrativo Santander sem converter movimentações em confirmações', () => {
    const draft = BankDocumentImporter.parse(`Banco Santander (Brasil) S.A. Documento Descritivo de Crédito
        Nr. Contrato: 796465673 Dt. Formalização: 01/06/2026
        Valor Solicitado: 11.500,00 Vlr. Financiado: 11.854,41 IOF: 354,41
        Dt. 1º Vcto: 05/07/2026 Nr. Parcelas: 61
        Custo Efetivo Total CET: Tx. Efet. do contrato:
        1,67 % a.m. 21,92 % a.a. 1,5268 % a.m. 19,9419 % a.a.
        1 05/07/2026 06/07/2026 302,47 297,32 5,15 Movimentações Efetuadas Liquidação`);
    assert.equal(draft.provider, 'Santander');
    assert.equal(draft.source.contractNumber, '796465673');
    assert.equal(draft.source.totalInstallments, 61);
    assert.equal(draft.source.installments.length, 61);
    assert.equal(draft.source.firstDueDate, '2026-07-05');
    assert.equal(draft.source.installmentValue, 302.47);
    assert.equal(draft.source.contractRateAnnual, 19.9419);
    assert.equal(draft.source.cetAnnual, 21.92);
    assert.match(draft.warnings[0], /Nenhum pagamento/);
});

test('migra dados antigos para a versão 3 e vincula registros sem origem ao Capital Próprio', () => {
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

    assert.equal(migrated.schemaVersion, 3);
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

test('monta tabela individual usando vencimentos reais e status financeiro', () => {
    const bank = {
        id: '99', totalInstallments: 3, installmentValue: 1831.75, firstDueDate: '2026-09-03',
        installments: [
            { number: 1, dueDate: '2026-09-03', amount: 1831.75 },
            { number: 2, dueDate: '2026-10-05', amount: 1831.75 },
            { number: 3, dueDate: '2026-11-03', amount: 1831.75 }
        ]
    };
    const schedule = FinanceEngine.buildInstallmentSchedule({ bank, bankPayments: [
        { sourceId: '99', type: 'installment', installmentNumber: 1, status: 'confirmed' },
        { sourceId: '99', type: 'installment', installmentNumber: 2, status: 'withheld_pending_bank' }
    ] });
    assert.deepEqual(schedule.map(item => item.dueDate), ['2026-09-03', '2026-10-05', '2026-11-03']);
    assert.deepEqual(schedule.map(item => item.status), ['confirmed', 'pending_bank', 'open']);
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

test('estima a recuperação de caixa sem esconder o principal ainda exposto', () => {
    const pay99 = {
        id: '99pay', type: 'bank', name: '99Pay', receivedAmount: 5000,
        totalInstallments: 3, installmentValue: 1831.75, firstDueDate: '2026-09-03',
        installments: [
            { number: 1, dueDate: '2026-09-03', amount: 1831.75 },
            { number: 2, dueDate: '2026-10-05', amount: 1831.75 },
            { number: 3, dueDate: '2026-11-03', amount: 1831.75 }
        ]
    };
    const mello = [{ id: 'mello', name: 'Mello', loans: [{
        id: 'mello-99', date: '2026-08-06', amount: 5000, interestRate: 20, sourceId: '99pay', payments: []
    }]}];

    const before = FinanceEngine.calculateOperationRecovery({
        bank: pay99, clients: mello, bankPayments: [], referenceDate: '2026-08-06'
    });
    assert.equal(before.breakEvenDate, '2027-02-06');
    assert.equal(before.outstandingClientPrincipal, 5000);
    assert.equal(before.projectedMonthlyInterest, 1000);
    assert.equal(before.cashProfit, 0);

    const after = FinanceEngine.calculateOperationRecovery({
        bank: pay99,
        clients: [{ ...mello[0], loans: [{ ...mello[0].loans[0], payments: [
            { date: '2026-09-03', amount: 1000, kind: 'interest_only' },
            { date: '2026-10-05', amount: 1000, kind: 'interest_only' },
            { date: '2026-11-03', amount: 1000, kind: 'interest_only' },
            { date: '2026-12-03', amount: 1000, kind: 'interest_only' },
            { date: '2027-01-03', amount: 1000, kind: 'interest_only' },
            { date: '2027-02-03', amount: 1000, kind: 'interest_only' }
        ] }] }],
        bankPayments: pay99.installments.map(item => ({
            id: `p${item.number}`, sourceId: '99pay', date: item.dueDate, amount: item.amount,
            type: 'installment', installmentNumber: item.number, status: 'confirmed'
        })),
        referenceDate: '2027-02-03'
    });
    assert.equal(after.clientReceipts, 6000);
    assert.equal(after.paidToBank, 5495.25);
    assert.equal(after.currentNetCash, 504.75);
    assert.equal(after.cashProfit, 504.75);
    assert.equal(after.ownCapitalStillToRecover, 0);
    assert.equal(after.outstandingClientPrincipal, 5000);
    assert.equal(after.breakEvenDate, '2027-02-03');
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

test('migra registros legacyOrphan de juros para o histórico e não os exporta como pagamentos bancários', () => {
    const migrated = FinanceEngine.migrateData({
        capitalSources: [ownSource, bankSource],
        clients: [],
        fundsTransactions: [],
        bankPayments: [
            { id: 'legacy-installment', date: '2026-07-01', amount: 302.47, sourceId: 'old-bank', type: 'installment', legacyOrphan: true },
            { id: 'legacy-amortization', date: '2026-07-01', amount: 1192.53, sourceId: 'old-bank', type: 'amortization', legacyOrphan: true }
        ]
    });

    assert.equal(migrated.bankPayments.length, 0);
    assert.equal(migrated.historicalInterestAllocations.length, 2);
    assert.equal(FinanceEngine.sumCents(migrated.historicalInterestAllocations, item => item.amount), 149500);
    assert.equal(migrated.historicalInterestAllocations[0].sourceId, bankSource.id);
    assert.equal(FinanceEngine.findIntegrityIssues(migrated).length, 0);
});

test('cria backup JSON canônico sem usar documento externo para confirmar parcelas', () => {
    const backup = FinanceEngine.createBackup({
        capitalSources: [ownSource, bankSource],
        clients: [],
        fundsTransactions: [],
        bankPayments: [{
            id: 'pending-2',
            date: '2026-08-03',
            amount: 302.47,
            sourceId: bankSource.id,
            type: 'installment',
            installmentNumber: 2,
            status: FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK,
            withheldDate: '2026-08-03'
        }]
    });

    assert.equal(backup.exportType, FinanceEngine.EXPORT_TYPE);
    assert.equal(backup.schemaVersion, 3);
    assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(backup.bankPayments[0].status, FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK);
    assert.equal(backup.bankPayments[0].confirmationDate, undefined);
    assert.equal(FinanceEngine.validateBackup(backup).valid, true);

    const confirmed = FinanceEngine.createBackup({
        capitalSources: [ownSource, bankSource],
        clients: [],
        fundsTransactions: [],
        bankPayments: [{
            id: 'confirmed-2',
            date: '2026-08-03',
            amount: 302.47,
            sourceId: bankSource.id,
            type: 'installment',
            installmentNumber: 2,
            status: FinanceEngine.BANK_PAYMENT_STATUS.CONFIRMED,
            confirmationDate: '2026-08-06'
        }]
    });
    assert.equal(confirmed.bankPayments[0].confirmationSource, 'manual');
});

test('backup e restauração preservam o cenário completo 99Pay → Mello sem confirmar parcelas', () => {
    const original = {
        capitalSources: [ownSource, {
            id: 'bank-99pay',
            type: 'bank',
            name: '99Pay',
            contractNumber: 'abc99',
            receivedAmount: 5000,
            financedAmount: 5043.9,
            iofAmount: 43.9,
            monthlyRate: 4.49,
            contractRateAnnual: 69.3935,
            cetMonthly: 5.0333,
            cetAnnual: 80.2713,
            totalInstallments: 3,
            installmentValue: 1831.75,
            totalToPay: 5495.25,
            installments: [
                { number: 1, dueDate: '2026-09-03', amount: 1831.75 },
                { number: 2, dueDate: '2026-10-05', amount: 1831.75 },
                { number: 3, dueDate: '2026-11-03', amount: 1831.75 }
            ],
            importMetadata: { provider: '99Pay', importMode: 'draft_review_required' }
        }],
        clients: [{ id: 'mello', name: 'Mello', loans: [{
            id: 'mello-99', date: '2026-08-06', amount: 5000, interestRate: 20, sourceId: 'bank-99pay',
            payments: [{ id: 'mello-sep', date: '2026-09-03', amount: 1000, kind: 'interest_only' }]
        }]}],
        fundsTransactions: [{ id: 'own-complement', date: '2026-09-03', amount: -831.75, sourceId: ownSource.id }],
        bankPayments: [{
            id: '99-first', date: '2026-09-03', amount: 1831.75, sourceId: 'bank-99pay', type: 'installment',
            installmentNumber: 1, status: 'withheld_pending_bank',
            fundingBreakdown: [{ sourceId: 'bank-99pay', amount: 1000 }, { sourceId: ownSource.id, amount: 831.75, fundsTransactionId: 'own-complement' }]
        }]
    };

    const restored = FinanceEngine.migrateData(JSON.parse(JSON.stringify(FinanceEngine.createBackup(original))));
    const bank = restored.capitalSources.find(source => source.id === 'bank-99pay');
    const loan = restored.clients[0].loans[0];

    assert.deepEqual(bank.installments.map(item => [item.number, item.dueDate, item.amount]), [[1, '2026-09-03', 1831.75], [2, '2026-10-05', 1831.75], [3, '2026-11-03', 1831.75]]);
    assert.equal(bank.importMetadata.provider, '99Pay');
    assert.equal(bank.importMetadata.importMode, 'confirmed');
    assert.equal(bank.contractRateAnnual, 69.3935);
    assert.equal(bank.cetAnnual, 80.2713);
    assert.equal(loan.sourceId, bank.id);
    assert.equal(loan.payments[0].kind, FinanceEngine.CLIENT_PAYMENT_KIND.INTEREST_ONLY);
    assert.equal(restored.bankPayments[0].status, FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK);
    assert.equal(restored.bankPayments[0].confirmationDate, undefined);
    assert.equal(FinanceEngine.calculateOperationRecovery({ bank, clients: restored.clients, bankPayments: restored.bankPayments, referenceDate: '2026-09-04' }).outstandingClientPrincipal, 5000);
});

test('backup preserva cronograma Santander e quitação exclusiva do principal', () => {
    const backup = FinanceEngine.createBackup({
        capitalSources: [ownSource, { ...bankSource, installments: [{ number: 1, dueDate: '2026-07-05', amount: 302.47 }, { number: 2, dueDate: '2026-08-05', amount: 302.47 }] }],
        clients: [{ id: 'leal', name: 'Leal', loans: [{
            id: 'leal-santander', date: '2026-06-01', amount: 5000, interestRate: 13, sourceId: bankSource.id,
            payments: [{ id: 'interest', date: '2026-07-05', amount: 650, kind: 'interest_only' }, { id: 'settlement', date: '2026-08-05', amount: 5000, kind: 'principal_settlement' }]
        }]}],
        fundsTransactions: [], bankPayments: []
    });
    const restored = FinanceEngine.migrateData(JSON.parse(JSON.stringify(backup)));
    const loan = restored.clients[0].loans[0];

    assert.deepEqual(restored.capitalSources[1].installments.map(item => item.dueDate), ['2026-07-05', '2026-08-05']);
    assert.equal(loan.payments[1].kind, FinanceEngine.CLIENT_PAYMENT_KIND.PRINCIPAL_SETTLEMENT);
    assert.equal(FinanceEngine.calculateLoan(loan).currentPrincipal, 0);
    assert.equal(FinanceEngine.validateBackup(backup).valid, true);
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

test('preserva pagamento não identificado sem inventar juros ou amortização', () => {
    const loan = {
        id: 'loan-review', amount: 1000, interestRate: 10, sourceId: ownSource.id,
        payments: [{ id: 'payment-review', date: '2026-08-01', amount: 250, kind: FinanceEngine.CLIENT_PAYMENT_KIND.UNIDENTIFIED }]
    };
    const result = FinanceEngine.calculateLoan(loan);
    assert.equal(result.currentPrincipal, 1000);
    assert.equal(result.totalInterestReceived, 0);
    assert.equal(result.totalPrincipalRecovered, 0);
    assert.equal(result.totalUnallocated, 250);
    assert.ok(FinanceEngine.findIntegrityIssues({
        capitalSources: [ownSource], clients: [{ id: 'client-review', name: 'Revisão', loans: [loan] }],
        fundsTransactions: [], bankPayments: []
    }).some(issue => issue.type === 'unidentified-client-payment'));
});

test('reconcilia demonstrativo Santander com cadastro legado sem duplicar a operação', () => {
    const legacySantander = {
        id: 'mdewd3uvf', type: 'bank', name: 'Santander', receivedAmount: 11500,
        totalInstallments: 61, installmentValue: 302.47, startDate: '2026-06-01',
        totalPaidToBank: 3747.96, paidInstallments: 2,
        officialBalanceSnapshots: [{ id: 'official-2026-08-04', date: '2026-08-04', amount: 8766.53 }]
    };
    const imported = {
        type: 'bank', name: 'Santander', receivedAmount: 11500, financedAmount: 11854.41,
        totalInstallments: 61, installmentValue: 302.47, nominalInstallmentValue: 302.47,
        totalToPay: 18450.67, startDate: '2026-06-01', contractNumber: '796465673',
        projectionMode: 'discounted_last_installments', installments: [{ number: 1, nominalAmount: 302.47 }],
        officialBalanceSnapshots: [{ date: '2026-08-06', amount: 8472.78, remainingInstallmentNumbers: FinanceEngine.rangeInclusive(3, 39) }],
        importMetadata: { provider: 'Santander', documentType: 'Demonstrativo Descritivo de Crédito' }
    };

    const match = FinanceEngine.findMatchingBankSource([legacySantander, ownSource], imported);
    assert.equal(match.id, legacySantander.id);
    const merged = FinanceEngine.mergeImportedBankSource(match, imported, { ...imported.importMetadata, importMode: 'confirmed' });
    assert.equal(merged.id, legacySantander.id);
    assert.equal(merged.totalPaidToBank, 3747.96);
    assert.equal(merged.paidInstallments, 2);
    assert.equal(merged.contractNumber, '796465673');
    assert.equal(merged.officialBalanceSnapshots.length, 2);
    assert.equal(merged.officialBalanceSnapshots.at(-1).amount, 8472.78);
    assert.equal(merged.projectionMode, 'discounted_last_installments');
});
