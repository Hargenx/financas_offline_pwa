# Finanças Offline (PWA) — **Alpha**

Aplicativo **offline-first** para controle de finanças pessoais, com foco em **praticidade**, **velocidade** e **segurança** (dados ficam no dispositivo).  
Projeto **em estágio Alpha**, desenvolvido em **1 dia**, exclusivamente para **uso particular**.

---

## ✨ Visão geral

O **Finanças Offline** é um app em formato **PWA (Progressive Web App)** que roda no navegador e pode ser “instalado” no computador ou celular, funcionando **sem internet**.  
A proposta é registrar receitas e despesas rapidamente (especialmente no celular), acompanhar o mês por competência e ter controle de:

- **Lançamentos do mês** (receitas, despesas, status pago/pendente)
- **Cartões** (fechamento, vencimento, cartões ativos/inativos)
- **Contas fixas** (recorrência por dia, método, categoria)
- **Categorias** (com modo de limpeza e proteção contra exclusão de categorias em uso)
- **Dashboard** com resumo e gráficos

> **Importante:** por ser um projeto **Alpha**, a interface e as regras de negócio ainda estão evoluindo, e mudanças no modelo de dados podem ocorrer.

---

## 🔒 Privacidade e segurança

- **Offline-first**: o app funciona sem internet.
- **Armazenamento local**: os dados ficam **no dispositivo** (ex.: IndexedDB via Dexie).
- Ideal para quem prefere manter informações financeiras **fora de serviços online**.

---

## ✅ Funcionalidades

### Lançamentos

- Registro rápido de **receita/despesa**
- Método: **cartão**, pix, boleto, transferência, dinheiro
- Status: **pago** / **pendente**
- Filtro por **competência (mês)**
- Edição e exclusão de lançamentos
- Suporte a parcelamento (conforme regras do projeto)

### Cartões

- Cadastro de cartões com:
  - dia de **fechamento**
  - dia de **vencimento**
  - **offset** (mês de vencimento)
- Ativar/Desativar cartão

### Contas fixas

- Cadastro de contas recorrentes com:
  - dia de **vencimento**
  - categoria
  - método (cartão ou banco/instituição)
  - valor e observações

### Categorias

- Cadastro de categorias por tipo (**despesa**, **receita**, **ambos**)
- “Modo limpeza” para remoção segura:
  - impede apagar categorias em uso
  - opção para listar/excluir categorias sem uso

### Dashboard

- Resumo do mês (receitas, despesas, saldo)
- Gráfico por categoria
- Totais por cartão

---

## 🧱 Tecnologias

- **React + TypeScript**
- **PWA** (instalável e offline)
- **IndexedDB** (persistência local)
- **Recharts** (gráficos)
- **date-fns** (datas)
- **Vite** (build/dev server)

---

## 🚀 Como rodar localmente

> Pré-requisito: **Node.js LTS** e **npm**.

```bash
npm install
npm run dev
```

Acesse a URL mostrada no terminal (geralmente `http://localhost:5173`).

### Build de produção

```bash
npm run build
npm run preview
```

## 📲 Instalar no celular / desktop (PWA)

1. Abra o app no navegador (Chrome/Edge recomendado)
2. No menu do navegador, escolha:

    **“Instalar app”** / **“Adicionar à tela inicial”**
3. Após instalado, ele abre como um aplicativo e funciona offline.

---

## 🗂️ Estrutura do projeto (alto nível)

- `src/pages/` — telas (Dashboard, Lançamentos, Config, etc.)
- `src/services/` — regras de negócio (parcelas, fixas, transações)
- `src/db/` — banco local (IndexedDB)
- `src/domain/` — tipos e constantes (instituições, tipos de pagamento)
- `src/ui/` — componentes de UI (Section, botões, inputs)

---

## ⚠️ Status do projeto

- **Alpha**
- Criado em **1 dia**, com foco em viabilizar o uso imediato e evoluir incrementalmente.
- Uso **particular** (não é um produto comercial e não possui SLA).

---

## 🧭 Roadmap (ideias)

- Exportação/importação de backup (JSON)
- Relatórios avançados por período e por método
- Melhorias de UX no modo mobile
- Metas (budget) por categoria
- Evolução dos gráficos (tendência mensal, comparativos)

---

## 📄 Licença

Este projeto foi desenvolvido para uso particular.
Este projeto está licenciado sob a **MIT License**.  
Veja o arquivo `LICENSE` para mais detalhes.

---

## 🙋 Observações

Se você estiver usando este repositório como referência, lembre-se que ele foi feito com foco em **praticidade e iteração rápida**, e por isso algumas partes ainda podem ser simplificadas/refatoradas ao longo do tempo.
