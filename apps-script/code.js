/***** ========================================================
 *  EMISOR DE NOTAS DE VENTA — BACKEND (Google Apps Script)
 *  ====================================================== *****/

/* ==================== CONFIGURACIÓN ==================== */
const CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: {
    CLIENTES: 'AR',
    PRODUCTOS: 'Lista Productos',
    STOCK: 'Stock_Teorico',
    NV_BASE: 'NV_Base'
  },
  LOGISTICO: {
    NETO_UNITARIO: 360,   // 360 neto por unidad
    IVA_PCT: 0.19         // 19% IVA sobre logístico
  },
  CORRELATIVO: {
    PROP_KEY: 'NV_COUNTER',
    PADDING: 6,
    PREFIX: ''
  }
};

/* ============== CONTROL DE PERMISOS POR USUARIO/MÓDULO ============== */

// Módulos válidos (coinciden con los nombres de los archivos .html)
const ACCESS_MODULOS = [
  'home','emisor_nv','aprobador','finanzas','facturador','comercial','despacho','oc_supermercados',
  'modificador_nv' // ← SOLO listado como módulo válido
];

// Permisos por correo. '*' = acceso total a todos los módulos
const ACCESS_PERMISOS = {
  // Admin total
  'vdacruiz@gmail.com': ['*'],      // ← AGREGAR ESTA LÍNEA
  'cruizbusta@gmail.com': ['*'],

  // Accesos habituales
  'vdakgonzalez@gmail.com':   ['home','emisor_nv','aprobador','finanzas','facturador','despacho','deuda_clientes','oc_supermercados','stock'],
  'vdaimontenegro@gmail.com': ['home','emisor_nv','aprobador','finanzas','facturador','despacho','deuda_clientes','oc_supermercados'],
  'vdamsanchez@gmail.com':    ['home','emisor_nv','aprobador','comercial','finanzas','facturador','deuda_clientes','despacho','op_licores','stock','oc_supermercados'],
  'vdardeaguirre@gmail.com':  ['home','emisor_nv','aprobador','comercial','finanzas','facturador','deuda_clientes','despacho','op_licores','stock','oc_supermercados'],
  'vdacnavas@gmail.com':      ['home','emisor_nv','aprobador','comercial','finanzas','facturador','deuda_clientes','despacho','op_licores','stock','oc_supermercados'],
  'vdasdeaguirre@gmail.com':  ['home','emisor_nv','comercial','despacho','deuda_clientes','oc_supermercados'],
  'vdajmontenegro@gmail.com': ['home','emisor_nv','despacho','deuda_clientes','oc_supermercados'],
  'vdacossa@gmail.com':       ['home','emisor_nv','despacho','oc_supermercados','deuda_clientes'],
  'vdaacallejas@gmail.com':   ['home','despacho','oc_supermercados'],
  'vdadhernandez@gmail.com':  ['home','emisor_nv','despacho','oc_supermercados','deuda_clientes'],
  'vdacarce@gmail.com':       ['home','facturador','despacho','oc_supermercados','stock'], // Cecilia

  // Villa Alegre
  'vdaacallejas@gmail.com':   ['home','despacho']
};

// Editores del módulo "despacho" (pueden editar; el resto solo ve)
const ACCESS_DESPACHO_EDITORES = [
  'vdakgonzalez@gmail.com',       // Cecilia
  'vdaacallejas@gmail.com',       // Villa Alegre
  'cruizbusta@gmail.com'          // Tú
];

/* ------------ Chequeos de permisos ---------------------------------- */
function _tienePermiso_(email, modulo) {
  const lista = ACCESS_PERMISOS[email];
  if (!lista) return false;
  if (lista.includes('*')) return true;
  return lista.includes(modulo);
}

function _isDespachoEditor_(email){
  const em = String(email||'').toLowerCase();
  return ACCESS_DESPACHO_EDITORES.map(x=>x.toLowerCase()).includes(em) ||
         (ACCESS_PERMISOS[em] && ACCESS_PERMISOS[em].includes('*'));
}

/* Exponer al front del módulo despacho */
function apiIsDespachoEditor(){
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  return _isDespachoEditor_(email);
}

/* Helpers de debug (opcional) */
function apiDebugRoles(){
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  return {
    email,
    permisos: ACCESS_PERMISOS[email] || [],
    isEditorDespacho: _isDespachoEditor_(email),
    puedeVerDespacho: _tienePermiso_(email, 'despacho')
  };
}

