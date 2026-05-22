/***** ========================================================
 *  MÓDULO STOCK — BACKEND (Google Apps Script)
 *  Stock Disponible (solo SANTIAGO) + Reglas de despacho
 *  INTEGRADO con Órdenes de Compra Supermercados
 *  Optimizado con caché para filtros rápidos
 *  ====================================================== *****/

const STOCK_CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: {
    STOCK_TEORICO: 'Stock_Teorico',
    NV_BASE: 'NV_Base',
    EGRESOS: 'Egresos',
    OC_SUPERMERCADOS: 'OC_Supermercados',  // NUEVO
    OC_FACTURAS: 'OC_Facturas'             // NUEVO
  }
};

// Facturas del año indicado se consideran 100% despachadas
const ANIO_COMPLETO_DESPACHADO = 2024;

// Caché (segundos)
const CACHE_KEY = 'stock_data_v2';
const CACHE_TTL = 180; // 3 min

/* ==================== Helpers ==================== */
function _s_getSheet(){ return SpreadsheetApp.openById(STOCK_CONFIG.SPREADSHEET_ID); }
function _s_norm(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function _s_find(headers, names){ const map={}; headers.forEach((h,i)=>map[_s_norm(h)]=i); for(const n of names){const k=_s_norm(n); if(map[k]!==undefined)return map[k]} return -1; }
function _s_normalizeSKU(sku){ return String(sku||'').replace(/\s+/g,'').toUpperCase().trim(); }
function _s_isSantiago(v){ const s=_s_norm(v); return !!s&&(s.includes('santiago')||s.includes('cd santiago')||s==='stgo'||s==='rm'); }
/** Parser robusto */
function _s_num(v){
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v||'').trim(); if (!s) return 0;
  s = s.replace(/\s+/g,'').replace(/[^\d.,\-]/g,'');
  const lastDot=s.lastIndexOf('.'), lastCom=s.lastIndexOf(',');
  if (lastDot!==-1 && lastCom!==-1){
    const decSep = lastDot>lastCom ? '.' : ','; const thou = decSep==='.' ? ',' : '.';
    s = s.split(thou).join(''); if (decSep===',') s = s.replace(',', '.'); return parseFloat(s)||0;
  }
  if (lastCom!==-1){ if (/,(\d{3})(,|$)/.test(s)) s=s.split(',').join(''); else s=s.replace(',', '.'); return parseFloat(s)||0; }
  if (lastDot!==-1){ if (/\.(\d{3})(\.|$)/.test(s)) s=s.split('.').join(''); return parseFloat(s)||0; }
  return parseFloat(s)||0;
}
/** Año desde Date/serial/string */
function _s_yearFromAny(v){
  if (!v && v!==0) return null;
  if (Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v)) return v.getFullYear();
  if (typeof v==='number'){ try{const d=new Date(Math.round((v-25569)*86400*1000)); const y=d.getUTCFullYear(); if (y>=1900&&y<=2100) return y;}catch(e){} }
  const m=String(v).match(/(20\d{2}|19\d{2})/); return m?parseInt(m[1],10):null;
}

