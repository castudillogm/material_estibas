import Papa from 'papaparse';

// Elementos del DOM
const urlStockInput = document.getElementById('url-stock');
const urlConsumoInput = document.getElementById('url-consumo');
const btnLoad = document.getElementById('btn-load');
const delegacionSelect = document.getElementById('delegacion-select');
const leadTimeInput = document.getElementById('lead-time');
const dashboard = document.getElementById('dashboard');
const loader = document.getElementById('loader');
const tableStockBody = document.querySelector('#table-stock tbody');
const tableSeguridadBody = document.querySelector('#table-seguridad tbody');
const configSection = document.getElementById('config-section');
const btnEditConfig = document.getElementById('btn-edit-config');

// Login Elements
const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const btnLogin = document.getElementById('btn-login');
const securityCodeInput = document.getElementById('security-code');
const loginError = document.getElementById('login-error');

// Estado de la aplicación
let stockData = [];
let consumoData = [];
let delegaciones = new Set();
let currentDelegacion = '';
let userMoqs = {}; // Para guardar los MOQs que ingrese el usuario por material

// Event Listeners
btnLoad.addEventListener('click', loadData);
delegacionSelect.addEventListener('change', (e) => {
  currentDelegacion = e.target.value;
  renderDashboard();
});
leadTimeInput.addEventListener('input', () => {
  renderDashboard();
});
tableSeguridadBody.addEventListener('change', (e) => {
  if (e.target.classList.contains('moq-input')) {
    const material = e.target.getAttribute('data-material');
    userMoqs[material] = parseInt(e.target.value) || 0;
    renderDashboard(); // Re-renderizar para actualizar los cálculos de frecuencia
  }
});
btnEditConfig.addEventListener('click', () => {
  configSection.classList.remove('hidden');
  dashboard.classList.add('hidden');
});

// Recuperar URLs guardadas si existen y revisar Login
window.addEventListener('DOMContentLoaded', () => {
  // Comprobar autenticación
  const isAuthenticated = sessionStorage.getItem('grupamar_auth') === 'true';
  if (isAuthenticated) {
    loginScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
  }

  const savedUrlStock = localStorage.getItem('grupamar_url_stock');
  const savedUrlConsumo = localStorage.getItem('grupamar_url_consumo');
  
  if (savedUrlStock) urlStockInput.value = savedUrlStock;
  if (savedUrlConsumo) urlConsumoInput.value = savedUrlConsumo;
  
  // Si ya hay URLs guardadas y está autenticado, cargamos los datos automáticamente
  if (savedUrlStock && savedUrlConsumo && isAuthenticated) {
    loadData();
  }
});

// Lógica de Login
btnLogin.addEventListener('click', () => {
  const code = securityCodeInput.value.trim().toLowerCase();
  if (code === 'grigru') {
    sessionStorage.setItem('grupamar_auth', 'true');
    loginError.classList.add('hidden');
    loginScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
    
    // Auto cargar datos si existen al loguearse
    if (urlStockInput.value && urlConsumoInput.value) {
      loadData();
    }
  } else {
    loginError.classList.remove('hidden');
  }
});

async function loadData() {
  const urlStock = urlStockInput.value.trim();
  const urlConsumo = urlConsumoInput.value.trim();

  if (!urlStock || !urlConsumo) {
    alert('Por favor, ingresa ambas URLs (Stock y Consumo).');
    return;
  }

  // Guardar en localStorage para futuras visitas
  localStorage.setItem('grupamar_url_stock', urlStock);
  localStorage.setItem('grupamar_url_consumo', urlConsumo);

  showLoader();

  try {
    const [stockRes, consumoRes] = await Promise.all([
      fetchCSV(urlStock),
      fetchCSV(urlConsumo)
    ]);

    stockData = stockRes;
    consumoData = consumoRes;

    // Extraer delegaciones únicas
    delegaciones.clear();
    stockData.forEach(row => {
      const col = getColName(row, ['Delegación', 'Delegacion']);
      if (col && row[col]) delegaciones.add(row[col].trim());
    });
    consumoData.forEach(row => {
      const col = getColName(row, ['Delegación', 'Delegacion']);
      if (col && row[col]) delegaciones.add(row[col].trim());
    });

    populateDelegaciones();
    
    configSection.classList.add('hidden');
    dashboard.classList.remove('hidden');
    hideLoader();

    // Seleccionar la primera por defecto si hay
    if (delegaciones.size > 0) {
      delegacionSelect.value = Array.from(delegaciones)[0];
      currentDelegacion = delegacionSelect.value;
      renderDashboard();
    }

  } catch (error) {
    console.error(error);
    alert('Error al cargar los datos. Verifica que las URLs sean correctas y estén publicadas como CSV.');
    hideLoader();
  }
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}

