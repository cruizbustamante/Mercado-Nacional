/***** ========================================================
 *  MÓDULO APROBADOR — BACKEND OPTIMIZADO v2.0
 *  Con soporte para Dashboard y KPIs mejorados
 *  ====================================================== *****/

const APROBADOR_CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: {
    NV_BASE: 'NV_Base',
    NV_LOG: 'NV_Log',
    CLIENTES: 'AR',
    PRODUCTOS: 'Lista Productos',
    STOCK: 'Stock_Teorico'
  },
  ESTADOS: { 
    PENDIENTE:'PENDIENTE', 
    APROBADO:'APROBADO', 
    RECHAZADO:'RECHAZADO', 
    FACTURADO:'FACTURADO', 
    DESPACHADO:'DESPACHADO' 
  },
  LOGISTICO: { NETO_UNITARIO: 360, IVA_PCT: 0.19 },
  CACHE_DURATION: 300 // 5 minutos en segundos
};

/* ===== Cache Simple ===== */
const _cache = {
  get(key) {
    const cache = CacheService.getScriptCache();
    const data = cache.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch(e) {
      return null;
    }
  },
  set(key, value, ttl = APROBADOR_CONFIG.CACHE_DURATION) {
    const cache = CacheService.getScriptCache();
    try {
      cache.put(key, JSON.stringify(value), ttl);
    } catch(e) {
      console.error('Cache error:', e);
    }
  },
  clear(key) {
    CacheService.getScriptCache().remove(key);
  }
};