/* ========== Nombres de Producto ========== */
function _s_nombreProductoMap(){
  const out=new Map();
  try{
    const sh=_s_getSheet().getSheetByName(STOCK_CONFIG.HOJAS.STOCK_TEORICO);
    if (sh){
      const data=sh.getDataRange().getValues(); if (data.length>1){
        const H=data[0];
        const colSKU=_s_find(H,['SKU','Código','Cod Producto','Código Producto','COD_EMPRESA']);
        const colNom=_s_find(H,['Nombre Producto','Descripción','Descripcion','Producto','NOMBRE_PRODUCTO','NOMBRE EMPRESA','NOMBRE_EMPRESA']);
        const colOrg=_s_find(H,['Bodega','Origen','CD','Centro Distribución','Centro de Distribucion','Despachar Desde','Planta']);
        for(let i=1;i<data.length;i++){ const r=data[i]; if(colSKU===-1)break; if(colOrg>-1 && !_s_isSantiago(r[colOrg])) continue;
          const sku=_s_normalizeSKU(r[colSKU]); const nom=colNom>-1?String(r[colNom]||'').trim():''; if(sku&&nom&&!out.has(sku)) out.set(sku,nom);
        }
      }
    }
  }catch(e){}
  try{
    const sh=_s_getSheet().getSheetByName(STOCK_CONFIG.HOJAS.NV_BASE);
    if (sh){
      const data=sh.getDataRange().getValues(); if (data.length>1){
        const H=data[0];
        const colSKU=_s_find(H,['Cód. Producto','Cod Producto','Código Producto','SKU']);
        const colNom=_s_find(H,['Producto','Descripción Producto','Descripcion Producto','Detalle Producto']);
        const colOrg=_s_find(H,['Despachar Desde','Origen','Bodega','CD']);
        for(let i=1;i<data.length;i++){ const r=data[i]; if(colSKU===-1)break; if(colOrg>-1 && !_s_isSantiago(r[colOrg])) continue;
          const sku=_s_normalizeSKU(r[colSKU]); const nom=colNom>-1?String(r[colNom]||'').trim():'';
          if(sku&&nom&&!out.has(sku)) out.set(sku,nom);
        }
      }
    }
  }catch(e){}
  try{
    const sh=_s_getSheet().getSheetByName(STOCK_CONFIG.HOJAS.OC_SUPERMERCADOS);
    if (sh){
      const data=sh.getDataRange().getValues(); if (data.length>1){
        const H=data[0];
        const colSKU=_s_find(H,['SKU']);
        const colNom=_s_find(H,['Producto','ITEM','Producto_OC']);
        for(let i=1;i<data.length;i++){ const r=data[i]; if(colSKU===-1)break;
          const sku=_s_normalizeSKU(r[colSKU]); const nom=colNom>-1?String(r[colNom]||'').trim():'';
          if(sku&&nom&&!out.has(sku)) out.set(sku,nom);
        }
      }
    }
  }catch(e){}
  return out;
}

/* ========== Stock Físico (solo SANTIAGO) ========== */
function _s_leerStockFisico(){
  try{
    const sh=_s_getSheet().getSheetByName(STOCK_CONFIG.HOJAS.STOCK_TEORICO);
    if(!sh) return new Map();
    const data=sh.getDataRange().getValues(); if(data.length<2) return new Map();
    const H=data[0];
    const colSKU=_s_find(H,['SKU','Código','Cod Producto','Código Producto','COD_EMPRESA']);
    const colStock=_s_find(H,['TOTAL_UNIDADES','Total Unidades','Stock','Unidades','TOTAL UNIDADES','Cajas','CAJAS']);
    const colOrg=_s_find(H,['Bodega','Origen','CD','Centro Distribución','Centro de Distribucion','Despachar Desde','Planta']);
    if(colSKU===-1||colStock===-1) return new Map();
    const stockMap=new Map();
    for(let i=1;i<data.length;i++){ const r=data[i]; if(colOrg>-1 && !_s_isSantiago(r[colOrg])) continue;
      const sku=_s_normalizeSKU(r[colSKU]); const stock=_s_num(r[colStock]); if(!sku||stock<0) continue;
      stockMap.set(sku,(stockMap.get(sku)||0)+stock);
    }
    return stockMap;
  }catch(err){ return new Map(); }
}

