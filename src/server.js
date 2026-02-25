const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, "..", "data", "db.json");
const PUBLIC_PATH = path.join(__dirname, "..", "public");

function ensureDatabase() {
  const dir = path.dirname(DATA_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_PATH)) {
    const initialDb = {
      products: [],
      movements: []
    };

    fs.writeFileSync(DATA_PATH, JSON.stringify(initialDb, null, 2));
  }
}

function readDb() {
  ensureDatabase();
  const content = fs.readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(content);
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

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function listRoutes(req, res) {
  return sendJson(res, 200, {
    service: "Controle de Almoxarifado",
    routes: {
      "GET /products": "Lista produtos",
      "POST /products": "Cria produto { name, unit, minStock }",
      "PATCH /products/:id": "Atualiza metadados do produto",
      "GET /movements": "Lista movimentações",
      "POST /movements": "Registra movimentação { productId, type, quantity, reason }",
      "GET /report/low-stock": "Lista produtos abaixo do estoque mínimo"
    }
  });
}

async function handleProducts(req, res, db, pathname) {
  if (req.method === "GET" && pathname === "/products") {
    return sendJson(res, 200, db.products);
  }

  if (req.method === "POST" && pathname === "/products") {
    const payload = await parseBody(req);
    const { name, unit = "UN", minStock = 0 } = payload;

    if (!name || Number(minStock) < 0) {
      return sendJson(res, 400, {
        message: "Informe um nome válido e estoque mínimo maior ou igual a zero."
      });
    }

    const product = {
      id: createId("prd"),
      name: String(name).trim(),
      unit: String(unit).trim().toUpperCase(),
      minStock: Number(minStock),
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
      product.unit = String(payload.unit).trim().toUpperCase();
    }

    if (payload.minStock !== undefined) {
      const parsed = Number(payload.minStock);
      if (Number.isNaN(parsed) || parsed < 0) {
        return sendJson(res, 400, { message: "Estoque mínimo inválido." });
      }
      product.minStock = parsed;
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
    const { productId, type, quantity, reason = "" } = payload;

    const parsedQuantity = Number(quantity);
    if (!productId || !["IN", "OUT"].includes(type) || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return sendJson(res, 400, {
        message: "Dados inválidos. Use { productId, type: IN|OUT, quantity > 0 }."
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
      at: new Date().toISOString()
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

function handleReports(req, res, db, pathname) {
  if (req.method === "GET" && pathname === "/report/low-stock") {
    const lowStock = db.products.filter((product) => product.stock <= product.minStock);
    return sendJson(res, 200, lowStock);
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
