const unitForm = document.getElementById('unitForm');
const productForm = document.getElementById('productForm');
const movementForm = document.getElementById('movementForm');
const productsTableBody = document.getElementById('productsTableBody');
const movementsList = document.getElementById('movementsList');
const movementProduct = document.getElementById('movementProduct');
const productUnit = document.getElementById('productUnit');
const analysisChart = document.getElementById('analysisChart');
const totalConsumed = document.getElementById('totalConsumed');
const totalSpent = document.getElementById('totalSpent');
const feedback = document.getElementById('feedback');

let productsCache = [];
let unitsCache = [];

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.background = isError ? '#fee2e2' : '#e8f0ff';
  feedback.style.color = isError ? '#991b1b' : '#1d4ed8';
}

function brl(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('pt-BR');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Erro ao processar requisição.');
  }

  return data;
}

function renderUnits(units) {
  unitsCache = units;
  productUnit.innerHTML = '';

  units.forEach((unit) => {
    const option = document.createElement('option');
    option.value = unit.code;
    option.textContent = `${unit.code} - ${unit.name}`;
    productUnit.appendChild(option);
  });
}

function priorityScore(product) {
  if (product.stock <= product.minStock) {
    return 0;
  }

  return 1;
}

function renderProducts(products) {
  productsCache = products;
  productsTableBody.innerHTML = '';
  movementProduct.innerHTML = '';

  const sortedProducts = products
    .slice()
    .sort((a, b) => {
      const scoreDiff = priorityScore(a) - priorityScore(b);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const aGap = a.stock - a.minStock;
      const bGap = b.stock - b.minStock;
      return aGap - bGap;
    });

  sortedProducts.forEach((product) => {
    const low = product.stock <= product.minStock;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.unit}</td>
      <td>${product.minStock}</td>
      <td>${product.stock}</td>
      <td>${brl(product.purchasePrice)}</td>
      <td class="${low ? 'status-alert' : 'status-ok'}">${low ? 'Baixo' : 'OK'}</td>
    `;
    productsTableBody.appendChild(row);
  });

  products.forEach((product) => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = `${product.name} (${product.stock} ${product.unit})`;
    movementProduct.appendChild(option);
  });
}

function renderMovements(movements) {
  movementsList.innerHTML = '';

  movements
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8)
    .forEach((movement) => {
      const item = document.createElement('li');
      const product = productsCache.find((p) => p.id === movement.productId);
      item.textContent = `${movement.type === 'IN' ? 'Entrada' : 'Saída'} · ${product ? product.name : movement.productId} · ${movement.quantity} · ${formatDate(movement.at)} · ${movement.reason || 'Sem motivo'}`;
      movementsList.appendChild(item);
    });
}

function renderAnalysis(report) {
  totalConsumed.textContent = Number(report.summary.totalConsumed || 0).toLocaleString('pt-BR');
  totalSpent.textContent = brl(report.summary.totalSpent || 0);

  analysisChart.innerHTML = '';

  const maxValue = Math.max(1, ...report.monthly.map((item) => item.spentValue || 0));

  report.monthly.forEach((item) => {
    const wrap = document.createElement('div');
    wrap.className = 'bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(4, ((item.spentValue || 0) / maxValue) * 130)}px`;
    bar.title = `${item.month} · consumo ${item.consumedQuantity} · gasto ${brl(item.spentValue)}`;

    const value = document.createElement('div');
    value.className = 'bar-value';
    value.textContent = brl(item.spentValue);

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = item.month;

    wrap.append(value, bar, label);
    analysisChart.appendChild(wrap);
  });
}

async function refreshAll() {
  try {
    const [units, products, movements, analysis] = await Promise.all([
      api('/units'),
      api('/products'),
      api('/movements'),
      api('/report/analysis')
    ]);

    renderUnits(units);
    renderProducts(products);
    renderMovements(movements);
    renderAnalysis(analysis);

    if (!products.length) {
      setFeedback('Nenhum produto cadastrado ainda.');
    }
  } catch (error) {
    setFeedback(error.message, true);
  }
}

unitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(unitForm);
  const payload = {
    name: formData.get('name'),
    code: formData.get('code')
  };

  try {
    await api('/units', { method: 'POST', body: JSON.stringify(payload) });
    unitForm.reset();
    setFeedback('Unidade cadastrada com sucesso.');
    await refreshAll();
  } catch (error) {
    setFeedback(error.message, true);
  }
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const payload = {
    name: formData.get('name'),
    unit: formData.get('unit'),
    minStock: Number(formData.get('minStock')),
    purchasePrice: Number(formData.get('purchasePrice'))
  };

  try {
    await api('/products', { method: 'POST', body: JSON.stringify(payload) });
    productForm.reset();
    if (unitsCache[0]) {
      productUnit.value = unitsCache[0].code;
    }
    setFeedback('Produto cadastrado com sucesso.');
    await refreshAll();
  } catch (error) {
    setFeedback(error.message, true);
  }
});

movementForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!movementProduct.value) {
    setFeedback('Cadastre um produto antes de movimentar.', true);
    return;
  }

  const formData = new FormData(movementForm);
  const payload = {
    productId: formData.get('productId'),
    type: formData.get('type'),
    quantity: Number(formData.get('quantity')),
    reason: formData.get('reason'),
    date: formData.get('date') || undefined
  };

  try {
    await api('/movements', { method: 'POST', body: JSON.stringify(payload) });
    movementForm.reset();
    setFeedback('Movimentação registrada com sucesso.');
    await refreshAll();
  } catch (error) {
    setFeedback(error.message, true);
  }
});

document.getElementById('refreshProducts').addEventListener('click', refreshAll);
document.getElementById('refreshMovements').addEventListener('click', refreshAll);
document.getElementById('refreshAnalysis').addEventListener('click', refreshAll);

refreshAll();
