# Base de Controle de Almoxarifado (JavaScript)

Projeto simples em Node.js (sem dependências externas) para servir como base de um sistema de almoxarifado com persistência local em arquivo JSON.

## Como rodar

```bash
npm start
```

Servidor padrão: `http://localhost:3000`.

## Persistência interna

Os dados são salvos automaticamente em:

- `data/db.json`

Estrutura do banco:

```json
{
  "products": [],
  "movements": []
}
```

## Endpoints

### 1) Criar produto

`POST /products`

Body:

```json
{
  "name": "Parafuso 8mm",
  "unit": "UN",
  "minStock": 100
}
```

### 2) Listar produtos

`GET /products`

### 3) Atualizar metadados do produto

`PATCH /products/:id`

Body (opcional):

```json
{
  "name": "Parafuso 8mm zincado",
  "unit": "UN",
  "minStock": 120
}
```

### 4) Registrar entrada/saída

`POST /movements`

Body:

```json
{
  "productId": "prd_xxx",
  "type": "IN",
  "quantity": 50,
  "reason": "Compra fornecedor A"
}
```

- `type`: `IN` para entrada, `OUT` para saída.
- O sistema bloqueia saída com estoque insuficiente.

### 5) Listar movimentações

`GET /movements`

### 6) Relatório de baixo estoque

`GET /report/low-stock`

Retorna produtos com `stock <= minStock`.

## Exemplo rápido com curl

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Luva","unit":"PAR","minStock":20}'

curl -X POST http://localhost:3000/movements \
  -H "Content-Type: application/json" \
  -d '{"productId":"<ID_DO_PRODUTO>","type":"IN","quantity":100,"reason":"Entrada inicial"}'

curl http://localhost:3000/report/low-stock
```
