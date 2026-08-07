(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    root.FinanceEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA_VERSION = 2;
    const EXPORT_TYPE = 'agemp-local-finance-backup';
    const DEFAULT_OWN_SOURCE = Object.freeze({
        id: 'own-default',
        type: 'own',
        name: 'Capital Próprio'
    });
    const BANK_PAYMENT_STATUS = Object.freeze({
        SCHEDULED: 'scheduled',
        WITHHELD_PENDING_BANK: 'withheld_pending_bank',
        CONFIRMED: 'confirmed'
    });
    const CLIENT_PAYMENT_KIND = Object.freeze({
        AUTOMATIC: 'automatic',
        INTEREST_ONLY: 'interest_only',
        PRINCIPAL_AMORTIZATION: 'principal_amortization',
        PRINCIPAL_SETTLEMENT: 'principal_settlement',
        INTEREST_AND_PRINCIPAL_SETTLEMENT: 'interest_and_principal_settlement'
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
            const mode = payment.kind || payment.paymentType || CLIENT_PAYMENT_KIND.AUTOMATIC;
            const principalOnly = mode === CLIENT_PAYMENT_KIND.PRINCIPAL_SETTLEMENT || mode === CLIENT_PAYMENT_KIND.PRINCIPAL_AMORTIZATION;
            const interestOnly = mode === CLIENT_PAYMENT_KIND.INTEREST_ONLY;
            const interestPaidCents = principalOnly ? 0 : Math.min(paymentCents, interestDueCents);
            const amountAfterInterestCents = interestOnly ? 0 : Math.max(0, paymentCents - interestPaidCents);
            const principalRecoveredCents = Math.min(principalCents, principalOnly ? paymentCents : amountAfterInterestCents);
            const unallocatedCents = Math.max(0, amountAfterInterestCents - principalRecoveredCents);

            principalCents -= principalRecoveredCents;
            totalInterestReceivedCents += interestPaidCents;
            totalPrincipalRecoveredCents += principalRecoveredCents;
            totalUnallocatedCents += unallocatedCents;

            return {
                ...payment,
                kind: mode,
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
                bankFunding: 0,
                interestReserve: 0,
                cashBalance: 0
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
        const cashBalanceCents = baseCapitalCents + manualFundsCents + clientReceiptsCents - loansGrantedCents - bankFundingCents;
        const interestReserveCents = source.type === 'bank'
            ? Math.max(0, clientInterestReceivedCents - bankFundingCents)
            : 0;
        const availableCents = source.type === 'bank'
            ? cashBalanceCents - interestReserveCents
            : cashBalanceCents;

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
            interestReserve: fromCents(interestReserveCents),
            cashBalance: fromCents(cashBalanceCents),
            _cents: {
                available: availableCents,
                outstandingPrincipal: outstandingPrincipalCents,
                loansGranted: loansGrantedCents,
                clientInterestReceived: clientInterestReceivedCents,
                clientPrincipalRecovered: clientPrincipalRecoveredCents,
                clientReceipts: clientReceiptsCents,
                manualFunds: manualFundsCents,
                bankFunding: bankFundingCents,
                interestReserve: interestReserveCents,
                cashBalance: cashBalanceCents
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

    const rangeInclusive = (start, end) => {
        const first = Number(start);
        const last = Number(end);
        if (!Number.isInteger(first) || !Number.isInteger(last) || first <= 0 || last < first) return [];
        return Array.from({ length: last - first + 1 }, (_, index) => first + index);
    };

    const uniqueInstallmentNumbers = (numbers, totalInstallments) => [...new Set((numbers || [])
        .map(Number)
        .filter(number => Number.isInteger(number) && number > 0 && (!totalInstallments || number <= totalInstallments)))]
        .sort((left, right) => left - right);

    const getPaymentInstallmentNumbers = (payment, totalInstallments) => {
        if (Array.isArray(payment?.installmentNumbers)) {
            return uniqueInstallmentNumbers(payment.installmentNumbers, totalInstallments);
        }

        if (payment?.installmentRange?.start && payment?.installmentRange?.end) {
            return uniqueInstallmentNumbers(
                rangeInclusive(payment.installmentRange.start, payment.installmentRange.end),
                totalInstallments
            );
        }

        if (payment?.installmentStart && payment?.installmentEnd) {
            return uniqueInstallmentNumbers(
                rangeInclusive(payment.installmentStart, payment.installmentEnd),
                totalInstallments
            );
        }

        if (payment?.installmentNumber) {
            return uniqueInstallmentNumbers([payment.installmentNumber], totalInstallments);
        }

        return [];
    };

    const getOfficialRemainingNumbers = (snapshot, totalInstallments) => {
        if (!snapshot) return [];
        if (Array.isArray(snapshot.remainingInstallmentNumbers)) {
            return uniqueInstallmentNumbers(snapshot.remainingInstallmentNumbers, totalInstallments);
        }
        if (snapshot.remainingStart && snapshot.remainingEnd) {
            return uniqueInstallmentNumbers(
                rangeInclusive(snapshot.remainingStart, snapshot.remainingEnd),
                totalInstallments
            );
        }
        return [];
    };

    const addMonthsToIsoDate = (date, amount) => {
        const parts = parseIsoDate(date);
        if (!parts) return null;
        const targetMonth = new Date(parts.year, parts.month + Number(amount || 0), 1);
        const year = targetMonth.getFullYear();
        const monthIndex = targetMonth.getMonth();
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();
        const month = String(monthIndex + 1).padStart(2, '0');
        const day = String(Math.min(parts.day, lastDay)).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getInstallmentDueDate = (firstDueDate, installmentNumber) => {
        if (!firstDueDate || !installmentNumber) return null;
        return addMonthsToIsoDate(firstDueDate, Number(installmentNumber) - 1);
    };

    const getBankInstallments = (bank) => Array.isArray(bank?.installments) ? bank.installments : [];
    const getBankInstallment = (bank, number) => getBankInstallments(bank).find(item => Number(item.number) === Number(number));

    const buildInstallmentSchedule = ({ bank, bankPayments = [] }) => {
        const summary = summarizeBankContract({ bank, bankPayments });
        if (!summary) return [];
        const anticipated = new Set(summary.anticipatedNumbers);
        const confirmed = new Set(summary.confirmedNormalNumbers);
        const pending = new Set(summary.pendingNormalNumbers);
        const scheduled = new Set(summary.scheduledNormalNumbers);
        return rangeInclusive(1, summary.totalInstallments).map(number => {
            const installment = getBankInstallment(bank, number) || {};
            let status = 'open';
            if (anticipated.has(number)) status = 'anticipated';
            else if (confirmed.has(number)) status = 'confirmed';
            else if (pending.has(number)) status = 'pending_bank';
            else if (scheduled.has(number)) status = 'scheduled';
            return {
                number,
                dueDate: installment.dueDate || getInstallmentDueDate(bank.firstDueDate, number),
                amount: fromCents(toCents(installment.amount === undefined ? bank.installmentValue : installment.amount)),
                status
            };
        });
    };

    const summarizeBankContract = ({ bank, bankPayments = [] }) => {
        if (!bank) return null;
        const totalInstallments = Number(bank.totalInstallments || 0);
        const allNumbers = rangeInclusive(1, totalInstallments);
        const relatedPayments = bankPayments
            .filter(payment => payment.sourceId === bank.id)
            .map((payment, index) => ({ ...payment, _index: index }))
            .sort((left, right) => compareIsoDates(left.date, right.date) || left._index - right._index);

        const normalPayments = relatedPayments.filter(payment => payment.type === 'installment');
        const amortizations = relatedPayments.filter(payment => payment.type === 'amortization');
        const anticipatedNumbers = new Set();
        const confirmedNormalNumbers = new Set();
        const pendingNormalNumbers = new Set();
        const scheduledNormalNumbers = new Set();
        const usedNormalNumbers = new Set();
        const unreconciledPayments = [];

        amortizations.forEach(payment => {
            const numbers = getPaymentInstallmentNumbers(payment, totalInstallments);
            if (numbers.length === 0) {
                unreconciledPayments.push(payment.id);
                return;
            }
            numbers.forEach(number => anticipatedNumbers.add(number));
        });

        normalPayments.forEach(payment => {
            const explicitNumbers = getPaymentInstallmentNumbers(payment, totalInstallments);
            let installmentNumber = explicitNumbers[0];

            if (!installmentNumber) {
                installmentNumber = allNumbers.find(number => (
                    !anticipatedNumbers.has(number) && !usedNormalNumbers.has(number)
                ));
                unreconciledPayments.push(payment.id);
            }
            if (!installmentNumber) return;

            usedNormalNumbers.add(installmentNumber);
            const status = payment.status || BANK_PAYMENT_STATUS.CONFIRMED;
            if (status === BANK_PAYMENT_STATUS.SCHEDULED) scheduledNormalNumbers.add(installmentNumber);
            else if (status === BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK) pendingNormalNumbers.add(installmentNumber);
            else confirmedNormalNumbers.add(installmentNumber);
        });

        const officialSnapshots = [...(bank.officialBalanceSnapshots || [])]
            .sort((left, right) => compareIsoDates(right.date, left.date));
        const latestOfficial = officialSnapshots[0] || null;
        const officialRemainingNumbers = getOfficialRemainingNumbers(latestOfficial, totalInstallments);
        const hasOfficialInstallmentState = Boolean(latestOfficial && (
            Array.isArray(latestOfficial.remainingInstallmentNumbers) ||
            (latestOfficial.remainingStart && latestOfficial.remainingEnd) ||
            toCents(latestOfficial.amount) === 0
        ));
        const bankRemainingSet = new Set(hasOfficialInstallmentState ? officialRemainingNumbers : allNumbers);

        anticipatedNumbers.forEach(number => bankRemainingSet.delete(number));
        confirmedNormalNumbers.forEach(number => bankRemainingSet.delete(number));

        const accountingRemainingSet = new Set(bankRemainingSet);
        pendingNormalNumbers.forEach(number => accountingRemainingSet.delete(number));

        const bankRemainingNumbers = [...bankRemainingSet].sort((left, right) => left - right);
        const accountingRemainingNumbers = [...accountingRemainingSet].sort((left, right) => left - right);
        const installmentValueCents = toCents(bank.installmentValue);
        const totalCashPaidCents = relatedPayments
            .filter(payment => payment.status !== BANK_PAYMENT_STATUS.SCHEDULED)
            .reduce((total, payment) => total + toCents(payment.amount), 0);
        const confirmedCashPaidCents = relatedPayments
            .filter(payment => payment.status !== BANK_PAYMENT_STATUS.SCHEDULED)
            .filter(payment => payment.type !== 'installment' || (payment.status || BANK_PAYMENT_STATUS.CONFIRMED) === BANK_PAYMENT_STATUS.CONFIRMED)
            .reduce((total, payment) => total + toCents(payment.amount), 0);
        const amortizationCashCents = amortizations.reduce((total, payment) => total + toCents(payment.amount), 0);
        const anticipatedNominalCents = amortizations.reduce((total, payment) => {
            const numbers = getPaymentInstallmentNumbers(payment, totalInstallments);
            const nominal = payment.nominalAmount === undefined
                ? installmentValueCents * numbers.length
                : toCents(payment.nominalAmount);
            return total + nominal;
        }, 0);
        const anticipatedDiscountCents = amortizations.reduce((total, payment) => {
            if (payment.discountAmount !== undefined) return total + toCents(payment.discountAmount);
            const numbers = getPaymentInstallmentNumbers(payment, totalInstallments);
            const nominal = payment.nominalAmount === undefined
                ? installmentValueCents * numbers.length
                : toCents(payment.nominalAmount);
            return total + Math.max(0, nominal - toCents(payment.amount));
        }, 0);

        const firstDueDate = bank.firstDueDate || null;
        const nextInstallmentNumber = accountingRemainingNumbers[0] || null;
        const lastInstallmentNumber = accountingRemainingNumbers[accountingRemainingNumbers.length - 1] || null;

        return {
            sourceId: bank.id,
            totalInstallments,
            confirmedNormalNumbers: [...confirmedNormalNumbers].sort((left, right) => left - right),
            pendingNormalNumbers: [...pendingNormalNumbers].sort((left, right) => left - right),
            scheduledNormalNumbers: [...scheduledNormalNumbers].sort((left, right) => left - right),
            anticipatedNumbers: [...anticipatedNumbers].sort((left, right) => left - right),
            confirmedNormalCount: confirmedNormalNumbers.size,
            pendingNormalCount: pendingNormalNumbers.size,
            scheduledNormalCount: scheduledNormalNumbers.size,
            anticipatedCount: anticipatedNumbers.size,
            bankRemainingNumbers,
            accountingRemainingNumbers,
            bankRemainingCount: bankRemainingNumbers.length,
            accountingRemainingCount: accountingRemainingNumbers.length,
            resolvedByBankCount: totalInstallments - bankRemainingNumbers.length,
            resolvedInPersonalControlCount: totalInstallments - accountingRemainingNumbers.length,
            nextInstallmentNumber,
            nextInstallmentDueDate: getBankInstallment(bank, nextInstallmentNumber)?.dueDate || getInstallmentDueDate(firstDueDate, nextInstallmentNumber),
            lastInstallmentNumber,
            forecastDate: getBankInstallment(bank, lastInstallmentNumber)?.dueDate || getInstallmentDueDate(firstDueDate, lastInstallmentNumber),
            totalCashPaid: fromCents(totalCashPaidCents),
            confirmedCashPaid: fromCents(confirmedCashPaidCents),
            amortizationCashPaid: fromCents(amortizationCashCents),
            anticipatedNominal: fromCents(anticipatedNominalCents),
            anticipatedDiscount: fromCents(anticipatedDiscountCents),
            officialBalance: latestOfficial ? fromCents(toCents(latestOfficial.amount)) : null,
            officialBalanceDate: latestOfficial?.date || null,
            officialNominalRemaining: latestOfficial?.nominalRemaining === undefined
                ? null
                : fromCents(toCents(latestOfficial.nominalRemaining)),
            unreconciledPayments
        };
    };

    const selectFinalInstallments = ({ bank, bankPayments = [], count }) => {
        const summary = summarizeBankContract({ bank, bankPayments });
        const quantity = Math.max(0, Number(count || 0));
        if (!summary || !Number.isInteger(quantity) || quantity === 0) return [];
        return summary.accountingRemainingNumbers.slice(-quantity);
    };

    const calculateMonthlyBankSettlement = ({
        reserveAvailable = 0,
        installmentAmount = 0,
        quoteAmount = 0
    }) => {
        const reserveCents = Math.max(0, toCents(reserveAvailable));
        const installmentCents = Math.max(0, toCents(installmentAmount));
        const quoteCents = Math.max(0, toCents(quoteAmount));
        const reserveForInstallmentCents = Math.min(reserveCents, installmentCents);
        const reserveAfterInstallmentCents = reserveCents - reserveForInstallmentCents;
        const reserveForAmortizationCents = Math.min(reserveAfterInstallmentCents, quoteCents);
        const ownForInstallmentCents = installmentCents - reserveForInstallmentCents;
        const ownForAmortizationCents = quoteCents - reserveForAmortizationCents;
        const reserveCarryoverCents = reserveAfterInstallmentCents - reserveForAmortizationCents;

        return {
            reserveAvailable: fromCents(reserveCents),
            installmentAmount: fromCents(installmentCents),
            quoteAmount: fromCents(quoteCents),
            reserveForInstallment: fromCents(reserveForInstallmentCents),
            reserveForAmortization: fromCents(reserveForAmortizationCents),
            ownForInstallment: fromCents(ownForInstallmentCents),
            ownForAmortization: fromCents(ownForAmortizationCents),
            ownCapitalRequired: fromCents(ownForInstallmentCents + ownForAmortizationCents),
            reserveCarryover: fromCents(reserveCarryoverCents),
            totalBankOutflow: fromCents(installmentCents + quoteCents)
        };
    };

    const isoMonthKey = (date) => String(date || '').slice(0, 7);

    const getInstallmentAmountCents = (bank, number) => {
        const installment = getBankInstallment(bank, number);
        return toCents(installment?.amount === undefined ? bank?.installmentValue : installment.amount);
    };

    // Measures the operation itself: money received from clients linked to this
    // bank source less money paid to the bank. The client principal is deliberately
    // kept separate because a positive cash result does not mean that principal
    // is no longer at risk.
    const calculateOperationRecovery = ({
        bank,
        clients = [],
        bankPayments = [],
        referenceDate,
        projectionMonths = 120
    }) => {
        if (!bank?.id) return null;
        const cutoff = referenceDate || localIsoDate(new Date());
        const cutoffMonth = isoMonthKey(cutoff);
        let clientReceiptsCents = 0;
        let outstandingPrincipalCents = 0;
        let projectedMonthlyInterestCents = 0;

        clients.forEach(client => (client.loans || []).forEach(loan => {
            if (loan.sourceId !== bank.id) return;
            const result = calculateLoan(loan);
            clientReceiptsCents += result.processedPayments.reduce((total, payment) => total + payment._cents.amount, 0);
            outstandingPrincipalCents += result._cents.currentPrincipal;
            if (result._cents.currentPrincipal > 0) {
                projectedMonthlyInterestCents += calculateInterestCents(result._cents.currentPrincipal, loan.interestRate);
            }
        }));

        const actualBankPaidCents = bankPayments
            .filter(payment => payment.sourceId === bank.id && payment.status !== BANK_PAYMENT_STATUS.SCHEDULED)
            .reduce((total, payment) => total + toCents(payment.amount), 0);
        const currentNetCents = clientReceiptsCents - actualBankPaidCents;
        const contract = summarizeBankContract({ bank, bankPayments });
        const events = [];

        // Include only installments still pending in the personal control. This
        // avoids counting confirmed and anticipated installments a second time.
        (contract?.accountingRemainingNumbers || []).forEach(number => {
            const dueDate = getBankInstallment(bank, number)?.dueDate || getInstallmentDueDate(bank.firstDueDate, number);
            if (dueDate && dueDate > cutoff) {
                events.push({ date: dueDate, kind: 'bank', amountCents: getInstallmentAmountCents(bank, number) });
            }
        });

        const currentParts = parseIsoDate(cutoff);
        if (currentParts && projectedMonthlyInterestCents > 0) {
            for (let index = 1; index <= Math.max(0, Number(projectionMonths || 0)); index += 1) {
                const month = addMonths(currentParts, index);
                const paymentDate = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(Math.min(currentParts.day, new Date(month.year, month.month + 1, 0).getDate())).padStart(2, '0')}`;
                events.push({ date: paymentDate, kind: 'client-interest', amountCents: projectedMonthlyInterestCents });
            }
        }

        events.sort((left, right) => compareIsoDates(left.date, right.date) || (left.kind === 'bank' ? -1 : 1));
        let runningCents = currentNetCents;
        // A newly created operation starts at zero, but it has not recovered
        // anything yet. It is considered at equilibrium only after at least
        // one real cash movement has been recorded.
        const hasActualCashFlow = clientReceiptsCents > 0 || actualBankPaidCents > 0;
        let breakEvenDate = hasActualCashFlow && runningCents >= 0 ? cutoff : null;
        const forecast = [];
        events.forEach(event => {
            if (breakEvenDate) return;
            runningCents += event.kind === 'bank' ? -event.amountCents : event.amountCents;
            forecast.push({ date: event.date, kind: event.kind, amount: fromCents(event.amountCents), netCash: fromCents(runningCents) });
            if (runningCents >= 0) breakEvenDate = event.date;
        });

        return {
            sourceId: bank.id,
            asOfDate: cutoff,
            clientReceipts: fromCents(clientReceiptsCents),
            paidToBank: fromCents(actualBankPaidCents),
            currentNetCash: fromCents(currentNetCents),
            ownCapitalStillToRecover: fromCents(Math.max(0, -currentNetCents)),
            cashProfit: fromCents(Math.max(0, currentNetCents)),
            outstandingClientPrincipal: fromCents(outstandingPrincipalCents),
            projectedMonthlyInterest: fromCents(projectedMonthlyInterestCents),
            breakEvenDate,
            isCashPositive: hasActualCashFlow && currentNetCents >= 0,
            forecast
        };
    };

    // Returns the explicit client-loan links for a bank operation.  This is
    // intentionally based only on sourceId: legacy loans must never be
    // attached to a bank just because their amount or client name looks alike.
    const getBankOperationLinks = ({ bank, clients = [] }) => {
        if (!bank?.id) return { sourceId: null, loans: [], clientCount: 0, outstandingPrincipal: 0, monthlyInterest: 0 };
        const loans = [];
        clients.forEach(client => (client.loans || []).forEach(loan => {
            if (loan.sourceId !== bank.id) return;
            const calculation = calculateLoan(loan);
            loans.push({
                clientId: client.id,
                clientName: client.name || 'Cliente sem nome',
                loanId: loan.id,
                originalAmount: loan.amount,
                outstandingPrincipal: calculation.currentPrincipal,
                monthlyInterest: calculation.nextInterest,
                isPaidOff: calculation.currentPrincipal <= 0
            });
        }));
        return {
            sourceId: bank.id,
            loans,
            clientCount: new Set(loans.map(loan => loan.clientId)).size,
            outstandingPrincipal: fromCents(loans.reduce((total, loan) => total + toCents(loan.outstandingPrincipal), 0)),
            monthlyInterest: fromCents(loans.filter(loan => !loan.isPaidOff).reduce((total, loan) => total + toCents(loan.monthlyInterest), 0))
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
                reserveBalance: sourceSummary?.interestReserve || 0,
                amortizationFund: sourceSummary?.interestReserve || 0,
                recovery: calculateOperationRecovery({
                    bank: source,
                    clients,
                    bankPayments,
                    referenceDate
                }),
                operationLinks: getBankOperationLinks({ bank: source, clients })
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
                    iofAmount: source.iofAmount === undefined ? undefined : fromCents(toCents(source.iofAmount)),
                    contractRateMonthly: source.contractRateMonthly === undefined
                        ? undefined
                        : Number(source.contractRateMonthly),
                    cetMonthly: source.cetMonthly === undefined ? undefined : Number(source.cetMonthly),
                    totalPaidToBank: fromCents(toCents(source.totalPaidToBank)),
                    monthlyReserve: fromCents(toCents(source.monthlyReserve)),
                    amortizationFund: fromCents(toCents(source.amortizationFund)),
                    installments: (source.installments || []).map(item => ({
                        ...item,
                        number: Number(item.number),
                        amount: fromCents(toCents(item.amount)),
                        dueDate: item.dueDate || null
                    })),
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
                        amount: fromCents(toCents(payment.amount)),
                        // Mantém explícita a modalidade escolhida no lançamento.
                        // Backups antigos sem esse campo continuam sendo tratados
                        // pelo motor como pagamento comum (automatic).
                        kind: payment.kind || payment.paymentType || undefined
                    }))
                }))
            };
        });

        const fundsTransactions = (Array.isArray(raw.fundsTransactions) ? raw.fundsTransactions : []).map(transaction => ({
            ...transaction,
            amount: fromCents(toCents(transaction.amount)),
            sourceId: isMissingSourceId(transaction.sourceId) ? defaultOwnId : transaction.sourceId
        }));

        let bankPayments = (Array.isArray(raw.bankPayments) ? raw.bankPayments : []).map(payment => ({
            ...payment,
            amount: fromCents(toCents(payment.amount)),
            status: payment.status || BANK_PAYMENT_STATUS.CONFIRMED,
            competence: payment.competence || String(payment.date || '').slice(0, 7) || null,
            installmentNumber: payment.installmentNumber === undefined
                ? undefined
                : Number(payment.installmentNumber),
            installmentNumbers: getPaymentInstallmentNumbers(payment).length > 0
                ? getPaymentInstallmentNumbers(payment)
                : undefined,
            nominalAmount: payment.nominalAmount === undefined
                ? undefined
                : fromCents(toCents(payment.nominalAmount)),
            discountAmount: payment.discountAmount === undefined
                ? undefined
                : fromCents(toCents(payment.discountAmount)),
            fundingBreakdown: getFundingBreakdown(payment).map(part => ({
                ...part,
                amount: fromCents(toCents(part.amount))
            })),
            ...(payment.type === 'installment' && payment.status === BANK_PAYMENT_STATUS.CONFIRMED
                ? { confirmationSource: payment.confirmationSource || 'manual' }
                : {})
        }));

        let historicalInterestAllocations = (Array.isArray(raw.historicalInterestAllocations)
            ? raw.historicalInterestAllocations
            : []).map(record => ({
            ...record,
            amount: fromCents(toCents(record.amount)),
            sourceId: record.sourceId || null,
            purpose: record.purpose || 'bank-interest-used'
        }));

        // Backups created before the reconciliation stored the two monthly
        // interest allocations as bank payments with an unknown source. They
        // are historical cash-use records, not new bank payments and must not
        // remain in the bank statement or generate integrity alerts.
        const knownSourceIds = new Set(sourceInput.map(source => source.id));
        const bankSources = sourceInput.filter(source => source.type === 'bank');
        const legacyInterestPayments = bankSources.length === 1
            ? bankPayments.filter(payment => (
                payment.legacyOrphan === true && !knownSourceIds.has(payment.sourceId)
            ))
            : [];

        if (legacyInterestPayments.length > 0) {
            const bankSource = bankSources[0];
            const existingLegacyIds = new Set(
                historicalInterestAllocations.map(record => record.legacyPaymentId).filter(Boolean)
            );

            historicalInterestAllocations = [
                ...historicalInterestAllocations,
                ...legacyInterestPayments
                    .filter(payment => !existingLegacyIds.has(payment.id))
                    .map(payment => ({
                        id: `historical-${payment.id}`,
                        date: payment.date || null,
                        amount: payment.amount,
                        sourceId: bankSource.id,
                        purpose: 'bank-interest-used',
                        legacyPaymentId: payment.id,
                        description: 'Juros históricos recebidos e já utilizados'
                    }))
            ];

            const legacyIds = new Set(legacyInterestPayments.map(payment => payment.id));
            bankPayments = bankPayments.filter(payment => !legacyIds.has(payment.id));
        }

        return {
            schemaVersion: SCHEMA_VERSION,
            fundsTransactions,
            clients,
            capitalSources: sourceInput,
            bankPayments,
            historicalInterestAllocations
        };
    };

    const createBackup = ({
        fundsTransactions = [],
        clients = [],
        capitalSources = [],
        bankPayments = [],
        historicalInterestAllocations = []
    } = {}) => ({
        exportType: EXPORT_TYPE,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        source: 'agemp-local',
        ...migrateData({
            schemaVersion: SCHEMA_VERSION,
            fundsTransactions,
            clients,
            capitalSources,
            bankPayments,
            historicalInterestAllocations
        })
    });

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

    const validateBackup = (raw) => {
        const errors = [];
        const warnings = [];
        const expectedArrays = ['clients', 'fundsTransactions', 'capitalSources', 'bankPayments'];

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: ['O conteúdo do arquivo não é um objeto de backup.'],
                warnings,
                integrityIssues: [],
                summary: null
            };
        }

        if (!Array.isArray(raw.clients)) {
            errors.push('A lista de clientes está ausente ou inválida.');
        }

        expectedArrays.slice(1).forEach(field => {
            if (raw[field] !== undefined && !Array.isArray(raw[field])) {
                errors.push(`O campo ${field} deveria ser uma lista.`);
            }
        });

        if (Number(raw.schemaVersion || 1) > SCHEMA_VERSION) {
            errors.push('Este backup foi criado por uma versão mais nova do aplicativo.');
        }

        if (errors.length > 0) {
            return { valid: false, errors, warnings, integrityIssues: [], summary: null };
        }

        const normalized = migrateData(raw);
        const duplicateIdCollections = [];
        const collections = {
            clientes: normalized.clients,
            origens: normalized.capitalSources,
            movimentações: normalized.fundsTransactions,
            pagamentosBancários: normalized.bankPayments
        };

        Object.entries(collections).forEach(([label, items]) => {
            const seen = new Set();
            let hasDuplicate = false;
            items.forEach(item => {
                if (!item?.id) return;
                if (seen.has(item.id)) hasDuplicate = true;
                seen.add(item.id);
            });
            if (hasDuplicate) duplicateIdCollections.push(label);
        });

        normalized.clients.forEach(client => {
            const seenLoanIds = new Set();
            (client.loans || []).forEach(loan => {
                if (loan?.id && seenLoanIds.has(loan.id)) {
                    warnings.push(`O cliente ${client.name || 'sem nome'} possui identificadores de empréstimo repetidos.`);
                }
                if (loan?.id) seenLoanIds.add(loan.id);
            });
        });

        if (duplicateIdCollections.length > 0) {
            warnings.push(`Existem identificadores repetidos em: ${duplicateIdCollections.join(', ')}.`);
        }

        const integrityIssues = findIntegrityIssues(normalized);
        if (integrityIssues.length > 0) {
            warnings.push(`Foram encontrados ${integrityIssues.length} alertas de integridade que serão preservados para revisão.`);
        }

        const loanCount = normalized.clients.reduce((total, client) => total + (client.loans || []).length, 0);
        return {
            valid: true,
            errors,
            warnings,
            integrityIssues,
            summary: {
                clients: normalized.clients.length,
                loans: loanCount,
                capitalSources: normalized.capitalSources.length,
                fundsTransactions: normalized.fundsTransactions.length,
                bankPayments: normalized.bankPayments.length
            }
        };
    };

    return Object.freeze({
        SCHEMA_VERSION,
        EXPORT_TYPE,
        DEFAULT_OWN_SOURCE,
        BANK_PAYMENT_STATUS,
        CLIENT_PAYMENT_KIND,
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
        rangeInclusive,
        getPaymentInstallmentNumbers,
        getOfficialRemainingNumbers,
        getInstallmentDueDate,
        buildInstallmentSchedule,
        summarizeBankContract,
        selectFinalInstallments,
        calculateMonthlyBankSettlement,
        calculateOperationRecovery,
        getBankOperationLinks,
        calculateGlobalStats,
        migrateData,
        createBackup,
        findIntegrityIssues,
        validateBackup,
        localIsoDate
    });
});
