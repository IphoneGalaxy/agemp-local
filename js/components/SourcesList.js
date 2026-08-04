            // --- COMPONENTE ORIGENS DE CAPITAL ---
            const SourcesList = ({ state, actions, utils }) => {
                const { capitalSources, bankPayments, clients, fundsTransactions } = state;
                const { setCapitalSources } = actions;
                const { showToast, getSourceSummary } = utils;
                const [showForm, setShowForm] = useState(false);
                const [sourceName, setSourceName] = useState('');
                const [sourceType, setSourceType] = useState('own');
                const [bankReceived, setBankReceived] = useState('');
                const [bankFinanced, setBankFinanced] = useState('');
                const [bankRate, setBankRate] = useState('');
                const [bankCet, setBankCet] = useState('');
                const [bankInstallments, setBankInstallments] = useState('');
                const [bankInstallmentValue, setBankInstallmentValue] = useState('');
                const [bankFees, setBankFees] = useState('');
                const [bankStartDate, setBankStartDate] = useState(FinanceEngine.localIsoDate(new Date()));
                const [bankFirstDueDate, setBankFirstDueDate] = useState('');

                const handleAddSource = (e) => {
                    e.preventDefault();
                    if (!sourceName.trim()) return;

                    if (sourceType === 'bank') {
                        const received = Number(bankReceived);
                        const installments = Number(bankInstallments);
                        const installmentVal = Number(bankInstallmentValue);
                        if (!received || !installments || !installmentVal) return;
                        setCapitalSources([{
                            id: generateId(), type: 'bank', name: sourceName.trim(),
                            receivedAmount: received,
                            financedAmount: Number(bankFinanced) || received,
                            monthlyRate: Number(bankRate) || 0,
                            contractRateMonthly: Number(bankRate) || 0,
                            cetMonthly: Number(bankCet) || 0,
                            totalInstallments: installments, installmentValue: installmentVal,
                            totalToPay: installmentVal * installments,
                            additionalFees: Number(bankFees) || 0,
                            iofAmount: Number(bankFees) || 0,
                            startDate: bankStartDate,
                            firstDueDate: bankFirstDueDate || bankStartDate,
                            status: 'active', totalPaidToBank: 0, paidInstallments: 0,
                            monthlyReserve: 0, amortizationFund: 0,
                            officialBalanceSnapshots: []
                        }, ...capitalSources]);
                    } else {
                        setCapitalSources([{ id: generateId(), type: 'own', name: sourceName.trim() }, ...capitalSources]);
                    }
                    setSourceName(''); setSourceType('own'); setBankReceived(''); setBankFinanced(''); setBankRate(''); setBankCet('');
                    setBankInstallments(''); setBankInstallmentValue(''); setBankFees('');
                    setBankStartDate(FinanceEngine.localIsoDate(new Date())); setBankFirstDueDate(''); setShowForm(false);
                    showToast(sourceType === 'bank' ? '🏦 Origem bancária criada!' : '💰 Origem própria criada!');
                };

                return (
                    <div className="p-4 space-y-6 pb-20">
                        {!showForm ? (
                            <button data-testid="origens-btn-nova" onClick={() => setShowForm(true)} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md">+ Nova Origem</button>
                        ) : (
                            <form onSubmit={handleAddSource} className="bg-white rounded-2xl p-5 shadow-md border border-gray-200 animate-fade-in">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-800 text-lg">Nova Origem de Capital</h3>
                                    <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-sm font-bold">✕</button>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <button data-testid="origens-form-tipo-proprio" type="button" onClick={() => setSourceType('own')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${sourceType === 'own' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>💰 Próprio</button>
                                    <button data-testid="origens-form-tipo-banco" type="button" onClick={() => setSourceType('bank')} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${sourceType === 'bank' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>🏦 Banco</button>
                                </div>
                                <input data-testid="origens-form-nome" type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-1" placeholder={sourceType === 'own' ? 'Nome (ex: Poupança)' : 'Nome do banco (ex: Itaú)'} value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
                                {sourceType === 'bank' && (
                                    <div className="space-y-3 border-t border-gray-100 pt-4 mt-3 animate-fade-in">
                                        <p className="text-xs font-bold text-purple-700 uppercase">Dados do Empréstimo Bancário</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Valor Recebido (R$)</label><input type="number" step="0.01" required className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="0,00" value={bankReceived} onChange={(e) => setBankReceived(e.target.value)} /></div>
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Valor Financiado (R$)</label><input type="number" step="0.01" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="0,00" value={bankFinanced} onChange={(e) => setBankFinanced(e.target.value)} /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Taxa do Contrato (% a.m.)</label><input type="number" step="0.0001" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="1,5268" value={bankRate} onChange={(e) => setBankRate(e.target.value)} /></div>
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">CET (% a.m.)</label><input type="number" step="0.01" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="1,67" value={bankCet} onChange={(e) => setBankCet(e.target.value)} /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Nº Parcelas</label><input type="number" required className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="61" value={bankInstallments} onChange={(e) => setBankInstallments(e.target.value)} /></div>
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Valor Parcela (R$)</label><input type="number" step="0.01" required className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="0,00" value={bankInstallmentValue} onChange={(e) => setBankInstallmentValue(e.target.value)} /></div>
                                        </div>
                                        {bankInstallments && bankInstallmentValue && (<div className="bg-purple-50 p-3 rounded-xl border border-purple-100"><p className="text-xs text-purple-700 font-bold">Total a pagar: {formatMoney(Number(bankInstallments) * Number(bankInstallmentValue))}</p></div>)}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">IOF / Taxas (R$)</label><input type="number" step="0.01" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="0,00" value={bankFees} onChange={(e) => setBankFees(e.target.value)} /></div>
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Data do Contrato</label><input type="date" required className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" value={bankStartDate} onChange={(e) => setBankStartDate(e.target.value)} /></div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-500 font-bold block mb-1">Vencimento da 1ª Parcela</label>
                                            <input type="date" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" value={bankFirstDueDate} onChange={(e) => setBankFirstDueDate(e.target.value)} />
                                        </div>
                                    </div>
                                )}
                                <div className="flex gap-2 mt-4">
                                    <button type="button" onClick={() => { setShowForm(false); setSourceType('own'); }} className="flex-1 p-3 bg-gray-100 rounded-xl font-medium">Cancelar</button>
                                    <button type="submit" className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">Salvar</button>
                                </div>
                            </form>
                        )}
                        <div className="space-y-3">
                            {capitalSources.map(source => {
                                const sourceSummary = getSourceSummary(source.id);
                                const available = sourceSummary.available;
                                const totalLent = sourceSummary.outstandingPrincipal;
                                const bankContract = source.type === 'bank'
                                    ? FinanceEngine.summarizeBankContract({ bank: source, bankPayments })
                                    : null;
                                const hasLinkedHistory = fundsTransactions.some(transaction => (
                                    FinanceEngine.belongsToSource(transaction.sourceId, source.id, capitalSources)
                                )) || clients.some(client => (client.loans || []).some(loan => (
                                    FinanceEngine.belongsToSource(loan.sourceId, source.id, capitalSources)
                                ))) || bankPayments.some(payment => (
                                    FinanceEngine.belongsToSource(payment.sourceId, source.id, capitalSources) ||
                                    FinanceEngine.getFundingBreakdown(payment).some(part => (
                                        FinanceEngine.belongsToSource(part.sourceId, source.id, capitalSources)
                                    ))
                                ));
                                const isPrimaryOwnSource = source.type === 'own' && source.id === FinanceEngine.getDefaultOwnSourceId(capitalSources);
                                const isDeletable = !hasLinkedHistory && !isPrimaryOwnSource;
                                return (
                                    <div key={source.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${source.type === 'bank' ? 'bg-purple-100' : 'bg-blue-100'}`}>{source.type === 'bank' ? '🏦' : '💰'}</div>
                                            <div className="flex-1">
                                                <p className="font-bold text-gray-800">{source.name}</p>
                                                <p className="text-xs text-gray-500">{source.type === 'bank' ? 'Empréstimo Bancário' : 'Capital Próprio'}</p>
                                            </div>
                                            {source.type === 'bank' && (<span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${source.status === 'active' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{source.status === 'active' ? 'Ativo' : 'Quitado'}</span>)}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-lg p-3">
                                            <div><p className="text-[10px] text-gray-400 uppercase">Disponível</p><p className="font-bold text-gray-800 text-sm">{formatMoney(available)}</p></div>
                                            <div><p className="text-[10px] text-gray-400 uppercase">Emprestado</p><p className="font-bold text-gray-800 text-sm">{formatMoney(totalLent)}</p></div>
                                        </div>
                                        {source.type === 'bank' && (
                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                                <div className="flex justify-between text-xs text-gray-500">
                                                    <span>Restantes: {bankContract.accountingRemainingCount}</span>
                                                    <span>Antecipadas: {bankContract.anticipatedCount}</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (bankContract.resolvedInPersonalControlCount / source.totalInstallments) * 100)}%` }}></div></div>
                                                {bankContract.pendingNormalCount > 0 && <p className="text-[10px] text-amber-600 font-bold mt-1">{bankContract.pendingNormalCount} parcela descontada em folha</p>}
                                            </div>
                                        )}
                                        <button data-testid={`source-remove-${source.id}`} onClick={() => {
                                            if (isPrimaryOwnSource) { showToast('❌ O Capital Próprio principal não pode ser removido.'); return; }
                                            if (hasLinkedHistory) { showToast('❌ Esta origem possui histórico vinculado e não pode ser removida.'); return; }
                                            if (window.confirm('Apagar esta origem? Esta ação não pode ser desfeita.')) {
                                                setCapitalSources(capitalSources.filter(s => s.id !== source.id));
                                                showToast('🗑️ Origem removida.');
                                            }
                                        }} className={`mt-3 text-[10px] font-bold ${isDeletable ? 'text-red-400 hover:text-red-600' : 'text-gray-400'}`}>🗑️ Remover</button>
                                    </div>
                                );
                            })}
                            {capitalSources.length === 0 && <p className="text-center text-gray-500 mt-10">Nenhuma origem cadastrada.</p>}
                        </div>
                    </div>
                );
};
