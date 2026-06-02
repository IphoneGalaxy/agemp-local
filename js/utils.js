const { useState, useEffect, useMemo, useRef } = React;

// Utilitários
const formatMoney = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const generateId = () => Math.random().toString(36).substr(2, 9);