/* ===== Compromisos (NV_Base) ===== */
function _s_leerCompromisos(){
  try{
    const sh=_s_getSheet().getSheetByName(STOCK_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { pendientes:new Map(), facturadasSkuFact:new Map(), facturaYear:new Map(), facturaCliente:new Map(), nombres:new Map() };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { pendientes:new Map(), facturadasSkuFact:new Map(), facturaYear:new Map(), facturaCliente:new Map(), nombres:new Map() };

    const H=data[0];
    const colSKU=_s_find(H,['Cód. Producto','Cod Producto','Código Producto','SKU']);
    const colCajas=_s_find(H,['Cajas','CANT CAJAS','Cant Cajas','Cant. Cajas']);
    const colEstado=_s_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const colFactura=_s_find(H,['N° Factura','Nº Factura','Numero Factura','Factura']);
    const colFechaF=_s_find(H,[ // incluye "Fecha Facturación"
      'Fecha Facturación','Fecha Facturacion','Fecha de Facturación','Fecha de Factura',
      'Fecha Factura','Fecha_Factura','Fecha Fact.','Fecha Fact','Fecha Doc','Fecha Documento','Fecha'
    ]);
    const colNomProd=_s_find(H,['Producto','Descripción Producto','Descripcion Producto','Detalle Producto']);
    const colCliente=_s_find(H,['Cliente','Nombre Cliente','Razón Social','Razon Social','Cliente Nombre','Cliente - Nombre']);
    const colOrg=_s_find(H,['Despachar Desde','Origen','Bodega','CD']);

    if(colSKU===-1||colCajas===-1||colEstado===-1) return { pendientes:new Map(), facturadasSkuFact:new Map(), facturaYear:new Map(), facturaCliente:new Map(), nombres:new Map() };

    const pendientes=new Map(); const facturadasSkuFact=new Map(); const facturaYear=new Map(); const facturaCliente=new Map(); const nombres=new Map();

    for(let i=1;i<data.length;i++){
      const r=data[i];
      if(colOrg>-1 && !_s_isSantiago(r[colOrg])) continue;

      const sku=_s_normalizeSKU(r[colSKU]);
      const cajas=_s_num(r[colCajas]);
      const estado=String(r[colEstado]||'').toUpperCase();
      const factura=(colFactura>-1?String(r[colFactura]||''):'').replace(/[^\d]/g,'');
      const year=colFechaF>-1 ? _s_yearFromAny(r[colFechaF]) : null;

      if(sku && colNomProd>-1 && !nombres.has(sku)){ const nom=String(r[colNomProd]||'').trim(); if(nom) nombres.set(sku,nom); }
      if(factura && year && !facturaYear.has(factura)) facturaYear.set(factura,year);
      if(factura && colCliente>-1 && !facturaCliente.has(factura)){ const cli=String(r[colCliente]||'').trim(); if(cli) facturaCliente.set(factura,cli); }

      if(!sku || cajas<=0) continue;

      if(estado==='APROBADO' || estado==='PENDIENTE'){
        pendientes.set(sku,(pendientes.get(sku)||0)+cajas);
      }else if(estado==='FACTURADO' && factura){
        if(!facturadasSkuFact.has(sku)) facturadasSkuFact.set(sku,new Map());
        const m=facturadasSkuFact.get(sku);
        m.set(factura,(m.get(factura)||0)+cajas);
      }
    }

    return { pendientes, facturadasSkuFact, facturaYear, facturaCliente, nombres };

  }catch(err){
    return { pendientes:new Map(), facturadasSkuFact:new Map(), facturaYear:new Map(), facturaCliente:new Map(), nombres:new Map() };
  }
}

/* ===== Egresos (despachado) ===== */
function _s_leerEgresos(){
  try{
    const sh=_s_getSheet().getSheetByName(STOCK_CONFIG.HOJAS.EGRESOS);
    if(!sh) return { porFacturaSku:new Map(), porFactura:new Map() };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { porFacturaSku:new Map(), porFactura:new Map() };

    const H=data[0];
    const colFactura=_s_find(H,['NRO BOLETA','Nro Boleta','Nro. Boleta','Factura','NUM DOCUMENTO','Num documento','N° Documento','Nº Documento','OS','OS.','N° Factura','Nº Factura','NUMERO FACTURA']);
    const colSKU=_s_find(H,['Cód. Producto','Cod Producto','Código Producto','SKU','Cod SKU','COD_SKU']);
    const colUnid=_s_find(H,['UNID. DESPACHADAS','UNID DESPACHADAS','UNID_DESPACHADAS','Unidades','UNIDADES','CAJAS DESPACHADAS','Cajas Despachadas','Cajas']);
    const colOrg=_s_find(H,['Bodega','Origen','CD','Centro Distribución','Centro de Distribucion','Despachar Desde','Planta']);
    if(colFactura===-1 || colUnid===-1) return { porFacturaSku:new Map(), porFactura:new Map() };

    const porFacturaSku=new Map(), porFactura=new Map();
    for(let i=1;i<data.length;i++){
      const r=data[i]; if(colOrg>-1 && !_s_isSantiago(r[colOrg])) continue;
      const factura=String(r[colFactura]||'').replace(/[^\d]/g,''); if(!factura) continue;
      const unidades=_s_num(r[colUnid]); if(unidades<=0) continue;
      porFactura.set(factura,(porFactura.get(factura)||0)+unidades);
      if(colSKU>-1){ const sku=_s_normalizeSKU(r[colSKU]); if(sku){ const key=`${factura}|${sku}`; porFacturaSku.set(key,(porFacturaSku.get(key)||0)+unidades); } }
    }
    return { porFacturaSku, porFactura };
  }catch(err){ return { porFacturaSku:new Map(), porFactura:new Map() }; }
}

/* ===== NUEVO: Compromisos Supermercados ===== */
function _s_leerCompromisosSupermercados(){
  try{
    const ss = _s_getSheet();
    const shOC = ss.getSheetByName(STOCK_CONFIG.HOJAS.OC_SUPERMERCADOS);
    const shFact = ss.getSheetByName(STOCK_CONFIG.HOJAS.OC_FACTURAS);
    
    if(!shOC) return { ocNoFacturadas: new Map(), ocFacturasNoDespachadas: new Map() };
    
    // Leer facturas de supermercados
    const facturasIndex = _s_cargarFacturasSupermercados(shFact);
    
    // Leer egresos para verificar despachos de facturas de supermercados
    const { porFactura } = _s_leerEgresos();
    
    const dataOC = shOC.getDataRange().getValues();
    if(dataOC.length < 2) return { ocNoFacturadas: new Map(), ocFacturasNoDespachadas: new Map() };
    
    const headers = dataOC[0];
    const idx = _s_buildOCIndex(headers);
    
    const ocNoFacturadas = new Map();           // SKU -> cajas pendientes de facturar
    const ocFacturasNoDespachadas = new Map();  // SKU -> cajas facturadas pero no despachadas
    
    // Mapa para evitar duplicados de facturas
    const facturasProcesadas = new Set();
    
    for(let i = 1; i < dataOC.length; i++){
      const row = dataOC[i];
      const sku = _s_normalizeSKU(row[idx.sku] || '');
      const nOrden = String(row[idx.nOrden] || '').trim();
      
      if(!sku || !nOrden) continue;
      
      const cajasOrdenadas = _s_cajasFromOCRow(row, idx);
      if(cajasOrdenadas <= 0) continue;
      
      // Buscar facturas para este orden|sku específico
      const facturasLinea = facturasIndex.byOrderSku[`${nOrden}|${sku}`] || [];
      const cajasFacturadas = facturasLinea.reduce((s, f) => s + (f.cajasFact || 0), 0);
      
      // 1. Cajas NO facturadas
      const cajasPendientesFacturar = Math.max(0, cajasOrdenadas - cajasFacturadas);
      if(cajasPendientesFacturar > 0){
        ocNoFacturadas.set(sku, (ocNoFacturadas.get(sku) || 0) + cajasPendientesFacturar);
      }
      
      // 2. Facturas no despachadas (solo contar cada factura una vez)
      for(const facturaObj of facturasLinea){
        const facturaKey = `${facturaObj.factura}|${sku}`;
        if(facturasProcesadas.has(facturaKey)) continue;
        facturasProcesadas.add(facturaKey);
        
        const facturaNum = facturaObj.factura.replace(/[^\d]/g,'');
        if(!facturaNum) continue;
        
        const despachado = porFactura.get(facturaNum) || 0;
        
        // Si la factura no está despachada, sumar las cajas facturadas
        if(despachado === 0 && facturaObj.cajasFact > 0){
          ocFacturasNoDespachadas.set(sku, (ocFacturasNoDespachadas.get(sku) || 0) + facturaObj.cajasFact);
        }
      }
    }
    
    return { ocNoFacturadas, ocFacturasNoDespachadas };
    
  }catch(err){
    console.error('Error leyendo compromisos supermercados:', err);
    return { ocNoFacturadas: new Map(), ocFacturasNoDespachadas: new Map() };
  }
}

function _s_cargarFacturasSupermercados(shFact){
  if(!shFact || shFact.getLastRow() === 0) return { byOrderSku: {} };
  
  const data = shFact.getDataRange().getValues();
  const headers = data[0];
  const idx = _s_buildFactIndex(headers);
  
  const byOrderSku = {};
  
  for(let i = 1; i < data.length; i++){
    const row = data[i];
    const nOrden = String(row[idx.nOrden] || '').trim();
    const sku = _s_normalizeSKU(row[idx.sku] || '');
    
    if(!nOrden || !sku) continue;
    
    const key = `${nOrden}|${sku}`;
    if(!byOrderSku[key]) byOrderSku[key] = [];
    
    byOrderSku[key].push({
      cajasFact: _s_num(row[idx.cajas]),
      valorFact: _s_num(row[idx.valor]),
      factura: String(row[idx.factura] || '').trim()
    });
  }
  
  return { byOrderSku };
}

function _s_buildOCIndex(headers){
  return {
    nOrden: _s_find(headers, ['N_Orden']),
    sku: _s_find(headers, ['SKU']),
    cantidad: _s_find(headers, ['Cantidad']),
    empaques: _s_find(headers, ['Empaques'])
  };
}

function _s_buildFactIndex(headers){
  return {
    nOrden: _s_find(headers, ['N_Orden','n_orden']),
    sku: _s_find(headers, ['SKU']),
    cajas: _s_find(headers, ['Cajas_Facturadas','Cajas']),
    valor: _s_find(headers, ['Valor_Facturado','Valor']),
    factura: _s_find(headers, ['Factura_Nro','Factura'])
  };
}

function _s_cajasFromOCRow(row, idx){
  const cant = idx.cantidad > -1 ? _s_num(row[idx.cantidad]) : 0;
  if(cant > 0) return cant;
  const emp = idx.empaques > -1 ? _s_num(row[idx.empaques]) : 0;
  return emp;
}

/* =================== Cálculo principal INTEGRADO =================== */
function _s_calcularStockDisponible(){
  try{
    const stockFisico=_s_leerStockFisico();
    const { pendientes, facturadasSkuFact, facturaYear, nombres }=_s_leerCompromisos();
    const { porFacturaSku, porFactura }=_s_leerEgresos();
    
    // NUEVO: Compromisos de supermercados
    const { ocNoFacturadas, ocFacturasNoDespachadas } = _s_leerCompromisosSupermercados();

    const noDespSku=new Map();

    for(const [sku,mFact] of facturadasSkuFact.entries()){
      let sumNoDesp=0;
      for(const [fact,cajasFact] of mFact.entries()){
        const year=facturaYear.get(fact) || null;
        let desp=0;
        if(year===ANIO_COMPLETO_DESPACHADO){ desp=cajasFact; }
        else if(porFactura.has(fact)){ desp=cajasFact; }
        else { const exacto=porFacturaSku.get(`${fact}|${sku}`); desp= exacto!=null ? exacto : 0; }
        const pendiente=Math.max(0,cajasFact-desp);
        sumNoDesp += pendiente;
      }
      if(sumNoDesp>0) noDespSku.set(sku,sumNoDesp);
    }

    const nombreMap=_s_nombreProductoMap(); for(const [sku,nom] of nombreMap){ if(!nombres.has(sku)) nombres.set(sku,nom); }

    // Consolidar todos los SKUs incluyendo supermercados
    const allSKUs=new Set([
      ...stockFisico.keys(),
      ...pendientes.keys(),
      ...noDespSku.keys(),
      ...ocNoFacturadas.keys(),        // NUEVO
      ...ocFacturasNoDespachadas.keys() // NUEVO
    ]);
    
    const resultado=[];
    for(const sku of allSKUs){
      const stockFis=stockFisico.get(sku)||0;
      const nvPend=pendientes.get(sku)||0;
      const noDesp=noDespSku.get(sku)||0;
      const ocNoFact=ocNoFacturadas.get(sku)||0;           // NUEVO
      const ocFactNoDesp=ocFacturasNoDespachadas.get(sku)||0; // NUEVO
      
      const stockComprometido=nvPend + noDesp + ocNoFact + ocFactNoDesp;
      const stockDisponible=stockFis - stockComprometido;

      resultado.push({
        sku,
        nombreProducto: nombres.get(sku) || '',
        stockFisico: stockFis,
        nvPendientes: nvPend,
        facturasNoDespachadas: noDesp,
        ocNoFacturadas: ocNoFact,                    // NUEVO
        ocFacturasNoDespachadas: ocFactNoDesp,      // NUEVO
        stockComprometido,
        stockDisponible,
        estado: stockDisponible<0 ? 'NEGATIVO' : stockDisponible===0 ? 'AGOTADO' : stockDisponible<=10 ? 'CRITICO' : 'OK'
      });
    }
    resultado.sort((a,b)=>a.stockDisponible-b.stockDisponible);
    return resultado;

  }catch(err){ console.error('Error calculando stock:',err); return []; }
}

/* =================== Cache helpers =================== */
function _cacheGet(){ try{ const c=CacheService.getScriptCache().get(CACHE_KEY); return c?JSON.parse(c):null; }catch(e){ return null; } }
function _cacheSet(data){ try{ CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(data), CACHE_TTL); }catch(e){} }

