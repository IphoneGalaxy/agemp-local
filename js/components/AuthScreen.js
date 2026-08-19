// --- COMPONENTE DE TELA DE AUTENTICAÇÃO E BLOQUEIO LOCAL ---
(function (root) {
    'use strict';

    const { useState, useEffect } = React;

    const AuthScreen = ({ onAuthenticated, showToast }) => {
        const [mode, setMode] = useState(() => (LocalAuth.hasMasterPassword() ? 'login' : 'setup'));
        const [setupTab, setSetupTab] = useState('new'); // 'new' | 'existing_key' | 'backup'
        const [password, setPassword] = useState('');
        const [confirmPassword, setConfirmPassword] = useState('');
        const [showPassword, setShowPassword] = useState(false);
        const [recoveryKey, setRecoveryKey] = useState('');
        const [generatedKey, setGeneratedKey] = useState('');
        const [keyCopied, setKeyCopied] = useState(false);
        const [confirmedKeySaved, setConfirmedKeySaved] = useState(false);
        const [isLoading, setIsLoading] = useState(false);
        const [errorMessage, setErrorMessage] = useState('');
        const [newGeneratedKeyAfterReset, setNewGeneratedKeyAfterReset] = useState('');
        
        // Estado para restauração direta de backup
        const [backupFileData, setBackupFileData] = useState(null);
        const [backupFileName, setBackupFileName] = useState('');
        const [backupPassword, setBackupPassword] = useState('');
        const [showBackupPassword, setShowBackupPassword] = useState(false);

        const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
        const [deleteConfirmationWord, setDeleteConfirmationWord] = useState('');

        const handleDeleteAccountFromAuth = () => {
            if (deleteConfirmationWord.trim().toUpperCase() !== 'EXCLUIR') {
                setErrorMessage('Digite a palavra EXCLUIR para confirmar a exclusão da conta.');
                return;
            }
            LocalAuth.deleteAccount();
            setShowDeleteConfirm(false);
            setDeleteConfirmationWord('');
            setMode('setup');
            setSetupTab('new');
            setGeneratedKey(LocalAuth.generateRecoveryKey());
            setPassword('');
            setConfirmPassword('');
            setErrorMessage('');
            if (showToast) showToast('🗑️ Conta e dados excluídos com sucesso deste navegador.');
        };

        useEffect(() => {
            if (mode === 'setup' && !generatedKey) {
                setGeneratedKey(LocalAuth.generateRecoveryKey());
            }
        }, [mode]);

        const handleCopyKey = (keyToCopy) => {
            navigator.clipboard.writeText(keyToCopy).then(() => {
                setKeyCopied(true);
                if (showToast) showToast('📋 Chave copiada para a área de transferência!');
                setTimeout(() => setKeyCopied(false), 3000);
            }).catch(() => {
                if (showToast) showToast('Selecione e copie a chave manualmente.');
            });
        };

        const handleSetupNew = async (e) => {
            e.preventDefault();
            setErrorMessage('');
            if (!password || password.length < 4) {
                setErrorMessage('A senha deve ter no mínimo 4 caracteres.');
                return;
            }
            if (password !== confirmPassword) {
                setErrorMessage('As senhas digitadas não coincidem.');
                return;
            }
            if (!confirmedKeySaved) {
                setErrorMessage('Por favor, confirme que você salvou a chave de recuperação.');
                return;
            }

            setIsLoading(true);
            try {
                await LocalAuth.setupMasterPassword(password, generatedKey);
                if (showToast) showToast('🔒 Senha mestra e conta criadas com sucesso!');
                onAuthenticated();
            } catch (err) {
                setErrorMessage(err.message || 'Erro ao cadastrar senha.');
            } finally {
                setIsLoading(false);
            }
        };

        const handleSetupExistingKey = async (e) => {
            e.preventDefault();
            setErrorMessage('');
            const cleanKey = (recoveryKey || '').trim().toUpperCase();
            if (!cleanKey || cleanKey.replace(/[^A-Z0-9]/g, '').length !== 16) {
                setErrorMessage('Digite a sua Chave de Recuperação completa (16 caracteres).');
                return;
            }
            if (!password || password.length < 4) {
                setErrorMessage('A senha deve ter no mínimo 4 caracteres.');
                return;
            }
            if (password !== confirmPassword) {
                setErrorMessage('As senhas digitadas não coincidem.');
                return;
            }

            setIsLoading(true);
            try {
                await LocalAuth.setupMasterPassword(password, cleanKey);
                if (showToast) showToast('🔑 Conta vinculada com sucesso à sua Chave de Recuperação!');
                onAuthenticated();
            } catch (err) {
                setErrorMessage(err.message || 'Erro ao vincular conta.');
            } finally {
                setIsLoading(false);
            }
        };

        const handleBackupFileSelect = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            setErrorMessage('');
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    setBackupFileData(parsed);
                    setBackupFileName(file.name);
                } catch (err) {
                    setErrorMessage('Arquivo inválido. Certifique-se de selecionar um arquivo .json de backup.');
                }
            };
            reader.readAsText(file);
        };

        const handleRestoreBackupSubmit = async (e) => {
            e.preventDefault();
            setErrorMessage('');
            if (!backupFileData) {
                setErrorMessage('Selecione um arquivo de backup (.json).');
                return;
            }
            if (!backupPassword.trim()) {
                setErrorMessage('Digite a Senha Mestra ou a Chave de Recuperação da conta.');
                return;
            }

            setIsLoading(true);
            try {
                const decrypted = await LocalAuth.restoreAccountFromBackup(backupFileData, backupPassword.trim());
                
                // Grava os dados de clientes, empréstimos e fornecedores no storage
                if (decrypted && decrypted.data) {
                    const payloadStr = JSON.stringify(decrypted.data);
                    if (typeof SecureStorage !== 'undefined') {
                        SecureStorage.setItem('loanManagerData', payloadStr);
                    } else {
                        localStorage.setItem('loanManagerData', payloadStr);
                    }
                }
                if (showToast) showToast('🎉 Backup e conta restaurados com sucesso!');
                onAuthenticated();
            } catch (err) {
                setErrorMessage('Senha ou chave de recuperação incorreta para este backup.');
            } finally {
                setIsLoading(false);
            }
        };

        const handleLogin = async (e) => {
            e.preventDefault();
            setErrorMessage('');
            if (!password) {
                setErrorMessage('Digite sua senha para desbloquear.');
                return;
            }

            setIsLoading(true);
            try {
                const isValid = await LocalAuth.verifyMasterPassword(password);
                if (isValid) {
                    if (showToast) showToast('🔓 Acesso liberado!');
                    onAuthenticated();
                } else {
                    setErrorMessage('Senha incorreta. Tente novamente.');
                }
            } catch (err) {
                setErrorMessage('Erro ao validar senha.');
            } finally {
                setIsLoading(false);
            }
        };

        const handleRecovery = async (e) => {
            e.preventDefault();
            setErrorMessage('');
            if (!recoveryKey.trim()) {
                setErrorMessage('Digite a sua Chave de Recuperação.');
                return;
            }
            if (!password || password.length < 4) {
                setErrorMessage('A nova senha deve ter no mínimo 4 caracteres.');
                return;
            }
            if (password !== confirmPassword) {
                setErrorMessage('As senhas não coincidem.');
                return;
            }

            setIsLoading(true);
            try {
                const result = await LocalAuth.resetPasswordWithRecoveryKey(recoveryKey, password);
                setNewGeneratedKeyAfterReset(result.newRecoveryKey);
                setMode('recovery_success');
            } catch (err) {
                setErrorMessage(err.message || 'Chave de recuperação inválida.');
            } finally {
                setIsLoading(false);
            }
        };

        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 relative overflow-hidden">
                    {/* Header com Ícone */}
                    <div className="text-center mb-5">
                        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-2 text-2xl shadow-inner">
                            {mode === 'setup' ? (setupTab === 'backup' ? '📥' : setupTab === 'existing_key' ? '🔑' : '🛡️') : mode === 'recovery' ? '🔑' : '🔒'}
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                            Finanças <span className="text-blue-600">Pro</span>
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {mode === 'setup' && (setupTab === 'backup' ? 'Restaurar Conta a partir de Backup' : setupTab === 'existing_key' ? 'Entrar com Chave de Recuperação' : 'Configuração de Segurança Inicial')}
                            {mode === 'login' && 'Cofre Local Bloqueado'}
                            {mode === 'recovery' && 'Recuperação de Acesso'}
                            {mode === 'recovery_success' && 'Acesso Recuperado com Sucesso'}
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                            <span>⚠️</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* MODO 1: LOGIN / DESBLOQUEIO */}
                    {mode === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Senha Mestra
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Digite sua senha de acesso"
                                        autoFocus
                                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm p-1"
                                    >
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isLoading ? 'Verificando...' : '🔓 Desbloquear App'}
                            </button>

                            <div className="pt-2 flex items-center justify-between text-xs font-semibold">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('recovery');
                                        setErrorMessage('');
                                        setPassword('');
                                        setConfirmPassword('');
                                    }}
                                    className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
                                >
                                    Esqueci minha senha
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('setup');
                                        setSetupTab('backup');
                                        setErrorMessage('');
                                    }}
                                    className="text-slate-500 hover:text-slate-700"
                                >
                                    📥 Restaurar outro backup
                                </button>
                            </div>

                            <div className="pt-3 border-t border-slate-100 text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteConfirm(true);
                                        setDeleteConfirmationWord('');
                                        setErrorMessage('');
                                    }}
                                    className="text-[11px] text-red-500 hover:text-red-700 font-semibold transition-colors"
                                >
                                    🗑️ Excluir conta deste navegador
                                </button>
                            </div>
                        </form>
                    )}

                    {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CONTA (TELA DE LOGIN) */}
                    {showDeleteConfirm && (
                        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-red-100 animate-scale-in space-y-4 text-center">
                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center text-2xl mx-auto">
                                    🗑️
                                </div>

                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">Excluir Conta Local?</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Esta ação é irreversível neste dispositivo</p>
                                </div>

                                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-left text-xs text-red-900 space-y-2 leading-relaxed">
                                    <p>
                                        Ao excluir sua conta:
                                    </p>
                                    <ul className="list-disc pl-4 space-y-1 text-[11px]">
                                        <li>A senha mestra e chaves locais serão apagadas.</li>
                                        <li>Todos os clientes e dados salvos neste navegador serão removidos.</li>
                                    </ul>
                                    <p className="text-[10px] text-red-700 font-semibold pt-1">
                                        💡 Se você tiver um arquivo de backup guardado, poderá restaurá-lo depois com sua chave de recuperação.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1.5 text-left">
                                        Digite <span className="text-red-600 font-black">EXCLUIR</span> para confirmar:
                                    </label>
                                    <input
                                        type="text"
                                        value={deleteConfirmationWord}
                                        onChange={(e) => setDeleteConfirmationWord(e.target.value.toUpperCase())}
                                        placeholder="EXCLUIR"
                                        autoFocus
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-center font-bold tracking-widest text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                                    />
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowDeleteConfirm(false);
                                            setDeleteConfirmationWord('');
                                        }}
                                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteAccountFromAuth}
                                        disabled={deleteConfirmationWord.trim().toUpperCase() !== 'EXCLUIR'}
                                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl font-bold text-xs shadow-md transition-colors disabled:opacity-40"
                                    >
                                        Excluir Conta
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODO 2: SETUP INICIAL / ENTRADA COM CHAVE / RESTAURAR BACKUP */}
                    {mode === 'setup' && (
                        <div className="space-y-4">
                            {/* Segmented Control / Tabs */}
                            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-2xl text-[11px] font-bold text-slate-600">
                                <button
                                    type="button"
                                    onClick={() => { setSetupTab('new'); setErrorMessage(''); }}
                                    className={`py-2 rounded-xl transition-all ${setupTab === 'new' ? 'bg-white text-blue-600 shadow-sm font-black' : 'hover:text-slate-900'}`}
                                >
                                    ✨ Nova Conta
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSetupTab('existing_key'); setErrorMessage(''); }}
                                    className={`py-2 rounded-xl transition-all ${setupTab === 'existing_key' ? 'bg-white text-blue-600 shadow-sm font-black' : 'hover:text-slate-900'}`}
                                >
                                    🔑 Tenho Chave
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSetupTab('backup'); setErrorMessage(''); }}
                                    className={`py-2 rounded-xl transition-all ${setupTab === 'backup' ? 'bg-white text-blue-600 shadow-sm font-black' : 'hover:text-slate-900'}`}
                                >
                                    📥 Backup (.json)
                                </button>
                            </div>

                            {/* ABA 1: NOVA CONTA (GERA CHAVE AUTOMÁTICA) */}
                            {setupTab === 'new' && (
                                <form onSubmit={handleSetupNew} className="space-y-3.5">
                                    <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
                                        💡 Defina uma <strong>Senha Mestra</strong> para proteger o acesso aos seus dados financeiros salvos neste navegador.
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Definir Senha Mestra
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="No mínimo 4 caracteres"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Confirmar Senha
                                        </label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Repita a senha digitada"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div className="pt-2 border-t border-slate-100">
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            🔑 Sua Chave de Recuperação de Emergência
                                        </label>
                                        <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-xl font-mono text-center font-bold text-slate-800 tracking-wider text-sm flex items-center justify-between">
                                            <span className="select-all">{generatedKey}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleCopyKey(generatedKey)}
                                                className="text-xs bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-slate-50 active:bg-slate-200 font-sans font-bold"
                                            >
                                                {keyCopied ? '✓ Copiado' : 'Copiar'}
                                            </button>
                                        </div>
                                    </div>

                                    <label className="flex items-start gap-2 pt-1 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={confirmedKeySaved}
                                            onChange={(e) => setConfirmedKeySaved(e.target.checked)}
                                            className="mt-0.5 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-slate-600 select-none">
                                            Confirmo que copiei e salvei minha Chave em local seguro.
                                        </span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
                                    >
                                        {isLoading ? 'Configurando...' : '✨ Criar Conta e Entrar'}
                                    </button>
                                </form>
                            )}

                            {/* ABA 2: JÁ TENHO UMA CHAVE DE RECUPERAÇÃO */}
                            {setupTab === 'existing_key' && (
                                <form onSubmit={handleSetupExistingKey} className="space-y-3.5">
                                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                                        🔑 Cole a sua <strong>Chave de Recuperação</strong> guardada. A sua conta e a sua <strong>mesma Chave Pública original</strong> serão ativadas neste navegador.
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Chave de Recuperação Guardada
                                        </label>
                                        <input
                                            type="text"
                                            value={recoveryKey}
                                            onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                                            placeholder="Ex: VZLD-GBKP-76Q4-BZUF"
                                            autoFocus
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Definir Senha Mestra de Acesso
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="No mínimo 4 caracteres"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Confirmar Senha
                                        </label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Repita a senha digitada"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-all disabled:opacity-50 mt-2"
                                    >
                                        {isLoading ? 'Vinculando...' : '🔑 Entrar com Minha Conta'}
                                    </button>
                                </form>
                            )}

                            {/* ABA 3: RESTAURAR ARQUIVO DE BACKUP (.JSON) */}
                            {setupTab === 'backup' && (
                                <form onSubmit={handleRestoreBackupSubmit} className="space-y-3.5">
                                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">
                                        📥 Selecione o seu arquivo de backup exportado (<code>.json</code>) para restaurar sua conta, chave pública e todos os seus clientes/empréstimos.
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Arquivo de Backup (.json)
                                        </label>
                                        <label className="flex flex-col items-center justify-center p-3.5 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer transition-all text-center">
                                            <span className="text-xl mb-1">📁</span>
                                            <span className="text-xs font-bold text-slate-700 truncate max-w-xs">
                                                {backupFileName ? backupFileName : 'Clique para selecionar o arquivo .json'}
                                            </span>
                                            <span className="text-[10px] text-slate-400 mt-0.5">FINANCAS_PRO_*.json</span>
                                            <input
                                                type="file"
                                                accept=".json"
                                                onChange={handleBackupFileSelect}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                            Senha Mestra ou Chave de Recuperação
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showBackupPassword ? 'text' : 'password'}
                                                value={backupPassword}
                                                onChange={(e) => setBackupPassword(e.target.value)}
                                                placeholder="Digite a senha ou código de 16 dígitos"
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowBackupPassword(!showBackupPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
                                            >
                                                {showBackupPassword ? '🙈' : '👁️'}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading || !backupFileData}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-3 rounded-xl text-sm shadow-md transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? 'Descriptografando e Restaurando...' : '📥 Restaurar Conta e Dados'}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* MODO 3: ESQUECI MINHA SENHA / RECUPERAÇÃO */}
                    {mode === 'recovery' && (
                        <form onSubmit={handleRecovery} className="space-y-4">
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                                Digite a sua <strong>Chave de Recuperação</strong> de 16 caracteres para cadastrar uma nova senha mestra.
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Chave de Recuperação
                                </label>
                                <input
                                    type="text"
                                    value={recoveryKey}
                                    onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                                    placeholder="Ex: VZLD-GBKP-76Q4-BZUF"
                                    autoFocus
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Nova Senha
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="No mínimo 4 caracteres"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Confirmar Nova Senha
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repita a nova senha"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all disabled:opacity-50"
                            >
                                {isLoading ? 'Redefinindo...' : '🔑 Redefinir Senha e Entrar'}
                            </button>

                            <div className="pt-2 text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('login');
                                        setErrorMessage('');
                                        setPassword('');
                                        setConfirmPassword('');
                                    }}
                                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold"
                                >
                                    Voltar para o Login
                                </button>
                            </div>
                        </form>
                    )}

                    {/* MODO 4: SUCESSO DA RECUPERAÇÃO COM NOVA CHAVE */}
                    {mode === 'recovery_success' && (
                        <div className="space-y-4 text-center">
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs text-left leading-relaxed">
                                <p className="font-bold text-sm text-emerald-950 mb-1">🎉 Senha redefinida com sucesso!</p>
                                <p className="mb-2">Sua senha foi atualizada. Uma <strong>Nova Chave de Recuperação</strong> foi gerada para você:</p>
                                <div className="p-3 bg-white border border-emerald-300 rounded-xl font-mono text-center font-bold text-slate-900 tracking-wider text-sm flex items-center justify-between mt-2">
                                    <span className="select-all">{newGeneratedKeyAfterReset}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyKey(newGeneratedKeyAfterReset)}
                                        className="text-xs bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg text-emerald-800 hover:bg-emerald-200 font-sans font-bold"
                                    >
                                        {keyCopied ? '✓ Copiado' : 'Copiar'}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    if (showToast) showToast('🔓 Acesso liberado!');
                                    onAuthenticated();
                                }}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all"
                            >
                                Continuar para o Aplicativo
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    root.AuthScreen = AuthScreen;
})(typeof globalThis !== 'undefined' ? globalThis : this);

