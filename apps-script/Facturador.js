/***** ========================================================
 *  MÓDULO FACTURADOR — BACKEND (Google Apps Script)
 *  ====================================================== *****/

const FACT_CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: { NV_BASE: 'NV_Base', NV_LOG:  'NV_Log' },
  ESTADOS: { PENDIENTE:'PENDIENTE', APROBADO:'APROBADO', RECHAZADO:'RECHAZADO', FACTURADO:'FACTURADO' },
  // Tarjeta "TOTAL POR FACTURAR":
  // false = SOLO listas para facturar (APROBADO y SIN "requiere V°B°")
  // true  = TODAS las APROBADAS (con o sin "requiere V°B°")
  KPI_FLAGS: { incluirRequiereVBEnTotal: true }
};

/* ===== Helpers ===== */
function _f_getSheet(){ return SpreadsheetApp.openById(FACT_CONFIG.SPREADSHEET_ID); }
function _f_norm(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function _f_find(headers, names){
  const map={}; headers.forEach((h,i)=>map[_f_norm(h)]=i);
  for (const n of names){ const k=_f_norm(n); if(map[k]!==undefined) return map[k]; }
  return -1;
}
function _f_num(v){
  if(typeof v==='number') return v;
  const s=String(v||'').replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
  const num=parseFloat(s.replace(/[^\d.\-]/g,'')); return isNaN(num)?0:num;
}
function _f_CLP(n){ return Math.round(_f_num(n)); }

/* ===== Log ===== */
function _f_sheet(name){ const ss=_f_getSheet(); return ss.getSheetByName(name) || ss.insertSheet(name); }
function _f_log(accion, nv, detalle, estadoNuevo){
  try{
    const sh=_f_sheet(FACT_CONFIG.HOJAS.NV_LOG);
    if(sh.getLastRow()===0) sh.appendRow(['TS','Accion','NV','Usuario','Detalle','EstadoNuevo']);
    const usuario = Session.getActiveUser().getEmail() || 'N/A';
    sh.appendRow([new Date(), accion, String(nv||''), usuario, String(detalle||''), String(estadoNuevo||'')]);
  }catch(e){ console.error('NV_Log error', e); }
}

/* ===== Utilitarios ===== */
// Asegurar/crear columna por encabezado; retorna índice base 0
function _f_ensureCol(sh, headers, aliases, defaultHeader){
  let idx = _f_find(headers, aliases);
  if (idx > -1) return idx;
  const lastCol = headers.length;
  sh.insertColumnAfter(lastCol);
  sh.getRange(1, lastCol+1).setValue(defaultHeader);
  return lastCol;
}

// Parsear fecha desde string flexible (CL/ISO). Devuelve Date o null
function _f_parseFechaFlexible(s){
  if(!s) return null;
  const str = String(s).trim();

  // ISO rápido
  let d = new Date(str);
  if(!isNaN(d.getTime())) return d;

  // DD-MM-YYYY HH:MM o DD/MM/YYYY HH:MM
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if(m){
    const dd = parseInt(m[1],10), MM=parseInt(m[2],10), yyyy=parseInt(m[3],10);
    const hh = m[4]?parseInt(m[4],10):0, mm = m[5]?parseInt(m[5],10):0;
    d = new Date(yyyy, MM-1, dd, hh, mm, 0, 0);
    if(!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD HH:MM sin zona
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if(m){
    const yyyy=parseInt(m[1],10), MM=parseInt(m[2],10), dd=parseInt(m[3],10);
    const hh = m[4]?parseInt(m[4],10):0, mm = m[5]?parseInt(m[5],10):0;
    d = new Date(yyyy, MM-1, dd, hh, mm, 0, 0);
    if(!isNaN(d.getTime())) return d;
  }

  return null;
}

/* ===== Listados ===== */
function apiFactGetPendientesFacturar(filtros={}){
  try{
    const sh=_f_getSheet().getSheetByName(FACT_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false, error:'Hoja NV_Base no encontrada'};
    const data=sh.getDataRange().getValues(); if(data.length<2) return {ok:true, items:[]};
    const H=data[0];

    const cNV     = _f_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    if(cNV===-1) return {ok:false,error:'Columna Nota Venta no encontrada'};

    const cEstado = _f_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFecha  = _f_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cCli    = _f_find(H,['Nombre Cliente']);
    const cRUT    = _f_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cVend   = _f_find(H,['Ejecutivo','Vendedor']);
    const cTot    = _f_find(H,['Total','total']);
    const cVB     = _f_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);

    const map={}; // nv -> obj
    for(let i=1;i<data.length;i++){
      const row=data[i];
      const nv=String(row[cNV]||'').trim(); if(!nv) continue;

      const estado = cEstado>-1 ? String(row[cEstado]||FACT_CONFIG.ESTADOS.PENDIENTE).toUpperCase() : FACT_CONFIG.ESTADOS.PENDIENTE;
      const vbTxt  = cVB>-1 ? String(row[cVB]||'') : '';
      const requiereVB = /requiere/i.test(vbTxt);

      // Solo NV APROBADAS y SIN "requiere V°B°"
      if(estado!==FACT_CONFIG.ESTADOS.APROBADO) continue;
      if(requiereVB) continue;

      if(!map[nv]){
        const f=row[cFecha];
        const fStr=(f instanceof Date? f.toISOString().slice(0,10): String(f||'').slice(0,10));
        map[nv] = {
          numeroNV:nv,
          fecha:fStr,
          cliente:cCli>-1? String(row[cCli]||'') : '',
          rut:    cRUT>-1? String(row[cRUT]||'') : '',
          vendedor:cVend>-1? String(row[cVend]||'') : '',
          total:0,
          estado
        };
      }
      // SUMA por NV (usa "Total")
      const linea = (cTot>-1) ? _f_num(row[cTot]||0) : 0;
      if(linea>0) map[nv].total += linea;
    }
    const items=Object.values(map).sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
    return {ok:true, items};
  }catch(e){ console.error(e); return {ok:false, error:e.message}; }
}

function apiFactGetFacturadas(filtros={}){
  try{
    const sh=_f_getSheet().getSheetByName(FACT_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false, error:'Hoja NV_Base no encontrada'};
    const data=sh.getDataRange().getValues(); if(data.length<2) return {ok:true, items:[]};
    const H=data[0];

    const cNV    = _f_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cEstado= _f_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFecha = _f_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cCli   = _f_find(H,['Nombre Cliente']);
    const cRUT   = _f_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cVend  = _f_find(H,['Ejecutivo','Vendedor']);
    const cTot   = _f_find(H,['Total','total']);
    const cFact  = _f_find(H,['N° Factura','Nº Factura','No Factura','Numero Factura','Número Factura']);
    const cFechaFac = _f_find(H,['Fecha Facturación','Fecha de Factura','Fecha Factura']);

    const map={};
    for(let i=1;i<data.length;i++){
      const row=data[i];
      const estado = String(row[cEstado]||'').toUpperCase();
      if(estado!==FACT_CONFIG.ESTADOS.FACTURADO) continue;
      const nv=String(row[cNV]||'').trim(); if(!nv) continue;

      if(!map[nv]){
        const f=row[cFecha];
        const fStr=(f instanceof Date? f.toISOString().slice(0,10): String(f||'').slice(0,10));

        // Formatear fecha facturación amigable si existe
        let fFacStr = '';
        if (cFechaFac>-1 && row[cFechaFac]){
          const v = row[cFechaFac];
          const d = (v instanceof Date) ? v : new Date(v);
          fFacStr = isNaN(d.getTime()) ? String(v)
                 : (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
                    +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));
        }

        map[nv]={ numeroNV:nv, fecha:fStr,
          cliente:cCli>-1? String(row[cCli]||'') : '',
          rut:    cRUT>-1? String(row[cRUT]||'') : '',
          vendedor:cVend>-1? String(row[cVend]||'') : '',
          total:0, factura: cFact>-1? String(row[cFact]||'') : '',
          fechaFacturacion: fFacStr
        };
      }
      const linea = (cTot>-1)? _f_num(row[cTot]||0) : 0;
      if(linea>0) map[nv].total += linea;
      const fac = cFact>-1? String(row[cFact]||'') : '';
      if(fac) map[nv].factura = fac;
    }
    const items=Object.values(map).sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));
    return {ok:true, items};
  }catch(e){ console.error(e); return {ok:false, error:e.message}; }
}

