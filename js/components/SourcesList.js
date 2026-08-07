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
                const [bankAnnualRate, setBankAnnualRate] = useState('');
                const [bankCet, setBankCet] = useState('');
                const [bankCetAnnual, setBankCetAnnual] = useState('');
                const [bankInstallments, setBankInstallments] = useState('');
                const [bankInstallmentValue, setBankInstallmentValue] = useState('');
                const [bankFees, setBankFees] = useState('');
                const [bankStartDate, setBankStartDate] = useState(FinanceEngine.localIsoDate(new Date()));
                const [bankFirstDueDate, setBankFirstDueDate] = useState('');
                const [bankSchedule, setBankSchedule] = useState([]);
                const [importDraft, setImportDraft] = useState(null);
                const [importing, setImporting] = useState(false);
                const documentInputRef = useRef(null);

                const resetBankFields = () => {
                    setBankReceived(''); setBankFinanced(''); setBankRate(''); setBankAnnualRate('');
                    setBankCet(''); setBankCetAnnual('');
                    setBankInstallments(''); setBankInstallmentValue(''); setBankFees('');
                    setBankStartDate(FinanceEngine.localIsoDate(new Date())); setBankFirstDueDate('');
                    setBankSchedule([]); setImportDraft(null);
                };

                const applyImportDraft = (draft) => {
                    const source = draft.source;
                    setSourceType('bank'); setSourceName(source.name || '');
                    setBankReceived(String(source.receivedAmount || '')); setBankFinanced(String(source.financedAmount || ''));
                    setBankRate(String(source.monthlyRate || '')); setBankAnnualRate(String(source.contractRateAnnual || ''));
                    setBankCet(String(source.cetMonthly || '')); setBankCetAnnual(String(source.cetAnnual || ''));
                    setBankInstallments(String(source.totalInstallments || '')); setBankInstallmentValue(String(source.installmentValue || ''));
                    setBankFees(String(source.iofAmount || '')); setBankStartDate(source.startDate || FinanceEngine.localIsoDate(new Date()));
                    setBankFirstDueDate(source.firstDueDate || ''); setBankSchedule(source.installments || []);
                    setImportDraft(draft); setShowForm(true);
                };

                const handleImportDocument = async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                        showToast('❌ Selecione um arquivo PDF.'); return;
                    }
                    setImporting(true);
                    try {
                        const text = await BankDocumentImporter.extractPdfText(file);
                        const draft = BankDocumentImporter.parse(text);
                        if (!draft) {
                            showToast('⚠️ Não reconheci este padrão. Cadastre manualmente e guarde o PDF para consulta.');
                            return;
                        }
                        applyImportDraft(draft);
                        showToast(`📄 Dados de ${draft.provider} preenchidos para conferência.`);
                    } catch (error) {
                        showToast(`❌ Não foi possível ler o PDF: ${error.message || 'arquivo inválido.'}`);
                    } finally { setImporting(false); }
                };

                const handleAddSource = (e) => {
                    e.preventDefault();
                    if (!sourceName.trim()) return;

                    if (sourceType === 'bank') {
                        const received = Number(bankReceived);
                        const installments = Number(bankInstallments);
                        const installmentVal = Number(bankInstallmentValue);
                        if (!received || !installments || !installmentVal) return;
                        const confirmedImportMetadata = importDraft?.source?.importMetadata ? {
                            ...importDraft.source.importMetadata,
                            importMode: 'confirmed',
                            confirmedAt: new Date().toISOString()
                        } : undefined;
                        const duplicateSource = importDraft?.source?.contractNumber && capitalSources.find(source => (
                            source.type === 'bank' && source.contractNumber === importDraft.source.contractNumber &&
                            source.importMetadata?.provider === importDraft.provider
                        ));
                        if (duplicateSource) {
                            setCapitalSources(capitalSources.map(source => source.id === duplicateSource.id ? {
                                ...source,
                                contractRateAnnual: Number(bankAnnualRate) || source.contractRateAnnual || 0,
                                cetAnnual: Number(bankCetAnnual) || source.cetAnnual || 0,
                                importMetadata: confirmedImportMetadata
                            } : source));
                            setSourceName(''); setSourceType('own'); resetBankFields(); setShowForm(false);
                            showToast('✅ Dados técnicos do contrato existente atualizados!');
                            return;
                        }
                        setCapitalSources([{
                            id: generateId(), type: 'bank', name: sourceName.trim(),
                            receivedAmount: received,
                            financedAmount: Number(bankFinanced) || received,
                            monthlyRate: Number(bankRate) || 0,
                            contractRateMonthly: Number(bankRate) || 0,
                            contractRateAnnual: Number(bankAnnualRate) || 0,
                            cetMonthly: Number(bankCet) || 0,
                            cetAnnual: Number(bankCetAnnual) || 0,
                            totalInstallments: installments, installmentValue: installmentVal,
                            totalToPay: installmentVal * installments,
                            additionalFees: Number(bankFees) || 0,
                            iofAmount: Number(bankFees) || 0,
                            startDate: bankStartDate,
                            firstDueDate: bankFirstDueDate || bankStartDate,
                            status: 'active', totalPaidToBank: 0, paidInstallments: 0,
                            monthlyReserve: 0, amortizationFund: 0,
                            officialBalanceSnapshots: [],
                            contractNumber: importDraft?.source?.contractNumber || '',
                            installments: bankSchedule.map(item => ({ ...item })),
                            importMetadata: confirmedImportMetadata
                        }, ...capitalSources]);
                    } else {
                        setCapitalSources([{ id: generateId(), type: 'own', name: sourceName.trim() }, ...capitalSources]);
                    }
                    setSourceName(''); setSourceType('own'); resetBankFields(); setShowForm(false);
                    showToast(sourceType === 'bank' ? '🏦 Origem bancária criada!' : '💰 Origem própria criada!');
                };

                return (
                    <div className="p-4 space-y-6 pb-20">
                        {!showForm ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button data-testid="origens-btn-nova" onClick={() => setShowForm(true)} className="bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md">+ Nova Origem</button>
                                <button data-testid="origens-btn-importar-pdf" onClick={() => documentInputRef.current?.click()} disabled={importing} className="bg-purple-600 disabled:bg-purple-300 text-white py-3 rounded-xl font-bold shadow-md">{importing ? 'Lendo PDF…' : '📄 Importar PDF'}</button>
                                <input ref={documentInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleImportDocument} />
                            </div>
                        ) : (
                            <form onSubmit={handleAddSource} className="bg-white rounded-2xl p-5 shadow-md border border-gray-200 animate-fade-in">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-800 text-lg">Nova Origem de Capital</h3>
                                    <button type="button" onClick={() => { setShowForm(false); resetBankFields(); }} className="text-gray-400 hover:text-gray-600 text-sm font-bold">✕</button>
                                </div>
                                {importDraft && <div className="mb-4 p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-800"><p className="font-bold">📄 Rascunho importado de {importDraft.provider}</p><p className="mt-1">Confira e ajuste os campos abaixo. Nenhuma parcela, pagamento ou saldo foi confirmado pelo PDF.</p>{importDraft.warnings.map(warning => <p key={warning} className="mt-1 text-amber-700">⚠️ {warning}</p>)}</div>}
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
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">CET (% a.m.)</label><input type="number" step="0.0001" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="1,67" value={bankCet} onChange={(e) => setBankCet(e.target.value)} /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">Taxa do Contrato (% a.a.)</label><input type="number" step="0.0001" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="19,9419" value={bankAnnualRate} onChange={(e) => setBankAnnualRate(e.target.value)} /></div>
                                            <div><label className="text-[10px] text-gray-500 font-bold block mb-1">CET (% a.a.)</label><input type="number" step="0.0001" className="w-full p-2.5 border rounded-xl bg-gray-50 text-sm" placeholder="21,92" value={bankCetAnnual} onChange={(e) => setBankCetAnnual(e.target.value)} /></div>
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
                                        {bankSchedule.length > 0 && <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-xs text-purple-800"><p className="font-bold">Cronograma importado: {bankSchedule.length} parcelas</p><p className="mt-1">{bankSchedule.slice(0, 3).map(item => `#${item.number} ${item.dueDate ? formatDate(item.dueDate) : 'data a conferir'} · ${formatMoney(item.amount)}`).join(' • ')}</p></div>}
                                    </div>
                                )}
                                <div className="flex gap-2 mt-4">
                                    <button type="button" onClick={() => { setShowForm(false); setSourceType('own'); resetBankFields(); }} className="flex-1 p-3 bg-gray-100 rounded-xl font-medium">Cancelar</button>
                                    <button type="submit" className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">{importDraft ? 'Confirmar criação' : 'Salvar'}</button>
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
                                                {(() => {
                                                    const links = FinanceEngine.getBankOperationLinks({ bank: source, clients });
                                                    return (
                                                        <div className="mt-3 rounded-lg bg-purple-50 border border-purple-100 p-2.5 text-[10px] text-purple-800">
                                                            <p className="font-bold">Operação com clientes</p>
                                                            {links.loans.length > 0 ? <>
                                                                <p className="mt-1">{links.clientCount} cliente{links.clientCount === 1 ? '' : 's'} · principal exposto: {formatMoney(links.outstandingPrincipal)}</p>
                                                                <p className="mt-0.5">Juros mensais previstos: {formatMoney(links.monthlyInterest)}</p>
                                                                <p className="mt-1 text-purple-600">{links.loans.map(link => `${link.clientName} (${formatMoney(link.outstandingPrincipal)})`).join(' · ')}</p>
                                                            </> : <p className="mt-1 text-amber-700">Ainda não há cliente vinculado. Use a edição do empréstimo do cliente para definir esta origem.</p>}
                                                        </div>
                                                    );
                                                })()}
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
