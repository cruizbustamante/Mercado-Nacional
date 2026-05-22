/** ============================
 *  Deuda Clientes — Backend GS
 *  VERSIÓN 2.1 - GESTIÓN COBRANZA MEJORADA
 *  - Sin "Marcar Pagada" 
 *  - Eliminar solo gestiones cumplidas
 * ============================ */

const DEUDA_CFG = {
  SHEET_DEUDA: 'Deuda Clientes',
  SHEET_SEGURO: 'Seguro Vigente',
  SHEET_GESTION: 'Gestion Cobranza',
  CACHE_SECS: 300,
  HDR_DEUDA: {
    nombre: ['Nombre Cliente','Cliente','Nombre'],
    rut: ['RUT','Rut','RUT Cliente','Rut Cliente'],
    deuda: [
      'Deuda','Saldo por cobrar','Saldo',
      'No Documentado Ni Pagado','No documentado ni pagado',
      'Total deuda','Total','Monto deuda','Monto',
      'Deuda (CLP)','Saldo CLP'
    ],
    chequesCartera: [
      'Suma de Ch_Cartera','P Suma de Ch_Cartera Total Bruto',
      'Ch_Cartera','Cheques Cartera','Cheques en Cartera',
      'Suma Ch_Cartera','P Suma de Ch_Cartera'
    ],
    documento: [
      'Nº Documento','N° Documento','Numero Documento','Número Documento',
      'Nº Doc','N° Doc','Factura','Nº Factura','N° Factura','Folio'
    ],
    fechaFactura: [
      'Fecha Facturación','F. Facturación','Fecha Factura','F. Factura',
      'Fecha Emisión','Fecha Emision','Fec Fact'
    ],
    fechaVenc: [
      'Fecha Vencimiento de Pago','Fecha Vencimiento','F. Vencimiento',
      'F. Venc.','Fec Venc'
    ],
    diasVenc: [
      'Días Vencimiento','Dias Vencimiento','Días','Dias','Días venc',
      'Dias venc','Max Dias Vencidos'
    ],
    canalVenta: ['Canal de Venta','Canal','Ejecutivo','Vendedor'],
    condicionPago: ['Condición de Pago','Condicion de Pago','Cond. de Pago'],
    estadoPago: ['Estado Final de Pago','Estado Pago','Estado de Pago']
  },
  HDR_SEGURO: {
    rut: ['RUT','Rut','Rut Cliente','RUT Cliente'],
    aprobado: [
      'Monto Aprobado CLP','Monto Aprobado (CLP)','Monto aprobado CLP',
      'Línea de Crédito','Linea Credito (CLP)'
    ]
  }
};

const COBRANZA_CFG = {
  VENDEDORES_MAP: {
    'vdajmontenegro@gmail.com': 'JMMontenegro',
    'vdacossa@gmail.com': 'Carlos Ossa',
    'vdadhernandez@gmail.com': 'DHernández',
    'vdasdeaguirre@gmail.com': 'Sebastian de Aguirre'
  },
  ADMINS: [
    'cruizbusta@gmail.com',
    'vdamsanchez@gmail.com',
    'vdardeaguirre@gmail.com'
  ]
};

// ---------- Utils ----------
function _ss_(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }

function _sheetByName_(name){
  const sh = _ss_().getSheetByName(name);
  if(!sh) throw new Error(`No existe la pestaña "${name}"`);
  return sh;
}

function _headersMap_(headers, keysObj){
  const hn = headers.map(h => String(h||'').trim().toLowerCase());
  const findIx = (alts) => {
    const arr = (Array.isArray(alts)? alts:[alts]).map(x => String(x||'').trim().toLowerCase());
    return hn.findIndex(h => arr.includes(h));
  };
  const out = {};
  Object.entries(keysObj).forEach(([k,alts]) => out[k] = findIx(alts));
  return out;
}

function _num(n){ n = Number(n); return isFinite(n) ? n : 0; }

function _normRut_(v){
  const s = String(v||'').toUpperCase().replace(/[^0-9K-]/g,'').trim();
  if(!s) return '';
  if(s.includes('-')){
    const [c,d=''] = s.split('-');
    return `${Number(c)}-${d}`;
  }
  return String(Number(s));
}

function _excelToDate_(v){
  if(!v && v!==0) return null;
  if(v instanceof Date) return v;
  if(typeof v === 'number' && v > 0){
    const epoch = new Date(1899,11,30);
    const d = new Date(epoch.getTime() + v*24*3600*1000);
    return isNaN(d) ? null : d;
  }
  const d2 = new Date(v);
  return isNaN(d2) ? null : d2;
}