/* ===== Detalle ===== */
function apiFactGetDetalleNV(numeroNV){
  try{
    const sh=_f_getSheet().getSheetByName(FACT_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false, error:'NV_Base no encontrada'};
    const data=sh.getDataRange().getValues(); if(data.length<2) return {ok:false, error:'Sin datos'};
    const H=data[0];

    const cNV   = _f_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']); if(cNV===-1) return {ok:false,error:'Col NV'};
    const cFecha= _f_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cCli  = _f_find(H,['Nombre Cliente']);
    const cRUT  = _f_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cCom  = _f_find(H,['Comuna']);
    const cCiu  = _f_find(H,['Ciudad']);
    const cVend = _f_find(H,['Ejecutivo','Vendedor']);
    const cPago = _f_find(H,['Forma de Pago','Condicion Pago','Condición Pago','Forma de Pago']);
    const cDespDesde = _f_find(H,['Despachar Desde']);
    const cDir  = _f_find(H,['Dirección Despacho','Direccion Despacho']);
    const cHor  = _f_find(H,['Horario Despacho']);
    const cObs  = _f_find(H,['Observaciones']);
    const cEstado=_f_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFact = _f_find(H,['N° Factura','Nº Factura','No Factura','Numero Factura','Número Factura']);
    const cFechaFac = _f_find(H,['Fecha Facturación','Fecha de Factura','Fecha Factura']);

    const cSKU  = _f_find(H,['Cód. Producto','Cod. Producto','Codigo Producto','Código Producto','SKU']);
    const cDesc = _f_find(H,['Descripción Producto','Descripcion Producto']);
    const cBxC  = _f_find(H,['Un x Caja','Un x caja','Unidades por caja']);
    const cCaj  = _f_find(H,['Cajas']);
    const cUni  = _f_find(H,['Unidades','unidades']);
    const cVB   = _f_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);

    const cNb   = _f_find(H,['Neto U Base','Neto Base']);
    const cBb   = _f_find(H,['Bruto U Base','Bruto Base']);
    const cNf   = _f_find(H,['Neto U Final','Neto Final']);
    const cBf   = _f_find(H,['Bruto U Final','Bruto Final']);

    const cDesL = _f_find(H,['Descuento Línea','Descuento Linea','Descto']);
    const cNet  = _f_find(H,['Neto','neto']);
    const cIVA  = _f_find(H,['IVA','iva']);
    const cILA  = _f_find(H,['ILA','ila']);
    const cLog  = _f_find(H,['Costo Logístico','Costo Logistico','costo logistico']);
    const cTot  = _f_find(H,['Total','total']);

    let info=null; const items=[];
    for(let i=1;i<data.length;i++){
      const row=data[i]; if(String(row[cNV])!==String(numeroNV)) continue;

      if(!info){
        const f=row[cFecha]; 
        const fStr=(f instanceof Date? f.toISOString().slice(0,10): String(f||'').slice(0,10));

        // Fecha Facturación
        let fFacStr = '';
        if (cFechaFac>-1 && row[cFechaFac]){
          const v = row[cFechaFac];
          const d = (v instanceof Date) ? v : new Date(v);
          fFacStr = isNaN(d.getTime()) ? String(v)
                : (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
                  +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));
        }

        info = {
          numeroNV:String(numeroNV), fecha:fStr,
          cliente:{ nombre:String(row[cCli]||''), rut:String(row[cRUT]||''), comuna:String(row[cCom]||''), ciudad:String(row[cCiu]||'') },
          vendedor:String(row[cVend]||''), formaPago:String(row[cPago]||''),
          despacho:{ desde:String(row[cDespDesde]||''), direccion:String(row[cDir]||''), horario:String(row[cHor]||'') },
          observaciones:String(row[cObs]||''),
          estado:String(row[cEstado]||FACT_CONFIG.ESTADOS.PENDIENTE),
          numeroFactura: cFact>-1 ? String(row[cFact]||'') : '',
          fechaFacturacion: fFacStr
        };
      }

      items.push({
        sku:String(row[cSKU]||''),
        nombre:String(row[cDesc]||''),
        bxc:_f_num(row[cBxC]||0),
        cajas:_f_num(row[cCaj]||0),
        unidades:_f_num(row[cUni]||0),
        vbFinanciero:String(row[cVB]||''),
        precios:{
          netoBase:_f_num(row[cNb]||0),
          brutoBase:_f_num(row[cBb]||0),
          netoFinal:_f_num(row[cNf]||0),
          brutoFinal:_f_num(row[cBf]||0)
        },
        totales:{
          descuento:_f_num(row[cDesL]||0),
          neto:_f_num(row[cNet]||0),
          iva:_f_num(row[cIVA]||0),
          ila:_f_num(row[cILA]||0),
          logistico:_f_num(row[cLog]||0),
          total:_f_num(row[cTot]||0)
        }
      });
    }

    if(!info) return {ok:false, error:'NV no encontrada'};
    const tot = items.reduce((a,it)=>({
      neto:a.neto+it.totales.neto,
      descuento:a.descuento+it.totales.descuento,
      iva:a.iva+it.totales.iva,
      ila:a.ila+it.totales.ila,
      logistico:a.logistico+it.totales.logistico,
      total:a.total+it.totales.total,
      cajas:a.cajas+it.cajas,
      unidades:a.unidades+it.unidades
    }),{neto:0,descuento:0,iva:0,ila:0,logistico:0,total:0,cajas:0,unidades:0});

    return {ok:true, detalle:{...info, items, totales:tot}};
  }catch(e){ console.error(e); return {ok:false, error:e.message}; }
}

