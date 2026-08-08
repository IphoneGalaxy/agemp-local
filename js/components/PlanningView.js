const PlanningSvgIcon = ({ name, className = 'w-5 h-5' }) => {
    const paths = {
        overview: <><path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" /></>,
        loans: <><path d="M12 3v18M17 7.5c0-1.9-2-3.5-5-3.5S7 5.3 7 7s1.6 2.7 5 3.5 5 1.7 5 3.5-2 3.5-5 3.5S7 16 7 14" /></>,
        banks: <><path d="m3 9 9-5 9 5M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18" /></>,
        timeline: <><path d="M6 3v18M6 6h8l3 3-3 3H6m0 4h6l2 2-2 2H6" /></>,
        export: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" /></>,
        moon: <><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></>,
        sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        estimate: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" /></>,
        warning: <><path d="M10.3 3.6 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>
    };
    return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.overview}</svg>;
};

const PlanningQualityBadge = ({ quality }) => {
    const details = {
        confirmed: ['Confirmado', 'check', 'bg-emerald-100 text-emerald-800'],
        estimated: ['Estimado', 'estimate', 'bg-blue-100 text-blue-800'],
        recalculated: ['Recalculado', 'estimate', 'bg-violet-100 text-violet-800'],
        review: ['Requer revisão', 'warning', 'bg-amber-100 text-amber-900']
    }[quality] || ['Confirmado', 'check', 'bg-emerald-100 text-emerald-800'];
    return <span className={`planning-badge ${details[2]}`}><PlanningSvgIcon name={details[1]} className="w-3.5 h-3.5" />{details[0]}</span>;
};

const PlanningMetric = ({ label, value, help, quality = 'confirmed' }) => <div className="planning-card p-4 min-h-[126px] flex flex-col justify-between">
    <div className="flex items-start justify-between gap-2"><p className="planning-muted text-xs font-semibold leading-snug">{label}</p><PlanningQualityBadge quality={quality} /></div>
    <div><p className="planning-metric-value text-xl sm:text-2xl font-bold mt-3">{value}</p>{help && <p className="planning-muted text-xs mt-1">{help}</p>}</div>
</div>;

const formatPlanningMonth = date => {
    if (!date) return 'Não projetado';
    const parsed = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parsed);
};

