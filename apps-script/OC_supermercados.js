/***** ========================================================
 *  Panel VDA 3.1 — Backend con Dashboard Ejecutivo por MARCA
 * ======================================================== *****/

const VDA_CFG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: { OC: 'OC_Supermercados', FACT: 'OC_Facturas', STOCK: 'Stock_Teorico' },
  TZ: 'America/Santiago',
};

// =============== HELPERS BÁSICOS ===============
function OC_tz(){ return VDA_CFG.TZ || Session.getScriptTimeZone() || 'America/Santiago'; }
function OC_ymd(d){ return Utilities.formatDate(d, OC_tz(), 'yyyy-MM-dd'); }
function OC_dateFromYMD(s){ const m=s&&s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?new Date(+m[1],+m[2]-1,+m[3],0,0,0,0):null; }
function OC_sumarDias(f,dias){ const x=new Date(f); x.setDate(x.getDate()+dias); x.setHours(0,0,0,0); return x; }
function OC_dowTZ(d){ return +Utilities.formatDate(d, OC_tz(), 'u'); }
function OC_num(v){
  if (typeof v === 'number') return v || 0;
  const s = String(v||'').trim();
  if(!s) return 0;
  if (s.includes(',')) return parseFloat(s.replace(/\./g,'').replace(',','.')) || 0;
  return parseFloat(s.replace(/[^\d.\-]/g,'')) || 0;
}
function OC_coerceDate(v){
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number') return new Date(v);
  const s = String(v||'').trim(); if(!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], 0,0,0,0);
  const d = new Date(s); return (d instanceof Date && !isNaN(d)) ? d : null;
}
function OC_getSS(){
  try { return SpreadsheetApp.getActiveSpreadsheet(); }
  catch(e){ return SpreadsheetApp.openById(VDA_CFG.SPREADSHEET_ID); }
}
function OC_getSheetOC(){ const sh = OC_getSS().getSheetByName(VDA_CFG.HOJAS.OC); if(!sh) throw new Error('Falta hoja OC'); return sh; }
function OC_getSheetFACT(){ const ss=OC_getSS(); let sh = ss.getSheetByName(VDA_CFG.HOJAS.FACT); if(!sh){ sh=ss.insertSheet(VDA_CFG.HOJAS.FACT); } return sh; }
function _normSkuNoSpace(s){ return String(s||'').replace(/\s+/g,'').trim().toUpperCase(); }

// =============== NORMALIZADORES Y ÍNDICES ===============
function OC_normalizeSuperName(source){
  const s = String(source||'').toLowerCase();
  if (!s) return '';
  if (s.includes('walmart') || s.includes('líder') || s.includes('lider')) return 'Walmart';
  if (s.includes('santa isabel')) return 'Cencosud (Santa Isabel)';
  if (s.includes('jumbo')) return 'Cencosud (Jumbo)';
  if (s.includes('cencosud')) return 'Cencosud';
  if (s.includes('tottus') || s.includes('falabella')) return 'Tottus';
  if (s.includes('unimarc') || s.includes('smu')) return 'Unimarc';
  if (s.includes('alvi')) return 'Alvi';
  if (s.includes('mayorista 10') || s.includes('mayorista10')) return 'Mayorista 10';
  return String(source).trim();
}
function OC_deriveSuper(emisor, comprador){ return OC_normalizeSuperName(`${emisor||''} ${comprador||''}`); }

function _buildIndexV2(headers){
  const norm = v=>String(v||'').trim().toLowerCase();
  const find = (name)=> headers.findIndex(h=>norm(h)===norm(name));
  const findAny = (arr)=>{ for(const n of arr){ const i=find(n); if(i>-1) return i; } return -1; };
  return {
    nOrden: find('N_Orden'),
    fecha: find('Fecha'),
    fechaCancelacion: findAny(['Fecha_Cancelacion','Fecha Cancelacion','Fecha Límite','Fecha Limite']),
    comprador: find('Comprador'),
    emisor: findAny(['Emisor','Receptor']),
    superCol: findAny(['Super','Supermercado','Retail','Cadena','Cliente','Canal']),
    importeTotalOC: findAny(['Importe_Total_OC','Importe Total OC']),
    linea: find('Linea'),
    codUPC: findAny(['Cod_UPC','UPC']),
    item: find('ITEM'),
    codProv: findAny(['Cod_Prov','Proveedor','Cod Prov']),
    tallaUM: findAny(['Talla_UM','Talla UM']),
    colorDesc: findAny(['Color_Desc','Color']),
    cantidad: find('Cantidad'),
    precioUnit: findAny(['Precio_Unit','Precio Unit']),
    unidEmp: findAny(['Unid_Emp','Unid Emp']),
    empaques: find('Empaques'),
    importe: find('Importe'),
    productoOC: find('Producto_OC'),
    fuentePDF: find('Fuente_PDF'),
    sku: find('SKU'),
    producto: find('Producto'),
    categoria: findAny(['categoria','Categoría','Categoria']),
    marca: findAny(['marca','Marca']),
  };
}
function OC_cajasFromRow(row, idx){
  const cant = idx.cantidad > -1 ? OC_num(row[idx.cantidad]) : 0;
  if (cant && cant>0) return cant;
  const emp = idx.empaques > -1 ? OC_num(row[idx.empaques]) : 0;
  return emp;
}

