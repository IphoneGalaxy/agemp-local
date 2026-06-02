
            // --- COMPONENTE PAINEL ---
            const Dashboard = ({ onExport, onImport, state, actions, utils }) => {
                const { globalStats, capitalSources, clients, fundsTransactions, bankPayments } = state;
                const { setFundsTransactions, setCapitalSources, setBankPayments } = actions;
                const { showToast, getCapitalBalance } = utils;
                const [addAmount, setAddAmount] = useState('');
                const [selectedSourceId, setSelectedSourceId] = useState(capitalSources.length > 0 ? capitalSources[0].id : '');
                const fileInputRef = useRef(null);
                // Estados do Resumo Bancário
                const [activeBankPayId, setActiveBankPayId] = useState(null);
                const [bankPayAmountState, setBankPayAmountState] = useState('');
                const [bankPayDateState, setBankPayDateState] = useState(new Date().toISOString().split('T')[0]);
                const [bankPayTypeState, setBankPayTypeState] = useState('installment');
                const [activeAmortizeId, setActiveAmortizeId] = useState(null);
                const [amortizeAmountState, setAmortizeAmountState] = useState('');

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
                    setFundsTransactions([{ id: generateId(), date: new Date().toISOString().split('T')[0], amount: val, sourceId: selectedSourceId }, ...fundsTransactions]);
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
                                    const ownBalance = getCapitalBalance('own-default');
                                    let ownNaRua = 0;
                                    clients.forEach(c => {
                                        (c.loans || []).forEach(l => {
                                            if (l.sourceId) return; // só capital próprio (sem sourceId)
                                            let principal = l.amount;
                                            const sorted = [...(l.payments || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
                                            sorted.forEach(p => {
                                                const rate = (l.interestRate || 10) / 100;
                                                const due = principal * rate;
                                                principal -= (p.amount >= due ? p.amount - due : 0);
                                                if (principal < 0) principal = 0;
                                            });
                                            ownNaRua += principal;
                                        });
                                    });
                                    return (
                                        <div data-testid="dash-capital-proprio" className="bg-blue-600 text-white rounded-2xl p-5 shadow-lg">
                                            <p className="text-blue-100 text-sm font-medium">💰 Capital Próprio</p>
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div>
                                                    <p className="text-blue-200 text-[10px] uppercase">Disponível</p>
                                                    <p className="text-xl font-bold">{formatMoney(ownBalance)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-blue-200 text-[10px] uppercase">Emprestado</p>
                                                    <p className="text-xl font-bold">{formatMoney(ownNaRua)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                                {/* Cada Banco */}
                                {capitalSources.filter(s => s.type === 'bank').map(bank => {
                                    const bp = bankPayments.filter(p => p.sourceId === bank.id);
                                    const totalPaid = bp.reduce((a, p) => a + p.amount, 0);
                                    const remaining = Math.max(0, bank.totalToPay - totalPaid);
                                    const bd = globalStats.bankDetails?.find(b => b.name === bank.name);
                                    const juros = bd ? bd.interestFromClients : 0;
                                    const paidInst = Math.floor(totalPaid / bank.installmentValue);
                                    const remainingInst = Math.max(0, bank.totalInstallments - paidInst);
                                    const payoffMonths = remainingInst > 0 && bank.installmentValue > 0 ? Math.ceil(remaining / bank.installmentValue) : 0;
                                    const payoffDate = payoffMonths > 0 ? new Date(new Date().setMonth(new Date().getMonth() + payoffMonths)).toLocaleString('pt-BR', { month: 'short', year: 'numeric' }) : '—';
                                    return (
                                        <div key={bank.id} data-testid="dash-card-banco" className="bg-purple-600 text-white rounded-2xl p-5 shadow-lg">
                                            <p className="text-purple-100 text-sm font-medium">🏦 {bank.name}</p>
                                            <div className="grid grid-cols-2 gap-3 mt-3 text-center">
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Dívida Restante</p>
                                                    <p className="font-bold">{formatMoney(remaining)}</p>
                                                </div>
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Juros Gerados</p>
                                                    <p className="font-bold">{formatMoney(juros)}</p>
                                                </div>
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Fundo Amort.</p>
                                                    <p className="font-bold">{formatMoney(bank.amortizationFund || 0)}</p>
                                                </div>
                                                <div className="bg-purple-500/50 rounded-lg p-2">
                                                    <p className="text-purple-200 text-[10px]">Parcelas</p>
                                                    <p className="font-bold">{paidInst}/{bank.totalInstallments}</p>
                                                </div>
                                            </div>
                                            <div className="flex justify-between text-[10px] text-purple-200 mt-2">
                                                <span>Próx: {formatMoney(bank.installmentValue)}</span>
                                                <span>Previsão: {payoffDate}</span>
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
                                                <button onClick={() => { setFundsTransactions(fundsTransactions.filter(f => f.id !== t.id)); showToast('🗑️ Registro apagado.'); }} className="p-2 text-gray-400 hover:text-red-600"><IconDelete /></button>
                                            </div>
                                                    );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Resumo Bancário */}
                        {capitalSources.some(s => s.type === "bank") && (() => {

                            const handleBankPayment = (bankId, e) => {
                                e.preventDefault();
                                const amt = Number(bankPayAmountState);
                                if (!amt || amt <= 0) return;
                                setBankPayments([{ id: generateId(), date: bankPayDateState, amount: amt, sourceId: bankId, type: bankPayTypeState }, ...bankPayments]);
                                if (bankPayTypeState === "installment") {
                                    setCapitalSources(capitalSources.map(s => s.id === bankId ? { ...s, paidInstallments: (s.paidInstallments || 0) + 1, totalPaidToBank: (s.totalPaidToBank || 0) + amt } : s));
                                } else {
                                    setCapitalSources(capitalSources.map(s => s.id === bankId ? { ...s, totalPaidToBank: (s.totalPaidToBank || 0) + amt } : s));
                                }
                                setBankPayAmountState(""); setActiveBankPayId(null);
                                showToast("✅ Pagamento ao banco registrado!");
                            };

                            const handleAmortize = (bankId, e) => {
                                e.preventDefault();
                                const amt = Number(amortizeAmountState);
                                const bank = capitalSources.find(s => s.id === bankId);
                                if (!amt || amt <= 0 || !bank) return;
                                if (amt > (bank.amortizationFund || 0)) { showToast("❌ Saldo insuficiente no fundo de amortização."); return; }
                                setBankPayments([{ id: generateId(), date: new Date().toISOString().split("T")[0], amount: amt, sourceId: bankId, type: "amortization" }, ...bankPayments]);
                                setCapitalSources(capitalSources.map(s => s.id === bankId ? { ...s, totalPaidToBank: (s.totalPaidToBank || 0) + amt, amortizationFund: (s.amortizationFund || 0) - amt } : s));
                                setAmortizeAmountState(""); setActiveAmortizeId(null);
                                showToast("🏦 Amortização registrada!");
                            };

                            return (
                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-800 text-lg">🏦 Resumo Bancário</h3>
                                {capitalSources.filter(s => s.type === "bank").map(bank => {
                                    const bp = bankPayments.filter(p => p.sourceId === bank.id);
                                    const totalPaid = bp.reduce((a, p) => a + p.amount, 0);
                                    const paidInst = bp.filter(p => p.type === "installment").length;
                                    const remainingValue = Math.max(0, bank.totalToPay - totalPaid);
                                    const remainingInst = Math.max(0, bank.totalInstallments - paidInst);
                                    const payoffMonths = remainingInst > 0 && bank.installmentValue > 0 ? Math.ceil(remainingValue / bank.installmentValue) : 0;
                                    const payoffDate = payoffMonths > 0 ? new Date(new Date().setMonth(new Date().getMonth() + payoffMonths)).toLocaleString("pt-BR", { month: "short", year: "numeric" }) : "—";
                                    return (
                                        <div key={bank.id} className="bg-white rounded-2xl p-5 shadow-sm border border-purple-200">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">🏦</span>
                                                    <div><p className="font-bold text-gray-800">{bank.name}</p><p className="text-[10px] text-gray-500">Recebido: {formatMoney(bank.receivedAmount)} · Taxa: {bank.monthlyRate}% a.m.</p></div>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${remainingValue <= 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{remainingValue <= 0 ? "Quitado" : "Ativo"}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mb-3 text-center">
                                                <div className="bg-gray-50 rounded-lg p-2"><p className="text-[10px] text-gray-400">Pago ao Banco</p><p className="font-bold text-sm">{formatMoney(totalPaid)}</p></div>
                                                <div className="bg-gray-50 rounded-lg p-2"><p className="text-[10px] text-gray-400">Restante</p><p className="font-bold text-sm text-red-600">{formatMoney(remainingValue)}</p></div>
                                            </div>
                                            <div className="mb-2">
                                                <div className="flex justify-between text-[10px] text-gray-500"><span>Parcelas: {paidInst}/{bank.totalInstallments}</span><span>Total: {formatMoney(bank.totalToPay)}</span></div>
                                                <div className="w-full bg-gray-200 rounded-full h-2 mt-1"><div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (totalPaid / bank.totalToPay) * 100)}%` }}></div></div>
                                            </div>
                                            <div className="grid grid-cols-4 gap-2 text-center text-[10px] mb-3">
                                                {(() => { const bd = globalStats.bankDetails.find(b => b.name === bank.name); return <>
                                                <div className="bg-green-50 rounded-lg p-1.5"><p className="text-green-500">Juros Gerados</p><p className="font-bold text-green-700">{formatMoney(bd ? bd.interestFromClients : 0)}</p></div>
                                                </>; })()}
                                                <div className="bg-blue-50 rounded-lg p-1.5"><p className="text-blue-500">Fundo Amort.</p><p className="font-bold text-blue-700">{formatMoney(bank.amortizationFund || 0)}</p></div>
                                                <div className="bg-gray-50 rounded-lg p-1.5"><p className="text-gray-400">Próx. Parcela</p><p className="font-bold">{formatMoney(bank.installmentValue)}</p></div>
                                                <div className="bg-gray-50 rounded-lg p-1.5"><p className="text-gray-400">Previsão Quitação</p><p className="font-bold">{payoffDate}</p></div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button data-testid="banco-btn-pagar" onClick={() => setActiveBankPayId(activeBankPayId === bank.id ? null : bank.id)} className="flex-1 bg-purple-50 text-purple-700 py-2 rounded-lg text-xs font-bold border border-purple-200">+ Pagar Banco</button>
                                                <button data-testid="banco-btn-amortizar" onClick={() => setActiveAmortizeId(activeAmortizeId === bank.id ? null : bank.id)} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-xs font-bold border border-blue-200" disabled={!bank.amortizationFund || bank.amortizationFund <= 0}>Amortizar</button>
                                            </div>
                                            {activeBankPayId === bank.id && (
                                                <form onSubmit={(e) => handleBankPayment(bank.id, e)} className="mt-3 p-3 bg-purple-50 rounded-xl border border-purple-200 animate-fade-in">
                                                    <div className="flex gap-2 mb-2">
                                                        <button type="button" onClick={() => setBankPayTypeState("installment")} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${bankPayTypeState === "installment" ? "bg-purple-600 text-white" : "bg-white text-gray-600"}`}>Parcela</button>
                                                        <button type="button" onClick={() => setBankPayTypeState("amortization")} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${bankPayTypeState === "amortization" ? "bg-blue-600 text-white" : "bg-white text-gray-600"}`}>Amortização</button>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input data-testid="banco-pay-date" type="date" value={bankPayDateState} onChange={e => setBankPayDateState(e.target.value)} className="w-1/3 p-2 border rounded-lg bg-white text-xs" />
                                                        <input data-testid="banco-pay-amount" type="number" step="0.01" value={bankPayAmountState} onChange={e => setBankPayAmountState(e.target.value)} placeholder="Valor (R$)" className="flex-1 p-2 border rounded-lg bg-white text-xs" />
                                                    </div>
                                                    <div className="flex gap-2 mt-2">
                                                        <button type="button" onClick={() => setActiveBankPayId(null)} className="flex-1 py-1.5 bg-white rounded-lg text-[10px] font-bold">Cancelar</button>
                                                        <button data-testid="banco-pay-btn-registrar" type="submit" className="flex-1 py-1.5 bg-purple-600 text-white rounded-lg text-[10px] font-bold">Registrar</button>
                                                    </div>
                                                </form>
                                            )}
                                            {activeAmortizeId === bank.id && (
                                                <form onSubmit={(e) => handleAmortize(bank.id, e)} className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 animate-fade-in">
                                                    <p className="text-[10px] text-blue-700 font-bold mb-2">Amortizar do fundo: {formatMoney(bank.amortizationFund || 0)}</p>
                                                    <div className="flex gap-2"><input type="number" step="0.01" value={amortizeAmountState} onChange={e => setAmortizeAmountState(e.target.value)} placeholder="Valor a amortizar" className="flex-1 p-2 border rounded-lg bg-white text-xs" /></div>
                                                    <div className="flex gap-2 mt-2">
                                                        <button type="button" onClick={() => setActiveAmortizeId(null)} className="flex-1 py-1.5 bg-white rounded-lg text-[10px] font-bold">Cancelar</button>
                                                        <button type="submit" className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold">Amortizar</button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            );
                        })()}

                        {/* Segurança e Backup */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-1">Segurança e Backup</h3>
                            <p className="text-xs text-gray-500 mb-4">Salve seus dados num arquivo de texto. Se trocar de celular ou limpar o navegador, você poderá restaurá-los aqui.</p>
                            
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

                    </div>
                );
            };