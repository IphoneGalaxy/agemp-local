# Finanças Pro — Motor Financeiro V3 e Planejamento

## Objetivo

Aplicativo local para controlar capital próprio, capital bancário, empréstimos a clientes, recebimentos mensais, quitação antecipada de contratos bancários e projeções financeiras auditáveis. Os dados ficam no `localStorage` e podem ser exportados ou restaurados por arquivo.

## Atualização V3 — 08/08/2026

- [x] Nova aba exclusiva **Planejamento**, sem alterar o fluxo das telas operacionais existentes
- [x] Visão geral responsiva com indicadores confirmados, recalculados e estimados
- [x] Projeção individual dos juros de cada empréstimo e marco de 100% do principal
- [x] Empréstimos quitados interrompem a projeção automaticamente
- [x] Projeção da 99Pay com parcelas fixas, complemento próprio e quatro marcos financeiros
- [x] Projeção do Santander pelo saldo oficial, taxa contratual e antecipação das últimas parcelas
- [x] Parcela nominal separada do valor presente no demonstrativo Santander
- [x] Importação do PDF continua como rascunho: movimentações detectadas exigem revisão manual
- [x] Pagamentos de juros de vários meses e valores não identificados têm classificações próprias
- [x] Valores não identificados não alteram juros nem principal até revisão
- [x] Linha do tempo financeira mensal com realizado e estimado identificados
- [x] Exportação Excel configurável por cliente, banco, período, conteúdo e inclusão de projeções
- [x] Design system da UI UX Pro Max integrado e documentado em `design-system/agemp-local/`
- [x] Migração idempotente para `schemaVersion: 3` com backup de segurança local
- [x] Testes unitários, teste visual responsivo e download/leitura real do arquivo Excel

### Valores de referência validados

| Operação | Resultado projetado |
|---|---:|
| Santander — total final pago | R$ 12.677,71 |
| Santander — custo financeiro | R$ 1.177,71 |
| Santander — economia nominal | R$ 5.772,96 |
| Santander — quitação | Fevereiro de 2027 |
| Santander — operação positiva | Março de 2027 |
| 99Pay — total final pago | R$ 5.495,25 |
| 99Pay — complemento próprio | R$ 2.495,25 |
| 99Pay — quitação | Novembro de 2026 |

Os centavos do Santander são recalculados mês a mês sobre o saldo oficial de R$ 8.472,78 com taxa contratual de 1,5268% a.m.; por isso o resultado pode diferir em R$ 0,01 de uma simulação que arredonde apenas no final.

## Histórico V2

Implementação concluída na branch `fix/motor-financeiro-v2` e incorporada à `main` pelo PR #1.
Versão publicada: GitHub Pages em `https://iphonegalaxy.github.io/agemp-local/`.

### Estado em 04/08/2026

- O site público responde normalmente e contém o motor financeiro V2.
- A `main` publicada corresponde ao código revisado da branch de correção.
- Os testes automatizados do motor passam (17 testes).
- A validação estrutural do backup corrigido foi concluída.
- O backup corrigido mantém os juros de Leal e Mello como histórico reconciliado, separado do extrato bancário.

## Ordem de execução

O trabalho começou pelo núcleo mais difícil, pois todas as telas e migrações dependem dele.

### 1. Motor e migração

- [x] Motor financeiro isolado em `js/finance-engine.js`
- [x] Dinheiro calculado em centavos inteiros
- [x] Migração idempotente para `schemaVersion: 2`
- [x] Registros antigos sem origem vinculados ao Capital Próprio padrão
- [x] Registros que apontam para uma origem antiga inexistente preservados como alertas
- [x] Cópia automática do `localStorage` antes da primeira migração
- [x] Bloqueio da gravação antes da hidratação inicial

### 2. Saldos e lucro

- [x] Painel e aba Origens usam o mesmo resumo por origem
- [x] Principal devolvido pelo cliente volta a ser capital disponível
- [x] Juros recebidos de clientes bancários ficam em uma reserva separada
- [x] Valor já utilizado no banco não reaparece no fundo
- [x] Amortização de principal não é tratada como lucro
- [x] Capital Próprio e capital bancário não são misturados

### 3. Contrato bancário

- [x] Valor recebido e valor financiado separados
- [x] Taxa contratual, CET, IOF, primeira data de vencimento e total nominal
- [x] Parcela normal confirmada, descontada em folha ou apenas programada
- [x] Confirmação posterior do repasse sem criar outro pagamento
- [x] Antecipação pelas parcelas finais exatas, sem dividir o valor pela parcela nominal
- [x] Valor pago, nominal eliminado e desconto de juros separados
- [x] Saldo oficial para liquidação com data do demonstrativo
- [x] Contagem do banco separada da contagem pessoal quando existe parcela em folha
- [x] Previsão de quitação baseada na última parcela realmente restante
- [x] Saldo oficial igual a zero reconhecido como contrato quitado

