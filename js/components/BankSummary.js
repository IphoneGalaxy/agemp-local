            // --- COMPONENTE DE GESTÃO DO CONTRATO BANCÁRIO ---
            const BankSummary = ({ bank, state, actions, utils }) => {
                const { globalStats, capitalSources, fundsTransactions, bankPayments } = state;
                const { setCapitalSources, setFundsTransactions, setBankPayments } = actions;
                const { showToast, getCapitalBalance, getSourceSummary } = utils;
                const today = FinanceEngine.localIsoDate(new Date());
                const ownSources = capitalSources.filter(source => source.type === 'own');
                const summary = FinanceEngine.summarizeBankContract({ bank, bankPayments });
                const sourceSummary = getSourceSummary(bank.id);
                const bankStats = globalStats.bankDetails.find(detail => detail.sourceId === bank.id);

                const createQuoteOptions = () => [
                    { id: generateId(), count: '', amount: '' },
                    { id: generateId(), count: '', amount: '' }
                ];

                const [showMonthlyForm, setShowMonthlyForm] = useState(false);
                const [showBalanceForm, setShowBalanceForm] = useState(false);
                const [operationDate, setOperationDate] = useState(today);
                const [competence, setCompetence] = useState(today.slice(0, 7));
                const [includeInstallment, setIncludeInstallment] = useState(true);
                const [installmentStatus, setInstallmentStatus] = useState(FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK);
                const [quoteOptions, setQuoteOptions] = useState(createQuoteOptions);
                const [selectedQuoteId, setSelectedQuoteId] = useState('');
                const [complementSourceId, setComplementSourceId] = useState(() => (
                    FinanceEngine.getDefaultOwnSourceId(capitalSources)
                ));
                const [balanceDate, setBalanceDate] = useState(today);
                const [officialBalance, setOfficialBalance] = useState('');
                const [officialNominal, setOfficialNominal] = useState('');
                const [remainingStart, setRemainingStart] = useState('');
                const [remainingEnd, setRemainingEnd] = useState('');

                const selectedQuote = quoteOptions.find(option => option.id === selectedQuoteId);
                const selectedQuoteCount = Number(selectedQuote?.count || 0);
                const selectedQuoteAmount = Number(selectedQuote?.amount || 0);
                const installmentAmount = includeInstallment ? Number(bank.installmentValue || 0) : 0;
                const settlement = FinanceEngine.calculateMonthlyBankSettlement({
                    reserveAvailable: Math.max(0, sourceSummary.interestReserve),
                    installmentAmount,
                    quoteAmount: selectedQuoteAmount
                });
                const proposedFinalNumbers = selectedQuoteCount > 0
                    ? FinanceEngine.selectFinalInstallments({ bank, bankPayments, count: selectedQuoteCount })
                    : [];
                const complementBalance = complementSourceId ? getCapitalBalance(complementSourceId) : 0;

                const formatInstallmentNumbers = (numbers) => {
                    if (!numbers || numbers.length === 0) return 'não informadas';
                    if (numbers.length === 1) return String(numbers[0]);
                    const isContinuous = numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
                    return isContinuous ? `${numbers[0]} a ${numbers[numbers.length - 1]}` : numbers.join(', ');
                };

                const updateQuote = (id, field, value) => {
                    setQuoteOptions(options => options.map(option => (
                        option.id === id ? { ...option, [field]: value } : option
                    )));
                    setSelectedQuoteId(id);
                };

                const resetMonthlyForm = () => {
                    setOperationDate(FinanceEngine.localIsoDate(new Date()));
                    setCompetence(FinanceEngine.localIsoDate(new Date()).slice(0, 7));
                    setIncludeInstallment(true);
                    setInstallmentStatus(FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK);
                    setQuoteOptions(createQuoteOptions());
                    setSelectedQuoteId('');
                    setShowMonthlyForm(false);
                };

                const createFundingPart = (sourceId, amount, transactionId) => {
                    if (FinanceEngine.toCents(amount) <= 0) return null;
                    return {
                        sourceId,
                        amount: FinanceEngine.fromCents(FinanceEngine.toCents(amount)),
                        ...(transactionId ? { fundsTransactionId: transactionId } : {})
                    };
                };

                const handleMonthlySettlement = (event) => {
                    event.preventDefault();

                    if (!includeInstallment && selectedQuoteAmount <= 0) {
                        showToast('❌ Informe uma parcela ou escolha uma cotação de antecipação.');
                        return;
                    }
                    if ((selectedQuoteCount > 0) !== (selectedQuoteAmount > 0)) {
                        showToast('❌ Preencha a quantidade e o valor da cotação escolhida.');
                        return;
                    }
                    if (includeInstallment && bankPayments.some(payment => (
                        payment.sourceId === bank.id &&
                        payment.type === 'installment' &&
                        payment.competence === competence &&
                        payment.status !== FinanceEngine.BANK_PAYMENT_STATUS.SCHEDULED
                    ))) {
                        showToast('❌ A parcela desta competência já foi registrada.');
                        return;
                    }
                    if (selectedQuoteAmount > 0 && (!Number.isInteger(selectedQuoteCount) || selectedQuoteCount <= 0)) {
                        showToast('❌ Informe a quantidade de parcelas da cotação escolhida.');
                        return;
                    }
                    if (selectedQuoteAmount > 0 && summary.unreconciledPayments.length > 0) {
                        showToast('❌ Reconcilie os lançamentos antigos antes de registrar uma nova antecipação.');
                        return;
                    }
                    if (selectedQuoteCount > summary.accountingRemainingCount - (includeInstallment ? 1 : 0)) {
                        showToast('❌ A quantidade informada é maior que as parcelas disponíveis.');
                        return;
                    }
                    if (selectedQuoteAmount > 0 && proposedFinalNumbers.length !== selectedQuoteCount) {
                        showToast('❌ Não foi possível identificar todas as parcelas finais. Reconcilie o histórico primeiro.');
                        return;
                    }
                    if (settlement.ownCapitalRequired > 0) {
                        if (!complementSourceId) {
                            showToast('❌ Selecione a origem do complemento.');
                            return;
                        }
                        if (FinanceEngine.toCents(settlement.ownCapitalRequired) > FinanceEngine.toCents(complementBalance)) {
                            showToast(`❌ Saldo insuficiente no Capital Próprio. Adicione ${formatMoney(settlement.ownCapitalRequired)} antes de continuar.`);
                            return;
                        }
                    }

                    const newPayments = [];
                    const newTransactions = [];
                    const nextNormalNumber = summary.nextInstallmentNumber;

                    if (includeInstallment) {
                        if (!nextNormalNumber) {
                            showToast('❌ Não existe parcela mensal disponível para registrar.');
                            return;
                        }

                        const paymentId = generateId();
                        let ownTransactionId = null;
                        if (settlement.ownForInstallment > 0) {
                            ownTransactionId = generateId();
                            newTransactions.push({
                                id: ownTransactionId,
                                date: operationDate,
                                amount: -settlement.ownForInstallment,
                                sourceId: complementSourceId,
                                purpose: 'bank-complement',
                                bankPaymentId: paymentId
                            });
                        }

                        const fundingBreakdown = [
                            createFundingPart(bank.id, settlement.reserveForInstallment),
                            createFundingPart(complementSourceId, settlement.ownForInstallment, ownTransactionId)
                        ].filter(Boolean);

                        newPayments.push({
                            id: paymentId,
                            date: operationDate,
                            competence,
                            amount: installmentAmount,
                            sourceId: bank.id,
                            type: 'installment',
                            status: installmentStatus,
                            installmentNumber: nextNormalNumber,
                            dueDate: FinanceEngine.getInstallmentDueDate(bank.firstDueDate, nextNormalNumber),
                            ...(installmentStatus === FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK
                                ? { withheldDate: operationDate }
                                : { confirmationDate: operationDate, confirmationSource: 'manual' }),
                            fundingBreakdown
                        });
                    }

                    if (selectedQuoteAmount > 0) {
                        const paymentId = generateId();
                        let ownTransactionId = null;
                        if (settlement.ownForAmortization > 0) {
                            ownTransactionId = generateId();
                            newTransactions.push({
                                id: ownTransactionId,
                                date: operationDate,
                                amount: -settlement.ownForAmortization,
                                sourceId: complementSourceId,
                                purpose: 'bank-complement',
                                bankPaymentId: paymentId
                            });
                        }

                        const nominalAmount = FinanceEngine.fromCents(
                            FinanceEngine.toCents(bank.installmentValue) * proposedFinalNumbers.length
                        );
                        const discountAmount = Math.max(0, FinanceEngine.fromCents(
                            FinanceEngine.toCents(nominalAmount) - FinanceEngine.toCents(selectedQuoteAmount)
                        ));
                        const fundingBreakdown = [
                            createFundingPart(bank.id, settlement.reserveForAmortization),
                            createFundingPart(complementSourceId, settlement.ownForAmortization, ownTransactionId)
                        ].filter(Boolean);

                        newPayments.push({
                            id: paymentId,
                            date: operationDate,
                            competence,
                            amount: FinanceEngine.fromCents(FinanceEngine.toCents(selectedQuoteAmount)),
                            sourceId: bank.id,
                            type: 'amortization',
                            status: FinanceEngine.BANK_PAYMENT_STATUS.CONFIRMED,
                            installmentNumbers: proposedFinalNumbers,
                            nominalAmount,
                            discountAmount,
                            fundingBreakdown
                        });
                    }

                    setBankPayments([...newPayments, ...bankPayments]);
                    if (newTransactions.length > 0) {
                        setFundsTransactions([...newTransactions, ...fundsTransactions]);
                    }
                    resetMonthlyForm();
                    showToast('✅ Operação bancária registrada com todas as origens!');
                };

                const confirmPendingInstallment = (paymentId) => {
                    const confirmationDate = FinanceEngine.localIsoDate(new Date());
                    setBankPayments(bankPayments.map(payment => (
                        payment.id === paymentId
                            ? {
                                ...payment,
                                status: FinanceEngine.BANK_PAYMENT_STATUS.CONFIRMED,
                                confirmationDate,
                                confirmationSource: 'manual'
                            }
                            : payment
                    )));
                    showToast('✅ Repasse confirmado manualmente, sem duplicar o pagamento.');
                };

                const removeBankOperation = (payment) => {
                    const label = payment.type === 'installment' ? 'esta parcela' : 'esta antecipação';
                    if (!window.confirm(`Desfazer ${label} de ${formatMoney(payment.amount)}? O complemento vinculado também será estornado.`)) return;

                    const linkedTransactionIds = new Set(
                        FinanceEngine.getFundingBreakdown(payment)
                            .map(part => part.fundsTransactionId || part.transactionId)
                            .filter(Boolean)
                    );
                    setBankPayments(bankPayments.filter(item => item.id !== payment.id));
                    setFundsTransactions(fundsTransactions.filter(transaction => (
                        transaction.bankPaymentId !== payment.id && !linkedTransactionIds.has(transaction.id)
                    )));
                    showToast('✅ Operação desfeita e complemento estornado.');
                };

                const handleOfficialBalance = (event) => {
                    event.preventDefault();
                    const amount = Number(officialBalance);
                    const start = Number(remainingStart);
                    const end = Number(remainingEnd);
                    if (officialBalance === '' || !Number.isFinite(amount) || amount < 0 || !balanceDate) return;
                    if ((remainingStart || remainingEnd) && (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start)) {
                        showToast('❌ Informe corretamente a primeira e a última parcela restantes.');
                        return;
                    }

                    const snapshot = {
                        id: generateId(),
                        date: balanceDate,
                        amount: FinanceEngine.fromCents(FinanceEngine.toCents(amount)),
                        ...(Number(officialNominal) > 0
                            ? { nominalRemaining: FinanceEngine.fromCents(FinanceEngine.toCents(officialNominal)) }
                            : {}),
                        ...(start > 0 && end >= start ? { remainingStart: start, remainingEnd: end } : {}),
                        ...(amount === 0 ? { remainingInstallmentNumbers: [] } : {})
                    };

                    setCapitalSources(capitalSources.map(source => (
                        source.id === bank.id
                            ? { ...source, officialBalanceSnapshots: [snapshot, ...(source.officialBalanceSnapshots || [])] }
                            : source
                    )));
                    setOfficialBalance('');
                    setOfficialNominal('');
                    setRemainingStart('');
                    setRemainingEnd('');
                    setShowBalanceForm(false);
                    showToast('✅ Saldo oficial do banco atualizado!');
                };

                const pendingPayments = bankPayments.filter(payment => (
                    payment.sourceId === bank.id &&
                    payment.type === 'installment' &&
                    payment.status === FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK
                ));
                const history = bankPayments
                    .filter(payment => payment.sourceId === bank.id)
                    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));

                return (
                    <div data-testid={`bank-summary-${bank.id}`} className="bg-white rounded-2xl p-5 shadow-sm border border-purple-200">
                        <div className="flex justify-between items-start gap-3 mb-4">
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">🏦 {bank.name}</h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    Recebido: {formatMoney(bank.receivedAmount)} · Parcela: {formatMoney(bank.installmentValue)}
                                </p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${summary.accountingRemainingCount === 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {summary.accountingRemainingCount === 0 ? 'Quitado' : 'Ativo'}
                            </span>
                        </div>

                        {summary.unreconciledPayments.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                                <p className="font-bold">⚠️ Histórico antigo precisa de reconciliação</p>
                                <p className="mt-1">Existem {summary.unreconciledPayments.length} lançamentos sem o número exato das parcelas. Eles foram preservados.</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mb-3 text-center">
                            <div className="bg-purple-50 rounded-xl p-3">
                                <p className="text-[10px] text-purple-500 uppercase">Saldo para liquidação</p>
                                <p className="font-bold text-purple-800">{summary.officialBalance === null ? 'Não informado' : formatMoney(summary.officialBalance)}</p>
                                {summary.officialBalanceDate && <p className="text-[9px] text-purple-400">Em {formatDate(summary.officialBalanceDate)}</p>}
                                {summary.officialNominalRemaining !== null && <p className="text-[9px] text-purple-500 mt-1">Nominal: {formatMoney(summary.officialNominalRemaining)}</p>}
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3">
                                <p className="text-[10px] text-blue-500 uppercase">Fundo disponível</p>
                                <p data-testid={`bank-fund-${bank.id}`} className="font-bold text-blue-800">{formatMoney(sourceSummary.interestReserve)}</p>
                                <p className="text-[9px] text-blue-400">Sem reutilizar valores pagos</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3 text-center text-[10px]">
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-gray-400">Normais</p>
                                <p className="font-bold text-gray-800">{summary.confirmedNormalCount} confirm.</p>
                                {summary.pendingNormalCount > 0 && <p className="font-bold text-amber-600">{summary.pendingNormalCount} em folha</p>}
                            </div>
                            <div className="bg-green-50 rounded-lg p-2">
                                <p className="text-green-500">Antecipadas</p>
                                <p className="font-bold text-green-700">{summary.anticipatedCount}</p>
                                <p className="text-[9px] text-green-500">{formatMoney(summary.amortizationCashPaid)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-gray-400">Restantes</p>
                                <p className="font-bold text-gray-800">{summary.accountingRemainingCount}</p>
                                <p className="text-[9px] text-gray-400">até {summary.lastInstallmentNumber || '—'}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-4 text-center text-[10px]">
                            <div className="bg-emerald-50 rounded-lg p-2">
                                <p className="text-emerald-500">Juros dos clientes</p>
                                <p className="font-bold text-emerald-700">{formatMoney(bankStats?.interestFromClients || 0)}</p>
                            </div>
                            <div className="bg-violet-50 rounded-lg p-2">
                                <p className="text-violet-500">Pago ou retido</p>
                                <p className="font-bold text-violet-700">{formatMoney(summary.totalCashPaid)}</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-2">
                                <p className="text-blue-500">Nominal antecipado</p>
                                <p className="font-bold text-blue-700">{formatMoney(summary.anticipatedNominal)}</p>
                            </div>
                            <div className="bg-indigo-50 rounded-lg p-2">
                                <p className="text-indigo-500">Desconto nas antecipações</p>
                                <p className="font-bold text-indigo-700">{formatMoney(summary.anticipatedDiscount)}</p>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-600">
                            <div className="flex justify-between gap-3">
                                <span>Próxima: {summary.nextInstallmentNumber ? `nº ${summary.nextInstallmentNumber}` : '—'}</span>
                                <span>{summary.nextInstallmentDueDate ? formatDate(summary.nextInstallmentDueDate) : '—'}</span>
                            </div>
                            <div className="flex justify-between gap-3 mt-1">
                                <span>Previsão final</span>
                                <span className="font-bold">{summary.forecastDate ? formatDate(summary.forecastDate) : 'A confirmar'}</span>
                            </div>
                            {summary.pendingNormalCount > 0 && (
                                <div className="flex justify-between gap-3 mt-1 text-amber-700">
                                    <span>Confirmado pelo banco</span>
                                    <span className="font-bold">{formatMoney(summary.confirmedCashPaid)}</span>
                                </div>
                            )}
                        </div>

                        {pendingPayments.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {pendingPayments.map(payment => (
                                    <div key={payment.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        <p className="text-xs font-bold text-amber-800">Parcela {payment.installmentNumber} descontada em folha</p>
                                        <p className="text-[10px] text-amber-600 mt-0.5">{formatMoney(payment.amount)} · aguardando confirmação do banco</p>
                                        <button data-testid={`bank-confirm-${payment.id}`} onClick={() => confirmPendingInstallment(payment.id)} className="w-full mt-2 py-2 bg-amber-600 text-white rounded-lg text-[10px] font-bold">
                                            Confirmar repasse do banco
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button data-testid={`bank-monthly-open-${bank.id}`} onClick={() => setShowMonthlyForm(!showMonthlyForm)} className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-xs font-bold">
                                + Registrar mês
                            </button>
                            <button onClick={() => setShowBalanceForm(!showBalanceForm)} className="flex-1 bg-blue-50 text-blue-700 py-2.5 rounded-xl text-xs font-bold border border-blue-200">
                                Atualizar saldo
                            </button>
                        </div>

                        {showMonthlyForm && (
                            <form onSubmit={handleMonthlySettlement} className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4 animate-fade-in">
                                <h4 className="font-bold text-purple-800 text-sm mb-3">Fechamento do mês</h4>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-1">Data da operação</label>
                                        <input type="date" value={operationDate} onChange={event => setOperationDate(event.target.value)} required className="w-full p-2 border rounded-lg bg-white text-xs" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-gray-500 mb-1">Competência</label>
                                        <input type="month" value={competence} onChange={event => setCompetence(event.target.value)} required className="w-full p-2 border rounded-lg bg-white text-xs" />
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 bg-white rounded-lg p-2 border mb-2 text-xs font-bold text-gray-700">
                                    <input type="checkbox" checked={includeInstallment} onChange={event => setIncludeInstallment(event.target.checked)} />
                                    Registrar parcela mensal de {formatMoney(bank.installmentValue)}
                                </label>

                                {includeInstallment && (
                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                        <button type="button" onClick={() => setInstallmentStatus(FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK)} className={`p-2 rounded-lg text-[10px] font-bold ${installmentStatus === FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 border'}`}>
                                            Descontada em folha
                                        </button>
                                        <button type="button" onClick={() => setInstallmentStatus(FinanceEngine.BANK_PAYMENT_STATUS.CONFIRMED)} className={`p-2 rounded-lg text-[10px] font-bold ${installmentStatus === FinanceEngine.BANK_PAYMENT_STATUS.CONFIRMED ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border'}`}>
                                            Confirmada no banco
                                        </button>
                                    </div>
                                )}

                                <p className="text-[10px] font-bold text-purple-700 uppercase mb-2">Cotações fornecidas pelo banco</p>
                                <div className="space-y-2">
                                    {quoteOptions.map((option, index) => (
                                        <div key={option.id} className={`grid grid-cols-[auto_1fr_1.4fr] gap-2 items-center rounded-lg p-2 border ${selectedQuoteId === option.id ? 'bg-purple-100 border-purple-400' : 'bg-white border-gray-200'}`}>
                                            <input type="radio" name={`quote-${bank.id}`} checked={selectedQuoteId === option.id} onChange={() => setSelectedQuoteId(option.id)} />
                                            <input data-testid={`bank-quote-count-${bank.id}-${index}`} type="number" min="1" step="1" value={option.count} onChange={event => updateQuote(option.id, 'count', event.target.value)} placeholder={`${index + 1}ª opção: parcelas`} className="w-full p-2 border rounded-lg bg-white text-[10px]" />
                                            <input data-testid={`bank-quote-amount-${bank.id}-${index}`} type="number" min="0" step="0.01" value={option.amount} onChange={event => updateQuote(option.id, 'amount', event.target.value)} placeholder="Valor cotado (R$)" className="w-full p-2 border rounded-lg bg-white text-[10px]" />
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={() => setQuoteOptions(options => [...options, { id: generateId(), count: '', amount: '' }])} className="mt-2 text-[10px] font-bold text-purple-700">
                                    + Adicionar outra cotação
                                </button>

                                <div className="bg-white rounded-xl border border-purple-200 p-3 mt-3 text-[11px] space-y-1">
                                    <div className="flex justify-between"><span>Fundo disponível</span><b>{formatMoney(Math.max(0, sourceSummary.interestReserve))}</b></div>
                                    <div className="flex justify-between"><span>Parcela mensal</span><b>- {formatMoney(installmentAmount)}</b></div>
                                    <div className="flex justify-between text-blue-700"><span>Disponível para antecipar</span><b>{formatMoney(settlement.reserveForAmortization + settlement.reserveCarryover)}</b></div>
                                    <div className="flex justify-between"><span>Valor da cotação</span><b>- {formatMoney(selectedQuoteAmount)}</b></div>
                                    <div className="flex justify-between text-purple-700"><span>Parcelas finais propostas</span><b>{formatInstallmentNumbers(proposedFinalNumbers)}</b></div>
                                    {selectedQuoteAmount > 0 && settlement.reserveCarryover > 0 && <div className="flex justify-between text-green-700"><span>Sobra para o próximo mês</span><b>{formatMoney(settlement.reserveCarryover)}</b></div>}
                                    {settlement.ownCapitalRequired > 0 && <div className="flex justify-between text-red-700"><span>Complemento necessário</span><b>{formatMoney(settlement.ownCapitalRequired)}</b></div>}
                                </div>

                                {settlement.ownCapitalRequired > 0 && (
                                    <div className="mt-3">
                                        <label className="block text-[10px] text-gray-500 mb-1">Origem do complemento</label>
                                        <select value={complementSourceId} onChange={event => setComplementSourceId(event.target.value)} className="w-full p-2.5 border rounded-lg bg-white text-xs">
                                            {ownSources.map(source => (
                                                <option key={source.id} value={source.id}>{source.name} ({formatMoney(getCapitalBalance(source.id))})</option>
                                            ))}
                                        </select>
                                        {FinanceEngine.toCents(complementBalance) < FinanceEngine.toCents(settlement.ownCapitalRequired) && (
                                            <p className="text-[10px] text-red-600 font-bold mt-1">Adicione saldo a esta origem antes de confirmar.</p>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-2 mt-4">
                                    <button type="button" onClick={resetMonthlyForm} className="flex-1 py-2 bg-white rounded-lg text-xs font-bold border">Cancelar</button>
                                    <button data-testid={`bank-monthly-submit-${bank.id}`} type="submit" className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold">Confirmar operação</button>
                                </div>
                            </form>
                        )}

                        {showBalanceForm && (
                            <form onSubmit={handleOfficialBalance} className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 animate-fade-in">
                                <h4 className="font-bold text-blue-800 text-sm mb-3">Saldo informado pelo banco</h4>
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <input type="date" value={balanceDate} onChange={event => setBalanceDate(event.target.value)} required className="p-2 border rounded-lg bg-white text-xs" />
                                    <input type="number" min="0" step="0.01" value={officialBalance} onChange={event => setOfficialBalance(event.target.value)} required placeholder="Dívida para liquidação" className="p-2 border rounded-lg bg-white text-xs" />
                                </div>
                                <input type="number" min="0" step="0.01" value={officialNominal} onChange={event => setOfficialNominal(event.target.value)} placeholder="Total nominal restante (opcional)" className="w-full p-2 border rounded-lg bg-white text-xs mb-2" />
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" min="1" step="1" value={remainingStart} onChange={event => setRemainingStart(event.target.value)} placeholder="Primeira parcela restante" className="p-2 border rounded-lg bg-white text-xs" />
                                    <input type="number" min="1" step="1" value={remainingEnd} onChange={event => setRemainingEnd(event.target.value)} placeholder="Última parcela restante" className="p-2 border rounded-lg bg-white text-xs" />
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button type="button" onClick={() => setShowBalanceForm(false)} className="flex-1 py-2 bg-white rounded-lg text-xs font-bold border">Cancelar</button>
                                    <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Salvar saldo</button>
                                </div>
                            </form>
                        )}

                        {history.length > 0 && (
                            <details className="mt-4 border-t border-gray-100 pt-3">
                                <summary className="cursor-pointer text-xs font-bold text-gray-500">Histórico bancário ({history.length})</summary>
                                <div className="space-y-2 mt-3">
                                    {history.map(payment => {
                                        const numbers = FinanceEngine.getPaymentInstallmentNumbers(payment, bank.totalInstallments);
                                        return (
                                            <div key={payment.id} className="bg-gray-50 rounded-lg p-2 text-[10px] text-gray-600">
                                                <div className="flex justify-between gap-2">
                                                    <b>{payment.type === 'installment' ? `Parcela ${numbers[0] || payment.installmentNumber || '?'}` : `Antecipação ${formatInstallmentNumbers(numbers)}`}</b>
                                                    <b>{formatMoney(payment.amount)}</b>
                                                </div>
                                                <div className="flex justify-between gap-2 mt-1 text-gray-400">
                                                    <span>{formatDate(payment.date)}</span>
                                                    <span>{payment.status === FinanceEngine.BANK_PAYMENT_STATUS.WITHHELD_PENDING_BANK ? 'Em folha' : 'Confirmado'}</span>
                                                </div>
                                                <button data-testid={`bank-operation-remove-${payment.id}`} type="button" onClick={() => removeBankOperation(payment)} className="mt-2 text-[9px] font-bold text-red-500">
                                                    Desfazer operação completa
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </details>
                        )}
                    </div>
                );
            };
