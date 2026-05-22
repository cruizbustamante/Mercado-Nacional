/**
 * ============================================================
 *  MÓDULO DESPACHO - BACKEND
 *  Fuente: "maestro de venta" + "Egresos"
 *  
 *  Lógica:
 *  - DHernández (Villa Alegre) → SIN_CONTROL
 *  - Resto (Santiago) → Cruzar con Egresos
 * ============================================================
 */

const DESP_CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: {
    MAESTRO: 'maestro de venta',
    EGRESOS: 'Egresos',
    DESPACHOS_MANUALES: 'Despachos_Manuales'
  },
  EJECUTIVO_VILLA_ALEGRE: 'dhernandez',  // normalizado (sin tilde)
  CACHE_TTL: 1800,  // 30 minutos
  FECHA_MINIMA: '2025-01-01',  // Solo facturas desde esta fecha
  
  // Clientes que se despachan desde Santiago aunque el ejecutivo sea de Villa Alegre
  CLIENTES_SANTIAGO_EXCEPCION: [
    'corona alarcon victor manuel'
  ],
  
  // Normalización de nombres de ejecutivos (variantes → nombre oficial)
  NORMALIZAR_EJECUTIVO: {
    'dhernandez': 'DHernández',
    'dhernández': 'DHernández',
    'd hernandez': 'DHernández',
    'd hernández': 'DHernández',
    'd. hernandez': 'DHernández',
    'd. hernández': 'DHernández'
  },
  
  // Mapeo de emails a ejecutivos (para filtrar por vendedor)
  USUARIOS_EJECUTIVOS: {
    'vdajmontenegro@gmail.com': 'Juan Manuel Montenegro',
    'vdadhernandez@gmail.com': 'DHernández',
    'vdacossa@gmail.com': 'Carlos Ortega'
    // Agregar más según necesidad
  },
  
  // Emails de administradores (ven todo)
  ADMINS: [
    'cruizbusta@gmail.com',
    'vdakgonzalez@gmail.com',
    'vdacarce@gmail.com',
    'vdamsanchez@gmail.com'
  ]
};

/* ===== Helpers ===== */
function _dsp_ss() {
  return SpreadsheetApp.openById(DESP_CONFIG.SPREADSHEET_ID);
}

function _dsp_getUsuarioActual() {
  const email = Session.getActiveUser().getEmail() || '';
  const emailLower = email.toLowerCase();
  
  // ¿Es admin?
  const esAdmin = DESP_CONFIG.ADMINS.some(a => a.toLowerCase() === emailLower);
  
  // ¿Tiene ejecutivo asignado?
  let ejecutivo = null;
  for (const [e, ej] of Object.entries(DESP_CONFIG.USUARIOS_EJECUTIVOS)) {
    if (e.toLowerCase() === emailLower) {
      ejecutivo = ej;
      break;
    }
  }
  
  return {
    email: email,
    esAdmin: esAdmin,
    ejecutivo: ejecutivo,
    puedeVerTodo: esAdmin || !ejecutivo  // Admin o usuario no mapeado ve todo
  };
}

function _dsp_norm(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function _dsp_normEjecutivo(nombre) {
  // Normaliza el nombre del ejecutivo usando el mapeo
  const nombreTrim = String(nombre || '').trim();
  const nombreNorm = _dsp_norm(nombreTrim);
  
  // Buscar en el mapeo
  if (DESP_CONFIG.NORMALIZAR_EJECUTIVO[nombreNorm]) {
    return DESP_CONFIG.NORMALIZAR_EJECUTIVO[nombreNorm];
  }
  
  // Si no está en el mapeo, devolver el original (con trim)
  return nombreTrim;
}

function _dsp_determinarOrigen(ejecutivo, cliente) {
  // Normalizar ejecutivo para comparar
  const ejNorm = _dsp_norm(ejecutivo);
  
  // Si NO es el ejecutivo de Villa Alegre → Santiago
  if (ejNorm !== DESP_CONFIG.EJECUTIVO_VILLA_ALEGRE) {
    return 'Santiago';
  }
  
  // Es DHernández, verificar si el cliente es excepción
  const clienteNorm = _dsp_norm(cliente);
  const esExcepcion = DESP_CONFIG.CLIENTES_SANTIAGO_EXCEPCION.some(c => 
    clienteNorm.includes(c)
  );
  
  if (esExcepcion) {
    return 'Santiago';  // Cliente se despacha desde Santiago
  }
  
  return 'Villa Alegre';  // DHernández normal → Villa Alegre
}

function _dsp_num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v || '').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function _dsp_normFactura(s) {
  // Normaliza número de factura: quita puntos, espacios, convierte a string
  return String(s || '').replace(/\./g, '').replace(/\s+/g, '').trim();
}

