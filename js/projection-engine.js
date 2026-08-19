(function (root, factory) {
    const finance = typeof module === 'object' && module.exports
        ? require('./finance-engine.js')
        : root.FinanceEngine;
    const api = factory(finance);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ProjectionEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FinanceEngine) {
    'use strict';

    const DAY_MS = 86400000;
    const roundMoney = value => FinanceEngine.fromCents(FinanceEngine.toCents(value));
    const isoMonth = value => String(value || '').slice(0, 7);
    const parseDate = value => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
        return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
    };
    const isoDate = value => value ? value.toISOString().slice(0, 10) : null;
    const addMonths = (value, months, preferredDay) => {
        const date = parseDate(value);
        if (!date) return null;
        const day = preferredDay || date.getUTCDate();
        const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(months || 0), 1));
        const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
        result.setUTCDate(Math.min(day, lastDay));
        return isoDate(result);
    };
    const monthsBetween = (from, to) => {
        const start = parseDate(from);
        const end = parseDate(to);
        if (!start || !end || end <= start) return 0;
        return Math.max(0, ((end.getUTCFullYear() - start.getUTCFullYear()) * 12) + end.getUTCMonth() - start.getUTCMonth());
    };
    const lastPaymentDate = loan => [...(loan?.payments || [])]
        .map(payment => payment.date).filter(Boolean).sort().pop() || null;
    const sourceProvider = bank => String(bank?.importMetadata?.provider || bank?.name || '').toLowerCase();

    const analyzeLoan = ({ loan, client, source, referenceDate }) => {
        const result = FinanceEngine.calculateLoan(loan || {});
        const original = roundMoney(loan?.amount || 0);
        const received = roundMoney(result.totalInterestReceived);
        const pendingToMilestone = roundMoney(Math.max(0, original - received));
        const monthlyInterest = roundMoney(result.nextInterest);
        const explicitlyClosed = ['paid_off', 'quitado', 'closed'].includes(String(loan?.status || '').toLowerCase());
        const active = !explicitlyClosed && result.currentPrincipal > 0 && loan?.projectionEnabled !== false;
        const monthsToMilestone = active && monthlyInterest > 0 ? Math.ceil(pendingToMilestone / monthlyInterest) : null;
        const baseDate = referenceDate || FinanceEngine.localIsoDate(new Date());
        const dueDay = parseDate(loan?.firstInterestDueDate || loan?.date)?.getUTCDate() || parseDate(baseDate)?.getUTCDate() || 1;
        const projectedMilestoneDate = active && monthsToMilestone !== null
            ? addMonths(baseDate, Math.max(1, monthsToMilestone), dueDay)
            : null;

        return {
            id: loan?.id,
            clientId: client?.id,
            clientName: client?.name || 'Cliente',
            sourceId: loan?.sourceId,
            sourceName: source?.name || 'Origem não identificada',
            sourceType: source?.type || 'unknown',
            loanDate: loan?.date || null,
            firstInterestDueDate: loan?.firstInterestDueDate || null,
            status: result.currentPrincipal <= 0 || explicitlyClosed ? 'paid_off' : (loan?.status || 'active'),
            projectionEnabled: loan?.projectionEnabled !== false,
            originalPrincipal: original,
            currentPrincipal: result.currentPrincipal,
            principalRecovered: result.totalPrincipalRecovered,
            interestReceived: received,
            monthlyInterest,
            milestoneProgress: original > 0 ? Math.min(100, Number(((received / original) * 100).toFixed(1))) : 0,
            pendingToMilestone,
            monthsToMilestone,
            projectedMilestoneDate,
            lastPaymentDate: lastPaymentDate(loan),
            closedAt: loan?.closedAt || (result.currentPrincipal <= 0 ? lastPaymentDate(loan) : null),
            dataQuality: loan?.needsReview ? 'review' : 'confirmed'
        };
    };

    const linkedLoanRows = ({ bank, clients, referenceDate }) => (clients || []).flatMap(client =>
        (client.loans || []).filter(loan => loan.sourceId === bank.id).map(loan =>
            analyzeLoan({ loan, client, source: bank, referenceDate })
        )
    );

    const presentValue = ({ nominalAmount, dueDate, paymentDate, monthlyRate }) => {
        const months = monthsBetween(paymentDate, dueDate);
        const rate = Math.max(0, Number(monthlyRate || 0)) / 100;
        return roundMoney(Number(nominalAmount || 0) / Math.pow(1 + rate, months));
    };

    const actualBankPaid = ({ bank, bankPayments }) => roundMoney((bankPayments || [])
        .filter(payment => payment.sourceId === bank.id && payment.status !== FinanceEngine.BANK_PAYMENT_STATUS.SCHEDULED)
        .reduce((total, payment) => total + Number(payment.amount || 0), 0));

    const projectFixedBank = ({ bank, clients, bankPayments, referenceDate, projectionMonths = 120 }) => {
        const loanRows = linkedLoanRows({ bank, clients, referenceDate });
        const monthlyInterest = roundMoney(loanRows.filter(row => row.status === 'active').reduce((total, row) => total + row.monthlyInterest, 0));
        const actualInterest = roundMoney(loanRows.reduce((total, row) => total + row.interestReceived, 0));
        const actualPaid = actualBankPaid({ bank, bankPayments });
        const contract = FinanceEngine.summarizeBankContract({ bank, bankPayments });
        const remaining = new Set(contract?.accountingRemainingNumbers || []);
        const base = referenceDate || FinanceEngine.localIsoDate(new Date());
        const timeline = [];
        let interestTotal = actualInterest;
        let bankPaidTotal = actualPaid;
        let result = roundMoney(interestTotal - bankPaidTotal);
        let bankPaidDate = remaining.size === 0 ? base : null;
        let interestPrincipalDate = interestTotal >= Number(bank.receivedAmount || 0) ? base : null;
        let bankCoverageDate = interestTotal >= bankPaidTotal && remaining.size === 0 ? base : null;
        let positiveDate = result > 0 && remaining.size === 0 ? base : null;
        const firstDue = bank.firstDueDate || addMonths(base, 1);
        const dueDay = parseDate(firstDue)?.getUTCDate() || 1;

        for (let index = 0; index < projectionMonths; index += 1) {
            if (bankPaidDate && interestPrincipalDate && bankCoverageDate && positiveDate) break;
            const monthDate = addMonths(base, index + 1, dueDay);
            const dueThisMonth = [...remaining].filter(number => isoMonth(
                bank.installments?.find(item => Number(item.number) === number)?.dueDate || FinanceEngine.getInstallmentDueDate(firstDue, number)
            ) === isoMonth(monthDate));
            const installmentNumbers = dueThisMonth.length ? dueThisMonth : (remaining.size > 0 ? [[...remaining][0]] : []);
            const bankOutflow = roundMoney(installmentNumbers.reduce((total, number) => {
                const item = bank.installments?.find(row => Number(row.number) === Number(number));
                return total + Number(item?.amount ?? bank.installmentValue ?? 0);
            }, 0));
            installmentNumbers.forEach(number => remaining.delete(number));
            const interest = monthlyInterest;
            const complement = roundMoney(Math.max(0, bankOutflow - interest));
            const surplus = roundMoney(Math.max(0, interest - bankOutflow));
            interestTotal = roundMoney(interestTotal + interest);
            bankPaidTotal = roundMoney(bankPaidTotal + bankOutflow);
            result = roundMoney(interestTotal - bankPaidTotal);
            if (!bankPaidDate && remaining.size === 0) bankPaidDate = monthDate;
            if (!interestPrincipalDate && interestTotal >= Number(bank.receivedAmount || 0)) interestPrincipalDate = monthDate;
            if (!bankCoverageDate && remaining.size === 0 && interestTotal >= bankPaidTotal) bankCoverageDate = monthDate;
            if (!positiveDate && remaining.size === 0 && result > 0) positiveDate = monthDate;
            timeline.push({
                date: monthDate, month: isoMonth(monthDate), clientInterest: interest,
                normalInstallment: bankOutflow, amortization: 0, ownCapital: complement,
                carryover: surplus, remainingInstallments: remaining.size,
                bankPaidTotal, interestTotal, operationResult: result,
                installmentNumbers, quality: 'estimated'
            });
        }

        const originalTotal = roundMoney(bank.totalToPay || (Number(bank.totalInstallments || 0) * Number(bank.installmentValue || 0)));
        return {
            sourceId: bank.id, bankName: bank.name, mode: 'fixed_installments',
            actualPaid, actualInterest, monthlyInterest, timeline,
            bankPaidDate, interestPrincipalDate, bankCoverageDate, positiveDate,
            projectedFinalPaid: bankPaidTotal,
            projectedCost: roundMoney(bankPaidTotal - Number(bank.receivedAmount || 0)),
            projectedCostPercent: Number(bank.receivedAmount || 0) > 0 ? Number((((bankPaidTotal - Number(bank.receivedAmount || 0)) / Number(bank.receivedAmount)) * 100).toFixed(2)) : 0,
            projectedSavings: roundMoney(Math.max(0, originalTotal - bankPaidTotal)),
            freeMonthlyAfterPayoff: monthlyInterest,
            ownCapitalProjected: roundMoney(timeline.reduce((total, row) => total + row.ownCapital, 0)),
            linkedLoans: loanRows,
            latestOfficialBalance: contract?.officialBalance,
            latestOfficialBalanceDate: contract?.officialBalanceDate,
            quality: 'estimated'
        };
    };

    const projectDiscountedBank = ({ bank, clients, bankPayments, referenceDate, projectionMonths = 120 }) => {
        const loanRows = linkedLoanRows({ bank, clients, referenceDate });
        const monthlyInterest = roundMoney(loanRows.filter(row => row.status === 'active').reduce((total, row) => total + row.monthlyInterest, 0));
        const actualInterest = roundMoney(loanRows.reduce((total, row) => total + row.interestReceived, 0));
        const actualPaid = actualBankPaid({ bank, bankPayments });
        const contract = FinanceEngine.summarizeBankContract({ bank, bankPayments });
        const remaining = [...(contract?.accountingRemainingNumbers || [])];
        const base = referenceDate || contract?.officialBalanceDate || FinanceEngine.localIsoDate(new Date());
        const firstDue = bank.firstDueDate || base;
        const dueDay = parseDate(firstDue)?.getUTCDate() || 5;
        const rate = Number(bank.contractRateMonthly ?? bank.monthlyRate ?? 0);
        const nominal = Number(bank.nominalInstallmentValue ?? bank.installmentValue ?? 0);
        const timeline = [];
        let carryover = 0;
        let interestTotal = actualInterest;
        let bankPaidTotal = actualPaid;
        let bankPaidDate = remaining.length === 0 ? base : null;
        let interestPrincipalDate = interestTotal >= Number(bank.receivedAmount || 0) ? base : null;
        let bankCoverageDate = remaining.length === 0 && interestTotal >= bankPaidTotal ? base : null;
        let positiveDate = remaining.length === 0 && interestTotal - bankPaidTotal > 0 ? base : null;
        const officialBalance = Number(contract?.officialBalance);
        const usesOfficialBalance = Number.isFinite(officialBalance) && officialBalance > 0;
        let projectedDebt = usesOfficialBalance ? roundMoney(officialBalance) : null;

        for (let index = 0; index < projectionMonths; index += 1) {
            if (bankPaidDate && interestPrincipalDate && bankCoverageDate && positiveDate) break;
            const monthDate = addMonths(base, index + 1, dueDay);
            let budget = roundMoney(monthlyInterest + (usesOfficialBalance ? 0 : carryover));
            let normalInstallment = 0;
            let amortization = 0;
            const paidNumbers = [];
            if (usesOfficialBalance && projectedDebt > 0) {
                projectedDebt = roundMoney(projectedDebt * (1 + (rate / 100)));
                const bankOutflow = Math.min(budget, projectedDebt);
                normalInstallment = Math.min(nominal, bankOutflow);
                amortization = roundMoney(bankOutflow - normalInstallment);
                budget = roundMoney(budget - bankOutflow);
                projectedDebt = roundMoney(projectedDebt - bankOutflow);

                if (remaining.length > 0 && normalInstallment > 0) paidNumbers.push(remaining.shift());
                let allocation = amortization;
                while (remaining.length > 0 && allocation > 0) {
                    const finalNumber = remaining[remaining.length - 1];
                    const item = bank.installments?.find(row => Number(row.number) === finalNumber);
                    const dueDate = item?.dueDate || FinanceEngine.getInstallmentDueDate(firstDue, finalNumber);
                    const quote = presentValue({ nominalAmount: item?.nominalAmount || nominal, dueDate, paymentDate: monthDate, monthlyRate: rate });
                    if (quote > allocation) break;
                    allocation = roundMoney(allocation - quote);
                    paidNumbers.push(finalNumber);
                    remaining.pop();
                }
                if (projectedDebt <= 0.01) {
                    projectedDebt = 0;
                    paidNumbers.push(...remaining);
                    remaining.length = 0;
                }
            } else if (remaining.length > 0) {
                const normalNumber = remaining.shift();
                normalInstallment = Math.min(nominal, budget);
                budget = roundMoney(budget - normalInstallment);
                paidNumbers.push(normalNumber);
                while (remaining.length > 0) {
                    const finalNumber = remaining[remaining.length - 1];
                    const item = bank.installments?.find(row => Number(row.number) === finalNumber);
                    const dueDate = item?.dueDate || FinanceEngine.getInstallmentDueDate(firstDue, finalNumber);
                    const quote = presentValue({ nominalAmount: item?.nominalAmount || nominal, dueDate, paymentDate: monthDate, monthlyRate: rate });
                    if (quote > budget && remaining.length > 1) break;
                    const paid = remaining.length === 1 ? Math.min(quote, budget) : quote;
                    if (paid <= 0) break;
                    amortization = roundMoney(amortization + paid);
                    budget = roundMoney(budget - paid);
                    paidNumbers.push(finalNumber);
                    remaining.pop();
                    if (remaining.length === 0 || budget <= 0) break;
                }
            }
            carryover = usesOfficialBalance && projectedDebt > 0 ? 0 : Math.max(0, budget);
            const bankOutflow = roundMoney(normalInstallment + amortization);
            interestTotal = roundMoney(interestTotal + monthlyInterest);
            bankPaidTotal = roundMoney(bankPaidTotal + bankOutflow);
            const operationResult = roundMoney(interestTotal - bankPaidTotal);
            if (!bankPaidDate && remaining.length === 0) bankPaidDate = monthDate;
            if (!interestPrincipalDate && interestTotal >= Number(bank.receivedAmount || 0)) interestPrincipalDate = monthDate;
            if (!bankCoverageDate && remaining.length === 0 && interestTotal >= bankPaidTotal) bankCoverageDate = monthDate;
            if (!positiveDate && remaining.length === 0 && operationResult > 0) positiveDate = monthDate;
            timeline.push({
                date: monthDate, month: isoMonth(monthDate), clientInterest: monthlyInterest,
                normalInstallment, amortization, ownCapital: 0, carryover,
                remainingInstallments: remaining.length, bankPaidTotal, interestTotal,
                operationResult, installmentNumbers: paidNumbers, quality: 'estimated'
            });
        }

        const originalTotal = roundMoney(bank.totalToPay || (Number(bank.totalInstallments || 0) * nominal));
        return {
            sourceId: bank.id, bankName: bank.name, mode: 'discounted_last_installments',
            actualPaid, actualInterest, monthlyInterest, timeline,
            bankPaidDate, interestPrincipalDate, bankCoverageDate, positiveDate,
            projectedFinalPaid: bankPaidTotal,
            projectedCost: roundMoney(bankPaidTotal - Number(bank.receivedAmount || 0)),
            projectedCostPercent: Number(bank.receivedAmount || 0) > 0 ? Number((((bankPaidTotal - Number(bank.receivedAmount || 0)) / Number(bank.receivedAmount)) * 100).toFixed(2)) : 0,
            projectedSavings: roundMoney(Math.max(0, originalTotal - bankPaidTotal)),
            freeMonthlyAfterPayoff: monthlyInterest,
            ownCapitalProjected: 0,
            linkedLoans: loanRows,
            latestOfficialBalance: contract?.officialBalance,
            latestOfficialBalanceDate: contract?.officialBalanceDate,
            quality: contract?.officialBalance !== null ? 'recalculated' : 'estimated'
        };
    };

    const projectBank = input => {
        const provider = sourceProvider(input.bank);
        const mode = input.bank?.projectionMode || (provider.includes('santander') ? 'discounted_last_installments' : 'fixed_installments');
        return mode === 'discounted_last_installments' ? projectDiscountedBank(input) : projectFixedBank(input);
    };

    const buildPlanningModel = ({ clients = [], capitalSources = [], bankPayments = [], fundsTransactions = [], referenceDate } = {}) => {
        const date = referenceDate || FinanceEngine.localIsoDate(new Date());
        const loanRows = clients.flatMap(client => (client.loans || []).map(loan => analyzeLoan({
            loan, client, source: capitalSources.find(source => source.id === loan.sourceId), referenceDate: date
        })));
        const bankRows = capitalSources.filter(source => source.type === 'bank').map(bank => projectBank({
            bank, clients, bankPayments, referenceDate: date
        }));
        const milestones = [];
        loanRows.filter(row => row.projectedMilestoneDate).forEach(row => milestones.push({
            date: row.projectedMilestoneDate, type: 'loan_interest_100', title: `${row.clientName} (${row.sourceName}): juros atingem 100%`, entityId: row.id
        }));
        bankRows.forEach(row => {
            if (row.bankPaidDate) milestones.push({ date: row.bankPaidDate, type: 'bank_paid', title: `${row.bankName}: banco quitado`, entityId: row.sourceId });
            if (row.interestPrincipalDate) milestones.push({ date: row.interestPrincipalDate, type: 'interest_principal', title: `${row.bankName}: juros atingem o valor liberado`, entityId: row.sourceId });
            if (row.positiveDate) milestones.push({ date: row.positiveDate, type: 'positive', title: `${row.bankName}: operação positiva`, entityId: row.sourceId });
        });
        milestones.sort((left, right) => String(left.date).localeCompare(String(right.date)));

        const totalPaidToBanks = roundMoney(bankRows.reduce((total, row) => total + row.actualPaid, 0));
        const actualInterest = roundMoney(loanRows.reduce((total, row) => total + row.interestReceived, 0));
        const outstandingPrincipal = roundMoney(loanRows.reduce((total, row) => total + row.currentPrincipal, 0));
        const projectedBankPaid = roundMoney(bankRows.reduce((total, row) => total + row.projectedFinalPaid, 0));
        return {
            generatedAt: new Date().toISOString(), referenceDate: date, loans: loanRows, banks: bankRows, milestones,
            overview: {
                originalLent: roundMoney(loanRows.reduce((total, row) => total + row.originalPrincipal, 0)),
                outstandingPrincipal,
                interestReceived: actualInterest,
                expectedMonthlyInterest: roundMoney(loanRows.filter(row => row.status === 'active').reduce((total, row) => total + row.monthlyInterest, 0)),
                totalPaidToBanks,
                officialBankBalance: roundMoney(bankRows.reduce((total, row) => total + Number(row.latestOfficialBalance || 0), 0)),
                projectedBankPaid,
                projectedBankCost: roundMoney(bankRows.reduce((total, row) => total + row.projectedCost, 0)),
                projectedSavings: roundMoney(bankRows.reduce((total, row) => total + row.projectedSavings, 0)),
                realizedOperationResult: roundMoney(actualInterest - totalPaidToBanks),
                projectedOperationResult: roundMoney(loanRows.reduce((total, row) => total + row.interestReceived, 0) - projectedBankPaid),
                freeMonthlyAfterPayoff: roundMoney(bankRows.reduce((total, row) => total + row.freeMonthlyAfterPayoff, 0)),
                ownCapitalProjected: roundMoney(bankRows.reduce((total, row) => total + row.ownCapitalProjected, 0)),
                fundsBalance: roundMoney((fundsTransactions || []).reduce((total, row) => total + Number(row.amount || 0), 0))
            }
        };
    };

    return Object.freeze({ analyzeLoan, presentValue, projectFixedBank, projectDiscountedBank, projectBank, buildPlanningModel, addMonths });
});