### 4. Fechamento mensal

- [x] Cadastro de duas ou mais cotações fornecidas pelo banco
- [x] Seleção da quantidade e do valor exato da opção escolhida
- [x] Seleção automática das últimas parcelas ainda abertas
- [x] Reserva usada primeiro na parcela mensal e depois na antecipação
- [x] Sobra menor mantida para o mês seguinte
- [x] Diferença maior retirada de uma origem de Capital Próprio escolhida
- [x] Bloqueio quando não existe saldo suficiente para o complemento
- [x] Pagamento e complemento vinculados na mesma operação
- [x] Desfazer atômico: remove o pagamento e estorna o complemento juntos
- [x] Bloqueio de parcela repetida na mesma competência
- [x] Bloqueio de nova antecipação enquanto o contrato atual tiver parcelas antigas não reconciliadas

### 5. Integridade e backup

- [x] Validação do arquivo antes de importar
- [x] Resumo de clientes, empréstimos, origens e registros bancários antes da confirmação
- [x] Backup automático dos dados atuais antes da restauração
- [x] Detecção não destrutiva de órfãos, possíveis duplicidades e divergências de origem
- [x] Juros históricos de julho e agosto (R$ 2.990,00) classificados como recebidos e já utilizados, sem alerta de órfão/duplicidade
- [x] Backup exportado como JSON canônico, com versão, origem e horário de exportação
- [x] Confirmação de parcela nominal mantida como ação manual, sem leitura automática de demonstrativos em fontes
- [x] Alerta visível no Painel, sem exclusão automática
- [x] Origem com qualquer histórico vinculado não pode ser removida
- [x] Capital Próprio principal não pode ser removido
- [x] Lançamento de caixa vinculado ao banco não pode ser apagado isoladamente
- [ ] Excluir registros antigos órfãos somente após confirmação expressa do usuário

### 6. Validação e publicação

- [x] Testes unitários do motor
- [x] Compilação de todos os componentes JSX
- [x] Teste de interface do fechamento mensal, confirmação, estorno e proteção de origem
- [x] Validação do backup original e do backup corrigido
- [x] Revisão final do diff
- [x] Publicação da branch remota e abertura do PR
- [x] Revisão e incorporação do PR na `main`
- [x] Publicação da versão atualizada no GitHub Pages
- [ ] Importar o novo backup reconciliado no domínio publicado, sem substituir o backup original

## Regras financeiras

### Caixa por origem

Para cada origem:

1. soma o capital inicial e as movimentações manuais;
2. subtrai os valores emprestados;
3. soma os recebimentos dos clientes;
4. subtrai apenas os pagamentos bancários realmente financiados por essa origem;
5. em origem bancária, separa o principal recuperado da reserva de juros.

Os juros de Leal (R$ 195/mês) e Mello (R$ 1.300/mês) totalizam R$ 1.495 por mês. Os R$ 2.990,00 de julho e agosto ficam registrados em `historicalInterestAllocations` como histórico já utilizado nas operações bancárias; não são saldo disponível e não são pagamentos bancários duplicados.

### Fechamento mensal bancário

```text
reserva do mês = juros bancários recebidos e ainda não utilizados
reserva após parcela = reserva do mês - parcela normal
complemento próprio = máx(0, cotação escolhida - reserva após parcela)
sobra = máx(0, reserva após parcela - cotação escolhida)
```

Exemplo de aceitação:

| Item | Valor |
|---|---:|
| Juros recebidos no mês | R$ 1.495,00 |
| Parcela normal | R$ 302,47 |
| Reserva prevista para antecipação | R$ 1.192,53 |
| Opção de 7 parcelas | R$ 1.109,27 |
| Sobra com a opção de 7 | R$ 83,26 |
| Opção de 8 parcelas | R$ 1.277,71 |
| Complemento próprio com a opção de 8 | R$ 85,18 |

A quantidade de parcelas nunca é estimada por `valor ÷ parcela nominal`. O banco fornece a quantidade e o valor descontado; o aplicativo registra exatamente essa cotação e associa os números das últimas parcelas ainda abertas.

## Estrutura

```text
index.html
assets/css/style.css
js/
  finance-engine.js
  projection-engine.js
  report-engine.js
  excel-report-exporter.js
  utils.js
  icons.js
  app.js
  main.js
  components/
    BankSummary.js
    Dashboard.js
    SourcesList.js
    ClientsList.js
    ClientView.js
    PlanningView.js
tests/
  finance-engine.test.js
  projection-engine.test.js
docs/
  plan.md
```

## Verificação local

```bash
node --test tests/*.test.js
python -m http.server 8080
```

O site continua estático e compatível com GitHub Pages. O `localStorage` pertence ao domínio publicado. Portanto, a publicação do código já foi concluída, mas a homologação dos dados reais deve ser feita importando o backup corrigido no site e conferindo os indicadores antes de considerar o histórico definitivamente aprovado.
