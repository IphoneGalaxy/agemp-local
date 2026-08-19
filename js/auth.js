// --- MÓDULO DE AUTENTICAÇÃO LOCAL (100% OFFLINE COM CRIPTOGRAFIA FORTE) ---
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.LocalAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'sys_app_auth_vault_v1';
    const SESSION_STORAGE_KEY = 'sys_app_session_active';

    // Utilitário para converter ArrayBuffer em string Hex
    function bufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Utilitário para converter string Hex em Uint8Array
    function hexToBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    // Gera bytes aleatórios usando CSPRNG
    function generateSalt(length = 16) {
        const salt = new Uint8Array(length);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(salt);
        } else {
            throw new Error('Ambiente sem suporte a Web Cryptography CSPRNG.');
        }
        return bufferToHex(salt);
    }

    // Hash criptográfico com PBKDF2 (SHA-256 e 100.000 iterações)
    async function pbkdf2Hash(text, saltHex, iterations = 100000) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(text),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );
        const saltBuffer = hexToBuffer(saltHex);
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );
        return bufferToHex(derivedBits);
    }

    // Normaliza chave de recuperação (maiúsculas, apenas alfanuméricos)
    function normalizeKey(key) {
        return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // Gera uma Chave de Recuperação de 16 caracteres em 4 blocos (ex: A4F9-8B2E-99C1-77DA)
    function generateRecoveryKey() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Caracteres sem ambiguidade (sem 0, O, 1, I)
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        let raw = '';
        for (let i = 0; i < 16; i++) {
            raw += chars[bytes[i] % chars.length];
        }
        return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
    }

    // Lê a configuração de autenticação do armazenamento protegido
    function getStoredAuth() {
        try {
            const raw = (typeof SecureStorage !== 'undefined' ? SecureStorage.getItem(AUTH_STORAGE_KEY) : localStorage.getItem(AUTH_STORAGE_KEY));
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // Grava a configuração de autenticação no armazenamento protegido
    function saveStoredAuth(data) {
        const payload = JSON.stringify(data);
        if (typeof SecureStorage !== 'undefined') {
            SecureStorage.setItem(AUTH_STORAGE_KEY, payload);
        } else {
            localStorage.setItem(AUTH_STORAGE_KEY, payload);
        }
    }

    // Verifica se já existe uma senha mestra configurada
    function hasMasterPassword() {
        const auth = getStoredAuth();
        return Boolean(auth && auth.passwordHash && auth.salt);
    }

    // Gera uma Chave Pública legível e determinística a partir da Chave de Recuperação
    async function derivePublicKeyFromRecoveryKey(recoveryKey) {
        const cleanKey = normalizeKey(recoveryKey);
        if (!cleanKey) return generatePublicKeyFallback();
        const enc = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            enc.encode(`${cleanKey}_FINANCAS_PRO_PUBLIC_KEY_SEED_V1`)
        );
        const hex = bufferToHex(hashBuffer).toUpperCase();
        return `PUB-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
    }

    // Gera um VaultId determinístico a partir da Chave de Recuperação
    async function deriveVaultIdFromRecoveryKey(recoveryKey) {
        const cleanKey = normalizeKey(recoveryKey);
        if (!cleanKey) return generateSalt(16);
        const enc = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            enc.encode(`${cleanKey}_FINANCAS_PRO_VAULT_SEED_V1`)
        );
        return bufferToHex(hashBuffer).slice(0, 32);
    }

    function generatePublicKeyFallback() {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        return `PUB-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
    }

    function generatePublicKey() {
        return generatePublicKeyFallback();
    }

    // Retorna a Chave Pública da conta atual (gerando e salvando caso seja uma conta existente sem chave)
    function getPublicKey() {
        const auth = getStoredAuth();
        if (!auth || !auth.hasPassword) return null;
        if (auth.publicKey) return auth.publicKey;
        // Auto-gera e persiste para contas existentes
        const newPubKey = generatePublicKeyFallback();
        auth.publicKey = newPubKey;
        saveStoredAuth(auth);
        return newPubKey;
    }

    // Configura a Senha Mestra inicial e vincula à Chave de Recuperação
    async function setupMasterPassword(password, recoveryKey, existingPublicKey = null, existingVaultId = null) {
        if (!password || password.length < 4) {
            throw new Error('A senha deve conter no mínimo 4 caracteres.');
        }
        const cleanRecovery = normalizeKey(recoveryKey);
        if (!cleanRecovery || cleanRecovery.length < 16) {
            throw new Error('Chave de recuperação inválida (deve conter 16 caracteres).');
        }

        const salt = generateSalt(16);
        const recoverySalt = generateSalt(16);

        const passwordHash = await pbkdf2Hash(password, salt);
        const recoveryHash = await pbkdf2Hash(cleanRecovery, recoverySalt);
        
        // Chave pública e cofre vinculados deterministicamente e unicamente à Chave de Recuperação
        const publicKey = await derivePublicKeyFromRecoveryKey(cleanRecovery);
        const vaultId = await deriveVaultIdFromRecoveryKey(cleanRecovery);

        const authData = {
            hasPassword: true,
            vaultId: vaultId,
            publicKey: publicKey,
            passwordHash,
            salt,
            recoveryHash,
            recoverySalt,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };

        saveStoredAuth(authData);
        setSessionActive(true);
        return { success: true, publicKey, vaultId };
    }

    // Valida a Senha Mestra digitada
    async function verifyMasterPassword(password) {
        const auth = getStoredAuth();
        if (!auth || !auth.passwordHash || !auth.salt) return false;

        const calculatedHash = await pbkdf2Hash(password, auth.salt);
        const isValid = calculatedHash === auth.passwordHash;

        if (isValid) {
            auth.lastLogin = new Date().toISOString();
            saveStoredAuth(auth);
            setSessionActive(true);
        }
        return isValid;
    }

    // Valida a Chave de Recuperação e redefine a senha
    async function resetPasswordWithRecoveryKey(recoveryKey, newPassword) {
        const auth = getStoredAuth();
        if (!auth || !auth.recoveryHash || !auth.recoverySalt) {
            throw new Error('Nenhuma conta configurada para recuperação.');
        }
        if (!newPassword || newPassword.length < 4) {
            throw new Error('A nova senha deve ter no mínimo 4 caracteres.');
        }

        const cleanKey = normalizeKey(recoveryKey);
        const calculatedRecoveryHash = await pbkdf2Hash(cleanKey, auth.recoverySalt);

        if (calculatedRecoveryHash !== auth.recoveryHash) {
            throw new Error('Chave de recuperação incorreta.');
        }

        // Gera nova chave de recuperação para o novo ciclo
        const newRecoveryKey = generateRecoveryKey();
        const newRecoveryClean = normalizeKey(newRecoveryKey);

        const newSalt = generateSalt(16);
        const newRecoverySalt = generateSalt(16);

        const newPasswordHash = await pbkdf2Hash(newPassword, newSalt);
        const newRecoveryHash = await pbkdf2Hash(newRecoveryClean, newRecoverySalt);

        auth.passwordHash = newPasswordHash;
        auth.salt = newSalt;
        auth.recoveryHash = newRecoveryHash;
        auth.recoverySalt = newRecoverySalt;
        auth.updatedAt = new Date().toISOString();

        saveStoredAuth(auth);
        setSessionActive(true);

        return { success: true, newRecoveryKey };
    }

    // Alterar senha sabendo a senha atual
    async function changePassword(currentPassword, newPassword) {
        const isCurrentValid = await verifyMasterPassword(currentPassword);
        if (!isCurrentValid) {
            throw new Error('A senha atual está incorreta.');
        }
        if (!newPassword || newPassword.length < 4) {
            throw new Error('A nova senha deve ter no mínimo 4 caracteres.');
        }
        const auth = getStoredAuth();
        if (!auth) {
            throw new Error('Nenhuma conta encontrada.');
        }
        const salt = generateSalt(16);
        const newPasswordHash = await pbkdf2Hash(newPassword, salt);
        auth.passwordHash = newPasswordHash;
        auth.salt = salt;
        auth.updatedAt = new Date().toISOString();
        saveStoredAuth(auth);
        return { success: true };
    }

    // --- CRIPTOGRAFIA DE BACKUP (AES-GCM 256-BIT COM DUPLO DESBLOQUEIO: SENHA OU CHAVE DE RECUPERAÇÃO) ---
    async function getAesKeyFromHash(hashHex) {
        const keyBuffer = hexToBuffer(hashHex);
        return await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptBackup(plainDataObject) {
        const auth = getStoredAuth();
        if (!auth || !auth.passwordHash) {
            return plainDataObject;
        }

        // Gera chave AES de dados aleatória de 256 bits
        const dataKeyBytes = new Uint8Array(32);
        crypto.getRandomValues(dataKeyBytes);
        const dataKeyHex = bufferToHex(dataKeyBytes);
        const dataAesKey = await getAesKeyFromHash(dataKeyHex);

        // Criptografa os dados com a dataKey
        const iv = new Uint8Array(12);
        crypto.getRandomValues(iv);
        const enc = new TextEncoder();
        const encoded = enc.encode(JSON.stringify(plainDataObject));

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            dataAesKey,
            encoded
        );

        // Envelopa a dataKey com a Senha Mestra (passwordHash)
        const ivPass = new Uint8Array(12);
        crypto.getRandomValues(ivPass);
        const passAesKey = await getAesKeyFromHash(auth.passwordHash);
        const encDataKeyWithPass = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivPass },
            passAesKey,
            dataKeyBytes
        );

        // Envelopa a dataKey com a Chave de Recuperação (se disponível na conta ativa)
        let recoveryEnvelope = null;
        if (auth.recoveryHash) {
            const ivRec = new Uint8Array(12);
            crypto.getRandomValues(ivRec);
            const recAesKey = await getAesKeyFromHash(auth.recoveryHash);
            const encDataKeyWithRec = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: ivRec },
                recAesKey,
                dataKeyBytes
            );
            recoveryEnvelope = {
                iv: bufferToHex(ivRec),
                key: bufferToHex(encDataKeyWithRec)
            };
        }

        return {
            _format: 'FINANCAS_PRO_ENCRYPTED_VAULT_V1',
            version: 2,
            vaultId: auth.vaultId || auth.salt,
            publicKey: getPublicKey(),
            salt: auth.salt,
            recoverySalt: auth.recoverySalt || null,
            createdAt: new Date().toISOString(),
            iv: bufferToHex(iv),
            payload: bufferToHex(ciphertext),
            envelopePassword: {
                iv: bufferToHex(ivPass),
                key: bufferToHex(encDataKeyWithPass)
            },
            envelopeRecovery: recoveryEnvelope
        };
    }

    async function decryptBackup(backupObj, overridePassword = null) {
        if (!backupObj || typeof backupObj !== 'object') {
            throw new Error('Arquivo de backup inválido.');
        }
        if (backupObj._format !== 'FINANCAS_PRO_ENCRYPTED_VAULT_V1') {
            return { data: backupObj, isLegacy: true, isEncrypted: false };
        }

        const auth = getStoredAuth();
        const targetSalt = backupObj.salt || (auth ? auth.salt : null);
        const targetRecoverySalt = backupObj.recoverySalt || (auth ? auth.recoverySalt : null);

        // Lista de possíveis hashes para tentar descriptografar
        const candidates = [];

        if (overridePassword) {
            const rawInput = String(overridePassword).trim();
            const cleanKey = normalizeKey(rawInput);

            // 1. Tentar como senha mestra direta com targetSalt
            if (targetSalt) {
                const passHash = await pbkdf2Hash(rawInput, targetSalt);
                candidates.push({ hash: passHash, type: 'password' });
            }

            // 2. Se tiver 16 caracteres, tentar como chave de recuperação
            if (cleanKey.length === 16) {
                if (targetRecoverySalt) {
                    const recHash = await pbkdf2Hash(cleanKey, targetRecoverySalt);
                    candidates.push({ hash: recHash, type: 'recovery' });
                }
                if (targetSalt) {
                    const recSaltHash = await pbkdf2Hash(cleanKey, targetSalt);
                    candidates.push({ hash: recSaltHash, type: 'recovery_salt' });
                }
            }
        } else if (auth && auth.passwordHash) {
            candidates.push({ hash: auth.passwordHash, type: 'session_pass' });
            if (auth.recoveryHash) candidates.push({ hash: auth.recoveryHash, type: 'session_rec' });
        }

        if (candidates.length === 0) {
            throw new Error('NEEDS_PASSWORD_AUTH');
        }

        // Tenta descriptografar usando os envelopes V2 ou método direto V1
        for (const cand of candidates) {
            try {
                let dataAesKey = null;

                // Se o backup tiver envelopes V2
                if (backupObj.envelopePassword && cand.type !== 'recovery' && cand.type !== 'recovery_salt') {
                    try {
                        const passAesKey = await getAesKeyFromHash(cand.hash);
                        const ivPass = hexToBuffer(backupObj.envelopePassword.iv);
                        const encKeyBytes = hexToBuffer(backupObj.envelopePassword.key);
                        const decKeyBytes = await crypto.subtle.decrypt(
                            { name: 'AES-GCM', iv: ivPass },
                            passAesKey,
                            encKeyBytes
                        );
                        dataAesKey = await crypto.subtle.importKey(
                            'raw',
                            decKeyBytes,
                            { name: 'AES-GCM' },
                            false,
                            ['decrypt']
                        );
                    } catch (e) {
                        // continua tentando
                    }
                }

                if (!dataAesKey && backupObj.envelopeRecovery && (cand.type === 'recovery' || cand.type === 'recovery_salt')) {
                    try {
                        const recAesKey = await getAesKeyFromHash(cand.hash);
                        const ivRec = hexToBuffer(backupObj.envelopeRecovery.iv);
                        const encKeyBytes = hexToBuffer(backupObj.envelopeRecovery.key);
                        const decKeyBytes = await crypto.subtle.decrypt(
                            { name: 'AES-GCM', iv: ivRec },
                            recAesKey,
                            encKeyBytes
                        );
                        dataAesKey = await crypto.subtle.importKey(
                            'raw',
                            decKeyBytes,
                            { name: 'AES-GCM' },
                            false,
                            ['decrypt']
                        );
                    } catch (e) {
                        // continua tentando
                    }
                }

                // Fallback para V1 (onde o payload era criptografado diretamente com o hash)
                if (!dataAesKey) {
                    dataAesKey = await getAesKeyFromHash(cand.hash);
                }

                const iv = hexToBuffer(backupObj.iv);
                const ciphertext = hexToBuffer(backupObj.payload);
                const decryptedBuffer = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    dataAesKey,
                    ciphertext
                );

                const dec = new TextDecoder();
                const jsonString = dec.decode(decryptedBuffer);
                const parsed = JSON.parse(jsonString);

                return {
                    data: parsed,
                    isLegacy: false,
                    isEncrypted: true,
                    sameVault: Boolean(auth && auth.vaultId && auth.vaultId === backupObj.vaultId),
                    publicKey: backupObj.publicKey || null,
                    vaultId: backupObj.vaultId || null
                };
            } catch (err) {
                // Tenta o próximo candidato
            }
        }

        throw new Error('DECRYPTION_FAILED');
    }

    // Restaura a conta e dados a partir de um backup
    async function restoreAccountFromBackup(backupObj, passwordOrRecoveryKey, newPassword = null) {
        const decrypted = await decryptBackup(backupObj, passwordOrRecoveryKey);
        
        // Se a conta ainda não tem senha configurada neste navegador ou está restaurando:
        const cleanInput = normalizeKey(passwordOrRecoveryKey);
        const finalRecovery = cleanInput.length === 16 ? cleanInput : generateRecoveryKey();
        const finalPassword = newPassword || (cleanInput.length !== 16 ? passwordOrRecoveryKey : '1234');
        
        await setupMasterPassword(
            finalPassword,
            finalRecovery,
            backupObj.publicKey || decrypted.publicKey,
            backupObj.vaultId || decrypted.vaultId
        );

        return decrypted;
    }

    // Gera um PIN numérico aleatório de 4 dígitos usando CSPRNG para compartilhamento
    function generateSharePin() {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const num = 1000 + (array[0] % 9000);
        return String(num);
    }

    // Criptografa o backup exclusivo dos empréstimos de um cliente específico
    async function encryptClientBackup(clientData, recipientPublicKey, sharePin, senderName = 'Meu Fornecedor') {
        if (!clientData || !clientData.name) {
            throw new Error('Dados do cliente inválidos para exportação.');
        }
        const cleanRecipientKey = String(recipientPublicKey || '').trim().toUpperCase();
        if (!cleanRecipientKey || !cleanRecipientKey.startsWith('PUB-')) {
            throw new Error('Chave pública do destinatário inválida. Ela deve começar com "PUB-".');
        }
        const cleanPin = String(sharePin || '').trim();
        if (!/^\d{4}$/.test(cleanPin)) {
            throw new Error('A senha de compartilhamento deve conter exatamente 4 dígitos numéricos.');
        }

        const salt = generateSalt(16);
        const secretCombined = `${cleanPin}_${cleanRecipientKey}`;
        const keyHash = await pbkdf2Hash(secretCombined, salt, 100000);
        const aesKey = await getAesKeyFromHash(keyHash);

        const finalSenderName = String(senderName || 'Fornecedor / Credor').trim();

        const payloadObj = {
            exportedAt: new Date().toISOString(),
            senderPublicKey: getPublicKey() || 'PUB-UNKNOWN',
            senderName: finalSenderName,
            recipientPublicKey: cleanRecipientKey,
            client: {
                id: clientData.id,
                name: clientData.name,
                publicKey: cleanRecipientKey,
                loans: clientData.loans || []
            },
            readOnly: true,
            version: Date.now()
        };

        const enc = new TextEncoder();
        const encoded = enc.encode(JSON.stringify(payloadObj));
        const iv = new Uint8Array(12);
        crypto.getRandomValues(iv);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            aesKey,
            encoded
        );

        return {
            _format: 'FINANCAS_PRO_CLIENT_EXPORT_V1',
            senderPublicKey: getPublicKey() || 'PUB-UNKNOWN',
            senderName: finalSenderName,
            recipientPublicKey: cleanRecipientKey,
            clientName: clientData.name,
            clientId: clientData.id,
            totalLoans: (clientData.loans || []).length,
            salt: salt,
            iv: bufferToHex(iv),
            payload: bufferToHex(ciphertext),
            createdAt: new Date().toISOString()
        };
    }

    // Descriptografa o backup de empréstimos recebido com o PIN de 4 dígitos
    async function decryptClientBackup(backupObj, sharePin) {
        if (!backupObj || backupObj._format !== 'FINANCAS_PRO_CLIENT_EXPORT_V1') {
            throw new Error('Formato de backup de cliente inválido.');
        }
        const cleanPin = String(sharePin || '').trim();
        if (!/^\d{4}$/.test(cleanPin)) {
            throw new Error('Digite a senha/PIN de 4 dígitos numéricos.');
        }

        const secretCombined = `${cleanPin}_${backupObj.recipientPublicKey.toUpperCase().trim()}`;
        const keyHash = await pbkdf2Hash(secretCombined, backupObj.salt, 100000);

        try {
            const aesKey = await getAesKeyFromHash(keyHash);
            const iv = hexToBuffer(backupObj.iv);
            const ciphertext = hexToBuffer(backupObj.payload);

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                aesKey,
                ciphertext
            );

            const dec = new TextDecoder();
            const jsonString = dec.decode(decryptedBuffer);
            const parsed = JSON.parse(jsonString);

            return {
                client: parsed.client,
                senderPublicKey: parsed.senderPublicKey || backupObj.senderPublicKey,
                senderName: parsed.senderName || backupObj.senderName || 'Fornecedor / Credor',
                recipientPublicKey: backupObj.recipientPublicKey,
                exportedAt: parsed.exportedAt || backupObj.createdAt,
                readOnly: true,
                version: parsed.version || Date.now()
            };
        } catch (err) {
            throw new Error('PIN_OR_KEY_INVALID');
        }
    }

    // Gerenciamento de Sessão Ativa
    function isSessionActive() {
        if (!hasMasterPassword()) return false; // Exige configuração de senha no primeiro acesso
        try {
            return sessionStorage.getItem(SESSION_STORAGE_KEY) === 'active';
        } catch (e) {
            return false;
        }
    }

    function setSessionActive(active) {
        try {
            if (active) {
                sessionStorage.setItem(SESSION_STORAGE_KEY, 'active');
            } else {
                sessionStorage.removeItem(SESSION_STORAGE_KEY);
            }
        } catch (e) {
            // Ignora se cookies/storage desativados
        }
    }

    function logout() {
        setSessionActive(false);
    }

    // Exclui a conta, credenciais e chaves criptográficas do armazenamento local
    function deleteAccount() {
        try {
            if (typeof SecureStorage !== 'undefined') {
                SecureStorage.removeItem(AUTH_STORAGE_KEY);
                SecureStorage.removeItem('loanManagerData');
                SecureStorage.removeItem('loanManagerDataBackupBeforeImport');
                SecureStorage.removeItem('loanManagerDataBackupBeforeV3');
            }
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem('loanManagerData');
            localStorage.removeItem('loanManagerDataBackupBeforeImport');
            localStorage.removeItem('loanManagerDataBackupBeforeV3');
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (e) {
            console.error('Erro ao excluir conta:', e);
        }
    }

    return Object.freeze({
        hasMasterPassword,
        generateRecoveryKey,
        generatePublicKey,
        derivePublicKeyFromRecoveryKey,
        deriveVaultIdFromRecoveryKey,
        getPublicKey,
        generateSharePin,
        setupMasterPassword,
        verifyMasterPassword,
        resetPasswordWithRecoveryKey,
        changePassword,
        encryptBackup,
        decryptBackup,
        restoreAccountFromBackup,
        encryptClientBackup,
        decryptClientBackup,
        isSessionActive,
        setSessionActive,
        logout,
        deleteAccount
    });
});
