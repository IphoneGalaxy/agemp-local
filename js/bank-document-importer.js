(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.BankDocumentImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const normalizeText = (text) => String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const money = (value) => {
        const compact = String(value || '').replace(/[^0-9,.-]/g, '');
        if (!compact) return 0;
        return Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact) || 0;
    };
    const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const isoDate = (value) => {
        const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(value || '');
        return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
    };
    const capture = (text, expression) => {
        const match = expression.exec(text);
        return match ? match[1].trim() : '';
    };
    const buildDraft = (values) => ({
        kind: 'bank_contract_draft',
        provider: values.provider,
        confidence: values.confidence || 'high',
        warnings: values.warnings || [],
        source: {
            type: 'bank',
            name: values.name,
            contractNumber: values.contractNumber || '',
            receivedAmount: values.receivedAmount,
            financedAmount: values.financedAmount || values.receivedAmount,
            monthlyRate: values.monthlyRate || 0,
            contractRateMonthly: values.monthlyRate || 0,
            contractRateAnnual: values.annualRate || 0,
            cetMonthly: values.cetMonthly || 0,
            cetAnnual: values.cetAnnual || 0,
            totalInstallments: values.installments.length,
            installmentValue: values.nominalInstallmentValue || values.installments[0]?.nominalAmount || values.installments[0]?.amount || 0,
            nominalInstallmentValue: values.nominalInstallmentValue || values.installments[0]?.nominalAmount || values.installments[0]?.amount || 0,
            totalToPay: roundMoney(values.totalToPay || values.installments.reduce((total, item) => total + Number(item.nominalAmount ?? item.amount ?? 0), 0)),
            additionalFees: values.iofAmount || 0,
            iofAmount: values.iofAmount || 0,
            startDate: values.startDate || '',
            firstDueDate: values.installments[0]?.dueDate || '',
            installments: values.installments,
            officialBalanceSnapshots: values.officialBalanceSnapshots || [],
            projectionMode: values.projectionMode || 'fixed_installments',
            amortizationStrategy: values.amortizationStrategy || 'last_installments_first',
            carryoverEnabled: true,
            documentFindings: values.documentFindings || null,
            importMetadata: {
                provider: values.provider,
                documentType: values.documentType,
                contractNumber: values.contractNumber || '',
                importedAt: new Date().toISOString(),
                importMode: 'draft_review_required'
            }
        }
    });

    const parse99Pay = (text) => {
        const normalized = normalizeText(text);
        const rows = [...normalized.matchAll(/(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*([\d.]+,\d{2})/g)]
            .map(match => ({ number: Number(match[1]), dueDate: isoDate(match[2]), amount: money(match[3]) }))
            .filter(row => row.number > 0 && row.number < 100);
        const installments = rows.filter((row, index, all) => all.findIndex(item => item.number === row.number) === index)
            .sort((a, b) => a.number - b.number);
        if (installments.length === 0) return null;
        return buildDraft({
            provider: '99Pay', documentType: 'Contrato / CCB 99Pay', name: '99Pay',
            contractNumber: capture(normalized, /C[ÉE]DULA DE CR[ÉE]DITO BANC[ÁA]RIO N(?:[ºo]\.)?\s*([a-z0-9-]+)/i),
            receivedAmount: money(capture(normalized, /Valor Liberado\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i)),
            financedAmount: money(capture(normalized, /Valor Principal\*?\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i)),
            iofAmount: money(capture(normalized, /IOF\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i)),
            monthlyRate: money(capture(normalized, /Juros [^:]*:\s*[^\d]*([\d,]+)\s*%\s*a\.m\./i)),
            annualRate: money(capture(normalized, /Juros [^:]*:[\s\S]*?equivalente\s+[àa]\s+taxa\s+de\s+([\d,]+)\s*%\s*a\.a\./i)),
            cetMonthly: money(capture(normalized, /CET\) Mensal\s*:?\s*([\d,]+)%/i)),
            cetAnnual: money(capture(normalized, /CET\) Anual\s*:?\s*([\d,]+)%/i)),
            startDate: isoDate(capture(normalized, /Data de (?:Emiss[aã]o|Libera[cç][aã]o dos Recursos)[^\d]*(\d{2}\/\d{2}\/\d{4})/i)),
            installments
        });
    };

    const parseSantanderTableRows = (section, status, nominalFallback) => {
        const table = String(section || '');
        const rowPattern = /(?:^|\s)(\d{1,3})\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}\/\d{2}\/\d{4}))?\s+/g;
        const rowStarts = [...table.matchAll(rowPattern)];
        const parsedRows = rowStarts.map((row, index) => {
            const nextRow = rowStarts[index + 1];
            const rowBody = table.slice(row.index + row[0].length, nextRow?.index ?? table.length);
            // A taxa do contrato possui quatro casas decimais (1,5268) e não é
            // uma coluna monetária. O lookahead impede que ela vire 1,52.
            const values = [...rowBody.matchAll(/[\d.]+,\d{2}(?!\d)/g)].map(match => money(match[0]));
            if (values.length < 3) return null;
            const hasPaymentDate = Boolean(row[3]);
            const nominalAmount = hasPaymentDate ? values[0] : Number(nominalFallback || 0);
            const presentValue = hasPaymentDate ? values[3] : values[0];
            return {
                number: Number(row[1]), dueDate: isoDate(row[2]), paymentDate: isoDate(row[3]),
                amount: nominalAmount || values[0], nominalAmount: nominalAmount || values[0], presentValue,
                principalPresentValue: values[1], interestPresentValue: values[2],
                discountAmount: hasPaymentDate ? (values[6] || 0) : 0,
                totalPaid: hasPaymentDate ? (values[7] || presentValue) : 0,
                documentStatus: status,
                quality: status === 'open' ? 'recalculated' : 'confirmed'
            };
        }).filter(Boolean);
        return parsedRows.filter((row, index, all) => all.findIndex(item => item.number === row.number) === index);
    };

    const parseSantander = (text) => {
        const normalized = normalizeText(text);
        const rateSection = capture(normalized, /(Custo\s+Efet(?:ivo)?\.?\s+Total[\s\S]*?)(?:Movimenta[cç][oõ]es\s+Efetuadas|$)/i);
        const monthlyRates = [...rateSection.matchAll(/([\d.,]+)\s*%\s*a\.m\.?/gi)].map(match => money(match[1]));
        const annualRates = [...rateSection.matchAll(/([\d.,]+)\s*%\s*a\.a\.?/gi)].map(match => money(match[1]));
        const contractMonthlyRate = monthlyRates[1] || money(capture(normalized, /Tx\.\s*Efet\.\s*do contrato\s*:\s*([\d.,]+)\s*%\s*a\.m\.?/i)) || 0;
        const contractAnnualRate = annualRates[1] || 0;
        const cetMonthlyRate = monthlyRates[0] || money(capture(normalized, /Custo\s+Efet(?:ivo)?\.?\s+Total\s*(?:\(?CET\)?)?\s*:\s*([\d.,]+)\s*%\s*a\.m\.?/i)) || 0;
        const cetAnnualRate = annualRates[0] || 0;
        const total = Number(capture(normalized, /Nr\.\s*Parcelas\s*:\s*(\d+)/i));
        const raw = String(text || '');
        const movementSection = raw.split(/Movimenta[cç][oõ]es\s+Efetuadas/i)[1]?.split(/PARCELAS\s+A\s+VENCER/i)[0] || '';
        const openSection = raw.split(/PARCELAS\s+A\s+VENCER/i)[1]?.split(/RESUMO/i)[0] || '';
        const preliminaryMovementRows = parseSantanderTableRows(movementSection, 'settled', 0);
        const fallbackMovement = /(?:^|\s)(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/.exec(raw);
        const installmentValue = money(preliminaryMovementRows[0]?.nominalAmount || fallbackMovement?.[4] || capture(normalized, /VLR\.\s*PARC[\s\S]{0,400}?([\d.]+,\d{2})/i) || capture(normalized, /Valor da Parcela[^\d]*([\d.]+,\d{2})/i));
        if (!total || !installmentValue) return null;
        const detectedMovementRows = parseSantanderTableRows(movementSection, 'settled', installmentValue);
        if (detectedMovementRows.length === 0 && fallbackMovement) detectedMovementRows.push({
            number: Number(fallbackMovement[1]), dueDate: isoDate(fallbackMovement[2]), paymentDate: isoDate(fallbackMovement[3]),
            amount: installmentValue, nominalAmount: installmentValue, presentValue: installmentValue,
            principalPresentValue: money(fallbackMovement[5]), interestPresentValue: money(fallbackMovement[6]),
            discountAmount: 0, totalPaid: installmentValue, documentStatus: 'settled', quality: 'confirmed'
        });
        const movementRows = detectedMovementRows.map(row => ({
            ...row,
            documentStatus: row.number <= 2 ? 'paid' : 'anticipated'
        }));
        const openRows = parseSantanderTableRows(openSection, 'open', installmentValue);
        const allDetectedRows = [...movementRows, ...openRows];
        const firstDueDate = isoDate(capture(normalized, /Dt\.\s*1[ºo]\s*Vcto\.?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i));
        const installments = Array.from({ length: total }, (_, index) => {
            const row = allDetectedRows.find(item => item.number === index + 1);
            return row || { number: index + 1, amount: installmentValue, nominalAmount: installmentValue };
        });
        if (firstDueDate) installments[0].dueDate = firstDueDate;
        const balanceAmount = money(capture(normalized, /D[ií]vida\s+para\s+Liquida[cç][aã]o\s*:\s*([\d.]+,\d{2})/i));
        const balanceDate = isoDate(capture(normalized, /D[ií]vida\s+para\s+Liquida[cç][aã]o[\s\S]{0,100}?Em\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)) ||
            isoDate(capture(normalized, /Data\s+Emiss[aã]o\s+DDC\s*:\s*(\d{2}\/\d{2}\/\d{4})/i));
        const remainingNumbers = openRows.map(row => row.number).sort((a, b) => a - b);
        const officialBalanceSnapshots = balanceAmount ? [{
            date: balanceDate || '', amount: balanceAmount,
            nominalRemaining: openRows.reduce((totalValue, row) => totalValue + installmentValue, 0),
            remainingInstallmentNumbers: remainingNumbers,
            presentValues: openRows.map(row => ({ number: row.number, amount: row.presentValue })),
            origin: 'pdf', quality: 'confirmed'
        }] : [];
        return buildDraft({
            provider: 'Santander', documentType: 'Demonstrativo Descritivo de Crédito', name: 'Santander',
            contractNumber: capture(normalized, /Nr\.\s*Contrato\s*:\s*([\w-]+)/i),
            receivedAmount: money(capture(normalized, /Valor Solicitado\s*:\s*([\d.]+,\d{2})/i)),
            financedAmount: money(capture(normalized, /Vlr\.\s*Financiado\s*:\s*([\d.]+,\d{2})/i)),
            iofAmount: money(capture(normalized, /IOF\s*:\s*([\d.]+,\d{2})/i)),
            monthlyRate: contractMonthlyRate,
            annualRate: contractAnnualRate,
            cetMonthly: cetMonthlyRate,
            cetAnnual: cetAnnualRate,
            startDate: isoDate(capture(normalized, /Dt\.\s*Formaliza[cç][aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)),
            installments,
            nominalInstallmentValue: installmentValue,
            totalToPay: installmentValue * total,
            officialBalanceSnapshots,
            projectionMode: 'discounted_last_installments',
            documentFindings: {
                paidInstallments: movementRows.filter(row => row.documentStatus === 'paid'),
                anticipatedInstallments: movementRows.filter(row => row.documentStatus === 'anticipated'),
                openInstallments: openRows,
                totalDetectedPaid: movementRows.reduce((sum, row) => sum + Number(row.totalPaid || 0), 0),
                totalDetectedDiscount: movementRows.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0),
                requiresMovementReview: movementRows.length > 0
            },
            warnings: ['Foram separados a parcela nominal e os valores presentes. Nenhum pagamento será importado ou confirmado automaticamente.', 'As movimentações detectadas exigem revisão antes de qualquer lançamento.']
        });
    };

    const parse = (text) => {
        const normalized = normalizeText(text);
        if (/99Pay|C[ÉE]DULA DE CR[ÉE]DITO BANC[ÁA]RIO/i.test(normalized)) return parse99Pay(text);
        if (/Banco Santander|Documento Descritivo de Cr[ée]dito/i.test(normalized)) return parseSantander(text);
        return null;
    };

    const extractPdfText = async (file) => {
        try {
            if (root.pdfjsReady) await root.pdfjsReady;
        } catch (_) {
            throw new Error('Não foi possível iniciar o leitor de PDF deste aplicativo. Atualize a página e tente novamente.');
        }
        if (!root.pdfjsLib) throw new Error('Leitor de PDF indisponível. Atualize a página e tente novamente.');
        const buffer = await file.arrayBuffer();
        const pdf = await root.pdfjsLib.getDocument({ data: buffer }).promise;
        const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
            const content = await (await pdf.getPage(index + 1)).getTextContent();
            return content.items.map(item => item.str).join(' ');
        }));
        return pages.join('\n');
    };

    return Object.freeze({ normalizeText, parse, parse99Pay, parseSantander, extractPdfText });
});