/***** ROLES — Despacho (forzado editor para cruizbusta) *****/
function apiDespGetRole() {
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();

  // Toma los permisos/editores sin importar el nombre de la constante
  const permisos = (typeof ACCESS_PERMISOS !== 'undefined' ? ACCESS_PERMISOS :
                   (typeof PERMISOS !== 'undefined' ? PERMISOS : {}));
  const editoresAll = (typeof ACCESS_DESPACHO_EDITORES !== 'undefined' ? ACCESS_DESPACHO_EDITORES :
                      (typeof DESPACHO_EDITORES !== 'undefined' ? DESPACHO_EDITORES : []))
                      .map(s => String(s||'').toLowerCase());

  const lista = (permisos[email] || []).map(s => String(s||'').toLowerCase());
  const wildcard = lista.includes('*');

  // <<< TU USUARIO SIEMPRE EDITOR >>>
  const isYou = email === 'cruizbusta@gmail.com';

  // Editores por origen
  const edSantiago = ['vdacarce@gmail.com'];      // CD Santiago
  const edVilla    = ['vdaacallejas@gmail.com'];  // Villa Alegre

  const canEnvioProveedor = isYou || wildcard || editoresAll.includes(email) || edSantiago.includes(email);
  const canDespachoVA     = isYou || wildcard || editoresAll.includes(email) || edVilla.includes(email);

  return { email, canEnvioProveedor, canDespachoVA };
}

/* ==================== UTILIDADES ==================== */
function _getSheet(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function _formatNumber(value){
  if (typeof value === 'number') return value;
  const s = String(value || '')
    .replace(/\s+/g,'')
    .replace(/\./g,'')
    .replace(/,/g,'.');
  const num = parseFloat(s.replace(/[^\d.\-]/g,''));
  return isNaN(num) ? 0 : num;
}
function _formatCLP(n){ return Math.round(_formatNumber(n)); }
function _normalizeText(text){ return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function _findColumn(headers, names){
  const map = {}; headers.forEach((h,i)=> map[_normalizeText(h)]=i);
  for (const name of names){ const k=_normalizeText(name); if(map[k]!==undefined) return map[k]; }
  return -1;
}
function _asPercent(v, fallback){
  const x = (v === undefined || v === null) ? fallback : _formatNumber(v);
  return x > 1 ? x/100 : x;
}

/* ==================== CORRELATIVO ==================== */
function _getNextNV(){
  const lock = LockService.getScriptLock();
  try{
    lock.waitLock(30000);
    const props = PropertiesService.getScriptProperties();
    const current = Number(props.getProperty(CONFIG.CORRELATIVO.PROP_KEY) || 0);
    const next = current + 1;
    props.setProperty(CONFIG.CORRELATIVO.PROP_KEY, String(next));
    return CONFIG.CORRELATIVO.PREFIX + String(next).padStart(CONFIG.CORRELATIVO.PADDING, '0');
  } finally { lock.releaseLock(); }
}
function _previewNextNV(){
  const props = PropertiesService.getScriptProperties();
  const current = Number(props.getProperty(CONFIG.CORRELATIVO.PROP_KEY) || 0);
  const next = current + 1;
  return CONFIG.CORRELATIVO.PREFIX + String(next).padStart(CONFIG.CORRELATIVO.PADDING, '0');
}

/* ==================== API: CLIENTES ==================== */
function apiGetClientes(query='', limit=20){
  try{
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.CLIENTES);
    if(!sh) return [];
    const data = sh.getDataRange().getValues();
    if(data.length<2) return [];

    const headers = data[0];
    const colRut = _findColumn(headers,['RUT','Rut','rut']);
    const colDV = _findColumn(headers,['DV','dv']);
    const colNombre = _findColumn(headers,['Nombre Cliente','Nombre','Cliente']);
    const colDireccion = _findColumn(headers,['Direccion','Dirección']);
    const colComuna = _findColumn(headers,['Comuna']);
    const colCiudad = _findColumn(headers,['Ciudad']);
    const colVendedor = _findColumn(headers,['Atendido por','Vendedor','Ejecutivo']);
    const colFormaPago = _findColumn(headers,['Forma Pago','Forma de Pago']);
    const colTelefono = _findColumn(headers,['Teléfono','Telefono']);

    const q = _normalizeText(query);
    const out = [];
    for (let i=1; i<data.length && out.length<limit; i++){
      const row = data[i];
      const nombre = String(row[colNombre]||'');
      if (query && !_normalizeText(nombre).includes(q)) continue;

      const rut = String(row[colRut]||'');
      const dv = String(row[colDV]||'').toUpperCase();
      const rutFmt = rut ? rut.replace(/\B(?=(\d{3})+(?!\d))/g,'.') + (dv?'-'+dv:'') : '';

      out.push({
        nombre,
        rut: rutFmt,
        rutSinFormato: rut,
        dv,
        direccion: String(row[colDireccion]||''),
        comuna: String(row[colComuna]||''),
        ciudad: String(row[colCiudad]||''),
        vendedor: String(row[colVendedor]||''),
        formaPago: String(row[colFormaPago]||''),
        telefono: String(row[colTelefono]||'')
      });
    }
    return out;
  }catch(err){ console.error(err); return []; }
}

/* ==================== API: PRODUCTOS ==================== */
function apiGetProductos(query='', limit=50){
  try{
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.PRODUCTOS);
    if(!sh) return [];
    const data = sh.getDataRange().getValues();
    if(data.length<2) return [];

    const headers = data[0];
    const q = _normalizeText(query);
    const out = [];

    const colMinNeto = _findColumn(headers, [
      'Precio Min Neto','Precio Mín Neto','Precio Minimo Neto','Precio Mínimo Neto',
      'Min Neto','Min Neto U','Min Neto Unidad','Precio Min Neto U','P.Min Neto'
    ]);
    const colCategoria = _findColumn(headers, ['Categoria', 'Categoría', 'Category']);
    const colMarca = _findColumn(headers, ['Marca', 'Brand']);

    for (let i=1; i<data.length && out.length<limit; i++){
      const r = data[i];
      const nombre = String(r[0]||'');
      const bxc = _formatNumber(r[1]||12);
      const neto = _formatNumber(r[2]||0);
      const bruto = _formatNumber(r[6]||0);
      const ivaPct = _asPercent(r[8] ?? 0.19, 0.19);
      const ilaPct = _asPercent(r[9] ?? 0.00, 0.00);
      const sku = String(r[10]||'');
      const minNeto = colMinNeto > -1 ? _formatNumber(r[colMinNeto]) : 0;

      const categoria = colCategoria > -1 ? String(r[colCategoria]||'') : '';
      const marca = colMarca > -1 ? String(r[colMarca]||'') : '';

      if (!nombre && !sku) continue;
      if (query){
        const m1 = _normalizeText(nombre).includes(q);
        const m2 = _normalizeText(sku).includes(q);
        if (!m1 && !m2) continue;
      }

      out.push({
        sku: sku || nombre,
        nombre,
        bxc,
        precioNetoUnitario: neto,
        precioBrutoUnitario: bruto,
        ivaPorcentaje: ivaPct,
        ilaPorcentaje: ilaPct,
        minNetoUnitario: minNeto,
        categoria,
        marca,
        _precioNetoOriginal: neto,
        _precioBrutoOriginal: bruto
      });
    }
    return out;
  }catch(err){ console.error(err); return []; }
}

