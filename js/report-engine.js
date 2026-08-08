(function (root, factory) {
    const finance = typeof module === 'object' && module.exports ? require('./finance-engine.js') : root.FinanceEngine;
    const projection = typeof module === 'object' && module.exports ? require('./projection-engine.js') : root.ProjectionEngine;
    const api = factory(finance, projection);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ReportEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FinanceEngine, ProjectionEngine) {
    'use strict';

    const DEFAULT_SECTIONS = Object.freeze(['summary', 'transactions', 'loans', 'receipts', 'banks', 'installments', 'amortizations', 'projections', 'parameters', 'alerts']);
    const inPeriod = (date, startDate, endDate) => (!startDate || String(date || '') >= startDate) && (!endDate || String(date || '') <= endDate);
    const included = (id, selected) => !Array.isArray(selected) || selected.length === 0 || selected.includes(id);
    const qualityLabel = value => ({ confirmed: 'Confirmado', estimated: 'Estimado', recalculated: 'Recalculado', review: 'Requer revisão' }[value] || value || 'Confirmado');

    const buildReport = ({ data = {}, filters = {}, sections = DEFAULT_SECTIONS, referenceDate } = {}) => {
        const normalized = FinanceEngine.migrateData(data);
        const planning = ProjectionEngine.buildPlanningModel({ ...normalized, referenceDate });
        const selectedSections = new Set(sections?.length ? sections : DEFAULT_SECTIONS);
        const loans = planning.loans.filter(row => included(row.clientId, filters.clientIds) && included(row.sourceId, filters.sourceIds));
        const loanIds = new Set(loans.map(row => row.id));
        const banks = planning.banks.filter(row => included(row.sourceId, filters.sourceIds));
        const bankIds = new Set(banks.map(row => row.sourceId));
        const sheets = {};

        if (selectedSections.has('summary')) sheets.Resumo = [{
            'Data-base': planning.referenceDate,
            'Total originalmente emprestado': planning.overview.originalLent,
            'Principal pendente': loans.reduce((total, row) => total + row.currentPrincipal, 0),
            'Juros recebidos': loans.reduce((total, row) => total + row.interestReceived, 0),
            'Juros mensais esperados': loans.filter(row => row.status === 'active').reduce((total, row) => total + row.monthlyInterest, 0),
            'Total pago aos bancos': banks.reduce((total, row) => total + row.actualPaid, 0),
            'Custo bancário projetado': banks.reduce((total, row) => total + row.projectedCost, 0),
            'Economia projetada': banks.reduce((total, row) => total + row.projectedSavings, 0),
            'Resultado realizado da operação': loans.reduce((total, row) => total + row.interestReceived, 0) - banks.reduce((total, row) => total + row.actualPaid, 0),
            'Inclui projeções': filters.includeEstimated === false ? 'Não' : 'Sim'
        }];

        if (selectedSections.has('loans')) sheets['Empréstimos'] = loans.map(row => ({
            Cliente: row.clientName, Empréstimo: row.id, Data: row.loanDate, Origem: row.sourceName,
            'Valor original': row.originalPrincipal, 'Taxa mensal (%)': normalized.clients.flatMap(client => client.loans || []).find(loan => loan.id === row.id)?.interestRate || 0,
            'Juros recebidos': row.interestReceived, 'Principal recuperado': row.principalRecovered,
            'Principal pendente': row.currentPrincipal, 'Progresso dos juros (%)': row.milestoneProgress / 100,
            'Falta para 100%': row.pendingToMilestone, 'Previsão de 100%': row.projectedMilestoneDate,
            Situação: row.status === 'paid_off' ? 'Quitado' : 'Ativo', Qualidade: qualityLabel(row.dataQuality)
        }));

        if (selectedSections.has('receipts') || selectedSections.has('transactions')) {
            const receipts = [];
            normalized.clients.forEach(client => (client.loans || []).forEach(loan => {
                if (!loanIds.has(loan.id)) return;
                const calculated = FinanceEngine.calculateLoan(loan);
                calculated.processedPayments.forEach(payment => {
                    if (!inPeriod(payment.date, filters.startDate, filters.endDate)) return;
                    receipts.push({
                        Data: payment.date, Cliente: client.name, Empréstimo: loan.id,
                        Origem: normalized.capitalSources.find(source => source.id === loan.sourceId)?.name || '',
                        Tipo: payment.kind, 'Valor recebido': payment.amount, Juros: payment.interestPaid,
                        Principal: payment.amortized, 'Não classificado': payment.unallocated,
                        Qualidade: payment.kind === FinanceEngine.CLIENT_PAYMENT_KIND.UNIDENTIFIED || payment.unallocated > 0 ? 'Requer revisão' : 'Confirmado'
                    });
                });
            }));
            if (selectedSections.has('receipts')) sheets.Recebimentos = receipts;
            if (selectedSections.has('transactions')) {
                const funds = normalized.fundsTransactions.filter(row => included(row.sourceId, filters.sourceIds) && inPeriod(row.date, filters.startDate, filters.endDate)).map(row => ({
                    Data: row.date, Entidade: normalized.capitalSources.find(source => source.id === row.sourceId)?.name || '',
                    Tipo: 'Capital próprio', Valor: row.amount, Juros: 0, Principal: 0, Banco: '', Qualidade: 'Confirmado', Observações: row.description || ''
                }));
                const bankMovements = normalized.bankPayments.filter(row => bankIds.has(row.sourceId) && inPeriod(row.date, filters.startDate, filters.endDate)).map(row => ({
                    Data: row.date, Entidade: normalized.capitalSources.find(source => source.id === row.sourceId)?.name || '',
                    Tipo: row.type, Valor: -Math.abs(Number(row.amount || 0)), Juros: 0, Principal: 0, Banco: row.sourceId,
                    Qualidade: row.status === FinanceEngine.BANK_PAYMENT_STATUS.SCHEDULED ? 'Estimado' : 'Confirmado', Observações: row.description || ''
                }));
                sheets['Movimentações'] = [...receipts.map(row => ({
                    Data: row.Data, Entidade: row.Cliente, Tipo: row.Tipo, Valor: row['Valor recebido'], Juros: row.Juros,
                    Principal: row.Principal, Banco: row.Origem, Qualidade: row.Qualidade, Observações: ''
                })), ...funds, ...bankMovements].sort((left, right) => String(left.Data).localeCompare(String(right.Data)));
            }
        }

        if (selectedSections.has('banks')) sheets['Operações bancárias'] = banks.map(row => {
            const bank = normalized.capitalSources.find(source => source.id === row.sourceId) || {};
            return {
                Banco: row.bankName, 'Valor liberado': bank.receivedAmount || 0, 'Valor financiado': bank.financedAmount || 0,
                IOF: bank.iofAmount || 0, 'Taxa contratual mensal (%)': bank.contractRateMonthly || bank.monthlyRate || 0,
                'CET mensal (%)': bank.cetMonthly || 0, 'Parcela nominal': bank.nominalInstallmentValue || bank.installmentValue || 0,
                'Total original': bank.totalToPay || 0, 'Pago confirmado': row.actualPaid,
                'Saldo oficial': row.latestOfficialBalance, 'Data do saldo': row.latestOfficialBalanceDate,
                'Total final projetado': row.projectedFinalPaid, 'Custo projetado': row.projectedCost,
                'Economia projetada': row.projectedSavings, 'Quitação estimada': row.bankPaidDate,
                'Resultado positivo': row.positiveDate, 'Livre após quitação': row.freeMonthlyAfterPayoff,
                Qualidade: qualityLabel(row.quality)
            };
        });

        if (selectedSections.has('installments')) sheets['Parcelas bancárias'] = normalized.capitalSources.filter(bank => bank.type === 'bank' && bankIds.has(bank.id)).flatMap(bank =>
            FinanceEngine.buildInstallmentSchedule({ bank, bankPayments: normalized.bankPayments }).map(item => ({
                Banco: bank.name, Parcela: item.number, Vencimento: item.dueDate,
                'Valor nominal': item.nominalAmount ?? item.amount, 'Valor presente': item.presentValue ?? '',
                Situação: item.status, Qualidade: item.quality || 'Confirmado'
            }))
        );

        if (selectedSections.has('amortizations')) sheets['Amortizações'] = normalized.bankPayments.filter(payment => payment.type === 'amortization' && bankIds.has(payment.sourceId) && inPeriod(payment.date, filters.startDate, filters.endDate)).map(payment => ({
            Data: payment.date, Banco: normalized.capitalSources.find(source => source.id === payment.sourceId)?.name || '',
            'Valor pago': payment.amount, 'Parcelas eliminadas': FinanceEngine.getPaymentInstallmentNumbers(payment).join(', '),
            'Valor nominal eliminado': payment.nominalAmount || 0, Desconto: payment.discountAmount || 0,
            'Origem do dinheiro': FinanceEngine.getFundingBreakdown(payment).map(part => normalized.capitalSources.find(source => source.id === part.sourceId)?.name || part.sourceId).join(' + '),
            Qualidade: 'Confirmado'
        }));

        if (selectedSections.has('projections') && filters.includeEstimated !== false) sheets['Projeções'] = banks.flatMap(row => row.timeline.map(month => ({
            Mês: month.month, Banco: row.bankName, 'Juros esperados': month.clientInterest,
            'Parcela normal': month.normalInstallment, Amortização: month.amortization,
            'Complemento próprio': month.ownCapital, Sobra: month.carryover,
            'Parcelas restantes': month.remainingInstallments, 'Resultado acumulado': month.operationResult,
            Marcos: [row.bankPaidDate === month.date ? 'Banco quitado' : '', row.positiveDate === month.date ? 'Operação positiva' : ''].filter(Boolean).join('; '),
            Qualidade: 'Estimado'
        })));

        if (selectedSections.has('parameters')) sheets['Parâmetros'] = normalized.capitalSources.filter(bank => bank.type === 'bank' && bankIds.has(bank.id)).map(bank => ({
            Banco: bank.name, 'Modo de projeção': bank.projectionMode,
            'Estratégia de amortização': bank.amortizationStrategy,
            'Taxa mensal (%)': bank.contractRateMonthly || bank.monthlyRate || 0,
            'Parcela nominal': bank.nominalInstallmentValue || bank.installmentValue || 0,
            'Carregar sobras': bank.carryoverEnabled === false ? 'Não' : 'Sim',
            'Limite de complemento próprio': bank.monthlyOwnCapitalLimit ?? '',
            'Data-base': planning.referenceDate, Fonte: bank.importMetadata?.documentType || 'Cadastro manual'
        }));

        if (selectedSections.has('alerts')) sheets.Alertas = FinanceEngine.findIntegrityIssues(normalized).map(issue => ({
            Tipo: issue.type, Registro: issue.id || '', Origem: issue.sourceId || '', 'Duplicado de': issue.duplicateOf || '',
            Orientação: 'Revisar no aplicativo; nenhum registro foi apagado automaticamente.'
        }));

        return { planning, sheets, rowCount: Object.values(sheets).reduce((total, rows) => total + rows.length, 0), filters, sections: [...selectedSections] };
    };

    return Object.freeze({ DEFAULT_SECTIONS, buildReport, qualityLabel });
});