// =============== FACTURAS ===============
function _factIndex(headers){
  const norm = v => String(v||'').trim().toLowerCase();
  const find = (name)=> headers.findIndex(h=>norm(h)===norm(name));
  const findAny = (arr)=>{ for(const n of arr){ const i=find(n); if(i>-1) return i; } return -1; };
  return {
    nOrden: findAny(['N_Orden','n_orden','Orden','N° Orden','N°_Orden']),
    sku: find('SKU'),
    factura: findAny(['Factura_Nro','Factura','N_Factura']),
    fecha: findAny(['Fecha_Factura','Fecha Factura','Fecha']),
    cajas: findAny(['Cajas_Facturadas','Cajas Facturadas','Cajas']),
    valor: findAny(['Valor_Facturado','Valor Facturado','Importe']),
    comprador: findAny(['Comprador','Cliente']),
    obs: findAny(['Observacion','Observación','Obs'])
  };
}
function cargarFacturasIndex(){
  const sh = OC_getSheetFACT();
  const rng = sh.getLastRow() ? sh.getDataRange().getValues() : [];
  if (!rng.length) return { byOrder:{}, byOrderSku:{} };

  const headers = rng[0].map(h=>String(h).trim());
  const idx = _factIndex(headers);

  const byOrder = {};
  const byOrderSku = {};

  for (let i=1;i<rng.length;i++){
    const r = rng[i];
    const nOrden = String(r[idx.nOrden] || '').trim();
    if (!nOrden) continue;

    const sku = String(r[idx.sku] || '').trim();
    const rowObj = {
      nOrden,
      sku,
      factura: String(r[idx.factura]||'').trim(),
      fecha: (OC_coerceDate(r[idx.fecha]) ? OC_ymd(OC_coerceDate(r[idx.fecha])) : ''),
      cajasFact: OC_num(r[idx.cajas]),
      valorFact: OC_num(r[idx.valor]),
      comprador: r[idx.comprador] || '',
      obs: r[idx.obs] || ''
    };

    if (!byOrder[nOrden]) byOrder[nOrden] = [];
    byOrder[nOrden].push(rowObj);

    const key = `${nOrden}|${sku||''}`;
    if (!byOrderSku[key]) byOrderSku[key] = [];
    byOrderSku[key].push(rowObj);
  }
  return { byOrder, byOrderSku };
}
function cargarFacturasDeKey(invIdx, key){
  if (!key) return [];
  const s = String(key);
  if (s.includes('|')) return invIdx.byOrderSku[s] || [];
  return invIdx.byOrder[s] || [];
}
function dedupFacturaRows(arr){
  const seen = new Set(), out = [];
  for(const a of (arr||[])){
    const k = `${a.nOrden}|${a.sku||''}|${a.factura}|${a.fecha}|${a.cajasFact}|${a.valorFact}`;
    if(seen.has(k)) continue;
    seen.add(k); out.push(a);
  }
  return out;
}
function mergeFacturaArrays(a,b){
  if(!(a&&a.length)) return dedupFacturaRows(b||[]);
  if(!(b&&b.length)) return dedupFacturaRows(a||[]);
  return dedupFacturaRows(a.concat(b));
}

// =============== STOCK (Stock_Teorico) ===============
function cargarStockIndex(){
  const ss = OC_getSS();
  const sh = ss.getSheetByName(VDA_CFG.HOJAS.STOCK);
  if (!sh) return {};
  const values = sh.getDataRange().getValues();
  if (!values.length) return {};
  const headers = values[0].map(h=>String(h).trim());
  const find = (name)=> headers.findIndex(h=>String(h).trim().toLowerCase()===String(name).trim().toLowerCase());
  const findAny = (arr)=>{ for(const n of arr){ const i=find(n); if(i>-1) return i; } return -1; };
  const idxSku = findAny(['SKU','Sku','sku','Cod_UPC','UPC','Codigo','Código']);
  const idxTot = findAny(['TOTAL_UNIDADES','TOTAL UNIDADES','Total_Unidades','Total Unidades','TOTAL_CAJAS','TOTAL CAJAS']);
  if (idxSku===-1 || idxTot===-1) return {};
  const map = {};
  for (let i=1;i<values.length;i++){
    const r = values[i];
    const k = _normSkuNoSpace(r[idxSku]);
    if(!k) continue;
    map[k] = OC_num(r[idxTot]);
  }
  return map;
}