/* =================== APIs =================== */
function apiStockGetAll(){
  // Devuelve todo el dataset (con caché) para filtrar rápido en el front
  let payload=_cacheGet();
  if(!payload){
    const productos=_s_calcularStockDisponible();
    payload={ ok:true, productos, ts:new Date().toISOString() };
    _cacheSet(payload);
  }
  return payload;
}

function apiInvalidateCache(){ CacheService.getScriptCache().remove(CACHE_KEY); return {ok:true}; }

function apiStockGetDashboard(){
  const all=apiStockGetAll();
  const stockData = all.productos || [];
  const kpis = {
    totalSKUs: stockData.length,
    stockNegativos: stockData.filter(s=>s.estado==='NEGATIVO').length,
    stockAgotados:  stockData.filter(s=>s.estado==='AGOTADO').length,
    stockCriticos:  stockData.filter(s=>s.estado==='CRITICO').length,
    stockOK:        stockData.filter(s=>s.estado==='OK').length,
    totalStockFisico: stockData.reduce((t,s)=>t+s.stockFisico,0),
    totalComprometido: stockData.reduce((t,s)=>t+s.stockComprometido,0),
    totalDisponible:   stockData.reduce((t,s)=>t+s.stockDisponible,0),
    // NUEVO: KPIs específicos de supermercados
    totalOCNoFacturadas: stockData.reduce((t,s)=>t+(s.ocNoFacturadas||0),0),
    totalOCFacturasNoDespachadas: stockData.reduce((t,s)=>t+(s.ocFacturasNoDespachadas||0),0),
    porcentajeComprometido: 0,
    porcentajeDisponible: 0
  };
  if (kpis.totalStockFisico>0){
    kpis.porcentajeComprometido=(kpis.totalComprometido/kpis.totalStockFisico)*100;
    kpis.porcentajeDisponible=(kpis.totalDisponible/kpis.totalStockFisico)*100;
  }
  return { ok:true, kpis, resumen:{ fecha:new Date().toISOString().slice(0,19), productosAnalizados:stockData.length } };
}

