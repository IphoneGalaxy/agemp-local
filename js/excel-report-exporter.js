(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ExcelReportExporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const safeName = value => String(value || 'relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
    const moneyFormat = '"R$" #,##0.00;[Red]("R$" #,##0.00);"R$" 0.00';
    const colors = { navy: '183153', blue: '2457A7', pale: 'EFF4FA', green: '147D64', amber: 'FFF3D6', ink: '24354B', muted: '64748B', white: 'FFFFFF' };
    const moneyColumn = header => /(valor|total|principal|juros|pago|pagamento|recebimento|saldo|custo|economia|resultado|iof|parcela|amortiza|desconto|sobra|capital|livre|complemento)/i.test(header) && !/(data|quantidade|total de parcelas|parcelas restantes|parcelas eliminadas|taxa|progresso|\(%\))/i.test(header) && header !== 'Parcela';
    const percentColumn = header => /\(%\)|progresso/i.test(header);
    const totalsBySheet = {
        'Empréstimos': ['Valor original', 'Juros recebidos', 'Principal recuperado', 'Principal pendente', 'Falta para 100%'],
        'Recebimentos': ['Valor recebido', 'Juros', 'Principal', 'Não classificado'],
        'Movimentações': ['Valor', 'Juros', 'Principal'],
        'Amortizações': ['Valor pago', 'Valor nominal eliminado', 'Desconto'],
        'Projeções': ['Juros esperados', 'Parcela normal', 'Amortização', 'Complemento próprio'],
        'Parcelas bancárias': ['Valor nominal']
    };
    const descriptions = {
        'Empréstimos': 'Posição dos empréstimos na data-base; valores acumulados desde a contratação.',
        'Recebimentos': 'Entradas registradas no período selecionado, com separação de juros e principal.',
        'Movimentações': 'Fluxo do período: recebimentos, capital e pagamentos bancários. Saídas têm sinal negativo.',
        'Operações bancárias': 'Contratos completos dos bancos selecionados. Projeções não são valores oficiais.',
        'Parcelas bancárias': 'Cronograma contratual filtrado pela data de vencimento.',
        'Amortizações': 'Antecipações registradas no período, parcelas eliminadas e descontos.',
        'Projeções': 'Cenário futuro estimado. Sobra e resultado acumulado não devem ser somados entre meses.',
        'Parâmetros': 'Premissas e dados contratuais usados para calcular as projeções.',
        'Alertas': 'Registros que precisam de conferência. Nenhum dado é corrigido automaticamente.'
    };
    const brDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value.split('-').reverse().join('/') : value || 'Não informado';
    const buildWorkbook = ({ report, XLSX: lib }) => {
        if (!lib) throw new Error('O gerador de Excel ainda não foi carregado. Atualize a página e tente novamente.');
        const workbook = lib.utils.book_new();
        workbook.Props = { Title: 'Relatório financeiro', Subject: 'Controle de empréstimos e operações bancárias', Author: 'Finanças Pro' };
        const context = report.context || {};
        const names = Object.keys(report.sheets || {});
        const hasSummary = names.includes('Resumo');
        const firstSheet = hasSummary ? 'Resumo' : names[0];
        const setCell = (sheet, row, column, value, options = {}) => {
            const address = lib.utils.encode_cell({ r: row, c: column });
            const numeric = typeof value === 'number';
            sheet[address] = { t: numeric ? 'n' : 's', v: value ?? '', ...options, s: {
                font: { name: 'Calibri', sz: 11, color: { rgb: colors.ink } },
                alignment: { vertical: 'center', wrapText: true, horizontal: numeric ? 'right' : 'left' }, ...options.s
            } };
            return sheet[address];
        };
        const mergeLine = (sheet, row, lastColumn, text, fill, color = colors.ink, size = 11) => {
            for (let col = 0; col <= lastColumn; col++) setCell(sheet, row, col, col ? '' : text, { s: {
                font: { name: 'Calibri', sz: size, bold: true, color: { rgb: color } },
                fill: { fgColor: { rgb: fill } }, alignment: { vertical: 'center', wrapText: true }
            } });
            sheet['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: lastColumn } });
        };
        const link = (sheet, row, label, target, lastColumn = 0) => {
            if (lastColumn) mergeLine(sheet, row, lastColumn, label, colors.pale, colors.blue);
            const cell = sheet[lib.utils.encode_cell({ r: row, c: 0 })] || setCell(sheet, row, 0, label);
            cell.v = label;
            cell.l = { Target: `#'${target.replace(/'/g, "''")}'!A1`, Tooltip: `Abrir ${target}` };
            cell.s.font = { name: 'Calibri', sz: 11, bold: true, color: { rgb: colors.blue }, underline: true };
        };
        Object.entries(report.sheets || {}).forEach(([name, rows]) => {
            const summary = name === 'Resumo';
            const headers = summary ? ['Indicador', 'Valor', 'Natureza'] : Object.keys(rows[0] || { Informação: '' });
            const lastColumn = Math.max(2, headers.length - 1);
            const sheet = { '!merges': [], '!rows': [] };
            mergeLine(sheet, 0, lastColumn, `FINANÇAS PRO  |  ${summary ? 'RELATÓRIO FINANCEIRO' : name.toUpperCase()}`, colors.navy, colors.white, 18);
            mergeLine(sheet, 1, lastColumn, `Data-base: ${brDate(context.referenceDate || report.planning?.referenceDate)}`, colors.pale);
            mergeLine(sheet, 2, lastColumn, `Cliente: ${context.clientLabel || 'Todos'}  •  Origem: ${context.sourceLabel || 'Todas'}`, colors.white);
            mergeLine(sheet, 3, lastColumn, `Período: ${context.periodLabel || 'Desde o início, sem limite final'}`, colors.white);
            mergeLine(sheet, 4, lastColumn, summary ? context.notes || 'Realizado e estimado são apresentados separadamente.' : descriptions[name] || '', colors.pale, colors.muted);
            if (!summary && firstSheet && firstSheet !== name) link(sheet, 5, `Voltar para ${firstSheet}`, firstSheet, lastColumn);
            const dataRows = summary ? Object.entries(rows[0] || {}).map(([label, value]) => {
                const estimated = /projetad|esperad/i.test(label);
                const position = /pendente|originalmente|quantidade/i.test(label);
                return { Indicador: label, Valor: value, Natureza: estimated ? 'Estimado' : position ? 'Posição na data-base' : /período/.test(label) ? 'Realizado no período' : 'Acumulado / informação' };
            }) : rows;
            headers.forEach((header, col) => setCell(sheet, 6, col, header, { s: {
                font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: colors.white } },
                fill: { fgColor: { rgb: colors.blue } }, alignment: { wrapText: true, vertical: 'center' }
            } }));
            const safeRows = dataRows.length ? dataRows : [{ [headers[0]]: 'Nenhum registro para os filtros selecionados.' }];
            safeRows.forEach((row, index) => headers.forEach((header, col) => {
                const value = row[header] ?? '';
                const cell = setCell(sheet, index + 7, col, value, { s: {
                    font: { name: 'Calibri', sz: 11, color: { rgb: typeof value === 'number' && value < 0 ? 'B42318' : colors.ink } },
                    fill: { fgColor: { rgb: index % 2 ? colors.pale : colors.white } },
                    alignment: { vertical: 'center', wrapText: true, horizontal: typeof value === 'number' ? 'right' : 'left', indent: 1 }
                } });
                if (typeof value === 'number') {
                    const metric = summary ? row.Indicador : header;
                    if (percentColumn(metric)) cell.z = '0.00%';
                    else if (moneyColumn(metric)) cell.z = moneyFormat;
                    else cell.z = '0.##';
                    // Contract rates are stored as percentage points, unlike milestone progress.
                    if (!summary && percentColumn(header) && !/progresso/i.test(header)) cell.z = '0.00"%"';
                }
                if (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) && /data|vencimento|previsão|quitação|positivo|^mês$/i.test(header === 'Valor' ? row.Indicador : header)) {
                    cell.t = 'n'; cell.v = Date.parse(`${value}T00:00:00Z`) / 86400000 + 25569; cell.z = 'dd/mm/yyyy';
                }
                if (/qualidade|natureza/i.test(header)) cell.s.fill = { fgColor: { rgb: /estimad|revisão/i.test(String(value)) ? colors.amber : 'E3F3ED' } };
            }));
            let finalRow = 7 + safeRows.length;
            if (!summary && dataRows.length && totalsBySheet[name]) {
                headers.forEach((header, col) => {
                    const cell = setCell(sheet, finalRow, col, col === 0 ? 'TOTAL DO RECORTE' : '', { s: { font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: colors.navy } }, fill: { fgColor: { rgb: 'DCE8F5' } } } });
                    if (totalsBySheet[name].includes(header)) {
                        const letter = lib.utils.encode_col(col);
                        cell.t = 'n'; cell.v = dataRows.reduce((sum, row) => sum + Number(row[header] || 0), 0);
                        cell.f = `SUM(${letter}8:${letter}${7 + dataRows.length})`; cell.z = moneyFormat;
                    }
                });
                finalRow++;
            }
            if (summary) {
                finalRow++;
                mergeLine(sheet, finalRow++, 2, 'ABRIR DETALHAMENTO', colors.navy, colors.white);
                names.filter(item => item !== 'Resumo').forEach(item => {
                    link(sheet, finalRow, `${item} — ${report.sheets[item].length} registros`, item, 2);
                    sheet['!rows'][finalRow++] = { hpt: 30 };
                });
                finalRow++;
                mergeLine(sheet, finalRow++, 2, 'COMO LER: use os links acima ou as abas do Excel. Nas tabelas de detalhe, deslize para os lados para ver todas as colunas.', colors.pale, colors.muted);
            }
            sheet['!ref'] = lib.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: finalRow, c: lastColumn } });
            sheet['!cols'] = summary ? [{ wch: 39 }, { wch: 23 }, { wch: 28 }] : Array.from({ length: lastColumn + 1 }, (_, col) => ({ wch: Math.min(40, Math.max(17, String(headers[col] || '').length + 3, ...rows.slice(0, 100).map(row => typeof row[headers[col]] === 'number' ? 19 : Math.min(40, String(row[headers[col]] ?? '').length + 2)))) }));
            [34, 26, 36, 28, summary ? 68 : 42, 26, 36].forEach((hpt, row) => { sheet['!rows'][row] = { hpt }; });
            for (let row = 7; row < 7 + safeRows.length; row++) sheet['!rows'][row] = { hpt: 34 };
            if (summary) sheet['!rows'][finalRow - 1] = { hpt: 48 };
            if (!summary && rows.length) sheet['!autofilter'] = { ref: lib.utils.encode_range({ s: { r: 6, c: 0 }, e: { r: 6 + rows.length, c: headers.length - 1 } }) };
            sheet['!margins'] = { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
            lib.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
        });
        if (!workbook.SheetNames.length) lib.utils.book_append_sheet(workbook, lib.utils.aoa_to_sheet([['Nenhum conteúdo selecionado']]), 'Resumo');
        return workbook;
    };
    const exportReport = ({ report, filename, XLSX }) => {
        const lib = XLSX || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
        const workbook = buildWorkbook({ report, XLSX: lib });
        const finalName = `${safeName((filename || `relatorio_financeiro_${new Date().toISOString().slice(0, 10)}`).replace(/\.xlsx$/i, ''))}.xlsx`;
        lib.writeFile(workbook, finalName, { compression: true, cellStyles: true });
        return finalName;
    };
    return Object.freeze({ exportReport, buildWorkbook, safeName });
});
