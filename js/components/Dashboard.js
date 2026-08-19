
            // --- COMPONENTE PAINEL ---
            const Dashboard = ({ onExport, onImport, state, actions, utils }) => {
                const { globalStats, capitalSources, clients, fundsTransactions, bankPayments, historicalInterestAllocations } = state;
                const { setFundsTransactions } = actions;
                const { showToast, getCapitalBalance, getSourceSummary } = utils;
                const [addAmount, setAddAmount] = useState('');
                const [selectedSourceId, setSelectedSourceId] = useState(() => FinanceEngine.getDefaultOwnSourceId(capitalSources));
                const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
                const [currentPasswordInput, setCurrentPasswordInput] = useState('');
                const [newPasswordInput, setNewPasswordInput] = useState('');
                const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
                const [changePasswordError, setChangePasswordError] = useState('');
                const [changePasswordSuccessKey, setChangePasswordSuccessKey] = useState('');
                const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
                const [accountPublicKey, setAccountPublicKey] = useState(() => typeof LocalAuth !== 'undefined' ? LocalAuth.getPublicKey() : null);
                const [isCopiedPubKey, setIsCopiedPubKey] = useState(false);
                const fileInputRef = useRef(null);

                const handleCopyPublicKey = () => {
                    if (!accountPublicKey) return;
                    navigator.clipboard.writeText(accountPublicKey).then(() => {
                        setIsCopiedPubKey(true);
                        showToast('📋 Chave pública copiada!');
                        setTimeout(() => setIsCopiedPubKey(false), 2500);
                    }).catch(() => {
                        showToast('📋 Chave: ' + accountPublicKey);
                    });
                };

                const handleSharePublicKey = () => {
                    if (!accountPublicKey) return;
                    if (navigator.share) {
                        navigator.share({
                            title: 'Minha Chave Pública - Finanças Pro',
                            text: `Minha chave pública no Finanças Pro: ${accountPublicKey}`
                        }).catch(() => {});
                    } else {
                        handleCopyPublicKey();
                    }
                };
                const integrityIssues = FinanceEngine.findIntegrityIssues({ capitalSources, clients, fundsTransactions, bankPayments });
                const orphanIssues = integrityIssues.filter(issue => issue.type.includes('orphan'));
                const duplicateIssues = integrityIssues.filter(issue => issue.type === 'possible-duplicate-bank-payment');
                const mismatchIssues = integrityIssues.filter(issue => issue.type === 'bank-funding-mismatch');
                const today = FinanceEngine.localIsoDate(new Date());

                useEffect(() => {
                    if (capitalSources.some(source => source.id === selectedSourceId)) return;
                    const ownSourceId = FinanceEngine.getDefaultOwnSourceId(capitalSources);
                    const fallbackId = capitalSources.find(source => source.id === ownSourceId)?.id || capitalSources[0]?.id || '';
                    setSelectedSourceId(fallbackId);
                }, [capitalSources, selectedSourceId]);

                const handleFund = (action) => {
                    if (!addAmount || Number(addAmount) <= 0) return;
                    if (!selectedSourceId) { showToast('❌ Selecione uma origem primeiro.'); return; }
                    let val = Number(addAmount);
                    if (action === 'remove') {
                        const sourceBalance = getCapitalBalance(selectedSourceId);
                        if (val > sourceBalance) {
                            showToast('❌ Saldo insuficiente nesta origem.');
                            return;
                        }
                        val = -val;
                    }
                    setFundsTransactions([{ id: generateId(), date: FinanceEngine.localIsoDate(new Date()), amount: val, sourceId: selectedSourceId }, ...fundsTransactions]);
                    setAddAmount('');
                    showToast(action === 'add' ? '💰 Saldo adicionado!' : '💸 Saldo retirado!');
                };

                return (
                    <div className="p-4 space-y-6 pb-20">
                        {/* Cards Principais */}
                        {!capitalSources.some(s => s.type === 'bank') ? (
                            <div className="grid grid-cols-2 gap-4">
                                <div data-testid="dash-total-disponivel" className="bg-blue-600 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                                    <p className="text-blue-100 text-sm font-medium relative z-10">Total Disponível</p>
                                    <p className="text-2xl font-bold mt-1 relative z-10">{formatMoney(globalStats.availableMoney)}</p>
                                </div>
                                <div data-testid="dash-total-na-rua" className="bg-orange-500 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                                    <p className="text-orange-100 text-sm font-medium relative z-10">Total na Rua</p>
                                    <p className="text-2xl font-bold mt-1 relative z-10">{formatMoney(globalStats.totalLent)}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Capital Próprio */}
                                {(() => {
                                    const ownSourceId = FinanceEngine.getDefaultOwnSourceId(capitalSources);
                                    const ownSummary = getSourceSummary(ownSourceId);
                                    return (
                                        <div data-testid="dash-capital-proprio" className="bg-blue-600 text-white rounded-2xl p-5 shadow-lg">
                                            <p className="text-blue-100 text-sm font-medium">💰 Capital Próprio</p>
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div>
                                                    <p className="text-blue-200 text-[10px] uppercase">Disponível</p>
                                                    <p className="text-xl font-bold">{formatMoney(ownSummary.available)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-blue-200 text-[10px] uppercase">Emprestado</p>
                                                    <p className="text-xl font-bold">{formatMoney(ownSummary.outstandingPrincipal)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                                {/* Cada Banco */}
                                {capitalSources.filter(s => s.type === 'bank').map(bank => {
                                    const contract = FinanceEngine.summarizeBankContract({ bank, bankPayments });
                                    const schedule = FinanceEngine.buildInstallmentSchedule({ bank, bankPayments });
                                    const bankSourceSummary = getSourceSummary(bank.id);
                                    const bd = globalStats.bankDetails?.find(b => b.sourceId === bank.id);
                                    const juros = bd ? bd.interestFromClients : 0;
                                    const recovery = bd?.recovery;
                                    const pendingInstallments = schedule.filter(item => (
                                        ['open', 'scheduled', 'pending_bank'].includes(item.status)
                                    ));
                                    const nextInstallments = pendingInstallments.slice(0, 2);
                                    const overdueInstallments = pendingInstallments.filter(item => (
                                        item.dueDate && item.dueDate < today && item.status !== 'pending_bank'
                                    ));
                                    const awaitingBankConfirmation = pendingInstallments.filter(item => item.status === 'pending_bank');
                                    const recoveryStatus = !recovery
                                        ? null
                                        : recovery.isCashPositive
                                            ? { label: 'Lucro de caixa', icon: '✅', detail: `Resultado positivo de ${formatMoney(recovery.cashProfit)}.` }
                                            : recovery.currentNetCash === 0
                                                ? { label: 'Em equilíbrio', icon: '⚖️', detail: 'Entradas e saídas da operação estão empatadas.' }
                                                : { label: 'Recuperando capital', icon: '⏳', detail: `Faltam ${formatMoney(recovery.ownCapitalStillToRecover)} para cobrir as saídas.` };
                                    return (
                                        <div key={bank.id} data-testid="dash-card-banco" className="bg-purple-600 text-white rounded-2xl p-5 shadow-lg">
                                            <p className="text-purple-100 text-sm font-medium">🏦 {bank.name}</p>
                                            <div className="grid grid-cols-2 gap-3 mt-3 text-center">
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Saldo p/ liquidação</p>
                                                    <p className="font-bold">{contract.officialBalance === null ? 'A confirmar' : formatMoney(contract.officialBalance)}</p>
                                                    {contract.officialBalanceDate && <p className="text-[8px] text-purple-200">Em {formatDate(contract.officialBalanceDate)}</p>}
                                                </div>
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Juros Gerados</p>
                                                    <p className="font-bold">{formatMoney(juros)}</p>
                                                </div>
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Fundo disponível</p>
                                                    <p className="font-bold">{formatMoney(bankSourceSummary.interestReserve)}</p>
                                                </div>
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Parcelas restantes</p>
                                                    <p className="font-bold">{contract.accountingRemainingCount}</p>
                                                    <p className="text-[8px] text-purple-200">{contract.anticipatedCount} antecipadas</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-purple-200 mt-2">
                                                <span>Próx: nº {contract.nextInstallmentNumber || '—'} · {formatMoney(bank.installmentValue)}</span>
                                                <span>Previsão: {contract.forecastDate ? formatDate(contract.forecastDate).slice(3) : 'A confirmar'}</span>
                                            </div>
                                            {recovery && (
                                                <div data-testid={`bank-recovery-${bank.id}`} className="mt-3 rounded-xl bg-white/15 p-3 text-left">
                                                    <p className="text-[10px] font-black uppercase tracking-wide text-purple-100">Recuperação da operação</p>
                                                    <div className="mt-2 rounded-lg bg-black/10 px-2 py-1.5 text-[10px] font-bold text-white">
                                                        {recoveryStatus.icon} {recoveryStatus.label} · {recoveryStatus.detail}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 mt-2 text-center">
                                                        <div>
                                                            <p className="text-[9px] text-purple-200">Resultado de caixa</p>
                                                            <p className="font-bold">{formatMoney(recovery.currentNetCash)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] text-purple-200">Principal exposto</p>
                                                            <p className="font-bold">{formatMoney(recovery.outstandingClientPrincipal)}</p>
                                                        </div>
                                                    </div>
                                                    <p className="mt-2 text-[10px] text-purple-100">
                                                        {recovery.isCashPositive
                                                            ? `✅ Caixa positivo desde ${formatDate(recovery.breakEvenDate)}.`
                                                            : recovery.breakEvenDate
                                                                ? `⏳ Equilíbrio estimado em ${formatDate(recovery.breakEvenDate)}.`
                                                                : '⏳ Sem previsão: faltam recebimentos ou vencimentos para calcular.'}
                                                    </p>
                                                    {!recovery.isCashPositive && recovery.ownCapitalStillToRecover > 0 && (
                                                        <p className="text-[9px] text-purple-200 mt-1">Falta recuperar: {formatMoney(recovery.ownCapitalStillToRecover)}</p>
                                                    )}
                                                    {recovery.projectedMonthlyInterest > 0 && recovery.outstandingClientPrincipal > 0 && (
                                                        <p className="text-[9px] text-purple-200 mt-1">Projeção considera {formatMoney(recovery.projectedMonthlyInterest)}/mês em juros enquanto houver principal em aberto.</p>
                                                    )}
                                                </div>
                                            )}
                                            <div data-testid={`bank-next-installments-${bank.id}`} className="mt-3 rounded-xl bg-white/15 p-3 text-left">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[10px] font-black uppercase tracking-wide text-purple-100">Próximos vencimentos</p>
                                                    {overdueInstallments.length > 0 && <span className="rounded bg-red-500/80 px-1.5 py-0.5 text-[8px] font-black">{overdueInstallments.length} em atraso</span>}
                                                    {overdueInstallments.length === 0 && awaitingBankConfirmation.length > 0 && <span className="rounded bg-amber-400/90 px-1.5 py-0.5 text-[8px] font-black text-amber-950">{awaitingBankConfirmation.length} em folha</span>}
                                                </div>
                                                {nextInstallments.length > 0 ? (
                                                    <div className="mt-2 space-y-1.5">
                                                        {nextInstallments.map(item => {
                                                            const label = item.status === 'pending_bank' ? 'Em folha' : item.status === 'scheduled' ? 'Agendada' : item.dueDate && item.dueDate < today ? 'Em atraso' : 'Em aberto';
                                                            return <div key={item.number} className="flex justify-between gap-2 text-[10px] text-purple-100"><span>#{item.number} · {item.dueDate ? formatDate(item.dueDate) : 'data a confirmar'} · {label}</span><b className="text-white">{formatMoney(item.amount)}</b></div>;
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="mt-2 text-[10px] text-purple-100">Nenhuma parcela pendente no controle pessoal.</p>
                                                )}
                                                {overdueInstallments.length > 0 && <p className="mt-2 text-[9px] font-bold text-red-100">Confira o banco antes de considerar a parcela paga.</p>}
                                                {overdueInstallments.length === 0 && awaitingBankConfirmation.length > 0 && <p className="mt-2 text-[9px] text-amber-100">Aguarda confirmação manual do repasse pelo banco.</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Recebimentos do Mês */}
                        <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 text-lg">Mês de {globalStats.dashMonthStr}</h3>
                            </div>
                            
                            <div data-testid="dash-pendentes" className="bg-red-50 border border-red-100 rounded-xl p-4 text-center mb-4">
                                <p className="text-red-700 text-xs font-black uppercase tracking-widest mb-1">Falta Receber (Pendentes)</p>
                                <p className="text-4xl font-black text-red-600">{formatMoney(globalStats.dashPending)}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-green-50 p-3 rounded-xl border border-green-100 text-center">
                                    <p className="text-[10px] text-green-700 font-bold uppercase mb-1">Já Recebido</p>
                                    <p className="font-bold text-green-800 text-sm">{formatMoney(globalStats.dashPaid)}</p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-center">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Meta do Mês</p>
                                    <p className="font-bold text-gray-700 text-sm">{formatMoney(globalStats.dashExpected)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Movimentar Caixa */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-3">Movimentar Caixa</h3>
                            <div className="flex flex-col gap-3">
                                {capitalSources.length > 0 && (
                                    <select data-testid="caixa-origem-select" value={selectedSourceId} onChange={(e) => setSelectedSourceId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700">
                                        {capitalSources.map(s => (
                                            <option key={s.id} value={s.id}>{s.type === 'bank' ? '🏦' : '💰'} {s.name} ({formatMoney(getCapitalBalance(s.id))})</option>
                                        ))}
                                    </select>
                                )}
                                <input data-testid="caixa-valor-input" type="number" step="0.01" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3" placeholder="Valor (R$)" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} />
                                <div className="flex gap-2">
                                    <button data-testid="caixa-btn-add" onClick={() => handleFund('add')} className="flex-1 bg-gray-800 text-white py-3 rounded-xl font-bold">+ Adicionar</button>
                                    <button data-testid="caixa-btn-remove" onClick={() => handleFund('remove')} className="flex-1 bg-red-100 text-red-700 py-3 rounded-xl font-bold shadow-sm">- Retirar</button>
                                </div>
                            </div>
                            
                            {fundsTransactions.length > 0 && (
                                <div className="mt-4 border-t border-gray-100 pt-4">
                                    <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase">Histórico do Caixa:</h3>
                                    <div className="space-y-2">
                                        {fundsTransactions.map(t => {
                                                    const source = capitalSources.find(s => s.id === t.sourceId);
                                                    const isLinkedToBankPayment = Boolean(t.bankPaymentId) || bankPayments.some(payment => (
                                                        FinanceEngine.getFundingBreakdown(payment).some(part => (
                                                            (part.fundsTransactionId || part.transactionId) === t.id
                                                        ))
                                                    ));
                                                    return (
                                            <div key={t.id} className="bg-gray-50 p-2 rounded-lg flex justify-between items-center border border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-6 h-6 text-xs rounded-full flex items-center justify-center font-bold ${t.amount > 0 ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                                                        {t.amount > 0 ? '+' : '-'}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-gray-800">{formatMoney(Math.abs(t.amount))}</p>
                                                        <p className="text-[10px] text-gray-400">{formatDate(t.date)}{source ? ` · ${source.name}` : ''}</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => {
                                                    if (isLinkedToBankPayment) {
                                                        showToast('❌ Este lançamento faz parte de uma operação bancária e não pode ser apagado isoladamente.');
                                                        return;
                                                    }
                                                    setFundsTransactions(fundsTransactions.filter(f => f.id !== t.id));
                                                    showToast('🗑️ Registro apagado.');
                                                }} className={`p-2 ${isLinkedToBankPayment ? 'text-gray-300' : 'text-gray-400 hover:text-red-600'}`}><IconDelete /></button>
                                            </div>
                                                    );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Resumo Bancário */}
                        {capitalSources.some(source => source.type === 'bank') && (
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-800 text-lg">🏦 Resumo Bancário</h3>
                                {capitalSources.filter(source => source.type === 'bank').map(bank => (
                                    <BankSummary key={bank.id} bank={bank} state={state} actions={actions} utils={utils} />
                                ))}
                            </div>
                        )}

                        {/* Identidade da Conta & Chave Pública */}
                        {typeof LocalAuth !== 'undefined' && accountPublicKey && (
                            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">🪪</span>
                                        <h3 className="text-base font-bold text-white tracking-tight">Identidade da Conta</h3>
                                    </div>
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                                        Chave Pública
                                    </span>
                                </div>
                                <p className="text-xs text-slate-300 mb-3.5 leading-relaxed">
                                    Esta é a chave pública exclusiva da sua conta. Você pode compartilhá-la com outros usuários com total segurança para identificar sua conta e validar transferências ou backups.
                                </p>

                                <div className="bg-slate-950/90 border border-slate-700/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="overflow-hidden">
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Sua Chave Pública Compartilhável</p>
                                        <p className="font-mono text-sm font-bold text-blue-300 tracking-wider select-all break-all">
                                            {accountPublicKey}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                                        <button
                                            type="button"
                                            onClick={handleCopyPublicKey}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                                                isCopiedPubKey 
                                                    ? 'bg-emerald-600 text-white' 
                                                    : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white'
                                            }`}
                                        >
                                            <span>{isCopiedPubKey ? '✓' : '📋'}</span>
                                            <span>{isCopiedPubKey ? 'Copiado!' : 'Copiar Chave'}</span>
                                        </button>
                                        {typeof navigator !== 'undefined' && navigator.share && (
                                            <button
                                                type="button"
                                                onClick={handleSharePublicKey}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl border border-slate-600 transition-colors shadow-sm"
                                                title="Compartilhar Chave Pública"
                                            >
                                                📤
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Segurança e Backup */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-1">Segurança e Backup</h3>
                            <p className="text-xs text-gray-500 mb-4">Gerencie a proteção de acesso e exportação de backups dos seus dados.</p>
                            
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <button data-testid="backup-btn-salvar" onClick={onExport} className="flex-1 bg-blue-50 text-blue-800 py-3 rounded-xl font-bold shadow-sm text-sm border border-blue-200 active:bg-blue-100 hover:bg-blue-100/70 transition-colors">
                                        📥 Salvar Backup
                                    </button>
                                    <button data-testid="backup-btn-importar" onClick={() => fileInputRef.current.click()} className="flex-1 bg-gray-50 text-gray-800 py-3 rounded-xl font-bold shadow-sm text-sm border border-gray-200 active:bg-gray-100 hover:bg-gray-100/70 transition-colors">
                                        📤 Importar
                                    </button>
                                    <input type="file" accept=".txt,.json,application/json,text/plain" ref={fileInputRef} style={{ display: 'none' }} onChange={onImport} />
                                </div>
                                {typeof LocalAuth !== 'undefined' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!LocalAuth.hasMasterPassword()) {
                                                actions.setSelectedClient(null);
                                                window.location.reload();
                                            } else {
                                                setShowChangePasswordModal(true);
                                                setChangePasswordError('');
                                                setChangePasswordSuccessKey('');
                                                setCurrentPasswordInput('');
                                                setNewPasswordInput('');
                                                setConfirmNewPasswordInput('');
                                            }
                                        }}
                                        className="w-full bg-slate-50 text-slate-700 hover:bg-slate-100 py-2.5 rounded-xl font-semibold text-xs border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <span>{LocalAuth.hasMasterPassword() ? '🔑' : '🔒'}</span>
                                        <span>{LocalAuth.hasMasterPassword() ? 'Alterar Senha Mestra' : 'Cadastrar Senha Mestra'}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {integrityIssues.length > 0 && (
                            <div data-testid="integrity-alert" className="bg-amber-50 rounded-2xl p-5 shadow-sm border border-amber-200">
                                <h3 className="text-base font-bold text-amber-900 mb-1">⚠️ Integridade do backup</h3>
                                <p className="text-xs text-amber-800 mb-3">
                                    Foram encontrados {integrityIssues.length} alerta{integrityIssues.length === 1 ? '' : 's'} no histórico antigo. Nenhum registro foi apagado automaticamente.
                                </p>
                                <div className="space-y-1 text-xs text-amber-900">
                                    {orphanIssues.length > 0 && <p>• {orphanIssues.length} lançamento{orphanIssues.length === 1 ? '' : 's'} sem origem existente</p>}
                                    {duplicateIssues.length > 0 && <p>• {duplicateIssues.length} {duplicateIssues.length === 1 ? 'possível duplicação bancária' : 'possíveis duplicações bancárias'}</p>}
                                    {mismatchIssues.length > 0 && <p>• {mismatchIssues.length} {mismatchIssues.length === 1 ? 'operação' : 'operações'} com origem do valor divergente</p>}
                                </div>
                                <p className="text-[10px] text-amber-700 mt-3">Revise esses itens antes de autorizar qualquer exclusão definitiva.</p>
                            </div>
                        )}

                        {historicalInterestAllocations?.length > 0 && (
                            <div data-testid="historical-interest-note" className="bg-emerald-50 rounded-2xl p-5 shadow-sm border border-emerald-200">
                                <h3 className="text-base font-bold text-emerald-900 mb-1">✅ Juros históricos reconciliados</h3>
                                <p className="text-xs text-emerald-800">
                                    {historicalInterestAllocations.length} registros, totalizando {formatMoney(FinanceEngine.sumCents(historicalInterestAllocations, item => item.amount) / 100)},
                                    correspondem aos juros recebidos de Leal e Mello e já utilizados nas operações do Santander.
                                </p>
                                <p className="text-[10px] text-emerald-700 mt-2">Esse valor permanece no histórico e não está disponível novamente no fundo.</p>
                            </div>
                        )}

                        {/* Modal de Alteração de Senha Mestra */}
                        {showChangePasswordModal && (
                            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-xl">🔑</span>
                                            <h3 className="font-bold text-gray-900 text-base">Alterar Senha Mestra</h3>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowChangePasswordModal(false)}
                                            className="text-gray-400 hover:text-gray-600 p-1"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {changePasswordError && (
                                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                                            ⚠️ {changePasswordError}
                                        </div>
                                    )}

                                    {changePasswordSuccessKey ? (
                                        <div className="space-y-4">
                                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900">
                                                <p className="font-bold text-emerald-950 mb-1">✓ Senha alterada com sucesso!</p>
                                                <p className="mb-2">Sua nova <strong>Chave de Recuperação</strong> é:</p>
                                                <div className="p-2.5 bg-white border border-emerald-300 rounded-xl font-mono text-center font-bold text-slate-900 tracking-wider text-xs select-all">
                                                    {changePasswordSuccessKey}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowChangePasswordModal(false)}
                                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs shadow-md"
                                            >
                                                Concluir
                                            </button>
                                        </div>
                                    ) : (
                                        <form
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                setChangePasswordError('');
                                                if (!currentPasswordInput) {
                                                    setChangePasswordError('Digite a senha atual.');
                                                    return;
                                                }
                                                if (!newPasswordInput || newPasswordInput.length < 4) {
                                                    setChangePasswordError('A nova senha deve ter no mínimo 4 caracteres.');
                                                    return;
                                                }
                                                if (newPasswordInput !== confirmNewPasswordInput) {
                                                    setChangePasswordError('A confirmação da nova senha não coincide.');
                                                    return;
                                                }
                                                setIsSubmittingPassword(true);
                                                try {
                                                    const res = await LocalAuth.changePassword(currentPasswordInput, newPasswordInput);
                                                    setChangePasswordSuccessKey(res.newRecoveryKey);
                                                    showToast('🔑 Senha mestra atualizada!');
                                                } catch (err) {
                                                    setChangePasswordError(err.message || 'Erro ao alterar senha.');
                                                } finally {
                                                    setIsSubmittingPassword(false);
                                                }
                                            }}
                                            className="space-y-3"
                                        >
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">Senha Atual</label>
                                                <input
                                                    type="password"
                                                    value={currentPasswordInput}
                                                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                                                    placeholder="Digite sua senha atual"
                                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">Nova Senha</label>
                                                <input
                                                    type="password"
                                                    value={newPasswordInput}
                                                    onChange={(e) => setNewPasswordInput(e.target.value)}
                                                    placeholder="No mínimo 4 caracteres"
                                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1">Confirmar Nova Senha</label>
                                                <input
                                                    type="password"
                                                    value={confirmNewPasswordInput}
                                                    onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                                                    placeholder="Repita a nova senha"
                                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div className="flex gap-2 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowChangePasswordModal(false)}
                                                    className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold py-2.5 rounded-xl text-xs"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={isSubmittingPassword}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm disabled:opacity-50"
                                                >
                                                    {isSubmittingPassword ? 'Salvando...' : 'Salvar Nova Senha'}
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                );
            };
