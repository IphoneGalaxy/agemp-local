(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.BankDocumentImporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const normalizeText = (text) => String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const money = (value) => {
        const compact = String(value || '').replace(/[^0-9,.-]/g, '');
        if (!compact) return 0;
        return Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact) || 0;
    };
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
            cetMonthly: values.cetMonthly || 0,
            totalInstallments: values.installments.length,
            installmentValue: values.installments[0]?.amount || 0,
            totalToPay: values.installments.reduce((total, item) => total + item.amount, 0),
            additionalFees: values.iofAmount || 0,
            iofAmount: values.iofAmount || 0,
            startDate: values.startDate || '',
            firstDueDate: values.installments[0]?.dueDate || '',
            installments: values.installments,
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
            cetMonthly: money(capture(normalized, /CET\) Mensal\s*:?\s*([\d,]+)%/i)),
            startDate: isoDate(capture(normalized, /Data de (?:Emiss[aã]o|Libera[cç][aã]o dos Recursos)[^\d]*(\d{2}\/\d{2}\/\d{4})/i)),
            installments
        });
    };

    const parseSantander = (text) => {
        const normalized = normalizeText(text);
        const total = Number(capture(normalized, /Nr\.\s*Parcelas\s*:\s*(\d+)/i));
        const scheduleRows = [...String(text || '').matchAll(/^\s*(\d+)\s+(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}\/\d{2}\/\d{4})?\s+([\d.]+,\d{2})/gm)]
            .map(match => ({ number: Number(match[1]), dueDate: isoDate(match[2]), amount: money(match[3]) }));
        const uniqueRows = scheduleRows.filter((row, index, all) => all.findIndex(item => item.number === row.number) === index);
        const scheduleLine = uniqueRows[0];
        const installmentValue = money(scheduleLine?.amount || capture(normalized, /Valor da Parcela[^\d]*([\d.]+,\d{2})/i));
        if (!total || !installmentValue) return null;
        const firstDueDate = isoDate(capture(normalized, /Dt\.\s*1[ºo]\s*Vcto\.?\s*:\s*(\d{2}\/\d{2}\/\d{4})/i));
        const installments = Array.from({ length: total }, (_, index) => {
            const row = uniqueRows.find(item => item.number === index + 1);
            return row || { number: index + 1, amount: installmentValue };
        });
        if (firstDueDate) installments[0].dueDate = firstDueDate;
        return buildDraft({
            provider: 'Santander', documentType: 'Demonstrativo Descritivo de Crédito', name: 'Santander',
            contractNumber: capture(normalized, /Nr\.\s*Contrato\s*:\s*([\w-]+)/i),
            receivedAmount: money(capture(normalized, /Valor Solicitado\s*:\s*([\d.]+,\d{2})/i)),
            financedAmount: money(capture(normalized, /Vlr\.\s*Financiado\s*:\s*([\d.]+,\d{2})/i)),
            iofAmount: money(capture(normalized, /IOF\s*:\s*([\d.]+,\d{2})/i)),
            monthlyRate: money(capture(normalized, /Tx\.\s*Efet\.\s*do contrato:[\s\S]{0,180}?\d+[,.]\d+\s*%\s*a\.a\.\s+([\d,]+)\s*%\s*a\.m/i)),
            cetMonthly: money(capture(normalized, /Valor Presente\):\s*([\d,]+)\s*%\s*a\.m/i)),
            startDate: isoDate(capture(normalized, /Dt\.\s*Formaliza[cç][aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)),
            installments,
            warnings: ['O demonstrativo pode conter parcelas já liquidadas. Nenhum pagamento será importado ou confirmado automaticamente.']
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