function _fmtDate_(v, fmt='yyyy-MM-dd'){
  const d = _excelToDate_(v);
  if(!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Santiago', fmt);
}

function _daysDiffFromToday_(dateVenc){
  const v = _excelToDate_(dateVenc);
  if(!v) return 0;
  const today = new Date();
  today.setHours(0,0,0,0);
  const vv = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const diffMs = today - vv;
  return Math.round(diffMs / (24*3600*1000));
}

function _getCurrentUserInfo_() {
  const email = Session.getActiveUser().getEmail();
  const canal = COBRANZA_CFG.VENDEDORES_MAP[email] || null;
  const isAdmin = COBRANZA_CFG.ADMINS.includes(email);
  const isVendedor = !!canal && !isAdmin;
  
  return {
    email: email,
    canal: canal || 'Administrador',
    isVendedor: isVendedor,
    isAdmin: isAdmin
  };
}

// ============================================
// REEMPLAZAR ESTAS 2 FUNCIONES EN Deuda.gs
// ============================================

// ---------- Lee detalle (SIN CACHÉ - evita error de tamaño) ----------
function _readDeudaDetalle_(){
  // Removido el caché porque excede el límite de 100KB
  
  const sh = _sheetByName_(DEUDA_CFG.SHEET_DEUDA);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return { headers:[], detalle:[] };

  const headers = values[0];
  const idx = _headersMap_(headers, DEUDA_CFG.HDR_DEUDA);

  if(idx.nombre < 0 && idx.rut < 0)
    throw new Error(`La hoja "${DEUDA_CFG.SHEET_DEUDA}" debe tener Cliente o RUT`);
  if(idx.deuda < 0)
    throw new Error(`Falta columna de deuda/saldo`);

  const rows = values.slice(1);
  const detalle = [];
  for(const r of rows){
    const nombre = r[idx.nombre >= 0 ? idx.nombre : -1] || '';
    const rut = _normRut_(r[idx.rut >= 0 ? idx.rut : -1]);
    if(!nombre && !rut) continue;

    const deuda = Math.abs(_num(r[idx.deuda]));
    const chequesCartera = idx.chequesCartera >= 0 ? Math.abs(_num(r[idx.chequesCartera])) : 0;
    
    const fVencRaw = idx.fechaVenc >= 0 ? r[idx.fechaVenc] : null;
    const diasSigned = (fVencRaw!=null && fVencRaw!=='')
      ? _daysDiffFromToday_(fVencRaw)
      : (idx.diasVenc >= 0 ? _num(r[idx.diasVenc]) : 0);

    detalle.push({
      cliente        : nombre,
      rut            : rut,
      documento      : idx.documento >= 0 ? String(r[idx.documento]||'') : '',
      fechaFactura   : idx.fechaFactura >= 0 ? r[idx.fechaFactura] : '',
      fechaVenc      : fVencRaw,
      fechaFacturaStr: idx.fechaFactura >= 0 ? _fmtDate_(r[idx.fechaFactura]) : '',
      fechaVencStr   : fVencRaw!=null ? _fmtDate_(fVencRaw) : '',
      diasVenc       : Math.abs(diasSigned),
      diasSigned     : diasSigned,
      deuda          : deuda,
      chequesCartera : chequesCartera,
      canalVenta     : idx.canalVenta >= 0 ? String(r[idx.canalVenta]||'') : '',
      condicionPago  : idx.condicionPago >= 0 ? String(r[idx.condicionPago]||'') : '',
      estadoPago     : idx.estadoPago >= 0 ? String(r[idx.estadoPago]||'') : ''
    });
  }

  return { headers, detalle };
}

// ---------- Seguro Vigente (con caché seguro) ----------
function _getLineaCreditoMap_(){
  const cache = CacheService.getScriptCache();
  const cached = cache.get('vda_seguro_map');
  if(cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {
      // Si falla el parse, continuar sin caché
    }
  }

  const sh = _sheetByName_(DEUDA_CFG.SHEET_SEGURO);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return {};

  const headers = values[0];
  const idx = _headersMap_(headers, DEUDA_CFG.HDR_SEGURO);
  if(idx.rut < 0 || idx.aprobado < 0)
    throw new Error(`Faltan columnas en "${DEUDA_CFG.SHEET_SEGURO}"`);

  const out = {};
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const rut = _normRut_(row[idx.rut]);
    const monto = Math.abs(_num(row[idx.aprobado]));
    if(!rut) continue;
    out[rut] = Math.max(_num(out[rut]), monto);
  }
  
  // Solo guardar en caché si cabe (< 90KB para seguridad)
  try {
    const json = JSON.stringify(out);
    if(json.length < 90000) {
      cache.put('vda_seguro_map', json, DEUDA_CFG.CACHE_SECS);
    }
  } catch(e) {
    Logger.log('No se pudo guardar caché de seguro: ' + e.message);
  }
  
  return out;
}