/* ===== Helpers ===== */
function _getSheet(){ return SpreadsheetApp.openById(APROBADOR_CONFIG.SPREADSHEET_ID); }
function _normalizeText(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function _findColumn(headers, names){
  const map={}; headers.forEach((h,i)=>map[_normalizeText(h)]=i);
  for (const n of names){ const k=_normalizeText(n); if(map[k]!==undefined) return map[k]; }
  return -1;
}
function _formatNumber(v){
  if(typeof v==='number') return v;
  const s=String(v||'').replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
  const num=parseFloat(s.replace(/[^\d.\-]/g,''));
  return isNaN(num)?0:num;
}
function _asPercent(v, fb){ const x=(v===undefined||v===null)?fb:_formatNumber(v); return x>1?x/100:x; }
function _formatCLP(n){ return Math.round(_formatNumber(n)); }

/* ==== Productos con fallback ===== */
function _getProductosSheet_(){
  const ss = _getSheet();
  const preferidas = [
    APROBADOR_CONFIG.HOJAS.PRODUCTOS,
    'Lista Productos % ILA',
    'Lista Productos',
    'Productos'
  ].filter(Boolean);
  for (var i=0;i<preferidas.length;i++){
    const sh = ss.getSheetByName(preferidas[i]);
    if (sh) return sh;
  }
  return null;
}

function _findPctCol_(headers, tipo){
  const needle = _normalizeText(tipo);
  let idx = -1;
  for (let i=0;i<headers.length;i++){
    const h = _normalizeText(headers[i]);
    if (h.includes(needle) && (h.includes('%') || h.includes('porcentaje')) && !h.includes('=')){
      idx = i; break;
    }
  }
  if (idx !== -1) return idx;
  const variants = [ `% ${needle}`, `${needle} %`, `${needle}%`, `%${needle}`, `porcentaje ${needle}` ];
  idx = _findColumn(headers, variants);
  if (idx !== -1) return idx;
  for (let j=0;j<headers.length;j++){
    const hj = _normalizeText(headers[j]);
    if (hj === needle) return j;
  }
  return -1;
}

/* ===== LOG ===== */
function _sheet(name){ const ss=_getSheet(); return ss.getSheetByName(name) || ss.insertSheet(name); }
function _ensureLogHeaders_(sh){ if(sh.getLastRow()===0){ sh.appendRow(['TS','Accion','NV','Usuario','Detalle','EstadoNuevo']); } }
function _registrarLog(accion, nv, detalle, estadoNuevo){
  try{
    const sh=_sheet(APROBADOR_CONFIG.HOJAS.NV_LOG);
    _ensureLogHeaders_(sh);
    const usuario = Session.getActiveUser().getEmail() || 'N/A';
    sh.appendRow([new Date(), accion, String(nv||''), usuario, String(detalle||''), String(estadoNuevo||'')]);
  }catch(e){ console.error('NV_Log error', e); }
}

/* ===== PRODUCTOS ===== */
function _buildProductoMap_(){
  // Con cache de 5 minutos
  const cached = _cache.get('productos_map');
  if (cached) return cached;
  
  const sh = _getProductosSheet_();
  if(!sh) return {};
  const data = sh.getDataRange().getValues();
  if(data.length<2) return {};
  const H = data[0];

  const cSKU   = _findColumn(H,['SKU','Codigo','Código','Cód Producto','Cod Producto','Cód. Producto','Cod. Producto']);
  const cBxC   = _findColumn(H,['Bxc','Un x Caja','Un x caja','Unidades por caja','Unidades Por Caja']);
  const cNeto  = _findColumn(H,['Neto U','Precio Neto Unitario','Precio Neto','Precio Neto U']);
  const cBruto = _findColumn(H,['Bruto U','Precio Bruto Unitario','Precio Bruto','Precio Bruto U']);
  const cIVA   = _findPctCol_(H, 'iva');
  const cILA   = _findPctCol_(H, 'ila');
  const cMin = _findColumn(H,[
    'Precio Min Neto','Precio Mín Neto','Precio Minimo Neto','Precio Mínimo Neto',
    'Min Neto','Min Neto U','Min Neto Unidad','Precio Min Neto U','P.Min Neto'
  ]);

  const map = {};
  for(let i=1;i<data.length;i++){
    const r = data[i];
    const sku = String(r[cSKU]||'').replace(/\s+/g,'');
    if(!sku) continue;

    const ivaPct = _asPercent(cIVA>-1 ? r[cIVA] : 0.19, 0.19);
    const ilaPct = _asPercent(cILA>-1 ? r[cILA] : 0.00, 0.00);

    map[sku] = {
      sku,
      nombre: String(r[0]||sku),
      bxc: _formatNumber(r[cBxC]||12),
      precioNetoUnitario: _formatNumber(r[cNeto]||0),
      precioBrutoUnitario: _formatNumber(r[cBruto]||0),
      ivaPorcentaje: ivaPct,
      ilaPorcentaje: ilaPct,
      minNetoUnitario: _formatNumber(cMin>-1 ? r[cMin] : 0)
    };
  }
  
  _cache.set('productos_map', map);
  return map;
}

function apiGetProductoBySKU_Aprobador(sku){
  try{
    const map = _buildProductoMap_();
    const key = String(sku||'').replace(/\s+/g,'');
    return map[key] || null;
  }catch(e){ return null; }
}

function apiBuscarProductosAprobador(query, limit){
  try{
    const map = _buildProductoMap_();
    const q = _normalizeText(query||'');
    const all = Object.values(map);
    const res = all.filter(p => _normalizeText(p.nombre).includes(q) || _normalizeText(p.sku).includes(q)).slice(0, limit||10);
    return res;
  }catch(e){ return []; }
}

/* ===== LISTADO OPTIMIZADO ===== */
function apiGetNVPendientes(filtros = {}){
  try{
    const sh = _getSheet().getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if(!sh) return [];
    const data = sh.getDataRange().getValues();
    if(data.length<2) return [];
    const H = data[0];
    
    const colNV        = _findColumn(H,['Nota Venta']);
    const colFecha     = _findColumn(H,['Fecha NV']);
    const colCliente   = _findColumn(H,['Nombre Cliente']);
    const colRUT       = _findColumn(H,['RUT CLIENTE']);
    const colVendedor  = _findColumn(H,['Ejecutivo']);
    const colTotal     = _findColumn(H,['Total']);
    const colEstado    = _findColumn(H,['Estado Nota Venta']);
    const colVB        = _findColumn(H,['V°B°','V°B° Financiero','VB Financiero']);
    const colFactura   = _findColumn(H,['N° Factura']);
    const colDespDesde = _findColumn(H,['Despachar Desde']);
    const colDesc      = _findColumn(H,['Descripción Producto','Descripcion Producto']);
    const colSKU       = _findColumn(H,['Cód. Producto','Cod. Producto','Codigo Producto']);
    const colCajas     = _findColumn(H,['Cajas']);
    
    if(colNV===-1) return [];

    const nvMap = {};
    for(let i=1;i<data.length;i++){
      const row = data[i];
      const numeroNV = String(row[colNV]||'').trim();
      if(!numeroNV) continue;

      const estado   = colEstado>-1 ? String(row[colEstado]||APROBADOR_CONFIG.ESTADOS.PENDIENTE) : APROBADOR_CONFIG.ESTADOS.PENDIENTE;
      const vendedor = colVendedor>-1 ? String(row[colVendedor]||'') : '';

      if (filtros.estado && estado!==filtros.estado) continue;
      if (filtros.vendedor && vendedor!==filtros.vendedor) continue;

      if(!nvMap[numeroNV]){
        const fecha   = colFecha>-1 ? row[colFecha] : '';
        const fechaStr = (fecha instanceof Date) ? fecha.toISOString().slice(0,10) : String(fecha).slice(0,10);

        if (filtros.fechaDesde && fechaStr < filtros.fechaDesde) continue;
        if (filtros.fechaHasta && fechaStr > filtros.fechaHasta) continue;

        nvMap[numeroNV] = {
          numeroNV,
          fecha: fechaStr,
          cliente: colCliente>-1 ? String(row[colCliente]||'') : '',
          rut:     colRUT>-1 ? String(row[colRUT]||'') : '',
          vendedor,
          total: 0,
          estado,
          requiereVBFinanciero: false,
          numeroFactura:  colFactura>-1 ? String(row[colFactura]||'') : '',
          despacharDesde: colDespDesde>-1 ? String(row[colDespDesde]||'') : '',
          items: [],
          diasPendiente: Math.floor((new Date() - new Date(fechaStr)) / 86400000)
        };
      }

      const itemTotal = colTotal>-1 ? _formatNumber(row[colTotal]||0) : 0;
      const item = {
        producto: String(colDesc>-1 ? row[colDesc]||'' : ''),
        sku: colSKU>-1 ? String(row[colSKU]||'') : '',
        cajas: colCajas>-1 ? _formatNumber(row[colCajas]||0) : 0,
        total: itemTotal
      };
      nvMap[numeroNV].items.push(item);
      nvMap[numeroNV].total += itemTotal;

      if(colVB>-1 && /requiere/i.test(String(row[colVB]||''))){
        nvMap[numeroNV].requiereVBFinanciero = true;
      }
    }

    let out = Object.values(nvMap);
    if (filtros.montoMin) out = out.filter(x => (x.total||0) >= Number(filtros.montoMin));
    if (filtros.soloVB)   out = out.filter(x => x.requiereVBFinanciero === true);

    out.sort((a,b)=>{
      if(a.requiereVBFinanciero && !b.requiereVBFinanciero) return -1;
      if(!a.requiereVBFinanciero && b.requiereVBFinanciero) return 1;
      return new Date(b.fecha) - new Date(a.fecha);
    });

    return out;
  }catch(err){ 
    console.error('apiGetNVPendientes', err); 
    return []; 
  }
}

/* ===== DETALLE (con IVA/ILA/min) ===== */
function apiGetDetalleNV(numeroNV){
  try{
    const sh = _getSheet().getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if(!sh) return null;
    const data = sh.getDataRange().getValues();
    if(data.length<2) return null;

    const prodMap = _buildProductoMap_();

    const H = data[0];
    const colNV        = _findColumn(H,['Nota Venta']); if(colNV===-1) return null;
    const colFecha     = _findColumn(H,['Fecha NV']);
    const colCliente   = _findColumn(H,['Nombre Cliente']);
    const colRUT       = _findColumn(H,['RUT CLIENTE']);
    const colComuna    = _findColumn(H,['Comuna']);
    const colCiudad    = _findColumn(H,['Ciudad']);
    const colVendedor  = _findColumn(H,['Ejecutivo']);
    const colPago      = _findColumn(H,['Forma de Pago','Condicion Pago','Forma de Pago']);
    const colDespDesde = _findColumn(H,['Despachar Desde']);
    const colDespDir   = _findColumn(H,['Dirección Despacho','Direccion Despacho']);
    const colDespHora  = _findColumn(H,['Horario Despacho']);
    const colObs       = _findColumn(H,['Observaciones']);
    const colEstado    = _findColumn(H,['Estado Nota Venta']);
    const colFactura   = _findColumn(H,['N° Factura']);
    const colNCred     = _findColumn(H,['N° Nota de Crédito','N° Nota Credito','Nota de Crédito','Nota de Credito','NC','N° NC']);

    const colSKU       = _findColumn(H,['Cód. Producto','Cod. Producto','Codigo Producto']);
    const colDesc      = _findColumn(H,['Descripción Producto','Descripcion Producto']);
    const colBxC       = _findColumn(H,['Un x Caja','Un x caja']);
    const colCajas     = _findColumn(H,['Cajas']);
    const colUnidades  = _findColumn(H,['Unidades','unidades']);
    const colVB        = _findColumn(H,['V°B°','V°B° Financiero','VB Financiero']);

    const colNetoBase  = _findColumn(H,['Neto U Base','Neto Base']);
    const colBrutoBase = _findColumn(H,['Bruto U Base','Bruto Base']);
    const colNetoFinal = _findColumn(H,['Neto U Final','Neto Final']);
    const colBrutoFinal= _findColumn(H,['Bruto U Final','Bruto Final']);

    const colDescLinea = _findColumn(H,['Descuento Línea','Descuento Linea','Descto']);
    const colNeto      = _findColumn(H,['Neto','neto']);
    const colIVA       = _findColumn(H,['IVA','iva']);
    const colILA       = _findColumn(H,['ILA','ila']);
    const colLogistico = _findColumn(H,['Costo Logístico','Costo Logistico','costo logistico']);
    const colTotal     = _findColumn(H,['Total','total']);

    let nvInfo = null;
    const items = [];

    for(let i=1;i<data.length;i++){
      const row = data[i];
      if(String(row[colNV]) !== String(numeroNV)) continue;

      if(!nvInfo){
        const f = colFecha>-1 ? row[colFecha] : '';
        const fechaStr = (f instanceof Date) ? f.toISOString().slice(0,10) : String(f).slice(0,10);
        nvInfo = {
          numeroNV: String(numeroNV),
          fecha: fechaStr,
          cliente: {
            nombre: colCliente>-1 ? String(row[colCliente]||'') : '',
            rut:    colRUT>-1 ? String(row[colRUT]||'') : '',
            comuna: colComuna>-1 ? String(row[colComuna]||'') : '',
            ciudad: colCiudad>-1 ? String(row[colCiudad]||'') : ''
          },
          vendedor:  colVendedor>-1 ? String(row[colVendedor]||'') : '',
          formaPago: colPago>-1 ? String(row[colPago]||'') : '',
          despacho: {
            desde:    colDespDesde>-1 ? String(row[colDespDesde]||'') : '',
            direccion:colDespDir>-1 ? String(row[colDespDir]||'') : '',
            horario:  colDespHora>-1 ? String(row[colDespHora]||'') : ''
          },
          observaciones: colObs>-1 ? String(row[colObs]||'') : '',
          estado:  colEstado>-1 ? String(row[colEstado]||APROBADOR_CONFIG.ESTADOS.PENDIENTE) : APROBADOR_CONFIG.ESTADOS.PENDIENTE,
          numeroFactura: colFactura>-1 ? String(row[colFactura]||'') : '',
          notaCredito:   colNCred>-1 ? String(row[colNCred]||'') : ''
        };
      }

      const sku = colSKU>-1 ? String(row[colSKU]||'') : '';
      const key = String(sku||'').replace(/\s+/g,'');
      const info = prodMap[key] || {};

      items.push({
        sku,
        nombre:  colDesc>-1 ? String(row[colDesc]||'') : '',
        bxc:     colBxC>-1 ? _formatNumber(row[colBxC]||0) : (info.bxc||0),
        cajas:   colCajas>-1 ? _formatNumber(row[colCajas]||0) : 0,
        unidades:colUnidades>-1 ? _formatNumber(row[colUnidades]||0) : 0,
        vbFinanciero: colVB>-1 ? String(row[colVB]||'') : '',
        ivaPct: _asPercent(info.ivaPorcentaje, 0.19),
        ilaPct: _asPercent(info.ilaPorcentaje, 0.00),
        minNetoUnitario: _formatNumber(info.minNetoUnitario||0),
        precios: {
          netoBase:   colNetoBase>-1 ? _formatNumber(row[colNetoBase]||info.precioNetoUnitario||0) : 0,
          brutoBase:  colBrutoBase>-1 ? _formatNumber(row[colBrutoBase]||0) : 0,
          netoFinal:  colNetoFinal>-1 ? _formatNumber(row[colNetoFinal]||0) : 0,
          brutoFinal: colBrutoFinal>-1 ? _formatNumber(row[colBrutoFinal]||0) : 0
        },
        totales: {
          descuento: colDescLinea>-1 ? _formatNumber(row[colDescLinea]||0) : 0,
          neto:      colNeto>-1 ? _formatNumber(row[colNeto]||0) : 0,
          iva:       colIVA>-1 ? _formatNumber(row[colIVA]||0) : 0,
          ila:       colILA>-1 ? _formatNumber(row[colILA]||0) : 0,
          logistico: colLogistico>-1 ? _formatNumber(row[colLogistico]||0) : 0,
          total:     colTotal>-1 ? _formatNumber(row[colTotal]||0) : 0
        }
      });
    }

    if(!nvInfo) return null;

    const totales = items.reduce((a,it)=>({
      neto:      a.neto      + it.totales.neto,
      descuento: a.descuento + it.totales.descuento,
      iva:       a.iva       + it.totales.iva,
      ila:       a.ila       + it.totales.ila,
      logistico: a.logistico + it.totales.logistico,
      total:     a.total     + it.totales.total,
      cajas:     a.cajas     + it.cajas,
      unidades:  a.unidades  + it.unidades
    }),{neto:0,descuento:0,iva:0,ila:0,logistico:0,total:0,cajas:0,unidades:0});

    return {...nvInfo, items, totales};
  }catch(err){ 
    console.error('apiGetDetalleNV', err); 
    return null; 
  }
}

/* ===== CAMBIAR ESTADO ===== */
function apiAprobarNV(numeroNV, aprobadoPor, comentario=''){
  try{
    const r = _cambiarEstadoNV(numeroNV, APROBADOR_CONFIG.ESTADOS.APROBADO);
    if(r.success){
      _registrarLog('APROBAR', numeroNV, 'Aprobada por: '+(aprobadoPor||'N/A'), APROBADOR_CONFIG.ESTADOS.APROBADO);
      _cache.clear('stats_aprobador'); // Invalidar cache de stats
      return {success:true, message:`Nota de Venta ${numeroNV} aprobada exitosamente`};
    }
    return r;
  }catch(err){ return {success:false, message:'Error al aprobar: '+err.message}; }
}

function apiRechazarNV(numeroNV, rechazadoPor, motivo){
  try{
    if(!motivo || !motivo.trim()) return {success:false, message:'El motivo de rechazo es obligatorio'};
    const r = _cambiarEstadoNV(numeroNV, APROBADOR_CONFIG.ESTADOS.RECHAZADO);
    if(r.success){
      _registrarLog('RECHAZAR', numeroNV, `Rechazada por: ${rechazadoPor||'N/A'} • Motivo: ${motivo}`, APROBADOR_CONFIG.ESTADOS.RECHAZADO);
      _cache.clear('stats_aprobador');
      return {success:true, message:`Nota de Venta ${numeroNV} rechazada`};
    }
    return r;
  }catch(err){ return {success:false, message:'Error al rechazar: '+err.message}; }
}

function _cambiarEstadoNV(numeroNV, nuevoEstado){
  const sh = _getSheet().getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
  if(!sh) throw new Error('Hoja NV_Base no encontrada');
  const data = sh.getDataRange().getValues();
  const H = data[0];
  const colNV=_findColumn(H,['Nota Venta']); 
  const colEstado=_findColumn(H,['Estado Nota Venta']);
  if(colNV===-1 || colEstado===-1) throw new Error('Columnas necesarias no encontradas');
  let n=0;
  for(let i=1;i<data.length;i++){
    if(String(data[i][colNV])===String(numeroNV)){ 
      sh.getRange(i+1,colEstado+1).setValue(nuevoEstado); 
      n++; 
    }
  }
  return n?{success:true,filasModificadas:n}:{success:false,message:'Nota de Venta no encontrada'};
}

/* ===== ESTADÍSTICAS MEJORADAS ===== */
function apiGetEstadisticasAprobador(){
  try{
    // Cache de 2 minutos
    const cached = _cache.get('stats_aprobador');
    if (cached) return cached;
    
    const sh = _getSheet().getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {
      pendientes:0, aprobadas:0, rechazadas:0, facturadas:0, 
      requierenVB:0, nvHoy:0, total:0, 
      valorPendiente:0, tiempoPromedioAprobacion:0
    };
    
    const data = sh.getDataRange().getValues();
    if(data.length<2) return {
      pendientes:0, aprobadas:0, rechazadas:0, facturadas:0, 
      requierenVB:0, nvHoy:0, total:0,
      valorPendiente:0, tiempoPromedioAprobacion:0
    };
    
    const H = data[0];
    const colEstado=_findColumn(H,['Estado Nota Venta']);
    const colFecha=_findColumn(H,['Fecha NV']);
    const colVB=_findColumn(H,['V°B°','V°B° Financiero','VB Financiero']);
    const colNV=_findColumn(H,['Nota Venta']);
    const colTotal=_findColumn(H,['Total']);
    
    const hoy = new Date().toISOString().slice(0,10);
    const hace30dias = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
    
    const seen = new Set();
    const nvData = new Map();
    
    let pendientes=0,aprobadas=0,rechazadas=0,facturadas=0,requierenVB=0,nvHoy=0;
    let valorPendiente=0;
    let aprobadasUltimos30=0, rechazadasUltimos30=0;
    
    for(let i=1;i<data.length;i++){
      const nv = String(data[i][colNV]||''); 
      if(!nv) continue;
      
      const estado = colEstado>-1 ? String(data[i][colEstado]||APROBADOR_CONFIG.ESTADOS.PENDIENTE) : APROBADOR_CONFIG.ESTADOS.PENDIENTE;
      const f = colFecha>-1 ? data[i][colFecha] : new Date();
      const fStr = (f instanceof Date)? f.toISOString().slice(0,10) : String(f).slice(0,10);
      const vb = colVB>-1 ? String(data[i][colVB]||'') : '';
      const total = colTotal>-1 ? _formatNumber(data[i][colTotal]||0) : 0;
      
      if(!seen.has(nv)){
        seen.add(nv);
        nvData.set(nv, {estado, fecha:fStr, vb, total});
        
        if(estado==='PENDIENTE') {
          pendientes++;
          valorPendiente += total;
        } else if(estado==='APROBADO') {
          aprobadas++;
          if(fStr >= hace30dias) aprobadasUltimos30++;
        } else if(estado==='RECHAZADO') {
          rechazadas++;
          if(fStr >= hace30dias) rechazadasUltimos30++;
        } else if(estado==='FACTURADO') {
          facturadas++;
        }
        
        if(fStr===hoy) nvHoy++;
      } else {
        // Acumular total si hay múltiples líneas
        const existing = nvData.get(nv);
        if(existing && estado === 'PENDIENTE') {
          existing.total += total;
          nvData.set(nv, existing);
        }
      }
      
      if(/requiere/i.test(vb)) requierenVB++;
    }
    
    // Calcular valor pendiente total
    valorPendiente = Array.from(nvData.values())
      .filter(nv => nv.estado === 'PENDIENTE')
      .reduce((sum, nv) => sum + nv.total, 0);
    
    const stats = {
      pendientes, 
      aprobadas, 
      rechazadas, 
      facturadas, 
      requierenVB, 
      nvHoy, 
      total: seen.size,
      valorPendiente: Math.round(valorPendiente),
      aprobadasUltimos30,
      rechazadasUltimos30,
      tiempoPromedioAprobacion: 2.5 // Placeholder - calcular del log si es necesario
    };
    
    _cache.set('stats_aprobador', stats, 120); // 2 minutos
    return stats;
    
  }catch(err){ 
    console.error('apiGetEstadisticasAprobador', err); 
    return {
      pendientes:0, aprobadas:0, rechazadas:0, facturadas:0, 
      requierenVB:0, nvHoy:0, total:0,
      valorPendiente:0, tiempoPromedioAprobacion:0
    }; 
  }
}

function apiGetVendedoresAprobador(){
  try{
    const sh=_getSheet().getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if(!sh) return [];
    const data=sh.getDataRange().getValues();
    if(data.length<2) return [];
    const H=data[0]; 
    const col=_findColumn(H,['Ejecutivo']); 
    if(col===-1) return [];
    const set=new Set(); 
    for(let i=1;i<data.length;i++){ 
      const v=String(data[i][col]||'').trim(); 
      if(v) set.add(v); 
    }
    return Array.from(set).sort();
  }catch(e){ return []; }
}

/* ===== GUARDAR EDICIÓN ===== */
function apiGuardarEdicionNV(numeroNV, itemsFront, notaCredito){
  try{
    if(!numeroNV) return {success:false, message:'NV inválida'};
    const sh = _getSheet().getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {success:false, message:'Hoja NV_Base no encontrada'};
    const data = sh.getDataRange().getValues();
    if(data.length<2) return {success:false, message:'NV_Base vacía'};
    const H = data[0];

    const cNV   = _findColumn(H,['Nota Venta']);
    const cFecha= _findColumn(H,['Fecha NV']);
    const cRut  = _findColumn(H,['RUT CLIENTE']);
    const cCli  = _findColumn(H,['Nombre Cliente']);
    const cCom  = _findColumn(H,['Comuna']);
    const cCiu  = _findColumn(H,['Ciudad']);
    const cEj   = _findColumn(H,['Ejecutivo']);
    const cFP   = _findColumn(H,['Forma de Pago']);
    const cSKU  = _findColumn(H,['Cód. Producto','Cod. Producto','Codigo Producto']);
    const cDesc = _findColumn(H,['Descripción Producto','Descripcion Producto']);
    const cBxC  = _findColumn(H,['Un x Caja','Un x caja']);
    const cCaj  = _findColumn(H,['Cajas']);
    const cUni  = _findColumn(H,['Unidades']);
    const cVB   = _findColumn(H,['V°B° Financiero','V°B°','VB Financiero']);
    const cNb   = _findColumn(H,['Neto U Base']);
    const cBb   = _findColumn(H,['Bruto U Base']);
    const cNf   = _findColumn(H,['Neto U Final']);
    const cBf   = _findColumn(H,['Bruto U Final']);
    const cDesL = _findColumn(H,['Descuento Línea','Descuento Linea']);
    const cNet  = _findColumn(H,['Neto']);
    const cIVA  = _findColumn(H,['IVA']);
    const cILA  = _findColumn(H,['ILA']);
    const cLog  = _findColumn(H,['Costo Logístico','Costo Logistico']);
    const cTot  = _findColumn(H,['Total']);
    const cEst  = _findColumn(H,['Estado Nota Venta']);
    const cFact = _findColumn(H,['N° Factura']);
    const cDD   = _findColumn(H,['Despachar Desde']);
    const cDir  = _findColumn(H,['Dirección Despacho','Direccion Despacho']);
    const cHor  = _findColumn(H,['Horario Despacho']);
    const cObs  = _findColumn(H,['Observaciones']);

    let cNC   = _findColumn(H,['N° Nota de Crédito','N° Nota Credito','Nota de Crédito','Nota de Credito','NC','N° NC']);
    if (cNC === -1){
      const lastCol = sh.getLastColumn();
      sh.insertColumnAfter(lastCol);
      const newIdx1 = lastCol + 1;
      sh.getRange(1, newIdx1).setValue('N° Nota de Crédito');
      cNC = newIdx1 - 1;
    }

    let firstRow = -1, lastRow = -1;
    let header = {
      fecha:'', rut:'', cliente:'', comuna:'', ciudad:'', ejecutivo:'', 
      formaPago:'', estado:'', factura:'', despDesde:'', dir:'', hor:'', 
      obs:'', notaCredito:''
    };
    
    for(let i=1;i<data.length;i++){
      if(String(data[i][cNV])===String(numeroNV)){
        if(firstRow===-1) firstRow=i+1;
        lastRow=i+1;
        if(!header.fecha){
          header.fecha = data[i][cFecha];
          header.rut = data[i][cRut];
          header.cliente = data[i][cCli];
          header.comuna = data[i][cCom];
          header.ciudad = data[i][cCiu];
          header.ejecutivo = data[i][cEj];
          header.formaPago = data[i][cFP];
          header.estado = data[i][cEst];
          header.factura = data[i][cFact];
          header.despDesde = data[i][cDD];
          header.dir = data[i][cDir];
          header.hor = data[i][cHor];
          header.obs = data[i][cObs];
          header.notaCredito = cNC>-1 ? (data[i][cNC]||'') : '';
        }
      }
    }
    if(firstRow===-1) return {success:false, message:'NV no encontrada'};

    const estadoUpper = String(header.estado||'').toUpperCase();
    if (estadoUpper === APROBADOR_CONFIG.ESTADOS.FACTURADO && !String(notaCredito||'').trim()){
      return {success:false, message:'Debe indicar el N° de Nota de Crédito para modificar una NV facturada.'};
    }
    const ncFinal = String(notaCredito||header.notaCredito||'').trim();

    const filas = [];
    const numCols = sh.getLastColumn();
    let sumN=0,sumIVA=0,sumILA=0,sumLOG=0,sumTotal=0,sumCajas=0,sumDesc=0;

    itemsFront.forEach(it=>{
      const cajas = _formatNumber(it.cajas||0);
      const bxc   = _formatNumber(it.bxc||0);
      const unidades = cajas*bxc;

      const ivaPct = _asPercent(it.ivaPct, 0.19);
      const ilaPct = _asPercent(it.ilaPct, 0.00);

      const netoU_base  = _formatNumber(it.netoBase || it.netoUnitarioBase || 0);
      const brutoU_base = _formatNumber(it.brutoBase || 0);

      const brutoU_final = _formatNumber(it.puBrutoFinal || it.brutoUnitarioFinal || 0);
      const logNetoU = APROBADOR_CONFIG.LOGISTICO.NETO_UNITARIO;
      const logIvaU  = logNetoU * APROBADOR_CONFIG.LOGISTICO.IVA_PCT;
      const logBrutoU= logNetoU + logIvaU;

      const brutoProductoU = Math.max(0, brutoU_final - logBrutoU);
      const netoU_final = brutoProductoU / (1 + ivaPct + ilaPct);

      const minU = _formatNumber(it.minNetoUnitario||0);
      const minComparacion = (minU>0 ? minU : netoU_base);
      const vbFinanciero = (minComparacion>0 && netoU_final < minComparacion)
        ? 'Requiere V°B° Financiero' : 'Sin V°B° Financiero';

      const descU   = Math.max(0, (netoU_base>0?netoU_base:netoU_final) - netoU_final);
      const descLin = descU * unidades;

      const netoProducto = netoU_final * unidades;
      const logNeto = logNetoU * unidades;
      const netoLinea = netoProducto + logNeto;

      const ivaLinea = (netoProducto * ivaPct) + (logNeto * APROBADOR_CONFIG.LOGISTICO.IVA_PCT);
      const ilaLinea = (netoProducto * ilaPct);
      const totalLinea = netoLinea + ivaLinea + ilaLinea;

      sumN += netoLinea; sumIVA += ivaLinea; sumILA += ilaLinea; 
      sumLOG += logNeto; sumTotal += totalLinea; sumCajas += cajas; 
      sumDesc += descLin;

      const row = new Array(numCols).fill('');
      if(cNV>-1)   row[cNV]   = String(numeroNV);
      if(cFecha>-1)row[cFecha]= header.fecha;
      if(cRut>-1)  row[cRut]  = header.rut;
      if(cCli>-1)  row[cCli]  = header.cliente;
      if(cCom>-1)  row[cCom]  = header.comuna;
      if(cCiu>-1)  row[cCiu]  = header.ciudad;
      if(cEj>-1)   row[cEj]   = header.ejecutivo;
      if(cFP>-1)   row[cFP]   = header.formaPago;

      if(cSKU>-1)  row[cSKU]  = String(it.sku||'');
      if(cDesc>-1) row[cDesc] = String(it.nombre||'');
      if(cBxC>-1)  row[cBxC]  = bxc;
      if(cCaj>-1)  row[cCaj]  = cajas;
      if(cUni>-1)  row[cUni]  = unidades;

      if(cVB>-1)   row[cVB]   = vbFinanciero;

      if(cNb>-1)   row[cNb]   = _formatCLP(netoU_base);
      if(cBb>-1)   row[cBb]   = _formatCLP(brutoU_base);
      if(cNf>-1)   row[cNf]   = _formatCLP(netoU_final);
      if(cBf>-1)   row[cBf]   = _formatCLP(brutoU_final);

      if(cDesL>-1) row[cDesL] = _formatCLP(descLin);
      if(cNet>-1)  row[cNet]  = _formatCLP(netoLinea);
      if(cIVA>-1)  row[cIVA]  = _formatCLP(ivaLinea);
      if(cILA>-1)  row[cILA]  = _formatCLP(ilaLinea);
      if(cLog>-1)  row[cLog]  = _formatCLP(logNeto);
      if(cTot>-1)  row[cTot]  = _formatCLP(totalLinea);

      if(cEst>-1)  row[cEst]  = header.estado;
      if(cFact>-1) row[cFact] = header.factura;
      if(cNC>-1)   row[cNC]   = ncFinal;
      if(cDD>-1)   row[cDD]   = header.despDesde;
      if(cDir>-1)  row[cDir]  = header.dir;
      if(cHor>-1)  row[cHor]  = header.hor;
      if(cObs>-1)  row[cObs]  = header.obs;

      filas.push(row);
    });

    const oldCount = lastRow-firstRow+1;
    if(oldCount>0) sh.deleteRows(firstRow, oldCount);
    sh.insertRowsBefore(firstRow, filas.length);
    sh.getRange(firstRow,1,filas.length,sh.getLastColumn()).setValues(filas);

    if (estadoUpper === APROBADOR_CONFIG.ESTADOS.FACTURADO){
      _registrarLog('EDITAR_POST_FACT', numeroNV, `Items: ${filas.length} • NC: ${ncFinal}`, header.estado);
    }else{
      _registrarLog('EDITAR', numeroNV, `Items: ${filas.length}`, header.estado);
    }
    
    _cache.clear('stats_aprobador');

    return {success:true, totales:{
      neto:_formatCLP(sumN), descuento:_formatCLP(sumDesc), iva:_formatCLP(sumIVA), 
      ila:_formatCLP(sumILA), logistico:_formatCLP(sumLOG), total:_formatCLP(sumTotal), 
      cajas:sumCajas
    }};
  }catch(err){
    console.error('apiGuardarEdicionNV', err);
    return {success:false, message:'Error al guardar edición: '+err.message};
  }
}

/* ===== ALERTAS ===== */
function apiGetNVsConSolicitudModif(){
  try{
    const ss = _getSheet();
    const shLog = ss.getSheetByName(APROBADOR_CONFIG.HOJAS.NV_LOG);
    const shBase = ss.getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if(!shLog || !shBase) return {ok:true, nvs:[]};

    const L = shLog.getDataRange().getValues();
    if(L.length < 2) return {ok:true, nvs:[]};
    const HL = L[0];
    const cAcc = HL.indexOf('Accion');
    const cNV  = HL.indexOf('NV');

    const setLog = new Set();
    for (let i=1;i<L.length;i++){
      const acc = String(L[i][cAcc]||'').toUpperCase();
      if (acc === 'SOL_MODIF'){
        const nv = String(L[i][cNV]||'').trim();
        if (nv) setLog.add(nv);
      }
    }

    const B = shBase.getDataRange().getValues();
    if(B.length < 2) return {ok:true, nvs:[]};
    const HB = B[0];
    const cBNV = HB.indexOf('Nota Venta');
    const cEst = HB.indexOf('Estado Nota Venta');

    const out = [];
    const seen = new Set();
    for (let r=1;r<B.length;r++){
      const nv2 = String(B[r][cBNV]||'').trim();
      if(!nv2 || seen.has(nv2)) continue;
      seen.add(nv2);
      const est = String(B[r][cEst]||'').toUpperCase();
      if (setLog.has(nv2) && est === 'PENDIENTE'){
        out.push(nv2);
      }
    }
    return {ok:true, nvs: out};
  }catch(e){
    return {ok:false, error:e.message, nvs:[]};
  }
}

/* ===== EXPORT XLSX OPTIMIZADO ===== */
function apiGetNVExportXLSX() {
  try {
    const ss = SpreadsheetApp.openById(APROBADOR_CONFIG.SPREADSHEET_ID);
    const sh = ss.getSheetByName(APROBADOR_CONFIG.HOJAS.NV_BASE);
    if (!sh) throw new Error(`No existe la hoja "${APROBADOR_CONFIG.HOJAS.NV_BASE}"`);

    const data = sh.getDataRange().getValues();
    if (data.length < 2) throw new Error('No hay datos para exportar');
    const H = data[0];

    const colNV        = _findColumn(H, ['Nota Venta']);
    const colFecha     = _findColumn(H, ['Fecha NV']);
    const colRUT       = _findColumn(H, ['RUT CLIENTE']);
    const colCliente   = _findColumn(H, ['Nombre Cliente']);
    const colEstado    = _findColumn(H, ['Estado Nota Venta']);
    const colSKU       = _findColumn(H, ['Cód. Producto','Cod. Producto','Codigo Producto']);
    const colDesc      = _findColumn(H, ['Descripción Producto','Descripcion Producto']);
    const colBxC       = _findColumn(H, ['Un x Caja','Un x caja']);
    const colCajas     = _findColumn(H, ['Cajas']);
    const colUnidades  = _findColumn(H, ['Unidades','unidades']);
    const colNetoBase  = _findColumn(H, ['Neto U Base','Neto Base']);
    const colDescto    = _findColumn(H, ['Descuento Línea','Descuento Linea','Descto']);
    const colNetoFinal = _findColumn(H, ['Neto U Final','Neto Final']);
    const colNeto      = _findColumn(H, ['Neto','neto']);
    const colIVA       = _findColumn(H, ['IVA','iva']);
    const colILA       = _findColumn(H, ['ILA','ila']);
    const colTotal     = _findColumn(H, ['Total','total']);
    const colVB        = _findColumn(H, ['V°B°','V°B° Financiero','VB Financiero']);

    function parsearFecha(v){
      if (!v) return null;
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
      let s = String(v).trim();
      if (!s) return null;
      s = s.replace(/[–—]/g,'-').replace(/\./g,'-').replace(/\s+/g,' ').trim();
      const mh = s.match(/^(.+?)\s+\d{1,2}:\d{2}(:\d{2})?$/); if (mh) s = mh[1];
      let m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/); if (m) return new Date(+m[3],+m[2]-1,+m[1]);
      m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);     if (m) return new Date(2000+(+m[3]),+m[2]-1,+m[1]);
      m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);     if (m) return new Date(+m[1],+m[2]-1,+m[3]);
      if (!isNaN(Number(s))) { const base=new Date(1899,11,30); return new Date(base.getTime()+Number(s)*86400000); }
      const f=new Date(s); return isNaN(f.getTime())?null:f;
    }
    function formatearFecha(f){ 
      return f?`${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}/${f.getFullYear()}`:'';}

    const MAX_REGISTROS = 300;
    const startIdx = Math.max(1, data.length - MAX_REGISTROS);
    const ultimas = data.slice(startIdx);

    const tempSS = SpreadsheetApp.create('__temp_export_nv');
    const tempSheet = tempSS.getActiveSheet();
    const TOTAL_COLS = 20;

    const headerRow = [
      'Nota Venta', 'Fecha NV', 'RUT CLIENTE', 'Nombre Cliente', 'Estado',
      'Cód. Producto', 'Descripción Producto', 'Un x Caja', 'Cajas', 'Unidades',
      'Neto Base', 'Descto', 'Neto Final', 'Neto', 'IVA', 'ILA', 'Total', 'V°B°', 
      'Observación', ''
    ];

    tempSheet.getRange(1,1,1,TOTAL_COLS).setValues([headerRow]);

    const exportRows = [];
    for (const row of ultimas) {
      const f = colFecha > -1 ? parsearFecha(row[colFecha]) : null;
      const obs = (!f && colFecha > -1) ? 'Revisar Fecha' : '';

      const nvRaw = colNV > -1 ? String(row[colNV] || '').trim() : '';
      
      exportRows.push([
        nvRaw ? 'NV-0' + nvRaw : '',
        formatearFecha(f),
        colRUT > -1 ? String(row[colRUT] || '') : '',
        colCliente > -1 ? String(row[colCliente] || '') : '',
        colEstado > -1 ? String(row[colEstado] || '') : '',
        colSKU > -1 ? String(row[colSKU] || '') : '',
        colDesc > -1 ? String(row[colDesc] || '') : '',
        colBxC > -1 ? row[colBxC] : '',
        colCajas > -1 ? row[colCajas] : '',
        colUnidades > -1 ? row[colUnidades] : '',
        colNetoBase > -1 ? row[colNetoBase] : '',
        colDescto > -1 ? row[colDescto] : '',
        colNetoFinal > -1 ? row[colNetoFinal] : '',
        colNeto > -1 ? row[colNeto] : '',
        colIVA > -1 ? row[colIVA] : '',
        colILA > -1 ? row[colILA] : '',
        colTotal > -1 ? row[colTotal] : '',
        colVB > -1 ? String(row[colVB] || '') : '',
        obs,
        ''
      ]);
    }

    const MAX_ROWS_PER_BATCH = 1000;
    for (let i = 0; i < exportRows.length; i += MAX_ROWS_PER_BATCH) {
      const batch = exportRows.slice(i, i + MAX_ROWS_PER_BATCH);
      tempSheet.getRange(2 + i, 1, batch.length, TOTAL_COLS).setValues(batch);
    }

    tempSheet.getRange(1,1,1,TOTAL_COLS)
      .setFontWeight('bold')
      .setBackground('#0854A0')
      .setFontColor('#FFFFFF');
    
    SpreadsheetApp.flush();
    Utilities.sleep(800);

    if (tempSheet.getLastRow() < 2) throw new Error('Export vacío: revisa mapeo de columnas');

    const tz = Session.getScriptTimeZone() || 'America/Santiago';
    const filename = `NV_Export_${Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmm')}.xlsx`;
    const url = `https://docs.google.com/spreadsheets/d/${tempSS.getId()}/export?format=xlsx&gid=${tempSheet.getSheetId()}`;
    const token = ScriptApp.getOAuthToken();
    const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const base64 = Utilities.base64Encode(resp.getBlob().getBytes());

    DriveApp.getFileById(tempSS.getId()).setTrashed(true);
    
    return { 
      filename, 
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      base64 
    };

  } catch (err) {
    console.error('Error en apiGetNVExportXLSX:', err);
    throw new Error('Error al generar archivo Excel: ' + err.message);
  }
}