/* ===== Acciones =====
   apiFacturar ahora acepta: (numeroNV, numeroFactura, usuario, fechaFacturacionStr OPCIONAL)
*/
function apiFacturar(numeroNV, numeroFactura, usuario, fechaFacturacionStr){
  try{
    if(!numeroNV) return {ok:false, error:'NV inválida'};
    if(!numeroFactura) return {ok:false, error:'N° de factura es obligatorio'};

    const sh=_f_getSheet().getSheetByName(FACT_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false,error:'Hoja NV_Base no encontrada'};
    const data=sh.getDataRange().getValues(); const H=data[0];

    const cNV     = _f_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cEstado = _f_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFact   = _f_find(H,['N° Factura','Nº Factura','No Factura','Numero Factura','Número Factura']);
    if(cNV===-1||cEstado===-1||cFact===-1) return {ok:false,error:'Columnas obligatorias faltantes'};

    // Asegurar columna "Fecha Facturación"
    const colFechaFactIdx = _f_ensureCol(
      sh, H,
      ['Fecha Facturación','Fecha de Factura','Fecha Factura'],
      'Fecha Facturación'
    );

    // Parsear fecha ingresada; si no hay/ inválida, usar ahora
    let fechaGuardar = _f_parseFechaFlexible(fechaFacturacionStr) || new Date();

    let found=false, alreadyFact=false, estadoActual='';
    for(let r=1;r<data.length;r++){
      if(String(data[r][cNV])===String(numeroNV)){
        found=true;
        estadoActual = String(data[r][cEstado]||'');
        if(estadoActual===FACT_CONFIG.ESTADOS.FACTURADO){ alreadyFact=true; break; }
      }
    }
    if(!found) return {ok:false, error:'NV no encontrada'};
    if(alreadyFact) return {ok:false, error:'NV ya está FACTURADO'};
    if(estadoActual!==FACT_CONFIG.ESTADOS.APROBADO) return {ok:false, error:'Solo puede facturarse una NV APROBADA'};

    for(let r=1;r<data.length;r++){
      if(String(data[r][cNV])===String(numeroNV)){
        sh.getRange(r+1, cEstado+1).setValue(FACT_CONFIG.ESTADOS.FACTURADO);
        sh.getRange(r+1, cFact+1).setValue(String(numeroFactura));
        sh.getRange(r+1, colFechaFactIdx+1).setValue(fechaGuardar); // <- guarda fecha
      }
    }

    _f_log('FACTURAR', numeroNV, `Facturado por: ${usuario||'N/A'} • Factura ${numeroFactura} • Fecha ${fechaGuardar}`, FACT_CONFIG.ESTADOS.FACTURADO);
    return {ok:true, message:`Nota de Venta ${numeroNV} facturada`};
  }catch(e){ return {ok:false, error:e.message}; }
}

