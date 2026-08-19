// --- COMPONENTE DE TELA DE AUTENTICAÇÃO E BLOQUEIO LOCAL ---
(function (root) {
    'use strict';

    const { useState, useEffect } = React;

    const AuthScreen = ({ onAuthenticated, showToast }) => {
        const [mode, setMode] = useState(() => (LocalAuth.hasMasterPassword() ? 'login' : 'setup'));
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

        const handleSetup = async (e) => {
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
                if (showToast) showToast('🔒 Senha mestra cadastrada com sucesso!');
                onAuthenticated();
            } catch (err) {
                setErrorMessage(err.message || 'Erro ao cadastrar senha.');
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
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl shadow-inner">
                            {mode === 'setup' ? '🛡️' : mode === 'recovery' ? '🔑' : '🔒'}
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                            Finanças <span className="text-blue-600">Pro</span>
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            {mode === 'setup' && 'Configuração de Segurança Inicial'}
                            {mode === 'login' && 'Cofre Local Bloqueado'}
                            {mode === 'recovery' && 'Recuperação de Acesso'}
                            {mode === 'recovery_success' && 'Acesso Recuperado com Sucesso'}
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
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

                            <div className="pt-2 text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('recovery');
                                        setErrorMessage('');
                                        setPassword('');
                                        setConfirmPassword('');
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2"
                                >
                                    Esqueci minha senha
                                </button>
                            </div>
                        </form>
                    )}

                    {/* MODO 2: SETUP INICIAL DE SENHA */}
                    {mode === 'setup' && (
                        <form onSubmit={handleSetup} className="space-y-4">
                            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 leading-relaxed">
                                💡 Crie uma <strong>Senha Mestra</strong> para proteger o acesso aos seus dados financeiros salvos neste navegador.
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Definir Senha Mestra
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
                                    Confirmar Senha
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repita a senha digitada"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* Bloco da Chave de Recuperação */}
                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    🔑 Chave de Recuperação de Emergência
                                </label>
                                <p className="text-[11px] text-slate-500 mb-2">
                                    Se você esquecer sua senha, esta chave é a <strong>única forma</strong> de recuperar seu acesso:
                                </p>
                                <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl font-mono text-center font-bold text-slate-800 tracking-wider text-sm flex items-center justify-between">
                                    <span className="select-all">{generatedKey}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyKey(generatedKey)}
                                        className="text-xs bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-slate-50 active:bg-slate-200 font-sans font-bold"
                                    >
                                        {keyCopied ? '✓ Copiado' : 'Copiar'}
                                    </button>
                                </div>

                                <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] flex items-center gap-2">
                                    <span>🌐</span>
                                    <span>Sua conta terá uma <strong>Chave Pública</strong> exclusiva que poderá ser compartilhada com segurança.</span>
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
                                    Confirmo que copiei e salvei minha Chave de Recuperação em local seguro.
                                </span>
                            </label>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-xl text-sm shadow-md transition-all disabled:opacity-50 mt-2"
                            >
                                {isLoading ? 'Configurando...' : '✨ Criar Senha e Entrar'}
                            </button>
                        </form>
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
                                    placeholder="Ex: A4F9-8B2E-99C1-77DA"
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