/* ==================== API: STOCK ==================== */
function apiGetStock(sku){
  try{
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.STOCK);
    if(!sh) return {disponible:0, mensaje:'Hoja de stock no encontrada'};
    const data = sh.getDataRange().getValues();
    if(data.length<2) return {disponible:0, mensaje:'Sin datos de stock'};

    const headers = data[0];
    const colSKU = _findColumn(headers,['SKU','Codigo','Cód Producto','Cod Producto']);
    const colStock = _findColumn(headers,['TOTAL_UNIDADES','Stock','Cajas','TOTAL CAJAS']);
    if (colSKU===-1 || colStock===-1) return {disponible:0, mensaje:'Columnas de stock no encontradas'};

    const find = String(sku||'').replace(/\s+/g,'');
    for (let i=1; i<data.length; i++){
      const row = data[i];
      const skuRow = String(row[colSKU]||'').replace(/\s+/g,'');
      if (skuRow===find){
        const disp = _formatNumber(row[colStock]||0);
        return {disponible: disp, mensaje: disp>0 ? `${disp} cajas disponibles` : 'Sin stock'};
      }
    }
    return {disponible:0, mensaje:'Producto no encontrado en stock'};
  }catch(err){ console.error(err); return {disponible:0, mensaje:'Error al consultar stock'}; }
}

/* ==================== API: GUARDAR NV ==================== */
function apiGuardarNV(payload){
  try{
    const numeroNV = _getNextNV();

    if (!payload.cliente || !payload.cliente.nombre) throw new Error('Cliente requerido');
    if (!payload.despacharDesde) throw new Error('Despachar desde es requerido');
    if (!payload.items || !Array.isArray(payload.items) || payload.items.length===0) throw new Error('Debe incluir al menos un ítem');

    const nvData = _prepararDatosNV(numeroNV, payload);
    _guardarEnNVBase(nvData);

    return { success:true, numeroNV, message:`Nota de Venta ${numeroNV} generada exitosamente`, totales:nvData.totales };
  }catch(err){
    console.error('apiGuardarNV', err);
    return { success:false, message:'Error al guardar: '+err.message };
  }
}