function apiFactSolicitarModificacion(numeroNV, usuario, motivo){
  try{
    if(!numeroNV) return {ok:false, error:'NV inválida'};
    if(!motivo || !motivo.trim()) return {ok:false, error:'Motivo obligatorio'};

    const sh=_f_getSheet().getSheetByName(FACT_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false,error:'Hoja NV_Base no encontrada'};
    const data=sh.getDataRange().getValues(); const H=data[0];

    const cNV    = _f_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cEstado= _f_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cObs   = _f_find(H,['Observaciones']);
    if(cNV===-1||cEstado===-1) return {ok:false,error:'Columnas obligatorias faltantes'};

    let found=false, isFact=false;
    for(let r=1;r<data.length;r++){
      if(String(data[r][cNV])===String(numeroNV)){
        found=true;
        const curr=String(data[r][cEstado]||'');
        if(curr===FACT_CONFIG.ESTADOS.FACTURADO){ isFact=true; break; }
      }
    }
    if(!found) return {ok:false, error:'NV no encontrada'};
    if(isFact) return {ok:false, error:'NV ya FACTURADO — no se puede solicitar modificación'};

    const ts = new Date().toISOString().slice(0,19).replace('T',' ');
    const nota = `FACT solicita modificación (${ts}) — ${usuario||'N/A'}: ${motivo}`;

    for(let r=1;r<data.length;r++){
      if(String(data[r][cNV])===String(numeroNV)){
        sh.getRange(r+1, cEstado+1).setValue(FACT_CONFIG.ESTADOS.PENDIENTE);
        if(cObs>-1){
          const prev = String(data[r][cObs]||'');
          sh.getRange(r+1, cObs+1).setValue(prev ? prev + ' | ' + nota : nota);
        }
      }
    }
    _f_log('SOL_MODIF', numeroNV, nota, FACT_CONFIG.ESTADOS.PENDIENTE);
    return {ok:true, message:'Solicitud enviada al Aprobador'};
  }catch(e){ return {ok:false, error:e.message}; }
}

