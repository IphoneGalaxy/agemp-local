(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ExcelReportExporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const safeName = value => String(value || 'relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
    const columnWidth = (rows, key) => Math.min(42, Math.max(12, String(key).length + 2, ...rows.slice(0, 200).map(row => String(row[key] ?? '').length + 2)));
    const exportReport = ({ report, filename, XLSX: xlsx }) => {
        const lib = xlsx || (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
        if (!lib) throw new Error('O gerador de Excel ainda não foi carregado. Atualize a página e tente novamente.');
        const workbook = lib.utils.book_new();
        Object.entries(report?.sheets || {}).forEach(([name, rows]) => {
            const safeRows = rows.length ? rows : [{ Informação: 'Nenhum registro para os filtros selecionados.' }];
            const worksheet = lib.utils.json_to_sheet(safeRows, { cellDates: true });
            const headers = Object.keys(safeRows[0]);
            worksheet['!cols'] = headers.map(key => ({ wch: columnWidth(safeRows, key) }));
            worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1:A1' };
            worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
            const range = lib.utils.decode_range(worksheet['!ref'] || 'A1:A1');
            for (let column = range.s.c; column <= range.e.c; column += 1) {
                const cell = worksheet[lib.utils.encode_cell({ r: 0, c: column })];
                if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { vertical: 'center' } };
            }
            headers.forEach((header, column) => {
                const isPercent = /\(%\)|progresso/i.test(header);
                const isMoney = /(valor|total|principal|juros|pago|saldo|custo|economia|resultado|iof|parcela|amortiza|desconto|sobra|capital|livre)/i.test(header) && !/data|quantidade|total de parcelas|parcelas restantes/i.test(header);
                for (let row = 1; row <= range.e.r; row += 1) {
                    const cell = worksheet[lib.utils.encode_cell({ r: row, c: column })];
                    if (!cell || typeof cell.v !== 'number') continue;
                    if (isPercent) cell.z = '0.0%';
                    else if (isMoney) cell.z = 'R$ #,##0.00;[Red](R$ #,##0.00);-';
                }
            });
            lib.utils.book_append_sheet(workbook, worksheet, name.slice(0, 31));
        });
        if (workbook.SheetNames.length === 0) lib.utils.book_append_sheet(workbook, lib.utils.aoa_to_sheet([['Nenhum conteúdo selecionado']]), 'Resumo');
        const finalName = filename || `extrato_completo_${new Date().toISOString().slice(0, 10)}.xlsx`;
        lib.writeFile(workbook, safeName(finalName.replace(/\.xlsx$/i, '')) + '.xlsx', { compression: true, cellStyles: true });
        return finalName;
    };

    return Object.freeze({ exportReport, safeName });
});
