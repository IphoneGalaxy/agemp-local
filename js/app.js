        function App() {
            const [isAuthenticated, setIsAuthenticated] = useState(() => (typeof LocalAuth !== 'undefined' ? LocalAuth.isSessionActive() : true));
            const [activeTab, setActiveTab] = useState('dashboard');
            const [fundsTransactions, setFundsTransactions] = useState([]);
            const [clients, setClients] = useState([]);
            const [selectedClient, setSelectedClient] = useState(null);
            const [suppliers, setSuppliers] = useState([]);
            const [selectedSupplier, setSelectedSupplier] = useState(null);
            const [toastMessage, setToastMessage] = useState('');
            const [capitalSources, setCapitalSources] = useState([]);
            const [bankPayments, setBankPayments] = useState([]);
            const [historicalInterestAllocations, setHistoricalInterestAllocations] = useState([]);
            const [isHydrated, setIsHydrated] = useState(false);

            // Estados para Gestão de Conta e Exclusão
            const [showAccountModal, setShowAccountModal] = useState(false);
            const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
            const [deleteConfirmText, setDeleteConfirmText] = useState('');
            const [copiedPublicKey, setCopiedPublicKey] = useState(false);

            const [currentPassInput, setCurrentPassInput] = useState('');
            const [newPassInput, setNewPassInput] = useState('');
            const [confirmNewPassInput, setConfirmNewPassInput] = useState('');
            const [changePassError, setChangePassError] = useState('');
            const [changePassSuccess, setChangePassSuccess] = useState('');
            const [isChangingPass, setIsChangingPass] = useState(false);

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

            // Carregar e Migrar Dados Iniciais com armazenamento seguro
            useEffect(() => {
                const savedData = SecureStorage.getItem('loanManagerData');
                try {
                    let parsed = {};
                    if (savedData) {
                        parsed = JSON.parse(savedData);
                        if (parsed.schemaVersion !== FinanceEngine.SCHEMA_VERSION) {
                            const safetyKey = 'loanManagerDataBackupBeforeV3';
                            if (!SecureStorage.getItem(safetyKey)) SecureStorage.setItem(safetyKey, savedData);
                        }
                    }

                    const migrated = FinanceEngine.migrateData(parsed);
                    setFundsTransactions(migrated.fundsTransactions || []);
                    setClients(migrated.clients || []);
                    setCapitalSources(migrated.capitalSources || []);
                    setBankPayments(migrated.bankPayments || []);
                    setHistoricalInterestAllocations(migrated.historicalInterestAllocations || []);
                    setSuppliers(migrated.suppliers || []);
                } catch (error) {
                    const emptyData = FinanceEngine.migrateData({});
                    setFundsTransactions(emptyData.fundsTransactions || []);
                    setClients(emptyData.clients || []);
                    setCapitalSources(emptyData.capitalSources || []);
                    setBankPayments(emptyData.bankPayments || []);
                    setHistoricalInterestAllocations(emptyData.historicalInterestAllocations || []);
                    setSuppliers(emptyData.suppliers || []);
                } finally {
                    setIsHydrated(true);
                }
            }, []);

            // Salvar dados no Cache Protegido (sem texto claro exposto no navegador)
            useEffect(() => {
                if (!isHydrated) return;
                SecureStorage.setItem('loanManagerData', JSON.stringify({
                    schemaVersion: FinanceEngine.SCHEMA_VERSION,
                    fundsTransactions,
                    clients,
                    capitalSources,
                    bankPayments,
                    historicalInterestAllocations,
                    suppliers
                }));
            }, [isHydrated, fundsTransactions, clients, capitalSources, bankPayments, historicalInterestAllocations, suppliers]);

            // --- SISTEMA DE BACKUP (CRIPTOGRAFADO E ATRELADO À CONTA) ---
            const handleExportBackup = async () => {
                try {
                    const rawData = FinanceEngine.createBackup({
                        fundsTransactions,
                        clients,
                        capitalSources,
                        bankPayments,
                        historicalInterestAllocations,
                        suppliers
                    });

                    let dataToExport = rawData;
                    let isEncrypted = false;

                    if (typeof LocalAuth !== 'undefined' && LocalAuth.hasMasterPassword()) {
                        dataToExport = await LocalAuth.encryptBackup(rawData);
                        isEncrypted = true;
                    }

                    const dataStr = JSON.stringify(dataToExport, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `backup_financas_${isEncrypted ? 'protegido_' : ''}${FinanceEngine.localIsoDate(new Date())}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast(isEncrypted ? '🔒 Backup criptografado e vinculado à sua conta salvo!' : '✅ Backup salvo com sucesso!');
                } catch (err) {
                    showToast('❌ Erro ao gerar arquivo de backup.');
                }
            };

            const [importModalData, setImportModalData] = useState(null);
            const [encryptedImportPending, setEncryptedImportPending] = useState(null);
            const [backupPasswordInput, setBackupPasswordInput] = useState('');
            const [backupPasswordError, setBackupPasswordError] = useState('');
            const [showBackupPassword, setShowBackupPassword] = useState(false);

            // Estados para Backup Exclusivo de Cliente
            const [clientBackupModal, setClientBackupModal] = useState(null);
            const [clientImportMismatch, setClientImportMismatch] = useState(null);
            const [clientImportPending, setClientImportPending] = useState(null);

            const openClientBackupModal = (client) => {
                const pin = typeof LocalAuth !== 'undefined' && LocalAuth.generateSharePin 
                    ? LocalAuth.generateSharePin() 
                    : String(Math.floor(1000 + Math.random() * 9000));

                setClientBackupModal({
                    client,
                    senderName: 'Fornecedor / Credor',
                    recipientKey: client.publicKey || '',
                    pin: pin,
                    isGenerated: false,
                    generatedFileName: '',
                    error: '',
                    copiedPin: false,
                    copiedMessage: false
                });
            };

            const handleGenerateClientBackup = async (e) => {
                if (e) e.preventDefault();
                if (!clientBackupModal) return;
                const { client, recipientKey, pin, senderName } = clientBackupModal;

                const cleanRecipient = recipientKey.trim().toUpperCase();
                if (!cleanRecipient || !cleanRecipient.startsWith('PUB-')) {
                    setClientBackupModal(prev => ({ ...prev, error: 'A Chave Pública do Cliente é obrigatória e deve começar com "PUB-".' }));
                    return;
                }
                const cleanPin = pin.trim();
                if (!/^\d{4}$/.test(cleanPin)) {
                    setClientBackupModal(prev => ({ ...prev, error: 'A senha de compartilhamento deve conter exatamente 4 dígitos numéricos.' }));
                    return;
                }

                const cleanSenderName = String(senderName || 'Fornecedor / Credor').trim();

                try {
                    // Atualiza a chave pública no cliente caso tenha mudado
                    if (client.publicKey !== cleanRecipient) {
                        const updatedClients = clients.map(c => c.id === client.id ? { ...c, publicKey: cleanRecipient } : c);
                        setClients(updatedClients);
                    }

                    const encryptedPkg = await LocalAuth.encryptClientBackup(client, cleanRecipient, cleanPin, cleanSenderName);
                    const dataStr = JSON.stringify(encryptedPkg, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const cleanName = (client.name || 'cliente').replace(/\s+/g, '_').toLowerCase();
                    const fileName = `backup_cliente_${cleanName}_${FinanceEngine.localIsoDate(new Date())}.json`;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    setClientBackupModal(prev => ({
                        ...prev,
                        isGenerated: true,
                        generatedFileName: fileName,
                        error: ''
                    }));
                    showToast('📦 Arquivo de backup do cliente baixado!');
                } catch (err) {
                    setClientBackupModal(prev => ({ ...prev, error: err.message || 'Erro ao gerar backup criptografado do cliente.' }));
                }
            };

            const processParsedBackupData = (dataPayload, meta = {}) => {
                const validation = FinanceEngine.validateBackup(dataPayload);
                if (!validation.valid) {
                    showToast(`❌ Backup inválido: ${validation.errors[0]}`);
                    return;
                }

                const warnings = [...(validation.warnings || [])];
                if (meta.isLegacy) {
                    warnings.unshift('Formato de backup anterior (não-criptografado). Os próximos backups que você salvar serão automaticamente criptografados e vinculados à sua conta.');
                }

                setImportModalData({
                    parsed: dataPayload,
                    summary: validation.summary,
                    warnings,
                    isEncrypted: meta.isEncrypted,
                    sameVault: meta.sameVault
                });
            };

            const handleImportBackup = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        let parsed;
                        const content = event.target.result.trim();
                        try {
                            parsed = JSON.parse(content);
                        } catch (jsonErr) {
                            if (FinanceEngine.parseLegacyBackup) {
                                parsed = FinanceEngine.parseLegacyBackup(content);
                            } else {
                                throw jsonErr;
                            }
                        }

                        // 1. Verifica se é um pacote de backup de cliente exclusivo (FINANCAS_PRO_CLIENT_EXPORT_V1)
                        if (parsed && parsed._format === 'FINANCAS_PRO_CLIENT_EXPORT_V1') {
                            if (typeof LocalAuth === 'undefined') {
                                showToast('❌ Módulo de autenticação indisponível.');
                                return;
                            }

                            const myPublicKey = LocalAuth.getPublicKey();
                            // Se a chave pública do arquivo não bater com a da conta atual logada:
                            if (!myPublicKey || myPublicKey !== parsed.recipientPublicKey) {
                                setClientImportMismatch({
                                    expectedKey: parsed.recipientPublicKey,
                                    myKey: myPublicKey || 'Nenhuma (crie sua conta primeiro)',
                                    senderKey: parsed.senderPublicKey,
                                    clientName: parsed.clientName
                                });
                                return;
                            }

                            // Chave pública bate perfeitamente! Solicita PIN de 4 dígitos e senha de login
                            setClientImportPending({
                                parsedFile: parsed,
                                pinInput: '',
                                loginPasswordInput: '',
                                error: '',
                                isSubmitting: false
                            });
                            return;
                        }

                        // 2. Verifica se é um backup geral criptografado
                        if (parsed && parsed._format === 'FINANCAS_PRO_ENCRYPTED_VAULT_V1') {
                            if (typeof LocalAuth === 'undefined') {
                                showToast('❌ Módulo de autenticação indisponível.');
                                return;
                            }

                            try {
                                const decryptResult = await LocalAuth.decryptBackup(parsed);
                                processParsedBackupData(decryptResult.data, {
                                    isEncrypted: true,
                                    sameVault: decryptResult.sameVault
                                });
                            } catch (decErr) {
                                // Se a descriptografia falhar com a chave ativa (ex: arquivo de outra conta ou senha diferente)
                                setEncryptedImportPending({ parsedFile: parsed });
                                setBackupPasswordInput('');
                                setBackupPasswordError('');
                            }
                            return;
                        }

                        // 3. Backup legado sem criptografia
                        processParsedBackupData(parsed, { isLegacy: true, isEncrypted: false });
                    } catch (error) {
                        showToast('❌ Erro ao ler o arquivo de backup.');
                    }
                };
                reader.readAsText(file);
                e.target.value = ''; // Reseta o input para permitir importar o mesmo arquivo se necessário
            };

            const handleDecryptExternalBackup = async (e) => {
                if (e) e.preventDefault();
                if (!encryptedImportPending || !backupPasswordInput) return;
                setBackupPasswordError('');

                const rawInput = backupPasswordInput.trim();
                const cleanKey = (typeof LocalAuth !== 'undefined' && LocalAuth.normalizeKey)
                    ? LocalAuth.normalizeKey(rawInput)
                    : rawInput.toUpperCase().replace(/[^A-Z0-9]/g, '');

                try {
                    // Tenta primeiro com a Chave de Recuperação normalizada
                    let result = null;
                    try {
                        result = await LocalAuth.decryptBackup(encryptedImportPending.parsedFile, cleanKey.length === 16 ? cleanKey : rawInput);
                    } catch (primaryErr) {
                        // Se falhar e cleanKey for diferente de rawInput, tenta com rawInput
                        if (cleanKey !== rawInput) {
                            result = await LocalAuth.decryptBackup(encryptedImportPending.parsedFile, rawInput);
                        } else {
                            throw primaryErr;
                        }
                    }

                    if (result && result.data) {
                        const pending = encryptedImportPending;
                        setEncryptedImportPending(null);
                        setBackupPasswordInput('');
                        setBackupPasswordError('');
                        processParsedBackupData(result.data, { isEncrypted: true, sameVault: false });
                    }
                } catch (err) {
                    setBackupPasswordError('Chave de recuperação incorreta para este backup.');
                }
            };

            const handleDecryptAndImportClientData = async (e) => {
                if (e) e.preventDefault();
                if (!clientImportPending) return;
                const { parsedFile, pinInput, loginPasswordInput } = clientImportPending;

                const cleanPin = pinInput.trim();
                if (!/^\d{4}$/.test(cleanPin)) {
                    setClientImportPending(prev => ({ ...prev, error: 'Digite a senha/PIN de 4 dígitos enviada pelo fornecedor.' }));
                    return;
                }
                if (!loginPasswordInput) {
                    setClientImportPending(prev => ({ ...prev, error: 'Digite sua Senha Mestra de Login para autorizar.' }));
                    return;
                }

                setClientImportPending(prev => ({ ...prev, isSubmitting: true, error: '' }));

                try {
                    // Valida a senha mestra de login da conta do usuário logado
                    const isLoginValid = await LocalAuth.verifyMasterPassword(loginPasswordInput);
                    if (!isLoginValid) {
                        setClientImportPending(prev => ({ ...prev, isSubmitting: false, error: 'Sua Senha de Login está incorreta.' }));
                        return;
                    }

                    // Descriptografa os dados com o PIN de 4 dígitos
                    const decrypted = await LocalAuth.decryptClientBackup(parsedFile, cleanPin);
                    const clientData = decrypted.client;
                    const senderKey = decrypted.senderPublicKey || parsedFile.senderPublicKey || 'PUB-NÃO INFORMADA';
                    const senderName = decrypted.senderName || parsedFile.senderName || 'Fornecedor / Credor';

                    // Atualiza ou adiciona na lista de FORNECEDORES (modo somente leitura)
                    const currentSuppliers = [...suppliers];
                    const existingIdx = currentSuppliers.findIndex(s => 
                        (s.publicKey && senderKey && s.publicKey.toUpperCase() === senderKey.toUpperCase()) ||
                        (s.name && s.name.toLowerCase().trim() === senderName.toLowerCase().trim())
                    );

                    const supplierId = existingIdx >= 0 ? currentSuppliers[existingIdx].id : generateId();
                    const updatedSupplier = {
                        id: supplierId,
                        name: senderName,
                        publicKey: senderKey,
                        lastSyncDate: new Date().toISOString(),
                        loans: clientData.loans || [],
                        clientName: clientData.name,
                        readOnly: true,
                        version: decrypted.version || Date.now()
                    };

                    if (existingIdx >= 0) {
                        currentSuppliers[existingIdx] = updatedSupplier;
                    } else {
                        currentSuppliers.unshift(updatedSupplier);
                    }

                    setSuppliers(currentSuppliers);
                    setClientImportPending(null);
                    setActiveTab('suppliers');
                    setSelectedSupplier(updatedSupplier);
                    showToast(`🎉 Dados do fornecedor "${senderName}" atualizados na aba Fornecedores!`);
                } catch (err) {
                    setClientImportPending(prev => ({
                        ...prev,
                        isSubmitting: false,
                        error: err.message === 'PIN_OR_KEY_INVALID' 
                            ? 'PIN de 4 dígitos incorreto.' 
                            : (err.message || 'Erro ao descriptografar arquivo do fornecedor.')
                    }));
                }
            };

            const confirmAndApplyImport = () => {
                if (!importModalData) return;
                const { parsed, warnings } = importModalData;
                try {
                    const currentData = localStorage.getItem('loanManagerData');
                    if (currentData) localStorage.setItem('loanManagerDataBackupBeforeImport', currentData);

                    const migrated = FinanceEngine.migrateData(parsed);
                    setFundsTransactions(migrated.fundsTransactions || []);
                    setCapitalSources(migrated.capitalSources || []);
                    setBankPayments(migrated.bankPayments || []);
                    setClients(migrated.clients || []);
                    setHistoricalInterestAllocations(migrated.historicalInterestAllocations || []);
                    setSuppliers(migrated.suppliers || []);
                    setImportModalData(null);
                    showToast(warnings.length > 0
                        ? '✅ Backup restaurado com alertas preservados para revisão.'
                        : '✅ Backup restaurado com sucesso!');
                } catch (err) {
                    showToast('❌ Erro ao restaurar backup.');
                }
            };

            // Alterar Senha Mestra
            const handleChangePasswordSubmit = async (e) => {
                e.preventDefault();
                setChangePassError('');
                setChangePassSuccess('');
                if (!currentPassInput) {
                    setChangePassError('Digite a sua senha mestra atual.');
                    return;
                }
                if (!newPassInput || newPassInput.length < 4) {
                    setChangePassError('A nova senha deve ter no mínimo 4 caracteres.');
                    return;
                }
                if (newPassInput !== confirmNewPassInput) {
                    setChangePassError('A confirmação da nova senha não confere.');
                    return;
                }
                setIsChangingPass(true);
                try {
                    await LocalAuth.changePassword(currentPassInput, newPassInput);
                    setChangePassSuccess('✅ Senha mestra alterada com sucesso!');
                    setCurrentPassInput('');
                    setNewPassInput('');
                    setConfirmNewPassInput('');
                    showToast('🔒 Senha mestra atualizada com sucesso!');
                } catch (err) {
                    setChangePassError(err.message || 'Erro ao alterar senha.');
                } finally {
                    setIsChangingPass(false);
                }
            };

            // Excluir Conta e Dados do Dispositivo
            const handleDeleteAccountConfirmed = () => {
                if (deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR') {
                    showToast('❌ Digite EXCLUIR para confirmar.');
                    return;
                }
                if (typeof LocalAuth !== 'undefined') {
                    LocalAuth.deleteAccount();
                }
                setFundsTransactions([]);
                setClients([]);
                setSelectedClient(null);
                setCapitalSources([]);
                setBankPayments([]);
                setHistoricalInterestAllocations([]);
                setSuppliers([]);
                setSelectedSupplier(null);
                setShowDeleteAccountModal(false);
                setShowAccountModal(false);
                setDeleteConfirmText('');
                setIsAuthenticated(false);
                showToast('🗑️ Sua conta e todos os dados foram excluídos com sucesso.');
            };


            const referenceDate = FinanceEngine.localIsoDate(new Date());
            const globalStats = useMemo(() => FinanceEngine.calculateGlobalStats({
                clients,
                fundsTransactions,
                capitalSources,
                bankPayments,
                referenceDate
            }), [clients, fundsTransactions, capitalSources, bankPayments, referenceDate]);


            const state = { globalStats, capitalSources, clients, fundsTransactions, bankPayments, historicalInterestAllocations, suppliers, selectedSupplier };
            const actions = { setFundsTransactions, setCapitalSources, setBankPayments, setClients, setSelectedClient, setSuppliers, setSelectedSupplier, openClientBackupModal };
            const utils = { showToast, getCapitalBalance, getSourceSummary };

            if (!isAuthenticated) {
                return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} showToast={showToast} />;
            }

            return (
                <div className={`${activeTab === 'planning' ? 'max-w-[1400px]' : 'max-w-md'} mx-auto bg-gray-50 min-h-screen shadow-2xl relative overflow-hidden flex flex-col transition-[max-width] duration-200`}>
                    <div className="bg-white pt-10 pb-4 px-6 shadow-sm z-0 flex items-center justify-between">
                        <h1 className="text-2xl font-black text-gray-800 tracking-tight">Finanças <span className="text-blue-600">Pro</span></h1>
                        {typeof LocalAuth !== 'undefined' && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setShowAccountModal(true);
                                        setChangePassError('');
                                        setChangePassSuccess('');
                                    }}
                                    title="Configurações da Conta e Segurança"
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 px-3 py-1.5 rounded-xl border border-slate-200 transition-all shadow-xs"
                                >
                                    <span>⚙️</span>
                                    <span className="font-semibold">Conta</span>
                                </button>
                                <button
                                    onClick={() => {
                                        LocalAuth.logout();
                                        setIsAuthenticated(false);
                                        if (LocalAuth.hasMasterPassword()) {
                                            showToast('🔒 Aplicativo bloqueado!');
                                        }
                                    }}
                                    title={LocalAuth.hasMasterPassword() ? 'Bloquear aplicativo' : 'Configurar Senha Mestra'}
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 px-3 py-1.5 rounded-xl border border-slate-200 transition-all shadow-xs"
                                >
                                    <span>🔒</span>
                                    <span className="font-semibold">{LocalAuth.hasMasterPassword() ? 'Bloquear' : 'Configurar Senha'}</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex bg-white px-2 sm:px-4 border-b border-gray-200 overflow-x-auto hide-scroll" role="navigation" aria-label="Navegação principal">
                        <button data-testid="nav-painel" className={`min-w-[72px] flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'dashboard' ? 'tab-active' : 'text-gray-500'}`} onClick={() => { setActiveTab('dashboard'); setSelectedSupplier(null); }}>Painel</button>
                        <button data-testid="nav-origens" className={`min-w-[72px] flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'origins' ? 'tab-active' : 'text-gray-500'}`} onClick={() => { setActiveTab('origins'); setSelectedSupplier(null); }}>Origens</button>
                        <button data-testid="nav-clientes" className={`min-w-[72px] flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'clients' ? 'tab-active' : 'text-gray-500'}`} onClick={() => { setActiveTab('clients'); setSelectedSupplier(null); }}>Clientes</button>
                        <button data-testid="nav-fornecedores" className={`min-w-[95px] flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'suppliers' ? 'tab-active' : 'text-gray-500'}`} onClick={() => { setActiveTab('suppliers'); setSelectedSupplier(null); }}>Fornecedores {suppliers.length > 0 ? `(${suppliers.length})` : ''}</button>
                        <button data-testid="nav-planejamento" className={`min-w-[105px] flex-1 py-3 text-center text-sm transition-colors ${activeTab === 'planning' ? 'tab-active' : 'text-gray-500'}`} onClick={() => { setActiveTab('planning'); setSelectedSupplier(null); }}>Planejamento</button>
                    </div>
                    <div className="flex-1 overflow-y-auto hide-scroll pb-10">
                        {activeTab === 'dashboard' ? (
                            <Dashboard onExport={handleExportBackup} onImport={handleImportBackup} state={state} actions={actions} utils={utils} />
                        ) : activeTab === 'origins' ? (
                            <SourcesList state={state} actions={actions} utils={utils} />
                        ) : activeTab === 'clients' ? (
                            <ClientsList state={state} actions={actions} utils={utils} />
                        ) : activeTab === 'suppliers' ? (
                            <SuppliersList suppliers={suppliers} setSuppliers={setSuppliers} selectedSupplier={selectedSupplier} setSelectedSupplier={setSelectedSupplier} utils={utils} />
                        ) : (
                            <PlanningView state={state} utils={utils} />
                        )}
                    </div>
                    {selectedClient && (
                        <ClientView clientData={globalStats.processedClients.find(c => c.id === selectedClient.id)} availableMoney={globalStats.availableMoney} state={state} actions={actions} utils={utils} />
                    )}
                    {importModalData && (
                        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg">
                                        📥
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-base">Importar Backup?</h3>
                                        <p className="text-xs text-gray-500">Confira o conteúdo antes de restaurar</p>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-xl p-3.5 space-y-1.5 text-xs text-gray-700 border border-gray-200/70">
                                    <div className="pb-1 mb-1 border-b border-gray-200 flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-gray-500">Proteção do Arquivo:</span>
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${importModalData.isEncrypted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                                            {importModalData.isEncrypted ? (importModalData.sameVault ? '🔒 Criptografado (Sua Conta)' : '🔐 Criptografado (Autenticado)') : '📂 Formato Legado'}
                                        </span>
                                    </div>
                                    <p className="flex justify-between font-medium">
                                        <span>Clientes cadastrados:</span>
                                        <span className="font-bold text-gray-900">{importModalData.summary.clients}</span>
                                    </p>
                                    <p className="flex justify-between font-medium">
                                        <span>Total de empréstimos:</span>
                                        <span className="font-bold text-gray-900">{importModalData.summary.loans}</span>
                                    </p>
                                    <p className="flex justify-between font-medium">
                                        <span>Origens de capital:</span>
                                        <span className="font-bold text-gray-900">{importModalData.summary.capitalSources}</span>
                                    </p>
                                    <p className="flex justify-between font-medium">
                                        <span>Registros bancários:</span>
                                        <span className="font-bold text-gray-900">{importModalData.summary.bankPayments}</span>
                                    </p>
                                </div>

                                {importModalData.warnings && importModalData.warnings.length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                                        <p className="font-bold">⚠️ Observações:</p>
                                        {importModalData.warnings.map((w, idx) => (
                                            <p key={idx}>• {w}</p>
                                        ))}
                                    </div>
                                )}

                                <p className="text-[11px] text-gray-500">
                                    Os dados atuais serão guardados em segurança no armazenamento local antes da restauração.
                                </p>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setImportModalData(null)}
                                        className="flex-1 py-2.5 px-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-100 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirmAndApplyImport}
                                        className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition-colors"
                                    >
                                        Confirmar Importação
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {encryptedImportPending && (
                        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-lg">
                                        🔐
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-base">Backup Protegido</h3>
                                        <p className="text-xs text-gray-500">Criptografado com Chave de Recuperação</p>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Por segurança máxima, este backup só pode ser liberado com a <strong>Chave de Recuperação de 16 caracteres</strong> da conta de origem:
                                </p>

                                <form onSubmit={handleDecryptExternalBackup} className="space-y-3">
                                    <div className="relative">
                                        <input
                                            type={showBackupPassword ? "text" : "password"}
                                            value={backupPasswordInput}
                                            onChange={(e) => setBackupPasswordInput(e.target.value)}
                                            placeholder="Ex: ABCD-1234-EFGH-5678"
                                            className="w-full pl-3.5 pr-10 py-2.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowBackupPassword(prev => !prev)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 text-sm"
                                            title={showBackupPassword ? "Ocultar" : "Mostrar"}
                                        >
                                            {showBackupPassword ? "🙈" : "👁️"}
                                        </button>
                                    </div>

                                    {backupPasswordError && (
                                        <p className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                                            {backupPasswordError}
                                        </p>
                                    )}

                                    <div className="flex gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEncryptedImportPending(null);
                                                setBackupPasswordInput('');
                                                setBackupPasswordError('');
                                                setShowBackupPassword(false);
                                            }}
                                            className="flex-1 py-2.5 px-3 rounded-xl border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-100 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition-colors"
                                        >
                                            Desbloquear
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* MODAL 1: GERAR BACKUP EXCLUSIVO DE CLIENTE */}
                    {clientBackupModal && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-scale-in space-y-4">
                                {!clientBackupModal.isGenerated ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-xl font-bold">
                                                📦
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-800 text-base">Backup do Cliente</h3>
                                                <p className="text-xs text-slate-500">{clientBackupModal.client.name}</p>
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-600 leading-relaxed">
                                            Gere um pacote seguro com os contratos deste cliente. Ele só poderá ser aberto pela conta que possui a <strong>Chave Pública</strong> informada:
                                        </p>

                                        <form onSubmit={handleGenerateClientBackup} className="space-y-3.5">
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                                                    Seu Nome / Identificação de Fornecedor
                                                </label>
                                                <input
                                                    type="text"
                                                    value={clientBackupModal.senderName}
                                                    onChange={(e) => setClientBackupModal({ ...clientBackupModal, senderName: e.target.value })}
                                                    placeholder="Ex: Minha Empresa / Meu Nome"
                                                    required
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    Como você aparecerá na aba "Fornecedores" do seu cliente.
                                                </p>
                                            </div>

                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                                                    Chave Pública do Destinatário (Cliente)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={clientBackupModal.recipientKey}
                                                    onChange={(e) => setClientBackupModal({ ...clientBackupModal, recipientKey: e.target.value.toUpperCase() })}
                                                    placeholder="PUB-XXXX-XXXX-XXXX-XXXX"
                                                    required
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    Peça a chave pública que seu cliente visualiza no painel dele.
                                                </p>
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-[11px] font-bold text-slate-700 uppercase">
                                                        Senha de Compartilhamento (4 dígitos)
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newPin = typeof LocalAuth !== 'undefined' && LocalAuth.generateSharePin 
                                                                ? LocalAuth.generateSharePin() 
                                                                : String(Math.floor(1000 + Math.random() * 9000));
                                                            setClientBackupModal({ ...clientBackupModal, pin: newPin });
                                                        }}
                                                        className="text-[10px] text-blue-600 hover:text-blue-700 font-bold"
                                                    >
                                                        🎲 Gerar Outro PIN
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    maxLength="4"
                                                    pattern="[0-9]{4}"
                                                    value={clientBackupModal.pin}
                                                    onChange={(e) => setClientBackupModal({ ...clientBackupModal, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                                    required
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono font-black text-slate-800 tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[10px] leading-tight">
                                                    ⚠️ <strong>Atenção:</strong> Esta senha de 4 dígitos é exclusiva deste backup. Passe-a para o cliente no particular (WhatsApp). <strong>Não use sua senha mestra de login!</strong>
                                                </div>
                                            </div>

                                            {clientBackupModal.error && (
                                                <p className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                                                    {clientBackupModal.error}
                                                </p>
                                            )}

                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setClientBackupModal(null)}
                                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="submit"
                                                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors"
                                                >
                                                    📥 Gerar e Baixar
                                                </button>
                                            </div>
                                        </form>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-center space-y-3">
                                            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center text-2xl mx-auto">
                                                ✅
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-900 text-lg">Backup Gerado!</h3>
                                                <p className="text-xs text-slate-500">O arquivo foi baixado no seu dispositivo.</p>
                                            </div>

                                            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">PIN de Abertura (4 dígitos):</p>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <span className="text-2xl font-mono font-black text-blue-600 tracking-wider">
                                                            {clientBackupModal.pin}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(clientBackupModal.pin);
                                                                setClientBackupModal(prev => ({ ...prev, copiedPin: true }));
                                                                setTimeout(() => setClientBackupModal(prev => ({ ...prev, copiedPin: false })), 2000);
                                                            }}
                                                            className="text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-slate-50 font-bold"
                                                        >
                                                            {clientBackupModal.copiedPin ? '✓ Copiado' : 'Copiar PIN'}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="pt-2 border-t border-slate-200">
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Chave Destino Vinculada:</p>
                                                    <p className="text-xs font-mono font-bold text-slate-700 truncate select-all">
                                                        {clientBackupModal.recipientKey}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const msg = `Olá ${clientBackupModal.client.name}! Segue o arquivo de backup/atualização dos seus empréstimos no Finanças Pro.\n\n🔑 Seu PIN de 4 dígitos para abrir na sua conta é: *${clientBackupModal.pin}*\n\nPara sincronizar, acesse o app, clique em "Importar", selecione o arquivo que enviei e digite o PIN! O extrato ficará disponível na sua aba "Fornecedores" em modo somente leitura.`;
                                                    navigator.clipboard.writeText(msg);
                                                    setClientBackupModal(prev => ({ ...prev, copiedMessage: true }));
                                                    showToast('📋 Mensagem para o WhatsApp copiada!');
                                                    setTimeout(() => setClientBackupModal(prev => ({ ...prev, copiedMessage: false })), 2500);
                                                }}
                                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5"
                                            >
                                                <span>💬</span>
                                                <span>{clientBackupModal.copiedMessage ? '✓ Mensagem Copiada!' : 'Copiar Mensagem p/ WhatsApp'}</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setClientBackupModal(null)}
                                                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                                            >
                                                Concluir e Fechar
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* MODAL 2: AVISO DE CHAVE PÚBLICA INCOMPATÍVEL */}
                    {clientImportMismatch && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-scale-in space-y-4 text-center">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center text-2xl mx-auto">
                                    ⛔
                                </div>

                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">Backup Incompatível</h3>
                                    <p className="text-xs text-slate-500">Este arquivo pertence a outro destinatário</p>
                                </div>

                                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-left space-y-2 text-xs text-red-900 leading-relaxed">
                                    <p>
                                        Este backup foi criptografado com exclusividade para a <strong>Chave Pública:</strong>
                                    </p>
                                    <p className="p-2 bg-white rounded-lg font-mono font-bold text-red-800 text-[11px] break-all border border-red-200 select-all">
                                        {clientImportMismatch.expectedKey}
                                    </p>
                                    <p className="pt-1">
                                        A Chave Pública da sua conta logada atual é:
                                    </p>
                                    <p className="p-2 bg-white rounded-lg font-mono font-bold text-slate-800 text-[11px] break-all border border-red-200 select-all">
                                        {clientImportMismatch.myKey}
                                    </p>
                                    <p className="text-[10px] text-red-700 pt-1">
                                        Por proteção criptográfica e sigilo financeiro, apenas a conta vinculada à chave pública de destino pode descriptografar este arquivo.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setClientImportMismatch(null)}
                                    className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs shadow-md transition-colors"
                                >
                                    Entendido
                                </button>
                            </div>
                        </div>
                    )}

                    {/* MODAL 3: IMPORTAÇÃO DE PACOTE DE FORNECEDOR COM PIN + SENHA DE LOGIN */}
                    {clientImportPending && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-scale-in space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold">
                                        🏢
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-base">Backup de Fornecedor</h3>
                                        <p className="text-xs text-slate-500">{clientImportPending.parsedFile.senderName || 'Fornecedor / Credor'}</p>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5">
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Destino no App:</span>
                                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                                            🏢 Aba Fornecedores (Somente Leitura)
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600">
                                        Fornecedor: <strong>{clientImportPending.parsedFile.senderName || 'Fornecedor / Credor'}</strong>
                                    </p>
                                    <p className="text-[11px] text-slate-600">
                                        Contratos inclusos: <strong>{clientImportPending.parsedFile.totalLoans || 0}</strong>
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-mono truncate">
                                        Chave: {clientImportPending.parsedFile.senderPublicKey}
                                    </p>
                                </div>

                                <form onSubmit={handleDecryptAndImportClientData} className="space-y-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                                            1. PIN de 4 Dígitos (enviado pelo fornecedor)
                                        </label>
                                        <input
                                            type="text"
                                            maxLength="4"
                                            pattern="[0-9]{4}"
                                            value={clientImportPending.pinInput}
                                            onChange={(e) => setClientImportPending({ ...clientImportPending, pinInput: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                            placeholder="0000"
                                            required
                                            autoFocus
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-center text-lg font-mono font-black text-slate-900 tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                                            2. Sua Senha Mestra de Login
                                        </label>
                                        <input
                                            type="password"
                                            value={clientImportPending.loginPasswordInput}
                                            onChange={(e) => setClientImportPending({ ...clientImportPending, loginPasswordInput: e.target.value })}
                                            placeholder="Sua senha de login nesta aplicação"
                                            required
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            Necessária para autorizar a sincronização com segurança no seu cofre.
                                        </p>
                                    </div>

                                    {clientImportPending.error && (
                                        <p className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                                            {clientImportPending.error}
                                        </p>
                                    )}

                                    <div className="flex gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setClientImportPending(null)}
                                            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={clientImportPending.isSubmitting}
                                            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors disabled:opacity-50"
                                        >
                                            {clientImportPending.isSubmitting ? 'Sincronizando...' : '🔓 Sincronizar'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* MODAL 4: GERENCIAR CONTA E SEGURANÇA */}
                    {showAccountModal && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-scale-in space-y-4 max-h-[90vh] overflow-y-auto hide-scroll">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
                                            🛡️
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-base">Minha Conta & Segurança</h3>
                                            <p className="text-xs text-slate-500">Cofre e chaves criptográficas</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAccountModal(false)}
                                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition-colors"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Bloco 1: Chave Pública da Conta */}
                                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold uppercase text-slate-600">
                                            🌐 Sua Chave Pública
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const pub = LocalAuth.getPublicKey();
                                                if (pub) {
                                                    navigator.clipboard.writeText(pub);
                                                    setCopiedPublicKey(true);
                                                    showToast('📋 Chave pública copiada!');
                                                    setTimeout(() => setCopiedPublicKey(false), 2500);
                                                }
                                            }}
                                            className="text-xs bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-slate-100 font-bold"
                                        >
                                            {copiedPublicKey ? '✓ Copiada' : 'Copiar'}
                                        </button>
                                    </div>
                                    <p className="font-mono font-bold text-slate-800 text-xs bg-white p-2.5 rounded-xl border border-slate-200 break-all select-all">
                                        {LocalAuth.getPublicKey() || 'Não disponível'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 leading-tight">
                                        Compartilhe esta chave com seus fornecedores para que eles enviem pacotes de contratos criptografados para você.
                                    </p>
                                </div>

                                {/* Bloco 2: Alterar Senha Mestra */}
                                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                    <h4 className="text-[11px] font-bold uppercase text-slate-700">
                                        🔒 Alterar Senha Mestra
                                    </h4>
                                    <form onSubmit={handleChangePasswordSubmit} className="space-y-2.5">
                                        <input
                                            type="password"
                                            value={currentPassInput}
                                            onChange={(e) => setCurrentPassInput(e.target.value)}
                                            placeholder="Senha Mestra Atual"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="password"
                                            value={newPassInput}
                                            onChange={(e) => setNewPassInput(e.target.value)}
                                            placeholder="Nova Senha (mínimo 4 caracteres)"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="password"
                                            value={confirmNewPassInput}
                                            onChange={(e) => setConfirmNewPassInput(e.target.value)}
                                            placeholder="Confirmar Nova Senha"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />

                                        {changePassError && (
                                            <p className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                                                {changePassError}
                                            </p>
                                        )}
                                        {changePassSuccess && (
                                            <p className="text-xs text-emerald-700 font-medium bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                                                {changePassSuccess}
                                            </p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isChangingPass}
                                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
                                        >
                                            {isChangingPass ? 'Atualizando...' : 'Atualizar Senha'}
                                        </button>
                                    </form>
                                </div>

                                {/* Bloco 3: Zona de Perigo (Excluir Conta) */}
                                <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-2xl space-y-2">
                                    <div className="flex items-center gap-1.5 text-red-700 font-bold text-xs uppercase">
                                        <span>⚠️</span>
                                        <span>Zona de Perigo</span>
                                    </div>
                                    <p className="text-[11px] text-red-800 leading-relaxed">
                                        Exclui permanentemente a senha mestra, a chave pública e todos os dados financeiros locais (clientes, empréstimos, fornecedores) deste navegador.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowDeleteAccountModal(true);
                                            setDeleteConfirmText('');
                                        }}
                                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                                    >
                                        🗑️ Excluir Minha Conta deste Dispositivo
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODAL 5: CONFIRMAÇÃO DE EXCLUSÃO DE CONTA */}
                    {showDeleteAccountModal && (
                        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-red-100 animate-scale-in space-y-4 text-center">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center text-2xl mx-auto">
                                    🗑️
                                </div>

                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">Excluir Minha Conta?</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Esta ação apagará todos os dados locais</p>
                                </div>

                                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-left text-xs text-red-900 space-y-2 leading-relaxed">
                                    <p className="font-bold">⚠️ Tem certeza absoluta?</p>
                                    <p>
                                        Seus contratos, clientes, fornecedores e chave pública serão apagados da memória deste navegador.
                                    </p>
                                    <p className="text-[10px] text-red-700 font-semibold">
                                        💡 Dica: Exporte um backup (.json) antes de prosseguir se desejar manter uma cópia de segurança.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 text-left">
                                        Digite <span className="text-red-600 font-black">EXCLUIR</span> para confirmar:
                                    </label>
                                    <input
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                                        placeholder="EXCLUIR"
                                        autoFocus
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-center font-bold tracking-widest text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                                    />
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowDeleteAccountModal(false);
                                            setDeleteConfirmText('');
                                        }}
                                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteAccountConfirmed}
                                        disabled={deleteConfirmText.trim().toUpperCase() !== 'EXCLUIR'}
                                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl font-bold text-xs shadow-md transition-colors disabled:opacity-40"
                                    >
                                        Excluir Conta
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {toastMessage && (
                        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-5 py-3 rounded-full shadow-2xl z-50 font-medium text-sm toast-anim whitespace-nowrap">
                            {toastMessage}
                        </div>
                    )}
                </div>
            );
        }
