/***** ========================================================
 *  BACKEND — ANÁLISIS OPERACIONAL LICORES (V2)
 *  Incluye: Costo Venta, Costo RR.HH. y Costo Operacional
 *  ====================================================== *****/

/* ===== Configuración ===== */
const OP_LICORES_CFG = {
  HOJA: 'Analisis Operacional'
};

// Definir categorías de costos operacionales
const COST_CATEGORIES = {
  almacen: [
    'Almacenaje', 'Entrada Bodega', 'Salida Bodega', 
    'Desconsolidacion', 'Outsourcing', 'Habilitacion'
  ],
  transporte: [
    'Transporte Almacenes', 'Transporte Externo Santiago', 
    'Transporte Villa alegre', 'Transporte Propio'
  ],
  mercaderistas: [
    'Mercaderistas'
  ]
};

/* ===== Helpers ===== */
function _opLicores_getSheet() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(OP_LICORES_CFG.HOJA);
    if (!sheet) {
      throw new Error(`No se encontró la hoja "${OP_LICORES_CFG.HOJA}"`);
    }
    return sheet;
  } catch (error) {
    console.error('Error accediendo a la hoja:', error);
    throw new Error(`Error de acceso: ${error.message}`);
  }
}

function _opLicores_labelMes(mes) {
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return meses[mes - 1] || `Mes ${mes}`;
}

function _opLicores_parseNumber(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const cleaned = String(value).replace(/\./g, '').replace(',', '.');
    const num = Number(cleaned);
    return isFinite(num) ? num : 0;
  }
  return 0;
}

function _opLicores_normalizeHeader(header) {
  return String(header || '').trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')  // Eliminar puntos
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u');
}

function _opLicores_findColumns(headers) {
  const normalizedHeaders = headers.map(_opLicores_normalizeHeader);
  
  const result = {
    almacen: [],
    transporte: [],
    mercaderistas: [],
    costoVenta: null,
    rrhhGerencia: null,
    rrhhVendedores: null,
    rrhhAdministracion: null,
    otros: []
  };
  
  // Normalizar nombres de categorías operacionales
  const normalizedCategories = {
    almacen: COST_CATEGORIES.almacen.map(_opLicores_normalizeHeader),
    transporte: COST_CATEGORIES.transporte.map(_opLicores_normalizeHeader),
    mercaderistas: COST_CATEGORIES.mercaderistas.map(_opLicores_normalizeHeader)
  };
  
  console.log('Headers normalizados:', normalizedHeaders);
  
  for (let i = 0; i < headers.length; i++) {
    const headerNorm = normalizedHeaders[i];
    const headerOrig = headers[i];
    
    // Buscar Costo Venta
    if (headerNorm.includes('costo') && headerNorm.includes('venta')) {
      result.costoVenta = { index: i, name: headerOrig };
      console.log(`COSTO VENTA: ${headerOrig} (col ${i})`);
      continue;
    }
    
    // Buscar RR.HH. Gerencia
    if ((headerNorm.includes('rrhh') || headerNorm.includes('rr.hh') || headerNorm.includes('rr hh')) && 
        headerNorm.includes('gerencia')) {
      result.rrhhGerencia = { index: i, name: headerOrig };
      console.log(`RR.HH. GERENCIA: ${headerOrig} (col ${i})`);
      continue;
    }
    
    // Buscar RR.HH. Vendedores
    if ((headerNorm.includes('rrhh') || headerNorm.includes('rr.hh') || headerNorm.includes('rr hh')) && 
        headerNorm.includes('vendedores')) {
      result.rrhhVendedores = { index: i, name: headerOrig };
      console.log(`RR.HH. VENDEDORES: ${headerOrig} (col ${i})`);
      continue;
    }
    
    // Buscar RR.HH. Administración
    if ((headerNorm.includes('rrhh') || headerNorm.includes('rr.hh') || headerNorm.includes('rr hh')) && 
        headerNorm.includes('administracion')) {
      result.rrhhAdministracion = { index: i, name: headerOrig };
      console.log(`RR.HH. ADMINISTRACIÓN: ${headerOrig} (col ${i})`);
      continue;
    }
    
    // Buscar en categorías operacionales
    let found = false;
    
    // Almacén
    if (normalizedCategories.almacen.some(cat => headerNorm.includes(cat) || cat.includes(headerNorm))) {
      result.almacen.push({ index: i, name: headerOrig });
      found = true;
      console.log(`ALMACÉN: ${headerOrig} (col ${i})`);
    }
    
    // Transporte
    if (normalizedCategories.transporte.some(cat => headerNorm.includes(cat) || cat.includes(headerNorm))) {
      result.transporte.push({ index: i, name: headerOrig });
      found = true;
      console.log(`TRANSPORTE: ${headerOrig} (col ${i})`);
    }
    
    // Mercaderistas
    if (normalizedCategories.mercaderistas.some(cat => headerNorm.includes(cat) || cat.includes(headerNorm))) {
      result.mercaderistas.push({ index: i, name: headerOrig });
      found = true;
      console.log(`MERCADERISTAS: ${headerOrig} (col ${i})`);
    }
    
    // Si no pertenece a ninguna categoría específica pero parece ser un costo
    if (!found && headerNorm !== 'periodo' && headerNorm !== 'venta' && headerNorm !== 'unidades' && headerNorm !== '% rent.') {
      result.otros.push({ index: i, name: headerOrig });
      console.log(`OTROS: ${headerOrig} (col ${i})`);
    }
  }
  
  return result;
}