const PlanningView = ({ state, utils }) => {
    const [section, setSection] = useState('overview');
    const [dark, setDark] = useState(() => localStorage.getItem('planningTheme') === 'dark');
    const [clientFilter, setClientFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [exportSections, setExportSections] = useState([...ReportEngine.DEFAULT_SECTIONS]);
    const [includeEstimated, setIncludeEstimated] = useState(true);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const referenceDate = FinanceEngine.localIsoDate(new Date());
    const planning = useMemo(() => ProjectionEngine.buildPlanningModel({ ...state, referenceDate }), [state.clients, state.capitalSources, state.bankPayments, state.fundsTransactions, referenceDate]);

    const filteredLoans = planning.loans.filter(row => (!clientFilter || row.clientId === clientFilter) && (!sourceFilter || row.sourceId === sourceFilter) && (!statusFilter || row.status === statusFilter));
    const filteredBanks = planning.banks.filter(row => !sourceFilter || row.sourceId === sourceFilter);
    const report = useMemo(() => ReportEngine.buildReport({
        data: state, referenceDate,
        filters: { clientIds: clientFilter ? [clientFilter] : [], sourceIds: sourceFilter ? [sourceFilter] : [], startDate, endDate, includeEstimated },
        sections: exportSections
    }), [state.clients, state.capitalSources, state.bankPayments, state.fundsTransactions, clientFilter, sourceFilter, startDate, endDate, includeEstimated, exportSections.join('|'), referenceDate]);

    const toggleTheme = () => {
        const next = !dark; setDark(next); localStorage.setItem('planningTheme', next ? 'dark' : 'light');
    };
    const tabs = [
        ['overview', 'Visão geral', 'overview'], ['loans', 'Empréstimos', 'loans'], ['banks', 'Operações bancárias', 'banks'],
        ['timeline', 'Linha do tempo', 'timeline'], ['export', 'Exportar Excel', 'export']
    ];
    const applyExportPreset = preset => {
        if (preset === 'all') setExportSections([...ReportEngine.DEFAULT_SECTIONS]);
        if (preset === 'client') { setExportSections(['summary', 'loans', 'receipts', 'transactions']); setSection('export'); }
        if (preset === 'bank') { setExportSections(['summary', 'banks', 'installments', 'amortizations', 'projections', 'parameters']); setSection('export'); }
        if (preset === 'projection') setExportSections(['summary', 'projections', 'parameters']);
    };
    const toggleExportSection = value => setExportSections(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
    const exportExcel = () => {
        try {
            const label = clientFilter ? `cliente_${state.clients.find(item => item.id === clientFilter)?.name || 'selecionado'}` : sourceFilter ? `operacao_${state.capitalSources.find(item => item.id === sourceFilter)?.name || 'selecionada'}` : 'completo';
            ExcelReportExporter.exportReport({ report, filename: `extrato_${label}_${referenceDate}.xlsx` });
            utils.showToast('Arquivo Excel gerado com sucesso.');
        } catch (error) { utils.showToast(`Não foi possível gerar o Excel: ${error.message}`); }
    };

    return <main className={`planning-shell ${dark ? 'planning-dark' : ''}`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 sm:py-7">
            <div className="flex items-start justify-between gap-4 mb-5">
                <div><p className="text-xs font-bold uppercase tracking-[.14em]" style={{ color: 'var(--plan-primary)' }}>Central financeira</p><h2 className="text-2xl sm:text-3xl font-bold mt-1">Planejamento</h2><p className="planning-muted text-sm mt-1 max-w-2xl">Projeções auditáveis, separadas do histórico confirmado. Data-base: {formatDate(referenceDate)}.</p></div>
                <button type="button" onClick={toggleTheme} className="planning-button-secondary planning-focus p-2.5" aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'} title={dark ? 'Tema claro' : 'Tema escuro'}><PlanningSvgIcon name={dark ? 'sun' : 'moon'} /></button>
            </div>

            <div role="tablist" aria-label="Seções do planejamento" className="flex gap-2 overflow-x-auto hide-scroll pb-2 mb-5">
                {tabs.map(([id, label, icon]) => <button key={id} role="tab" aria-selected={section === id} onClick={() => setSection(id)} className="planning-tab planning-focus flex items-center gap-2 rounded-xl px-3 sm:px-4 whitespace-nowrap font-semibold text-sm"><PlanningSvgIcon name={icon} className="w-4 h-4" />{label}</button>)}
            </div>

            {section === 'overview' && <div className="space-y-5 animate-fade-in">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <PlanningMetric label="Principal com clientes" value={formatMoney(planning.overview.outstandingPrincipal)} help="Capital ainda exposto" />
                    <PlanningMetric label="Juros recebidos" value={formatMoney(planning.overview.interestReceived)} help="Receita já realizada" />
                    <PlanningMetric label="Juros mensais esperados" value={formatMoney(planning.overview.expectedMonthlyInterest)} quality="estimated" />
                    <PlanningMetric label="Pago aos bancos" value={formatMoney(planning.overview.totalPaidToBanks)} help="Confirmado ou retido" />
                    <PlanningMetric label="Saldo bancário oficial" value={formatMoney(planning.overview.officialBankBalance)} quality="recalculated" />
                    <PlanningMetric label="Custo bancário projetado" value={formatMoney(planning.overview.projectedBankCost)} quality="estimated" />
                    <PlanningMetric label="Economia projetada" value={formatMoney(planning.overview.projectedSavings)} quality="estimated" />
                    <PlanningMetric label="Livre após quitações" value={`${formatMoney(planning.overview.freeMonthlyAfterPayoff)}/mês`} quality="estimated" />
                </div>
                <section className="planning-card p-4 sm:p-5"><div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="font-bold text-lg">Próximos marcos</h3><p className="planning-muted text-xs mt-1">Calculados a partir da estratégia e dos contratos ativos.</p></div><PlanningQualityBadge quality="estimated" /></div>
                    <div className="grid md:grid-cols-2 gap-2">{planning.milestones.slice(0, 8).map((item, index) => <div key={`${item.type}-${item.entityId}-${item.date}-${index}`} className="flex gap-3 items-center rounded-xl p-3" style={{ background: 'var(--plan-raised)' }}><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span><div><p className="font-semibold text-sm">{item.title}</p><p className="planning-muted text-xs capitalize">{formatPlanningMonth(item.date)}</p></div></div>)}{planning.milestones.length === 0 && <p className="planning-muted text-sm">Ainda não há dados suficientes para projetar marcos.</p>}</div>
                </section>
            </div>}

            {section === 'loans' && <div className="space-y-4 animate-fade-in">
                <div className="planning-card p-4 grid sm:grid-cols-3 gap-3"><label className="text-xs font-semibold">Cliente<select className="planning-input mt-1" value={clientFilter} onChange={event => setClientFilter(event.target.value)}><option value="">Todos</option>{state.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="text-xs font-semibold">Origem<select className="planning-input mt-1" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="">Todas</option>{state.capitalSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label className="text-xs font-semibold">Situação<select className="planning-input mt-1" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Ativos e quitados</option><option value="active">Ativos</option><option value="paid_off">Quitados</option></select></label></div>
                <div className="grid lg:grid-cols-2 gap-3">{filteredLoans.map(row => <article key={row.id} className="planning-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{row.clientName}</h3><p className="planning-muted text-xs mt-1">{formatDate(row.loanDate)} · {row.sourceName}</p></div><PlanningQualityBadge quality={row.dataQuality} /></div><div className="grid grid-cols-2 gap-3 mt-4 text-sm"><div><p className="planning-muted text-xs">Valor original</p><p className="planning-metric-value font-bold">{formatMoney(row.originalPrincipal)}</p></div><div><p className="planning-muted text-xs">Principal pendente</p><p className="planning-metric-value font-bold">{formatMoney(row.currentPrincipal)}</p></div><div><p className="planning-muted text-xs">Juros recebidos</p><p className="planning-metric-value font-bold text-emerald-600">{formatMoney(row.interestReceived)}</p></div><div><p className="planning-muted text-xs">Próximos juros</p><p className="planning-metric-value font-bold">{formatMoney(row.monthlyInterest)}</p></div></div><div className="mt-4"><div className="flex justify-between text-xs mb-1"><span>Juros em relação ao valor original</span><b>{row.milestoneProgress.toFixed(1)}%</b></div><div className="planning-progress" aria-label={`${row.milestoneProgress}% do marco de juros`}><span style={{ width: `${Math.min(100, row.milestoneProgress)}%` }}></span></div><div className="flex justify-between gap-3 mt-2 text-xs planning-muted"><span>Falta {formatMoney(row.pendingToMilestone)}</span><span className="text-right">{row.projectedMilestoneDate ? `Previsão: ${formatPlanningMonth(row.projectedMilestoneDate)}` : row.status === 'paid_off' ? 'Empréstimo encerrado' : 'Não é possível projetar'}</span></div></div></article>)}{filteredLoans.length === 0 && <div className="planning-card p-8 text-center planning-muted lg:col-span-2">Nenhum empréstimo corresponde aos filtros.</div>}</div>
            </div>}

            {section === 'banks' && <div className="space-y-4 animate-fade-in">{filteredBanks.map(row => <article key={row.sourceId} className="planning-card overflow-hidden"><div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-xl">{row.bankName}</h3><p className="planning-muted text-xs mt-1">{row.mode === 'discounted_last_installments' ? 'Antecipação das últimas parcelas' : 'Cronograma fixo'}</p></div><PlanningQualityBadge quality={row.quality} /></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div><p className="planning-muted text-xs">Pago até agora</p><p className="font-bold planning-metric-value">{formatMoney(row.actualPaid)}</p></div><div><p className="planning-muted text-xs">Saldo oficial</p><p className="font-bold planning-metric-value">{row.latestOfficialBalance === null ? 'Não informado' : formatMoney(row.latestOfficialBalance)}</p></div><div><p className="planning-muted text-xs">Total final estimado</p><p className="font-bold planning-metric-value">{formatMoney(row.projectedFinalPaid)}</p></div><div><p className="planning-muted text-xs">Economia estimada</p><p className="font-bold planning-metric-value text-emerald-600">{formatMoney(row.projectedSavings)}</p></div><div><p className="planning-muted text-xs">Quitação do banco</p><p className="font-bold capitalize">{formatPlanningMonth(row.bankPaidDate)}</p></div><div><p className="planning-muted text-xs">Operação positiva</p><p className="font-bold capitalize">{formatPlanningMonth(row.positiveDate)}</p></div><div><p className="planning-muted text-xs">Custo projetado</p><p className="font-bold planning-metric-value">{formatMoney(row.projectedCost)} ({row.projectedCostPercent.toFixed(2)}%)</p></div><div><p className="planning-muted text-xs">Livre depois da quitação</p><p className="font-bold planning-metric-value">{formatMoney(row.freeMonthlyAfterPayoff)}/mês</p></div></div></div><details><summary className="planning-focus cursor-pointer px-4 sm:px-5 py-3 font-semibold text-sm border-t" style={{ borderColor: 'var(--plan-border)', background: 'var(--plan-raised)' }}>Conferir projeção mês a mês</summary><div className="overflow-x-auto"><table className="planning-table"><thead><tr><th>Mês</th><th>Juros</th><th>Parcela</th><th>Amortização</th><th>Complemento</th><th>Sobra</th><th>Restantes</th><th>Resultado</th></tr></thead><tbody>{row.timeline.map(month => <tr key={`${row.sourceId}-${month.date}`}><td>{formatPlanningMonth(month.date)}</td><td>{formatMoney(month.clientInterest)}</td><td>{formatMoney(month.normalInstallment)}</td><td>{formatMoney(month.amortization)}</td><td>{formatMoney(month.ownCapital)}</td><td>{formatMoney(month.carryover)}</td><td>{month.remainingInstallments}</td><td>{formatMoney(month.operationResult)}</td></tr>)}</tbody></table></div></details></article>)}{filteredBanks.length === 0 && <div className="planning-card p-8 text-center planning-muted">Cadastre ou filtre uma origem bancária para ver a projeção.</div>}</div>}

            {section === 'timeline' && <div className="planning-card overflow-hidden animate-fade-in"><div className="p-4 sm:p-5"><h3 className="font-bold text-lg">Linha do tempo financeira</h3><p className="planning-muted text-xs mt-1">Planejado e realizado permanecem identificados separadamente.</p></div><div className="overflow-x-auto"><table className="planning-table"><thead><tr><th>Mês</th><th>Banco</th><th>Recebimentos</th><th>Parcela</th><th>Amortização</th><th>Capital próprio</th><th>Saldo/sobra</th><th>Marcos</th><th>Qualidade</th></tr></thead><tbody>{filteredBanks.flatMap(bank => bank.timeline.map(month => ({ bank, month }))).sort((a,b) => a.month.date.localeCompare(b.month.date)).map(({ bank, month }) => <tr key={`${bank.sourceId}-${month.date}`}><td>{formatPlanningMonth(month.date)}</td><td className="font-semibold">{bank.bankName}</td><td>{formatMoney(month.clientInterest)}</td><td>{formatMoney(month.normalInstallment)}</td><td>{formatMoney(month.amortization)}</td><td>{formatMoney(month.ownCapital)}</td><td>{formatMoney(month.carryover)}</td><td>{[bank.bankPaidDate === month.date ? 'Banco quitado' : '', bank.positiveDate === month.date ? 'Operação positiva' : ''].filter(Boolean).join(', ') || '—'}</td><td><PlanningQualityBadge quality="estimated" /></td></tr>)}</tbody></table></div></div>}

            {section === 'export' && <div className="grid lg:grid-cols-[1fr_360px] gap-4 animate-fade-in"><section className="planning-card p-4 sm:p-5 space-y-5"><div><h3 className="font-bold text-lg">Montar extrato em Excel</h3><p className="planning-muted text-xs mt-1">Escolha o conteúdo e confira a prévia antes de gerar.</p></div><div><p className="text-xs font-bold mb-2">Modelos rápidos</p><div className="flex flex-wrap gap-2"><button className="planning-button-secondary planning-focus" onClick={() => applyExportPreset('all')}>Tudo</button><button className="planning-button-secondary planning-focus" onClick={() => applyExportPreset('client')}>Por cliente</button><button className="planning-button-secondary planning-focus" onClick={() => applyExportPreset('bank')}>Por banco</button><button className="planning-button-secondary planning-focus" onClick={() => applyExportPreset('projection')}>Somente projeções</button></div></div><div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-semibold">Cliente<select className="planning-input mt-1" value={clientFilter} onChange={event => setClientFilter(event.target.value)}><option value="">Todos os clientes</option>{state.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="text-xs font-semibold">Origem / banco<select className="planning-input mt-1" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="">Todas as origens</option>{state.capitalSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label className="text-xs font-semibold">Data inicial<input type="date" className="planning-input mt-1" value={startDate} onChange={event => setStartDate(event.target.value)} /></label><label className="text-xs font-semibold">Data final<input type="date" className="planning-input mt-1" value={endDate} onChange={event => setEndDate(event.target.value)} /></label></div><fieldset><legend className="text-xs font-bold mb-2">Planilhas incluídas</legend><div className="grid sm:grid-cols-2 gap-2">{ReportEngine.DEFAULT_SECTIONS.map(value => <label key={value} className="min-h-[44px] flex items-center gap-2 rounded-lg px-3 cursor-pointer" style={{ background: 'var(--plan-raised)' }}><input type="checkbox" checked={exportSections.includes(value)} onChange={() => toggleExportSection(value)} /><span className="text-sm capitalize">{{ summary:'Resumo',transactions:'Movimentações',loans:'Empréstimos',receipts:'Recebimentos',banks:'Operações bancárias',installments:'Parcelas bancárias',amortizations:'Amortizações',projections:'Projeções',parameters:'Parâmetros',alerts:'Alertas' }[value]}</span></label>)}</div></fieldset><label className="min-h-[44px] flex items-center gap-2"><input type="checkbox" checked={includeEstimated} onChange={event => setIncludeEstimated(event.target.checked)} /><span className="text-sm">Incluir dados estimados e a linha do tempo futura</span></label></section><aside className="planning-card p-4 sm:p-5 h-fit lg:sticky lg:top-4"><h3 className="font-bold">Prévia do arquivo</h3><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="planning-muted">Planilhas</dt><dd className="font-bold">{Object.keys(report.sheets).length}</dd></div><div className="flex justify-between gap-3"><dt className="planning-muted">Registros</dt><dd className="font-bold">{report.rowCount}</dd></div><div className="flex justify-between gap-3"><dt className="planning-muted">Cliente</dt><dd className="font-bold text-right">{clientFilter ? state.clients.find(item => item.id === clientFilter)?.name : 'Todos'}</dd></div><div className="flex justify-between gap-3"><dt className="planning-muted">Origem</dt><dd className="font-bold text-right">{sourceFilter ? state.capitalSources.find(item => item.id === sourceFilter)?.name : 'Todas'}</dd></div><div className="flex justify-between gap-3"><dt className="planning-muted">Projeções</dt><dd className="font-bold">{includeEstimated ? 'Incluídas' : 'Ocultas'}</dd></div></dl>{includeEstimated && <div className="mt-4 p-3 rounded-xl bg-blue-50 text-blue-900 text-xs flex gap-2"><PlanningSvgIcon name="estimate" className="w-4 h-4 shrink-0" /><span>Valores futuros sairão identificados como estimados.</span></div>}<button data-testid="planning-export-xlsx" disabled={exportSections.length === 0} onClick={exportExcel} className="planning-button-primary planning-focus w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"><PlanningSvgIcon name="export" />Gerar Excel</button></aside></div>}
        </div>
    </main>;
};