/* ===== CSV EXPORT ===== */
const NV_CSV_EXPORT = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJA_NV: 'NV_Base',
  NOMBRE_ARCHIVO: () => {
    const tz = Session.getScriptTimeZone() || 'America/Santiago';
    const d  = new Date();
    const yyyy = Utilities.formatDate(d, tz, 'yyyy');
    const mm   = Utilities.formatDate(d, tz, 'MM');
    const dd   = Utilities.formatDate(d, tz, 'dd');
    const hh   = Utilities.formatDate(d, tz, 'HH');
    const mi   = Utilities.formatDate(d, tz, 'mm');
    return `NV_Base_${yyyy}${mm}${dd}_${hh}${mi}.csv`;
  }
};

function apiGetNVBaseCSV() {
  const ss = SpreadsheetApp.openById(NV_CSV_EXPORT.SPREADSHEET_ID);
  const sh = ss.getSheetByName(NV_CSV_EXPORT.HOJA_NV);
  if (!sh) throw new Error(`No existe la hoja "${NV_CSV_EXPORT.HOJA_NV}"`);

  const values = sh.getDataRange().getDisplayValues() || [];

  const sep = ';';
  const esc = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    if (s.includes('"') || s.includes(sep) || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = values.map(row => row.map(esc).join(sep)).join('\r\n');

  const csvWithBOM = '\uFEFF' + lines;

  const filename = NV_CSV_EXPORT.NOMBRE_ARCHIVO();
  const blob = Utilities.newBlob(csvWithBOM, 'text/csv;charset=utf-8', filename);

  return {
    filename: filename,
    mimeType: 'text/csv',
    base64: Utilities.base64Encode(blob.getBytes())
  };
}