/**
 * API: Obtiene los años disponibles
 */
function apiOpLicoresGetAnios() {
  try {
    console.log('=== Obteniendo años disponibles ===');
    const sheet = _opLicores_getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      console.log('No hay datos suficientes');
      return [];
    }

    const headers = data[0];
    console.log('Headers encontrados:', headers);

    let periodoCol = 0;
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i] || '').toLowerCase().trim();
      if (header === 'periodo' || header === 'fecha') {
        periodoCol = i;
        break;
      }
    }

    console.log(`Usando columna ${periodoCol} para fechas: ${headers[periodoCol]}`);

    const years = new Set();
    for (let i = 1; i < data.length; i++) {
      const fechaValue = data[i][periodoCol];
      if (fechaValue) {
        const fecha = fechaValue instanceof Date ? fechaValue : new Date(fechaValue);
        if (!isNaN(fecha.getTime())) {
          years.add(fecha.getFullYear());
        }
      }
    }

    const resultado = Array.from(years).sort((a, b) => b - a);
    console.log('Años encontrados:', resultado);
    return resultado;

  } catch (error) {
    console.error('Error en apiOpLicoresGetAnios:', error);
    throw new Error(`Error obteniendo años: ${error.message}`);
  }
}

/**
 * API: Obtiene resumen anual con 3 tipos de costos
 */
