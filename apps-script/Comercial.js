/* =====================================================
   BACKEND ANÁLISIS EJECUTIVO - OPTIMIZADO CON CACHÉ
   Hoja: "maestro de venta"
   
   ✅ CacheService para respuestas ultra-rápidas
   ✅ TTL configurable (default 10 minutos)
   ✅ Invalidación manual de caché
   ===================================================== */

const COM_CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: { 
    MAESTRO: 'maestro de venta',
    NV_BASE: 'NV_Base'
  },
  CACHE_TTL: 1800  // 30 minutos en segundos
};

/* ===== Helpers ===== */
function _c_ss(){ return SpreadsheetApp.openById(COM_CONFIG.SPREADSHEET_ID); }

function _c_num(v){
  if (typeof v === 'number') return v;
  const s = String(v || '').trim();
  if (!s) return 0;
  const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(t.replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ===== CACHÉ ===== */
function _getCache() {
  return CacheService.getScriptCache();
}

function _getCacheKey(anio) {
  return 'VENTAS_EXEC_' + anio;
}

function _getFromCache(anio) {
  try {
    const cache = _getCache();
    const key = _getCacheKey(anio);
    const cached = cache.get(key);
    if (cached) {
      Logger.log('✅ Cache HIT para año ' + anio);
      return JSON.parse(cached);
    }
    Logger.log('❌ Cache MISS para año ' + anio);
    return null;
  } catch (e) {
    Logger.log('Error leyendo caché: ' + e.message);
    return null;
  }
}

function _saveToCache(anio, data) {
  try {
    const cache = _getCache();
    const key = _getCacheKey(anio);
    const json = JSON.stringify(data);
    
    // CacheService tiene límite de 100KB por valor
    if (json.length > 100000) {
      Logger.log('⚠️ Datos muy grandes para caché (' + json.length + ' bytes), guardando versión reducida');
      // Guardar versión reducida
      const reduced = {
        ok: data.ok,
        year: data.year,
        fechaInforme: data.fechaInforme,
        mesActual: data.mesActual,
        totals: data.totals,
        months: data.months,
        monthsAnterior: data.monthsAnterior,
        clasificaciones: data.clasificaciones,
        categorias: (data.categorias || []).slice(0, 20),
        marcas: (data.marcas || []).slice(0, 20),
        monthsByClasificacion: data.monthsByClasificacion,
        categoriasByClasificacion: _reducirByClasif(data.categoriasByClasificacion, 15),
        marcasByClasificacion: _reducirByClasif(data.marcasByClasificacion, 15),
        categoriasByMes: data.categoriasByMes,
        marcasByMes: data.marcasByMes,
        clasificacionesByMes: data.clasificacionesByMes,
        mayorista: _reducirSegmento(data.mayorista),
        supermercado: _reducirSegmento(data.supermercado)
      };
      cache.put(key, JSON.stringify(reduced), COM_CONFIG.CACHE_TTL);
    } else {
      cache.put(key, json, COM_CONFIG.CACHE_TTL);
    }
    Logger.log('✅ Guardado en caché: ' + key + ' (TTL: ' + COM_CONFIG.CACHE_TTL + 's)');
  } catch (e) {
    Logger.log('Error guardando caché: ' + e.message);
  }
}

function _reducirSegmento(seg) {
  if (!seg) return null;
  return {
    totals: seg.totals,
    totalsMes: seg.totalsMes,
    items: (seg.items || []).slice(0, 15),
    months: seg.months,
    monthsAnterior: seg.monthsAnterior,
    categorias: (seg.categorias || []).slice(0, 15),
    marcas: (seg.marcas || []).slice(0, 15),
    categoriasByItem: seg.categoriasByItem,
    marcasByItem: seg.marcasByItem,
    monthsByItem: seg.monthsByItem,
    // ===== NUEVOS CAMPOS =====
    itemsByMes: _reducirByMes(seg.itemsByMes, 10),
    categoriasByMes: _reducirByMes(seg.categoriasByMes, 10),
    marcasByMes: _reducirByMes(seg.marcasByMes, 10)
  };
}

/* Función auxiliar para reducir objetos indexados por mes */
function _reducirByMes(obj, limit) {
  if (!obj) return {};
  const result = {};
  Object.keys(obj).forEach(mes => {
    result[mes] = (obj[mes] || []).slice(0, limit);
  });
  return result;
}

function _reducirByClasif(obj, limit) {
  if (!obj) return {};
  const result = {};
  Object.keys(obj).forEach(k => {
    result[k] = (obj[k] || []).slice(0, limit);
  });
  return result;
}

/**
 * Limpiar caché de un año o todos
 */
function apiVentasExecClearCache(anio) {
  try {
    const cache = _getCache();
    if (anio) {
      cache.remove(_getCacheKey(anio));
      Logger.log('🗑️ Caché eliminado para año ' + anio);
    } else {
      // Limpiar últimos 5 años
      const currentYear = new Date().getFullYear();
      for (let y = currentYear - 4; y <= currentYear + 1; y++) {
        cache.remove(_getCacheKey(y));
      }
      Logger.log('🗑️ Caché eliminado para todos los años');
    }
    return { ok: true, message: 'Cache cleared' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/* ===== LECTURA DE DATOS (una sola vez) ===== */
let _datosCache = null;

function _c_readMaestroVenta(forceReload){
  // Cache en memoria para múltiples llamadas en la misma ejecución
  if (_datosCache && !forceReload) {
    return _datosCache;
  }

  try {
    const startTime = new Date().getTime();
    Logger.log('📖 Abriendo spreadsheet: ' + COM_CONFIG.SPREADSHEET_ID);
    const ss = _c_ss();
    Logger.log('📖 Buscando hoja: ' + COM_CONFIG.HOJAS.MAESTRO);
    const sh = ss.getSheetByName(COM_CONFIG.HOJAS.MAESTRO);
    if (!sh) {
      Logger.log('❌ Hoja no encontrada: ' + COM_CONFIG.HOJAS.MAESTRO);
      return { ok: false, error: 'Hoja "maestro de venta" no encontrada' };
    }
    
    Logger.log('📖 Leyendo datos...');
    const data = sh.getDataRange().getValues(); 
    Logger.log('📖 Filas leídas: ' + data.length);
    if (data.length < 2) return { ok: true, data: [], headers: data[0] || [] };

  const H = data[0];
  
  const findCol = (name) => H.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase());
  const findColPartial = (names) => {
    for (const name of names) {
      const idx = H.findIndex(h => String(h).toLowerCase().includes(name.toLowerCase()));
      if (idx > -1) return idx;
    }
    return -1;
  };

  const idx = {
    Estado: findCol('Estado Venta'),
    Factura: findCol('N° Factura'),
    NV: findCol('Nota Venta'),
    Cliente: findCol('Nombre Cliente'),
    Comuna: findCol('Comuna'),
    Clasificacion: findCol('Clasificacion'),
    Ejecutivo: findCol('Ejecutivo'),
    Producto: findColPartial(['Descripción Producto', 'Descripcion Producto']),
    Cajas: findCol('Cajas'),
    Neto: findColPartial(['TOTAL NETO FINAL', 'Neto']),
    Fecha: findColPartial(['Fecha Facturación', 'Fecha Facturacion']),
    Categoria: findColPartial(['Categoria', 'Categoría']),
    Marca: findCol('Marca'),
    CostoTotal: findCol('Costo Total')
  };

  const result = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    
    const neto = Math.abs(_c_num(idx.Neto > -1 ? r[idx.Neto] : 0));
    const costoTotal = Math.abs(_c_num(idx.CostoTotal > -1 ? r[idx.CostoTotal] : 0));
    const margen = neto - costoTotal;
    const cajas = _c_num(idx.Cajas > -1 ? r[idx.Cajas] : 0);
    
    const fRaw = idx.Fecha > -1 ? r[idx.Fecha] : '';
    let fecha = '';
    let year = 0;
    let month = 0;
    
    if (fRaw instanceof Date) {
      fecha = fRaw.toISOString().slice(0, 10);
      year = fRaw.getFullYear();
      month = fRaw.getMonth() + 1;
    } else if (fRaw) {
      const d = new Date(fRaw);
      if (!isNaN(d.getTime())) {
        fecha = d.toISOString().slice(0, 10);
        year = d.getFullYear();
        month = d.getMonth() + 1;
      }
    }

    if (!fecha) continue;

    result.push({
      factura: idx.Factura > -1 ? String(r[idx.Factura] || '') : '',
      nv: idx.NV > -1 ? String(r[idx.NV] || '') : '',   // ← AGREGAR ESTA LÍNEA
      clasificacion: idx.Clasificacion > -1 ? String(r[idx.Clasificacion] || '').trim() : 'Sin clasificar',
      ejecutivo: idx.Ejecutivo > -1 ? _c_normalizeText(r[idx.Ejecutivo]) || 'SIN EJECUTIVO' : 'SIN EJECUTIVO',
      cliente: idx.Cliente > -1 ? String(r[idx.Cliente] || '').trim() : 'Sin cliente',
      cajas: cajas,
      neto: neto,
      costoTotal: costoTotal,
      margen: margen,
      fecha: fecha,
      year: year,
      month: month,
      categoria: idx.Categoria > -1 ? String(r[idx.Categoria] || '').trim() : 'Sin categoría',
      marca: idx.Marca > -1 ? String(r[idx.Marca] || '').trim() : 'Sin marca'
    });
  }

  const endTime = new Date().getTime();
  Logger.log('📊 Lectura de datos: ' + result.length + ' registros en ' + (endTime - startTime) + 'ms');

  _datosCache = { ok: true, data: result, headers: H };
  return _datosCache;
  
  } catch (e) {
    Logger.log('❌ Error en _c_readMaestroVenta: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== FUNCIÓN PARA CALCULAR SEGMENTOS (Mayorista/Supermercado) ===== */
function calcularSegmento(datosAnio, datosAnterior, clasificacionFiltro, campoPrincipal, mesActual, calcTotales) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Filtrar por clasificación
  const datos = datosAnio.filter(i => (i.clasificacion || '').toUpperCase() === clasificacionFiltro);
  const datosAnt = datosAnterior.filter(i => (i.clasificacion || '').toUpperCase() === clasificacionFiltro);
  
  if (datos.length === 0) {
    return { totals: { ventaNeta: 0, margen: 0, cajas: 0, facturas: 0, rentabilidad: 0 }, items: [], months: [], categorias: [], marcas: [] };
  }
  
  // Totales del segmento
  const totals = calcTotales(datos);
  const totalsAnt = calcTotales(datosAnt);
  totals.yoyVentas = totalsAnt.ventaNeta > 0 ? ((totals.ventaNeta - totalsAnt.ventaNeta) / totalsAnt.ventaNeta) * 100 : 0;
  
  // Totales mes actual
  const datosMes = datos.filter(i => i.month === mesActual);
  const datosMesAnt = datosAnt.filter(i => i.month === mesActual);
  const totalsMes = calcTotales(datosMes);
  const totalsMesAnt = calcTotales(datosMesAnt);
  totalsMes.yoyVentas = totalsMesAnt.ventaNeta > 0 ? ((totalsMes.ventaNeta - totalsMesAnt.ventaNeta) / totalsMesAnt.ventaNeta) * 100 : 0;
  
  // Agrupar por campo principal (ejecutivo o cliente)
  const itemsMap = {};
  const itemsMapAnt = {};
  
  datos.forEach(item => {
    const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
    if (!itemsMap[key]) itemsMap[key] = { nombre: key, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0, facturas: new Set() };
    itemsMap[key].neto += item.neto;
    itemsMap[key].margen += item.margen;
    itemsMap[key].cajas += item.cajas;
    itemsMap[key].facturas.add(item.factura);
    if (item.month === mesActual) itemsMap[key].netoMes += item.neto;
    if (item.month <= mesActual) itemsMap[key].netoAcum += item.neto;
  });
  
  datosAnt.forEach(item => {
    const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
    if (!itemsMapAnt[key]) itemsMapAnt[key] = { neto: 0, netoMes: 0, netoAcum: 0 };
    itemsMapAnt[key].neto += item.neto;
    if (item.month === mesActual) itemsMapAnt[key].netoMes += item.neto;
    if (item.month <= mesActual) itemsMapAnt[key].netoAcum += item.neto;
  });
  
  const items = Object.values(itemsMap).map(x => {
    const ant = itemsMapAnt[x.nombre] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      nombre: x.nombre,
      ventaNeta: Math.round(x.neto),
      margen: Math.round(x.margen),
      cajas: Math.round(x.cajas),
      facturas: x.facturas.size,
      rentabilidad: x.neto > 0 ? (x.margen / x.neto) * 100 : 0,
      participacion: totals.ventaNeta > 0 ? (x.neto / totals.ventaNeta) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((x.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((x.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((x.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(x.netoMes),
      ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(x.netoAcum),
      ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // Meses del segmento
  const datosPorMes = {};
  const datosPorMesAnt = {};
  for (let m = 1; m <= 12; m++) {
    datosPorMes[m] = datos.filter(i => i.month === m);
    datosPorMesAnt[m] = datosAnt.filter(i => i.month === m);
  }
  
  const months = [];
  const monthsAnterior = [];
  for (let m = 1; m <= 12; m++) {
    const totMes = calcTotales(datosPorMes[m]);
    const totMesAnt = calcTotales(datosPorMesAnt[m]);
    totMes.label = meses[m - 1];
    totMes.mes = m;
    totMesAnt.label = meses[m - 1];
    totMesAnt.mes = m;
    totMes.yoyVentas = totMesAnt.ventaNeta > 0 ? ((totMes.ventaNeta - totMesAnt.ventaNeta) / totMesAnt.ventaNeta) * 100 : 0;
    months.push(totMes);
    monthsAnterior.push(totMesAnt);
  }
  
  // Categorías del segmento
  const catMap = {};
  const catMapAnt = {};
  datos.forEach(item => {
    const cat = (item.categoria || 'Sin categoría').trim();
    if (!catMap[cat]) catMap[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
    catMap[cat].neto += item.neto;
    catMap[cat].margen += item.margen;
    catMap[cat].cajas += item.cajas;
    if (item.month === mesActual) catMap[cat].netoMes += item.neto;
    if (item.month <= mesActual) catMap[cat].netoAcum += item.neto;
  });
  datosAnt.forEach(item => {
    const cat = (item.categoria || 'Sin categoría').trim();
    if (!catMapAnt[cat]) catMapAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
    catMapAnt[cat].neto += item.neto;
    if (item.month === mesActual) catMapAnt[cat].netoMes += item.neto;
    if (item.month <= mesActual) catMapAnt[cat].netoAcum += item.neto;
  });
  const categorias = Object.values(catMap).map(c => {
    const ant = catMapAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      categoria: c.categoria,
      ventaNeta: Math.round(c.neto),
      margen: Math.round(c.margen),
      cajas: Math.round(c.cajas),
      rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(c.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(c.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // Marcas del segmento
  const marcaMap = {};
  const marcaMapAnt = {};
  datos.forEach(item => {
    const marca = (item.marca || 'Sin marca').trim();
    if (!marcaMap[marca]) marcaMap[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
    marcaMap[marca].neto += item.neto;
    marcaMap[marca].margen += item.margen;
    marcaMap[marca].cajas += item.cajas;
    if (item.month === mesActual) marcaMap[marca].netoMes += item.neto;
    if (item.month <= mesActual) marcaMap[marca].netoAcum += item.neto;
  });
  datosAnt.forEach(item => {
    const marca = (item.marca || 'Sin marca').trim();
    if (!marcaMapAnt[marca]) marcaMapAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
    marcaMapAnt[marca].neto += item.neto;
    if (item.month === mesActual) marcaMapAnt[marca].netoMes += item.neto;
    if (item.month <= mesActual) marcaMapAnt[marca].netoAcum += item.neto;
  });
  const marcas = Object.values(marcaMap).map(m => {
    const ant = marcaMapAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      marca: m.marca,
      ventaNeta: Math.round(m.neto),
      margen: Math.round(m.margen),
      cajas: Math.round(m.cajas),
      rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(m.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(m.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // ===== AGRUPACIONES POR ITEM (ejecutivo/cliente) para filtros =====
  const topItems = items.slice(0, 10).map(i => i.nombre);
  
  // Categorías por Item
  const categoriasByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const catMapItem = {};
    const catMapItemAnt = {};
    datosItem.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapItem[cat]) catMapItem[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      catMapItem[cat].neto += item.neto;
      catMapItem[cat].margen += item.margen;
      catMapItem[cat].cajas += item.cajas;
      if (item.month === mesActual) catMapItem[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapItem[cat].netoAcum += item.neto;
    });
    datosItemAnt.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapItemAnt[cat]) catMapItemAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
      catMapItemAnt[cat].neto += item.neto;
      if (item.month === mesActual) catMapItemAnt[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapItemAnt[cat].netoAcum += item.neto;
    });
    categoriasByItem[itemName] = Object.values(catMapItem).map(c => {
      const ant = catMapItemAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        categoria: c.categoria, ventaNeta: Math.round(c.neto), margen: Math.round(c.margen), cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
        varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
        ventaNetaMes: Math.round(c.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
        ventaNetaAcum: Math.round(c.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum), ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta).slice(0, 15);
  });
  
  // Marcas por Item
  const marcasByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const mMapItem = {};
    const mMapItemAnt = {};
    datosItem.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!mMapItem[marca]) mMapItem[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      mMapItem[marca].neto += item.neto;
      mMapItem[marca].margen += item.margen;
      mMapItem[marca].cajas += item.cajas;
      if (item.month === mesActual) mMapItem[marca].netoMes += item.neto;
      if (item.month <= mesActual) mMapItem[marca].netoAcum += item.neto;
    });
    datosItemAnt.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!mMapItemAnt[marca]) mMapItemAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
      mMapItemAnt[marca].neto += item.neto;
      if (item.month === mesActual) mMapItemAnt[marca].netoMes += item.neto;
      if (item.month <= mesActual) mMapItemAnt[marca].netoAcum += item.neto;
    });
    marcasByItem[itemName] = Object.values(mMapItem).map(m => {
      const ant = mMapItemAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        marca: m.marca, ventaNeta: Math.round(m.neto), margen: Math.round(m.margen), cajas: Math.round(m.cajas),
        rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
        varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
        varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
        ventaNetaMes: Math.round(m.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
        ventaNetaAcum: Math.round(m.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum), ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta).slice(0, 15);
  });
  
  // Meses por Item
  const monthsByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const mesesItem = [];
    const mesesItemAnt = [];
    for (let m = 1; m <= 12; m++) {
      const mesData = datosItem.filter(i => i.month === m);
      const mesDataAnt = datosItemAnt.filter(i => i.month === m);
      const totMes = calcTotales(mesData);
      const totMesAnt = calcTotales(mesDataAnt);
      totMes.label = meses[m - 1];
      totMes.mes = m;
      totMesAnt.label = meses[m - 1];
      totMesAnt.mes = m;
      mesesItem.push(totMes);
      mesesItemAnt.push(totMesAnt);
    }
    monthsByItem[itemName] = { months: mesesItem, monthsAnterior: mesesItemAnt };
  });
  
  return {
    totals: totals,
    totalsMes: totalsMes,
    items: items,
    months: months,
    monthsAnterior: monthsAnterior,
    categorias: categorias,
    marcas: marcas,
    categoriasByItem: categoriasByItem,
    marcasByItem: marcasByItem,
    monthsByItem: monthsByItem
  };
}


/* ===== API PRINCIPAL OPTIMIZADA ===== */
function apiVentasExecGetResumen(anio, filtros) {
  const startTime = new Date().getTime();
  
  try {
    const year = Number(anio);
    
    // 1. Intentar obtener de caché
    const cached = _getFromCache(year);
    if (cached) {
      const endTime = new Date().getTime();
      Logger.log('⚡ Respuesta desde caché en ' + (endTime - startTime) + 'ms');
      return cached;
    }
    
    // 2. Si no hay caché, procesar datos
    const { ok, error, data } = _c_readMaestroVenta();
    if (!ok) return { ok: false, error };

    const yearAnterior = year - 1;
    
    // Filtrar por año (ya tenemos year precalculado)
    const datosAnio = data.filter(item => item.year === year);
    const datosAnterior = data.filter(item => item.year === yearAnterior);

    Logger.log('📅 Año ' + year + ': ' + datosAnio.length + ' registros');
    Logger.log('📅 Año ' + yearAnterior + ': ' + datosAnterior.length + ' registros');

    if (datosAnio.length === 0) {
      return { ok: false, error: 'No hay datos para el año ' + year };
    }

    // Fecha más reciente
    let fechaInforme = datosAnio[0].fecha;
    datosAnio.forEach(item => {
      if (item.fecha > fechaInforme) fechaInforme = item.fecha;
    });

    // Función auxiliar optimizada
    const calcTotales = (datos) => {
      let ventaNeta = 0, margen = 0, costoTotal = 0, cajas = 0;
      const facturas = new Set();
      
      for (let i = 0; i < datos.length; i++) {
        const item = datos[i];
        ventaNeta += item.neto;
        margen += item.margen;
        costoTotal += item.costoTotal;
        cajas += item.cajas;
        facturas.add(item.factura);
      }
      
      return {
        ventaNeta: Math.round(ventaNeta),
        margen: Math.round(margen),
        costoTotal: Math.round(costoTotal),
        cajas: Math.round(cajas),
        facturas: facturas.size,
        rentabilidad: ventaNeta > 0 ? (margen / ventaNeta) * 100 : 0
      };
    };

    // Totales generales
    const totals = calcTotales(datosAnio);
    const totalsAnt = calcTotales(datosAnterior);
    
    totals.yoyVentas = totalsAnt.ventaNeta > 0 
      ? ((totals.ventaNeta - totalsAnt.ventaNeta) / totalsAnt.ventaNeta) * 100 
      : 0;
    totals.yoyMargen = totalsAnt.margen > 0 
      ? ((totals.margen - totalsAnt.margen) / totalsAnt.margen) * 100 
      : 0;

    // Pre-agrupar datos por mes (más eficiente)
    const datosPorMes = {};
    const datosPorMesAnt = {};
    for (let m = 1; m <= 12; m++) {
      datosPorMes[m] = [];
      datosPorMesAnt[m] = [];
    }
    datosAnio.forEach(item => datosPorMes[item.month].push(item));
    datosAnterior.forEach(item => datosPorMesAnt[item.month].push(item));

    // Calcular meses
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const months = [];
    const monthsAnterior = [];
    
    for (let m = 1; m <= 12; m++) {
      const totMes = calcTotales(datosPorMes[m]);
      totMes.label = meses[m - 1];
      totMes.mes = m;
      
      const totMesAnt = calcTotales(datosPorMesAnt[m]);
      totMesAnt.label = meses[m - 1];
      totMesAnt.mes = m;
      
      totMes.yoyVentas = totMesAnt.ventaNeta > 0 
        ? ((totMes.ventaNeta - totMesAnt.ventaNeta) / totMesAnt.ventaNeta) * 100 
        : 0;
      
      months.push(totMes);
      monthsAnterior.push(totMesAnt);
    }

    // Pre-agrupar por clasificación
    const datosPorClasif = {};
    datosAnio.forEach(item => {
      const c = (item.clasificacion || 'Sin clasificar').trim();
      const cUpper = c.toUpperCase();
      if (!datosPorClasif[cUpper]) {
        datosPorClasif[cUpper] = { nombre: c, items: [] };
      }
      datosPorClasif[cUpper].items.push(item);
    });

    // Pre-agrupar año anterior por clasificación
    const datosPorClasifAnt = {};
    datosAnterior.forEach(item => {
      const c = (item.clasificacion || 'Sin clasificar').trim();
      const cUpper = c.toUpperCase();
      if (!datosPorClasifAnt[cUpper]) {
        datosPorClasifAnt[cUpper] = { nombre: c, items: [] };
      }
      datosPorClasifAnt[cUpper].items.push(item);
    });

    // Mes actual = mes de la última factura (no el mes calendario)
    const fechaUltima = new Date(fechaInforme);
    const mesActual = fechaUltima.getMonth() + 1;

    // CLASIFICACIONES con variación YoY
    const clasificaciones = Object.values(datosPorClasif).map(g => {
      const t = calcTotales(g.items);
      const clasifKey = g.nombre.toUpperCase();
      
      // Datos año anterior (misma clasificación)
      const itemsAnt = datosPorClasifAnt[clasifKey]?.items || [];
      const tAnt = calcTotales(itemsAnt);
      
      // Acumulado al mes actual (año actual y anterior)
      const itemsAcum = g.items.filter(i => i.month <= mesActual);
      const itemsAcumAnt = itemsAnt.filter(i => i.month <= mesActual);
      const tAcum = calcTotales(itemsAcum);
      const tAcumAnt = calcTotales(itemsAcumAnt);
      
      // Solo mes actual vs mismo mes año anterior
      const itemsMes = g.items.filter(i => i.month === mesActual);
      const itemsMesAnt = itemsAnt.filter(i => i.month === mesActual);
      const tMes = calcTotales(itemsMes);
      const tMesAnt = calcTotales(itemsMesAnt);
      
      return {
        clasificacion: g.nombre,
        ventaNeta: t.ventaNeta,
        margen: t.margen,
        cajas: t.cajas,
        facturas: t.facturas,
        rentabilidad: t.rentabilidad,
        participacion: totals.ventaNeta > 0 ? (t.ventaNeta / totals.ventaNeta) * 100 : 0,
        // Variación mes actual
        ventaNetaMes: tMes.ventaNeta,
        ventaNetaMesAnt: tMesAnt.ventaNeta,
        varMes: tMesAnt.ventaNeta > 0 ? ((tMes.ventaNeta - tMesAnt.ventaNeta) / tMesAnt.ventaNeta) * 100 : 0,
        // Variación año completo
        ventaNetaAnt: tAnt.ventaNeta,
        varYoY: tAnt.ventaNeta > 0 ? ((t.ventaNeta - tAnt.ventaNeta) / tAnt.ventaNeta) * 100 : 0,
        // Variación acumulado al mes
        ventaNetaAcum: tAcum.ventaNeta,
        ventaNetaAcumAnt: tAcumAnt.ventaNeta,
        varYoYAcum: tAcumAnt.ventaNeta > 0 ? ((tAcum.ventaNeta - tAcumAnt.ventaNeta) / tAcumAnt.ventaNeta) * 100 : 0
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);

    // CATEGORÍAS con variación YoY
    const catMap = {};
    const catMapAnt = {};
    
    datosAnio.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMap[cat]) catMap[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      catMap[cat].neto += item.neto;
      catMap[cat].margen += item.margen;
      catMap[cat].cajas += item.cajas;
      if (item.month === mesActual) catMap[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMap[cat].netoAcum += item.neto;
    });
    
    datosAnterior.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapAnt[cat]) catMapAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
      catMapAnt[cat].neto += item.neto;
      if (item.month === mesActual) catMapAnt[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapAnt[cat].netoAcum += item.neto;
    });
    
    const categorias = Object.values(catMap).map(c => {
      const ant = catMapAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        categoria: c.categoria,
        ventaNeta: Math.round(c.neto),
        margen: Math.round(c.margen),
        cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        // Variación mes
        ventaNetaMes: Math.round(c.netoMes),
        ventaNetaMesAnt: Math.round(ant.netoMes),
        varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        // Variación año
        ventaNetaAnt: Math.round(ant.neto),
        varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
        // Variación acumulado
        ventaNetaAcum: Math.round(c.netoAcum),
        ventaNetaAcumAnt: Math.round(ant.netoAcum),
        varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);

    // MARCAS con variación YoY
    const marcaMap = {};
    const marcaMapAnt = {};
    
    datosAnio.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!marcaMap[marca]) marcaMap[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      marcaMap[marca].neto += item.neto;
      marcaMap[marca].margen += item.margen;
      marcaMap[marca].cajas += item.cajas;
      if (item.month === mesActual) marcaMap[marca].netoMes += item.neto;
      if (item.month <= mesActual) marcaMap[marca].netoAcum += item.neto;
    });
    
    datosAnterior.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!marcaMapAnt[marca]) marcaMapAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
      marcaMapAnt[marca].neto += item.neto;
      if (item.month === mesActual) marcaMapAnt[marca].netoMes += item.neto;
      if (item.month <= mesActual) marcaMapAnt[marca].netoAcum += item.neto;
    });
    
    const marcas = Object.values(marcaMap).map(m => {
      const ant = marcaMapAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        marca: m.marca,
        ventaNeta: Math.round(m.neto),
        margen: Math.round(m.margen),
        cajas: Math.round(m.cajas),
        rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
        // Variación mes
        ventaNetaMes: Math.round(m.netoMes),
        ventaNetaMesAnt: Math.round(ant.netoMes),
        varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        // Variación año
        ventaNetaAnt: Math.round(ant.neto),
        varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
        // Variación acumulado
        ventaNetaAcum: Math.round(m.netoAcum),
        ventaNetaAcumAnt: Math.round(ant.netoAcum),
        varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);

    // DATOS POR CLASIFICACIÓN (para filtros)
    const monthsByClasificacion = {};
    const monthsAnteriorByClasificacion = {};  // ← NUEVO
    const categoriasByClasificacion = {};
    const marcasByClasificacion = {};
    
    Object.keys(datosPorClasif).forEach(clasifKey => {
      const datosClasif = datosPorClasif[clasifKey].items;
      const datosClasifAnt = datosPorClasifAnt[clasifKey]?.items || [];  // ← NUEVO
      
      // Pre-agrupar por mes dentro de clasificación (año actual Y anterior)
      const porMesClasif = {};
      const porMesClasifAnt = {};  // ← NUEVO
      for (let m = 1; m <= 12; m++) {
        porMesClasif[m] = [];
        porMesClasifAnt[m] = [];  // ← NUEVO
      }
      datosClasif.forEach(item => porMesClasif[item.month].push(item));
      datosClasifAnt.forEach(item => porMesClasifAnt[item.month].push(item));  // ← NUEVO
      
      // Meses año actual Y anterior
      const mesesClasif = [];
      const mesesClasifAnt = [];  // ← NUEVO
      for (let m = 1; m <= 12; m++) {
        const totMes = calcTotales(porMesClasif[m]);
        const totMesAnt = calcTotales(porMesClasifAnt[m]);  // ← NUEVO
        totMes.label = meses[m - 1];
        totMes.mes = m;
        totMesAnt.label = meses[m - 1];  // ← NUEVO
        totMesAnt.mes = m;  // ← NUEVO
        totMes.yoyVentas = totMesAnt.ventaNeta > 0 
          ? ((totMes.ventaNeta - totMesAnt.ventaNeta) / totMesAnt.ventaNeta) * 100 
          : 0;  // ← NUEVO
        mesesClasif.push(totMes);
        mesesClasifAnt.push(totMesAnt);  // ← NUEVO
      }
      monthsByClasificacion[clasifKey] = mesesClasif;
      monthsAnteriorByClasificacion[clasifKey] = mesesClasifAnt;  // ← NUEVO
      
      // Categorías por clasificación CON VARIACIONES
      const catMapClasif = {};
      const catMapClasifAnt = {};
      datosClasif.forEach(item => {
        const cat = (item.categoria || 'Sin categoría').trim();
        if (!catMapClasif[cat]) catMapClasif[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
        catMapClasif[cat].neto += item.neto;
        catMapClasif[cat].margen += item.margen;
        catMapClasif[cat].cajas += item.cajas;
        if (item.month === mesActual) catMapClasif[cat].netoMes += item.neto;
        if (item.month <= mesActual) catMapClasif[cat].netoAcum += item.neto;
      });
      datosClasifAnt.forEach(item => {
        const cat = (item.categoria || 'Sin categoría').trim();
        if (!catMapClasifAnt[cat]) catMapClasifAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
        catMapClasifAnt[cat].neto += item.neto;
        if (item.month === mesActual) catMapClasifAnt[cat].netoMes += item.neto;
        if (item.month <= mesActual) catMapClasifAnt[cat].netoAcum += item.neto;
      });
      categoriasByClasificacion[clasifKey] = Object.values(catMapClasif).map(c => {
        const ant = catMapClasifAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
        return {
          categoria: c.categoria,
          ventaNeta: Math.round(c.neto),
          margen: Math.round(c.margen),
          cajas: Math.round(c.cajas),
          rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
          ventaNetaMes: Math.round(c.netoMes),
          ventaNetaMesAnt: Math.round(ant.netoMes),
          varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
          ventaNetaAcum: Math.round(c.netoAcum),
          ventaNetaAcumAnt: Math.round(ant.netoAcum),
          varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
          ventaNetaAnt: Math.round(ant.neto),
          varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0
        };
      }).sort((a, b) => b.ventaNeta - a.ventaNeta);
      
      // Marcas por clasificación CON VARIACIONES
      const marcaMapClasif = {};
      const marcaMapClasifAnt = {};
      datosClasif.forEach(item => {
        const marca = (item.marca || 'Sin marca').trim();
        if (!marcaMapClasif[marca]) marcaMapClasif[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
        marcaMapClasif[marca].neto += item.neto;
        marcaMapClasif[marca].margen += item.margen;
        marcaMapClasif[marca].cajas += item.cajas;
        if (item.month === mesActual) marcaMapClasif[marca].netoMes += item.neto;
        if (item.month <= mesActual) marcaMapClasif[marca].netoAcum += item.neto;
      });
      datosClasifAnt.forEach(item => {
        const marca = (item.marca || 'Sin marca').trim();
        if (!marcaMapClasifAnt[marca]) marcaMapClasifAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
        marcaMapClasifAnt[marca].neto += item.neto;
        if (item.month === mesActual) marcaMapClasifAnt[marca].netoMes += item.neto;
        if (item.month <= mesActual) marcaMapClasifAnt[marca].netoAcum += item.neto;
      });
      marcasByClasificacion[clasifKey] = Object.values(marcaMapClasif).map(m => {
        const ant = marcaMapClasifAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
        return {
          marca: m.marca,
          ventaNeta: Math.round(m.neto),
          margen: Math.round(m.margen),
          cajas: Math.round(m.cajas),
          rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
          ventaNetaMes: Math.round(m.netoMes),
          ventaNetaMesAnt: Math.round(ant.netoMes),
          varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
          ventaNetaAcum: Math.round(m.netoAcum),
          ventaNetaAcumAnt: Math.round(ant.netoAcum),
          varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
          ventaNetaAnt: Math.round(ant.neto),
          varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0
        };
      }).sort((a, b) => b.ventaNeta - a.ventaNeta);
    });

    // ========== DATOS POR MES (para filtro de mes) CON VARIACIONES YoY ==========
    const categoriasByMes = {};
    const marcasByMes = {};
    const clasificacionesByMes = {};
    
    for (let m = 1; m <= 12; m++) {
      const datosMes = datosPorMes[m];
      const datosMesAnt = datosPorMesAnt[m];
      
      if (datosMes.length === 0) continue;
      
      // Categorías del mes CON variaciones
      const catMesMap = {};
      const catMesMapAnt = {};
      datosMes.forEach(item => {
        const cat = (item.categoria || 'Sin categoría').trim();
        if (!catMesMap[cat]) catMesMap[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0 };
        catMesMap[cat].neto += item.neto;
        catMesMap[cat].margen += item.margen;
        catMesMap[cat].cajas += item.cajas;
      });
      datosMesAnt.forEach(item => {
        const cat = (item.categoria || 'Sin categoría').trim();
        if (!catMesMapAnt[cat]) catMesMapAnt[cat] = { neto: 0 };
        catMesMapAnt[cat].neto += item.neto;
      });
      categoriasByMes[m] = Object.values(catMesMap).map(c => {
        const ant = catMesMapAnt[c.categoria] || { neto: 0 };
        const varYoY = ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : (c.neto > 0 ? 100 : 0);
        return {
          categoria: c.categoria,
          ventaNeta: Math.round(c.neto),
          margen: Math.round(c.margen),
          cajas: Math.round(c.cajas),
          rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
          varMes: varYoY,
          varYoYAcum: varYoY,
          varYoY: varYoY,
          ventaNetaAnt: Math.round(ant.neto)
        };
      }).sort((a, b) => b.ventaNeta - a.ventaNeta);
      
      // Marcas del mes CON variaciones
      const marcaMesMap = {};
      const marcaMesMapAnt = {};
      datosMes.forEach(item => {
        const marca = (item.marca || 'Sin marca').trim();
        if (!marcaMesMap[marca]) marcaMesMap[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0 };
        marcaMesMap[marca].neto += item.neto;
        marcaMesMap[marca].margen += item.margen;
        marcaMesMap[marca].cajas += item.cajas;
      });
      datosMesAnt.forEach(item => {
        const marca = (item.marca || 'Sin marca').trim();
        if (!marcaMesMapAnt[marca]) marcaMesMapAnt[marca] = { neto: 0 };
        marcaMesMapAnt[marca].neto += item.neto;
      });
      marcasByMes[m] = Object.values(marcaMesMap).map(mr => {
        const ant = marcaMesMapAnt[mr.marca] || { neto: 0 };
        const varYoY = ant.neto > 0 ? ((mr.neto - ant.neto) / ant.neto) * 100 : (mr.neto > 0 ? 100 : 0);
        return {
          marca: mr.marca,
          ventaNeta: Math.round(mr.neto),
          margen: Math.round(mr.margen),
          cajas: Math.round(mr.cajas),
          rentabilidad: mr.neto > 0 ? (mr.margen / mr.neto) * 100 : 0,
          varMes: varYoY,
          varYoYAcum: varYoY,
          varYoY: varYoY,
          ventaNetaAnt: Math.round(ant.neto)
        };
      }).sort((a, b) => b.ventaNeta - a.ventaNeta);
      
      // Clasificaciones del mes CON variaciones
      const clasifMesMap = {};
      const clasifMesMapAnt = {};
      datosMes.forEach(item => {
        const clasif = (item.clasificacion || 'Sin clasificar').trim();
        if (!clasifMesMap[clasif]) clasifMesMap[clasif] = { clasificacion: clasif, neto: 0, margen: 0, cajas: 0, facturas: new Set() };
        clasifMesMap[clasif].neto += item.neto;
        clasifMesMap[clasif].margen += item.margen;
        clasifMesMap[clasif].cajas += item.cajas;
        clasifMesMap[clasif].facturas.add(item.factura);
      });
      datosMesAnt.forEach(item => {
        const clasif = (item.clasificacion || 'Sin clasificar').trim();
        if (!clasifMesMapAnt[clasif]) clasifMesMapAnt[clasif] = { neto: 0 };
        clasifMesMapAnt[clasif].neto += item.neto;
      });
      clasificacionesByMes[m] = Object.values(clasifMesMap).map(c => {
        const ant = clasifMesMapAnt[c.clasificacion] || { neto: 0 };
        const varYoY = ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : (c.neto > 0 ? 100 : 0);
        return {
          clasificacion: c.clasificacion,
          ventaNeta: Math.round(c.neto),
          margen: Math.round(c.margen),
          cajas: Math.round(c.cajas),
          facturas: c.facturas.size,
          rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
          varMes: varYoY,
          varYoYAcum: varYoY,
          varYoY: varYoY,
          ventaNetaAnt: Math.round(ant.neto)
        };
      }).sort((a, b) => b.ventaNeta - a.ventaNeta);
    }

    const result = {
      ok: true,
      year: year,
      fechaInforme: fechaInforme,
      mesActual: mesActual,
      totals,
      months,
      monthsAnterior,
      clasificaciones,
      categorias,
      marcas,
      monthsByClasificacion,
      monthsAnteriorByClasificacion,
      categoriasByClasificacion,
      marcasByClasificacion,
      // Datos por mes
      categoriasByMes,
      marcasByMes,
      clasificacionesByMes,
      // Datos segmentados
      mayorista: (() => { try { return calcularSegmento(datosAnio, datosAnterior, 'MAYORISTA', 'ejecutivo', mesActual, calcTotales); } catch(e) { Logger.log('Error mayorista: ' + e.message); return null; } })(),
      supermercado: (() => { try { return calcularSegmento(datosAnio, datosAnterior, 'SUPERMERCADO', 'cliente', mesActual, calcTotales); } catch(e) { Logger.log('Error supermercado: ' + e.message); return null; } })()
    };

    // 3. Guardar en caché
    _saveToCache(year, result);

    const endTime = new Date().getTime();
    Logger.log('✅ Procesamiento completo en ' + (endTime - startTime) + 'ms');

    return result;

  } catch (e) {
    Logger.log('❌ Error en apiVentasExecGetResumen: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/**
 * Obtener años disponibles (también cacheado)
 */
function apiVentasExecGetAnios() {
  try {
    Logger.log('🔍 Iniciando apiVentasExecGetAnios...');
    const cache = _getCache();
    const key = 'VENTAS_EXEC_ANIOS';
    
    // Intentar caché
    const cached = cache.get(key);
    if (cached) {
      Logger.log('✅ Años desde caché');
      return JSON.parse(cached);
    }
    
    Logger.log('📖 Leyendo datos para obtener años...');
    const { ok, error, data } = _c_readMaestroVenta();
    Logger.log('📖 Resultado lectura: ok=' + ok + ', registros=' + (data ? data.length : 0));
    
    if (!ok) {
      Logger.log('❌ Error en lectura: ' + error);
      return [new Date().getFullYear()];
    }
    
    const anios = new Set();
    data.forEach(item => {
      if (item.year) anios.add(item.year);
    });
    
    const result = Array.from(anios).sort((a, b) => b - a);
    Logger.log('📅 Años encontrados: ' + JSON.stringify(result));
    
    // Guardar en caché por 1 hora
    cache.put(key, JSON.stringify(result), 3600);
    
    return result;
  } catch (e) {
    Logger.log('❌ Error en apiVentasExecGetAnios: ' + e.message + '\n' + e.stack);
    return [new Date().getFullYear()];
  }
}


/**
 * DEBUG: Ver estado del caché
 */
function apiVentasExecDebug() {
  try {
    const ss = _c_ss();
    const sh = ss.getSheetByName(COM_CONFIG.HOJAS.MAESTRO);
    if (!sh) return { ok: false, error: 'Hoja no encontrada' };
    
    const currentYear = new Date().getFullYear();
    const cache = _getCache();
    
    const cacheStatus = {};
    for (let y = currentYear - 2; y <= currentYear; y++) {
      const key = _getCacheKey(y);
      cacheStatus[y] = cache.get(key) ? 'CACHED' : 'NOT CACHED';
    }
    
    return { 
      ok: true, 
      hoja: COM_CONFIG.HOJAS.MAESTRO,
      filas: sh.getLastRow(),
      columnas: sh.getLastColumn(),
      cacheTTL: COM_CONFIG.CACHE_TTL + ' segundos',
      cacheStatus: cacheStatus
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/* ===== APIs legacy ===== */
function _c_readNVBaseAdvanced() { return _c_readMaestroVenta(); }

function apiComGetAdvancedAnalytics(){
  try {
    const { ok, error, data } = _c_readMaestroVenta();
    if (!ok) return { ok: false, error };
    return { ok: true, data };
  } catch(e) { return { ok: false, error: e.message }; }
}

function apiComGetPortafolio(status){
  try {
    const { ok, error, data } = _c_readMaestroVenta();
    if (!ok) return { ok: false, error };
    const nvGroups = {};
    data.forEach(item => {
      const key = item.factura || 'SIN-ID';
      if (!nvGroups[key]) {
        nvGroups[key] = { numeroNV: key, fecha: item.fecha, total: 0 };
      }
      nvGroups[key].total += item.neto || 0;
    });
    return { ok: true, items: Object.values(nvGroups).map(x => ({ ...x, total: Math.round(x.total) })) };
  } catch(e) { return { ok: false, error: e.message }; }
}

function apiComDebugPing(){
  try {
    const sh = _c_ss().getSheetByName(COM_CONFIG.HOJAS.MAESTRO);
    if (!sh) return { ok: false, msg: 'Hoja no encontrada' };
    return { ok: true, lastRow: sh.getLastRow(), lastCol: sh.getLastColumn() };
  } catch(e) { return { ok: false, msg: e.message }; }
}

function _c_normalizeText(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/\s+/g, ' '); // Espacios múltiples a uno
}

/* ===== FUNCIÓN PARA CALCULAR SEGMENTOS (Mayorista/Supermercado) - ACTUALIZADA ===== */
/* 
   CAMBIOS: Se agregaron 3 nuevas estructuras de datos para soportar filtrado por mes:
   - itemsByMes: Ejecutivos/Clientes agrupados por cada mes
   - categoriasByMes: Categorías agrupadas por cada mes dentro del segmento
   - marcasByMes: Marcas agrupadas por cada mes dentro del segmento
*/
function calcularSegmento(datosAnio, datosAnterior, clasificacionFiltro, campoPrincipal, mesActual, calcTotales) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Filtrar por clasificación
  const datos = datosAnio.filter(i => (i.clasificacion || '').toUpperCase() === clasificacionFiltro);
  const datosAnt = datosAnterior.filter(i => (i.clasificacion || '').toUpperCase() === clasificacionFiltro);
  
  if (datos.length === 0) {
    return { totals: { ventaNeta: 0, margen: 0, cajas: 0, facturas: 0, rentabilidad: 0 }, items: [], months: [], categorias: [], marcas: [], itemsByMes: {}, categoriasByMes: {}, marcasByMes: {} };
  }
  
  // Totales del segmento
  const totals = calcTotales(datos);
  const totalsAnt = calcTotales(datosAnt);
  totals.yoyVentas = totalsAnt.ventaNeta > 0 ? ((totals.ventaNeta - totalsAnt.ventaNeta) / totalsAnt.ventaNeta) * 100 : 0;
  
  // Totales mes actual
  const datosMes = datos.filter(i => i.month === mesActual);
  const datosMesAnt = datosAnt.filter(i => i.month === mesActual);
  const totalsMes = calcTotales(datosMes);
  const totalsMesAnt = calcTotales(datosMesAnt);
  totalsMes.yoyVentas = totalsMesAnt.ventaNeta > 0 ? ((totalsMes.ventaNeta - totalsMesAnt.ventaNeta) / totalsMesAnt.ventaNeta) * 100 : 0;
  
  // Agrupar por campo principal (ejecutivo o cliente)
  const itemsMap = {};
  const itemsMapAnt = {};
  
  datos.forEach(item => {
    const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
    if (!itemsMap[key]) itemsMap[key] = { nombre: key, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0, facturas: new Set() };
    itemsMap[key].neto += item.neto;
    itemsMap[key].margen += item.margen;
    itemsMap[key].cajas += item.cajas;
    itemsMap[key].facturas.add(item.factura);
    if (item.month === mesActual) itemsMap[key].netoMes += item.neto;
    if (item.month <= mesActual) itemsMap[key].netoAcum += item.neto;
  });
  
  datosAnt.forEach(item => {
    const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
    if (!itemsMapAnt[key]) itemsMapAnt[key] = { neto: 0, netoMes: 0, netoAcum: 0 };
    itemsMapAnt[key].neto += item.neto;
    if (item.month === mesActual) itemsMapAnt[key].netoMes += item.neto;
    if (item.month <= mesActual) itemsMapAnt[key].netoAcum += item.neto;
  });
  
  const items = Object.values(itemsMap).map(x => {
    const ant = itemsMapAnt[x.nombre] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      nombre: x.nombre,
      ventaNeta: Math.round(x.neto),
      margen: Math.round(x.margen),
      cajas: Math.round(x.cajas),
      facturas: x.facturas.size,
      rentabilidad: x.neto > 0 ? (x.margen / x.neto) * 100 : 0,
      participacion: totals.ventaNeta > 0 ? (x.neto / totals.ventaNeta) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((x.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((x.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((x.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(x.netoMes),
      ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(x.netoAcum),
      ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // Pre-agrupar datos por mes
  const datosPorMes = {};
  const datosPorMesAnt = {};
  for (let m = 1; m <= 12; m++) {
    datosPorMes[m] = datos.filter(i => i.month === m);
    datosPorMesAnt[m] = datosAnt.filter(i => i.month === m);
  }
  
  // Meses del segmento
  const months = [];
  const monthsAnterior = [];
  for (let m = 1; m <= 12; m++) {
    const totMes = calcTotales(datosPorMes[m]);
    const totMesAnt = calcTotales(datosPorMesAnt[m]);
    totMes.label = meses[m - 1];
    totMes.mes = m;
    totMesAnt.label = meses[m - 1];
    totMesAnt.mes = m;
    totMes.yoyVentas = totMesAnt.ventaNeta > 0 ? ((totMes.ventaNeta - totMesAnt.ventaNeta) / totMesAnt.ventaNeta) * 100 : 0;
    months.push(totMes);
    monthsAnterior.push(totMesAnt);
  }
  
  // Categorías del segmento (totales)
  const catMap = {};
  const catMapAnt = {};
  datos.forEach(item => {
    const cat = (item.categoria || 'Sin categoría').trim();
    if (!catMap[cat]) catMap[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
    catMap[cat].neto += item.neto;
    catMap[cat].margen += item.margen;
    catMap[cat].cajas += item.cajas;
    if (item.month === mesActual) catMap[cat].netoMes += item.neto;
    if (item.month <= mesActual) catMap[cat].netoAcum += item.neto;
  });
  datosAnt.forEach(item => {
    const cat = (item.categoria || 'Sin categoría').trim();
    if (!catMapAnt[cat]) catMapAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
    catMapAnt[cat].neto += item.neto;
    if (item.month === mesActual) catMapAnt[cat].netoMes += item.neto;
    if (item.month <= mesActual) catMapAnt[cat].netoAcum += item.neto;
  });
  const categorias = Object.values(catMap).map(c => {
    const ant = catMapAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      categoria: c.categoria,
      ventaNeta: Math.round(c.neto),
      margen: Math.round(c.margen),
      cajas: Math.round(c.cajas),
      rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(c.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(c.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // Marcas del segmento (totales)
  const marcaMap = {};
  const marcaMapAnt = {};
  datos.forEach(item => {
    const marca = (item.marca || 'Sin marca').trim();
    if (!marcaMap[marca]) marcaMap[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
    marcaMap[marca].neto += item.neto;
    marcaMap[marca].margen += item.margen;
    marcaMap[marca].cajas += item.cajas;
    if (item.month === mesActual) marcaMap[marca].netoMes += item.neto;
    if (item.month <= mesActual) marcaMap[marca].netoAcum += item.neto;
  });
  datosAnt.forEach(item => {
    const marca = (item.marca || 'Sin marca').trim();
    if (!marcaMapAnt[marca]) marcaMapAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
    marcaMapAnt[marca].neto += item.neto;
    if (item.month === mesActual) marcaMapAnt[marca].netoMes += item.neto;
    if (item.month <= mesActual) marcaMapAnt[marca].netoAcum += item.neto;
  });
  const marcas = Object.values(marcaMap).map(m => {
    const ant = marcaMapAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      marca: m.marca,
      ventaNeta: Math.round(m.neto),
      margen: Math.round(m.margen),
      cajas: Math.round(m.cajas),
      rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(m.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(m.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // ===== AGRUPACIONES POR ITEM (ejecutivo/cliente) para filtros =====
  const topItems = items.slice(0, 10).map(i => i.nombre);
  
  // Categorías por Item
  const categoriasByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const catMapItem = {};
    const catMapItemAnt = {};
    datosItem.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapItem[cat]) catMapItem[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      catMapItem[cat].neto += item.neto;
      catMapItem[cat].margen += item.margen;
      catMapItem[cat].cajas += item.cajas;
      if (item.month === mesActual) catMapItem[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapItem[cat].netoAcum += item.neto;
    });
    datosItemAnt.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapItemAnt[cat]) catMapItemAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
      catMapItemAnt[cat].neto += item.neto;
      if (item.month === mesActual) catMapItemAnt[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapItemAnt[cat].netoAcum += item.neto;
    });
    categoriasByItem[itemName] = Object.values(catMapItem).map(c => {
      const ant = catMapItemAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        categoria: c.categoria, ventaNeta: Math.round(c.neto), margen: Math.round(c.margen), cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
        varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
        ventaNetaMes: Math.round(c.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
        ventaNetaAcum: Math.round(c.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum), ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta).slice(0, 15);
  });
  
  // Marcas por Item
  const marcasByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const mMapItem = {};
    const mMapItemAnt = {};
    datosItem.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!mMapItem[marca]) mMapItem[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      mMapItem[marca].neto += item.neto;
      mMapItem[marca].margen += item.margen;
      mMapItem[marca].cajas += item.cajas;
      if (item.month === mesActual) mMapItem[marca].netoMes += item.neto;
      if (item.month <= mesActual) mMapItem[marca].netoAcum += item.neto;
    });
    datosItemAnt.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!mMapItemAnt[marca]) mMapItemAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
      mMapItemAnt[marca].neto += item.neto;
      if (item.month === mesActual) mMapItemAnt[marca].netoMes += item.neto;
      if (item.month <= mesActual) mMapItemAnt[marca].netoAcum += item.neto;
    });
    marcasByItem[itemName] = Object.values(mMapItem).map(m => {
      const ant = mMapItemAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        marca: m.marca, ventaNeta: Math.round(m.neto), margen: Math.round(m.margen), cajas: Math.round(m.cajas),
        rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
        varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
        varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
        ventaNetaMes: Math.round(m.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
        ventaNetaAcum: Math.round(m.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum), ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta).slice(0, 15);
  });
  
  // Meses por Item
  const monthsByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const mesesItem = [];
    const mesesItemAnt = [];
    for (let m = 1; m <= 12; m++) {
      const mesData = datosItem.filter(i => i.month === m);
      const mesDataAnt = datosItemAnt.filter(i => i.month === m);
      const totMes = calcTotales(mesData);
      const totMesAnt = calcTotales(mesDataAnt);
      totMes.label = meses[m - 1];
      totMes.mes = m;
      totMesAnt.label = meses[m - 1];
      totMesAnt.mes = m;
      mesesItem.push(totMes);
      mesesItemAnt.push(totMesAnt);
    }
    monthsByItem[itemName] = { months: mesesItem, monthsAnterior: mesesItemAnt };
  });
  
  // ===== AGRUPACIONES POR MES (para filtro de mes) =====
  
  // Items (ejecutivos/clientes) por Mes
  const itemsByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMesActual = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    
    if (datosMesActual.length === 0) continue;
    
    const itemsMapMes = {};
    const itemsMapMesAnt = {};
    
    datosMesActual.forEach(item => {
      const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
      if (!itemsMapMes[key]) itemsMapMes[key] = { nombre: key, neto: 0, margen: 0, cajas: 0, facturas: new Set() };
      itemsMapMes[key].neto += item.neto;
      itemsMapMes[key].margen += item.margen;
      itemsMapMes[key].cajas += item.cajas;
      itemsMapMes[key].facturas.add(item.factura);
    });
    
    datosMesAnt.forEach(item => {
      const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
      if (!itemsMapMesAnt[key]) itemsMapMesAnt[key] = { neto: 0 };
      itemsMapMesAnt[key].neto += item.neto;
    });
    
    const totalMes = calcTotales(datosMesActual);
    
    itemsByMes[m] = Object.values(itemsMapMes).map(x => {
      const ant = itemsMapMesAnt[x.nombre] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((x.neto - ant.neto) / ant.neto) * 100 : (x.neto > 0 ? 100 : 0);
      return {
        nombre: x.nombre,
        ventaNeta: Math.round(x.neto),
        margen: Math.round(x.margen),
        cajas: Math.round(x.cajas),
        facturas: x.facturas.size,
        rentabilidad: x.neto > 0 ? (x.margen / x.neto) * 100 : 0,
        participacion: totalMes.ventaNeta > 0 ? (x.neto / totalMes.ventaNeta) * 100 : 0,
        varMes: varYoY,
        varYoYAcum: varYoY,
        varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  // Categorías por Mes
  const categoriasByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMesActual = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    
    if (datosMesActual.length === 0) continue;
    
    const catMapMes = {};
    const catMapMesAnt = {};
    
    datosMesActual.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapMes[cat]) catMapMes[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0 };
      catMapMes[cat].neto += item.neto;
      catMapMes[cat].margen += item.margen;
      catMapMes[cat].cajas += item.cajas;
    });
    
    datosMesAnt.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapMesAnt[cat]) catMapMesAnt[cat] = { neto: 0 };
      catMapMesAnt[cat].neto += item.neto;
    });
    
    categoriasByMes[m] = Object.values(catMapMes).map(c => {
      const ant = catMapMesAnt[c.categoria] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : (c.neto > 0 ? 100 : 0);
      return {
        categoria: c.categoria,
        ventaNeta: Math.round(c.neto),
        margen: Math.round(c.margen),
        cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: varYoY,
        varYoYAcum: varYoY,
        varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  // Marcas por Mes
  const marcasByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMesActual = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    
    if (datosMesActual.length === 0) continue;
    
    const marcaMapMes = {};
    const marcaMapMesAnt = {};
    
    datosMesActual.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!marcaMapMes[marca]) marcaMapMes[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0 };
      marcaMapMes[marca].neto += item.neto;
      marcaMapMes[marca].margen += item.margen;
      marcaMapMes[marca].cajas += item.cajas;
    });
    
    datosMesAnt.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!marcaMapMesAnt[marca]) marcaMapMesAnt[marca] = { neto: 0 };
      marcaMapMesAnt[marca].neto += item.neto;
    });
    
    marcasByMes[m] = Object.values(marcaMapMes).map(mr => {
      const ant = marcaMapMesAnt[mr.marca] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((mr.neto - ant.neto) / ant.neto) * 100 : (mr.neto > 0 ? 100 : 0);
      return {
        marca: mr.marca,
        ventaNeta: Math.round(mr.neto),
        margen: Math.round(mr.margen),
        cajas: Math.round(mr.cajas),
        rentabilidad: mr.neto > 0 ? (mr.margen / mr.neto) * 100 : 0,
        varMes: varYoY,
        varYoYAcum: varYoY,
        varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  return {
    totals: totals,
    totalsMes: totalsMes,
    items: items,
    months: months,
    monthsAnterior: monthsAnterior,
    categorias: categorias,
    marcas: marcas,
    categoriasByItem: categoriasByItem,
    marcasByItem: marcasByItem,
    monthsByItem: monthsByItem,
    itemsByMes: itemsByMes,
    categoriasByMes: categoriasByMes,
    marcasByMes: marcasByMes
  };
}


/* ===== FUNCIÓN PARA CALCULAR SEGMENTOS (Mayorista/Supermercado) - ACTUALIZADA ===== */
/* 
   CAMBIOS: Se agregaron 3 nuevas estructuras de datos para soportar filtrado por mes:
   - itemsByMes: Ejecutivos/Clientes agrupados por cada mes
   - categoriasByMes: Categorías agrupadas por cada mes dentro del segmento
   - marcasByMes: Marcas agrupadas por cada mes dentro del segmento
*/
function calcularSegmento(datosAnio, datosAnterior, clasificacionFiltro, campoPrincipal, mesActual, calcTotales) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Filtrar por clasificación
  const datos = datosAnio.filter(i => (i.clasificacion || '').toUpperCase() === clasificacionFiltro);
  const datosAnt = datosAnterior.filter(i => (i.clasificacion || '').toUpperCase() === clasificacionFiltro);
  
  if (datos.length === 0) {
    return { totals: { ventaNeta: 0, margen: 0, cajas: 0, facturas: 0, rentabilidad: 0 }, items: [], months: [], categorias: [], marcas: [], itemsByMes: {}, categoriasByMes: {}, marcasByMes: {} };
  }
  
  // Totales del segmento
  const totals = calcTotales(datos);
  const totalsAnt = calcTotales(datosAnt);
  totals.yoyVentas = totalsAnt.ventaNeta > 0 ? ((totals.ventaNeta - totalsAnt.ventaNeta) / totalsAnt.ventaNeta) * 100 : 0;
  
  // Totales mes actual
  const datosMes = datos.filter(i => i.month === mesActual);
  const datosMesAnt = datosAnt.filter(i => i.month === mesActual);
  const totalsMes = calcTotales(datosMes);
  const totalsMesAnt = calcTotales(datosMesAnt);
  totalsMes.yoyVentas = totalsMesAnt.ventaNeta > 0 ? ((totalsMes.ventaNeta - totalsMesAnt.ventaNeta) / totalsMesAnt.ventaNeta) * 100 : 0;
  
  // Agrupar por campo principal (ejecutivo o cliente)
  const itemsMap = {};
  const itemsMapAnt = {};
  
  datos.forEach(item => {
    const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
    if (!itemsMap[key]) itemsMap[key] = { nombre: key, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0, facturas: new Set() };
    itemsMap[key].neto += item.neto;
    itemsMap[key].margen += item.margen;
    itemsMap[key].cajas += item.cajas;
    itemsMap[key].facturas.add(item.factura);
    if (item.month === mesActual) itemsMap[key].netoMes += item.neto;
    if (item.month <= mesActual) itemsMap[key].netoAcum += item.neto;
  });
  
  datosAnt.forEach(item => {
    const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
    if (!itemsMapAnt[key]) itemsMapAnt[key] = { neto: 0, netoMes: 0, netoAcum: 0 };
    itemsMapAnt[key].neto += item.neto;
    if (item.month === mesActual) itemsMapAnt[key].netoMes += item.neto;
    if (item.month <= mesActual) itemsMapAnt[key].netoAcum += item.neto;
  });
  
  const items = Object.values(itemsMap).map(x => {
    const ant = itemsMapAnt[x.nombre] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      nombre: x.nombre,
      ventaNeta: Math.round(x.neto),
      margen: Math.round(x.margen),
      cajas: Math.round(x.cajas),
      facturas: x.facturas.size,
      rentabilidad: x.neto > 0 ? (x.margen / x.neto) * 100 : 0,
      participacion: totals.ventaNeta > 0 ? (x.neto / totals.ventaNeta) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((x.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((x.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((x.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(x.netoMes),
      ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(x.netoAcum),
      ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // Pre-agrupar datos por mes
  const datosPorMes = {};
  const datosPorMesAnt = {};
  for (let m = 1; m <= 12; m++) {
    datosPorMes[m] = datos.filter(i => i.month === m);
    datosPorMesAnt[m] = datosAnt.filter(i => i.month === m);
  }
  
  // Meses del segmento
  const months = [];
  const monthsAnterior = [];
  for (let m = 1; m <= 12; m++) {
    const totMes = calcTotales(datosPorMes[m]);
    const totMesAnt = calcTotales(datosPorMesAnt[m]);
    totMes.label = meses[m - 1];
    totMes.mes = m;
    totMesAnt.label = meses[m - 1];
    totMesAnt.mes = m;
    totMes.yoyVentas = totMesAnt.ventaNeta > 0 ? ((totMes.ventaNeta - totMesAnt.ventaNeta) / totMesAnt.ventaNeta) * 100 : 0;
    months.push(totMes);
    monthsAnterior.push(totMesAnt);
  }
  
  // Categorías del segmento (totales)
  const catMap = {};
  const catMapAnt = {};
  datos.forEach(item => {
    const cat = (item.categoria || 'Sin categoría').trim();
    if (!catMap[cat]) catMap[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
    catMap[cat].neto += item.neto;
    catMap[cat].margen += item.margen;
    catMap[cat].cajas += item.cajas;
    if (item.month === mesActual) catMap[cat].netoMes += item.neto;
    if (item.month <= mesActual) catMap[cat].netoAcum += item.neto;
  });
  datosAnt.forEach(item => {
    const cat = (item.categoria || 'Sin categoría').trim();
    if (!catMapAnt[cat]) catMapAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
    catMapAnt[cat].neto += item.neto;
    if (item.month === mesActual) catMapAnt[cat].netoMes += item.neto;
    if (item.month <= mesActual) catMapAnt[cat].netoAcum += item.neto;
  });
  const categorias = Object.values(catMap).map(c => {
    const ant = catMapAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      categoria: c.categoria,
      ventaNeta: Math.round(c.neto),
      margen: Math.round(c.margen),
      cajas: Math.round(c.cajas),
      rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(c.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(c.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // Marcas del segmento (totales)
  const marcaMap = {};
  const marcaMapAnt = {};
  datos.forEach(item => {
    const marca = (item.marca || 'Sin marca').trim();
    if (!marcaMap[marca]) marcaMap[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
    marcaMap[marca].neto += item.neto;
    marcaMap[marca].margen += item.margen;
    marcaMap[marca].cajas += item.cajas;
    if (item.month === mesActual) marcaMap[marca].netoMes += item.neto;
    if (item.month <= mesActual) marcaMap[marca].netoAcum += item.neto;
  });
  datosAnt.forEach(item => {
    const marca = (item.marca || 'Sin marca').trim();
    if (!marcaMapAnt[marca]) marcaMapAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
    marcaMapAnt[marca].neto += item.neto;
    if (item.month === mesActual) marcaMapAnt[marca].netoMes += item.neto;
    if (item.month <= mesActual) marcaMapAnt[marca].netoAcum += item.neto;
  });
  const marcas = Object.values(marcaMap).map(m => {
    const ant = marcaMapAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
    return {
      marca: m.marca,
      ventaNeta: Math.round(m.neto),
      margen: Math.round(m.margen),
      cajas: Math.round(m.cajas),
      rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
      varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
      varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
      varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
      ventaNetaMes: Math.round(m.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
      ventaNetaAcum: Math.round(m.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum),
      ventaNetaAnt: Math.round(ant.neto)
    };
  }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  
  // ===== AGRUPACIONES POR ITEM (ejecutivo/cliente) para filtros =====
  const topItems = items.slice(0, 10).map(i => i.nombre);
  
  // Categorías por Item
  const categoriasByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const catMapItem = {};
    const catMapItemAnt = {};
    datosItem.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapItem[cat]) catMapItem[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      catMapItem[cat].neto += item.neto;
      catMapItem[cat].margen += item.margen;
      catMapItem[cat].cajas += item.cajas;
      if (item.month === mesActual) catMapItem[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapItem[cat].netoAcum += item.neto;
    });
    datosItemAnt.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapItemAnt[cat]) catMapItemAnt[cat] = { neto: 0, netoMes: 0, netoAcum: 0 };
      catMapItemAnt[cat].neto += item.neto;
      if (item.month === mesActual) catMapItemAnt[cat].netoMes += item.neto;
      if (item.month <= mesActual) catMapItemAnt[cat].netoAcum += item.neto;
    });
    categoriasByItem[itemName] = Object.values(catMapItem).map(c => {
      const ant = catMapItemAnt[c.categoria] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        categoria: c.categoria, ventaNeta: Math.round(c.neto), margen: Math.round(c.margen), cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: ant.netoMes > 0 ? ((c.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        varYoYAcum: ant.netoAcum > 0 ? ((c.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
        varYoY: ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : 0,
        ventaNetaMes: Math.round(c.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
        ventaNetaAcum: Math.round(c.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum), ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta).slice(0, 15);
  });
  
  // Marcas por Item
  const marcasByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const mMapItem = {};
    const mMapItemAnt = {};
    datosItem.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!mMapItem[marca]) mMapItem[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0, netoMes: 0, netoAcum: 0 };
      mMapItem[marca].neto += item.neto;
      mMapItem[marca].margen += item.margen;
      mMapItem[marca].cajas += item.cajas;
      if (item.month === mesActual) mMapItem[marca].netoMes += item.neto;
      if (item.month <= mesActual) mMapItem[marca].netoAcum += item.neto;
    });
    datosItemAnt.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!mMapItemAnt[marca]) mMapItemAnt[marca] = { neto: 0, netoMes: 0, netoAcum: 0 };
      mMapItemAnt[marca].neto += item.neto;
      if (item.month === mesActual) mMapItemAnt[marca].netoMes += item.neto;
      if (item.month <= mesActual) mMapItemAnt[marca].netoAcum += item.neto;
    });
    marcasByItem[itemName] = Object.values(mMapItem).map(m => {
      const ant = mMapItemAnt[m.marca] || { neto: 0, netoMes: 0, netoAcum: 0 };
      return {
        marca: m.marca, ventaNeta: Math.round(m.neto), margen: Math.round(m.margen), cajas: Math.round(m.cajas),
        rentabilidad: m.neto > 0 ? (m.margen / m.neto) * 100 : 0,
        varMes: ant.netoMes > 0 ? ((m.netoMes - ant.netoMes) / ant.netoMes) * 100 : 0,
        varYoYAcum: ant.netoAcum > 0 ? ((m.netoAcum - ant.netoAcum) / ant.netoAcum) * 100 : 0,
        varYoY: ant.neto > 0 ? ((m.neto - ant.neto) / ant.neto) * 100 : 0,
        ventaNetaMes: Math.round(m.netoMes), ventaNetaMesAnt: Math.round(ant.netoMes),
        ventaNetaAcum: Math.round(m.netoAcum), ventaNetaAcumAnt: Math.round(ant.netoAcum), ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta).slice(0, 15);
  });
  
  // Meses por Item
  const monthsByItem = {};
  topItems.forEach(itemName => {
    const datosItem = datos.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const datosItemAnt = datosAnt.filter(d => (d[campoPrincipal] || '').trim() === itemName);
    const mesesItem = [];
    const mesesItemAnt = [];
    for (let m = 1; m <= 12; m++) {
      const mesData = datosItem.filter(i => i.month === m);
      const mesDataAnt = datosItemAnt.filter(i => i.month === m);
      const totMes = calcTotales(mesData);
      const totMesAnt = calcTotales(mesDataAnt);
      totMes.label = meses[m - 1];
      totMes.mes = m;
      totMesAnt.label = meses[m - 1];
      totMesAnt.mes = m;
      mesesItem.push(totMes);
      mesesItemAnt.push(totMesAnt);
    }
    monthsByItem[itemName] = { months: mesesItem, monthsAnterior: mesesItemAnt };
  });
  
  // ===== AGRUPACIONES POR MES (para filtro de mes) =====
  
  // Items (ejecutivos/clientes) por Mes
  const itemsByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMesActual = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    
    if (datosMesActual.length === 0) continue;
    
    const itemsMapMes = {};
    const itemsMapMesAnt = {};
    
    datosMesActual.forEach(item => {
      const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
      if (!itemsMapMes[key]) itemsMapMes[key] = { nombre: key, neto: 0, margen: 0, cajas: 0, facturas: new Set() };
      itemsMapMes[key].neto += item.neto;
      itemsMapMes[key].margen += item.margen;
      itemsMapMes[key].cajas += item.cajas;
      itemsMapMes[key].facturas.add(item.factura);
    });
    
    datosMesAnt.forEach(item => {
      const key = (item[campoPrincipal] || 'Sin ' + campoPrincipal).trim();
      if (!itemsMapMesAnt[key]) itemsMapMesAnt[key] = { neto: 0 };
      itemsMapMesAnt[key].neto += item.neto;
    });
    
    const totalMes = calcTotales(datosMesActual);
    
    itemsByMes[m] = Object.values(itemsMapMes).map(x => {
      const ant = itemsMapMesAnt[x.nombre] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((x.neto - ant.neto) / ant.neto) * 100 : (x.neto > 0 ? 100 : 0);
      return {
        nombre: x.nombre,
        ventaNeta: Math.round(x.neto),
        margen: Math.round(x.margen),
        cajas: Math.round(x.cajas),
        facturas: x.facturas.size,
        rentabilidad: x.neto > 0 ? (x.margen / x.neto) * 100 : 0,
        participacion: totalMes.ventaNeta > 0 ? (x.neto / totalMes.ventaNeta) * 100 : 0,
        varMes: varYoY,
        varYoYAcum: varYoY,
        varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  // Categorías por Mes
  const categoriasByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMesActual = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    
    if (datosMesActual.length === 0) continue;
    
    const catMapMes = {};
    const catMapMesAnt = {};
    
    datosMesActual.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapMes[cat]) catMapMes[cat] = { categoria: cat, neto: 0, margen: 0, cajas: 0 };
      catMapMes[cat].neto += item.neto;
      catMapMes[cat].margen += item.margen;
      catMapMes[cat].cajas += item.cajas;
    });
    
    datosMesAnt.forEach(item => {
      const cat = (item.categoria || 'Sin categoría').trim();
      if (!catMapMesAnt[cat]) catMapMesAnt[cat] = { neto: 0 };
      catMapMesAnt[cat].neto += item.neto;
    });
    
    categoriasByMes[m] = Object.values(catMapMes).map(c => {
      const ant = catMapMesAnt[c.categoria] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : (c.neto > 0 ? 100 : 0);
      return {
        categoria: c.categoria,
        ventaNeta: Math.round(c.neto),
        margen: Math.round(c.margen),
        cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: varYoY,
        varYoYAcum: varYoY,
        varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  // Marcas por Mes
  const marcasByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMesActual = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    
    if (datosMesActual.length === 0) continue;
    
    const marcaMapMes = {};
    const marcaMapMesAnt = {};
    
    datosMesActual.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!marcaMapMes[marca]) marcaMapMes[marca] = { marca: marca, neto: 0, margen: 0, cajas: 0 };
      marcaMapMes[marca].neto += item.neto;
      marcaMapMes[marca].margen += item.margen;
      marcaMapMes[marca].cajas += item.cajas;
    });
    
    datosMesAnt.forEach(item => {
      const marca = (item.marca || 'Sin marca').trim();
      if (!marcaMapMesAnt[marca]) marcaMapMesAnt[marca] = { neto: 0 };
      marcaMapMesAnt[marca].neto += item.neto;
    });
    
    marcasByMes[m] = Object.values(marcaMapMes).map(mr => {
      const ant = marcaMapMesAnt[mr.marca] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((mr.neto - ant.neto) / ant.neto) * 100 : (mr.neto > 0 ? 100 : 0);
      return {
        marca: mr.marca,
        ventaNeta: Math.round(mr.neto),
        margen: Math.round(mr.margen),
        cajas: Math.round(mr.cajas),
        rentabilidad: mr.neto > 0 ? (mr.margen / mr.neto) * 100 : 0,
        varMes: varYoY,
        varYoYAcum: varYoY,
        varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  return {
    totals: totals,
    totalsMes: totalsMes,
    items: items,
    months: months,
    monthsAnterior: monthsAnterior,
    categorias: categorias,
    marcas: marcas,
    categoriasByItem: categoriasByItem,
    marcasByItem: marcasByItem,
    monthsByItem: monthsByItem,
    itemsByMes: itemsByMes,
    categoriasByMes: categoriasByMes,
    marcasByMes: marcasByMes
  };
}


/* ===== FUNCIÓN PARA CALCULAR DATOS POR MES DEL RESUMEN GENERAL ===== */
/* 
   Calcula clasificacionesByMes, categoriasByMes y marcasByMes para el Dashboard Ejecutivo.
   
   USO: Llamar desde donde se genera el resumen general:
   
   const byMes = calcularResumenByMes(datosAnio, datosAnterior, calcTotales);
   resumen.clasificacionesByMes = byMes.clasificacionesByMes;
   resumen.categoriasByMes = byMes.categoriasByMes;
   resumen.marcasByMes = byMes.marcasByMes;
*/
function calcularResumenByMes(datosAnio, datosAnterior, calcTotales) {
  
  // Pre-agrupar por mes (eficiente, solo 1 pasada)
  const datosPorMes = {};
  const datosPorMesAnt = {};
  for (let m = 1; m <= 12; m++) {
    datosPorMes[m] = datosAnio.filter(i => i.month === m);
    datosPorMesAnt[m] = datosAnterior.filter(i => i.month === m);
  }
  
  // ===== CLASIFICACIONES POR MES =====
  const clasificacionesByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMes = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    if (datosMes.length === 0) continue;
    
    const map = {}, mapAnt = {};
    datosMes.forEach(i => {
      const k = (i.clasificacion || 'Sin clasificación').trim();
      if (!map[k]) map[k] = { clasificacion: k, neto: 0, margen: 0, cajas: 0, facturas: new Set() };
      map[k].neto += i.neto; map[k].margen += i.margen; map[k].cajas += i.cajas; map[k].facturas.add(i.factura);
    });
    datosMesAnt.forEach(i => {
      const k = (i.clasificacion || 'Sin clasificación').trim();
      if (!mapAnt[k]) mapAnt[k] = { neto: 0 };
      mapAnt[k].neto += i.neto;
    });
    
    clasificacionesByMes[m] = Object.values(map).map(c => {
      const ant = mapAnt[c.clasificacion] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : (c.neto > 0 ? 100 : 0);
      return {
        clasificacion: c.clasificacion,
        ventaNeta: Math.round(c.neto),
        margen: Math.round(c.margen),
        cajas: Math.round(c.cajas),
        facturas: c.facturas.size,
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: varYoY, varYoYAcum: varYoY, varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  // ===== CATEGORÍAS POR MES =====
  const categoriasByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMes = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    if (datosMes.length === 0) continue;
    
    const map = {}, mapAnt = {};
    datosMes.forEach(i => {
      const k = (i.categoria || 'Sin categoría').trim();
      if (!map[k]) map[k] = { categoria: k, neto: 0, margen: 0, cajas: 0 };
      map[k].neto += i.neto; map[k].margen += i.margen; map[k].cajas += i.cajas;
    });
    datosMesAnt.forEach(i => {
      const k = (i.categoria || 'Sin categoría').trim();
      if (!mapAnt[k]) mapAnt[k] = { neto: 0 };
      mapAnt[k].neto += i.neto;
    });
    
    categoriasByMes[m] = Object.values(map).map(c => {
      const ant = mapAnt[c.categoria] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((c.neto - ant.neto) / ant.neto) * 100 : (c.neto > 0 ? 100 : 0);
      return {
        categoria: c.categoria,
        ventaNeta: Math.round(c.neto),
        margen: Math.round(c.margen),
        cajas: Math.round(c.cajas),
        rentabilidad: c.neto > 0 ? (c.margen / c.neto) * 100 : 0,
        varMes: varYoY, varYoYAcum: varYoY, varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  // ===== MARCAS POR MES =====
  const marcasByMes = {};
  for (let m = 1; m <= 12; m++) {
    const datosMes = datosPorMes[m];
    const datosMesAnt = datosPorMesAnt[m];
    if (datosMes.length === 0) continue;
    
    const map = {}, mapAnt = {};
    datosMes.forEach(i => {
      const k = (i.marca || 'Sin marca').trim();
      if (!map[k]) map[k] = { marca: k, neto: 0, margen: 0, cajas: 0 };
      map[k].neto += i.neto; map[k].margen += i.margen; map[k].cajas += i.cajas;
    });
    datosMesAnt.forEach(i => {
      const k = (i.marca || 'Sin marca').trim();
      if (!mapAnt[k]) mapAnt[k] = { neto: 0 };
      mapAnt[k].neto += i.neto;
    });
    
    marcasByMes[m] = Object.values(map).map(mr => {
      const ant = mapAnt[mr.marca] || { neto: 0 };
      const varYoY = ant.neto > 0 ? ((mr.neto - ant.neto) / ant.neto) * 100 : (mr.neto > 0 ? 100 : 0);
      return {
        marca: mr.marca,
        ventaNeta: Math.round(mr.neto),
        margen: Math.round(mr.margen),
        cajas: Math.round(mr.cajas),
        rentabilidad: mr.neto > 0 ? (mr.margen / mr.neto) * 100 : 0,
        varMes: varYoY, varYoYAcum: varYoY, varYoY: varYoY,
        ventaNetaAnt: Math.round(ant.neto)
      };
    }).sort((a, b) => b.ventaNeta - a.ventaNeta);
  }
  
  return {
    clasificacionesByMes: clasificacionesByMes,
    categoriasByMes: categoriasByMes,
    marcasByMes: marcasByMes
  };
}