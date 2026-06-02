            // --- COMPONENTE VISÃO DO CLIENTE ---
            const ClientView = ({ clientData, availableMoney, state, actions, utils }) => {
                const { clients, capitalSources } = state;
                const { setClients, setSelectedClient } = actions;
                const { showToast, getCapitalBalance } = utils;
                const [showNewLoanForm, setShowNewLoanForm] = useState(false);
                const [newLoanAmount, setNewLoanAmount] = useState('');
                const [newLoanDate, setNewLoanDate] = useState(new Date().toISOString().split('T')[0]);
                const [newLoanInterestRate, setNewLoanInterestRate] = useState('10');
                const [newLoanSourceId, setNewLoanSourceId] = useState(() => {
                    const ownSource = capitalSources.find(s => s.type === 'own');
                    return ownSource ? ownSource.id : (capitalSources.length > 0 ? capitalSources[0].id : '');
                });
                const [showRateCalc, setShowRateCalc] = useState(false);
                const [desiredProfit, setDesiredProfit] = useState(10);

                const [payingLoanId, setPayingLoanId] = useState(null); 
                const [paymentAmount, setPaymentAmount] = useState('');
                const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

                const [confirmDeleteClient, setConfirmDeleteClient] = useState(false);
                const [editingLoan, setEditingLoan] = useState(null); 
                const [confirmDeleteLoanId, setConfirmDeleteLoanId] = useState(null);
                const [editingPayment, setEditingPayment] = useState(null); 
                const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null); 

                const executeDeleteClient = () => {
                    setClients(clients.filter(c => c.id !== clientData.id));
                    setSelectedClient(null);
                    showToast('🗑️ Cliente deletado.');
                };

                const handleAddLoan = (e) => {
                    e.preventDefault();
                    const amountToLend = Number(newLoanAmount);
                    if (!amountToLend || amountToLend <= 0) return;
                    
                    const sourceBalance = getCapitalBalance(newLoanSourceId);
                    if (amountToLend > sourceBalance) {
                        showToast(`❌ Saldo insuficiente nesta origem (disp: ${formatMoney(sourceBalance)})`);
                        return;
                    }

                    const interestRate = Number(newLoanInterestRate) || 10;

                    const updatedClients = clients.map(c => {
                        if (c.id === clientData.id) {
                            return { ...c, loans: [{ id: generateId(), date: newLoanDate, amount: amountToLend, interestRate, sourceId: newLoanSourceId, payments: [] }, ...c.loans] };
                        }
                        return c;
                    });
                    setClients(updatedClients);
                    setNewLoanAmount('');
                    setNewLoanInterestRate('10');
                    setShowNewLoanForm(false);
                    showToast('💸 Empréstimo registrado!');
                };

                const executeDeleteLoan = (loanId) => {
                    const updatedClients = clients.map(c => c.id === clientData.id ? { ...c, loans: c.loans.filter(l => l.id !== loanId) } : c);
                    setClients(updatedClients);
                    setConfirmDeleteLoanId(null);
                    showToast('🗑️ Contrato apagado.');
                };

                const handleSaveEditLoan = (e) => {
                    e.preventDefault();
                    const newAmount = Number(editingLoan.amount);
                    if (!newAmount || newAmount <= 0) return;

                    const originalLoan = clientData.loans.find(l => l.id === editingLoan.id);
                    const diff = newAmount - originalLoan.amount; 
                    if (diff > 0) {
                        const sourceBalance = getCapitalBalance(originalLoan.sourceId || 'own-default');
                        if (diff > sourceBalance) {
                            showToast(`❌ Saldo insuficiente nesta origem (disp: ${formatMoney(sourceBalance)})`);
                            return;
                        }
                    }

                    const updatedClients = clients.map(c => {
                        if (c.id === clientData.id) {
                            return {
                                ...c,
                                loans: c.loans.map(l => l.id === editingLoan.id ? { ...l, date: editingLoan.date, amount: newAmount, interestRate: editingLoan.interestRate } : l)
                            };
                        }
                        return c;
                    });
                    setClients(updatedClients);
                    setEditingLoan(null);
                    showToast('✅ Contrato editado!');
                };

                const handleAddPayment = (e) => {
                    e.preventDefault();
                    if (!paymentAmount) return;
                    const updatedClients = clients.map(c => {
                        if (c.id === clientData.id) {
                            return {
                                ...c,
                                loans: c.loans.map(l => l.id === payingLoanId ? { ...l, payments: [...l.payments, { id: generateId(), date: paymentDate, amount: Number(paymentAmount) }] } : l)
                            };
                        }
                        return c;
                    });
                    setClients(updatedClients);
                    setPaymentAmount('');
                    setPayingLoanId(null);
                    showToast('✅ Pagamento registrado!');
                };

                const executeDeletePayment = () => {
                    if(!confirmDeletePaymentId) return;
                    const { loanId, id } = confirmDeletePaymentId;
                    const updatedClients = clients.map(c => {
                        if (c.id === clientData.id) {
                            return {
                                ...c,
                                loans: c.loans.map(l => l.id === loanId ? { ...l, payments: l.payments.filter(p => p.id !== id) } : l)
                            };
                        }
                        return c;
                    });
                    setClients(updatedClients);
                    setConfirmDeletePaymentId(null);
                    showToast('🗑️ Pagamento apagado.');
                };

                const handleSaveEditPayment = (e) => {
                    e.preventDefault();
                    if (!editingPayment.amount) return;
                    const updatedClients = clients.map(c => {
                        if (c.id === clientData.id) {
                            return {
                                ...c,
                                loans: c.loans.map(l => l.id === editingPayment.loanId ? {
                                    ...l,
                                    payments: l.payments.map(p => p.id === editingPayment.id ? { ...p, date: editingPayment.date, amount: Number(editingPayment.amount) } : p)
                                } : l)
                            };
                        }
                        return c;
                    });
                    setClients(updatedClients);
                    setEditingPayment(null);
                    showToast('✅ Pagamento editado!');
                };

                const generateStatement = () => {
                    let text = `*Extrato de Empréstimos - ${clientData.name}*\n`;
                    text += `Gerado em: ${formatDate(new Date().toISOString().split('T')[0])}\n\n`;
                    
                    if (clientData.loans.length === 0) text += `Nenhum contrato ativo.\n`;

                    clientData.loans.forEach(loan => {
                        const src = capitalSources.find(s => s.id === loan.sourceId);
                        const srcLabel = src ? ` [${src.type === 'bank' ? '🏦' : '💰'} ${src.name}]` : '';
                        text += `📌 *Empréstimo: ${formatMoney(loan.amount)} (${formatDate(loan.date)}) - Juros: ${loan.interestRate ?? 10}%*${srcLabel}\n`;
                        if (loan.isPaidOff) {
                            text += `   ✅ Contrato Quitado!\n\n`;
                        } else {
                            if (loan.processedPayments.length > 0) {
                                loan.processedPayments.forEach(p => {
                                    text += `   🟢 ${formatDate(p.date)}: Pagou ${formatMoney(p.amount)}\n`;
                                    text += `      (Juros: ${formatMoney(p.interestPaid)} | Abateu: ${formatMoney(p.amortized)})\n`;
                                });
                            } else {
                                text += `   ▪️ Nenhum pagamento registrado.\n`;
                            }
                            text += `   *Saldo Devedor Deste:* ${formatMoney(loan.currentPrincipal)}\n`;
                            text += `   *(Próx. Juros: ${formatMoney(loan.baseInterest)})*\n`;
                            text += `   *🎯 QUITAÇÃO DESTE: ${formatMoney(loan.currentPrincipal + loan.baseInterest)}*\n\n`;
                        }
                    });

                    text += `------------------------\n`;
                    text += `*TOTAL DEVEDOR (PRINCIPAL): ${formatMoney(clientData.currentDebt)}*\n`;
                    text += `*🎯 TOTAL PARA QUITAR TUDO: ${formatMoney(clientData.currentDebt + clientData.dashExpected)}*\n`;

                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    document.body.appendChild(textArea);
                    textArea.select();
                    try { document.execCommand('copy'); showToast('📋 Extrato copiado com sucesso!'); } 
                    catch (err) { showToast('❌ Erro ao copiar.'); }
                    document.body.removeChild(textArea);
                };

                return (
                    <div className="p-4 flex flex-col h-screen bg-gray-50 absolute top-0 left-0 w-full z-10 overflow-y-auto pb-24">
                        <div className="flex items-center justify-between mb-6 pt-2">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedClient(null)} className="p-2 bg-white rounded-full shadow text-gray-600 active:bg-gray-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <h2 className="text-2xl font-bold text-gray-800">{clientData.name}</h2>
                            </div>
                            <button onClick={() => setConfirmDeleteClient(true)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><IconDelete /></button>
                        </div>

                        {confirmDeleteClient && (
                            <div className="bg-red-50 p-4 rounded-2xl border border-red-200 mb-6 text-center animate-fade-in shadow-sm">
                                <p className="text-red-800 font-bold mb-3">Apagar cliente e todo o histórico?</p>
                                <div className="flex gap-2">
                                    <button onClick={() => setConfirmDeleteClient(false)} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium">Cancelar</button>
                                    <button onClick={executeDeleteClient} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-sm">Sim, Apagar</button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6 text-center">
                            <p className="text-gray-500 text-sm font-medium mb-1">Dívida Principal (Todos contratos)</p>
                            <p className="text-3xl font-black text-gray-800">{formatMoney(clientData.currentDebt)}</p>
                            
                            <div className="mt-3 inline-block bg-blue-100 text-blue-900 px-5 py-2.5 rounded-xl text-md font-bold w-full shadow-sm border border-blue-200">
                                Quitação Total de Tudo: {formatMoney(clientData.currentDebt + clientData.dashExpected)}
                            </div>

                            <div className="mt-4 flex gap-2 justify-center">
                                <button data-testid="cliente-btn-emprestimo" onClick={() => setShowNewLoanForm(!showNewLoanForm)} className="flex-1 bg-blue-600 text-white px-3 py-2.5 rounded-xl text-sm font-bold shadow-sm">+ Empréstimo</button>
                                <button onClick={generateStatement} className="flex-1 bg-gray-800 text-white px-3 py-2.5 rounded-xl text-sm font-bold shadow-sm">Copiar Extrato</button>
                            </div>
                        </div>

                        {showNewLoanForm && (
                            <form onSubmit={handleAddLoan} className="bg-white p-4 rounded-2xl shadow-lg border border-gray-200 mb-6 animate-fade-in">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-bold text-gray-800">Novo Empréstimo</h3>
                                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100 font-medium">Caixa: {formatMoney(availableMoney)}</span>
                                </div>
                                <input type="date" value={newLoanDate} onChange={e => setNewLoanDate(e.target.value)} required className="w-full mb-3 p-3 border rounded-xl bg-gray-50" />
                                {capitalSources.length > 0 && (
                                    <select data-testid="emprestimo-form-origem" value={newLoanSourceId} onChange={(e) => setNewLoanSourceId(e.target.value)} className="w-full mb-3 p-3 border rounded-xl bg-gray-50 text-sm text-gray-700">
                                        {capitalSources.map(s => (
                                            <option key={s.id} value={s.id}>{s.type === 'bank' ? '🏦' : '💰'} {s.name} ({formatMoney(getCapitalBalance(s.id))})</option>
                                        ))}
                                    </select>
                                )}
                                {/* Calculadora de Taxa — só para origens bancárias */}
                                {(() => {
                                    const selectedSource = capitalSources.find(s => s.id === newLoanSourceId);
                                    if (!selectedSource || selectedSource.type !== 'bank') return null;
                                    const bankRate = selectedSource.monthlyRate || 0;
                                    const suggestedRate = bankRate + desiredProfit;
                                    const estimatedMonthlyInterest = newLoanAmount ? (Number(newLoanAmount) * suggestedRate / 100) : 0;
                                    return (
                                        <div className="mb-3 bg-purple-50 rounded-xl p-3 border border-purple-200 animate-fade-in">
                                            {!showRateCalc ? (
                                                <button data-testid="emprestimo-btn-sugerir-taxa" type="button" onClick={() => setShowRateCalc(true)} className="w-full text-purple-700 text-xs font-bold flex items-center justify-center gap-1">
                                                    💡 Sugerir taxa para cobrir {selectedSource.name} ({bankRate}% a.m.)
                                                </button>
                                            ) : (
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <p className="text-[10px] font-bold text-purple-700 uppercase">Calculadora de Taxa</p>
                                                        <button type="button" onClick={() => setShowRateCalc(false)} className="text-purple-400 text-xs font-bold">✕</button>
                                                    </div>
                                                    <div className="text-[10px] text-purple-600 mb-2">
                                                        Custo {selectedSource.name}: <b>{bankRate}% a.m.</b> · Parcela: {formatMoney(selectedSource.installmentValue)}
                                                    </div>
                                                    <div className="mb-2">
                                                        <p className="text-[10px] text-gray-500 mb-1">Lucro desejado: <b>{desiredProfit}%</b></p>
                                                        <div className="flex gap-1">
                                                            {[5, 10, 13, 15, 20].map(v => (
                                                                <button data-testid={`ratecalc-profit-${v}`} key={v} type="button" onClick={() => setDesiredProfit(v)} className={`flex-1 py-1 rounded text-[10px] font-bold ${desiredProfit === v ? 'bg-purple-600 text-white' : 'bg-white text-purple-600 border border-purple-200'}`}>{v}%</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-2 mb-2 text-center">
                                                        <p className="text-[10px] text-gray-500">Taxa sugerida</p>
                                                        <p className="text-lg font-black text-purple-700">{suggestedRate.toFixed(1)}%</p>
                                                        <p className="text-[10px] text-gray-400">{bankRate}% (banco) + {desiredProfit}% (lucro)</p>
                                                        {newLoanAmount > 0 && (
                                                            <p className="text-[10px] text-purple-600 mt-1 font-bold">
                                                                ≈ {formatMoney(estimatedMonthlyInterest)}/mês de juros esperados
                                                            </p>
                                                        )}
                                                    </div>
                                                    <button data-testid="ratecalc-btn-aplicar" type="button" onClick={() => { setNewLoanInterestRate(suggestedRate.toFixed(1)); setShowRateCalc(false); }} className="w-full py-1.5 bg-purple-600 text-white rounded-lg text-[10px] font-bold">
                                                        Aplicar {suggestedRate.toFixed(1)}%
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                <div className="flex gap-3 mb-3">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 font-medium block mb-1">Valor (R$)</label>
                                        <input data-testid="emprestimo-form-valor" type="number" step="0.01" value={newLoanAmount} onChange={e => setNewLoanAmount(e.target.value)} placeholder="Valor (R$)" required className="w-full p-3 border rounded-xl bg-gray-50" />
                                    </div>
                                    <div className="w-28">
                                        <label className="text-xs text-gray-500 font-medium block mb-1">Juros (%)</label>
                                        <input data-testid="emprestimo-form-juros" type="number" step="0.1" value={newLoanInterestRate} onChange={e => setNewLoanInterestRate(e.target.value)} placeholder="10" required className="w-full p-3 border rounded-xl bg-gray-50" />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setShowNewLoanForm(false)} className="flex-1 p-3 bg-gray-100 rounded-xl font-medium">Cancelar</button>
                                    <button data-testid="emprestimo-btn-salvar" type="submit" className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">Salvar</button>
                                </div>
                            </form>
                        )}

                        <h3 className="font-bold text-gray-800 mb-3 ml-1">Contratos em Aberto</h3>

                        <div className="space-y-4">
                            {clientData.loans.map((loan) => (
                                <div key={loan.id} className={`bg-white rounded-2xl shadow-sm border-2 ${loan.isPaidOff ? 'border-green-200 opacity-70' : 'border-gray-200'} overflow-hidden relative`}>
                                    
                                    {editingLoan && editingLoan.id === loan.id ? (
                                        <form onSubmit={handleSaveEditLoan} className="p-4 bg-gray-100 border-b border-gray-200 animate-fade-in">
                                            <p className="text-xs font-bold text-blue-700 mb-2">Editando Contrato</p>
                                            <div className="flex gap-2 mb-2">
                                                <input type="date" required value={editingLoan.date} onChange={e => setEditingLoan({...editingLoan, date: e.target.value})} className="w-1/3 p-2 border rounded-lg text-sm" />
                                                <input type="number" step="0.01" required value={editingLoan.amount} onChange={e => setEditingLoan({...editingLoan, amount: e.target.value})} className="flex-1 p-2 border rounded-lg text-sm" />
                                                <input type="number" step="0.1" required value={editingLoan.interestRate} onChange={e => setEditingLoan({...editingLoan, interestRate: Number(e.target.value)})} placeholder="Juros %" className="w-16 p-2 border rounded-lg text-sm" />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setEditingLoan(null)} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs font-bold">Cancelar</button>
                                                <button type="submit" className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">Salvar</button>
                                            </div>
                                        </form>
                                    ) : confirmDeleteLoanId === loan.id ? (
                                        <div className="p-4 bg-red-50 border-b border-red-200 animate-fade-in text-center">
                                            <p className="text-sm font-bold text-red-700 mb-2">Apagar contrato inteiro?</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setConfirmDeleteLoanId(null)} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs font-bold">Cancelar</button>
                                                <button onClick={() => executeDeleteLoan(loan.id)} className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold">Sim, Apagar</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center relative">
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wide">Data: {formatDate(loan.date)}</p>
                                                <p className="font-black text-gray-800 text-lg">Empréstimo: {formatMoney(loan.amount)}</p>
                                                {(() => { const src = capitalSources.find(s => s.id === loan.sourceId); return src ? <p className="text-[10px] text-gray-400 mt-0.5">{src.type === 'bank' ? '🏦' : '💰'} {src.name}</p> : null; })()}
                                            </div>
                                            
                                            {!loan.isPaidOff && (
                                                <div className="absolute top-2 right-2">
                                                    {loan.isLoanOK ? (
                                                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm uppercase">
                                                            OK ({loan.loanDisplayMonthStr}) ✅
                                                        </span>
                                                    ) : (
                                                        <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm animate-pulse uppercase">
                                                            FALTA {loan.loanDisplayMonthStr}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex gap-2 text-gray-400 mt-6">
                                                <button onClick={() => setEditingLoan({id: loan.id, date: loan.date, amount: loan.amount, interestRate: loan.interestRate ?? 10})} className="hover:text-blue-600"><IconEdit /></button>
                                                <button onClick={() => setConfirmDeleteLoanId(loan.id)} className="hover:text-red-500"><IconDelete /></button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-4">
                                        {loan.isPaidOff ? (
                                            <div className="text-center py-2 text-green-600 font-bold bg-green-50 rounded-lg">✅ Contrato Quitado!</div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-end mb-3">
                                                    <div>
                                                        <p className="text-xs text-gray-500">Saldo Devedor (Principal):</p>
                                                        <p className="text-xl font-bold text-red-600">{formatMoney(loan.currentPrincipal)}</p>
                                                    </div>
                                                    <button onClick={() => setPayingLoanId(loan.id)} className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm border border-green-200">+ Pagar Este</button>
                                                </div>
                                                
                                                <div className="flex justify-between items-center bg-orange-50 px-3 py-2 rounded-lg border border-orange-100 mb-4">
                                                    <p className="text-xs text-orange-800 font-medium">Juros ({loan.interestRate ?? 10}%): {formatMoney(loan.baseInterest)}</p>
                                                    <p className="text-sm text-orange-900 font-black">Quitação: {formatMoney(loan.currentPrincipal + loan.baseInterest)}</p>
                                                </div>

                                                {payingLoanId === loan.id && (
                                                    <form onSubmit={handleAddPayment} className="mb-4 bg-white shadow-md p-4 rounded-xl border border-gray-200 animate-fade-in relative z-10">
                                                        <p className="text-sm font-bold text-gray-800 mb-3">Novo Pagamento</p>
                                                        <div className="flex gap-2 mb-3">
                                                            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required className="w-1/3 p-2 border rounded-lg bg-gray-50 text-sm" />
                                                            <input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Valor (R$)" required className="flex-1 p-2 border rounded-lg bg-gray-50 text-sm" />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => setPayingLoanId(null)} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm font-bold">Cancelar</button>
                                                            <button type="submit" className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold">Confirmar</button>
                                                        </div>
                                                    </form>
                                                )}
                                            </>
                                        )}

                                        {loan.processedPayments.length > 0 && (
                                            <div className="mt-4 border-t border-gray-100 pt-3">
                                                <p className="text-xs font-bold text-gray-400 mb-2 uppercase">Pagamentos:</p>
                                                <div className="space-y-2">
                                                    {[...loan.processedPayments].reverse().map(p => (
                                                        <div key={p.id} className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                                            {editingPayment && editingPayment.id === p.id ? (
                                                                <form onSubmit={handleSaveEditPayment} className="animate-fade-in">
                                                                    <div className="flex gap-2 mb-2">
                                                                        <input type="date" required value={editingPayment.date} onChange={e => setEditingPayment({...editingPayment, date: e.target.value})} className="w-1/3 p-1 border rounded text-xs" />
                                                                        <input type="number" step="0.01" required value={editingPayment.amount} onChange={e => setEditingPayment({...editingPayment, amount: e.target.value})} className="flex-1 p-1 border rounded text-xs" />
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <button type="button" onClick={() => setEditingPayment(null)} className="flex-1 bg-gray-200 rounded text-[10px] font-bold py-1">Cancelar</button>
                                                                        <button type="submit" className="flex-1 bg-blue-600 text-white rounded text-[10px] font-bold py-1">Salvar</button>
                                                                    </div>
                                                                </form>
                                                            ) : confirmDeletePaymentId?.id === p.id ? (
                                                                <div className="animate-fade-in flex flex-col gap-2">
                                                                    <p className="text-xs text-red-600 font-bold text-center">Apagar pagamento?</p>
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setConfirmDeletePaymentId(null)} className="flex-1 bg-gray-200 rounded text-[10px] font-bold py-1">Cancelar</button>
                                                                        <button onClick={executeDeletePayment} className="flex-1 bg-red-600 text-white rounded text-[10px] font-bold py-1">Apagar</button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex justify-between items-center">
                                                                    <div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                                                            <span className="font-bold text-sm text-gray-700">{formatMoney(p.amount)}</span>
                                                                            <span className="text-[10px] text-gray-400 ml-1">({formatDate(p.date)})</span>
                                                                        </div>
                                                                        <p className="text-[10px] text-gray-500 ml-3 mt-0.5">Juros: {formatMoney(p.interestPaid)} | Abateu: {formatMoney(p.amortized)}</p>
                                                                    </div>
                                                                    <div className="flex gap-2 text-gray-400">
                                                                        <button onClick={() => setEditingPayment({loanId: loan.id, id: p.id, date: p.date, amount: p.amount})} className="hover:text-blue-600 p-1"><IconEdit /></button>
                                                                        <button onClick={() => setConfirmDeletePaymentId({loanId: loan.id, id: p.id})} className="hover:text-red-500 p-1"><IconDelete /></button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {clientData.loans.length === 0 && <p className="text-center text-gray-400 py-10">Nenhum contrato ativo.</p>}
                        </div>
                    </div>
                );
};