/* ===== Utilitarios ===== */
function apiFactWhoAmI(){ 
  try{ return {ok:true, email: Session.getActiveUser().getEmail()||''}; }catch(e){ return {ok:true, email:''}; }
}

/* ===== KPIs Facturador (solo lectura) ===== */
function apiFactGetKPIs(){
  try{
    const sh = _f_getSheet().getSheetByName(FACT_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data = sh.getDataRange().getValues();
    if(data.length < 2){
      return { ok:true, kpis:{
        pendientes:0, facturadasMes:0,
        totalPorFacturar:0, totalFacturadoMes:0,
        ticketPendiente:0, ticketFacturadoMes:0
      }};
    }

    const H = data[0];
    const cNV     = _f_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cEstado = _f_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFecha  = _f_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cVB     = _f_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    const cTotal  = _f_find(H,['Total','total']);

    if(cNV===-1 || cEstado===-1){ return { ok:false, error:'Faltan columnas básicas (NV / Estado)' }; }

    const today  = new Date();
    const y      = today.getFullYear();
    const m      = today.getMonth();
    const startM = new Date(y, m, 1);
    const endM   = new Date(y, m+1, 1);

    const listoNV   = new Map(); // APROBADO y SIN requiere
    const aprobadoNV= new Map(); // APROBADO (incluye requiere/no requiere)
    const factMesNV = new Map(); // FACTURADO del mes

    for(let i=1;i<data.length;i++){
      const row = data[i];
      const nv  = String(row[cNV]||'').trim(); if(!nv) continue;

      const estado = String(row[cEstado]||'').toUpperCase();
      let f=null;
      if(cFecha>-1){
        f = (row[cFecha] instanceof Date) ? row[cFecha] : (row[cFecha]? new Date(row[cFecha]) : null);
      }
      const inMonth = !!(f && f>=startM && f<endM);

      const vbTxt = (cVB>-1)? String(row[cVB]||'').toLowerCase() : '';
      const requiereVB = /requiere/.test(vbTxt);

      const lineaTotal = (cTotal>-1) ? _f_num(row[cTotal]||0) : 0;
      if(lineaTotal<=0) continue;

      if(estado === FACT_CONFIG.ESTADOS.APROBADO){
        aprobadoNV.set(nv, (aprobadoNV.get(nv)||0) + lineaTotal);
        if(!requiereVB) listoNV.set(nv, (listoNV.get(nv)||0) + lineaTotal);
      }

      if(estado === FACT_CONFIG.ESTADOS.FACTURADO && inMonth){
        factMesNV.set(nv, (factMesNV.get(nv)||0) + lineaTotal);
      }
    }

    const pendientes = listoNV.size;
    const facturadasMes = factMesNV.size;

    const totalListo = Math.round([...listoNV.values()].reduce((a,b)=>a+b,0));
    const totalAprob = Math.round([...aprobadoNV.values()].reduce((a,b)=>a+b,0));
    const totalFacturadoMes = Math.round([...factMesNV.values()].reduce((a,b)=>a+b,0));

    const totalPorFacturar = FACT_CONFIG.KPI_FLAGS.incluirRequiereVBEnTotal ? totalAprob : totalListo;

    const ticketPendiente = pendientes ? Math.round(totalListo/pendientes) : 0;
    const ticketFacturadoMes = facturadasMes ? Math.round(totalFacturadoMes/facturadasMes) : 0;

    return { ok:true, kpis:{
      pendientes, facturadasMes,
      totalPorFacturar, totalFacturadoMes,
      ticketPendiente, ticketFacturadoMes,
      _totalAprobadoIncluyeVB: totalAprob,
      _totalListoSinVB: totalListo
    }};
  }catch(e){
    return { ok:false, error: e.message };
  }
}


