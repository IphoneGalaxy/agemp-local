            // --- COMPONENTE LISTA DE CLIENTES ---
            const ClientsList = ({ state, actions, utils }) => {
                const { globalStats, clients } = state;
                const { setClients, setSelectedClient, openClientBackupModal } = actions;
                const { showToast } = utils;
                const [newClientName, setNewClientName] = useState('');
                const [newClientPublicKey, setNewClientPublicKey] = useState('');
                const [showAddFormDetails, setShowAddFormDetails] = useState(false);
                const [editingPublicKeyClient, setEditingPublicKeyClient] = useState(null);
                const [publicKeyInputValue, setPublicKeyInputValue] = useState('');

                const handleAddClient = (e) => {
                    e.preventDefault();
                    if (!newClientName.trim()) return;
                    const cleanKey = newClientPublicKey.trim().toUpperCase();
                    setClients([{ 
                        id: generateId(), 
                        name: newClientName.trim(), 
                        publicKey: cleanKey || undefined,
                        loans: [] 
                    }, ...clients]);
                    setNewClientName('');
                    setNewClientPublicKey('');
                    setShowAddFormDetails(false);
                    showToast('👤 Cliente criado!');
                };

                const handleSavePublicKey = (client) => {
                    const cleanKey = publicKeyInputValue.trim().toUpperCase();
                    if (cleanKey && !cleanKey.startsWith('PUB-')) {
                        showToast('⚠️ A chave pública deve começar com "PUB-".');
                        return;
                    }
                    const updated = clients.map(c => c.id === client.id ? { ...c, publicKey: cleanKey || undefined } : c);
                    setClients(updated);
                    setEditingPublicKeyClient(null);
                    showToast(cleanKey ? '🪪 Chave pública vinculada ao cliente!' : '🗑️ Chave pública removida.');
                };

                return (
                    <div className="p-4 space-y-6 pb-20">
                        {/* Formulário de Adicionar Cliente */}
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                            <form onSubmit={handleAddClient} className="space-y-3">
                                <div className="flex gap-2">
                                    <input 
                                        data-testid="clientes-input-nome" 
                                        type="text" 
                                        required 
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                        placeholder="Nome do novo cliente" 
                                        value={newClientName} 
                                        onChange={(e) => setNewClientName(e.target.value)} 
                                    />
                                    <button 
                                        data-testid="clientes-btn-criar" 
                                        type="submit" 
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-sm transition-all"
                                    >
                                        Criar
                                    </button>
                                </div>
                                <div className="flex items-center justify-between pt-1">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowAddFormDetails(!showAddFormDetails)}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                                    >
                                        <span>{showAddFormDetails ? '▲ Ocultar Chave Pública' : '▼ Vincular Chave Pública (Opcional)'}</span>
                                    </button>
                                </div>
                                {showAddFormDetails && (
                                    <div className="pt-2 animate-fade-in">
                                        <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                                            Chave Pública do Cliente (ex: PUB-XXXX-XXXX-XXXX-XXXX)
                                        </label>
                                        <input 
                                            type="text" 
                                            value={newClientPublicKey} 
                                            onChange={(e) => setNewClientPublicKey(e.target.value.toUpperCase())}
                                            placeholder="PUB-..." 
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-gray-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* Lista de Clientes */}
                        <div className="space-y-3">
                            {globalStats.processedClients.map(client => (
                                <div 
                                    key={client.id} 
                                    onClick={() => setSelectedClient(client)} 
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:border-blue-200 active:scale-[0.99] transition-all"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-bold text-gray-800 text-base sm:text-lg">{client.name}</p>
                                            {client.publicKey ? (
                                                <span 
                                                    title={`Chave Pública: ${client.publicKey}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingPublicKeyClient(client);
                                                        setPublicKeyInputValue(client.publicKey || '');
                                                    }}
                                                    className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors cursor-pointer flex items-center gap-1"
                                                >
                                                    <span>🪪</span>
                                                    <span>{client.publicKey.slice(0, 8)}...</span>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingPublicKeyClient(client);
                                                        setPublicKeyInputValue('');
                                                    }}
                                                    className="text-[10px] font-semibold text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 px-2 py-0.5 rounded-md transition-colors"
                                                >
                                                    + Chave Pública
                                                </button>
                                            )}
                                        </div>
                                        
                                        {client.currentDebt > 0 ? (
                                            <div className="mt-1 flex items-center gap-2">
                                                {client.dashPending <= 0 ? (
                                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                                        OK ({client.dashMonthStr}) ✅
                                                    </span>
                                                ) : (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${client.isNextMonth ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                        Falta {client.dashMonthStr}: {formatMoney(client.dashPending)}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 mt-0.5">Sem dívidas ativas</p>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                                        <div className="text-left sm:text-right">
                                            <p className="text-[10px] text-gray-400 font-semibold uppercase">Dívida Total</p>
                                            <p className={`font-black text-sm sm:text-base ${client.currentDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                {formatMoney(client.currentDebt)}
                                            </p>
                                        </div>

                                        {/* Botão de Backup Exclusivo do Cliente */}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (openClientBackupModal) {
                                                    openClientBackupModal(client);
                                                }
                                            }}
                                            title="Gerar e compartilhar backup criptografado dos empréstimos deste cliente"
                                            className="px-3 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-bold border border-slate-200 hover:border-blue-200 transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <span>📦</span>
                                            <span>Backup</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {clients.length === 0 && (
                                <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                                    <p className="text-3xl mb-2">👥</p>
                                    <p className="text-gray-500 font-medium text-sm">Nenhum cliente cadastrado.</p>
                                </div>
                            )}
                        </div>

                        {/* Modal para Editar/Vincular Chave Pública do Cliente */}
                        {editingPublicKeyClient && (
                            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 animate-scale-in">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-2xl">🪪</span>
                                        <h3 className="font-bold text-slate-800 text-lg">Chave Pública do Cliente</h3>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                        Vincule a Chave Pública de <strong>{editingPublicKeyClient.name}</strong> para que ele possa descriptografar e abrir os backups de empréstimo enviados por você.
                                    </p>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                                                Chave Pública (PUB-...)
                                            </label>
                                            <input 
                                                type="text" 
                                                value={publicKeyInputValue}
                                                onChange={(e) => setPublicKeyInputValue(e.target.value.toUpperCase())}
                                                placeholder="Cole a chave pública do cliente"
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditingPublicKeyClient(null)}
                                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSavePublicKey(editingPublicKeyClient)}
                                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition-colors"
                                            >
                                                Salvar Vínculo
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            };