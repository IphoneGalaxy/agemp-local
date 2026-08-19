const { useState, useEffect, useMemo, useRef } = React;

// Utilitários de formatação
const formatMoney = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Gerador de Identificadores Criptograficamente Seguro (CSPRNG)
const generateId = () => {
    if (typeof crypto !== 'undefined') {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID().replace(/-/g, '').slice(0, 9);
        }
        if (typeof crypto.getRandomValues === 'function') {
            const bytes = new Uint8Array(6);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 9);
        }
    }
    return Math.random().toString(36).slice(2, 11);
};

// Armazenamento Seguro para localStorage (Protege os dados financeiros contra leitura em texto claro por extensões)
const SecureStorage = {
    _PREFIX: 'sec:v1:',

    _obfuscate(text) {
        try {
            const utf8Bytes = new TextEncoder().encode(text);
            const key = [0x5A, 0x9C, 0x3F, 0xE1, 0x7B, 0x82, 0x14, 0xD6];
            const masked = new Uint8Array(utf8Bytes.length);
            for (let i = 0; i < utf8Bytes.length; i++) {
                masked[i] = utf8Bytes[i] ^ key[i % key.length];
            }
            let binary = '';
            for (let i = 0; i < masked.length; i++) {
                binary += String.fromCharCode(masked[i]);
            }
            return this._PREFIX + btoa(binary);
        } catch (e) {
            return text;
        }
    },

    _deobfuscate(stored) {
        if (!stored) return null;
        if (!stored.startsWith(this._PREFIX)) {
            // Compatibilidade retroativa com dados gravados anteriormente em texto puro
            return stored;
        }
        try {
            const rawB64 = stored.slice(this._PREFIX.length);
            const binary = atob(rawB64);
            const masked = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                masked[i] = binary.charCodeAt(i);
            }
            const key = [0x5A, 0x9C, 0x3F, 0xE1, 0x7B, 0x82, 0x14, 0xD6];
            const unmasked = new Uint8Array(masked.length);
            for (let i = 0; i < masked.length; i++) {
                unmasked[i] = masked[i] ^ key[i % key.length];
            }
            return new TextDecoder().decode(unmasked);
        } catch (e) {
            console.error('Falha ao decodificar armazenamento protegido:', e);
            return null;
        }
    },

    getItem(key) {
        const raw = localStorage.getItem(key);
        return this._deobfuscate(raw);
    },

    setItem(key, value) {
        const protectedValue = this._obfuscate(value);
        localStorage.setItem(key, protectedValue);
    },

    removeItem(key) {
        localStorage.removeItem(key);
    }
};

