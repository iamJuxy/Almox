const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, "..", "data", "db.json");
const PUBLIC_PATH = path.join(__dirname, "..", "public");

const DEFAULT_UNITS = [
  { id: "unt_un", name: "Unidade", code: "UN" },
  { id: "unt_kg", name: "Quilograma", code: "KG" },
  { id: "unt_lt", name: "Litro", code: "LT" },
  { id: "unt_cx", name: "Caixa", code: "CX" },
  { id: "unt_par", name: "Par", code: "PAR" }
];

function ensureDatabase() {
  const dir = path.dirname(DATA_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    const initialDb = {
      products: [],
      movements: [],
      units: DEFAULT_UNITS
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(initialDb, null, 2));
  }
}

function normalizeDb(db) {
  const normalized = { ...db };

  if (!Array.isArray(normalized.products)) {
    normalized.products = [];
  }

  if (!Array.isArray(normalized.movements)) {
    normalized.movements = [];
  }

  if (!Array.isArray(normalized.units)) {
    normalized.units = [...DEFAULT_UNITS];
  }

  return normalized;
}

function readDb() {
  ensureDatabase();
  const content = fs.readFileSync(DATA_PATH, "utf-8");
  const db = normalizeDb(JSON.parse(content));
  writeDb(db);
  return db;
}

function writeDb(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON inválido."));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath, contentType = "text/html; charset=utf-8") {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ message: "Arquivo não encontrado." }));
    return;
  }

  res.writeHead(200, { "Content-Type": contentType });
  res.end(fs.readFileSync(filePath));
}

function handleStatic(req, res, pathname) {
  if (req.method !== "GET") {
    return false;
  }

  if (pathname === "/") {
    sendFile(res, path.join(PUBLIC_PATH, "index.html"));
    return true;
  }

  if (pathname === "/styles.css") {
    sendFile(res, path.join(PUBLIC_PATH, "styles.css"), "text/css; charset=utf-8");
    return true;
  }

  if (pathname === "/app.js") {
    sendFile(res, path.join(PUBLIC_PATH, "app.js"), "application/javascript; charset=utf-8");
    return true;
  }

  return false;
}

function findProduct(db, productId) {
  return db.products.find((product) => product.id === productId);
}

