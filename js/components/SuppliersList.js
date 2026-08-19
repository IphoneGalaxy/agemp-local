// Componente: Aba Fornecedores (Extrato Somente Leitura de Backups Recebidos de Credores)
function SuppliersList({ suppliers = [], setSuppliers, selectedSupplier, setSelectedSupplier, utils }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [activeLoanTab, setActiveLoanTab] = useState(null);

    const filteredSuppliers = useMemo(() => {
        if (!searchTerm.trim()) return suppliers;
        const term = searchTerm.toLowerCase();
        return suppliers.filter(s => 
            (s.name && s.name.toLowerCase().includes(term)) ||
            (s.publicKey && s.publicKey.toLowerCase().includes(term))
        );
    }, [suppliers, searchTerm]);

    const handleDeleteSupplier = (id, e) => {
        if (e) e.stopPropagation();
        const updated = suppliers.filter(s => s.id !== id);
        setSuppliers(updated);
        if (selectedSupplier && selectedSupplier.id === id) {
            setSelectedSupplier(null);
        }
        setDeleteConfirmId(null);
        if (utils?.showToast) utils.showToast('🗑️ Registro do fornecedor removido.');
    };

    const formatDate = (isoStr) => {
        if (!isoStr) return 'Não informada';
        try {
            const date = new Date(isoStr);
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return isoStr;
        }
    };

    // VISÃO DETALHADA DO FORNECEDOR SELECIONADO (EXTRATO SOMENTE LEITURA)
    if (selectedSupplier) {
        const supplier = suppliers.find(s => s.id === selectedSupplier.id) || selectedSupplier;
        const loans = supplier.loans || [];

        // Totais consolidados
        let totalOriginalPrincipal = 0;
        let totalCurrentBalance = 0;
        let totalPaid = 0;

        const calculatedLoans = loans.map(loan => {
            const principal = Number(loan.amount || 0);
            totalOriginalPrincipal += principal;

            const payments = loan.payments || [];
            let loanPaid = 0;
            payments.forEach(p => {
                loanPaid += Number(p.amount || 0);
            });
            totalPaid += loanPaid;

            // Saldo estimado ou calculado
            const interestRate = Number(loan.interestRate || 10);
            let remaining = principal;
            payments.forEach(p => {
                if (p.kind === 'principal_amortization' || p.kind === 'principal_settlement' || p.kind === 'interest_and_principal_settlement' || p.type === 'amortization' || p.type === 'settlement') {
                    remaining = Math.max(0, remaining - Number(p.amount || 0));
                }
            });
            totalCurrentBalance += remaining;

            return {
                ...loan,
                remainingBalance: remaining,
                totalPaid: loanPaid,
                isSettled: remaining <= 0.01
            };
        });

        return (
            <div className="p-4 sm:p-6 space-y-5 animate-fade-in">
                {/* Cabeçalho com botão voltar */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <button
                        onClick={() => setSelectedSupplier(null)}
                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-all"
                    >
                        <span>←</span>
                        <span>Voltar para Fornecedores</span>
                    </button>
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 font-bold text-[11px] px-2.5 py-1 rounded-full border border-amber-200">
                        <span>🔒</span> Somente Leitura
                    </span>
                </div>

                {/* Card Principal do Fornecedor */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl font-black shadow-inner">
                                🏢
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-800 tracking-tight">{supplier.name}</h2>
                                <p className="text-xs text-slate-500 font-medium">Credor / Emissor dos Contratos</p>
                            </div>
                        </div>

                        <div className="text-left sm:text-right bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Última Sincronização</p>
                            <p className="text-xs font-bold text-slate-700">{formatDate(supplier.lastSyncDate)}</p>
                        </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Chave Pública do Fornecedor:</p>
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-800 text-xs break-all select-all">
                                {supplier.publicKey || 'PUB-NÃO INFORMADA'}
                            </span>
                            {supplier.publicKey && (
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(supplier.publicKey);
                                        if (utils?.showToast) utils.showToast('📋 Chave do fornecedor copiada!');
                                    }}
                                    title="Copiar Chave Pública"
                                    className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-xs shrink-0"
                                >
                                    Copiar
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-amber-900 text-xs leading-relaxed flex items-start gap-2.5">
                        <span className="text-base shrink-0 mt-0.5">ℹ️</span>
                        <div>
                            <strong>Extrato emitido pelo credor:</strong> Estes dados são atualizados exclusivamente através dos arquivos de backup que seu fornecedor envia para você. Para atualizar, basta importar o novo arquivo com o PIN fornecido.
                        </div>
                    </div>
                </div>

                {/* Métricas Consolidadas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo Devedor Aberto</p>
                        <p className="text-lg font-black text-rose-600 mt-0.5">
                            R$ {totalCurrentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Já Pago</p>
                        <p className="text-lg font-black text-emerald-600 mt-0.5">
                            R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Contratos</p>
                        <p className="text-lg font-black text-slate-800 mt-0.5">
                            {loans.length} {loans.length === 1 ? 'contrato' : 'contratos'}
                        </p>
                    </div>
                </div>

                {/* Lista de Contratos do Fornecedor */}
                <div className="space-y-3 pt-2">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center justify-between">
                        <span>Contratos e Empréstimos</span>
                        <span className="text-xs text-slate-500 font-normal">{loans.length} cadastrados</span>
                    </h3>

                    {calculatedLoans.length === 0 ? (
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 text-xs">
                            Nenhum contrato listado neste fornecedor.
                        </div>
                    ) : (
                        calculatedLoans.map((loan, idx) => {
                            const isExpanded = activeLoanTab === loan.id || (activeLoanTab === null && idx === 0);
                            const payments = loan.payments || [];

                            return (
                                <div key={loan.id || idx} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3.5 transition-all">
                                    <div 
                                        className="flex items-center justify-between cursor-pointer"
                                        onClick={() => setActiveLoanTab(isExpanded ? '__none__' : loan.id)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${loan.isSettled ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 text-sm">
                                                        R$ {Number(loan.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${loan.isSettled ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                                        {loan.isSettled ? 'Quitado' : 'Ativo'}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 font-medium">
                                                    Início: {loan.startDate ? new Date(loan.startDate).toLocaleDateString('pt-BR') : 'Data não informada'} • Vencimento dia {loan.dueDay || '30'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-right flex items-center gap-3">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Taxa</p>
                                                <p className="text-xs font-black text-slate-700">{loan.interestRate || 10}% a.m.</p>
                                            </div>
                                            <span className="text-slate-400 text-sm font-bold">
                                                {isExpanded ? '▲' : '▼'}
                                            </span>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="pt-3 border-t border-slate-100 space-y-3 animate-fade-in">
                                            {/* Detalhes do Contrato */}
                                            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl text-xs">
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Saldo Restante</span>
                                                    <span className="font-bold text-slate-800">
                                                        R$ {loan.remainingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Amortizado</span>
                                                    <span className="font-bold text-emerald-700">
                                                        R$ {loan.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                {loan.contractNotes && (
                                                    <div className="col-span-2 pt-1">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Observações do Fornecedor</span>
                                                        <span className="text-slate-600 text-[11px]">{loan.contractNotes}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Histórico de Pagamentos */}
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center justify-between">
                                                    <span>Extrato de Baixas / Pagamentos ({payments.length})</span>
                                                </h4>
                                                {payments.length === 0 ? (
                                                    <p className="text-[11px] text-slate-400 italic bg-slate-50 p-3 rounded-xl text-center">
                                                        Nenhum pagamento registrado pelo fornecedor até o momento.
                                                    </p>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {payments.map((pmt, pIdx) => (
                                                            <div key={pmt.id || pIdx} className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between text-xs border border-slate-100">
                                                                <div>
                                                                    <span className="font-bold text-slate-800">
                                                                        {pmt.date ? new Date(pmt.date).toLocaleDateString('pt-BR') : 'Data n/d'}
                                                                    </span>
                                                                    <p className="text-[10px] text-slate-500">
                                                                        {pmt.description || pmt.kind || 'Pagamento registrado'}
                                                                    </p>
                                                                </div>
                                                                <span className="font-black text-emerald-600">
                                                                    + R$ {Number(pmt.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    }

    // LISTAGEM PRINCIPAL DE FORNECEDORES
    return (
        <div className="p-4 sm:p-6 space-y-5 animate-fade-in">
            {/* Header da Aba */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold shadow-inner shrink-0">
                            🏢
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-black text-slate-800 tracking-tight truncate">Fornecedores</h2>
                            <p className="text-xs text-slate-500 truncate">Extratos em modo somente leitura</p>
                        </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full border border-indigo-100 shadow-xs">
                        {suppliers.length} {suppliers.length === 1 ? 'fornecedor' : 'fornecedores'}
                    </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 leading-relaxed flex items-start gap-2">
                    <span className="text-base shrink-0">💡</span>
                    <div>
                        Quando um credor/fornecedor gerar e enviar um backup de empréstimo para a sua Chave Pública, clique em <strong>"Importar"</strong> no topo para sincronizar os dados aqui automaticamente.
                    </div>
                </div>

                {suppliers.length > 0 && (
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar fornecedor por nome ou chave..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                )}
            </div>

            {/* Lista de Cards de Fornecedores */}
            <div className="space-y-3">
                {filteredSuppliers.length === 0 ? (
                    <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-3 shadow-sm">
                        <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mx-auto">
                            🏢
                        </div>
                        <h3 className="font-bold text-slate-700 text-sm">Nenhum fornecedor cadastrado</h3>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                            Envie a sua Chave Pública para o seu fornecedor. Quando ele te enviar o arquivo de backup e o PIN de 4 dígitos, use o botão "Importar" para adicioná-lo aqui.
                        </p>
                    </div>
                ) : (
                    filteredSuppliers.map((supplier) => {
                        const loans = supplier.loans || [];
                        let totalDebt = 0;
                        let totalPaid = 0;
                        loans.forEach(loan => {
                            let rem = Number(loan.amount || 0);
                            (loan.payments || []).forEach(p => {
                                totalPaid += Number(p.amount || 0);
                                if (p.kind === 'principal_amortization' || p.kind === 'principal_settlement' || p.type === 'amortization' || p.type === 'settlement') {
                                    rem = Math.max(0, rem - Number(p.amount || 0));
                                }
                            });
                            totalDebt += rem;
                        });

                        return (
                            <div
                                key={supplier.id}
                                onClick={() => setSelectedSupplier(supplier)}
                                className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer space-y-3 group"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-lg font-bold group-hover:scale-105 transition-transform">
                                            🏢
                                        </div>
                                        <div>
                                            <h3 className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">
                                                {supplier.name}
                                            </h3>
                                            <p className="text-[11px] font-mono text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                                                {supplier.publicKey || 'Chave não informada'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                                            🔒 Somente Leitura
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo Devedor</p>
                                        <p className="font-black text-rose-600">
                                            R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Contratos Ativos</p>
                                        <p className="font-black text-slate-700">
                                            {loans.length} {loans.length === 1 ? 'contrato' : 'contratos'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <span className="text-[10px] text-slate-400">
                                        Sincronizado: {formatDate(supplier.lastSyncDate)}
                                    </span>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteConfirmId(supplier.id);
                                            }}
                                            className="text-[11px] text-red-500 hover:text-red-700 font-bold px-2 py-1 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            Excluir
                                        </button>
                                        <span className="text-xs text-indigo-600 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                                            Ver Extrato →
                                        </span>
                                    </div>
                                </div>

                                {deleteConfirmId === supplier.id && (
                                    <div 
                                        className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-2 mt-2"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <p className="text-red-900 font-bold">Deseja remover este fornecedor do seu aplicativo?</p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setDeleteConfirmId(null)}
                                                className="flex-1 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-xs"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteSupplier(supplier.id, e)}
                                                className="flex-1 py-1.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:bg-red-700"
                                            >
                                                Confirmar Remoção
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