function _prepararDatosNV(numeroNV, payload){
  const cliente = payload.cliente;
  const vendedor = payload.vendedor || '';
  const fecha = payload.fecha || new Date().toISOString().slice(0,10);

  const formaPago = payload.formaPago || cliente.formaPago || '';
  const despacharDesde = payload.despacharDesde || '';
  const direccionDespacho = payload.direccionDespacho || '';
  const horarioDespacho = payload.horarioDespacho || '';
  const observaciones = payload.observaciones || '';

  let totalNeto = 0, totalIVA = 0, totalILA = 0, totalLogistico = 0;
  let totalCajas=0, totalUnidades=0, totalDescuento=0;

  const items = payload.items.map(it=>{
    const cajas = _formatNumber(it.cajas||0);
    const bxc = _formatNumber(it.bxc||0);
    const unidades = cajas*bxc;

    const netoU_base   = _formatNumber(it.netoUnitarioBase  || it.precioNetoUnitario || 0);
    const brutoU_base  = _formatNumber(it.brutoUnitarioBase || 0);
    const netoU_final  = _formatNumber(it.netoUnitarioFinal || it.precioNetoUnitario || 0);
    const brutoU_final = _formatNumber(it.brutoUnitarioFinal|| 0);
    const minU         = _formatNumber(it.netoUnitarioMin   || 0);

    const minComparacion = (minU > 0) ? minU : netoU_base;

    // ========== CORRECCIÓN V°B° FINANCIERO ==========
    // Redondear valores a 2 decimales para comparación precisa
    const netoFinalRounded = Math.round(netoU_final * 100) / 100;
    const minComparacionRounded = Math.round(minComparacion * 100) / 100;

    const ivaPct = _asPercent(it.ivaPorcentaje, 0.19);
    const ilaPct = _asPercent(it.ilaPorcentaje, 0.00);

    const descU = Math.max(0, netoU_base - netoU_final);
    const descLinea = descU * unidades;

    const logNeto = unidades * CONFIG.LOGISTICO.NETO_UNITARIO;
    const logIVA  = logNeto * CONFIG.LOGISTICO.IVA_PCT;

    const ivaLinea = (netoU_final * unidades) * ivaPct + logIVA;
    const ilaLinea = (netoU_final * unidades) * ilaPct;

    const netoProducto = netoU_final * unidades;
    const netoLinea    = netoProducto + logNeto;
    const totalLinea   = netoLinea + ivaLinea + ilaLinea;

    // Comparar con tolerancia de 5 pesos para cubrir redondeos
    // Si la diferencia es menor a 5 pesos, consideramos que es el mismo precio
    const vbFinanciero = (netoFinalRounded < (minComparacionRounded - 5))
      ? 'Requiere V°B° Financiero'
      : 'Sin V°B° Financiero';
    // ========== FIN CORRECCIÓN ==========

    totalNeto += netoLinea;
    totalIVA  += ivaLinea;
    totalILA  += ilaLinea;
    totalLogistico += logNeto;
    totalCajas += cajas;
    totalUnidades += unidades;
    totalDescuento += descLinea;

    return {
      sku: String(it.sku||''),
      nombre: String(it.nombre||''),
      categoria: String(it.categoria||''),
      marca: String(it.marca||''),
      bxc, cajas, unidades,
      vbFinanciero,
      netoUnitarioBase: _formatCLP(netoU_base),
      brutoUnitarioBase: _formatCLP(brutoU_base),
      netoUnitarioFinal: _formatCLP(netoU_final),
      brutoUnitarioFinal: _formatCLP(brutoU_final),
      descuentoLinea: _formatCLP(descLinea),
      netoLinea: _formatCLP(netoLinea),
      ivaLinea: _formatCLP(ivaLinea),
      ilaLinea: _formatCLP(ilaLinea),
      logisticoLinea: _formatCLP(logNeto),
      totalLinea: _formatCLP(totalLinea)
    };
  });

  const totalGeneral = totalNeto + totalIVA + totalILA;

  return {
    numeroNV, fecha, cliente, vendedor,
    formaPago,
    despacharDesde, direccionDespacho, horarioDespacho, observaciones,
    items,
    totales: {
      base: _formatCLP(totalNeto + totalDescuento),
      descuento: _formatCLP(totalDescuento),
      neto: _formatCLP(totalNeto),
      iva: _formatCLP(totalIVA),
      ila: _formatCLP(totalILA),
      logistico: _formatCLP(totalLogistico),
      total: _formatCLP(totalGeneral),
      cajas: totalCajas,
      unidades: totalUnidades
    }
  };
}