// ---------- Lee detalle ----------
function _readDeudaDetalle_(){
  // Removido el caché porque excede el límite de 100KB
  
  const sh = _sheetByName_(DEUDA_CFG.SHEET_DEUDA);
  const values = sh.getDataRange().getValues();
  if(values.length < 2) return { headers:[], detalle:[] };

  const headers = values[0];
  const idx = _headersMap_(headers, DEUDA_CFG.HDR_DEUDA);

  if(idx.nombre < 0 && idx.rut < 0)
    throw new Error(`La hoja "${DEUDA_CFG.SHEET_DEUDA}" debe tener Cliente o RUT`);
  if(idx.deuda < 0)
    throw new Error(`Falta columna de deuda/saldo`);

  const rows = values.slice(1);
  const detalle = [];
  for(const r of rows){
    const nombre = r[idx.nombre >= 0 ? idx.nombre : -1] || '';
    const rut = _normRut_(r[idx.rut >= 0 ? idx.rut : -1]);
    if(!nombre && !rut) continue;

    const deuda = Math.abs(_num(r[idx.deuda]));
    const chequesCartera = idx.chequesCartera >= 0 ? Math.abs(_num(r[idx.chequesCartera])) : 0;
    
    const fVencRaw = idx.fechaVenc >= 0 ? r[idx.fechaVenc] : null;
    const diasSigned = (fVencRaw!=null && fVencRaw!=='')
      ? _daysDiffFromToday_(fVencRaw)
      : (idx.diasVenc >= 0 ? _num(r[idx.diasVenc]) : 0);

    detalle.push({
      cliente        : nombre,
      rut            : rut,
      documento      : idx.documento >= 0 ? String(r[idx.documento]||'') : '',
      fechaFactura   : idx.fechaFactura >= 0 ? r[idx.fechaFactura] : '',
      fechaVenc      : fVencRaw,
      fechaFacturaStr: idx.fechaFactura >= 0 ? _fmtDate_(r[idx.fechaFactura]) : '',
      fechaVencStr   : fVencRaw!=null ? _fmtDate_(fVencRaw) : '',
      diasVenc       : Math.abs(diasSigned),
      diasSigned     : diasSigned,
      deuda          : deuda,
      chequesCartera : chequesCartera,
      canalVenta     : idx.canalVenta >= 0 ? String(r[idx.canalVenta]||'') : '',
      condicionPago  : idx.condicionPago >= 0 ? String(r[idx.condicionPago]||'') : '',
      estadoPago     : idx.estadoPago >= 0 ? String(r[idx.estadoPago]||'') : ''
    });
  }

  return { headers, detalle };
}

// ---------- Consolida por cliente ----------
function _consolidarPorCliente_(detalle, credMap){
  const keyFn = (x) => _normRut_(x.rut) || String(x.cliente||'').trim().toLowerCase();
  const agg = {};

  for(const it of detalle){
    const key = keyFn(it);
    if(!key) continue;
    const g = agg[key] || (agg[key] = {
      cliente: it.cliente,
      rut: _normRut_(it.rut),
      docs: 0, maxDias: 0, porVencer: 0, vencida: 0, totalDeuda: 0,
      chequesCartera: 0, deudaNoDocumentada: 0,
      buckets: { pv:0, d1_30:0, d31_60:0, d61_90:0, d90p:0, docs:0 },
      canales: new Set(), condiciones: new Set(), protestado: false
    });

    const dias  = _num(it.diasSigned != null ? it.diasSigned : it.diasVenc);
    const deuda = _num(it.deuda);
    const cheques = _num(it.chequesCartera);

    g.docs += 1; 
    g.buckets.docs += 1; 
    g.deudaNoDocumentada += deuda;
    g.chequesCartera += cheques;
    g.totalDeuda += (deuda + cheques);
    g.maxDias = Math.max(g.maxDias, Math.max(0, dias));

    if(dias > 90){ g.vencida += deuda; g.buckets.d90p++; }
    else if(dias > 60){ g.vencida += deuda; g.buckets.d61_90++; }
    else if(dias > 30){ g.vencida += deuda; g.buckets.d31_60++; }
    else if(dias > 0){  g.vencida += deuda; g.buckets.d1_30++; }
    else {               g.porVencer += deuda; g.buckets.pv++; }

    if(it.canalVenta)    g.canales.add(it.canalVenta);
    if(it.condicionPago) g.condiciones.add(it.condicionPago);
    if(String(it.estadoPago||'').toLowerCase().includes('protest')) g.protestado = true;

    agg[key] = g;
  }

  return Object.values(agg).map(g => {
    const linea = _num(credMap[g.rut]);
    const disponible = linea - g.totalDeuda;
    const utilPct = linea > 0 ? Math.round((g.totalDeuda/linea)*1000)/10 : 0;
    const sobregirado = g.totalDeuda > linea && linea > 0;

    return {
      cliente: g.cliente, rut: g.rut, docs: g.docs, maxDias: g.maxDias,
      porVencer: g.porVencer, vencida: g.vencida, 
      deudaNoDocumentada: g.deudaNoDocumentada,
      chequesCartera: g.chequesCartera,
      totalDeuda: g.totalDeuda,
      lineaCredito: linea, disponible, utilizacionPct: utilPct,
      sobregirado, buckets: g.buckets,
      canales: Array.from(g.canales),
      condiciones: Array.from(g.condiciones),
      protestado: g.protestado
    };
  });
}

