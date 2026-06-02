# Finanças Pro — Plano do Projeto

## 1. Visão do Produto

**Finanças Pro** é um aplicativo de controle financeiro para gestão de empréstimos pessoais. Permite gerenciar **capital próprio** e **capital de empréstimos bancários**, cadastrar clientes, registrar empréstimos com juros personalizados, controlar pagamentos com amortização automática, acompanhar pendências mensais, gerenciar passivos bancários (parcelas, amortização, projeção de quitação), calcular **lucro real vs capital comprometido** e usar uma **calculadora de taxa sugerida** para empréstimos financiados por bancos. Totalmente offline (localStorage), sem backend, funciona em qualquer navegador (desktop e mobile).

## 2. Stack

| Camada | Tecnologia |
|---|---|
| HTML | HTML5, semântico |
| Estilo | Tailwind CSS (CDN) + CSS customizado (`assets/css/style.css`) |
| UI | React 18 (CDN UMD) |
| Transpilação | Babel standalone (CDN, `type="text/babel"`) |
| Persistência | `localStorage` (chave `loanManagerData`) |
| Build | Nenhum — arquivos estáticos servidos via HTTP |
| Testes | Playwright (MCP), navegador Chromium |

## 3. Fases Implementadas

### Fase 1 — Fundação: Cadastro de Origens
**Objetivo:** Criar infraestrutura de fontes de capital (próprio e bancário).

**Entidades/Campos:**
- `capitalSources[]` — `id, type ('own'|'bank'), name`
- Bank: `receivedAmount, monthlyRate, totalInstallments, installmentValue, totalToPay, additionalFees, startDate, status, totalPaidToBank, paidInstallments, monthlyReserve, amortizationFund`

**DoD:**
- [x] Aba "Origens" na navegação
- [x] CRUD de origens (Próprio/Banco)
- [x] Migração automática: cria "Capital Próprio" para dados antigos
- [x] Persistência no localStorage
- [x] Backup/restore inclui `capitalSources`

### Fase 2 — Vinculação: Caixa com Origem
**Objetivo:** Vincular movimentações de caixa a origens de capital.

**Entidades/Campos:**
- `fundsTransactions[].sourceId` — vincula transação a uma origem

**DoD:**
- [x] Dropdown de origem no formulário "Movimentar Caixa"
- [x] Validação de retirada por origem (`getCapitalBalance`)
- [x] Histórico mostra nome da origem
- [x] `sourceId` salvo em novas transações
- [x] Transações antigas sem `sourceId` compatíveis

### Fase 3 — Empréstimos Vinculados
**Objetivo:** Vincular empréstimos a origens de capital.

**Entidades/Campos:**
- `loans[].sourceId` — vincula empréstimo a uma origem

**DoD:**
- [x] Dropdown de origem no formulário "Novo Empréstimo"
- [x] Validação: valor ≤ saldo da origem selecionada
- [x] Origem exibida no card do empréstimo
- [x] Origem incluída no extrato (Copiar)
- [x] Refatoração: 3 funções `get*Balance` → 1 `getCapitalBalance`

### Fase 4 — Gestão do Passivo Bancário
**Objetivo:** Rastrear pagamentos ao banco e projeção de quitação.

**Entidades/Campos:**
- `bankPayments[]` — `id, date, amount, sourceId, type ('installment'|'amortization')`

**DoD:**
- [x] Seção "🏦 Resumo Bancário" no Painel
- [x] Card com: pago/restante, parcelas (barra de progresso), previsão de quitação
- [x] Formulário "Pagar Banco" (Parcela / Amortização)
- [x] Formulário "Amortizar" (usa fundo acumulado)
- [x] `paidInstallments` e `totalPaidToBank` atualizados automaticamente
- [x] Backup/restore inclui `bankPayments`

### Fase 5 — Separação de Lucro Real
**Objetivo:** Diferenciar lucro real de capital comprometido com bancos.

**Entidades/Campos:**
- `globalStats.realProfit` — lucro de capital próprio + excedente após quitação bancária
- `globalStats.committedCapital` — juros de clientes reservados para pagar bancos
- `globalStats.bankDetails[]` — estatísticas por banco (juros gerados, amortização, dívida restante)
- `globalStats.ownInterestReceived` — juros de empréstimos de capital próprio

**DoD:**
- [x] Cards "🟢 Lucro Real" e "🟡 Capital Comprometido" no Painel
- [x] Cards só aparecem quando há origens bancárias
- [x] "Juros Gerados" no Resumo Bancário
- [x] Sem bancos → painel original preservado

### Fase 6 — Calculadora de Taxa
**Objetivo:** Sugerir taxa de juros para cobrir custo do banco + margem de lucro.

**DoD:**
- [x] Botão "💡 Sugerir taxa" no formulário de empréstimo (só para origem bancária)
- [x] Slider de lucro desejado: 5%, 10%, 13%, 15%, 20%
- [x] Cálculo: taxa = custo banco + lucro desejado
- [x] Preview: juros mensais estimados (R$)
- [x] Botão "Aplicar X%" preenche campo juros

## 4. Regras de Negócio Críticas

### 4.1 `getCapitalBalance(sourceId)`
Função unificada que calcula o saldo disponível de uma origem:
1. Soma transações do caixa vinculadas à origem (para `own`: inclui transações sem `sourceId` vinculadas ao `own-default`)
2. Subtrai empréstimos ativos vinculados à origem
3. Para bancos: adiciona `receivedAmount` como base
4. Retorna o saldo disponível para novos empréstimos/retiradas