function _guardarEnNVBase(nvData){
  const sh = _getSheet().getSheetByName(CONFIG.HOJAS.NV_BASE);
  if(!sh) throw new Error('Hoja NV_Base no encontrada');

  _asegurarHeaderNVBase(sh);

  const filas = [];
  nvData.items.forEach(item=>{
    filas.push([
      nvData.numeroNV,
      nvData.fecha,
      nvData.cliente.rut || '',
      nvData.cliente.nombre || '',
      nvData.cliente.comuna || '',
      nvData.cliente.ciudad || '',
      nvData.vendedor,
      nvData.formaPago || '',
      item.sku,
      item.nombre,
      item.bxc,
      item.cajas,
      item.unidades,
      item.vbFinanciero,
      item.netoUnitarioBase,
      item.brutoUnitarioBase,
      item.netoUnitarioFinal,
      item.brutoUnitarioFinal,
      item.descuentoLinea,
      item.netoLinea,
      item.ivaLinea,
      item.ilaLinea,
      item.logisticoLinea,
      item.totalLinea,
      'PENDIENTE',
      '',
      nvData.despacharDesde,
      nvData.direccionDespacho,
      nvData.horarioDespacho,
      nvData.observaciones,
      item.categoria,
      item.marca
    ]);
  });

  const start = sh.getLastRow()+1;
  sh.getRange(start,1,filas.length,filas[0].length).setValues(filas);
}

function _asegurarHeaderNVBase(sh){
  if (sh.getLastRow()>0) return;
  const headers = [
    'Nota Venta','Fecha NV','RUT CLIENTE','Nombre Cliente','Comuna','Ciudad','Ejecutivo',
    'Forma de Pago',
    'Cód. Producto','Descripción Producto','Un x Caja','Cajas','Unidades',
    'V°B° Financiero',
    'Neto U Base','Bruto U Base','Neto U Final','Bruto U Final',
    'Descuento Línea','Neto','IVA','ILA','Costo Logístico','Total',
    'Estado Nota Venta','N° Factura',
    'Despachar Desde','Dirección Despacho','Horario Despacho','Observaciones',
    'Categoría','Marca'
  ];
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

/* ==================== KPIs ==================== */
function apiPreviewNV(){ return _previewNextNV(); }
function apiGetVendedores(){
  try{
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.CLIENTES);
    if(!sh) return [];
    const data = sh.getDataRange().getValues();
    if(data.length<2) return [];
    const h = data[0];
    const col = _findColumn(h,['Atendido por','Vendedor','Ejecutivo']);
    if (col===-1) return [];
    const set = new Set();
    for (let i=1;i<data.length;i++){ const v=String(data[i][col]||'').trim(); if(v) set.add(v); }
    return Array.from(set).sort();
  }catch(e){ return []; }
}
function apiGetNVHoy(){
  try{
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.NV_BASE);
    if(!sh) return 0;
    const data = sh.getDataRange().getValues();
    if(data.length<2) return 0;
    const h = data[0];
    const colF = _findColumn(h,['Fecha NV','Fecha']);
    if (colF===-1) return 0;
    const hoy = new Date().toISOString().slice(0,10);
    const ids = new Set();
    for (let i=1;i<data.length;i++){
      const f = data[i][colF];
      let s = '';
      if (f instanceof Date) s = f.toISOString().slice(0,10);
      else if (typeof f === 'string') s = f.slice(0,10);
      if (s===hoy) ids.add(data[i][0]);
    }
    return ids.size;
  }catch(e){ return 0; }
}
function apiGetCajasMes(){
  try{
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.NV_BASE);
    if(!sh) return 0;
    const data = sh.getDataRange().getValues();
    const data_length = data.length;
    if (data_length<2) return 0;
    const h = data[0];
    const colF = _findColumn(h,['Fecha NV','Fecha']);
    const colC = _findColumn(h,['Cajas']);
    if (colF===-1 || colC===-1) return 0;
    const now = new Date(); const m=now.getMonth(); const y=now.getFullYear();
    let total=0;
    for (let i=1;i<data_length;i++){
      const f = data[i][colF]; const c=_formatNumber(data[i][colC]||0);
      const d = (f instanceof Date)? f : new Date(f);
      if (d.getMonth()===m && d.getFullYear()===y) total += c;
    }
    return total;
  }catch(e){ return 0; }
}

/***** ========================================================
 *  ROUTER PRINCIPAL — VDA (Apps Script)
 *  ====================================================== *****/

function _normalizeModule_(pageParam) {
  const p = String(pageParam||'').toLowerCase();
  const map = {
    'home':'home','inicio':'home',
    'nv':'emisor_nv','emisor':'emisor_nv','emisor_nv':'emisor_nv',
    'aprobador':'aprobador',
    'finanzas':'finanzas','finance':'finanzas',
    'facturador':'facturador','fact':'facturador',
    'comercial':'comercial','comercial_dashboard':'comercial','ventas':'comercial',
    'despacho':'despacho','envio':'despacho','envios':'despacho','logistica':'despacho','logística':'despacho',

    // Modificador de NV
    'modificador_nv':'modificador_nv',
    'modificar_nv':'modificador_nv',
    'mod_nv':'modificador_nv',
    'modificacion_nv':'modificador_nv',
    'editar_nv':'modificador_nv',

    // OC Supermercados
    'oc_supermercados':'oc_supermercados',
    'oc':'oc_supermercados',
    'ocs':'oc_supermercados',
    'supermercados':'oc_supermercados',
    'oc_super':'oc_supermercados',

    // Stock
    'stock':'stock',
    'stock_cd':'stock',
    'stock_santiago':'stock',
    'stock_villa_alegre':'stock',

    // Deuda Clientes
    'deuda':'deuda_clientes',
    'deuda_clientes':'deuda_clientes',
    'credito':'deuda_clientes',
    'creditos':'deuda_clientes',

    // === NUEVO — Análisis Operacional Licores ===
    'op_licores':'op_licores',
    'analisis_operacional':'op_licores',
    'analisis_operacional_licores':'op_licores',
    'operacional':'op_licores',
    'operacional_licores':'op_licores',
    'kpi_licores':'op_licores'
  };
  return map[p] || 'home';
}