// ---------- API: Resumen ----------
function apiDeudaGetResumen(opts){
  try{
    const userInfo = _getCurrentUserInfo_();
    const { detalle } = _readDeudaDetalle_();
    const credMap = _getLineaCreditoMap_();
    let items = _consolidarPorCliente_(detalle, credMap);

    if (userInfo.isVendedor && !userInfo.isAdmin && userInfo.canal) {
      items = items.filter(cliente => (cliente.canales || []).includes(userInfo.canal));
    }

    const q = String(opts?.q||'').toLowerCase().trim();
    const minDeuda = _num(opts?.minDeuda||0);
    const minDias = _num(opts?.minDias||0);
    const estado = String(opts?.estado||'todos').toLowerCase();

    items = items.filter(d=>{
      if(q && !(String(d.cliente||'').toLowerCase().includes(q) || String(d.rut||'').includes(q))) return false;
      if(minDeuda && d.totalDeuda < minDeuda) return false;
      if(minDias && d.maxDias < minDias) return false;
      const venc = d.vencida || 0, pv = d.porVencer || 0;
      if(estado==='porvencer' && !(pv > 0 && venc === 0)) return false;
      if(estado==='vencida' && !(venc > 0 && pv === 0)) return false;
      if(estado==='mixta' && !(venc > 0 && pv > 0)) return false;
      return true;
    });

    const sort = String(opts?.sort||'total').toLowerCase();
    if(sort==='total') items.sort((a,b)=>b.totalDeuda-a.totalDeuda);
    else if(sort==='pct') items.sort((a,b)=> (b.totalDeuda>0?b.vencida/b.totalDeuda:0) - (a.totalDeuda>0?a.vencida/a.totalDeuda:0));
    else if(sort==='dias') items.sort((a,b)=>b.maxDias-a.maxDias);
    else if(sort==='util') items.sort((a,b)=> (b.utilizacionPct||0) - (a.utilizacionPct||0));
    else if(sort==='alf') items.sort((a,b)=> String(a.cliente).localeCompare(String(b.cliente)));

    const kTot = items.reduce((s,x)=>s+x.totalDeuda,0);
    const kDeudaNoDoc = items.reduce((s,x)=>s+x.deudaNoDocumentada,0);
    const kCheques = items.reduce((s,x)=>s+x.chequesCartera,0);
    const kVen = items.reduce((s,x)=>s+x.vencida,0);
    const kPV  = items.reduce((s,x)=>s+x.porVencer,0);
    const kLinea = items.reduce((s,x)=>s+x.lineaCredito,0);
    const kSob   = items.filter(x=>x.sobregirado).length;

    const kBuckets = items.reduce((acc,x)=>{
      acc.pv     += x.buckets?.pv      || 0;
      acc.d1_30  += x.buckets?.d1_30   || 0;
      acc.d31_60 += x.buckets?.d31_60  || 0;
      acc.d61_90 += x.buckets?.d61_90  || 0;
      acc.d90p   += x.buckets?.d90p    || 0;
      acc.docs   += x.buckets?.docs    || 0;
      return acc;
    }, {pv:0,d1_30:0,d31_60:0,d61_90:0,d90p:0,docs:0});

    return {
      ok: true,
      items,
      kpis: {
        clientes: items.length,
        deudaTotal: kTot,
        deudaNoDocumentada: kDeudaNoDoc,
        chequesCartera: kCheques,
        vencida: kVen,
        porVencer: kPV,
        pctVencida: kTot>0 ? (kVen/kTot*100) : 0,
        utilProm: kLinea>0 ? (kTot/kLinea*100) : 0,
        creditoTotal: kLinea,
        disponibleTotal: kLinea - kTot,
        sobregirados: kSob,
        sobregiro: kSob,
        buckets: kBuckets
      },
      userInfo: {
        email: userInfo.email,
        canal: userInfo.canal,
        isVendedor: userInfo.isVendedor,
        isAdmin: userInfo.isAdmin
      }
    };
  }catch(err){
    return { ok:false, error:String(err) };
  }
}