function apiStockGetDetalle(filtros={}){
  // Mantengo esta API, pero ahora filtra sobre caché (rápido)
  const all=apiStockGetAll();
  let stockData = (all.productos||[]).slice();

  if (filtros.estado && filtros.estado!=='TODOS') stockData = stockData.filter(s=>s.estado===filtros.estado);
  if (filtros.sku && filtros.sku.trim()){
    const q=_s_norm(filtros.sku);
    stockData = stockData.filter(s=> _s_norm(s.sku).includes(q) || _s_norm(s.nombreProducto).includes(q));
  }
  if (filtros.soloProblemas) stockData = stockData.filter(s=>['NEGATIVO','AGOTADO','CRITICO'].includes(s.estado));

  return { ok:true, productos:stockData, total:stockData.length, fromCache:true };
}

function apiStockGetDetalleSKU(sku){
  const STEP = [];
  try{
    STEP.push('normalize');
    if(!sku) throw new Error('SKU requerido');
    const skuNorm = _s_normalizeSKU(sku);
    if(!skuNorm) throw new Error('SKU vacío');

    STEP.push('dataset');
    const all = apiStockGetAll();                         // usa caché
    if(!all || !all.productos) throw new Error('Dataset vacío');
    const producto = (all.productos || []).find(s => _s_normalizeSKU(s.sku) === skuNorm);
    if(!producto) throw new Error('SKU no encontrado en el dataset: ' + skuNorm);

    STEP.push('leer_compromisos');
    const { facturadasSkuFact, facturaYear, facturaCliente } = _s_leerCompromisos();

    STEP.push('leer_egresos');
    const { porFacturaSku, porFactura } = _s_leerEgresos();

    STEP.push('armar_facturas_pendientes');
    const facturasPendientes = [];
    const m = facturadasSkuFact.get(skuNorm);
    if (m){
      for (const [fact, cajasFact] of m.entries()){
        const year = facturaYear.get(fact) || null;
        let desp = 0;
        if (year === ANIO_COMPLETO_DESPACHADO) desp = cajasFact;
        else if (porFactura.has(fact))         desp = cajasFact;
        else {
          const exacto = porFacturaSku.get(`${fact}|${skuNorm}`);
          desp = exacto != null ? exacto : 0;
        }
        const pendiente = Math.max(0, cajasFact - desp);
        if (pendiente > 0.0001){
          facturasPendientes.push({
            factura: fact,
            cliente: facturaCliente.get(fact) || '',
            despachado: desp,
            pendiente,
            tipo: 'NV'
          });
        }
      }
    }
    facturasPendientes.sort((a,b)=> b.pendiente - a.pendiente);

    STEP.push('super_detalle');
    const detallesSupermercados = _s_obtenerDetallesSupermercadosSKU(skuNorm); // ya defensiva

    STEP.push('ok');
    return { ok:true, detalle:{
      sku: skuNorm,
      nombreProducto: producto.nombreProducto || '',
      stockFisico: producto.stockFisico,
      nvPendientes: producto.nvPendientes,
      facturasNoDespachadas: producto.facturasNoDespachadas,
      ocNoFacturadas: producto.ocNoFacturadas || 0,
      ocFacturasNoDespachadas: producto.ocFacturasNoDespachadas || 0,
      stockDisponible: producto.stockDisponible,
      estado: producto.estado,
      facturas: facturasPendientes,
      supermercados: detallesSupermercados
    }};

  }catch(err){
    const msg = (err && (err.message || String(err))) || 'Error desconocido';
    // Devolvemos *siempre* un mensaje con el paso en que falló
    return { ok:false, error:`${STEP.join(' > ')} :: ${msg}` };
  }
}