function _canUserOpenSheet_() {
  try {
    SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getName(); // si no tiene permiso en la hoja, lanza
    return true;
  } catch (err) {
    return false;
  }
}

function _accesoDenegadoHtml_(msg) {
  const texto = msg || 'No estás autorizado para usar este sistema.';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui;max-width:720px;margin:48px auto;padding:24px;text-align:center;border:1px solid #eee;border-radius:12px;background:#fff">' +
      '<h2 style="margin:0 0 12px 0;color:#b45309">⚠️ Acceso restringido</h2>' +
      `<p style="margin:0 0 8px 0;color:#374151">${texto}</p>` +
      '<p style="margin:0;color:#6b7280">Si crees que es un error, pide acceso al administrador.</p>' +
    '</div>'
  ).setTitle('Acceso restringido — VDA');
}

function doGet(e) {
  // 1) Restringe por acceso a la hoja base
  if (!_canUserOpenSheet_()) {
    return _accesoDenegadoHtml_();
  }

  // 2) Identifica al usuario (requiere: Ejecutar como "Usuario que accede a la aplicación web")
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return _accesoDenegadoHtml_('No se pudo identificar tu usuario. Inicia sesión con una cuenta de Google autorizada.');
  }

  // 3) Determina el módulo solicitado y valida permisos por correo
  const pageParam = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'home';
  const modulo = _normalizeModule_(pageParam);

  if (typeof _tienePermiso_ === 'function' && !_tienePermiso_(email, modulo)) {
    return _accesoDenegadoHtml_(
      `Tu usuario <b>${email}</b> no tiene permiso para el módulo <b>${modulo}</b>.`
    );
  }

  // 4) Router (mapea módulo a archivo y título)
  const routes = {
    'home':'home','inicio':'home',
    'emisor_nv':'emisor_nv',
    'aprobador':'aprobador',
    'finanzas':'finanzas','finance':'finanzas',
    'facturador':'facturador','fact':'facturador',
    'comercial':'comercial','comercial_dashboard':'comercial','ventas':'comercial',
    'despacho':'despacho',

    // vistas nuevas
    'modificador_nv':'modificador_nv',
    'oc_supermercados':'oc_supermercados',
    'stock':'stock',

    // Deuda Clientes
    'deuda':'deuda_clientes',
    'deuda_clientes':'deuda_clientes',

    // === NUEVO — Análisis Operacional Licores ===
    'op_licores':'op_licores'
  };

  const titles = {
    'home':'Inicio — VDA',
    'emisor_nv':'Emisión de Notas de Venta — VDA',
    'aprobador':'Módulo Aprobador — VDA',
    'finanzas':'Módulo Finanzas — VDA',
    'facturador':'Módulo Facturador — VDA',
    'comercial':'Módulo Comercial — VDA',
    'despacho':'Módulo Despacho — VDA',

    // títulos nuevas
    'modificador_nv':'Modificación de Notas de Venta — VDA',
    'oc_supermercados':'OC Supermercados — VDA',
    'stock':'Módulo Stock — VDA',

    // Deuda Clientes
    'deuda_clientes':'Deuda Clientes — VDA',

    // === NUEVO — Análisis Operacional Licores ===
    'op_licores':'Análisis Operacional Licores — VDA'
  };

  const file = routes[modulo] || 'home';

  try {
    return HtmlService.createTemplateFromFile(file)
      .evaluate()
      .setTitle(titles[file] || 'VDA')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    const html = HtmlService.createHtmlOutput(
      '<div style="font-family:system-ui;padding:24px">' +
      '<h2>⚠️ No se pudo cargar la página</h2>' +
      '<pre style="white-space:pre-wrap;background:#f8f9fa;padding:12px;border:1px solid #eee;border-radius:8px;">' +
      String(err) + '</pre>' +
      '<p><a href="?page=home">Volver al inicio</a></p>' +
      '</div>'
    );
    return html.setTitle('Error de carga — VDA');
  }
}