// =============== MOTOR SEMANAL (cruce por SKU) ===============
function _obtenerDatosRangoV2(fechaInicio, fechaFin){
  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);

  const requeridas = ['fecha','nOrden','comprador','importe'];
  requeridas.forEach(c => { if (idx[c]===-1) throw new Error('Falta columna requerida: '+c); });
  if (idx.cantidad===-1 && idx.empaques===-1) throw new Error('Falta Cantidad o Empaques');

  const invIdx = cargarFacturasIndex();
  const porDia = {};

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const fechaParsed = OC_coerceDate(row[idx.fecha]);
    if (!(fechaParsed instanceof Date) || isNaN(fechaParsed)) continue;
    const fechaLocal = OC_dateFromYMD(OC_ymd(fechaParsed));
    if (fechaLocal < fechaInicio || fechaLocal > fechaFin) continue;

    const key = OC_ymd(fechaLocal);
    if (!porDia[key]){
      porDia[key] = {
        fecha: key, ordenes:new Set(), compradores:new Set(), supers:new Set(),
        totalCajas:0, totalMonto:0, totalProductos:0, skus:new Set(),
        valorPromedio:0, detallesOrdenes:[],
        marcas:{}, categorias:{}, productos:{},
        totalCajasFact:0, totalValorFact:0,
      };
    }

    const emisorTxt = row[idx.emisor] || '';
    const compradorTxt = row[idx.comprador] || '';
    const superRaw = idx.superCol > -1 ? (row[idx.superCol] || '') : '';
    const superName = OC_normalizeSuperName(superRaw) || OC_deriveSuper(emisorTxt, compradorTxt);
    const nOrden = String(row[idx.nOrden]||'').trim();
    const skuRaw = String(row[idx.sku]||'').trim();

    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const cajasFactLinea = facturasLinea.reduce((s,a)=>s+(a.cajasFact||0),0);
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    const reg = {
      super: superName, nOrden, comprador: compradorTxt, emisor: emisorTxt,
      fechaLimite: (idx.fechaCancelacion>-1 && OC_coerceDate(row[idx.fechaCancelacion])) ? OC_ymd(OC_coerceDate(row[idx.fechaCancelacion])) : null,
      linea: row[idx.linea] || '',
      codUPC: row[idx.codUPC] || '', item: row[idx.item] || '',
      codProv: row[idx.codProv] || '', tallaUM: row[idx.tallaUM] || '',
      colorDesc: row[idx.colorDesc] || '',
      cantidad: cajas, precioUnit: OC_num(row[idx.precioUnit]),
      unidEmp: row[idx.unidEmp] || '', empaques: cajas, importe,
      productoOC: row[idx.productoOC] || '', fuentePDF: row[idx.fuentePDF] || '',
      sku: skuRaw, producto: row[idx.producto] || '',
      productoNombre: row[idx.producto] || row[idx.productoOC] || 'Sin nombre',
      categoria: row[idx.categoria] || '', marca: row[idx.marca] || '',
      importeTotalOC: OC_num(row[idx.importeTotalOC]),
      facturas: facturasLinea, cajasFacturadas: cajasFactLinea, valorFacturado: valorFactLinea,
      cumplimientoCajas: cajas ? (cajasFactLinea/cajas) : 0,
      cumplimientoValor: importe ? (valorFactLinea/importe) : 0,
    };

    const d = porDia[key];
    d.ordenes.add(reg.nOrden);
    d.compradores.add(reg.comprador);
    if (reg.super) d.supers.add(reg.super);
    if (reg.sku) d.skus.add(reg.sku);

    d.totalCajas += reg.empaques;
    d.totalMonto += reg.importe;
    d.totalProductos += 1;
    d.totalCajasFact += reg.cajasFacturadas;
    d.totalValorFact += reg.valorFacturado;

    if (reg.marca) d.marcas[reg.marca]=(d.marcas[reg.marca]||0)+reg.empaques;
    if (reg.categoria) d.categorias[reg.categoria]=(d.categorias[reg.categoria]||0)+reg.empaques;
    if (reg.producto) d.productos[reg.producto]=(d.productos[reg.producto]||0)+reg.empaques;

    d.detallesOrdenes.push(reg);
  }

  const resultado = [];
  for (let i=0;i<7;i++){
    const dia = OC_sumarDias(fechaInicio, i);
    const key = OC_ymd(dia);
    const data = porDia[key];

    if (data){
      data.valorPromedio = data.totalProductos>0 ? data.totalMonto/data.totalProductos : 0;
      const topMarcas = Object.entries(data.marcas).map(([nombre,cajas])=>({nombre,cajas})).sort((a,b)=>b.cajas-a.cajas);
      const topCategorias = Object.entries(data.categorias).map(([nombre,cajas])=>({nombre,cajas})).sort((a,b)=>b.cajas-a.cajas);
      const cumplimientoGlobal = (data.totalCajas>0 ? data.totalCajasFact/data.totalCajas : 0);

      resultado.push({
        fecha: key,
        diaSemana: ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][OC_dowTZ(dia)-1],
        cantidadOrdenes: data.ordenes.size,
        totalCajas: data.totalCajas, totalMonto: data.totalMonto, totalProductos: data.totalProductos,
        cantidadCompradores: data.compradores.size, cantidadSKUs: data.skus.size,
        valorPromedio: data.valorPromedio, compradores: Array.from(data.compradores),
        supers: Array.from(data.supers), detallesOrdenes: data.detallesOrdenes,
        cajasPorMarca: topMarcas, cajasPorCategoria: topCategorias, tieneOrdenes:true,
        totalCajasFact: data.totalCajasFact, totalValorFact: data.totalValorFact, cumplimientoGlobal,
      });
    } else {
      resultado.push({
        fecha: key, diaSemana: ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][OC_dowTZ(dia)-1],
        cantidadOrdenes: 0, totalCajas:0, totalMonto:0, totalProductos:0,
        cantidadCompradores: 0, cantidadSKUs:0, valorPromedio:0,
        compradores: [], supers: [], detallesOrdenes: [], cajasPorMarca: [], cajasPorCategoria: [],
        tieneOrdenes:false, totalCajasFact:0, totalValorFact:0, cumplimientoGlobal:0,
      });
    }
  }
  return resultado;
}

// =============== RESÚMENES (semana/mes) ===============
function _resumenSemanaFromArray(semanaArr){
  let totalMonto=0, totalFact=0, totalCajas=0, totalCajasFact=0;
  const ordenes = new Set();
  for (const d of (semanaArr||[])){
    totalMonto += d.totalMonto||0;
    totalFact  += d.totalValorFact||0;
    totalCajas += d.totalCajas||0;
    totalCajasFact += d.totalCajasFact||0;
    for (const it of (d.detallesOrdenes||[])){
      if (it.nOrden) ordenes.add(it.nOrden);
    }
  }
  return {
    totalOrdenes: ordenes.size,
    totalCajas, totalMonto, totalValorFact: totalFact,
    cumplimientoCajas: totalCajas ? (totalCajasFact/totalCajas) : 0,
    montoNoFacturado: Math.max(0, totalMonto - totalFact)
  };
}

function _resumenesControl(semanaArr){
  const map = new Map();
  for (const d of (semanaArr||[])){
    for (const it of (d.detallesOrdenes||[])){
      const n = String(it.nOrden||'').trim();
      if(!n) continue;
      if(!map.has(n)){
        map.set(n, {
          nOrden:n,
          super: it.super || '',
          comprador: it.comprador || '',
          emisor: it.emisor || '',
          cajasOrden: 0,
          cajasFact: 0,
          valorOrden: 0,
          valorFact: 0
        });
      }
      const o = map.get(n);
      o.cajasOrden += Number(it.empaques||0);
      o.cajasFact  += Number(it.cajasFacturadas||0);
      o.valorOrden += Number(it.importe||0);
      o.valorFact  += Number(it.valorFacturado||0);
    }
  }

  const facturado = [];
  const noFacturado = [];
  for (const o of map.values()){
    const gap = Math.max(0, o.valorOrden - o.valorFact);
    const eff = o.valorOrden ? (o.valorFact / o.valorOrden) : 0;
    const cajasPend = Math.max(0, o.cajasOrden - o.cajasFact);

    const row = {
      nOrden: o.nOrden,
      super: o.super,
      comprador: o.comprador,
      emisor: o.emisor,
      cajasOrden: o.cajasOrden,
      cajasFacturadas: o.cajasFact,
      valorOrden: +o.valorOrden,
      valorFacturado: +o.valorFact,
      noFacturado: +gap,
      cumplimientoValor: eff,
      cajasPendientes: cajasPend
    };

    if (o.valorFact > 0) facturado.push(row);
    if (gap > 0)         noFacturado.push(row);
  }

  facturado.sort((a,b)=> b.noFacturado - a.noFacturado || b.valorFacturado - a.valorFacturado);
  noFacturado.sort((a,b)=> b.noFacturado - a.noFacturado || b.cajasPendientes - a.cajasPendientes);

  return { facturado, noFacturado };
}