function _s_obtenerDetallesSupermercadosSKU(sku){
  try{
    const ss = _s_getSheet();
    const shOC = ss.getSheetByName(STOCK_CONFIG.HOJAS.OC_SUPERMERCADOS);
    const shFact = ss.getSheetByName(STOCK_CONFIG.HOJAS.OC_FACTURAS);
    
    if(!shOC) return { ordenesNoFacturadas: [], facturasNoDespachadas: [] };
    
    const facturasIndex = _s_cargarFacturasSupermercados(shFact);
    const { porFactura } = _s_leerEgresos();
    
    const dataOC = shOC.getDataRange().getValues();
    if(dataOC.length < 2) return { ordenesNoFacturadas: [], facturasNoDespachadas: [] };
    
    const headers = dataOC[0];
    const idx = _s_buildOCIndexDetallado(headers);
    
    const ordenesNoFacturadas = [];
    const facturasNoDespachadas = [];
    const facturasProcesadas = new Set();
    
    for(let i = 1; i < dataOC.length; i++){
      const row = dataOC[i];
      const skuRow = _s_normalizeSKU(row[idx.sku] || '');
      const nOrden = String(row[idx.nOrden] || '').trim();
      
      if(skuRow !== sku || !nOrden) continue;
      
      const cajasOrdenadas = _s_cajasFromOCRow(row, idx);
      if(cajasOrdenadas <= 0) continue;
      
      const facturasLinea = facturasIndex.byOrderSku[`${nOrden}|${sku}`] || [];
      const cajasFacturadas = facturasLinea.reduce((s, f) => s + (f.cajasFact || 0), 0);
      
      // Órdenes no facturadas
      const cajasPendientesFacturar = Math.max(0, cajasOrdenadas - cajasFacturadas);
      if(cajasPendientesFacturar > 0){
        ordenesNoFacturadas.push({
          nOrden,
          comprador: String(row[idx.comprador] || '').trim(),
          fecha: row[idx.fecha] || '',
          cajasOrdenadas,
          cajasFacturadas,
          cajasPendientes: cajasPendientesFacturar
        });
      }
      
      // Facturas no despachadas
      for(const facturaObj of facturasLinea){
        const facturaKey = `${facturaObj.factura}|${sku}`;
        if(facturasProcesadas.has(facturaKey)) continue;
        facturasProcesadas.add(facturaKey);
        
        const facturaNum = facturaObj.factura.replace(/[^\d]/g,'');
        if(!facturaNum) continue;
        
        const despachado = porFactura.get(facturaNum) || 0;
        
        if(despachado === 0 && facturaObj.cajasFact > 0){
          facturasNoDespachadas.push({
            nOrden,
            factura: facturaObj.factura,
            comprador: String(row[idx.comprador] || '').trim(),
            cajasFacturadas: facturaObj.cajasFact,
            valorFacturado: facturaObj.valorFact || 0
          });
        }
      }
    }
    
    return { ordenesNoFacturadas, facturasNoDespachadas };
    
  }catch(err){
    console.error('Error obteniendo detalles supermercados:', err);
    return { ordenesNoFacturadas: [], facturasNoDespachadas: [] };
  }
}

function _s_buildOCIndexDetallado(headers){
  return {
    nOrden: _s_find(headers, ['N_Orden']),
    sku: _s_find(headers, ['SKU']),
    cantidad: _s_find(headers, ['Cantidad']),
    empaques: _s_find(headers, ['Empaques']),
    comprador: _s_find(headers, ['Comprador']),
    fecha: _s_find(headers, ['Fecha'])
  };
}

function apiStockTest(){ return { cache:_cacheGet()!=null, ...apiStockGetDashboard() }; }