function include(filename){
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
function getWebAppUrl(){
  return ScriptApp.getService().getUrl();
}


/* ================================================================
 *  SEGURO VIGENTE — helpers & APIs para "Monto Aprobado CLP"
 * ================================================================ */
function _sv_parseRut_(s){
  const t = String(s||'').replace(/\./g,'').replace(/\s+/g,'').toUpperCase();
  const m = t.match(/(\d+)-?([0-9K])?$/);
  return { num: m ? m[1] : t.replace(/\D/g,''), dv: m && m[2] ? m[2] : '' };
}
function _sv_norm_(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

/**
 * Lee "Seguro Vigente" y devuelve el número de la columna "Monto Aprobado CLP"
 * identificando por RUT (con o sin puntos/guion) o por nombre de cliente.
 * Si no encuentra, retorna 0.
 */
function apiGetSeguroVigenteMontoAprobado(ident){
  try{
    const sh = _getSheet().getSheetByName('Seguro Vigente');
    if (!sh) return 0;
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return 0;

    const h = data[0];
    const cRut    = _findColumn(h, ['RUT','Rut','rut','R.U.T.']);
    const cDv     = _findColumn(h, ['DV','Dv','dv']);
    const cNombre = _findColumn(h, ['Cliente','Nombre','Nombre Cliente','Razón Social','Razon Social']);
    const cMonto  = _findColumn(h, [
      'Monto Aprobado CLP','Monto Aprobado (CLP)','Monto aprobado CLP','Monto aprobado (CLP)',
      'MontoAprobadoCLP','Línea de Crédito','Linea de Credito','Linea Crédito','Linea Credito'
    ]);
    if (cMonto === -1) return 0;

    const id   = String(ident||'').trim();
    const tRut = _sv_parseRut_(id);
    const tNom = _sv_norm_(id);

    for (let i=1;i<data.length;i++){
      const row = data[i];

      // Coincidencia por RUT
      let match = false;
      if (cRut > -1 && cDv > -1){
        const r = _sv_parseRut_(String(row[cRut]||'') + '-' + String(row[cDv]||''));
        match = r.num === tRut.num && (!tRut.dv || r.dv === tRut.dv);
      } else if (cRut > -1){
        const r = _sv_parseRut_(row[cRut]);
        match = r.num === tRut.num && (!tRut.dv || r.dv === tRut.dv);
      }

      // Fallback por nombre
      if (!match && cNombre > -1 && id && isNaN(Number(id))){
        match = _sv_norm_(row[cNombre]).includes(tNom);
      }

      if (match){
        return _formatCLP(row[cMonto] || 0);
      }
    }
    return 0;
  }catch(e){
    console.error('apiGetSeguroVigenteMontoAprobado:', e);
    return 0;
  }
}

// Aliases que el front también prueba:
function apiFinanzasGetSeguroVigenteMontoAprobado(r){ return apiGetSeguroVigenteMontoAprobado(r); }
function apiSeguroVigenteGetMontoAprobadoCLP(r){     return apiGetSeguroVigenteMontoAprobado(r); }
function apiFinanzasGetSeguroVigente(r){
  const monto = apiGetSeguroVigenteMontoAprobado(r);
  return { 'Monto Aprobado CLP': monto, montoAprobadoCLP: monto };
}
function apiGetSeguroVigente(r){ return apiFinanzasGetSeguroVigente(r); }
function apiSeguroVigente(r){   return apiFinanzasGetSeguroVigente(r); }

/* ================================================================
 *  NUEVO BRIDGE para PDF (Hoja 2): apiFinGetDeudaCliente
 *  - Usa apiDeudaGetDetalleCliente (tu backend de Deuda Clientes)
 *  - Trae línea de crédito desde "Seguro Vigente → Monto Aprobado CLP"
 *  - Devuelve: { ok, resumen:{...}, detalle:[...] }
 * ================================================================ */
function apiFinGetDeudaCliente(rutInput, nombreInput){
  try{
    const ident = String(nombreInput || rutInput || '').trim();
    if (!ident){
      return { ok:true, resumen:{
        cliente:'', rut:'', deudaTotal:0, vencida:0, porVencer:0, cheques:0, noDocumentado:0,
        docs:0, maxDias:0, credito:0, disponible:0, utilPct:0
      }, detalle:[] };
    }

    // Helper local: días firmados (hoy - fechaVenc)
    const daysDiffSigned = (v)=>{
      if (!v && v!==0) return 0;
      let d = v instanceof Date ? v : new Date(v);
      if (isNaN(d)) return 0;
      const today = new Date(); today.setHours(0,0,0,0);
      const vv = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return Math.round((today - vv)/(24*3600*1000)); // >0 vencido, <0 por vencer
    };

    // Usa directamente el backend bueno
    const det = apiDeudaGetDetalleCliente(ident);
    if (!det || det.ok === false){
      return { ok:false, error: (det && det.error) || 'No se pudo obtener la deuda del cliente' };
    }

    const t = det.totales || {};
    const c = det.credito || {};
    const items = Array.isArray(det.items) ? det.items : [];

    // Extraer valores incluyendo CHEQUES
    const vencida = Number(t.vencida || 0);
    const porVencer = Number(t.porVencer || 0);
    const cheques = Number(t.chequesCartera || 0);  // ← AGREGADO
    const noDocumentado = vencida + porVencer;      // ← AGREGADO

    const resumen = {
      cliente     : det.cliente || '',
      rut         : det.rut || '',
      deudaTotal  : Number(t.deudaTotal || 0),
      vencida     : vencida,
      porVencer   : porVencer,
      cheques     : cheques,           // ← AGREGADO
      noDocumentado: noDocumentado,    // ← AGREGADO
      docs        : Number(t.documentos || 0),
      maxDias     : Number(t.maxDias || 0),
      credito     : Number(c.lineaCredito || 0),
      disponible  : Number(c.disponible || 0),
      utilPct     : Number(c.utilizacionPct || 0)
    };

    const detalle = items.map(it => {
      let signed = (typeof it.diasSigned === 'number') ? it.diasSigned : null;
      if (signed == null && it.fechaVenc){
        signed = daysDiffSigned(it.fechaVenc);
      }
      if (signed == null) signed = 0;

      return {
        documento   : String(it.documento || ''),
        fechaFactura: String(it.fechaFactura || ''),
        fechaVenc   : String(it.fechaVenc || ''),
        diasSigned  : Number(signed),
        deuda       : Number(it.deuda || 0),
        estadoPago  : String(it.estadoPago || '')
      };
    });

    // === Mezcla crédito desde "Seguro Vigente" si es mayor a 0 ===
    try{
      const rutBuscar = det.rut || ident;
      const credSV = apiGetSeguroVigenteMontoAprobado(rutBuscar);
      if (credSV && credSV > 0){
        resumen.credito = Number(credSV);
        if (resumen.disponible == null || isNaN(resumen.disponible)){
          resumen.disponible = resumen.credito - noDocumentado;
        }
      }
    }catch(e){
      console.warn('No se pudo mezclar crédito desde Seguro Vigente:', e);
    }

    return { ok:true, resumen, detalle };
  }catch(err){
    return { ok:false, error:String(err) };
  }
}
/**
 * Envía el PDF de la NV por correo si el usuario es vdasdeaguirre@gmail.com
 * @param {string} numeroNV - Número de la nota de venta
 * @param {string} pdfBase64 - PDF codificado en base64
 * @param {string} nombreCliente - Nombre del cliente para el archivo
 * @param {number} total - Total de la NV
 * @param {number} cajas - Total de cajas
 */
function apiEnviarNVPorCorreo(numeroNV, pdfBase64, nombreCliente, total, cajas) {
  try {
    const usuarioActual = Session.getActiveUser().getEmail().toLowerCase();
    const usuarioEspecifico = 'vdasdeaguirre@gmail.com';
    const destinatario = 'kgonzalez@deaguirre.cl';
    
    // Solo enviar si el usuario actual es el específico
    if (usuarioActual !== usuarioEspecifico) {
      return { enviado: false, razon: 'Usuario no corresponde' };
    }
    
    // Decodificar el PDF de base64
    const pdfBytes = Utilities.base64Decode(pdfBase64);
    const pdfBlob = Utilities.newBlob(pdfBytes, 'application/pdf', 
      `NV_${numeroNV}_${(nombreCliente || 'cliente').replace(/\s+/g, '_').replace(/[^\w\-]/g, '')}.pdf`
    );
    
    const asunto = `Nota de Venta ${numeroNV} - ${nombreCliente || 'Cliente'}`;
    
    const cuerpo = `
Estimado/a,

Se ha emitido una nueva Nota de Venta con los siguientes datos:

- N° NV: ${numeroNV}
- Cliente: ${nombreCliente || 'No especificado'}
- Total: $${Math.round(total || 0).toLocaleString('es-CL')}
- Cajas: ${cajas || 0}

Se adjunta el PDF con el detalle completo.

Saludos cordiales,
Sistema VDA - Emitido por ${usuarioActual}
    `.trim();
    
    MailApp.sendEmail({
      to: destinatario,
      subject: asunto,
      body: cuerpo,
      attachments: [pdfBlob]
    });
    
    console.log(`Correo NV ${numeroNV} enviado a ${destinatario} por usuario ${usuarioActual}`);
    return { enviado: true, destinatario: destinatario };
    
  } catch (error) {
    console.error('Error al enviar correo NV:', error);
    return { enviado: false, error: error.message };
  }
}