// ---------- API: Detalle por cliente ----------
function apiDeudaGetDetalleCliente(clienteOrRut){
  try{
    const q = String(clienteOrRut||'').toLowerCase().trim();
    const { detalle } = _readDeudaDetalle_();
    const credMap = _getLineaCreditoMap_();

    const rows = detalle.filter(r => {
      const byNombre = String(r.cliente||'').toLowerCase() === q;
      const byRut = _normRut_(r.rut) === _normRut_(q);
      return byNombre || byRut;
    });
    if(!rows.length) return { ok:false, error:'Cliente no encontrado' };

    const rut = _normRut_(rows[0].rut);
    const cliente = rows[0].cliente;

    const gestionesCliente = _getGestionesCliente_(rut || cliente);

    const totales = rows.reduce((acc,it)=>{
      const d = _num(it.deuda);
      const cheques = _num(it.chequesCartera);
      const dias = _num(it.diasSigned != null ? it.diasSigned : it.diasVenc);
      acc.documentos += 1;
      acc.deudaNoDocumentada += d;
      acc.chequesCartera += cheques;
      acc.deudaTotal += (d + cheques);
      if(dias>0) { acc.vencida += d; acc.docsVencidos += 1; }
      else       { acc.porVencer += d; acc.docsPV += 1; }
      acc.maxDias = Math.max(acc.maxDias, Math.max(0,dias));
      if(dias>90) acc.buckets.d90p++;
      else if(dias>60) acc.buckets.d61_90++;
      else if(dias>30) acc.buckets.d31_60++;
      else if(dias>0)  acc.buckets.d1_30++;
      else acc.buckets.pv++;
      acc.buckets.docs++;
      return acc;
    }, { documentos:0, deudaTotal:0, deudaNoDocumentada:0, chequesCartera:0,
          vencida:0, porVencer:0, maxDias:0, docsVencidos:0, docsPV:0,
          buckets:{pv:0,d1_30:0,d31_60:0,d61_90:0,d90p:0,docs:0} });

    const linea = _num(credMap[rut]);
    const disponible = linea - totales.deudaTotal;
    const utilPct = linea>0 ? Math.round((totales.deudaTotal/linea)*1000)/10 : 0;

    const canales = Array.from(new Set(rows.map(r=>r.canalVenta).filter(Boolean)));
    const condiciones = Array.from(new Set(rows.map(r=>r.condicionPago).filter(Boolean)));
    const protestado = rows.some(r => String(r.estadoPago||'').toLowerCase().includes('protest'));

    const itemsConGestion = rows.map(it => {
      const docGestiones = gestionesCliente.filter(g => 
        String(g.documento).trim() === String(it.documento).trim()
      );
      
      return {
        documento: it.documento,
        fechaFactura: it.fechaFacturaStr || _fmtDate_(it.fechaFactura),
        fechaVenc: it.fechaVencStr || _fmtDate_(it.fechaVenc),
        diasVenc: it.diasVenc,
        diasSigned: it.diasSigned,
        deuda: it.deuda,
        chequesCartera: it.chequesCartera,
        estadoPago: it.estadoPago || '',
        canalVenta: it.canalVenta || '',
        condicionPago: it.condicionPago || '',
        gestiones: docGestiones,
        tieneGestion: docGestiones.length > 0,
        ultimaGestion: docGestiones.length > 0 ? docGestiones[0] : null
      };
    });

    const resumenGestion = {
      totalGestiones: gestionesCliente.length,
      compromisosPago: gestionesCliente.filter(g => g.tipo === 'compromiso_pago').length,
      observaciones: gestionesCliente.filter(g => g.tipo === 'observacion').length,
      problemas: gestionesCliente.filter(g => g.tipo === 'problema' && g.estado !== 'cumplido').length,
      ultimaGestion: gestionesCliente.length > 0 ? gestionesCliente[0] : null
    };

    return {
      ok:true,
      cliente, rut,
      totales,
      credito: { lineaCredito: linea, disponible, utilizacionPct: utilPct },
      buckets: totales.buckets,
      gestion: { canales, condiciones, protestado },
      items: itemsConGestion,
      resumenGestion,
      gestiones: gestionesCliente
    };
  }catch(err){
    return { ok:false, error:String(err) };
  }
}

// ============ SISTEMA DE GESTIÓN ============