function populateDelegaciones() {
  // Limpiar select (manteniendo la opción por defecto)
  delegacionSelect.innerHTML = '<option value="">Selecciona una delegación...</option>';
  
  const delegacionesArr = Array.from(delegaciones).sort();
  delegacionesArr.forEach(del => {
    const option = document.createElement('option');
    option.value = del;
    option.textContent = del;
    delegacionSelect.appendChild(option);
  });
}

function renderDashboard() {
  if (!currentDelegacion) {
    tableStockBody.innerHTML = '<tr><td colspan="2">Selecciona una delegación</td></tr>';
    tableSeguridadBody.innerHTML = '<tr><td colspan="4">Selecciona una delegación</td></tr>';
    return;
  }

  renderStock();
  renderSeguridad();
}

function getColName(row, possibleNames) {
  const keys = Object.keys(row);
  for (let name of possibleNames) {
    const found = keys.find(k => k.trim().toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return null;
}

function renderStock() {
  const delegacionCol = getColName(stockData[0] || {}, ['Delegación', 'Delegacion']);
  const materialCol = getColName(stockData[0] || {}, ['Tipo Material', 'Material']);
  const stockCol = getColName(stockData[0] || {}, ['Stock Actual (Unidades)', 'Stock Actual', 'Stock', 'Unidades', 'Cantidad']);

  // Filtrar stock por delegación
  const filteredStock = stockData.filter(row => delegacionCol && row[delegacionCol] && row[delegacionCol].trim() === currentDelegacion);
  
  tableStockBody.innerHTML = '';

  if (filteredStock.length === 0) {
    tableStockBody.innerHTML = '<tr><td colspan="2">No hay datos de stock para esta delegación.</td></tr>';
    return;
  }

  filteredStock.forEach(row => {
    const tr = document.createElement('tr');
    const materialVal = materialCol ? row[materialCol] : '-';
    const stockVal = stockCol ? row[stockCol] : '0';
    tr.innerHTML = `
      <td>${materialVal || '-'}</td>
      <td><strong>${stockVal || '0'}</strong></td>
    `;
    tableStockBody.appendChild(tr);
  });
}

function renderSeguridad() {
  const leadTime = parseInt(leadTimeInput.value) || 0;
  
  const delegacionCol = getColName(consumoData[0] || {}, ['Delegación', 'Delegacion']);
  const materialCol = getColName(consumoData[0] || {}, ['Tipo Material', 'Material']);
  const cantidadCol = getColName(consumoData[0] || {}, ['Cantidad (Unidades)', 'Cantidad', 'Consumo']);
  const fechaCol = getColName(consumoData[0] || {}, ['Fecha', 'Date']);

  // Filtrar consumos por delegación
  const filteredConsumo = consumoData.filter(row => delegacionCol && row[delegacionCol] && row[delegacionCol].trim() === currentDelegacion);
  
  // Agrupar consumos por material
  const consumosPorMaterial = {};
  
    // Calcular el rango de fechas para el consumo promedio basado en días únicos
    const uniqueDates = new Set();
    
    filteredConsumo.forEach(row => {
      const material = materialCol && row[materialCol] ? row[materialCol] : 'Desconocido';
      const cantidad = cantidadCol ? parseFloat(row[cantidadCol]) : 0;
      const fechaStr = fechaCol ? row[fechaCol] : null;
      
      if (!consumosPorMaterial[material]) {
        consumosPorMaterial[material] = 0;
      }
      consumosPorMaterial[material] += cantidad || 0;
  
      if (fechaStr && fechaStr.trim() !== '') {
        uniqueDates.add(fechaStr.trim());
      }
    });

    let periodDays = uniqueDates.size;
    if (periodDays === 0) periodDays = 1; // Evitar división por cero si no hay fechas válidas

  tableSeguridadBody.innerHTML = '';

  const materials = Object.keys(consumosPorMaterial);
  
  if (materials.length === 0) {
    tableSeguridadBody.innerHTML = '<tr><td colspan="4">No hay datos de consumo para calcular stock de seguridad.</td></tr>';
    return;
  }

  const stockDelegacionCol = getColName(stockData[0] || {}, ['Delegación', 'Delegacion']);
  const stockMaterialCol = getColName(stockData[0] || {}, ['Tipo Material', 'Material']);
  const stockStockCol = getColName(stockData[0] || {}, ['Stock Actual (Unidades)', 'Stock Actual', 'Stock', 'Unidades']);
  const stockPedidoMinCol = getColName(stockData[0] || {}, ['Pedido Mínimo', 'Pedido Minimo', 'MOQ', 'Lote']);

  materials.forEach(material => {
    const consumoTotal = consumosPorMaterial[material];
    const consumoDiario = consumoTotal / periodDays;
    const stockSeguridad = Math.ceil(consumoDiario * leadTime);

    // Buscar stock actual para comparar
    const stockRow = stockData.find(row => 
      stockDelegacionCol && row[stockDelegacionCol] && row[stockDelegacionCol].trim() === currentDelegacion && 
      stockMaterialCol && row[stockMaterialCol] === material
    );
    const stockActual = stockRow && stockStockCol ? parseFloat(stockRow[stockStockCol] || 0) : 0;
    // Determinar MOQ (Prioridad: Usuario -> CSV -> 0)
    let pedidoMinimo = userMoqs[material] !== undefined ? userMoqs[material] : (stockRow && stockPedidoMinCol ? parseFloat(stockRow[stockPedidoMinCol] || 0) : 0);

    let estado = 'Óptimo';
    let estadoClass = 'status-ok';

    const limiteAlerta = stockSeguridad + Math.ceil(consumoDiario * leadTime);

    // El punto de pedido ("Solicitar") es cuando el stock llega (o baja) del stock de seguridad.
    if (stockActual <= stockSeguridad) {
      estado = 'Solicitar de Inmediato';
      estadoClass = 'status-danger';
    } 
    // La "Alerta" se activa si el stock está por encima del de seguridad, 
    // pero te queda menos margen que otro ciclo de Lead Time entero.
    else if (stockActual <= limiteAlerta) {
      estado = 'Alerta';
      estadoClass = 'status-warning';
    }

    // Calcular la frecuencia de pedido (cada cuántos días habrá que pedir ese MOQ)
    let frecuenciaStr = '-';
    if (pedidoMinimo > 0 && consumoDiario > 0) {
      const diasFrecuencia = Math.floor(pedidoMinimo / consumoDiario);
      frecuenciaStr = diasFrecuencia > 0 ? `cada ${diasFrecuencia} días` : 'Diario';
    } else if (pedidoMinimo > 0 && consumoDiario === 0) {
      frecuenciaStr = 'Sin consumo';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${material}</td>
      <td>${Math.ceil(consumoDiario)} / día</td>
      <td><strong>${stockSeguridad}</strong></td>
      <td class="${estadoClass}">${estado} (Actual: ${stockActual})</td>
      <td><input type="number" class="moq-input" data-material="${material}" value="${pedidoMinimo}" min="0" style="width: 80px; text-align: center;"></td>
      <td><strong>${frecuenciaStr}</strong></td>
    `;
    tableSeguridadBody.appendChild(tr);
  });
}

function showLoader() {
  loader.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

function hideLoader() {
  loader.classList.add('hidden');
}

// Inicializar con valores por defecto para test (Opcional, si el usuario quiere probar rápido)
// urlStockInput.value = 'URL_AQUI';
// urlConsumoInput.value = 'URL_AQUI';
