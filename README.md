# Base de Controle de Almoxarifado (JavaScript)

Projeto simples em Node.js (sem dependências externas) para servir como base de um sistema de almoxarifado com persistência local em arquivo JSON.

## Como rodar

```bash
npm start
```

Servidor padrão: `http://localhost:3000`.

## Interface web (HTML + CSS nativos)

A aplicação possui interface web em HTML/CSS puro com:

- Cadastro de tipos de unidade e uso por seleção no cadastro de produtos
- Cadastro de produtos com **preço de compra**
- Registro de movimentações com **data de movimentação**
- Painel com **análise de consumo e gasto estimado**

## Persistência interna

Os dados são salvos automaticamente em `data/db.json`.

Estrutura atual:

```json
{
  "products": [],
  "movements": [],
  "units": []
}
```

## Endpoints

- `GET /api` lista rotas da API
- `GET /units` lista tipos de unidade
- `POST /units` cria tipo de unidade `{ name, code }`
- `GET /products` lista produtos
- `POST /products` cria produto `{ name, unit, minStock, purchasePrice }`
- `PATCH /products/:id` atualiza produto
- `GET /movements` lista movimentações
- `POST /movements` registra movimentação `{ productId, type, quantity, reason, date }`
- `GET /report/low-stock` produtos em baixo estoque
- `GET /report/analysis` análise de consumo e gasto
