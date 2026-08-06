
            // --- COMPONENTE PAINEL ---
            const Dashboard = ({ onExport, onImport, state, actions, utils }) => {
                const { globalStats, capitalSources, clients, fundsTransactions, bankPayments, historicalInterestAllocations } = state;
                const { setFundsTransactions } = actions;
                const { showToast, getCapitalBalance, getSourceSummary } = utils;
                const [addAmount, setAddAmount] = useState('');
                const [selectedSourceId, setSelectedSourceId] = useState(() => FinanceEngine.getDefaultOwnSourceId(capitalSources));
                const fileInputRef = useRef(null);
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

                        {/* Segurança e Backup */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-1">Segurança e Backup</h3>
                            <p className="text-xs text-gray-500 mb-4">Salve seus dados em um backup JSON. Se trocar de celular ou limpar o navegador, você poderá restaurá-los aqui. Backups antigos em TXT continuam aceitos.</p>
                            
                            <div className="flex gap-2">
                                <button data-testid="backup-btn-salvar" onClick={onExport} className="flex-1 bg-blue-50 text-blue-800 py-3 rounded-xl font-bold shadow-sm text-sm border border-blue-200 active:bg-blue-100">
                                    📥 Salvar Backup
                                </button>
                                <button data-testid="backup-btn-importar" onClick={() => fileInputRef.current.click()} className="flex-1 bg-gray-50 text-gray-800 py-3 rounded-xl font-bold shadow-sm text-sm border border-gray-200 active:bg-gray-100">
                                    📤 Importar
                                </button>
                                <input type="file" accept=".txt,.json" ref={fileInputRef} style={{ display: 'none' }} onChange={onImport} />
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

                    </div>
                );
            };