// =============== RESUMEN MES CALENDARIO (ARREGLADO) ===============
function _obtenerResumenMesPorFecha(baseDate){
  const ref = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const y = ref.getFullYear(), m = ref.getMonth();
  
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const esMesActual = (hoy.getFullYear()===y && hoy.getMonth()===m);
  const limiteMax = esMesActual ? hoy : new Date(y, m+1, 0, 23, 59, 59, 999);

  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return { totalOrdenes:0, totalCajas:0, totalMonto:0, totalValorFact:0, cumplimientoCajas:0, montoNoFacturado:0 };

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);
  const invIdx = cargarFacturasIndex();

  let totalMonto=0, totalFact=0, totalCajas=0, totalCajasFact=0;
  const ordenes = new Set();

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f.getFullYear()!==y || f.getMonth()!==m) continue;
    
    if (f > limiteMax) continue;

    const nOrden = String(row[idx.nOrden]||'').trim();
    if (nOrden) ordenes.add(nOrden);

    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const cajasFactLinea = facturasLinea.reduce((s,a)=>s+(a.cajasFact||0),0);
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    totalMonto += importe;
    totalFact  += valorFactLinea;
    totalCajas += cajas;
    totalCajasFact += cajasFactLinea;
  }

  return {
    totalOrdenes: ordenes.size,
    totalCajas, 
    totalMonto, 
    totalValorFact: totalFact,
    cumplimientoCajas: totalCajas ? (totalCajasFact/totalCajas) : 0,
    montoNoFacturado: Math.max(0, totalMonto - totalFact)
  };
}