### 4.2 Lucro Real vs Capital Comprometido (Fase 5)
- **Lucro Real** = amortização total + juros de capital próprio + juros bancários excedentes (após quitar o banco)
- **Capital Comprometido** = soma dos juros de clientes vinculados a bancos (limitado à dívida restante do banco)
- Sem bancos no sistema → painel original, sem alteração visual

### 4.3 Calculadora de Taxa (Fase 6)
- Aparece SOMENTE quando a origem selecionada é tipo `bank`
- `taxaSugerida = bank.monthlyRate + desiredProfit`
- `jurosMensaisEstimados = valorEmprestimo × taxaSugerida / 100`

## 5. Estrutura de Arquivos

### Atual (Parte A)
```
AGEmp/
├── index.html                  ← entry point
├── AGEmp.html                  ← original (preservado)
├── assets/css/style.css        ← CSS customizado
├── js/
│   ├── utils.js                ← formatMoney, formatDate, capitalize, generateId
│   ├── icons.js                ← IconEdit, IconDelete, IconBank
│   ├── app.js                  ← App() + todos os componentes (~1235 linhas)
│   ├── main.js                 ← ReactDOM.createRoot + render
│   └── components/             ← vazio
├── docs/
│   └── plan.md                 ← este arquivo
└── .playwright-mcp/            ← testes
```

### Alvo (após Parte B)
```
AGEmp/
├── index.html
├── AGEmp.html                  ← preservado
├── assets/css/style.css
├── js/
│   ├── utils.js
│   ├── icons.js
│   ├── components/
│   │   ├── SourcesList.js      ← aba Origens + formulário
│   │   ├── ClientsList.js      ← lista + criar cliente
│   │   ├── ClientView.js       ← detalhe cliente, empréstimos, calculadora
│   │   └── Dashboard.js        ← painel, caixa, resumo bancário, lucro real
│   ├── app.js                  ← App() ~reduzido: estado, effects, globalStats, shell
│   └── main.js
├── docs/plan.md
└── .playwright-mcp/
```

## 6. Mapa de data-testid

| data-testid | Local | Descrição |
|---|---|---|
| `nav-painel` | Navegação | Aba Painel |
| `nav-origens` | Navegação | Aba Origens |
| `nav-clientes` | Navegação | Aba Clientes |
| `dash-total-disponivel` | Painel | Card Total Disponível |
| `dash-total-na-rua` | Painel | Card Total na Rua |
| `dash-lucro-real` | Painel | Card Lucro Real (só com bancos) |
| `dash-capital-comprometido` | Painel | Card Capital Comprometido (só com bancos) |
| `dash-pendentes` | Painel | Indicador Falta Receber |
| `caixa-origem-select` | Painel | Dropdown origem do caixa |
| `caixa-valor-input` | Painel | Input valor do caixa |
| `caixa-btn-add` | Painel | Botão + Adicionar |
| `caixa-btn-remove` | Painel | Botão - Retirar |
| `banco-btn-pagar` | Resumo Bancário | Botão + Pagar Banco |
| `banco-btn-amortizar` | Resumo Bancário | Botão Amortizar |
| `banco-pay-date` | Resumo Bancário | Data pagamento banco |
| `banco-pay-amount` | Resumo Bancário | Valor pagamento banco |
| `banco-pay-btn-registrar` | Resumo Bancário | Botão Registrar pgto |
| `backup-btn-salvar` | Painel | Botão Salvar Backup |
| `backup-btn-importar` | Painel | Botão Importar |
| `clientes-input-nome` | Clientes | Input nome cliente |
| `clientes-btn-criar` | Clientes | Botão Criar cliente |
| `cliente-btn-emprestimo` | Visão Cliente | Botão + Empréstimo |
| `emprestimo-form-origem` | Visão Cliente | Dropdown origem empréstimo |
| `emprestimo-form-valor` | Visão Cliente | Input valor empréstimo |
| `emprestimo-form-juros` | Visão Cliente | Input juros empréstimo |
| `emprestimo-btn-salvar` | Visão Cliente | Botão Salvar empréstimo |
| `emprestimo-btn-sugerir-taxa` | Visão Cliente | Botão abrir calculadora |
| `ratecalc-profit-{v}` | Visão Cliente | Botões slider lucro (5,10,13,15,20) |
| `ratecalc-btn-aplicar` | Visão Cliente | Botão aplicar taxa |
| `origens-btn-nova` | Origens | Botão + Nova Origem |
| `origens-form-nome` | Origens | Input nome origem |
| `origens-form-tipo-proprio` | Origens | Botão tipo Próprio |
| `origens-form-tipo-banco` | Origens | Botão tipo Banco |

## 7. Como Rodar Localmente

```bash
cd AGEmp
python -m http.server 8080
# Abrir http://localhost:8080/index.html
```

### GitHub Pages
Compatível — basta publicar a pasta `AGEmp/`. Como não há backend, o backup é manual (exportar/importar arquivo `.txt`). O `localStorage` é vinculado ao domínio do GitHub Pages.

## 8. Backlog Opcional

- Extrair hooks para `js/hooks/` (useLocalStorage, useGlobalStats)
- Converter para PWA (manifest.json + service worker)
- Adicionar `git` e versionamento
- Migrar para React com build (Vite) para melhor performance
- Adicionar testes unitários (Jest + Testing Library)
- Internacionalização (i18n)
- Suporte a múltiplos usuários (Firebase)
- Gráficos de evolução financeira (Chart.js)
