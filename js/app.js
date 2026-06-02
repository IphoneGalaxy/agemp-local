        function App() {
            const [activeTab, setActiveTab] = useState('dashboard');
            const [fundsTransactions, setFundsTransactions] = useState([]);
            const [clients, setClients] = useState([]);
            const [selectedClient, setSelectedClient] = useState(null);
            const [toastMessage, setToastMessage] = useState('');
            const [capitalSources, setCapitalSources] = useState([]);
            const [bankPayments, setBankPayments] = useState([]);

            // Função unificada: saldo disponível de uma origem de capital
            const getCapitalBalance = (sourceId) => {
                const source = capitalSources.find(s => s.id === sourceId);
                if (!source) return 0;
                const sourceTx = fundsTransactions.filter(t => {
                    if (source.type === 'own') return (t.sourceId === sourceId) || (!t.sourceId && sourceId === 'own-default');
                    return t.sourceId === sourceId;
                }).reduce((acc, t) => acc + t.amount, 0);

                let effectivePrincipal = 0;
                let totalInterestRecv = 0;
                let totalAmortizedRecv = 0;

                clients.forEach(c => {
                    (c.loans || []).forEach(loan => {
                        const matchesSource = loan.sourceId === sourceId || (source.type === 'own' && !loan.sourceId && sourceId === 'own-default');
                        if (!matchesSource) return;
                        let principal = loan.amount;
                        const sorted = [...(loan.payments || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
                        sorted.forEach(p => {
                            const rate = (loan.interestRate || 10) / 100;
                            const interestDue = principal * rate;
                            if (p.amount >= interestDue) {
                                totalInterestRecv += interestDue;
                                const amortized = p.amount - interestDue;
                                totalAmortizedRecv += amortized;
                                principal -= amortized;
                            } else {
                                totalInterestRecv += p.amount;
                            }
                            if (principal < 0) principal = 0;
                        });
                        effectivePrincipal += principal;
                    });
                });

                const base = source.type === 'own' ? 0 : source.receivedAmount;
                return base + sourceTx + totalInterestRecv - effectivePrincipal;
            };

            const showToast = (message) => {
                setToastMessage(message);
                setTimeout(() => setToastMessage(''), 3000);
            };

            // Carregar e Migrar Dados Iniciais
            useEffect(() => {
                const savedData = localStorage.getItem('loanManagerData');
                if (savedData) {
                    let parsed = JSON.parse(savedData);
                    if (parsed.fundsTransactions) setFundsTransactions(parsed.fundsTransactions);
                    if (parsed.clients) {
                        const migratedClients = parsed.clients.map(client => {
                            if (client.transactions && !client.loans) {
                                let oldLoans = client.transactions.filter(t => t.type === 'loan').sort((a,b) => new Date(a.date) - new Date(b.date));
                                let oldPayments = client.transactions.filter(t => t.type === 'payment').sort((a,b) => new Date(a.date) - new Date(b.date));
                                let newLoans = oldLoans.map(l => ({ id: l.id, date: l.date, amount: l.amount, interestRate: 10, payments: [] }));
                                if (newLoans.length > 0 && oldPayments.length > 0) newLoans[0].payments = oldPayments;
                                return { id: client.id, name: client.name, loans: newLoans };
                            }
                            client.loans = (client.loans || []).map(l => ({ ...l, interestRate: l.interestRate ?? 10 }));
                            return client;
                        });
                        setClients(migratedClients);
                    }
                    if (parsed.capitalSources && parsed.capitalSources.length > 0) {
                        setCapitalSources(parsed.capitalSources);
                    } else {
                        setCapitalSources([{ id: 'own-default', type: 'own', name: 'Capital Próprio' }]);
                    }
                    if (parsed.bankPayments) setBankPayments(parsed.bankPayments);
                } else {
                    setCapitalSources([{ id: 'own-default', type: 'own', name: 'Capital Próprio' }]);
                }
            }, []);

            // Salvar dados no Cache
            useEffect(() => {
                localStorage.setItem('loanManagerData', JSON.stringify({ fundsTransactions, clients, capitalSources, bankPayments }));
            }, [fundsTransactions, clients, capitalSources, bankPayments]);

            // --- SISTEMA DE BACKUP ---
            const handleExportBackup = () => {
                const data = { fundsTransactions, clients, capitalSources, bankPayments };
                const dataStr = JSON.stringify(data, null, 2);
                const blob = new Blob([dataStr], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup_financas_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('✅ Backup salvo no celular!');
            };

            const handleImportBackup = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const parsed = JSON.parse(event.target.result);
                        if (parsed && Array.isArray(parsed.clients)) {
                            if(window.confirm('⚠️ ATENÇÃO: Isso vai apagar os dados atuais e carregar o backup. Deseja continuar?')) {
                                setFundsTransactions(parsed.fundsTransactions || []);
                                setCapitalSources(parsed.capitalSources || [{ id: 'own-default', type: 'own', name: 'Capital Próprio' }]);
                                setBankPayments(parsed.bankPayments || []);
                                setClients(parsed.clients);
                                showToast('✅ Backup restaurado com sucesso!');
                            }
                        } else {
                            showToast('❌ O arquivo selecionado não é um backup válido.');
                        }
                    } catch (error) {
                        showToast('❌ Erro ao ler o arquivo de backup.');
                    }
                };
                reader.readAsText(file);
                e.target.value = ''; // Reseta o input para permitir importar o mesmo arquivo se necessário
            };


            // Controle de Tempo do Sistema
            const today = new Date();
            const currentMonth = today.getMonth(); 
            const currentYear = today.getFullYear();
            const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
            const nextMonth = nextMonthDate.getMonth();
            const nextYear = nextMonthDate.getFullYear();

            // Motor de Cálculos Dinâmico
            const globalStats = useMemo(() => {
                let manualFunds = fundsTransactions.reduce((acc, t) => acc + t.amount, 0);
                
                let totalLent = 0;
                let totalInterestReceived = 0;
                let totalAmortizedReceived = 0;
                let totalLoansGiven = 0;

                let totalExpectedThisMonth = 0;
                let totalPaidThisMonth = 0;
                let totalExpectedNextMonth = 0;
                let totalPaidNextMonth = 0;

                // Estatísticas por banco: { sourceId: { interestFromClients, amortizedFromClients, totalLent } }
                const bankStats = {};
                capitalSources.filter(s => s.type === 'bank').forEach(s => {
                    bankStats[s.id] = { name: s.name, interestFromClients: 0, amortizedFromClients: 0, totalLent: 0, receivedAmount: s.receivedAmount, totalToPay: s.totalToPay, totalPaidToBank: s.totalPaidToBank || 0, amortizationFund: s.amortizationFund || 0 };
                });
                let ownInterestReceived = 0;
                let ownAmortizedReceived = 0;

                const processedClients = clients.map(client => {
                    let clientTotalDebt = 0;
                    let cExpectedThis = 0;
                    let cPaidThis = 0;
                    let cExpectedNext = 0;
                    let cPaidNext = 0;

                    const processedLoans = (client.loans || []).map(loan => {
                        let principal = loan.amount;
                        totalLoansGiven += loan.amount;
                        
                        // Acumula total emprestado por banco
                        if (loan.sourceId && bankStats[loan.sourceId]) {
                            bankStats[loan.sourceId].totalLent += loan.amount;
                        }
                        
                        let lPaidThis = 0;
                        let lPaidNext = 0;
                        
                        const [lYearStr, lMonthStr, lDayStr] = loan.date.split('-');
                        const loanMonth = Number(lMonthStr) - 1;
                        const loanYear = Number(lYearStr);

                        let sortedPayments = [...loan.payments].sort((a, b) => new Date(a.date) - new Date(b.date));
                        
                        const processedPayments = sortedPayments.map(p => {
                            const interestRate = (loan.interestRate || 10) / 100;
                            const interestDue = principal * interestRate;
                            let interestPaid = 0, amortized = 0;

                            if (p.amount >= interestDue) {
                                interestPaid = interestDue;
                                amortized = p.amount - interestDue;
                            } else {
                                interestPaid = p.amount;
                                amortized = 0;
                            }

                            principal -= amortized;
                            if (principal < 0) principal = 0; 

                            totalInterestReceived += interestPaid;
                            totalAmortizedReceived += amortized;

                            // Acumula por origem do empréstimo
                            if (loan.sourceId && bankStats[loan.sourceId]) {
                                bankStats[loan.sourceId].interestFromClients += interestPaid;
                                bankStats[loan.sourceId].amortizedFromClients += amortized;
                            } else if (!loan.sourceId) {
                                ownInterestReceived += interestPaid;
                                ownAmortizedReceived += amortized;
                            } else {
                                ownInterestReceived += interestPaid;
                                ownAmortizedReceived += amortized;
                            }

                            const [pYearStr, pMonthStr, pDayStr] = p.date.split('-');
                            const pM = Number(pMonthStr) - 1;
                            const pY = Number(pYearStr);

                            const expectsZeroThisMonth = loanYear === currentYear && loanMonth === currentMonth;

                            if (pY === currentYear && pM === currentMonth) {
                                if (expectsZeroThisMonth) {
                                    lPaidNext += interestPaid;
                                } else {
                                    lPaidThis += interestPaid;
                                }
                            } else if (pY === nextYear && pM === nextMonth) {
                                lPaidNext += interestPaid;
                            }

                            return { ...p, interestPaid, amortized, balanceAfter: principal };
                        });

                        let lExpectedThis = 0;
                        let lExpectedNext = 0;
                        const baseInterest = principal * ((loan.interestRate || 10) / 100);

                        if (principal > 0) {
                            if (loanYear < currentYear || (loanYear === currentYear && loanMonth < currentMonth)) {
                                lExpectedThis = baseInterest;
                            }
                            if (loanYear < nextYear || (loanYear === nextYear && loanMonth < nextMonth)) {
                                lExpectedNext = baseInterest;
                            }
                        }

                        let lPendingThis = Math.max(0, lExpectedThis - lPaidThis);
                        
                        let lDisplayMonthStr = capitalize(today.toLocaleString('pt-BR', { month: 'short' })).replace('.', '');
                        let isLoanOK = false;
                        let loanDashPending = lPendingThis;

                        if (principal === 0) {
                            isLoanOK = true;
                        } else if (lPendingThis === 0) {
                            lDisplayMonthStr = capitalize(nextMonthDate.toLocaleString('pt-BR', { month: 'short' })).replace('.', '');
                            let lPendingNext = Math.max(0, lExpectedNext - lPaidNext);
                            loanDashPending = lPendingNext;
                            if (lPendingNext === 0) isLoanOK = true; 
                        }

                        clientTotalDebt += principal;
                        cExpectedThis += lExpectedThis;
                        cPaidThis += lPaidThis;
                        cExpectedNext += lExpectedNext;
                        cPaidNext += lPaidNext;

                        return { 
                            ...loan, 
                            processedPayments, 
                            currentPrincipal: principal, 
                            isPaidOff: principal <= 0,
                            baseInterest,
                            loanDisplayMonthStr: lDisplayMonthStr,
                            loanDashPending,
                            isLoanOK
                        };
                    }).sort((a, b) => new Date(b.date) - new Date(a.date)); 

                    let cPendingThis = Math.max(0, cExpectedThis - cPaidThis);
                    let cDisplayMonthStr = capitalize(today.toLocaleString('pt-BR', { month: 'short' })).replace('.', '');
                    let cDisplayExpected = cExpectedThis;
                    let cDisplayPending = cPendingThis;
                    let cIsNextMonth = false;

                    if (clientTotalDebt > 0 && cPendingThis === 0) {
                        cDisplayMonthStr = capitalize(nextMonthDate.toLocaleString('pt-BR', { month: 'short' })).replace('.', '');
                        cDisplayExpected = cExpectedNext;
                        cDisplayPending = Math.max(0, cDisplayExpected - cPaidNext);
                        cIsNextMonth = true;
                    }

                    totalLent += clientTotalDebt;
                    totalExpectedThisMonth += cExpectedThis;
                    totalPaidThisMonth += cPaidThis;
                    totalExpectedNextMonth += cExpectedNext;
                    totalPaidNextMonth += cPaidNext;

                    return { 
                        ...client, 
                        currentDebt: clientTotalDebt, 
                        loans: processedLoans,
                        dashMonthStr: cDisplayMonthStr,
                        dashExpected: cDisplayExpected,
                        dashPending: cDisplayPending,
                        isNextMonth: cIsNextMonth
                    }; 
                });

                const availableMoney = manualFunds + totalInterestReceived + totalAmortizedReceived - totalLoansGiven;
                
                // Lucro Real: juros de capital próprio + amortização total + excedente de juros bancários
                let realProfit = ownInterestReceived + totalAmortizedReceived;
                let committedCapital = 0;
                const bankDetails = [];
                Object.values(bankStats).forEach(bs => {
                    const bankRemaining = Math.max(0, bs.totalToPay - bs.totalPaidToBank);
                    if (bankRemaining > 0) {
                        const committedInterest = Math.min(bs.interestFromClients, bankRemaining);
                        committedCapital += committedInterest;
                        realProfit += Math.max(0, bs.interestFromClients - bankRemaining);
                    } else {
                        realProfit += bs.interestFromClients;
                    }
                    bankDetails.push({ ...bs, remainingDebt: bankRemaining });
                });
                
                let overPendingThis = Math.max(0, totalExpectedThisMonth - totalPaidThisMonth);
                let dashMonthStr = capitalize(today.toLocaleString('pt-BR', { month: 'long' }));
                let dashExpected = totalExpectedThisMonth;
                let dashPaid = totalPaidThisMonth;
                let dashPending = overPendingThis;

                if (totalLent > 0 && overPendingThis === 0) {
                    dashMonthStr = capitalize(nextMonthDate.toLocaleString('pt-BR', { month: 'long' }));
                    dashExpected = totalExpectedNextMonth;
                    dashPaid = totalPaidNextMonth;
                    dashPending = Math.max(0, dashExpected - dashPaid);
                }

                return { 
                    availableMoney, 
                    totalLent, 
                    processedClients,
                    dashMonthStr,
                    dashExpected,
                    dashPaid,
                    dashPending,
                    realProfit,
                    committedCapital,
                    bankDetails,
                    ownInterestReceived
                };
            }, [clients, fundsTransactions, currentMonth, currentYear, nextMonth, nextYear]);


            const state = { globalStats, capitalSources, clients, fundsTransactions, bankPayments };
            const actions = { setFundsTransactions, setCapitalSources, setBankPayments, setClients, setSelectedClient };
            const utils = { showToast, getCapitalBalance };

            return (
                <div className="max-w-md mx-auto bg-gray-50 min-h-screen shadow-2xl relative overflow-hidden flex flex-col">
                    <div className="bg-white pt-10 pb-4 px-6 shadow-sm z-0">
                        <h1 className="text-2xl font-black text-gray-800 tracking-tight">Finanças <span className="text-blue-600">Pro</span></h1>
                    </div>
                    <div className="flex bg-white px-4 border-b border-gray-200">
                        <button data-testid="nav-painel" className={`flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'dashboard' ? 'tab-active' : 'text-gray-500'}`} onClick={() => setActiveTab('dashboard')}>Painel</button>
                        <button data-testid="nav-origens" className={`flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'origins' ? 'tab-active' : 'text-gray-500'}`} onClick={() => setActiveTab('origins')}>Origens</button>
                        <button data-testid="nav-clientes" className={`flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'clients' ? 'tab-active' : 'text-gray-500'}`} onClick={() => setActiveTab('clients')}>Clientes</button>
                    </div>
                    <div className="flex-1 overflow-y-auto hide-scroll pb-10">
                        {activeTab === 'dashboard' ? <Dashboard onExport={handleExportBackup} onImport={handleImportBackup} state={state} actions={actions} utils={utils} /> : activeTab === 'origins' ? <SourcesList state={state} actions={actions} utils={utils} /> : <ClientsList state={state} actions={actions} utils={utils} />}
                    </div>
                    {selectedClient && (
                        <ClientView clientData={globalStats.processedClients.find(c => c.id === selectedClient.id)} availableMoney={globalStats.availableMoney} state={state} actions={actions} utils={utils} />
                    )}
                    {toastMessage && (
                        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-5 py-3 rounded-full shadow-2xl z-50 font-medium text-sm toast-anim whitespace-nowrap">
                            {toastMessage}
                        </div>
                    )}
                </div>
            );
        }