function _initGestionSheet_(){
  const ss = _ss_();
  let sh = ss.getSheetByName(DEUDA_CFG.SHEET_GESTION);
  
  if(!sh){
    sh = ss.insertSheet(DEUDA_CFG.SHEET_GESTION);
    sh.appendRow([
      'Timestamp',
      'RUT Cliente',
      'Cliente',
      'Nº Documento',
      'Tipo',
      'Descripcion',
      'Fecha Compromiso',
      'Monto Compromiso',
      'Estado',
      'Canal Vendedor',
      'Email Vendedor',
      'Fecha Resolucion',
      'Nota Resolucion'
    ]);
    
    const headerRange = sh.getRange(1, 1, 1, 13);
    headerRange.setBackground('#0854A0');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  
  return sh;
}

function _getGestionesCliente_(clienteOrRut){
  try{
    const sh = _initGestionSheet_();
    const values = sh.getDataRange().getValues();
    if(values.length < 2) return [];
    
    const rutNorm = _normRut_(clienteOrRut);
    const nombreLower = String(clienteOrRut||'').toLowerCase().trim();
    
    const gestiones = [];
    for(let i=1; i<values.length; i++){
      const row = values[i];
      const rowRut = _normRut_(row[1]);
      const rowCliente = String(row[2]||'').toLowerCase().trim();
      
      if(rowRut === rutNorm || rowCliente === nombreLower){
        gestiones.push({
          id: i,
          timestamp: row[0] ? new Date(row[0]).toISOString() : '',
          rut: row[1],
          cliente: row[2],
          documento: String(row[3]||''),
          tipo: row[4] || 'observacion',
          descripcion: row[5] || '',
          fechaCompromiso: row[6] ? _fmtDate_(row[6]) : '',
          montoCompromiso: _num(row[7]),
          estado: row[8] || 'abierto',
          canalVendedor: row[9] || '',
          emailVendedor: row[10] || '',
          fechaResolucion: row[11] ? _fmtDate_(row[11]) : '',
          notaResolucion: row[12] || ''
        });
      }
    }
    
    gestiones.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    return gestiones;
  }catch(e){
    Logger.log('Error en _getGestionesCliente_: ' + e);
    return [];
  }
}

function apiGestionAgregarSeguimiento(data){
  try{
    const userInfo = _getCurrentUserInfo_();
    
    if(!data.descripcion || !data.descripcion.trim()){
      return { ok: false, error: 'Debe ingresar una descripción' };
    }
    
    if(!data.rut && !data.cliente){
      return { ok: false, error: 'Debe proporcionar RUT o cliente' };
    }
    
    const sh = _initGestionSheet_();
    const timestamp = new Date();
    const rut = _normRut_(data.rut);
    
    sh.appendRow([
      timestamp,
      rut,
      data.cliente || '',
      data.documento || '',
      data.tipo || 'observacion',
      data.descripcion.trim(),
      data.fechaCompromiso || '',
      data.montoCompromiso || '',
      data.estado || 'abierto',
      userInfo.canal,
      userInfo.email,
      '',
      ''
    ]);
    
    CacheService.getScriptCache().remove('vda_deuda_detalle_raw');
    
    return {
      ok: true,
      mensaje: 'Seguimiento agregado exitosamente',
      timestamp: timestamp.toISOString()
    };
    
  }catch(err){
    Logger.log('Error en apiGestionAgregarSeguimiento: ' + err);
    return { ok: false, error: String(err) };
  }
}

function apiGestionActualizarEstado(data){
  try{
    const userInfo = _getCurrentUserInfo_();
    
    if(!data.id){
      return { ok: false, error: 'Falta ID de la gestión' };
    }
    
    const sh = _initGestionSheet_();
    const rowNum = data.id + 1;
    
    sh.getRange(rowNum, 9).setValue(data.nuevoEstado || 'abierto');
    
    if(data.nuevoEstado === 'cumplido'){
      sh.getRange(rowNum, 12).setValue(new Date());
      sh.getRange(rowNum, 13).setValue(data.notaResolucion || `Cumplido por ${userInfo.canal}`);
    }
    
    return {
      ok: true,
      mensaje: 'Estado actualizado',
      nuevoEstado: data.nuevoEstado
    };
    
  }catch(err){
    Logger.log('Error en apiGestionActualizarEstado: ' + err);
    return { ok: false, error: String(err) };
  }
}

/**
 * API: Eliminar gestión - SOLO SI ESTÁ CUMPLIDA
 */
function apiGestionEliminar(id){
  try{
    if(!id){
      return { ok: false, error: 'Falta ID' };
    }
    
    const sh = _initGestionSheet_();
    const values = sh.getDataRange().getValues();
    const rowNum = id + 1;
    
    if(rowNum >= values.length){
      return { ok: false, error: 'Gestión no encontrada' };
    }
    
    // Verificar que esté en estado "cumplido"
    const estado = String(values[id][8] || '').toLowerCase();
    if(estado !== 'cumplido'){
      return { ok: false, error: 'Solo se pueden eliminar gestiones en estado CUMPLIDO' };
    }
    
    sh.deleteRow(rowNum);
    
    return { ok: true, mensaje: 'Gestión eliminada' };
    
  }catch(err){
    Logger.log('Error en apiGestionEliminar: ' + err);
    return { ok: false, error: String(err) };
  }
}

function apiGestionGetResumen(filtros){
  try{
    const userInfo = _getCurrentUserInfo_();
    filtros = filtros || {};
    
    const sh = _initGestionSheet_();
    const values = sh.getDataRange().getValues();
    
    if(values.length < 2){
      return { ok: true, items: [], clientesResumen: [], stats: {} };
    }
    
    let items = [];
    for(let i=1; i<values.length; i++){
      const row = values[i];
      if(!row[0]) continue;
      
      const gestion = {
        id: i,
        timestamp: row[0] ? new Date(row[0]).toISOString() : '',
        rut: _normRut_(row[1]),
        cliente: row[2] || '',
        documento: String(row[3]||''),
        tipo: row[4] || 'observacion',
        descripcion: row[5] || '',
        fechaCompromiso: row[6] ? _fmtDate_(row[6]) : '',
        montoCompromiso: _num(row[7]),
        estado: row[8] || 'abierto',
        canalVendedor: row[9] || '',
        emailVendedor: row[10] || '',
        fechaResolucion: row[11] ? _fmtDate_(row[11]) : '',
        notaResolucion: row[12] || ''
      };
      
      if(userInfo.isVendedor && !userInfo.isAdmin){
        if(gestion.canalVendedor !== userInfo.canal) continue;
      }
      
      if(filtros.tipo && filtros.tipo !== 'todos' && gestion.tipo !== filtros.tipo) continue;
      if(filtros.estado && filtros.estado !== 'todos' && gestion.estado !== filtros.estado) continue;
      if(filtros.q){
        const qLower = filtros.q.toLowerCase();
        const match = 
          gestion.cliente.toLowerCase().includes(qLower) ||
          gestion.rut.toLowerCase().includes(qLower) ||
          gestion.documento.toLowerCase().includes(qLower) ||
          gestion.descripcion.toLowerCase().includes(qLower);
        if(!match) continue;
      }
      
      items.push(gestion);
    }
    
    items.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const stats = {
      total: items.length,
      compromisosPago: items.filter(x => x.tipo === 'compromiso_pago').length,
      observaciones: items.filter(x => x.tipo === 'observacion').length,
      problemas: items.filter(x => x.tipo === 'problema').length,
      contactos: items.filter(x => x.tipo === 'contacto').length,
      abiertos: items.filter(x => x.estado === 'abierto').length,
      pendientes: items.filter(x => x.estado === 'pendiente').length,
      cumplidos: items.filter(x => x.estado === 'cumplido').length,
      incumplidos: items.filter(x => x.estado === 'incumplido').length,
      clientesUnicos: new Set(items.map(x => x.rut || x.cliente)).size,
      montoCompromisos: items.filter(x => x.tipo === 'compromiso_pago' && x.estado !== 'cumplido')
                              .reduce((s,x) => s + x.montoCompromiso, 0)
    };
    
    const porCliente = {};
    items.forEach(g => {
      const key = g.rut || g.cliente;
      if(!porCliente[key]){
        porCliente[key] = {
          cliente: g.cliente,
          rut: g.rut,
          gestiones: [],
          totalGestiones: 0,
          compromisosPendientes: 0,
          problemas: 0,
          ultimaGestion: null
        };
      }
      porCliente[key].gestiones.push(g);
      porCliente[key].totalGestiones++;
      if(g.tipo === 'compromiso_pago' && g.estado !== 'cumplido') porCliente[key].compromisosPendientes++;
      if(g.tipo === 'problema' && g.estado !== 'cumplido') porCliente[key].problemas++;
      if(!porCliente[key].ultimaGestion || new Date(g.timestamp) > new Date(porCliente[key].ultimaGestion.timestamp)){
        porCliente[key].ultimaGestion = g;
      }
    });
    
    const clientesResumen = Object.values(porCliente)
      .sort((a,b) => new Date(b.ultimaGestion?.timestamp || 0) - new Date(a.ultimaGestion?.timestamp || 0));
    
    return {
      ok: true,
      items,
      clientesResumen,
      stats,
      userInfo: {
        email: userInfo.email,
        canal: userInfo.canal,
        isVendedor: userInfo.isVendedor,
        isAdmin: userInfo.isAdmin
      }
    };
    
  }catch(err){
    Logger.log('Error en apiGestionGetResumen: ' + err);
    return { ok: false, error: String(err) };
  }
}

// ============ CALENDARIO ============
function apiDeudaGetCalendarioCobranza(opts){
  try{
    const { detalle } = _readDeudaDetalle_();
    
    // Incluir facturas con deuda O con cheques
    let facturas = detalle.filter(it => _num(it.deuda) > 0 || _num(it.chequesCartera) > 0);
    
    if(opts?.desde && opts.desde.trim() !== ''){
      const desde = new Date(opts.desde);
      if(!isNaN(desde)){
        facturas = facturas.filter(it => {
          const fv = _excelToDate_(it.fechaVenc);
          return fv && fv >= desde;
        });
      }
    }
    
    if(opts?.hasta && opts.hasta.trim() !== ''){
      const hasta = new Date(opts.hasta);
      if(!isNaN(hasta)){
        facturas = facturas.filter(it => {
          const fv = _excelToDate_(it.fechaVenc);
          return fv && fv <= hasta;
        });
      }
    }
    
    if(opts?.estado === 'vencida'){
      facturas = facturas.filter(it => {
        const dias = _num(it.diasSigned != null ? it.diasSigned : it.diasVenc);
        return dias > 0;
      });
    } else if(opts?.estado === 'porvencer'){
      facturas = facturas.filter(it => {
        const dias = _num(it.diasSigned != null ? it.diasSigned : it.diasVenc);
        return dias <= 0;
      });
    }
    
    if(opts?.q){
      const qLower = String(opts.q).toLowerCase().trim();
      facturas = facturas.filter(it => 
        String(it.cliente||'').toLowerCase().includes(qLower) ||
        String(it.rut||'').toLowerCase().includes(qLower) ||
        String(it.documento||'').toLowerCase().includes(qLower)
      );
    }
    
    if(opts?.canales && opts.canales.length > 0){
      facturas = facturas.filter(it => opts.canales.includes(it.canalVenta));
    }
    
    const totalNoDoc = facturas.reduce((s, it) => s + _num(it.deuda), 0);
    const totalCheques = facturas.reduce((s, it) => s + _num(it.chequesCartera), 0);
    const totalVencida = facturas.reduce((s, it) => {
      const dias = _num(it.diasSigned != null ? it.diasSigned : it.diasVenc);
      return dias > 0 ? s + _num(it.deuda) : s;
    }, 0);
    const totalPorVencer = totalNoDoc - totalVencida;
    
    const casosCriticos = facturas.filter(it => {
      const dias = _num(it.diasSigned != null ? it.diasSigned : it.diasVenc);
      return dias > 60;
    });
    
    const items = facturas.map(it => ({
      cliente: it.cliente,
      rut: _normRut_(it.rut),
      documento: it.documento,
      fechaFactura: it.fechaFacturaStr || _fmtDate_(it.fechaFactura),
      fechaVenc: it.fechaVencStr || _fmtDate_(it.fechaVenc),
      diasVenc: Math.abs(_num(it.diasSigned != null ? it.diasSigned : it.diasVenc)),
      diasSigned: _num(it.diasSigned != null ? it.diasSigned : it.diasVenc),
      deuda: _num(it.deuda),
      chequesCartera: _num(it.chequesCartera),
      canalVenta: it.canalVenta || '',
      estadoPago: it.estadoPago || ''
    }));
    
    items.sort((a, b) => {
      const dateA = a.fechaVenc || '9999-12-31';
      const dateB = b.fechaVenc || '9999-12-31';
      return dateA.localeCompare(dateB);
    });
    
    return {
      ok: true,
      items,
      kpis: {
        totalFacturas: items.length,
        totalNoDocumentado: totalNoDoc,
        totalCheques: totalCheques,
        totalDeuda: totalNoDoc + totalCheques,
        totalVencida,
        totalPorVencer,
        pctVencida: totalNoDoc > 0 ? (totalVencida / totalNoDoc * 100) : 0,
        casosCriticos: casosCriticos.length,
        totalCritico: casosCriticos.reduce((s,it) => s + _num(it.deuda), 0),
        clientesUnicos: new Set(facturas.map(it => _normRut_(it.rut) || it.cliente)).size
      }
    };
  }catch(err){
    return { ok:false, error:String(err) };
  }
}

// Compatibilidad
function apiFinanzasGetDeudaResumenConCredito(opts){ return apiDeudaGetResumen(opts); }
function apiFinanzasGetDeudaDetalleCliente(valor){ return apiDeudaGetDetalleCliente(valor); }
function apiCobranzaGetCalendarioConFiltroVendedor(opts){ 
  const userInfo = _getCurrentUserInfo_();
  if(userInfo.isVendedor && !userInfo.isAdmin){
    opts = opts || {};
    opts.canales = [userInfo.canal];
  }
  const result = apiDeudaGetCalendarioCobranza(opts);
  if(result.ok) result.userInfo = userInfo;
  return result;
}
function apiCobranzaGetUserInfo(){
  return { ok: true, userInfo: _getCurrentUserInfo_() };
}