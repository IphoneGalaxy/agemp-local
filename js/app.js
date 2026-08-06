        function App() {
            const [activeTab, setActiveTab] = useState('dashboard');
            const [fundsTransactions, setFundsTransactions] = useState([]);
            const [clients, setClients] = useState([]);
            const [selectedClient, setSelectedClient] = useState(null);
            const [toastMessage, setToastMessage] = useState('');
            const [capitalSources, setCapitalSources] = useState([]);
            const [bankPayments, setBankPayments] = useState([]);
            const [isHydrated, setIsHydrated] = useState(false);

            const getSourceSummary = (sourceId) => FinanceEngine.getSourceSummary({
                sourceId,
                capitalSources,
                fundsTransactions,
                clients,
                bankPayments
            });

            const getCapitalBalance = (sourceId) => getSourceSummary(sourceId).available;

            const showToast = (message) => {
                setToastMessage(message);
                setTimeout(() => setToastMessage(''), 3000);
            };

            // Carregar e Migrar Dados Iniciais
            useEffect(() => {
                const savedData = localStorage.getItem('loanManagerData');
                try {
                    const parsed = savedData ? JSON.parse(savedData) : {};

                    if (savedData && parsed.schemaVersion !== FinanceEngine.SCHEMA_VERSION) {
                        const safetyKey = 'loanManagerDataBackupBeforeV2';
                        if (!localStorage.getItem(safetyKey)) localStorage.setItem(safetyKey, savedData);
                    }

                    const migrated = FinanceEngine.migrateData(parsed);
                    setFundsTransactions(migrated.fundsTransactions);
                    setClients(migrated.clients);
                    setCapitalSources(migrated.capitalSources);
                    setBankPayments(migrated.bankPayments);
                } catch (error) {
                    const emptyData = FinanceEngine.migrateData({});
                    setCapitalSources(emptyData.capitalSources);
                    showToast('❌ Não foi possível carregar os dados salvos. O backup anterior foi preservado.');
                } finally {
                    setIsHydrated(true);
                }
            }, []);

            // Salvar dados no Cache
            useEffect(() => {
                if (!isHydrated) return;
                localStorage.setItem('loanManagerData', JSON.stringify({
                    schemaVersion: FinanceEngine.SCHEMA_VERSION,
                    fundsTransactions,
                    clients,
                    capitalSources,
                    bankPayments
                }));
            }, [isHydrated, fundsTransactions, clients, capitalSources, bankPayments]);

            // --- SISTEMA DE BACKUP ---
            const handleExportBackup = () => {
                const data = {
                    schemaVersion: FinanceEngine.SCHEMA_VERSION,
                    fundsTransactions,
                    clients,
                    capitalSources,
                    bankPayments
                };
                const dataStr = JSON.stringify(data, null, 2);
                const blob = new Blob([dataStr], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup_financas_${FinanceEngine.localIsoDate(new Date())}.txt`;
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
                        const validation = FinanceEngine.validateBackup(parsed);
                        if (!validation.valid) {
                            showToast(`❌ Backup inválido: ${validation.errors[0]}`);
                            return;
                        }

                        const summary = validation.summary;
                        const warningLine = validation.warnings.length > 0
                            ? `\n\n⚠️ ${validation.warnings.join('\n⚠️ ')}`
                            : '';
                        const confirmed = window.confirm(
                            `Importar este backup?\n\n` +
                            `${summary.clients} clientes · ${summary.loans} empréstimos\n` +
                            `${summary.capitalSources} origens · ${summary.bankPayments} registros bancários` +
                            `${warningLine}\n\nOs dados atuais serão guardados antes da restauração.`
                        );

                        if (confirmed) {
                            const currentData = localStorage.getItem('loanManagerData');
                            if (currentData) localStorage.setItem('loanManagerDataBackupBeforeImport', currentData);

                            const migrated = FinanceEngine.migrateData(parsed);
                            setFundsTransactions(migrated.fundsTransactions);
                            setCapitalSources(migrated.capitalSources);
                            setBankPayments(migrated.bankPayments);
                            setClients(migrated.clients);
                            showToast(validation.warnings.length > 0
                                ? '✅ Backup restaurado com alertas preservados para revisão.'
                                : '✅ Backup restaurado com sucesso!');
                        }
                    } catch (error) {
                        showToast('❌ Erro ao ler o arquivo de backup.');
                    }
                };
                reader.readAsText(file);
                e.target.value = ''; // Reseta o input para permitir importar o mesmo arquivo se necessário
            };


            const referenceDate = FinanceEngine.localIsoDate(new Date());
            const globalStats = useMemo(() => FinanceEngine.calculateGlobalStats({
                clients,
                fundsTransactions,
                capitalSources,
                bankPayments,
                referenceDate
            }), [clients, fundsTransactions, capitalSources, bankPayments, referenceDate]);


            const state = { globalStats, capitalSources, clients, fundsTransactions, bankPayments };
            const actions = { setFundsTransactions, setCapitalSources, setBankPayments, setClients, setSelectedClient };
            const utils = { showToast, getCapitalBalance, getSourceSummary };

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