function _dsp_parseDate(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const dd = +match[1], mm = +match[2];
    const yyyy = match[3].length === 2 ? +('20' + match[3]) : +match[3];
    return new Date(yyyy, mm - 1, dd);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function _dsp_formatDate(d) {
  const dt = (d instanceof Date) ? d : _dsp_parseDate(d);
  if (!dt) return '';
  const y = dt.getFullYear(), m = dt.getMonth(), day = dt.getDate();
  return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
}

function _dsp_daysDiff(date1, date2) {
  const d1 = _dsp_parseDate(date1);
  const d2 = _dsp_parseDate(date2);
  if (!d1 || !d2) return 0;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function _dsp_findCol(headers, names) {
  const map = {};
  headers.forEach((h, i) => map[_dsp_norm(h)] = i);
  for (const n of names) {
    const k = _dsp_norm(n);
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

/* ===== Cache ===== */
function _dsp_getCache() {
  return CacheService.getScriptCache();
}

function _dsp_getCacheKey(tipo) {
  return 'DESPACHO_' + tipo;
}

function _dsp_getFromCache(tipo) {
  try {
    const cache = _dsp_getCache();
    const cached = cache.get(_dsp_getCacheKey(tipo));
    if (cached) {
      Logger.log('✅ Cache HIT: ' + tipo);
      return JSON.parse(cached);
    }
    return null;
  } catch (e) {
    return null;
  }
}

function _dsp_saveToCache(tipo, data) {
  try {
    const cache = _dsp_getCache();
    const json = JSON.stringify(data);
    if (json.length < 100000) {
      cache.put(_dsp_getCacheKey(tipo), json, DESP_CONFIG.CACHE_TTL);
      Logger.log('✅ Cache SAVE: ' + tipo);
    }
  } catch (e) {
    Logger.log('⚠️ Cache error: ' + e.message);
  }
}

function apiDespClearCache() {
  try {
    const cache = _dsp_getCache();
    cache.remove(_dsp_getCacheKey('DASHBOARD'));
    cache.remove(_dsp_getCacheKey('FACTURAS'));
    Logger.log('🗑️ Caché de Despacho limpiado');
    return { ok: true, message: 'Caché limpiado' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/* ===== Procesar Datos Base (para caché) ===== */
function _dsp_procesarDatosBase(facturas, egresosMap, manualesMap) {
  // Filtrar solo facturas desde 2025
  const facturasDesde2025 = facturas.filter(f => 
    f.fechaFacturacion >= DESP_CONFIG.FECHA_MINIMA
  );
  
  Logger.log('📅 Facturas desde 2025: ' + facturasDesde2025.length + ' de ' + facturas.length);

  // Fecha actual para determinar si puede marcar manualmente
  const hoy = new Date();
  const mesActual = hoy.getFullYear() * 12 + hoy.getMonth();

  // Procesar cada factura con su estado
  const facturasConEstado = facturasDesde2025.map(f => {
    // Combinar egresos del sistema + manuales
    const egresoSistema = egresosMap.get(f.numeroFactura);
    const egresoManual = manualesMap ? manualesMap.get(f.numeroFactura) : null;
    
    let estado = 'PENDIENTE';
    let totalDespachado = 0;
    let fechaDespacho = '';
    let diasDespacho = 0;
    let fillRate = 0;
    let despachos = [];
    let tieneDespachoManual = false;

    if (f.origen === 'Villa Alegre') {
      // DHernández: sin control de despacho
      estado = 'SIN_CONTROL';
    } else {
      // Santiago: combinar egresos del sistema + manuales
      
      // Sumar egresos del sistema
      if (egresoSistema) {
        totalDespachado += egresoSistema.totalDespachado;
        despachos = despachos.concat(egresoSistema.despachos.map(d => ({ ...d, esManual: false })));
        if (egresoSistema.ultimaFecha > fechaDespacho) {
          fechaDespacho = egresoSistema.ultimaFecha;
        }
      }
      
      // Sumar despachos manuales
      if (egresoManual) {
        totalDespachado += egresoManual.totalDespachado;
        despachos = despachos.concat(egresoManual.despachos);
        tieneDespachoManual = true;
        if (egresoManual.ultimaFecha > fechaDespacho) {
          fechaDespacho = egresoManual.ultimaFecha;
        }
      }

      totalDespachado = Math.round(totalDespachado);

      if (totalDespachado >= f.totalCajas) {
        estado = 'DESPACHADO_COMPLETO';
      } else if (totalDespachado > 0) {
        estado = 'DESPACHADO_PARCIAL';
      }

      fillRate = f.totalCajas > 0 ? totalDespachado / f.totalCajas : 0;
      
      if (f.fechaFacturacion && fechaDespacho) {
        diasDespacho = _dsp_daysDiff(f.fechaFacturacion, fechaDespacho);
      }
    }

    // Determinar si puede marcar despacho manual:
    // - Solo origen Santiago
    // - Solo si la factura es de un mes anterior al actual
    // - Solo si no está completamente despachada
    const fechaFact = _dsp_parseDate(f.fechaFacturacion);
    const mesFact = fechaFact ? (fechaFact.getFullYear() * 12 + fechaFact.getMonth()) : mesActual;
    const puedeMarcarManual = (
      f.origen === 'Santiago' && 
      mesFact < mesActual && 
      estado !== 'DESPACHADO_COMPLETO'
    );

    return {
      ...f,
      estado,
      totalDespachado,
      fechaDespacho,
      diasDespacho,
      fillRate,
      cajasPendientes: Math.max(0, f.totalCajas - totalDespachado),
      despachos,
      tieneDespachoManual,
      puedeMarcarManual
    };
  });

  // Obtener listas para filtros
  const ejecutivos = [...new Set(facturasDesde2025.map(f => f.ejecutivo).filter(Boolean))].sort();
  const clasificaciones = [...new Set(facturasDesde2025.map(f => f.clasificacion).filter(Boolean))].sort();

  return {
    facturas: facturasConEstado,
    filtrosDisponibles: {
      ejecutivos,
      clasificaciones,
      estados: ['TODOS', 'PENDIENTE', 'DESPACHADO_PARCIAL', 'DESPACHADO_COMPLETO', 'SIN_CONTROL'],
      origenes: ['TODOS', 'Santiago', 'Villa Alegre']
    }
  };
}


/* ===== Lectura de Maestro de Venta ===== */
function _dsp_leerMaestro() {
  try {
    const ss = _dsp_ss();
    const sh = ss.getSheetByName(DESP_CONFIG.HOJAS.MAESTRO);
    if (!sh) return { ok: false, error: 'Hoja "maestro de venta" no encontrada' };

    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: true, facturas: [] };

    const H = data[0];
    
    // Índices de columnas
    const idx = {
      factura: _dsp_findCol(H, ['N° Factura', 'Nº Factura', 'No Factura', 'Factura']),
      nv: _dsp_findCol(H, ['Nota Venta', 'NV']),
      cliente: _dsp_findCol(H, ['Nombre Cliente', 'Cliente']),
      ejecutivo: _dsp_findCol(H, ['Ejecutivo', 'Vendedor']),
      cajas: _dsp_findCol(H, ['Cajas']),
      neto: _dsp_findCol(H, ['TOTAL NETO FINAL', 'Neto']),
      fecha: _dsp_findCol(H, ['Fecha Facturación', 'Fecha Facturacion']),
      categoria: _dsp_findCol(H, ['Categoria', 'Categoría']),
      marca: _dsp_findCol(H, ['Marca']),
      clasificacion: _dsp_findCol(H, ['Clasificacion', 'Clasificación']),
      sku: _dsp_findCol(H, ['SKU', 'Código', 'Codigo']),
      producto: _dsp_findCol(H, ['Descripción Producto', 'Descripcion Producto', 'Producto'])
    };

    if (idx.factura === -1) {
      return { ok: false, error: 'Columna "N° Factura" no encontrada' };
    }

    // Agrupar por factura
    const facturasMap = new Map();

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const numFactura = _dsp_normFactura(r[idx.factura]);
      if (!numFactura) continue;

      const cajas = _dsp_num(idx.cajas > -1 ? r[idx.cajas] : 0);
      const neto = Math.abs(_dsp_num(idx.neto > -1 ? r[idx.neto] : 0));
      const ejecutivo = idx.ejecutivo > -1 ? _dsp_normEjecutivo(r[idx.ejecutivo]) : '';
      const fechaRaw = idx.fecha > -1 ? r[idx.fecha] : '';
      const fecha = _dsp_formatDate(fechaRaw);

      if (!facturasMap.has(numFactura)) {
        facturasMap.set(numFactura, {
          numeroFactura: numFactura,
          fechaFacturacion: fecha,
          cliente: idx.cliente > -1 ? String(r[idx.cliente] || '').trim() : '',
          ejecutivo: ejecutivo,
          clasificacion: idx.clasificacion > -1 ? String(r[idx.clasificacion] || '').trim() : '',
          totalCajas: 0,
          totalNeto: 0,
          nvs: new Set(),
          items: []
        });
      }

      const F = facturasMap.get(numFactura);
      F.totalCajas += cajas;
      F.totalNeto += neto;
      
      if (idx.nv > -1 && r[idx.nv]) {
        F.nvs.add(String(r[idx.nv]));
      }

      // Guardar detalle de items (SKUs)
      F.items.push({
        sku: idx.sku > -1 ? String(r[idx.sku] || '') : '',
        producto: idx.producto > -1 ? String(r[idx.producto] || '') : '',
        categoria: idx.categoria > -1 ? String(r[idx.categoria] || '') : '',
        marca: idx.marca > -1 ? String(r[idx.marca] || '') : '',
        cajas: cajas,
        neto: neto
      });
    }

    // Convertir a array
    const facturas = Array.from(facturasMap.values()).map(f => ({
      ...f,
      nvs: Array.from(f.nvs),
      totalCajas: Math.round(f.totalCajas),
      totalNeto: Math.round(f.totalNeto),
      // Determinar origen según ejecutivo Y cliente
      origen: _dsp_determinarOrigen(f.ejecutivo, f.cliente)
    }));

    Logger.log('📊 Maestro: ' + facturas.length + ' facturas únicas');
    return { ok: true, facturas };

  } catch (e) {
    Logger.log('❌ Error leyendo maestro: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== Lectura de Egresos ===== */
function _dsp_leerEgresos() {
  try {
    const ss = _dsp_ss();
    const sh = ss.getSheetByName(DESP_CONFIG.HOJAS.EGRESOS);
    if (!sh) return { ok: false, error: 'Hoja "Egresos" no encontrada' };

    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: true, egresos: new Map() };

    const H = data[0];
    
    const idx = {
      factura: _dsp_findCol(H, ['ID OS', 'NRO BOLETA', 'Nro Boleta', 'NUM DOCUMENTO']),
      unidades: _dsp_findCol(H, ['UNID. DESPACHADAS', 'UNID DESPACHADAS', 'Unidades']),
      fecha: _dsp_findCol(H, ['FECHA DESPACHO', 'Fecha Despacho', 'FECHA']),
      chofer: _dsp_findCol(H, ['CHOFER', 'Chofer']),
      patente: _dsp_findCol(H, ['PATENTE', 'Patente']),
      cliente: _dsp_findCol(H, ['NOM CLIENTE', 'Cliente'])
    };

    if (idx.factura === -1) {
      Logger.log('⚠️ Columna ID OS no encontrada en Egresos');
      return { ok: true, egresos: new Map() };
    }

    // Agrupar egresos por factura (puede haber múltiples despachos)
    const egresosMap = new Map();

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const numFactura = _dsp_normFactura(r[idx.factura]);
      if (!numFactura) continue;

      const unidades = _dsp_num(idx.unidades > -1 ? r[idx.unidades] : 0);
      if (unidades <= 0) continue;

      const egreso = {
        fechaDespacho: _dsp_formatDate(idx.fecha > -1 ? r[idx.fecha] : ''),
        cajasDespacho: unidades,
        chofer: idx.chofer > -1 ? String(r[idx.chofer] || '') : '',
        patente: idx.patente > -1 ? String(r[idx.patente] || '') : '',
        cliente: idx.cliente > -1 ? String(r[idx.cliente] || '') : ''
      };

      if (!egresosMap.has(numFactura)) {
        egresosMap.set(numFactura, {
          totalDespachado: 0,
          ultimaFecha: '',
          despachos: []
        });
      }

      const E = egresosMap.get(numFactura);
      E.totalDespachado += unidades;
      E.despachos.push(egreso);
      
      // Guardar fecha más reciente
      if (egreso.fechaDespacho && (!E.ultimaFecha || egreso.fechaDespacho > E.ultimaFecha)) {
        E.ultimaFecha = egreso.fechaDespacho;
      }
    }

    Logger.log('📦 Egresos: ' + egresosMap.size + ' facturas con despacho');
    return { ok: true, egresos: egresosMap };

  } catch (e) {
    Logger.log('❌ Error leyendo egresos: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== Despachos Manuales ===== */
function _dsp_ensureDespachosManualesSheet() {
  const ss = _dsp_ss();
  let sh = ss.getSheetByName(DESP_CONFIG.HOJAS.DESPACHOS_MANUALES);
  if (!sh) {
    sh = ss.insertSheet(DESP_CONFIG.HOJAS.DESPACHOS_MANUALES);
    sh.appendRow([
      'Timestamp',
      'Usuario',
      'Factura',
      'Fecha_Despacho',
      'Cajas_Despachadas',
      'Motivo',
      'Observaciones'
    ]);
    sh.setFrozenRows(1);
    Logger.log('✅ Hoja Despachos_Manuales creada');
  }
  return sh;
}

function _dsp_leerDespachosManuales() {
  try {
    const ss = _dsp_ss();
    const sh = ss.getSheetByName(DESP_CONFIG.HOJAS.DESPACHOS_MANUALES);
    if (!sh || sh.getLastRow() < 2) return { ok: true, despachos: new Map() };

    const data = sh.getDataRange().getValues();
    const H = data[0];

    const idx = {
      factura: _dsp_findCol(H, ['Factura']),
      fecha: _dsp_findCol(H, ['Fecha_Despacho', 'Fecha Despacho']),
      cajas: _dsp_findCol(H, ['Cajas_Despachadas', 'Cajas Despachadas', 'Cajas']),
      motivo: _dsp_findCol(H, ['Motivo']),
      observaciones: _dsp_findCol(H, ['Observaciones'])
    };

    const despachosMap = new Map();

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const numFactura = _dsp_normFactura(r[idx.factura]);
      if (!numFactura) continue;

      const cajas = _dsp_num(idx.cajas > -1 ? r[idx.cajas] : 0);
      if (cajas <= 0) continue;

      const despacho = {
        fechaDespacho: _dsp_formatDate(idx.fecha > -1 ? r[idx.fecha] : ''),
        cajasDespacho: cajas,
        motivo: idx.motivo > -1 ? String(r[idx.motivo] || '') : '',
        observaciones: idx.observaciones > -1 ? String(r[idx.observaciones] || '') : '',
        esManual: true
      };

      if (!despachosMap.has(numFactura)) {
        despachosMap.set(numFactura, {
          totalDespachado: 0,
          ultimaFecha: '',
          despachos: []
        });
      }

      const D = despachosMap.get(numFactura);
      D.totalDespachado += cajas;
      D.despachos.push(despacho);

      if (despacho.fechaDespacho && (!D.ultimaFecha || despacho.fechaDespacho > D.ultimaFecha)) {
        D.ultimaFecha = despacho.fechaDespacho;
      }
    }

    Logger.log('📝 Despachos manuales: ' + despachosMap.size + ' facturas');
    return { ok: true, despachos: despachosMap };

  } catch (e) {
    Logger.log('❌ Error leyendo despachos manuales: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== API: Registrar Despacho Manual ===== */
function apiDespRegistrarDespachoManual(datos) {
  try {
    // Solo administradores pueden registrar despachos manuales
    const usuario = _dsp_getUsuarioActual();
    if (!usuario.esAdmin) {
      return { ok: false, error: 'Solo administradores pueden registrar despachos manuales' };
    }
    
    if (!datos || !datos.numeroFactura) {
      return { ok: false, error: 'Número de factura requerido' };
    }
    if (!datos.cajasDespacho || _dsp_num(datos.cajasDespacho) <= 0) {
      return { ok: false, error: 'Cantidad de cajas debe ser mayor a 0' };
    }
    if (!datos.fechaDespacho) {
      return { ok: false, error: 'Fecha de despacho requerida' };
    }

    // Validar que la fecha de despacho sea de un mes anterior al actual
    const fechaDesp = _dsp_parseDate(datos.fechaDespacho);
    const hoy = new Date();
    const mesActual = hoy.getFullYear() * 12 + hoy.getMonth();
    const mesDespacho = fechaDesp.getFullYear() * 12 + fechaDesp.getMonth();

    if (mesDespacho >= mesActual) {
      return { ok: false, error: 'Solo se pueden registrar despachos de meses anteriores al actual' };
    }

    const sh = _dsp_ensureDespachosManualesSheet();
    const emailUsuario = Session.getActiveUser().getEmail() || 'Sistema';
    const ahora = new Date();

    sh.appendRow([
      ahora,
      emailUsuario,
      _dsp_normFactura(datos.numeroFactura),
      _dsp_formatDate(datos.fechaDespacho),
      _dsp_num(datos.cajasDespacho),
      String(datos.motivo || 'Corrección manual'),
      String(datos.observaciones || '')
    ]);

    // Limpiar caché para que se reflejen los cambios
    apiDespClearCache();

    Logger.log('✅ Despacho manual registrado: ' + datos.numeroFactura + ' - ' + datos.cajasDespacho + ' cajas');

    return { 
      ok: true, 
      message: 'Despacho registrado: ' + datos.cajasDespacho + ' cajas para factura ' + datos.numeroFactura 
    };

  } catch (e) {
    Logger.log('❌ Error registrando despacho manual: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== API Principal: Dashboard ===== */
function apiDespGetDashboard(filtros) {
  try {
    const startTime = new Date().getTime();
    
    // Obtener usuario actual
    const usuario = _dsp_getUsuarioActual();
    
    // 1. Intentar obtener datos base de caché
    const cacheKey = 'DASHBOARD';
    let datosBase = _dsp_getFromCache(cacheKey);
    
    if (!datosBase) {
      // Cache MISS: leer de hojas
      Logger.log('📖 Leyendo datos de hojas...');
      
      const maestroResult = _dsp_leerMaestro();
      if (!maestroResult.ok) return maestroResult;

      const egresosResult = _dsp_leerEgresos();
      if (!egresosResult.ok) return egresosResult;

      const manualesResult = _dsp_leerDespachosManuales();
      if (!manualesResult.ok) return manualesResult;

      // Procesar y guardar en caché
      datosBase = _dsp_procesarDatosBase(
        maestroResult.facturas, 
        egresosResult.egresos,
        manualesResult.despachos
      );
      _dsp_saveToCache(cacheKey, datosBase);
      
      Logger.log('✅ Datos procesados y guardados en caché');
    } else {
      Logger.log('⚡ Datos desde caché');
    }

    let facturasConEstado = datosBase.facturas;
    const filtrosDisponibles = datosBase.filtrosDisponibles;

    // Filtrar por ejecutivo si el usuario no es admin
    if (!usuario.puedeVerTodo && usuario.ejecutivo) {
      facturasConEstado = facturasConEstado.filter(f => 
        _dsp_norm(f.ejecutivo) === _dsp_norm(usuario.ejecutivo)
      );
      Logger.log('🔒 Filtrado por ejecutivo: ' + usuario.ejecutivo + ' (' + facturasConEstado.length + ' facturas)');
    }

    // Aplicar filtros (esto siempre se hace en memoria, es rápido)
    let facturasFiltradas = facturasConEstado;

    if (filtros) {
      if (filtros.estado && filtros.estado !== 'TODOS') {
        facturasFiltradas = facturasFiltradas.filter(f => f.estado === filtros.estado);
      }
      if (filtros.origen && filtros.origen !== 'TODOS') {
        facturasFiltradas = facturasFiltradas.filter(f => f.origen === filtros.origen);
      }
      if (filtros.ejecutivo && filtros.ejecutivo !== 'TODOS') {
        facturasFiltradas = facturasFiltradas.filter(f => 
          _dsp_norm(f.ejecutivo).includes(_dsp_norm(filtros.ejecutivo))
        );
      }
      if (filtros.fechaDesde) {
        facturasFiltradas = facturasFiltradas.filter(f => 
          f.fechaFacturacion >= filtros.fechaDesde
        );
      }
      if (filtros.fechaHasta) {
        facturasFiltradas = facturasFiltradas.filter(f => 
          f.fechaFacturacion <= filtros.fechaHasta
        );
      }
      if (filtros.cliente) {
        const needle = _dsp_norm(filtros.cliente);
        facturasFiltradas = facturasFiltradas.filter(f => 
          _dsp_norm(f.cliente).includes(needle)
        );
      }
      if (filtros.clasificacion && filtros.clasificacion !== 'TODOS') {
        facturasFiltradas = facturasFiltradas.filter(f => 
          _dsp_norm(f.clasificacion) === _dsp_norm(filtros.clasificacion)
        );
      }
    }

    // Ordenar por fecha facturación DESC
    facturasFiltradas.sort((a, b) => 
      (b.fechaFacturacion || '').localeCompare(a.fechaFacturacion || '')
    );

    // Calcular KPIs
    const kpis = _dsp_calcularKPIs(facturasConEstado, facturasFiltradas);
    
    // Calcular KPIs por ejecutivo (cards)
    const kpisPorEjecutivo = _dsp_calcularKPIsPorEjecutivo(facturasConEstado);

    const endTime = new Date().getTime();
    Logger.log('✅ Dashboard procesado en ' + (endTime - startTime) + 'ms');

    return {
      ok: true,
      facturas: facturasFiltradas,
      kpis,
      kpisPorEjecutivo,
      filtrosDisponibles,
      usuario: {
        email: usuario.email,
        esAdmin: usuario.puedeVerTodo,
        ejecutivo: usuario.ejecutivo
      },
      resumen: {
        totalFacturas: facturasConEstado.length,
        facturasFiltradas: facturasFiltradas.length
      }
    };

  } catch (e) {
    Logger.log('❌ Error en dashboard: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== Cálculo de KPIs por Ejecutivo (Cards) ===== */
function _dsp_calcularKPIsPorEjecutivo(facturas) {
  // Agrupar por ejecutivo
  const porEjecutivo = {};
  
  facturas.forEach(f => {
    const ej = f.ejecutivo || 'Sin asignar';
    if (!porEjecutivo[ej]) {
      porEjecutivo[ej] = {
        ejecutivo: ej,
        origen: f.origen,
        clasificacion: f.clasificacion || '',
        facturas: [],
        totalFacturas: 0,
        pendientes: 0,
        parciales: 0,
        completas: 0,
        sinControl: 0,
        totalCajas: 0,
        cajasDespachadas: 0
      };
    }
    
    const P = porEjecutivo[ej];
    P.facturas.push(f);
    P.totalFacturas++;
    P.totalCajas += f.totalCajas || 0;
    P.cajasDespachadas += f.totalDespachado || 0;
    
    switch (f.estado) {
      case 'PENDIENTE': P.pendientes++; break;
      case 'DESPACHADO_PARCIAL': P.parciales++; break;
      case 'DESPACHADO_COMPLETO': P.completas++; break;
      case 'SIN_CONTROL': P.sinControl++; break;
    }
  });
  
  // Calcular métricas finales y ordenar
  const resultado = Object.values(porEjecutivo).map(e => {
    const fillRate = e.totalCajas > 0 ? (e.cajasDespachadas / e.totalCajas) * 100 : 0;
    
    // Calcular días promedio
    const conDias = e.facturas.filter(f => f.diasDespacho > 0);
    const diasPromedio = conDias.length > 0 
      ? conDias.reduce((sum, f) => sum + f.diasDespacho, 0) / conDias.length 
      : 0;
    
    // Iniciales para avatar
    const palabras = e.ejecutivo.split(' ');
    const iniciales = palabras.length >= 2 
      ? (palabras[0][0] + palabras[1][0]).toUpperCase()
      : e.ejecutivo.substring(0, 2).toUpperCase();
    
    return {
      ejecutivo: e.ejecutivo,
      iniciales: iniciales,
      origen: e.origen,
      clasificacion: e.clasificacion,
      totalFacturas: e.totalFacturas,
      pendientes: e.pendientes,
      despachadas: e.parciales + e.completas,
      sinControl: e.sinControl,
      totalCajas: Math.round(e.totalCajas),
      cajasDespachadas: Math.round(e.cajasDespachadas),
      cajasPendientes: Math.round(e.totalCajas - e.cajasDespachadas),
      fillRate: Math.round(fillRate * 10) / 10,
      diasPromedio: Math.round(diasPromedio * 10) / 10
    };
  }).sort((a, b) => b.totalCajas - a.totalCajas);
  
  return resultado;
}


/* ===== Cálculo de KPIs ===== */
function _dsp_calcularKPIs(todas, filtradas) {
  // KPIs globales (todas las facturas)
  const totalFacturas = todas.length;
  const porEstado = {
    PENDIENTE: todas.filter(f => f.estado === 'PENDIENTE'),
    DESPACHADO_PARCIAL: todas.filter(f => f.estado === 'DESPACHADO_PARCIAL'),
    DESPACHADO_COMPLETO: todas.filter(f => f.estado === 'DESPACHADO_COMPLETO'),
    SIN_CONTROL: todas.filter(f => f.estado === 'SIN_CONTROL')
  };

  const totalCajas = todas.reduce((sum, f) => sum + (f.totalCajas || 0), 0);
  const cajasDespachadas = todas.reduce((sum, f) => sum + (f.totalDespachado || 0), 0);
  const cajasPendientes = todas.reduce((sum, f) => sum + (f.cajasPendientes || 0), 0);

  // Fill rate promedio (solo facturas con despacho)
  const conDespacho = todas.filter(f => f.estado.includes('DESPACHADO'));
  const fillRatePromedio = conDespacho.length > 0
    ? conDespacho.reduce((sum, f) => sum + (f.fillRate || 0), 0) / conDespacho.length
    : 0;

  // Días promedio de despacho
  const conDias = conDespacho.filter(f => f.diasDespacho > 0);
  const diasPromedio = conDias.length > 0
    ? conDias.reduce((sum, f) => sum + f.diasDespacho, 0) / conDias.length
    : 0;

  // KPIs por origen
  const porOrigen = {
    Santiago: {
      total: todas.filter(f => f.origen === 'Santiago').length,
      pendientes: porEstado.PENDIENTE.filter(f => f.origen === 'Santiago').length,
      despachadas: todas.filter(f => f.origen === 'Santiago' && f.estado.includes('DESPACHADO')).length,
      cajas: todas.filter(f => f.origen === 'Santiago').reduce((s, f) => s + f.totalCajas, 0),
      cajasDespachadas: todas.filter(f => f.origen === 'Santiago').reduce((s, f) => s + f.totalDespachado, 0)
    },
    'Villa Alegre': {
      total: todas.filter(f => f.origen === 'Villa Alegre').length,
      sinControl: porEstado.SIN_CONTROL.length,
      cajas: todas.filter(f => f.origen === 'Villa Alegre').reduce((s, f) => s + f.totalCajas, 0)
    }
  };

  // KPIs de las filtradas (para mostrar en tabla)
  const kpisFiltradas = {
    total: filtradas.length,
    pendientes: filtradas.filter(f => f.estado === 'PENDIENTE').length,
    parciales: filtradas.filter(f => f.estado === 'DESPACHADO_PARCIAL').length,
    completas: filtradas.filter(f => f.estado === 'DESPACHADO_COMPLETO').length,
    sinControl: filtradas.filter(f => f.estado === 'SIN_CONTROL').length,
    cajas: filtradas.reduce((s, f) => s + f.totalCajas, 0),
    cajasDespachadas: filtradas.reduce((s, f) => s + f.totalDespachado, 0)
  };

  return {
    global: {
      totalFacturas,
      pendientes: porEstado.PENDIENTE.length,
      parciales: porEstado.DESPACHADO_PARCIAL.length,
      completas: porEstado.DESPACHADO_COMPLETO.length,
      sinControl: porEstado.SIN_CONTROL.length,
      totalCajas: Math.round(totalCajas),
      cajasDespachadas: Math.round(cajasDespachadas),
      cajasPendientes: Math.round(cajasPendientes),
      fillRatePromedio: Math.round(fillRatePromedio * 1000) / 10,
      diasPromedio: Math.round(diasPromedio * 10) / 10,
      eficiencia: totalCajas > 0 ? Math.round((cajasDespachadas / totalCajas) * 1000) / 10 : 0
    },
    porOrigen,
    filtradas: kpisFiltradas
  };
}


/* ===== API: Detalle de Factura (usa caché del dashboard) ===== */
function apiDespGetDetalle(numeroFactura) {
  try {
    if (!numeroFactura) {
      return { ok: false, error: 'Número de factura requerido' };
    }

    const nf = _dsp_normFactura(numeroFactura);
    
    // Intentar usar datos del caché del dashboard
    let datosBase = _dsp_getFromCache('DASHBOARD');
    
    if (!datosBase) {
      // Si no hay caché, cargar datos
      const maestroResult = _dsp_leerMaestro();
      if (!maestroResult.ok) return maestroResult;

      const egresosResult = _dsp_leerEgresos();
      if (!egresosResult.ok) return egresosResult;

      const manualesResult = _dsp_leerDespachosManuales();
      if (!manualesResult.ok) return manualesResult;

      datosBase = _dsp_procesarDatosBase(
        maestroResult.facturas, 
        egresosResult.egresos,
        manualesResult.despachos
      );
      _dsp_saveToCache('DASHBOARD', datosBase);
    }

    // Buscar factura en datos procesados
    const factura = datosBase.facturas.find(f => 
      _dsp_normFactura(f.numeroFactura) === nf
    );

    if (!factura) {
      return { ok: false, error: 'Factura no encontrada: ' + numeroFactura };
    }

    return {
      ok: true,
      factura,
      despachos: factura.despachos || [],
      items: factura.items || []
    };

  } catch (e) {
    Logger.log('❌ Error en detalle: ' + e.message);
    return { ok: false, error: e.message };
  }
}


/* ===== API: Resumen por Ejecutivo (usa caché) ===== */
function apiDespGetResumenEjecutivos() {
  try {
    // Intentar usar datos del caché del dashboard
    let datosBase = _dsp_getFromCache('DASHBOARD');
    
    if (!datosBase) {
      const maestroResult = _dsp_leerMaestro();
      if (!maestroResult.ok) return maestroResult;

      const egresosResult = _dsp_leerEgresos();
      if (!egresosResult.ok) return egresosResult;

      const manualesResult = _dsp_leerDespachosManuales();
      if (!manualesResult.ok) return manualesResult;

      datosBase = _dsp_procesarDatosBase(
        maestroResult.facturas, 
        egresosResult.egresos,
        manualesResult.despachos
      );
      _dsp_saveToCache('DASHBOARD', datosBase);
    }

    const facturas = datosBase.facturas;

    // Agrupar por ejecutivo
    const porEjecutivo = {};

    facturas.forEach(f => {
      const ej = f.ejecutivo || 'Sin asignar';
      if (!porEjecutivo[ej]) {
        porEjecutivo[ej] = {
          ejecutivo: ej,
          origen: f.origen,
          totalFacturas: 0,
          pendientes: 0,
          parciales: 0,
          completas: 0,
          sinControl: 0,
          totalCajas: 0,
          cajasDespachadas: 0
        };
      }

      const P = porEjecutivo[ej];
      P.totalFacturas++;
      P.totalCajas += f.totalCajas;
      P.cajasDespachadas += f.totalDespachado || 0;

      switch (f.estado) {
        case 'PENDIENTE': P.pendientes++; break;
        case 'DESPACHADO_PARCIAL': P.parciales++; break;
        case 'DESPACHADO_COMPLETO': P.completas++; break;
        case 'SIN_CONTROL': P.sinControl++; break;
      }
    });

    const resumen = Object.values(porEjecutivo)
      .map(e => ({
        ...e,
        totalCajas: Math.round(e.totalCajas),
        cajasDespachadas: Math.round(e.cajasDespachadas),
        fillRate: e.totalCajas > 0 ? Math.round((e.cajasDespachadas / e.totalCajas) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.totalCajas - a.totalCajas);

    return { ok: true, ejecutivos: resumen };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/* ===== API: Debug ===== */
function apiDespDebug() {
  try {
    const ss = _dsp_ss();
    const shMaestro = ss.getSheetByName(DESP_CONFIG.HOJAS.MAESTRO);
    const shEgresos = ss.getSheetByName(DESP_CONFIG.HOJAS.EGRESOS);
    
    // Estado del caché
    const cache = _dsp_getCache();
    const dashboardCached = cache.get(_dsp_getCacheKey('DASHBOARD'));
    
    // Usuario actual
    const usuario = _dsp_getUsuarioActual();

    return {
      ok: true,
      config: {
        spreadsheetId: DESP_CONFIG.SPREADSHEET_ID,
        ejecutivoVillaAlegre: DESP_CONFIG.EJECUTIVO_VILLA_ALEGRE,
        cacheTTL: DESP_CONFIG.CACHE_TTL + ' segundos'
      },
      hojas: {
        maestro: shMaestro ? { filas: shMaestro.getLastRow(), cols: shMaestro.getLastColumn() } : null,
        egresos: shEgresos ? { filas: shEgresos.getLastRow(), cols: shEgresos.getLastColumn() } : null
      },
      cache: {
        dashboard: dashboardCached ? 'CACHED (' + Math.round(dashboardCached.length / 1024) + ' KB)' : 'NOT CACHED'
      },
      usuario: usuario
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/* ===== API: Obtener Usuario Actual ===== */
function apiDespGetUsuario() {
  try {
    return {
      ok: true,
      usuario: _dsp_getUsuarioActual()
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/* ===== API: Forzar recarga (limpiar caché y recargar) ===== */
function apiDespForceRefresh() {
  try {
    // Limpiar caché
    apiDespClearCache();
    
    // Recargar datos
    const result = apiDespGetDashboard({});
    
    return {
      ok: true,
      message: 'Datos recargados correctamente',
      totalFacturas: result.facturas ? result.facturas.length : 0
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}