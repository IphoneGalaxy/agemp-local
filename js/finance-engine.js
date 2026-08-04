(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.FinanceEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 2;
    const DEFAULT_OWN_SOURCE = Object.freeze({
        id: 'own-default',
        type: 'own',
        name: 'Capital Próprio'
    });

    const isMissingSourceId = (sourceId) => sourceId === undefined || sourceId === null || sourceId === '';

    const toCents = (value) => {
        if (typeof value === 'string') {
            const compact = value.trim().replace(/\s/g, '');
            const normalized = compact.includes(',')
                ? compact.replace(/\./g, '').replace(',', '.')
                : compact;
            if (normalized === '') return 0;
            value = normalized;
        }

        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) : 0;
    };

    const fromCents = (value) => Number((Number(value || 0) / 100).toFixed(2));

    const sumCents = (items, selector) => (items || []).reduce((total, item) => {
        const value = selector ? selector(item) : item;
        return total + toCents(value);
    }, 0);

    const getDefaultOwnSourceId = (capitalSources) => {
        const sources = Array.isArray(capitalSources) ? capitalSources : [];
        const preferred = sources.find(source => source.id === DEFAULT_OWN_SOURCE.id && source.type === 'own');
        if (preferred) return preferred.id;

        const firstOwn = sources.find(source => source.type === 'own');
        return firstOwn ? firstOwn.id : DEFAULT_OWN_SOURCE.id;
    };

    const normalizeSourceId = (sourceId, capitalSources) => (
        isMissingSourceId(sourceId) ? getDefaultOwnSourceId(capitalSources) : sourceId
    );

    const belongsToSource = (recordSourceId, targetSourceId, capitalSources) => (
        normalizeSourceId(recordSourceId, capitalSources) === targetSourceId
    );

    const compareIsoDates = (left, right) => String(left || '').localeCompare(String(right || ''));

    const parseIsoDate = (date) => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
        if (!match) return null;
        return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
    };

    const localIsoDate = (date) => {
        const value = date instanceof Date ? date : new Date();
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const addMonths = (dateParts, amount) => {
        const date = new Date(dateParts.year, dateParts.month + amount, 1);
        return { year: date.getFullYear(), month: date.getMonth(), day: 1 };
    };

    const isSameMonth = (dateParts, referenceParts) => Boolean(
        dateParts && referenceParts &&
        dateParts.year === referenceParts.year &&
        dateParts.month === referenceParts.month
    );

    const isBeforeMonth = (dateParts, referenceParts) => Boolean(
        dateParts && referenceParts && (
            dateParts.year < referenceParts.year ||
            (dateParts.year === referenceParts.year && dateParts.month < referenceParts.month)
        )
    );

    const monthLabel = (dateParts, style) => {
        const label = new Date(dateParts.year, dateParts.month, 1)
            .toLocaleString('pt-BR', { month: style || 'short' })
            .replace('.', '');
        return label.charAt(0).toUpperCase() + label.slice(1);
    };

    const calculateInterestCents = (principalCents, interestRate) => {
        const rateBasisPoints = Math.round(Number(interestRate ?? 10) * 100);
        return Math.round((principalCents * rateBasisPoints) / 10000);
    };

    const calculateLoan = (loan) => {
        let principalCents = Math.max(0, toCents(loan?.amount));
        let totalInterestReceivedCents = 0;
        let totalPrincipalRecoveredCents = 0;
        let totalUnallocatedCents = 0;

        const sortedPayments = [...(loan?.payments || [])]
            .map((payment, index) => ({ payment, index }))
            .sort((left, right) => compareIsoDates(left.payment.date, right.payment.date) || left.index - right.index)
            .map(item => item.payment);

        const processedPayments = sortedPayments.map(payment => {
            const paymentCents = Math.max(0, toCents(payment.amount));
            const interestDueCents = calculateInterestCents(principalCents, loan?.interestRate);
            const interestPaidCents = Math.min(paymentCents, interestDueCents);
            const amountAfterInterestCents = Math.max(0, paymentCents - interestPaidCents);
            const principalRecoveredCents = Math.min(principalCents, amountAfterInterestCents);
            const unallocatedCents = Math.max(0, amountAfterInterestCents - principalRecoveredCents);

            principalCents -= principalRecoveredCents;
            totalInterestReceivedCents += interestPaidCents;
            totalPrincipalRecoveredCents += principalRecoveredCents;
            totalUnallocatedCents += unallocatedCents;

            return {
                ...payment,
                amount: fromCents(paymentCents),
                interestPaid: fromCents(interestPaidCents),
                amortized: fromCents(principalRecoveredCents),
                unallocated: fromCents(unallocatedCents),
                balanceAfter: fromCents(principalCents),
                _cents: {
                    amount: paymentCents,
                    interestPaid: interestPaidCents,
                    amortized: principalRecoveredCents,
                    unallocated: unallocatedCents,
                    balanceAfter: principalCents
                }
            };
        });

        const nextInterestCents = calculateInterestCents(principalCents, loan?.interestRate);

        return {
            currentPrincipal: fromCents(principalCents),
            totalInterestReceived: fromCents(totalInterestReceivedCents),
            totalPrincipalRecovered: fromCents(totalPrincipalRecoveredCents),
            totalUnallocated: fromCents(totalUnallocatedCents),
            nextInterest: fromCents(nextInterestCents),
            processedPayments,
            _cents: {
                currentPrincipal: principalCents,
                totalInterestReceived: totalInterestReceivedCents,
                totalPrincipalRecovered: totalPrincipalRecoveredCents,
                totalUnallocated: totalUnallocatedCents,
                nextInterest: nextInterestCents
            }
        };
    };

    const getFundingBreakdown = (bankPayment) => {
        if (Array.isArray(bankPayment?.fundingBreakdown)) return bankPayment.fundingBreakdown;
        if (Array.isArray(bankPayment?.funding)) return bankPayment.funding;
        return [];
    };

    const getSourceSummary = ({
        sourceId,
        capitalSources = [],
        fundsTransactions = [],
        clients = [],
        bankPayments = []
    }) => {
        const source = capitalSources.find(item => item.id === sourceId);
        if (!source) {
            return {
                sourceId,
                available: 0,
                outstandingPrincipal: 0,
                clientInterestReceived: 0,
                clientPrincipalRecovered: 0,
                clientReceipts: 0,
                manualFunds: 0,
                bankFunding: 0
            };
        }

        const linkedTransactions = fundsTransactions.filter(transaction => (
            belongsToSource(transaction.sourceId, sourceId, capitalSources)
        ));
        const transactionIds = new Set(linkedTransactions.map(transaction => transaction.id));
        const manualFundsCents = sumCents(linkedTransactions, transaction => transaction.amount);

        let loansGrantedCents = 0;
        let outstandingPrincipalCents = 0;
        let clientInterestReceivedCents = 0;
        let clientPrincipalRecoveredCents = 0;
        let clientReceiptsCents = 0;

        clients.forEach(client => {
            (client.loans || []).forEach(loan => {
                if (!belongsToSource(loan.sourceId, sourceId, capitalSources)) return;

                const loanResult = calculateLoan(loan);
                loansGrantedCents += toCents(loan.amount);
                outstandingPrincipalCents += loanResult._cents.currentPrincipal;
                clientInterestReceivedCents += loanResult._cents.totalInterestReceived;
                clientPrincipalRecoveredCents += loanResult._cents.totalPrincipalRecovered;
                clientReceiptsCents += loanResult.processedPayments.reduce((total, payment) => (
                    total + payment._cents.amount
                ), 0);
            });
        });

        let bankFundingCents = 0;
        bankPayments.forEach(payment => {
            getFundingBreakdown(payment).forEach(part => {
                if (!belongsToSource(part.sourceId, sourceId, capitalSources)) return;

                const linkedTransactionId = part.fundsTransactionId || part.transactionId;
                if (linkedTransactionId && transactionIds.has(linkedTransactionId)) return;
                bankFundingCents += toCents(part.amount);
            });
        });

        const baseCapitalCents = source.type === 'bank' ? toCents(source.receivedAmount) : 0;
        const availableCents = baseCapitalCents + manualFundsCents + clientReceiptsCents - loansGrantedCents - bankFundingCents;

        return {
            sourceId,
            type: source.type,
            name: source.name,
            available: fromCents(availableCents),
            outstandingPrincipal: fromCents(outstandingPrincipalCents),
            loansGranted: fromCents(loansGrantedCents),
            clientInterestReceived: fromCents(clientInterestReceivedCents),
            clientPrincipalRecovered: fromCents(clientPrincipalRecoveredCents),
            clientReceipts: fromCents(clientReceiptsCents),
            manualFunds: fromCents(manualFundsCents),
            bankFunding: fromCents(bankFundingCents),
            _cents: {
                available: availableCents,
                outstandingPrincipal: outstandingPrincipalCents,
                loansGranted: loansGrantedCents,
                clientInterestReceived: clientInterestReceivedCents,
                clientPrincipalRecovered: clientPrincipalRecoveredCents,
                clientReceipts: clientReceiptsCents,
                manualFunds: manualFundsCents,
                bankFunding: bankFundingCents
            }
        };
    };

    const getCapitalBalance = (input) => getSourceSummary(input).available;

    const calculateAmortizationChoice = ({
        interestReceived = 0,
        installmentAmount = 0,
        carryover = 0,
        quoteAmount = 0,
        voluntaryOwnCapital = 0
    }) => {
        const interestCents = toCents(interestReceived);
        const installmentCents = toCents(installmentAmount);
        const carryoverCents = toCents(carryover);
        const quoteCents = toCents(quoteAmount);
        const voluntaryOwnCents = toCents(voluntaryOwnCapital);
        const monthlyBaseCents = Math.max(0, interestCents + carryoverCents - installmentCents);
        const automaticComplementCents = Math.max(0, quoteCents - monthlyBaseCents);
        const surplusCents = Math.max(0, monthlyBaseCents - quoteCents);
        const unusedOwnBudgetCents = Math.max(0, voluntaryOwnCents - automaticComplementCents);

        return {
            interestReceived: fromCents(interestCents),
            installmentAmount: fromCents(installmentCents),
            carryover: fromCents(carryoverCents),
            monthlyBase: fromCents(monthlyBaseCents),
            quoteAmount: fromCents(quoteCents),
            automaticComplement: fromCents(automaticComplementCents),
            voluntaryOwnCapitalBudget: fromCents(voluntaryOwnCents),
            ownCapitalRequired: fromCents(automaticComplementCents),
            unusedOwnCapitalBudget: fromCents(unusedOwnBudgetCents),
            withinPlannedBudget: automaticComplementCents <= voluntaryOwnCents,
            surplus: fromCents(surplusCents),
            totalBankOutflow: fromCents(installmentCents + quoteCents)
        };
    };

    const calculateGlobalStats = ({
        clients = [],
        fundsTransactions = [],
        capitalSources = [],
        bankPayments = [],
        referenceDate
    }) => {
        const todayParts = parseIsoDate(referenceDate || localIsoDate(new Date())) || parseIsoDate(localIsoDate(new Date()));
        const nextMonthParts = addMonths(todayParts, 1);
        const bankStats = {};

        capitalSources.filter(source => source.type === 'bank').forEach(source => {
            bankStats[source.id] = {
                sourceId: source.id,
                name: source.name,
                interestFromClientsCents: 0,
                amortizedFromClientsCents: 0,
                outstandingClientPrincipalCents: 0,
                receivedAmountCents: toCents(source.receivedAmount),
                totalToPayCents: toCents(source.totalToPay),
                totalPaidToBankCents: 0
            };
        });

        bankPayments.forEach(payment => {
            if (bankStats[payment.sourceId]) {
                bankStats[payment.sourceId].totalPaidToBankCents += toCents(payment.amount);
            }
        });

        let totalLentCents = 0;
        let totalExpectedThisMonthCents = 0;
        let totalPaidThisMonthCents = 0;
        let totalExpectedNextMonthCents = 0;
        let totalPaidNextMonthCents = 0;
        let ownInterestReceivedCents = 0;

        const processedClients = clients.map(client => {
            let clientTotalDebtCents = 0;
            let clientExpectedThisCents = 0;
            let clientPaidThisCents = 0;
            let clientExpectedNextCents = 0;
            let clientPaidNextCents = 0;

            const processedLoans = (client.loans || []).map(loan => {
                const loanResult = calculateLoan(loan);
                const loanSourceId = normalizeSourceId(loan.sourceId, capitalSources);
                const loanDateParts = parseIsoDate(loan.date);
                const bankStat = bankStats[loanSourceId];
                let paidThisCents = 0;
                let paidNextCents = 0;

                loanResult.processedPayments.forEach(payment => {
                    const paymentDateParts = parseIsoDate(payment.date);
                    const expectsZeroThisMonth = isSameMonth(loanDateParts, todayParts);

                    if (isSameMonth(paymentDateParts, todayParts)) {
                        if (expectsZeroThisMonth) paidNextCents += payment._cents.interestPaid;
                        else paidThisCents += payment._cents.interestPaid;
                    } else if (isSameMonth(paymentDateParts, nextMonthParts)) {
                        paidNextCents += payment._cents.interestPaid;
                    }
                });

                if (bankStat) {
                    bankStat.interestFromClientsCents += loanResult._cents.totalInterestReceived;
                    bankStat.amortizedFromClientsCents += loanResult._cents.totalPrincipalRecovered;
                    bankStat.outstandingClientPrincipalCents += loanResult._cents.currentPrincipal;
                } else {
                    ownInterestReceivedCents += loanResult._cents.totalInterestReceived;
                }

                let expectedThisCents = 0;
                let expectedNextCents = 0;
                if (loanResult._cents.currentPrincipal > 0) {
                    if (isBeforeMonth(loanDateParts, todayParts)) expectedThisCents = loanResult._cents.nextInterest;
                    if (isBeforeMonth(loanDateParts, nextMonthParts)) expectedNextCents = loanResult._cents.nextInterest;
                }

                const pendingThisCents = Math.max(0, expectedThisCents - paidThisCents);
                let displayMonth = monthLabel(todayParts, 'short');
                let dashPendingCents = pendingThisCents;
                let isLoanOK = loanResult._cents.currentPrincipal === 0;

                if (!isLoanOK && pendingThisCents === 0) {
                    displayMonth = monthLabel(nextMonthParts, 'short');
                    dashPendingCents = Math.max(0, expectedNextCents - paidNextCents);
                    isLoanOK = dashPendingCents === 0;
                }

                clientTotalDebtCents += loanResult._cents.currentPrincipal;
                clientExpectedThisCents += expectedThisCents;
                clientPaidThisCents += paidThisCents;
                clientExpectedNextCents += expectedNextCents;
                clientPaidNextCents += paidNextCents;

                return {
                    ...loan,
                    sourceId: loanSourceId,
                    processedPayments: loanResult.processedPayments,
                    currentPrincipal: loanResult.currentPrincipal,
                    isPaidOff: loanResult._cents.currentPrincipal <= 0,
                    baseInterest: loanResult.nextInterest,
                    loanDisplayMonthStr: displayMonth,
                    loanDashPending: fromCents(dashPendingCents),
                    isLoanOK
                };
            }).sort((left, right) => compareIsoDates(right.date, left.date));

            const pendingThisCents = Math.max(0, clientExpectedThisCents - clientPaidThisCents);
            let displayMonth = monthLabel(todayParts, 'short');
            let displayExpectedCents = clientExpectedThisCents;
            let displayPendingCents = pendingThisCents;
            let isNextMonth = false;

            if (clientTotalDebtCents > 0 && pendingThisCents === 0) {
                displayMonth = monthLabel(nextMonthParts, 'short');
                displayExpectedCents = clientExpectedNextCents;
                displayPendingCents = Math.max(0, displayExpectedCents - clientPaidNextCents);
                isNextMonth = true;
            }

            totalLentCents += clientTotalDebtCents;
            totalExpectedThisMonthCents += clientExpectedThisCents;
            totalPaidThisMonthCents += clientPaidThisCents;
            totalExpectedNextMonthCents += clientExpectedNextCents;
            totalPaidNextMonthCents += clientPaidNextCents;

            return {
                ...client,
                currentDebt: fromCents(clientTotalDebtCents),
                loans: processedLoans,
                dashMonthStr: displayMonth,
                dashExpected: fromCents(displayExpectedCents),
                dashPending: fromCents(displayPendingCents),
                isNextMonth
            };
        });

        const sourceSummaries = {};
        let availableMoneyCents = 0;
        capitalSources.forEach(source => {
            const summary = getSourceSummary({
                sourceId: source.id,
                capitalSources,
                fundsTransactions,
                clients,
                bankPayments
            });
            sourceSummaries[source.id] = summary;
            availableMoneyCents += summary._cents?.available || 0;
        });

        const bankDetails = Object.values(bankStats).map(bank => {
            const source = capitalSources.find(item => item.id === bank.sourceId);
            const sourceSummary = sourceSummaries[bank.sourceId];
            const officialSnapshots = Array.isArray(source?.officialBalanceSnapshots) ? source.officialBalanceSnapshots : [];
            const latestOfficial = [...officialSnapshots].sort((left, right) => compareIsoDates(right.date, left.date))[0];
            const fallbackRemainingCents = Math.max(0, bank.totalToPayCents - bank.totalPaidToBankCents);
            const remainingDebtCents = latestOfficial ? toCents(latestOfficial.amount) : fallbackRemainingCents;

            return {
                sourceId: bank.sourceId,
                name: bank.name,
                interestFromClients: fromCents(bank.interestFromClientsCents),
                amortizedFromClients: fromCents(bank.amortizedFromClientsCents),
                totalLent: fromCents(bank.outstandingClientPrincipalCents),
                receivedAmount: fromCents(bank.receivedAmountCents),
                totalToPay: fromCents(bank.totalToPayCents),
                totalPaidToBank: fromCents(bank.totalPaidToBankCents),
                remainingDebt: fromCents(remainingDebtCents),
                officialBalanceDate: latestOfficial?.date || null,
                reserveBalance: sourceSummary?.available || 0,
                amortizationFund: sourceSummary?.available || 0
            };
        });

        const pendingThisCents = Math.max(0, totalExpectedThisMonthCents - totalPaidThisMonthCents);
        let dashMonth = monthLabel(todayParts, 'long');
        let dashExpectedCents = totalExpectedThisMonthCents;
        let dashPaidCents = totalPaidThisMonthCents;
        let dashPendingCents = pendingThisCents;

        if (totalLentCents > 0 && pendingThisCents === 0) {
            dashMonth = monthLabel(nextMonthParts, 'long');
            dashExpectedCents = totalExpectedNextMonthCents;
            dashPaidCents = totalPaidNextMonthCents;
            dashPendingCents = Math.max(0, dashExpectedCents - dashPaidCents);
        }

        const committedCapitalCents = bankDetails.reduce((total, bank) => total + Math.max(0, toCents(bank.reserveBalance)), 0);

        return {
            availableMoney: fromCents(availableMoneyCents),
            totalLent: fromCents(totalLentCents),
            processedClients,
            dashMonthStr: dashMonth,
            dashExpected: fromCents(dashExpectedCents),
            dashPaid: fromCents(dashPaidCents),
            dashPending: fromCents(dashPendingCents),
            realProfit: fromCents(ownInterestReceivedCents),
            committedCapital: fromCents(committedCapitalCents),
            bankDetails,
            ownInterestReceived: fromCents(ownInterestReceivedCents),
            sourceSummaries
        };
    };

    const migrateData = (rawData) => {
        const raw = rawData && typeof rawData === 'object' ? rawData : {};
        const sourceInput = Array.isArray(raw.capitalSources) && raw.capitalSources.length > 0
            ? raw.capitalSources.map(source => {
                if (source.type !== 'bank') return { ...source };

                const installmentValue = fromCents(toCents(source.installmentValue));
                const totalInstallments = Number(source.totalInstallments || 0);
                const calculatedTotal = fromCents(toCents(installmentValue) * totalInstallments);

                return {
                    ...source,
                    receivedAmount: fromCents(toCents(source.receivedAmount)),
                    financedAmount: source.financedAmount === undefined
                        ? undefined
                        : fromCents(toCents(source.financedAmount)),
                    monthlyRate: Number(source.monthlyRate || 0),
                    totalInstallments,
                    installmentValue,
                    totalToPay: source.totalToPay === undefined
                        ? calculatedTotal
                        : fromCents(toCents(source.totalToPay)),
                    additionalFees: fromCents(toCents(source.additionalFees)),
                    totalPaidToBank: fromCents(toCents(source.totalPaidToBank)),
                    monthlyReserve: fromCents(toCents(source.monthlyReserve)),
                    amortizationFund: fromCents(toCents(source.amortizationFund)),
                    officialBalanceSnapshots: (source.officialBalanceSnapshots || []).map(snapshot => ({
                        ...snapshot,
                        amount: fromCents(toCents(snapshot.amount))
                    }))
                };
            })
            : [{ ...DEFAULT_OWN_SOURCE }];

        if (!sourceInput.some(source => source.type === 'own')) {
            sourceInput.push({ ...DEFAULT_OWN_SOURCE });
        }

        const defaultOwnId = getDefaultOwnSourceId(sourceInput);
        const clients = (Array.isArray(raw.clients) ? raw.clients : []).map(client => {
            let loans = Array.isArray(client.loans) ? client.loans : null;

            if (!loans && Array.isArray(client.transactions)) {
                const oldLoans = client.transactions
                    .filter(transaction => transaction.type === 'loan')
                    .sort((left, right) => compareIsoDates(left.date, right.date));
                const oldPayments = client.transactions
                    .filter(transaction => transaction.type === 'payment')
                    .sort((left, right) => compareIsoDates(left.date, right.date));

                loans = oldLoans.map(transaction => ({
                    id: transaction.id,
                    date: transaction.date,
                    amount: fromCents(toCents(transaction.amount)),
                    interestRate: 10,
                    sourceId: defaultOwnId,
                    payments: []
                }));

                if (loans.length > 0 && oldPayments.length > 0) {
                    loans[0].payments = oldPayments.map(payment => ({
                        id: payment.id,
                        date: payment.date,
                        amount: fromCents(toCents(payment.amount))
                    }));
                }
            }

            return {
                ...client,
                loans: (loans || []).map(loan => ({
                    ...loan,
                    amount: fromCents(toCents(loan.amount)),
                    interestRate: Number(loan.interestRate ?? 10),
                    sourceId: isMissingSourceId(loan.sourceId) ? defaultOwnId : loan.sourceId,
                    payments: (loan.payments || []).map(payment => ({
                        ...payment,
                        amount: fromCents(toCents(payment.amount))
                    }))
                }))
            };
        });

        const fundsTransactions = (Array.isArray(raw.fundsTransactions) ? raw.fundsTransactions : []).map(transaction => ({
            ...transaction,
            amount: fromCents(toCents(transaction.amount)),
            sourceId: isMissingSourceId(transaction.sourceId) ? defaultOwnId : transaction.sourceId
        }));

        const bankPayments = (Array.isArray(raw.bankPayments) ? raw.bankPayments : []).map(payment => ({
            ...payment,
            amount: fromCents(toCents(payment.amount)),
            fundingBreakdown: getFundingBreakdown(payment).map(part => ({
                ...part,
                amount: fromCents(toCents(part.amount))
            }))
        }));

        return {
            schemaVersion: SCHEMA_VERSION,
            fundsTransactions,
            clients,
            capitalSources: sourceInput,
            bankPayments
        };
    };

    const findIntegrityIssues = (data) => {
        const normalized = migrateData(data);
        const knownSourceIds = new Set(normalized.capitalSources.map(source => source.id));
        const issues = [];

        normalized.fundsTransactions.forEach(transaction => {
            if (!knownSourceIds.has(transaction.sourceId)) {
                issues.push({ type: 'orphan-funds-transaction', id: transaction.id, sourceId: transaction.sourceId });
            }
        });

        normalized.clients.forEach(client => {
            client.loans.forEach(loan => {
                if (!knownSourceIds.has(loan.sourceId)) {
                    issues.push({ type: 'orphan-loan', id: loan.id, sourceId: loan.sourceId });
                }
            });
        });

        const paymentSignatures = new Map();
        normalized.bankPayments.forEach(payment => {
            if (!knownSourceIds.has(payment.sourceId)) {
                issues.push({ type: 'orphan-bank-payment', id: payment.id, sourceId: payment.sourceId });
            }

            const signature = [payment.date, payment.sourceId, payment.type, toCents(payment.amount)].join('|');
            if (paymentSignatures.has(signature)) {
                issues.push({
                    type: 'possible-duplicate-bank-payment',
                    id: payment.id,
                    duplicateOf: paymentSignatures.get(signature)
                });
            } else {
                paymentSignatures.set(signature, payment.id);
            }

            const fundingTotalCents = sumCents(getFundingBreakdown(payment), part => part.amount);
            if (fundingTotalCents > 0 && fundingTotalCents !== toCents(payment.amount)) {
                issues.push({
                    type: 'bank-funding-mismatch',
                    id: payment.id,
                    paymentAmount: fromCents(toCents(payment.amount)),
                    fundingAmount: fromCents(fundingTotalCents)
                });
            }
        });

        return issues;
    };

    return Object.freeze({
        SCHEMA_VERSION,
        DEFAULT_OWN_SOURCE,
        toCents,
        fromCents,
        sumCents,
        getDefaultOwnSourceId,
        normalizeSourceId,
        belongsToSource,
        calculateInterestCents,
        calculateLoan,
        getFundingBreakdown,
        getSourceSummary,
        getCapitalBalance,
        calculateAmortizationChoice,
        calculateGlobalStats,
        migrateData,
        findIntegrityIssues,
        localIsoDate
    });
});