function apiOpLicoresGetResumen(year) {
  try {
    console.log(`=== Procesando año ${year} ===`);
    
    if (!year || isNaN(year)) {
      throw new Error('Año inválido');
    }

    const sheet = _opLicores_getSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) {
      return {
        ok: true,
        year: Number(year),
        months: [],
        totals: { 
          ventas: 0, 
          costoVenta: 0,
          costoRRHH: 0,
          rrhhGerencia: 0,
          rrhhVendedores: 0,
          rrhhAdministracion: 0,
          costoOperacional: 0, 
          unidades: 0,
          costoAlmacen: 0,
          costoTransporte: 0,
          costoMercaderistas: 0
        },
        prev: null
      };
    }

    const headers = data[0];
    console.log('Procesando headers:', headers);

    // Detectar columnas básicas
    const cols = {};
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i] || '').toLowerCase().trim();
      if (header === 'periodo') cols.periodo = i;
      if (header === 'venta') cols.venta = i;
      if (header === 'unidades') cols.unidades = i;
    }

    // Fallbacks
    if (cols.periodo === undefined) cols.periodo = 0;
    if (cols.venta === undefined) cols.venta = headers.length - 2;
    if (cols.unidades === undefined) cols.unidades = headers.length - 1;

    console.log('Columnas básicas detectadas:', cols);

    // Detectar todas las columnas de costos
    const costColumns = _opLicores_findColumns(headers);

    // Procesar datos
    const dataByMonth = {};
    const prevDataByMonth = {};

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const fechaValue = row[cols.periodo];
      
      if (!fechaValue) continue;

      const fecha = fechaValue instanceof Date ? fechaValue : new Date(fechaValue);
      if (isNaN(fecha.getTime())) continue;

      const rowYear = fecha.getFullYear();
      const month = fecha.getMonth() + 1;

      // Solo procesar año actual y anterior
      if (rowYear !== Number(year) && rowYear !== Number(year) - 1) continue;

      const ventas = _opLicores_parseNumber(row[cols.venta]);
      const unidades = _opLicores_parseNumber(row[cols.unidades]);

      // Costo Venta
      const costoVenta = costColumns.costoVenta 
        ? _opLicores_parseNumber(row[costColumns.costoVenta.index]) 
        : 0;

      // Costo RR.HH. - Desglosado
      const rrhhGerencia = costColumns.rrhhGerencia 
        ? _opLicores_parseNumber(row[costColumns.rrhhGerencia.index]) 
        : 0;
      
      const rrhhVendedores = costColumns.rrhhVendedores 
        ? _opLicores_parseNumber(row[costColumns.rrhhVendedores.index]) 
        : 0;
      
      const rrhhAdministracion = costColumns.rrhhAdministracion 
        ? _opLicores_parseNumber(row[costColumns.rrhhAdministracion.index]) 
        : 0;
      
      const costoRRHH = rrhhGerencia + rrhhVendedores + rrhhAdministracion;

      // Costos operacionales por categoría
      const costoAlmacen = costColumns.almacen.reduce((sum, col) => 
        sum + _opLicores_parseNumber(row[col.index]), 0);
      
      const costoTransporte = costColumns.transporte.reduce((sum, col) => 
        sum + _opLicores_parseNumber(row[col.index]), 0);
      
      const costoMercaderistas = costColumns.mercaderistas.reduce((sum, col) => 
        sum + _opLicores_parseNumber(row[col.index]), 0);
      
      const costoOtros = costColumns.otros.reduce((sum, col) => 
        sum + _opLicores_parseNumber(row[col.index]), 0);

      const costoOperacional = costoAlmacen + costoTransporte + costoMercaderistas + costoOtros;

      console.log(`Fila ${i} - ${fecha.toDateString()}:`, {
        ventas,
        costoVenta,
        costoRRHH, 
        costoOperacional,
        breakdown: { costoAlmacen, costoTransporte, costoMercaderistas, costoOtros }
      });

      const target = rowYear === Number(year) ? dataByMonth : prevDataByMonth;
      const key = month;

      if (!target[key]) {
        target[key] = { 
          ventas: 0,
          costoVenta: 0,
          costoRRHH: 0,
          rrhhGerencia: 0,
          rrhhVendedores: 0,
          rrhhAdministracion: 0,
          costoOperacional: 0,
          unidades: 0,
          costoAlmacen: 0,
          costoTransporte: 0,
          costoMercaderistas: 0
        };
      }

      target[key].ventas += ventas;
      target[key].costoVenta += costoVenta;
      target[key].costoRRHH += costoRRHH;
      target[key].rrhhGerencia += rrhhGerencia;
      target[key].rrhhVendedores += rrhhVendedores;
      target[key].rrhhAdministracion += rrhhAdministracion;
      target[key].costoOperacional += costoOperacional;
      target[key].unidades += unidades;
      target[key].costoAlmacen += costoAlmacen;
      target[key].costoTransporte += costoTransporte;
      target[key].costoMercaderistas += costoMercaderistas;
    }

    // Construir respuesta
    const months = [];
    let totalVentas = 0, totalCostoVenta = 0, totalCostoRRHH = 0, totalCostoOp = 0, totalUnidades = 0;
    let totalRRHHGerencia = 0, totalRRHHVendedores = 0, totalRRHHAdministracion = 0;
    let totalAlmacen = 0, totalTransporte = 0, totalMercaderistas = 0;

    for (let m = 1; m <= 12; m++) {
      const monthData = dataByMonth[m] || { 
        ventas: 0, costoVenta: 0, costoRRHH: 0, 
        rrhhGerencia: 0, rrhhVendedores: 0, rrhhAdministracion: 0,
        costoOperacional: 0, unidades: 0,
        costoAlmacen: 0, costoTransporte: 0, costoMercaderistas: 0
      };
      const prevMonthData = prevDataByMonth[m] || { 
        ventas: 0, costoVenta: 0, costoRRHH: 0,
        rrhhGerencia: 0, rrhhVendedores: 0, rrhhAdministracion: 0,
        costoOperacional: 0, unidades: 0,
        costoAlmacen: 0, costoTransporte: 0, costoMercaderistas: 0
      };

      // KPIs por tipo de costo
      const kpiCostoVenta = monthData.ventas > 0 ? monthData.costoVenta / monthData.ventas : 0;
      const kpiCostoRRHH = monthData.ventas > 0 ? monthData.costoRRHH / monthData.ventas : 0;
      const kpiCostoOp = monthData.ventas > 0 ? monthData.costoOperacional / monthData.ventas : 0;
      
      const prevKpiCostoVenta = prevMonthData.ventas > 0 ? prevMonthData.costoVenta / prevMonthData.ventas : 0;
      const prevKpiCostoRRHH = prevMonthData.ventas > 0 ? prevMonthData.costoRRHH / prevMonthData.ventas : 0;
      const prevKpiCostoOp = prevMonthData.ventas > 0 ? prevMonthData.costoOperacional / prevMonthData.ventas : 0;

      months.push({
        m: m,
        label: _opLicores_labelMes(m),
        ventas: monthData.ventas,
        costoVenta: monthData.costoVenta,
        costoRRHH: monthData.costoRRHH,
        rrhhGerencia: monthData.rrhhGerencia,
        rrhhVendedores: monthData.rrhhVendedores,
        rrhhAdministracion: monthData.rrhhAdministracion,
        costoOperacional: monthData.costoOperacional,
        unidades: monthData.unidades,
        costoAlmacen: monthData.costoAlmacen,
        costoTransporte: monthData.costoTransporte,
        costoMercaderistas: monthData.costoMercaderistas,
        kpiCostoVenta: kpiCostoVenta,
        kpiCostoRRHH: kpiCostoRRHH,
        kpiCostoOp: kpiCostoOp,
        yoyCostoVenta: kpiCostoVenta - prevKpiCostoVenta,
        yoyCostoRRHH: kpiCostoRRHH - prevKpiCostoRRHH,
        yoyCostoOp: kpiCostoOp - prevKpiCostoOp
      });

      totalVentas += monthData.ventas;
      totalCostoVenta += monthData.costoVenta;
      totalCostoRRHH += monthData.costoRRHH;
      totalRRHHGerencia += monthData.rrhhGerencia;
      totalRRHHVendedores += monthData.rrhhVendedores;
      totalRRHHAdministracion += monthData.rrhhAdministracion;
      totalCostoOp += monthData.costoOperacional;
      totalUnidades += monthData.unidades;
      totalAlmacen += monthData.costoAlmacen;
      totalTransporte += monthData.costoTransporte;
      totalMercaderistas += monthData.costoMercaderistas;
    }

    // Totales año anterior
    let prevTotalVentas = 0, prevTotalCostoVenta = 0, prevTotalCostoRRHH = 0, prevTotalCostoOp = 0, prevTotalUnidades = 0;
    let prevTotalRRHHGerencia = 0, prevTotalRRHHVendedores = 0, prevTotalRRHHAdministracion = 0;
    let prevTotalAlmacen = 0, prevTotalTransporte = 0, prevTotalMercaderistas = 0;
    const prevMonths = [];

    for (let m = 1; m <= 12; m++) {
      const prevData = prevDataByMonth[m] || { 
        ventas: 0, costoVenta: 0, costoRRHH: 0,
        rrhhGerencia: 0, rrhhVendedores: 0, rrhhAdministracion: 0,
        costoOperacional: 0, unidades: 0,
        costoAlmacen: 0, costoTransporte: 0, costoMercaderistas: 0
      };
      
      const prevKpiCostoVenta = prevData.ventas > 0 ? prevData.costoVenta / prevData.ventas : 0;
      const prevKpiCostoRRHH = prevData.ventas > 0 ? prevData.costoRRHH / prevData.ventas : 0;
      const prevKpiCostoOp = prevData.ventas > 0 ? prevData.costoOperacional / prevData.ventas : 0;

      prevMonths.push({
        m: m,
        label: _opLicores_labelMes(m),
        ventas: prevData.ventas,
        costoVenta: prevData.costoVenta,
        costoRRHH: prevData.costoRRHH,
        rrhhGerencia: prevData.rrhhGerencia,
        rrhhVendedores: prevData.rrhhVendedores,
        rrhhAdministracion: prevData.rrhhAdministracion,
        costoOperacional: prevData.costoOperacional,
        unidades: prevData.unidades,
        costoAlmacen: prevData.costoAlmacen,
        costoTransporte: prevData.costoTransporte,
        costoMercaderistas: prevData.costoMercaderistas,
        kpiCostoVenta: prevKpiCostoVenta,
        kpiCostoRRHH: prevKpiCostoRRHH,
        kpiCostoOp: prevKpiCostoOp
      });

      prevTotalVentas += prevData.ventas;
      prevTotalCostoVenta += prevData.costoVenta;
      prevTotalCostoRRHH += prevData.costoRRHH;
      prevTotalRRHHGerencia += prevData.rrhhGerencia;
      prevTotalRRHHVendedores += prevData.rrhhVendedores;
      prevTotalRRHHAdministracion += prevData.rrhhAdministracion;
      prevTotalCostoOp += prevData.costoOperacional;
      prevTotalUnidades += prevData.unidades;
      prevTotalAlmacen += prevData.costoAlmacen;
      prevTotalTransporte += prevData.costoTransporte;
      prevTotalMercaderistas += prevData.costoMercaderistas;
    }

    const resultado = {
      ok: true,
      year: Number(year),
      months: months,
      totals: {
        ventas: totalVentas,
        costoVenta: totalCostoVenta,
        costoRRHH: totalCostoRRHH,
        rrhhGerencia: totalRRHHGerencia,
        rrhhVendedores: totalRRHHVendedores,
        rrhhAdministracion: totalRRHHAdministracion,
        costoOperacional: totalCostoOp,
        unidades: totalUnidades,
        costoAlmacen: totalAlmacen,
        costoTransporte: totalTransporte,
        costoMercaderistas: totalMercaderistas,
        kpiCostoVenta: totalVentas > 0 ? totalCostoVenta / totalVentas : 0,
        kpiCostoRRHH: totalVentas > 0 ? totalCostoRRHH / totalVentas : 0,
        kpiCostoOp: totalVentas > 0 ? totalCostoOp / totalVentas : 0
      },
      prev: {
        year: Number(year) - 1,
        months: prevMonths,
        totals: {
          ventas: prevTotalVentas,
          costoVenta: prevTotalCostoVenta,
          costoRRHH: prevTotalCostoRRHH,
          rrhhGerencia: prevTotalRRHHGerencia,
          rrhhVendedores: prevTotalRRHHVendedores,
          rrhhAdministracion: prevTotalRRHHAdministracion,
          costoOperacional: prevTotalCostoOp,
          unidades: prevTotalUnidades,
          costoAlmacen: prevTotalAlmacen,
          costoTransporte: prevTotalTransporte,
          costoMercaderistas: prevTotalMercaderistas,
          kpiCostoVenta: prevTotalVentas > 0 ? prevTotalCostoVenta / prevTotalVentas : 0,
          kpiCostoRRHH: prevTotalVentas > 0 ? prevTotalCostoRRHH / prevTotalVentas : 0,
          kpiCostoOp: prevTotalVentas > 0 ? prevTotalCostoOp / prevTotalVentas : 0
        }
      }
    };

    console.log('Resultado final:', {
      year: resultado.year,
      kpiCostoVenta: (resultado.totals.kpiCostoVenta * 100).toFixed(2) + '%',
      kpiCostoRRHH: (resultado.totals.kpiCostoRRHH * 100).toFixed(2) + '%',
      kpiCostoOp: (resultado.totals.kpiCostoOp * 100).toFixed(2) + '%',
      ventas: resultado.totals.ventas.toLocaleString(),
      mesesConDatos: months.filter(m => m.ventas > 0).length
    });

    return resultado;

  } catch (error) {
    console.error('Error en apiOpLicoresGetResumen:', error);
    return {
      ok: false,
      error: error.message
    };
  }
}