function findUnitByCode(db, code) {
  return db.units.find((unit) => unit.code === String(code).trim().toUpperCase());
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function parseDate(dateString) {
  if (!dateString) {
    return new Date().toISOString().slice(0, 10);
  }

  const normalized = String(dateString).trim();
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function createMonthlyKey(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function listRoutes(req, res) {
  return sendJson(res, 200, {
    service: "Controle de Almoxarifado",
    routes: {
      "GET /products": "Lista produtos",
      "POST /products": "Cria produto { name, unit, minStock, purchasePrice }",
      "PATCH /products/:id": "Atualiza metadados do produto",
      "GET /units": "Lista tipos de unidade",
      "POST /units": "Cadastra tipo de unidade { name, code }",
      "GET /movements": "Lista movimentações",
      "POST /movements": "Registra movimentação { productId, type, quantity, reason, date(YYYY-MM-DD) }",
      "GET /report/low-stock": "Lista produtos abaixo do estoque mínimo",
      "GET /report/analysis": "Resumo de consumo e gasto"
    }
  });
}

async function handleUnits(req, res, db, pathname) {
  if (req.method === "GET" && pathname === "/units") {
    return sendJson(res, 200, db.units);
  }

  if (req.method === "POST" && pathname === "/units") {
    const payload = await parseBody(req);
    const code = String(payload.code || "").trim().toUpperCase();
    const name = String(payload.name || "").trim();

    if (!name || !code || code.length > 6) {
      return sendJson(res, 400, { message: "Informe nome e código da unidade (até 6 caracteres)." });
    }

    if (findUnitByCode(db, code)) {
      return sendJson(res, 409, { message: "Código de unidade já cadastrado." });
    }

    const unit = { id: createId("unt"), name, code };
    db.units.push(unit);
    writeDb(db);
    return sendJson(res, 201, unit);
  }

  return false;
}

async function handleProducts(req, res, db, pathname) {
  if (req.method === "GET" && pathname === "/products") {
    return sendJson(res, 200, db.products);
  }

  if (req.method === "POST" && pathname === "/products") {
    const payload = await parseBody(req);
    const { name, unit = "UN", minStock = 0, purchasePrice = 0 } = payload;

    const parsedMinStock = Number(minStock);
    const parsedPrice = Number(purchasePrice);
    const unitCode = String(unit).trim().toUpperCase();

    if (!name || Number.isNaN(parsedMinStock) || parsedMinStock < 0 || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return sendJson(res, 400, {
        message: "Informe nome, estoque mínimo válido e preço de compra maior ou igual a zero."
      });
    }

    if (!findUnitByCode(db, unitCode)) {
      return sendJson(res, 400, { message: "Unidade não cadastrada." });
    }

    const product = {
      id: createId("prd"),
      name: String(name).trim(),
      unit: unitCode,
      minStock: parsedMinStock,
      purchasePrice: parsedPrice,
      stock: 0,
      createdAt: new Date().toISOString()
    };

    db.products.push(product);
    writeDb(db);

    return sendJson(res, 201, product);
  }

  if (req.method === "PATCH" && pathname.startsWith("/products/")) {
    const id = pathname.split("/")[2];
    const payload = await parseBody(req);
    const product = findProduct(db, id);

    if (!product) {
      return sendJson(res, 404, { message: "Produto não encontrado." });
    }

    if (payload.name !== undefined) {
      product.name = String(payload.name).trim();
    }

    if (payload.unit !== undefined) {
      const unitCode = String(payload.unit).trim().toUpperCase();
      if (!findUnitByCode(db, unitCode)) {
        return sendJson(res, 400, { message: "Unidade não cadastrada." });
      }
      product.unit = unitCode;
    }

    if (payload.minStock !== undefined) {
      const parsed = Number(payload.minStock);
      if (Number.isNaN(parsed) || parsed < 0) {
        return sendJson(res, 400, { message: "Estoque mínimo inválido." });
      }
      product.minStock = parsed;
    }

    if (payload.purchasePrice !== undefined) {
      const parsedPrice = Number(payload.purchasePrice);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return sendJson(res, 400, { message: "Preço de compra inválido." });
      }
      product.purchasePrice = parsedPrice;
    }

    writeDb(db);
    return sendJson(res, 200, product);
  }

  return false;
}

async function handleMovements(req, res, db, pathname) {
  if (req.method === "GET" && pathname === "/movements") {
    return sendJson(res, 200, db.movements);
  }

  if (req.method === "POST" && pathname === "/movements") {
    const payload = await parseBody(req);
    const {
      productId,
      type,
      quantity,
      reason = "",
      date
    } = payload;

    const parsedQuantity = Number(quantity);
    const movementDate = parseDate(date);

    if (!productId || !["IN", "OUT"].includes(type) || Number.isNaN(parsedQuantity) || parsedQuantity <= 0 || !movementDate) {
      return sendJson(res, 400, {
        message: "Dados inválidos. Use { productId, type: IN|OUT, quantity > 0, date YYYY-MM-DD (opcional) }."
      });
    }

    const product = findProduct(db, productId);
    if (!product) {
      return sendJson(res, 404, { message: "Produto não encontrado." });
    }

    if (type === "OUT" && product.stock < parsedQuantity) {
      return sendJson(res, 409, {
        message: "Estoque insuficiente para saída.",
        currentStock: product.stock
      });
    }

    product.stock = type === "IN"
      ? product.stock + parsedQuantity
      : product.stock - parsedQuantity;

    const movement = {
      id: createId("mov"),
      productId,
      type,
      quantity: parsedQuantity,
      reason: String(reason),
      at: movementDate
    };

    db.movements.push(movement);
    writeDb(db);

    return sendJson(res, 201, {
      movement,
      stockAfter: product.stock
    });
  }

  return false;
}

function buildAnalysis(db) {
  const monthly = {};
  let totalConsumed = 0;
  let totalSpent = 0;

  db.movements.forEach((movement) => {
    const product = findProduct(db, movement.productId);
    const date = new Date(movement.at);
    const key = createMonthlyKey(date);

    if (!monthly[key]) {
      monthly[key] = {
        month: key,
        consumedQuantity: 0,
        spentValue: 0
      };
    }

    if (movement.type === "OUT") {
      const spent = movement.quantity * Number(product?.purchasePrice || 0);
      totalConsumed += movement.quantity;
      totalSpent += spent;
      monthly[key].consumedQuantity += movement.quantity;
      monthly[key].spentValue += spent;
    }
  });

  const monthlyList = Object.values(monthly)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return {
    summary: {
      totalConsumed,
      totalSpent: Number(totalSpent.toFixed(2))
    },
    monthly: monthlyList
  };
}

function handleReports(req, res, db, pathname) {
  if (req.method === "GET" && pathname === "/report/low-stock") {
    const lowStock = db.products.filter((product) => product.stock <= product.minStock);
    return sendJson(res, 200, lowStock);
  }

  if (req.method === "GET" && pathname === "/report/analysis") {
    return sendJson(res, 200, buildAnalysis(db));
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    const db = readDb();

    const staticResult = handleStatic(req, res, pathname);
    if (staticResult !== false) {
      return;
    }

    if (req.method === "GET" && pathname === "/api") {
      return listRoutes(req, res);
    }

    const unitsResult = await handleUnits(req, res, db, pathname);
    if (unitsResult !== false) {
      return;
    }

    const productsResult = await handleProducts(req, res, db, pathname);
    if (productsResult !== false) {
      return;
    }

    const movementsResult = await handleMovements(req, res, db, pathname);
    if (movementsResult !== false) {
      return;
    }

    const reportResult = handleReports(req, res, db, pathname);
    if (reportResult !== false) {
      return;
    }

    sendJson(res, 404, { message: "Rota não encontrada." });
  } catch (error) {
    sendJson(res, 500, {
      message: "Erro interno no servidor.",
      error: error.message
    });
  }
});

server.listen(PORT, () => {
  ensureDatabase();
  // eslint-disable-next-line no-console
  console.log(`Servidor de almoxarifado rodando em http://localhost:${PORT}`);
});
