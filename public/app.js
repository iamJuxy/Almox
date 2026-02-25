const productForm = document.getElementById('productForm');
const movementForm = document.getElementById('movementForm');
const productsTableBody = document.getElementById('productsTableBody');
const movementsList = document.getElementById('movementsList');
const movementProduct = document.getElementById('movementProduct');
const feedback = document.getElementById('feedback');

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.background = isError ? '#fee2e2' : '#e8f0ff';
  feedback.style.color = isError ? '#991b1b' : '#1d4ed8';
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

function renderProducts(products) {
  productsTableBody.innerHTML = '';
  movementProduct.innerHTML = '';

  products.forEach((product) => {
    const low = product.stock <= product.minStock;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.unit}</td>
      <td>${product.minStock}</td>
      <td>${product.stock}</td>
      <td class="${low ? 'status-alert' : 'status-ok'}">${low ? 'Baixo' : 'OK'}</td>
    `;
    productsTableBody.appendChild(row);

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
    .reverse()
    .slice(0, 8)
    .forEach((movement) => {
      const item = document.createElement('li');
      const date = new Date(movement.at).toLocaleString('pt-BR');
      item.textContent = `${movement.type === 'IN' ? 'Entrada' : 'Saída'} · ${movement.quantity} · ${date} · ${movement.reason || 'Sem motivo'}`;
      movementsList.appendChild(item);
    });
}

async function refreshAll() {
  try {
    const [products, movements] = await Promise.all([
      api('/products'),
      api('/movements')
    ]);

    renderProducts(products);
    renderMovements(movements);

    if (!products.length) {
      setFeedback('Nenhum produto cadastrado ainda.');
    }
  } catch (error) {
    setFeedback(error.message, true);
  }
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const payload = {
    name: formData.get('name'),
    unit: formData.get('unit'),
    minStock: Number(formData.get('minStock'))
  };

  try {
    await api('/products', { method: 'POST', body: JSON.stringify(payload) });
    productForm.reset();
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
    reason: formData.get('reason')
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

refreshAll();