// =============== API: ORDEN (agrega stock físico por SKU) ===============
function buscarOrdenPorNumero(nOrden){
  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if(!values.length) return { ok:false, msg:'Sin datos' };

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);
  const invIdx = cargarFacturasIndex();
  const stockIdx = cargarStockIndex();

  const target = String(nOrden||'').trim();
  const out = {
    ok:true, nOrden:target, comprador:'', emisor:'', super:'', totalCajas:0, totalMonto:0,
    productos:[], fechas:[], fechasUnicas:new Set(), importeTotal:0,
    cajasFacturadas:0, valorFacturado:0, cumplimientoCajas:0, cumplimientoValor:0,
    facturas:[], ultimaFechaFactura:''
  };

  for (let i=1;i<values.length;i++){
    const row = values[i];
    if (String(row[idx.nOrden]||'').trim() !== target) continue;

    const emisorTxt     = row[idx.emisor] || '';
    const compradorTxt  = row[idx.comprador] || '';
    const superRaw      = idx.superCol > -1 ? (row[idx.superCol] || '') : '';
    const superName     = OC_normalizeSuperName(superRaw) || OC_deriveSuper(emisorTxt, compradorTxt);

    out.comprador   = out.comprador || compradorTxt;
    out.emisor      = out.emisor    || emisorTxt;
    out.super       = out.super     || superName;
    out.importeTotal = out.importeTotal || OC_num(row[idx.importeTotalOC]);

    const f = OC_coerceDate(row[idx.fecha]);
    if (f instanceof Date && !isNaN(f)) out.fechasUnicas.add(OC_ymd(f));

    const cajas   = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);
    const skuRaw  = String(row[idx.sku]||'').trim();
    const skuNorm = _normSkuNoSpace(skuRaw);
    const stockFisico = stockIdx[skuNorm] || 0;

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${target}|${skuRaw}`));
    const cajasFactLinea = facturasLinea.reduce((s,a)=>s+(a.cajasFact||0),0);
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    out.totalCajas += cajas;
    out.totalMonto += importe;
    out.cajasFacturadas += cajasFactLinea;
    out.valorFacturado  += valorFactLinea;

    out.facturas = mergeFacturaArrays(out.facturas, facturasLinea);

    out.productos.push({
      super: superName,
      fecha: f ? OC_ymd(f) : '',
      fechaLimite: (idx.fechaCancelacion>-1 && OC_coerceDate(row[idx.fechaCancelacion])) ? OC_ymd(OC_coerceDate(row[idx.fechaCancelacion])) : null,
      linea: row[idx.linea] || '',
      codUPC: row[idx.codUPC] || '',
      item: row[idx.item] || '',
      codProv: row[idx.codProv] || '',
      tallaUM: row[idx.tallaUM] || '',
      colorDesc: row[idx.colorDesc] || '',
      cantidad: cajas,
      precioUnit: OC_num(row[idx.precioUnit]),
      unidEmp: row[idx.unidEmp] || '',
      empaques: cajas,
      importe,
      productoOC: row[idx.productoOC] || '',
      fuentePDF: row[idx.fuentePDF] || '',
      sku: skuRaw,
      skuNorm: skuNorm,
      stockFisico: stockFisico,
      producto: row[idx.producto] || '',
      productoNombre: row[idx.producto] || row[idx.productoOC] || 'Sin nombre',
      categoria: row[idx.categoria] || '',
      marca: row[idx.marca] || '',
      facturas: facturasLinea,
      cajasFacturadas: cajasFactLinea,
      valorFacturado: valorFactLinea,
      cumplimientoCajas: cajas ? (cajasFactLinea/cajas) : 0,
      cumplimientoValor: importe ? (valorFactLinea/importe) : 0,
    });
  }

  const fechas = Array.from(out.fechasUnicas).sort();
  out.fechas = fechas;
  delete out.fechasUnicas;

  if (out.facturas.length){
    out.ultimaFechaFactura = out.facturas.map(f=>f.fecha).filter(Boolean).sort().slice(-1)[0] || '';
  }
  out.cumplimientoCajas = out.totalCajas ? (out.cajasFacturadas/out.totalCajas) : 0;
  out.cumplimientoValor = out.totalMonto ? (out.valorFacturado/out.totalMonto) : 0;

  return out;
}

// =============== FACTURACIÓN ===============
function _ensureFactHeaders_(sh){
  if (sh.getLastRow() === 0) {
    sh.appendRow(['N_Orden','SKU','Factura_Nro','Fecha_Factura','Cajas_Facturadas','Valor_Facturado','Comprador','Observacion']);
  }
}
function apiAgregarFacturaSKU(payload){
  if (!payload || !payload.nOrden || !payload.factura || !payload.sku) {
    return { ok:false, msg:'Datos insuficientes: se requiere nOrden, factura y sku' };
  }
  const cajasFacturadas = Number(payload.cajasFacturadas);
  if (!Number.isFinite(cajasFacturadas) || cajasFacturadas < 0) {
    return { ok:false, msg:'Cajas facturadas debe ser >= 0' };
  }

  const targetOrden = String(payload.nOrden).trim();
  const targetSku = String(payload.sku).trim();
  const targetFactura = String(payload.factura).trim();

  const shFact = OC_getSheetFACT();
  let cajasPrevias = 0;
  if (shFact.getLastRow() > 0) {
    const factValues = shFact.getDataRange().getValues();
    const factIdx = _factIndex(factValues[0].map(h=>String(h).trim()));
    for (let i = 1; i < factValues.length; i++) {
      const row = factValues[i];
      if (String(row[factIdx.nOrden]||'').trim() === targetOrden &&
          String(row[factIdx.sku]||'').trim() === targetSku) {
        cajasPrevias += OC_num(row[factIdx.cajas]);
      }
    }
  }
  if (cajasPrevias > 0) {
    return { ok:false, msg:`El SKU ${targetSku} ya tiene cajas facturadas registradas (>0) en la orden ${targetOrden}.` };
  }

  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return { ok:false, msg:'Sin datos en hoja OC' };

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);

  let cajasOrdenadas = 0, valorLinea = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[idx.nOrden]||'').trim() === targetOrden &&
        String(row[idx.sku]||'').trim() === targetSku) {
      cajasOrdenadas = OC_cajasFromRow(row, idx);
      valorLinea = OC_num(row[idx.importe]);
      break;
    }
  }
  if (!cajasOrdenadas) return { ok:false, msg:`No se encontró la línea (orden ${targetOrden} / SKU ${targetSku}).` };

  if (cajasFacturadas > cajasOrdenadas) {
    return { ok:false, msg:`No se pueden facturar ${cajasFacturadas} cajas; ordenadas: ${cajasOrdenadas}.` };
  }

  const valorPorCaja = valorLinea / cajasOrdenadas;
  const valorFacturado = valorPorCaja * cajasFacturadas;

  _ensureFactHeaders_(shFact);
  const fecha = payload.fechaFactura ? OC_dateFromYMD(payload.fechaFactura) : new Date();
  shFact.appendRow([
    targetOrden, targetSku, targetFactura, OC_ymd(fecha),
    cajasFacturadas, valorFacturado,
    String(payload.comprador || '').trim(),
    String(payload.observacion || `Facturado SKU ${targetSku}: ${cajasFacturadas} cajas`).trim()
  ]);

  return { ok:true, msg:`OK SKU ${targetSku}: ${cajasFacturadas} cajas, $${valorFacturado.toFixed(2)}`, cajasFacturadas, valorFacturado: +valorFacturado.toFixed(2) };
}
function apiFacturarOrdenPendiente(payload){
  if (!payload || !payload.nOrden || !payload.factura || !Array.isArray(payload.items) || !payload.items.length){
    return { ok:false, msg:'Datos insuficientes (nOrden, factura, items[])' };
  }
  const out = { ok:true, msg:'', procesados:[], errores:[] };
  for (const it of payload.items){
    const r = apiAgregarFacturaSKU({
      nOrden: payload.nOrden,
      sku: String(it.sku||'').trim(),
      factura: String(payload.factura).trim(),
      fechaFactura: payload.fechaFactura || OC_ymd(new Date()),
      cajasFacturadas: Number(it.cajas||0),
      observacion: `Facturación masiva - SKU: ${it.sku}`
    });
    if (r && r.ok) out.procesados.push({ sku: it.sku, cajas: it.cajas, valor: r.valorFacturado });
    else out.errores.push({ sku: it.sku, error: (r && r.msg) || 'Error desconocido' });
  }
  const suma = out.procesados.reduce((s,a)=>s+(a.valor||0),0);
  out.msg = `Procesados ${out.procesados.length} SKU(s). Valor total facturado: $${suma.toFixed(2)}.`;
  return out;
}

// =============== APIS DE PERÍODO ===============
function _inicioSemanaDe(d){
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = OC_dowTZ(base);
  return OC_sumarDias(base, -(dow-1));
}
function obtenerSemanaOffset(offsetSemanas){
  const base = OC_sumarDias(new Date(), (offsetSemanas||0)*7);
  const inicio = _inicioSemanaDe(base);
  const fin = OC_sumarDias(inicio, 6); fin.setHours(23,59,59,999);
  return _obtenerDatosRangoV2(inicio, fin);
}
function obtenerSemanaYMesOffset(offsetSemanas){
  const base = OC_sumarDias(new Date(), (offsetSemanas||0)*7);
  const inicio = _inicioSemanaDe(base);
  const fin = OC_sumarDias(inicio, 6); fin.setHours(23,59,59,999);
  const semana = _obtenerDatosRangoV2(inicio, fin);
  const resumenSemana = _resumenSemanaFromArray(semana);
  const resumenMes = _obtenerResumenMesPorFecha(inicio);
  const control = _resumenesControl(semana);
  return {
    semana, resumenSemana, resumenMes,
    controlResumenFacturado: control.facturado,
    controlResumenNoFacturado: control.noFacturado
  };
}

function obtenerSemanaYMesPorFecha(ymd){
  const d = OC_dateFromYMD(ymd||OC_ymd(new Date()));
  const inicio = _inicioSemanaDe(d);
  const fin = OC_sumarDias(inicio, 6); fin.setHours(23,59,59,999);
  const semana = _obtenerDatosRangoV2(inicio, fin);
  const resumenSemana = _resumenSemanaFromArray(semana);
  const resumenMes = _obtenerResumenMesPorFecha(d);
  const control = _resumenesControl(semana);
  return {
    semana, resumenSemana, resumenMes,
    controlResumenFacturado: control.facturado,
    controlResumenNoFacturado: control.noFacturado
  };
}

// Compat
function obtenerDatosSemanaActual(){ return obtenerSemanaOffset(0); }
function obtenerSemanaAnterior(){ return obtenerSemanaOffset(-1); }
function obtenerSemanaSiguiente(){ return obtenerSemanaOffset(1); }
function ocGetWebAppUrl(){ try { return ScriptApp.getService().getUrl()||''; } catch(e){ return ''; } }
if (typeof getWebAppUrl !== 'function') { function getWebAppUrl(){ return ocGetWebAppUrl(); } }

// =============== DASHBOARD EJECUTIVO ===============

/**
 * Obtiene resumen ejecutivo con comparaciones mensuales y anuales
 */
function obtenerDashboardEjecutivo(){
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anoActual = hoy.getFullYear();
  
  // Resumen mes actual
  const resumenMesActual = _obtenerResumenMesPorFecha(hoy);
  
  // Resumen mes anterior
  const primerDiaMesAnterior = new Date(anoActual, mesActual - 1, 1);
  const resumenMesAnterior = _obtenerResumenMesPorFecha(primerDiaMesAnterior);
  
  // Resumen año (desde septiembre)
  const inicioAno = new Date(anoActual, 8, 1); // septiembre = mes 8
  const resumenAno = _obtenerResumenRango(inicioAno, hoy);
  
  // Distribución por supermercado (mes actual)
  const porSuper = _obtenerDistribucionSupermercados(new Date(anoActual, mesActual, 1), hoy);
  
  // Top MARCAS (mes actual)
  const topMarcas = _obtenerTopMarcas(new Date(anoActual, mesActual, 1), hoy, 10);
  
  // Tendencia mensual (últimos 3 meses)
  const tendenciaMensual = _obtenerTendenciaMensual(3);
  
  return {
    mesActual: resumenMesActual,
    mesAnterior: resumenMesAnterior,
    ano: resumenAno,
    porSuper: porSuper,
    topMarcas: topMarcas,
    tendenciaMensual: tendenciaMensual,
    nombreMesActual: _getNombreMes(mesActual),
    nombreMesAnterior: _getNombreMes(mesActual - 1)
  };
}

/**
 * VERSIÓN OPTIMIZADA: Lee datos UNA sola vez y los reutiliza
 * @param {number} mesOffset - Offset de meses (0=actual, -1=anterior, etc)
 */
function obtenerDashboardEjecutivoPorMes(mesOffset){
  mesOffset = mesOffset || 0;
  
  const hoy = new Date();
  const mesBase = hoy.getMonth() + mesOffset;
  const anoBase = hoy.getFullYear();
  
  // Calcular mes y año correctos
  const fechaBase = new Date(anoBase, mesBase, 1);
  const mes = fechaBase.getMonth();
  const ano = fechaBase.getFullYear();
  
  // Calcular límite superior (último día del mes o hoy si es mes actual)
  const esMesActual = (hoy.getFullYear() === ano && hoy.getMonth() === mes);
  const limiteMax = esMesActual ? hoy : new Date(ano, mes + 1, 0, 23, 59, 59, 999);
  
  // ========== OPTIMIZACIÓN: LEER DATOS UNA SOLA VEZ ==========
  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return _respuestaVacia();
  
  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);
  const invIdx = cargarFacturasIndex(); // Solo UNA vez
  
  // ========== CALCULAR TODO EN PARALELO ==========
  
  // Mes seleccionado
  const resumenMesActual = _obtenerResumenMesPorFechaOptimizado(
    fechaBase, values, idx, invIdx
  );
  
  // Mes anterior al seleccionado
  const primerDiaMesAnterior = new Date(ano, mes - 1, 1);
  const resumenMesAnterior = _obtenerResumenMesPorFechaOptimizado(
    primerDiaMesAnterior, values, idx, invIdx
  );
  
  // Resumen año (desde septiembre)
  const inicioAno = new Date(ano, 8, 1);
  const resumenAno = _obtenerResumenRangoOptimizado(
    inicioAno, limiteMax, values, idx, invIdx
  );
  resumenAno.ano = ano;
  
  // Distribución por supermercado (mes seleccionado)
  const porSuper = _obtenerDistribucionSupermercadosOptimizado(
    new Date(ano, mes, 1), limiteMax, values, idx, invIdx
  );
  
  // Top MARCAS (mes seleccionado)
  const topMarcas = _obtenerTopMarcasOptimizado(
    new Date(ano, mes, 1), limiteMax, values, idx, invIdx
  );
  
  // Tendencia mensual (últimos 3 meses desde el mes seleccionado)
  const tendenciaMensual = _obtenerTendenciaMensualDesdeOptimizado(
    fechaBase, 3, values, idx, invIdx
  );
  
  return {
    mesActual: resumenMesActual,
    mesAnterior: resumenMesAnterior,
    ano: resumenAno,
    porSuper: porSuper,
    topMarcas: topMarcas,
    tendenciaMensual: tendenciaMensual,
    nombreMesActual: _getNombreMes(mes),
    nombreMesAnterior: _getNombreMes(mes - 1)
  };
}

function _respuestaVacia(){
  const vacio = {totalOrdenes:0, totalCajas:0, totalMonto:0, totalValorFact:0, cumplimientoCajas:0, montoNoFacturado:0};
  return {
    mesActual: vacio,
    mesAnterior: vacio,
    ano: vacio,
    porSuper: [],
    topMarcas: [],
    tendenciaMensual: [],
    nombreMesActual: '',
    nombreMesAnterior: ''
  };
}

// ========== FUNCIONES OPTIMIZADAS (reciben datos cacheados) ==========

function _obtenerResumenMesPorFechaOptimizado(baseDate, values, idx, invIdx){
  const ref = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const y = ref.getFullYear(), m = ref.getMonth();
  
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const esMesActual = (hoy.getFullYear()===y && hoy.getMonth()===m);
  const limiteMax = esMesActual ? hoy : new Date(y, m+1, 0, 23, 59, 59, 999);

  let totalMonto=0, totalFact=0, totalCajas=0, totalCajasFact=0;
  const ordenes = new Set();

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f.getFullYear()!==y || f.getMonth()!==m) continue;
    if (f > limiteMax) continue;

    const nOrden = String(row[idx.nOrden]||'').trim();
    if (nOrden) ordenes.add(nOrden);

    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const cajasFactLinea = facturasLinea.reduce((s,a)=>s+(a.cajasFact||0),0);
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    totalMonto += importe;
    totalFact  += valorFactLinea;
    totalCajas += cajas;
    totalCajasFact += cajasFactLinea;
  }

  return {
    totalOrdenes: ordenes.size,
    totalCajas, 
    totalMonto, 
    totalValorFact: totalFact,
    cumplimientoCajas: totalCajas ? (totalCajasFact/totalCajas) : 0,
    montoNoFacturado: Math.max(0, totalMonto - totalFact)
  };
}

function _obtenerResumenRangoOptimizado(fechaInicio, fechaFin, values, idx, invIdx){
  let totalMonto=0, totalFact=0, totalCajas=0, totalCajasFact=0;
  const ordenes = new Set();

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f < fechaInicio || f > fechaFin) continue;

    const nOrden = String(row[idx.nOrden]||'').trim();
    if (nOrden) ordenes.add(nOrden);

    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const cajasFactLinea = facturasLinea.reduce((s,a)=>s+(a.cajasFact||0),0);
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    totalMonto += importe;
    totalFact  += valorFactLinea;
    totalCajas += cajas;
    totalCajasFact += cajasFactLinea;
  }

  return {
    totalOrdenes: ordenes.size,
    totalCajas, 
    totalMonto, 
    totalValorFact: totalFact,
    cumplimientoCajas: totalCajas ? (totalCajasFact/totalCajas) : 0,
    montoNoFacturado: Math.max(0, totalMonto - totalFact)
  };
}

function _obtenerDistribucionSupermercadosOptimizado(fechaInicio, fechaFin, values, idx, invIdx){
  const porSuper = {};

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f < fechaInicio || f > fechaFin) continue;

    const emisorTxt = row[idx.emisor] || '';
    const compradorTxt = row[idx.comprador] || '';
    const superRaw = idx.superCol > -1 ? (row[idx.superCol] || '') : '';
    const superName = OC_normalizeSuperName(superRaw) || OC_deriveSuper(emisorTxt, compradorTxt);
    
    if(!superName) continue;

    const nOrden = String(row[idx.nOrden]||'').trim();
    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    if(!porSuper[superName]){
      porSuper[superName] = { super: superName, ordenes: new Set(), totalCajas: 0, totalMonto: 0, totalFacturado: 0 };
    }
    
    porSuper[superName].ordenes.add(nOrden);
    porSuper[superName].totalCajas += cajas;
    porSuper[superName].totalMonto += importe;
    porSuper[superName].totalFacturado += valorFactLinea;
  }

  const resultado = Object.values(porSuper).map(s => ({
    super: s.super,
    ordenes: s.ordenes.size,
    totalCajas: s.totalCajas,
    totalMonto: s.totalMonto,
    totalFacturado: s.totalFacturado,
    cumplimiento: s.totalMonto ? (s.totalFacturado / s.totalMonto) : 0
  }));

  return resultado.sort((a,b) => b.totalFacturado - a.totalFacturado);
}

function _obtenerTopMarcasOptimizado(fechaInicio, fechaFin, values, idx, invIdx){
  const porMarca = {};

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f < fechaInicio || f > fechaFin) continue;

    const marca = row[idx.marca] || 'Sin marca';
    const nOrden = String(row[idx.nOrden]||'').trim();
    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    if(!porMarca[marca]){
      porMarca[marca] = { marca: marca, totalCajas: 0, totalMonto: 0, totalFacturado: 0 };
    }
    
    porMarca[marca].totalCajas += cajas;
    porMarca[marca].totalMonto += importe;
    porMarca[marca].totalFacturado += valorFactLinea;
  }

  const resultado = Object.values(porMarca).map(m => ({
    marca: m.marca,
    totalCajas: m.totalCajas,
    totalMonto: m.totalMonto,
    totalFacturado: m.totalFacturado
  }));

  return resultado.sort((a,b) => b.totalFacturado - a.totalFacturado).slice(0, 10);
}

function _obtenerTendenciaMensualDesdeOptimizado(fechaBase, numMeses, values, idx, invIdx){
  const resultado = [];
  const mesBase = fechaBase.getMonth();
  const anoBase = fechaBase.getFullYear();

  for(let i = numMeses - 1; i >= 0; i--){
    const mes = mesBase - i;
    const ano = anoBase;
    const fecha = new Date(ano, mes, 1);
    
    const resumen = _obtenerResumenMesPorFechaOptimizado(fecha, values, idx, invIdx);
    resultado.push({
      mes: _getNombreMes(fecha.getMonth()),
      ano: fecha.getFullYear(),
      totalOrdenes: resumen.totalOrdenes,
      totalCajas: resumen.totalCajas,
      totalMonto: resumen.totalMonto,
      totalFacturado: resumen.totalValorFact,
      cumplimiento: resumen.cumplimientoCajas
    });
  }

  return resultado;
}

function _getNombreMes(mes){
  const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if(mes < 0) mes = 11;
  if(mes > 11) mes = 0;
  return nombres[mes];
}

function _obtenerResumenRango(fechaInicio, fechaFin){
  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return { totalOrdenes:0, totalCajas:0, totalMonto:0, totalValorFact:0, cumplimientoCajas:0, montoNoFacturado:0 };

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);
  const invIdx = cargarFacturasIndex();

  let totalMonto=0, totalFact=0, totalCajas=0, totalCajasFact=0;
  const ordenes = new Set();

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f < fechaInicio || f > fechaFin) continue;

    const nOrden = String(row[idx.nOrden]||'').trim();
    if (nOrden) ordenes.add(nOrden);

    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const cajasFactLinea = facturasLinea.reduce((s,a)=>s+(a.cajasFact||0),0);
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    totalMonto += importe;
    totalFact  += valorFactLinea;
    totalCajas += cajas;
    totalCajasFact += cajasFactLinea;
  }

  return {
    totalOrdenes: ordenes.size,
    totalCajas, 
    totalMonto, 
    totalValorFact: totalFact,
    cumplimientoCajas: totalCajas ? (totalCajasFact/totalCajas) : 0,
    montoNoFacturado: Math.max(0, totalMonto - totalFact)
  };
}

function _obtenerDistribucionSupermercados(fechaInicio, fechaFin){
  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);
  const invIdx = cargarFacturasIndex();

  const porSuper = {};

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f < fechaInicio || f > fechaFin) continue;

    const emisorTxt = row[idx.emisor] || '';
    const compradorTxt = row[idx.comprador] || '';
    const superRaw = idx.superCol > -1 ? (row[idx.superCol] || '') : '';
    const superName = OC_normalizeSuperName(superRaw) || OC_deriveSuper(emisorTxt, compradorTxt);
    
    if(!superName) continue;

    const nOrden = String(row[idx.nOrden]||'').trim();
    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    if(!porSuper[superName]){
      porSuper[superName] = { super: superName, ordenes: new Set(), totalCajas: 0, totalMonto: 0, totalFacturado: 0 };
    }
    
    porSuper[superName].ordenes.add(nOrden);
    porSuper[superName].totalCajas += cajas;
    porSuper[superName].totalMonto += importe;
    porSuper[superName].totalFacturado += valorFactLinea;
  }

  const resultado = Object.values(porSuper).map(s => ({
    super: s.super,
    ordenes: s.ordenes.size,
    totalCajas: s.totalCajas,
    totalMonto: s.totalMonto,
    totalFacturado: s.totalFacturado,
    cumplimiento: s.totalMonto ? (s.totalFacturado / s.totalMonto) : 0
  }));

  return resultado.sort((a,b) => b.totalFacturado - a.totalFacturado);
}

// =============== NUEVA FUNCIÓN: TOP MARCAS ===============
function _obtenerTopMarcas(fechaInicio, fechaFin, limit){
  const sh = OC_getSheetOC();
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(h=>String(h).trim());
  const idx = _buildIndexV2(headers);
  const invIdx = cargarFacturasIndex();

  const porMarca = {};

  for (let i=1;i<values.length;i++){
    const row = values[i];
    const f = OC_coerceDate(row[idx.fecha]);
    if (!(f instanceof Date) || isNaN(f)) continue;
    if (f < fechaInicio || f > fechaFin) continue;

    const marca = row[idx.marca] || 'Sin marca';
    const nOrden = String(row[idx.nOrden]||'').trim();
    const skuRaw = String(row[idx.sku]||'').trim();
    const cajas = OC_cajasFromRow(row, idx);
    const importe = OC_num(row[idx.importe]);

    const facturasLinea = dedupFacturaRows(cargarFacturasDeKey(invIdx, `${nOrden}|${skuRaw}`));
    const valorFactLinea = facturasLinea.reduce((s,a)=>s+(a.valorFact||0),0);

    if(!porMarca[marca]){
      porMarca[marca] = { marca: marca, totalCajas: 0, totalMonto: 0, totalFacturado: 0 };
    }
    
    porMarca[marca].totalCajas += cajas;
    porMarca[marca].totalMonto += importe;
    porMarca[marca].totalFacturado += valorFactLinea;
  }

  const resultado = Object.values(porMarca).map(m => ({
    marca: m.marca,
    totalCajas: m.totalCajas,
    totalMonto: m.totalMonto,
    totalFacturado: m.totalFacturado
  }));

  return resultado.sort((a,b) => b.totalFacturado - a.totalFacturado).slice(0, limit);
}

function _obtenerTendenciaMensual(numMeses){
  const hoy = new Date();
  const resultado = [];

  for(let i = numMeses - 1; i >= 0; i--){
    const mes = hoy.getMonth() - i;
    const ano = hoy.getFullYear();
    const fecha = new Date(ano, mes, 1);
    
    if(fecha > hoy) continue;
    
    const resumen = _obtenerResumenMesPorFecha(fecha);
    resultado.push({
      mes: _getNombreMes(mes),
      ano: ano,
      totalOrdenes: resumen.totalOrdenes,
      totalCajas: resumen.totalCajas,
      totalMonto: resumen.totalMonto,
      totalFacturado: resumen.totalValorFact,
      cumplimiento: resumen.cumplimientoCajas
    });
  }

  return resultado;
}

function _obtenerTendenciaMensualDesde(fechaBase, numMeses){
  const resultado = [];
  const mesBase = fechaBase.getMonth();
  const anoBase = fechaBase.getFullYear();

  for(let i = numMeses - 1; i >= 0; i--){
    const mes = mesBase - i;
    const ano = anoBase;
    const fecha = new Date(ano, mes, 1);
    
    const resumen = _obtenerResumenMesPorFecha(fecha);
    resultado.push({
      mes: _getNombreMes(fecha.getMonth()),
      ano: fecha.getFullYear(),
      totalOrdenes: resumen.totalOrdenes,
      totalCajas: resumen.totalCajas,
      totalMonto: resumen.totalMonto,
      totalFacturado: resumen.totalValorFact,
      cumplimiento: resumen.cumplimientoCajas
    });
  }

  return resultado;
}