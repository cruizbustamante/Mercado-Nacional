/***** ========================================================
 *  MÓDULO FINANZAS — BACKEND (Google Apps Script)
 *  ====================================================== *****/

const FINZ_CONFIG = {
  SPREADSHEET_ID: '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: { NV_BASE: 'NV_Base', NV_LOG: 'NV_Log', DEUDA: 'Deuda Clientes' },
  VB_VALORES: { OK:'OK', REQUIERE:'REQUIERE V°B°' },
  ESTADOS: { PENDIENTE:'PENDIENTE', APROBADO:'APROBADO', RECHAZADO:'RECHAZADO', FACTURADO:'FACTURADO' }
};

/* ===== Helpers ===== */
function _fz_ss(){ return SpreadsheetApp.openById(FINZ_CONFIG.SPREADSHEET_ID); }
function _fz_sheet(name){ const ss=_fz_ss(); return ss.getSheetByName(name) || ss.insertSheet(name); }
function _fz_norm(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function _fz_rutNorm(r){ return String(r||'').replace(/\./g,'').replace(/-/g,'').toLowerCase().trim(); }
function _fz_find(headers, names){
  const map={}; headers.forEach((h,i)=>map[_fz_norm(h)]=i);
  for(const n of names){ const k=_fz_norm(n); if(map[k]!==undefined) return map[k]; }
  return -1;
}
function _fz_num(v){
  if(typeof v==='number') return v;
  const s=String(v||'').replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
  const num=parseFloat(s.replace(/[^\d.\-]/g,'')); return isNaN(num)?0:num;
}
function _fz_abs(v){ return Math.abs(_fz_num(v)); }
function _fz_log(accion, nv, detalle, estadoNuevo){
  try{
    const sh=_fz_sheet(FINZ_CONFIG.HOJAS.NV_LOG);
    if(sh.getLastRow()===0) sh.appendRow(['TS','Accion','NV','Usuario','Detalle','EstadoNuevo']);
    const usuario = Session.getActiveUser().getEmail() || 'N/A';
    sh.appendRow([new Date(), accion, String(nv||''), usuario, String(detalle||''), String(estadoNuevo||'')]);
  }catch(e){ console.error('NV_Log error', e); }
}
function _fz_userOk(){ return true; }

/* ===== Fechas / Períodos ===== */
function _fz_date(v){
  if (v instanceof Date) return v;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function _fz_inRange(d, start, end){ return (d && d >= start && d < end); }

/** Recibe {codigo} o string y devuelve {start,end,compStart,compEnd,label} */
function _fz_periodo(periodo){
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();

  const code = typeof periodo === 'object' && periodo && periodo.codigo ? periodo.codigo : (periodo || 'mes_actual');

  const startMesActual = new Date(y, m, 1),     endMesActual = new Date(y, m+1, 1);
  const startMesAnt    = new Date(y, m-1, 1),   endMesAnt    = new Date(y, m, 1);
  const startYTD       = new Date(y, 0, 1),     endYTD       = new Date(y+1, 0, 1);
  const startYTDprev   = new Date(y-1, 0, 1),   endYTDprev   = new Date(y, 0, 1);
  const start3m        = new Date(y, m-2, 1),   end3m        = new Date(y, m+1, 1);
  const start3mPrev    = new Date(y, m-5, 1),   end3mPrev    = new Date(y, m-2, 1);

  switch(code){
    case 'mes_anterior':
      return { start:startMesAnt, end:endMesAnt, compStart:new Date(y, m-2, 1), compEnd:startMesAnt, label:'Mes anterior' };
    case 'ult_3m':
      return { start:start3m, end:end3m, compStart:start3mPrev, compEnd:end3mPrev, label:'Últimos 3 meses' };
    case 'anio_actual':
      return { start:startYTD, end:endYTD, compStart:startYTDprev, compEnd:endYTDprev, label:'Año actual (YTD)' };
    case 'mes_actual':
    default:
      return { start:startMesActual, end:endMesActual, compStart:startMesAnt, compEnd:endMesAnt, label:'Este mes' };
  }
}

/* ===== QUIÉN SOY ===== */
function apiFinanzasWhoAmI(){
  try{ return { ok:true, email: Session.getActiveUser().getEmail()||'' }; }
  catch(e){ return { ok:true, email:'' }; }
}

/* ===== LISTADOS (V°B° y Facturadas) ===== */
function apiFinanzasGetRequierenVB(periodo){
  try{
    if(!_fz_userOk()) return { ok:false, error:'NO_AUTH' };
    const {start, end} = _fz_periodo(periodo);

    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data = sh.getDataRange().getValues(); if(data.length<2) return { ok:true, items:[] };
    const H = data[0];

    const cNV=_fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cCli=_fz_find(H,['Nombre Cliente']);
    const cRut=_fz_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cEje=_fz_find(H,['Ejecutivo','Vendedor']);
    const cFec=_fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cTot=_fz_find(H,['Total']);
    const cVB =_fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    const cEst=_fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    if(cNV===-1 || cVB===-1) return { ok:false, error:'Faltan columnas de NV o V°B°' };

    const map = {};
    for(let i=1;i<data.length;i++){
      const r = data[i];
      const nv = String(r[cNV]||''); if(!nv) continue;

      const f=_fz_date(r[cFec]); if(!_fz_inRange(f,start,end)) continue;

      if(!map[nv]){
        const fStr=f ? f.toISOString().slice(0,10) : String(r[cFec]||'').slice(0,10);
        map[nv] = {
          numeroNV:nv,
          cliente:cCli>-1? String(r[cCli]||'') : '',
          rut:    cRut>-1? String(r[cRut]||'') : '',
          vendedor:cEje>-1? String(r[cEje]||'') : '',
          fecha:fStr, total:0, anyRequiere:false,
          estado: cEst>-1 ? String(r[cEst]||'') : ''
        };
      }
      map[nv].total += _fz_num(cTot>-1? r[cTot]||0 : 0);

      const vb = String(cVB>-1 ? r[cVB]||'' : '');
      if(/requiere/i.test(vb)) map[nv].anyRequiere = true;
      if(cEst>-1) map[nv].estado = String(r[cEst]||'');
    }

    const items = Object.values(map)
      .filter(x => x.anyRequiere && !/^FACTURADO$/i.test(x.estado))
      .sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));

    return { ok:true, items };
  }catch(e){ return { ok:false, error: e.message }; }
}

function apiFinanzasGetPendientesConVB(periodo){
  try{
    if(!_fz_userOk()) return { ok:false, error:'NO_AUTH' };
    const {start, end} = _fz_periodo(periodo);

    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data = sh.getDataRange().getValues(); if(data.length<2) return { ok:true, items:[] };
    const H = data[0];

    const cNV=_fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cCli=_fz_find(H,['Nombre Cliente']);
    const cRut=_fz_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cEje=_fz_find(H,['Ejecutivo','Vendedor']);
    const cFec=_fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cTot=_fz_find(H,['Total']);
    const cVB =_fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    const cEst=_fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    if(cNV===-1 || cEst===-1) return { ok:false, error:'Faltan columnas de NV o Estado' };

    const map = {};
    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nv=String(r[cNV]||''); if(!nv) continue;

      const f=_fz_date(r[cFec]); if(!_fz_inRange(f,start,end)) continue;

      if(!map[nv]){
        const fStr=f ? f.toISOString().slice(0,10) : String(r[cFec]||'').slice(0,10);
        map[nv] = {
          numeroNV:nv,
          cliente:cCli>-1? String(r[cCli]||'') : '',
          rut:    cRut>-1? String(r[cRut]||'') : '',
          vendedor:cEje>-1? String(r[cEje]||'') : '',
          fecha:fStr, total:0,
          estado: cEst>-1 ? String(r[cEst]||'') : '',
          anyRequiere:false
        };
      }
      map[nv].total += _fz_num(cTot>-1? r[cTot]||0 : 0);

      const vb = cVB>-1 ? String(r[cVB]||'') : '';
      if(/requiere/i.test(vb)) map[nv].anyRequiere = true;
      if(cEst>-1) map[nv].estado = String(r[cEst]||'');
    }

    const items = Object.values(map)
      .filter(x => x.estado===FINZ_CONFIG.ESTADOS.PENDIENTE && !x.anyRequiere)
      .sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));

    return { ok:true, items };
  }catch(e){ return { ok:false, error: e.message }; }
}

function apiFinanzasGetFacturadas(periodo){
  try{
    if(!_fz_userOk()) return { ok:false, error:'NO_AUTH' };
    const {start, end} = _fz_periodo(periodo);

    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data = sh.getDataRange().getValues(); if(data.length<2) return { ok:true, items:[] };
    const H = data[0];

    const cNV=_fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cCli=_fz_find(H,['Nombre Cliente']);
    const cRut=_fz_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cEje=_fz_find(H,['Ejecutivo','Vendedor']);
    const cFec=_fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cTot=_fz_find(H,['Total']);
    const cEst=_fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFac=_fz_find(H,['N° Factura','Nº Factura','No Factura','Numero Factura','Número Factura']);
    if(cNV===-1 || cEst===-1) return { ok:false, error:'Faltan columnas de NV o Estado' };

    const map = {};
    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nv=String(r[cNV]||''); if(!nv) continue;
      const estado = String(r[cEst]||'').toUpperCase();
      if(estado !== FINZ_CONFIG.ESTADOS.FACTURADO) continue;

      const f=_fz_date(r[cFec]); if(!_fz_inRange(f,start,end)) continue;

      if(!map[nv]){
        const fStr=f ? f.toISOString().slice(0,10) : String(r[cFec]||'').slice(0,10);
        map[nv] = {
          numeroNV:nv, fecha:fStr,
          cliente:cCli>-1? String(r[cCli]||'') : '',
          rut:    cRut>-1? String(r[cRut]||'') : '',
          vendedor:cEje>-1? String(r[cEje]||'') : '',
          total:0,
          factura:cFac>-1? String(r[cFac]||'') : ''
        };
      }
      map[nv].total += _fz_num(cTot>-1? r[cTot]||0 : 0);
      const fac = cFac>-1? String(r[cFac]||'') : '';
      if(fac) map[nv].factura = fac;
    }

    const items = Object.values(map).sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));
    return { ok:true, items };
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ===== ÓRDENES ===== */
function apiFinanzasGetOrdenes(){
  try{
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'NV_Base no encontrada' };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { ok:true, items:[] };
    const H=data[0];

    const cNV=_fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cCli=_fz_find(H,['Nombre Cliente']);
    const cVend=_fz_find(H,['Ejecutivo','Vendedor']);
    const cFec=_fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cEst=_fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cTot=_fz_find(H,['Total']);
    if(cNV===-1) return { ok:false, error:'Falta columna NV' };

    const map={};
    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nv=String(r[cNV]||''); if(!nv) continue;
      if(!map[nv]){
        const f=r[cFec]; const fStr=(f instanceof Date? f.toISOString().slice(0,10): String(f||'').slice(0,10));
        map[nv]={ numeroNV:nv, cliente:cCli>-1?String(r[cCli]||''):'', vendedor:cVend>-1?String(r[cVend]||''):'', fecha:fStr, estado:cEst>-1?String(r[cEst]||''):'', total:0 };
      }
      map[nv].total += _fz_num(cTot>-1? r[cTot]||0 : 0);
      if(cEst>-1) map[nv].estado = String(r[cEst]||'');
    }
    const items = Object.values(map).sort((a,b)=> new Date(b.fecha)-new Date(a.fecha));
    return { ok:true, items };
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ===== DETALLE NV ===== */
function apiFinanzasGetDetalleNV(numeroNV){
  try{
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false, error:'NV_Base no encontrada'};
    const data=sh.getDataRange().getValues(); if(data.length<2) return {ok:false, error:'Sin datos'};
    const H=data[0];

    const cNV   = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']); if(cNV===-1) return {ok:false,error:'Columna NV'}; 
    const cFecha= _fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cCli  = _fz_find(H,['Nombre Cliente']);
    const cRUT  = _fz_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cCom  = _fz_find(H,['Comuna']);
    const cCiu  = _fz_find(H,['Ciudad']);
    const cVend = _fz_find(H,['Ejecutivo','Vendedor']);
    const cPago = _fz_find(H,['Forma de Pago','Condicion Pago','Condición Pago']);
    const cDespDesde = _fz_find(H,['Despachar Desde']);
    const cDir  = _fz_find(H,['Dirección Despacho','Direccion Despacho']);
    const cHor  = _fz_find(H,['Horario Despacho']);
    const cObs  = _fz_find(H,['Observaciones']);
    const cEstado=_fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cFact = _fz_find(H,['N° Factura','Nº Factura','No Factura','Numero Factura','Número Factura']);

    const cSKU  = _fz_find(H,['Cód. Producto','Cod. Producto','Codigo Producto','Código Producto']);
    const cDesc = _fz_find(H,['Descripción Producto','Descripcion Producto']);
    const cBxC  = _fz_find(H,['Un x Caja','Un x caja','Unidades por caja']);
    const cCaj  = _fz_find(H,['Cajas']);
    const cUni  = _fz_find(H,['Unidades','unidades']);
    const cVB   = _fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);

    const cNb   = _fz_find(H,['Neto U Base','Neto Base']);
    const cBb   = _fz_find(H,['Bruto U Base','Bruto Base']);
    const cNf   = _fz_find(H,['Neto U Final','Neto Final']);
    const cBf   = _fz_find(H,['Bruto U Final','Bruto Final']);

    const cDesL = _fz_find(H,['Descuento Línea','Descuento Linea','Descto']);
    const cNet  = _fz_find(H,['Neto','neto']);
    const cIVA  = _fz_find(H,['IVA','iva']);
    const cILA  = _fz_find(H,['ILA','ila']);
    const cLog  = _fz_find(H,['Costo Logístico','Costo Logistico','costo logistico']);
    const cTot  = _fz_find(H,['Total','total']);

    let info=null; const items=[];
    for(let i=1;i<data.length;i++){
      const row=data[i]; if(String(row[cNV])!==String(numeroNV)) continue;

      if(!info){
        const f=row[cFecha]; const fStr=(f instanceof Date? f.toISOString().slice(0,10): String(f||'').slice(0,10));
        info = {
          numeroNV:String(numeroNV), fecha:fStr,
          cliente:{ nombre:String(row[cCli]||''), rut:String(row[cRUT]||''), comuna:String(row[cCom]||''), ciudad:String(row[cCiu]||'') },
          vendedor:String(row[cVend]||''), formaPago:String(row[cPago]||''),
          despacho:{ desde:String(row[cDespDesde]||''), direccion:String(row[cDir]||''), horario:String(row[cHor]||'') },
          observaciones:String(row[cObs]||''),
          estado:String(row[cEstado]||FINZ_CONFIG.ESTADOS.PENDIENTE),
          numeroFactura: cFact>-1 ? String(row[cFact]||'') : ''
        };
      }

      items.push({
        sku:String(row[cSKU]||''), nombre:String(row[cDesc]||''),
        bxc:_fz_num(row[cBxC]||0), cajas:_fz_num(row[cCaj]||0), unidades:_fz_num(row[cUni]||0),
        vbFinanciero:String(row[cVB]||''),
        precios:{ netoBase:_fz_num(row[cNb]||0), brutoBase:_fz_num(row[cBb]||0), netoFinal:_fz_num(row[cNf]||0), brutoFinal:_fz_num(row[cBf]||0) },
        totales:{ descuento:_fz_num(row[cDesL]||0), neto:_fz_num(row[cNet]||0), iva:_fz_num(row[cIVA]||0), ila:_fz_num(row[cILA]||0), logistico:_fz_num(row[cLog]||0), total:_fz_num(row[cTot]||0) }
      });
    }

    if(!info) return {ok:false, error:'NV no encontrada'};
    const tot = items.reduce((a,it)=>({
      neto:a.neto+it.totales.neto, descuento:a.descuento+it.totales.descuento,
      iva:a.iva+it.totales.iva, ila:a.ila+it.totales.ila, logistico:a.logistico+it.totales.logistico,
      total:a.total+it.totales.total, cajas:a.cajas+it.cajas, unidades:a.unidades+it.unidades
    }),{neto:0,descuento:0,iva:0,ila:0,logistico:0,total:0,cajas:0,unidades:0});

    return {ok:true, detalle:{...info, items, totales:tot}};
  }catch(e){ return {ok:false, error:e.message}; }
}

/* ===== ACCIONES V°B° ===== */
function apiFinanzasOtorgarVB(numeroNV){
  try{
    if(!numeroNV) return { ok:false, error:'NV inválida' };
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data=sh.getDataRange().getValues(); const H=data[0];

    const cNV = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cVB = _fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    if(cNV===-1 || cVB===-1) return { ok:false, error:'Faltan columnas NV/VB' };

    let found=false;
    for(let r=1;r<data.length;r++){
      if(String(data[r][cNV])===String(numeroNV)){
        found=true;
        _fz_sheet(FINZ_CONFIG.HOJAS.NV_BASE).getRange(r+1, cVB+1).setValue(FINZ_CONFIG.VB_VALORES.OK);
      }
    }
    if(!found) return { ok:false, error:'NV no encontrada' };
    _fz_log('FINZ_OTORGAR_VB', numeroNV, 'V°B° OK', '');
    return { ok:true, message:'V°B° otorgado' };
  }catch(e){ return { ok:false, error:e.message }; }
}
function apiFinanzasRevocarVB(numeroNV){
  try{
    if(!numeroNV) return { ok:false, error:'NV inválida' };
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data=sh.getDataRange().getValues(); const H=data[0];

    const cNV = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cVB = _fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    if(cNV===-1 || cVB===-1) return { ok:false, error:'Faltan columnas NV/VB' };

    let found=false;
    for(let r=1;r<data.length;r++){
      if(String(data[r][cNV])===String(numeroNV)){
        found=true;
        _fz_sheet(FINZ_CONFIG.HOJAS.NV_BASE).getRange(r+1, cVB+1).setValue(FINZ_CONFIG.VB_VALORES.REQUIERE);
      }
    }
    if(!found) return { ok:false, error:'NV no encontrada' };
    _fz_log('FINZ_REVOCAR_VB', numeroNV, 'V°B° REQUERIDO', '');
    return { ok:true, message:'V°B° revocado' };
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ===== KPIs (con período + variaciones + YTD real) ===== */
function apiFinanzasGetKPIs(periodo){
  try{
    const {start, end, compStart, compEnd} = _fz_periodo(periodo);

    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { ok:true, kpis:{} };
    const H=data[0];

    const cNV   = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cFec  = _fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cNeto = _fz_find(H,['Neto','neto']);
    const cEst  = _fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cCaj  = _fz_find(H,['Cajas','CAJAS']);
    const cVB   = _fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    if(cNV===-1) return { ok:false, error:'Falta columna NV' };

    const mkAcc = ()=>({ nvSet:new Set(), factSet:new Set(), reqVB:new Set(), vbOK:new Set(), neto:0, cajas:0 });
    const cur = mkAcc();
    const cmp = mkAcc();

    const today=new Date(), Y=today.getFullYear();
    const ytdStart=new Date(Y,0,1), ytdEnd=new Date(Y+1,0,1);
    const prevYtdStart=new Date(Y-1,0,1), prevYtdEnd=new Date(Y,0,1);
    const ytd = mkAcc(); const cmpYtd = mkAcc();

    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nv = String(r[cNV]||''); if(!nv) continue;
      const f = _fz_date(cFec>-1 ? r[cFec] : null);
      const est = cEst>-1 ? String(r[cEst]||'').toUpperCase() : '';
      const neto = (cNeto>-1) ? _fz_num(r[cNeto]||0) : 0;
      const cajas = (cCaj>-1) ? _fz_num(r[cCaj]||0) : 0;
      const vb    = cVB>-1 ? String(r[cVB]||'') : '';

      if(_fz_inRange(f,start,end)){
        if(est === FINZ_CONFIG.ESTADOS.FACTURADO){
          cur.neto += neto; cur.nvSet.add(nv); cur.factSet.add(nv); cur.cajas += cajas;
        }
        if(/requiere/i.test(vb) && est!==FINZ_CONFIG.ESTADOS.FACTURADO) cur.reqVB.add(nv);
        if(!/requiere/i.test(vb) && (est===FINZ_CONFIG.ESTADOS.PENDIENTE || est===FINZ_CONFIG.ESTADOS.APROBADO)) cur.vbOK.add(nv);
      }
      if(_fz_inRange(f,compStart,compEnd) && est === FINZ_CONFIG.ESTADOS.FACTURADO){
        cmp.neto += neto; cmp.nvSet.add(nv); cmp.factSet.add(nv); cmp.cajas += cajas;
      }
      if(_fz_inRange(f,ytdStart,ytdEnd) && est === FINZ_CONFIG.ESTADOS.FACTURADO){
        ytd.neto += neto; ytd.cajas += cajas; ytd.nvSet.add(nv); ytd.factSet.add(nv);
      }
      if(_fz_inRange(f,prevYtdStart,prevYtdEnd) && est === FINZ_CONFIG.ESTADOS.FACTURADO){
        cmpYtd.neto += neto; cmpYtd.cajas += cajas; cmpYtd.nvSet.add(nv); cmpYtd.factSet.add(nv);
      }
    }

    const netoMes  = Math.round(cur.neto);
    const cajasMes = Math.round(cur.cajas);
    const netoAnio = Math.round(ytd.neto);
    const cajasAnio= Math.round(ytd.cajas);

    const facturasMes = cur.factSet.size;
    const nvMes = cur.nvSet.size;
    const requierenVB = cur.reqVB.size;
    const vbOtorgadosMes = cur.vbOK.size;
    const ticketPromedioMes = nvMes ? Math.round(netoMes / nvMes) : 0;

    const variacionMesPct  = (cmp.neto>0) ? Math.round(((cur.neto-cmp.neto)/cmp.neto)*1000)/10 : null;
    const variacionAnioPct = (cmpYtd.neto>0) ? Math.round(((ytd.neto-cmpYtd.neto)/cmpYtd.neto)*1000)/10 : null;

    return { ok:true, kpis:{
      netoMes, netoAnio,
      facturasMes, nvMes, requierenVB, vbOtorgadosMes, ticketPromedioMes,
      cajasMes, cajasAnio,
      netoMesPrevio: Math.round(cmp.neto),
      netoAnioPrevio: Math.round(cmpYtd.neto),
      variacionMesPct, variacionAnioPct
    }};
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ===== KPIs AVANZADOS (ampliados) ===== */
function apiFinanzasGetKPIsAvanzados(){
  try{
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { ok:true, kpis:{} };
    const H=data[0];

    const cNV   = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cFec  = _fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cNeto = _fz_find(H,['Neto','neto']);
    const cEst  = _fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cVend = _fz_find(H,['Ejecutivo','Vendedor','VENDEDOR']);
    const cCli  = _fz_find(H,['Nombre Cliente','NOMBRE CLIENTE','Cliente']);
    const cRut  = _fz_find(H,['RUT CLIENTE','RUT Cliente','RUT','Rut Cliente']);
    const cBrutoBase = _fz_find(H,['Bruto U Base','Bruto Base','BRUTO U BASE']);
    const cNetoFinal = _fz_find(H,['Neto U Final','Neto Final','NETO U FINAL']);
    const cDescuento = _fz_find(H,['Descuento Línea','Descuento Linea','Descto','DESCUENTO LÍNEA']);
    const cIVA  = _fz_find(H,['IVA','iva']);
    const cCaj  = _fz_find(H,['Cajas','CAJAS']);
    const cUni  = _fz_find(H,['Unidades','unidades','UNIDADES']);
    const cCat  = _fz_find(H,['Categoria','Categoría','CATEGORIA','CATEGORÍA']);
    
    if(cNV===-1) return { ok:false, error:'Falta columna NV' };

    const today=new Date(), y=today.getFullYear(), m=today.getMonth();
    const startM=new Date(y,m,1), endM=new Date(y,m+1,1);
    const startPrevM=new Date(y,m-1,1), endPrevM=new Date(y,m,1);

    const nvMesActual = new Map();
    const nvMesAnterior = new Map();
    const vendedorStats = new Map();
    const clienteStats = new Map();
    const conversionData = new Map();
    const catStats = new Map();

    let totalDescuentos = 0, totalIVA = 0, totalMargenBruto = 0, totalCajas = 0, totalUnidades = 0;

    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nv = String(r[cNV]||''); if(!nv) continue;

      const f = cFec>-1 ? (r[cFec] instanceof Date ? r[cFec] : (r[cFec] ? new Date(r[cFec]) : null)) : null;
      const neto = (cNeto>-1) ? _fz_num(r[cNeto]||0) : 0;
      const est = cEst>-1 ? String(r[cEst]||'').toUpperCase() : '';
      const vend = cVend>-1 ? String(r[cVend]||'').trim() : '';
      const cliente = cCli>-1 ? String(r[cCli]||'').trim() : '';
      const rut = cRut>-1 ? String(r[cRut]||'').trim() : '';
      const brutoBase = cBrutoBase>-1 ? _fz_num(r[cBrutoBase]||0) : 0;
      const netoFinal = cNetoFinal>-1 ? _fz_num(r[cNetoFinal]||0) : 0;
      const descuento = cDescuento>-1 ? _fz_num(r[cDescuento]||0) : 0;
      const iva = cIVA>-1 ? _fz_num(r[cIVA]||0) : 0;
      const cajas = cCaj>-1 ? _fz_num(r[cCaj]||0) : 0;
      const unidades = cUni>-1 ? _fz_num(r[cUni]||0) : 0;

      const inCurrentM = !!(f && f>=startM && f<endM);
      const inPrevM = !!(f && f>=startPrevM && f<endPrevM);

      if(est === FINZ_CONFIG.ESTADOS.FACTURADO) {
        if(inCurrentM){
          if(!nvMesActual.has(nv)) nvMesActual.set(nv, {total:0, cajas:0, unidades:0});
          const nvData = nvMesActual.get(nv);
          nvData.total += neto;
          nvData.cajas += cajas;
          nvData.unidades += unidades;

          const categoria = cCat>-1 ? String(r[cCat]||'Sin categoría').trim() : 'Sin categoría';
          if(!catStats.has(categoria)) catStats.set(categoria, {categoria, ventas:0, nvCount:new Set(), unidades:0});
          const cs = catStats.get(categoria);
          cs.ventas += neto;
          cs.nvCount.add(nv);
          cs.unidades += unidades;
        }
        if(inPrevM){
          if(!nvMesAnterior.has(nv)) nvMesAnterior.set(nv, {total:0});
          nvMesAnterior.get(nv).total += neto;
        }
        if(vend && inCurrentM){
          if(!vendedorStats.has(vend)) vendedorStats.set(vend, {ventas:0, nvCount:new Set(), total:0});
          const vs = vendedorStats.get(vend);
          vs.total += neto; vs.nvCount.add(nv);
        }
        if(cliente && inCurrentM){
          const clienteKey = rut && rut.length > 5 ? _fz_rutNorm(rut) : cliente;
          if(!clienteStats.has(clienteKey)) clienteStats.set(clienteKey, {nombre:cliente, ventas:0, nvCount:new Set()});
          const cs2 = clienteStats.get(clienteKey);
          cs2.ventas += neto; cs2.nvCount.add(nv);
        }
        totalDescuentos += descuento; totalIVA += iva;
        if(brutoBase > 0 && netoFinal > 0) totalMargenBruto += (netoFinal - (brutoBase * 0.84));
        totalCajas += cajas; totalUnidades += unidades;
      }

      if(!conversionData.has(nv)){ conversionData.set(nv, {fecha:f, estado:est, total:neto}); }
      else { conversionData.get(nv).estado = est; }
    }

    const ventasActuales = [...nvMesActual.values()].reduce((a,b)=>a+b.total,0);
    const ventasAnteriores = [...nvMesAnterior.values()].reduce((a,b)=>a+b.total,0);
    const crecimientoMensual = ventasAnteriores > 0 ? ((ventasActuales-ventasAnteriores)/ventasAnteriores)*100 : 0;

    const topVendedores = [...vendedorStats.entries()]
      .sort(([,a],[,b])=>b.total-a.total)
      .map(([nombre,stats])=>({ nombre, ventas:Math.round(stats.total), nvCount:stats.nvCount.size }));

    const topClientes = [...clienteStats.entries()]
      .sort(([,a],[,b])=>b.ventas-a.ventas)
      .slice(0,5)
      .map(([rut,stats])=>({ nombre:stats.nombre, rut, ventas:Math.round(stats.ventas), nvCount:stats.nvCount.size }));

    const topCategorias = [...catStats.values()]
      .sort((a,b)=>b.ventas-a.ventas)
      .slice(0,5)
      .map(cs=>({ categoria:cs.categoria, ventas:Math.round(cs.ventas), nvCount:cs.nvCount.size, unidades:cs.unidades }));

    const facturadas = [...conversionData.values()].filter(x=>x.estado===FINZ_CONFIG.ESTADOS.FACTURADO);
    const pendientes = [...conversionData.values()].filter(x=>x.estado===FINZ_CONFIG.ESTADOS.PENDIENTE);
    const tasaConversion = conversionData.size > 0 ? (facturadas.length/conversionData.size)*100 : 0;

    const tiempoPromedioConversion = 15;
    const margenBrutoPromedio = ventasActuales > 0 ? (totalMargenBruto/ventasActuales)*100 : 0;
    const porcentajeDescuento = ventasActuales > 0 ? (totalDescuentos/ventasActuales)*100 : 0;
    const ivaPromedio = totalIVA;
    const ticketPromedioCajas = totalCajas > 0 ? ventasActuales/totalCajas : 0;
    const ticketPromedioUnidades = totalUnidades > 0 ? ventasActuales/totalUnidades : 0;

    const nvPorVendedor = vendedorStats.size > 0 ? nvMesActual.size/vendedorStats.size : 0;
    const ventasPorVendedor = vendedorStats.size > 0 ? ventasActuales/vendedorStats.size : 0;

    const totalVentasClientes = [...clienteStats.values()].reduce((a,b)=>a+b.ventas,0);
    const concentracionClientes = totalVentasClientes > 0 ? 
      [...clienteStats.values()].reduce((hhi,cliente)=>{ const share = cliente.ventas/totalVentasClientes; return hhi + (share*share); },0) * 10000 : 0;

    /* ---- Agregados financieros desde Deuda ---- */
    const extra = _finz_getCashKpisFromDebt(); // DSO, aging, cash-in 30/60/90
    return { 
      ok:true, 
      kpis:{
        crecimientoMensual: Math.round(crecimientoMensual*10)/10,
        ventasActuales: Math.round(ventasActuales),
        ventasAnteriores: Math.round(ventasAnteriores),
        tasaConversion: Math.round(tasaConversion*10)/10,
        tiempoPromedioConversion,
        nvPendientes: pendientes.length,
        nvFacturadas: facturadas.length,
        margenBrutoPromedio: Math.round(margenBrutoPromedio*10)/10,
        porcentajeDescuento: Math.round(porcentajeDescuento*10)/10,
        ivaTotal: Math.round(ivaPromedio),
        nvPorVendedor: Math.round(nvPorVendedor*10)/10,
        ventasPorVendedor: Math.round(ventasPorVendedor),
        ticketPromedioCajas: Math.round(ticketPromedioCajas),
        ticketPromedioUnidades: Math.round(ticketPromedioUnidades),
        concentracionClientes: Math.round(concentracionClientes),
        topVendedores,
        topClientes,
        topCategorias,
        totalCajas,
        totalUnidades,
        cajasPromedioPorNV: nvMesActual.size > 0 ? Math.round(totalCajas/nvMesActual.size*10)/10 : 0,

        // KPIs financieros agregados
        dso: extra.dso,
        cashIn30: extra.cashIn30, cashIn60: extra.cashIn60, cashIn90: extra.cashIn90,
        aging: extra.aging
      }
    };
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ===== ANÁLISIS DE RIESGOS ===== */
function apiFinanzasGetAnalisisRiesgo(){
  try{
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if(!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { ok:true, analisis:{} };
    const H=data[0];

    const cNV   = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cTot  = _fz_find(H,['Total','total']);
    const cVB   = _fz_find(H,['V°B°','V°B° Financiero','VB Financiero','Visto Bueno','VºBº','VB']);
    const cEst  = _fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    const cCli  = _fz_find(H,['Nombre Cliente']);
    const cRut  = _fz_find(H,['RUT CLIENTE','RUT Cliente','RUT']);
    const cFec  = _fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cLog  = _fz_find(H,['Costo Logístico','Costo Logistico','costo logistico']);

    if(cNV===-1) return { ok:false, error:'Falta columna NV' };

    const clientesAltoRiesgo = new Map();
    const nvAltoMonto = [];
    const nvVencidasSinVB = [];
    const today = new Date();
    const hace30dias = new Date(today.getTime() - (30*24*60*60*1000));

    for(let i=1;i<data.length;i++){
      const r=data[i];
      const nv = String(r[cNV]||''); if(!nv) continue;

      const total = _fz_num(cTot>-1 ? r[cTot]||0 : 0) + _fz_num(cLog>-1 ? r[cLog]||0 : 0);
      const est = cEst>-1 ? String(r[cEst]||'').toUpperCase() : '';
      const vb = cVB>-1 ? String(r[cVB]||'') : '';
      const cliente = cCli>-1 ? String(r[cCli]||'') : '';
      const rut = cRut>-1 ? String(r[cRut]||'') : '';
      const fecha = cFec>-1 ? (r[cFec] instanceof Date ? r[cFec] : (r[cFec] ? new Date(r[cFec]) : null)) : null;

      if(total > 5000000 && est !== FINZ_CONFIG.ESTADOS.FACTURADO){
        nvAltoMonto.push({nv, cliente, total, estado:est, requiereVB: /requiere/i.test(vb)});
      }
      if(fecha && fecha < hace30dias && /requiere/i.test(vb) && est !== FINZ_CONFIG.ESTADOS.FACTURADO){
        nvVencidasSinVB.push({nv, cliente, total, diasVencido: Math.floor((today-fecha)/(24*60*60*1000))});
      }
      if(rut && est !== FINZ_CONFIG.ESTADOS.FACTURADO){
        const key = _fz_rutNorm(rut);
        if(!clientesAltoRiesgo.has(key)){
          clientesAltoRiesgo.set(key, {nombre:cliente, exposicion:0, nvPendientes:0});
        }
        const clienteData = clientesAltoRiesgo.get(key);
        clienteData.exposicion += total;
        clienteData.nvPendientes += 1;
      }
    }

    const clientesRiesgo = [...clientesAltoRiesgo.entries()]
      .filter(([,data])=>data.exposicion > 10000000)
      .sort(([,a],[,b])=>b.exposicion-a.exposicion)
      .slice(0,5)
      .map(([rut,data])=>({ rut, nombre:data.nombre, exposicion:Math.round(data.exposicion), nvPendientes:data.nvPendientes }));

    // métricas operativas extra
    const totalNV = data.length-1;
    const pctReqVB = totalNV>0 ? Math.round((nvVencidasSinVB.length/totalNV)*1000)/10 : 0;

    return {
      ok:true,
      analisis:{
        nvAltoMonto: nvAltoMonto.slice(0,10),
        nvVencidasSinVB: nvVencidasSinVB.slice(0,10),
        clientesAltoRiesgo: clientesRiesgo,
        resumenRiesgos:{
          totalExposicionAltoMonto: nvAltoMonto.reduce((a,nv)=>a+nv.total,0),
          totalNVVencidas: nvVencidasSinVB.length,
          totalClientesRiesgo: clientesRiesgo.length,
          promedioExposicionCliente: clientesRiesgo.length > 0 ? 
            Math.round(clientesRiesgo.reduce((a,c)=>a+c.exposicion,0)/clientesRiesgo.length) : 0,
          pctNVRequierenVB: pctReqVB
        }
      }
    };
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ===== ESTACIONALIDAD ===== */
function apiFinanzasGetEstacionalidad(arg) {
  try {
    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if (!sh) return { ok:false, error:'Hoja NV_Base no encontrada' };
    const data = sh.getDataRange().getValues(); if (data.length < 2) return { ok:true, estacionalidad:{} };
    const H = data[0];

    const cNV   = _fz_find(H,['Nota Venta','Nota de Venta','NV','Nº NV','N° NV','Numero NV','Número NV']);
    const cFec  = _fz_find(H,['Fecha NV','Fecha Nota de Venta','Fecha']);
    const cNeto = _fz_find(H,['Neto','neto']);
    const cEst  = _fz_find(H,['Estado Nota Venta','Estado NV','Estado']);
    if (cFec === -1) return { ok:false, error:'Falta columna Fecha' };

    // 👇 nuevo: tomar año desde argumentos si viene
    const reqYear = (arg && (arg.anio || arg.year || arg.ano)) ? Number(arg.anio || arg.year || arg.ano) : new Date().getFullYear();
    const yearsToBuild = [reqYear]; // solo el requerido
    // opcional: si quieres que el front pueda leer "anterior embebido", lo calculamos también
    const prevYear = reqYear - 1;
    yearsToBuild.push(prevYear);

    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

    // acumuladores por año
    const byYear = new Map(); // year -> { ventasMes[12], nvMes[12], ventasDia[7], nvDia[7], nvMesSet[12], nvDiaSet[7] }
    for (const y of yearsToBuild) {
      byYear.set(y, {
        ventasMes: Array(12).fill(0),
        nvMesSet: Array(12).fill(null).map(()=>new Set()),
        ventasDia: Array(7).fill(0),
        nvDiaSet: Array(7).fill(null).map(()=>new Set()),
      });
    }

    for (let i=1;i<data.length;i++) {
      const r = data[i];
      const nv = String(r[cNV]||''); if (!nv) continue;
      const fRaw = r[cFec]; const f = fRaw instanceof Date ? fRaw : (fRaw ? new Date(fRaw) : null);
      if (!f) continue;
      const Y = f.getFullYear();
      if (!byYear.has(Y)) continue; // solo años requeridos

      const est = cEst>-1 ? String(r[cEst]||'').toUpperCase() : '';
      if (est !== FINZ_CONFIG.ESTADOS.FACTURADO && est !== 'FACTURADO') continue;

      const acc = byYear.get(Y);
      const mes = f.getMonth();
      const dia = f.getDay();
      const neto = (cNeto>-1) ? _fz_num(r[cNeto]||0) : 0;

      acc.ventasMes[mes] += neto;
      acc.nvMesSet[mes].add(nv);
      acc.ventasDia[dia] += neto;
      acc.nvDiaSet[dia].add(nv);
    }

    // construir salida para el año solicitado
    const cur = byYear.get(reqYear);
    const ventasPorMes = cur.ventasMes.map((v,i)=>({ mes: meses[i], ventas: Math.round(v), nvCount: cur.nvMesSet[i].size }));
    const ventasPorDiaSemana = cur.ventasDia.map((v,i)=>({ dia: diasSemana[i], ventas: Math.round(v), nvCount: cur.nvDiaSet[i].size }));
    const mejorMes = meses[cur.ventasMes.indexOf(Math.max(...cur.ventasMes))];
    const positivos = cur.ventasMes.filter(x=>x>0);
    const peorMes = positivos.length ? meses[cur.ventasMes.indexOf(Math.min(...positivos))] : meses[0];
    const mejorDiaSemana = diasSemana[cur.ventasDia.indexOf(Math.max(...cur.ventasDia))];

    // también empaquetamos el año anterior para que el front lo pueda detectar como "embebido"
    const prev = byYear.get(prevYear);
    const ventasPorMesPrev = prev
      ? prev.ventasMes.map((v,i)=>({ mes: meses[i], ventas: Math.round(v), nvCount: prev.nvMesSet[i].size }))
      : [];

    return {
      ok:true,
      estacionalidad:{
        // serie principal (año pedido)
        ventasPorMes,
        ventasPorDiaSemana,
        mejorMes, peorMes, mejorDiaSemana,

        // 👇 alias útiles que tu front ya intenta detectar:
        // - anioAnterior.ventasPorMes
        // - ventasPorMesLY / ventasPorMesPrev
        anioAnterior: { ventasPorMes: ventasPorMesPrev },
        ventasPorMesLY: ventasPorMesPrev
      }
    };
  } catch(e) {
    return { ok:false, error:e.message };
  }
}

/* ===== DEUDA CLIENTES ===== */
function apiFinanzasGetDeudaResumen(){
  try{
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.DEUDA);
    if(!sh) return { ok:false, error:'Hoja "Deuda Clientes" no encontrada' };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { ok:true, items:[] };
    const H=data[0];

    const cCli = _fz_find(H,['Nombre Cliente']);
    const cDeu = _fz_find(H,['No Documentado Ni Pagado','No documentado ni pagado','No Documentado/No Pagado']);
    const cRng = _fz_find(H,['Rango Deuda']);
    const cDias= _fz_find(H,['Días Vencimiento','Dias Vencimiento']);
    if(cCli===-1 || cDeu===-1) return { ok:false, error:'Encabezados de Deuda no encontrados' };

    const map = new Map();
    for(let i=1;i<data.length;i++){
      const r=data[i];
      const cliente = String(r[cCli]||'').trim(); if(!cliente) continue;
      let deuda = _fz_abs(r[cDeu]||0); // positiva
      if(deuda===0) continue;

      const rango = cRng>-1 ? String(r[cRng]||'').trim() : '';
      const dias  = cDias>-1 ? _fz_num(r[cDias]||0) : 0;

      if(!map.has(cliente)) map.set(cliente, { cliente, totalDeuda:0, maxDias:0, porVencer:0, vencida:0, docs:0 });
      const acc = map.get(cliente);
      acc.totalDeuda += deuda;
      acc.maxDias = Math.max(acc.maxDias, dias);
      acc.docs++;
      if(/vencid/i.test(rango)) acc.vencida += deuda; else acc.porVencer += deuda;
    }

    const items = [...map.values()].sort((a,b)=> b.totalDeuda - a.totalDeuda);
    return { ok:true, items };
  }catch(e){ return { ok:false, error:e.message }; }
}

function apiFinanzasGetDeudaDetalleCliente(clienteNombre){
  try{
    const sh=_fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.DEUDA);
    if(!sh) return { ok:false, error:'Hoja "Deuda Clientes" no encontrada' };
    const data=sh.getDataRange().getValues(); if(data.length<2) return { ok:true, items:[], totales:{} };
    const H=data[0];

    const cCli = _fz_find(H,['Nombre Cliente']);
    const cDoc = _fz_find(H,['N° Documento','No Documento','Nº Documento','Numero Documento']);
    const cFac = _fz_find(H,['Fecha Facturación']);
    const cVen = _fz_find(H,['Fecha Vencimiento de Pago','Fecha Vencimiento Pago','Fecha Vencimiento']);
    const cRng = _fz_find(H,['Rango Deuda']);
    const cEst = _fz_find(H,['Estado Final de Pago']);
    const cDias= _fz_find(H,['Días Vencimiento','Dias Vencimiento']);
    const cBruto=_fz_find(H,['Total Bruto Factura']);
    const cDeu = _fz_find(H,['No Documentado Ni Pagado','No documentado ni pagado','No Documentado/No Pagado']);
    if(cCli===-1 || cDeu===-1) return { ok:false, error:'Encabezados de Deuda no encontrados' };

    const items=[];
    for(let i=1;i<data.length;i++){
      const r=data[i];
      if(String(r[cCli]||'').trim()!==String(clienteNombre).trim()) continue;
      const deuda = _fz_abs(r[cDeu]||0);
      if(deuda===0) continue;
      const f1 = r[cFac] instanceof Date ? r[cFac].toISOString().slice(0,10) : String(r[cFac]||'').slice(0,10);
      const f2 = r[cVen] instanceof Date ? r[cVen].toISOString().slice(0,10) : String(r[cVen]||'').slice(0,10);
      items.push({
        documento: cDoc>-1 ? String(r[cDoc]||'') : '',
        fechaFactura: f1,
        fechaVenc: f2,
        rango: cRng>-1 ? String(r[cRng]||'') : '',
        estadoPago: cEst>-1 ? String(r[cEst]||'') : '',
        diasVenc: cDias>-1 ? _fz_num(r[cDias]||0) : 0,
        brutoFactura: cBruto>-1 ? _fz_num(r[cBruto]||0) : 0,
        deuda
      });
    }
    const totales = { documentos: items.length, deudaTotal: items.reduce((a,b)=>a+b.deuda,0) };
    items.sort((a,b)=> b.deuda - a.deuda);
    return { ok:true, cliente: clienteNombre, items, totales };
  }catch(e){ return { ok:false, error:e.message }; }
}
/**
 * Puente para el front de NV: devuelve { ok, detalle[], resumen{} }
 * Recalcula días y clasificación con las fechas para que cuadre con Finanzas.
 * Firma: apiFinGetDeudaCliente(rutOpcional, nombreClienteOpcional)
 */
function apiFinGetDeudaCliente(rutInput, nombreInput){
  try{
    const nombre = String(nombreInput || '').trim();
    if (!nombre){
      return { ok:true, detalle:[], resumen:{ seguro:'No', credito:0, vencidas:0, porVencer:0, cheques:0 } };
    }

    // Trae detalle desde tu backend/hoja existente
    const det = apiFinanzasGetDeudaDetalleCliente(nombre);
    if (!det || det.ok === false){
      return { ok:false, error: det && det.error ? det.error : 'No se pudo obtener deuda' };
    }
    const items = det.items || [];

    // Helpers
    const msDia = 1000*60*60*24;
    const toMid = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()); // normaliza a medianoche
    const hoy = toMid(new Date());

    function parseFecha(s){
      if (!s) return null;
      // Acepta 'YYYY-MM-DD' o 'DD-MM-YYYY'
      const t = String(s).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)){
        const [Y,M,D] = t.split('-').map(n=>parseInt(n,10));
        return new Date(Y, M-1, D);
      }
      if (/^\d{2}-\d{2}-\d{4}$/.test(t)){
        const [D,M,Y] = t.split('-').map(n=>parseInt(n,10));
        return new Date(Y, M-1, D);
      }
      // fallback: que lo intente Date
      const d = new Date(t);
      return isNaN(d) ? null : d;
    }
    const inv = (s)=> (s && s.indexOf('-')>0) ? s.split('-').reverse().join('-') : (s || '');

    // Utilidad para texto de estado
    function estadoDesdeDiff(diff){
      const abs = Math.abs(diff);
      if (diff < 0){
        // VENCIDO
        // Si no tienes buckets, usa: return `VENCIDO (${abs}D)`;
        if (abs <= 30) return `VENCIDO (1-30D)`;
        if (abs <= 60) return `VENCIDO (31-60D)`;
        if (abs <= 90) return `VENCIDO (61-90D)`;
        return `VENCIDO (+90D)`;
      }else{
        // POR VENCER
        return `POR VENCER (${abs}D)`;
      }
    }

    let vencidas = 0, porVencer = 0;

    const detalle = items.map((it) => {
      const emisionDate = parseFecha(it.fechaFactura);
      const venceDate   = parseFecha(it.fechaVenc);
      // diff: +N = faltan N días para vencer, -N = vencido hace N días
      let diff = 0;
      if (venceDate){
        diff = Math.floor((toMid(venceDate).getTime() - hoy.getTime()) / msDia);
      }

      const diasTexto = diff < 0 ? `${Math.abs(diff)} venc.` : `${diff} p/v`;
      const deuda = Math.round(Number(it.deuda || 0));

      // Suma para el resumen según el diff real (no por 'rango' externo)
      if (diff < 0) vencidas += deuda; else porVencer += deuda;

      return {
        doc:    String(it.documento || ''),
        emision: inv(it.fechaFactura || ''),
        vence:   inv(it.fechaVenc || ''),
        dias:    diasTexto,                          // ← como en Finanzas
        neto:    0,                                  // no lo tenemos, va 0
        total:   deuda,
        estado:  estadoDesdeDiff(diff)               // ← consistente
      };
    });

    const resumen = {
      seguro: 'No',
      credito: 0,
      vencidas,
      porVencer,
      cheques: 0
    };

    return { ok:true, detalle, resumen };
  }catch(e){
    return { ok:false, error: e.message };
  }
}
/* ===== EXTENSIÓN: LÍNEA DE CRÉDITO ===== */

/**
 * Obtiene la línea de crédito de un cliente desde la pestaña "Seguro Vigente"
 * @param {string} rutCliente - RUT del cliente
 * @param {string} nombreCliente - Nombre del cliente (opcional, como fallback)
 * @returns {object} { ok: boolean, lineaCredito: number, cliente: string, error?: string }
 */
function apiFinanzasGetLineaCredito(rutCliente, nombreCliente = '') {
  try {
    const sh = _fz_ss().getSheetByName('Seguro Vigente');
    if (!sh) return { ok: false, error: 'Hoja "Seguro Vigente" no encontrada' };
    
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: false, error: 'Sin datos en Seguro Vigente' };
    
    const H = data[0];
    const cRut = _fz_find(H, ['RUT', 'RUT Cliente', 'RUT CLIENTE', 'Rut']);
    const cNombre = _fz_find(H, ['Nombre', 'Nombre Cliente', 'NOMBRE CLIENTE', 'Cliente']);
    const cMonto = _fz_find(H, ['Monto Aprobado CLP', 'Linea Credito', 'Línea Crédito', 'Monto Aprobado']);
    
    if (cMonto === -1) return { ok: false, error: 'Columna "Monto Aprobado CLP" no encontrada' };
    
    // Normalizar RUT para búsqueda
    const rutBuscar = _fz_norm(String(rutCliente || ''));
    const nombreBuscar = _fz_norm(String(nombreCliente || ''));
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rutHoja = _fz_norm(String(row[cRut] || ''));
      const nombreHoja = _fz_norm(String(row[cNombre] || ''));
      
      // Buscar por RUT o por nombre si no hay RUT
      const matchRut = rutBuscar && rutHoja && rutHoja.includes(rutBuscar);
      const matchNombre = !rutBuscar && nombreBuscar && nombreHoja.includes(nombreBuscar);
      
      if (matchRut || matchNombre) {
        const lineaCredito = _fz_num(row[cMonto] || 0);
        return {
          ok: true,
          lineaCredito,
          cliente: String(row[cNombre] || nombreCliente),
          rut: String(row[cRut] || rutCliente)
        };
      }
    }
    
    return { ok: true, lineaCredito: 0, cliente: nombreCliente, rut: rutCliente };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Enriquece la información de deuda con línea de crédito
 * Mantiene compatibilidad total con la función existente
 */
function apiFinanzasGetDeudaResumenConCredito() {
  try {
    // Usar la función existente como base
    const deudaRes = apiFinanzasGetDeudaResumen();
    if (!deudaRes.ok) return deudaRes;
    
    // Enriquecer cada cliente con su línea de crédito
    const itemsEnriquecidos = deudaRes.items.map(cliente => {
      const creditoRes = apiFinanzasGetLineaCredito('', cliente.cliente);
      const lineaCredito = creditoRes.ok ? creditoRes.lineaCredito : 0;
      const utilizacion = lineaCredito > 0 ? (cliente.totalDeuda / lineaCredito) * 100 : 0;
      
      return {
        ...cliente,
        lineaCredito,
        utilizacionCredito: Math.round(utilizacion * 10) / 10,
        disponible: Math.max(lineaCredito - cliente.totalDeuda, 0),
        sobregirado: cliente.totalDeuda > lineaCredito && lineaCredito > 0
      };
    });
    
    return { ...deudaRes, items: itemsEnriquecidos };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Análisis de riesgo crediticio con línea de crédito
 */
function apiFinanzasGetAnalisisRiesgoCredito() {
  try {
    const riesgoBase = apiFinanzasGetAnalisisRiesgo();
    if (!riesgoBase.ok) return riesgoBase;
    
    const deudaConCredito = apiFinanzasGetDeudaResumenConCredito();
    if (!deudaConCredito.ok) return riesgoBase; // fallback a análisis sin crédito
    
    // Analizar clientes con línea de crédito
    const clientesConCredito = deudaConCredito.items.filter(c => c.lineaCredito > 0);
    const clientesSobregirados = clientesConCredito.filter(c => c.sobregirado);
    const clientesAltaUtilizacion = clientesConCredito.filter(c => c.utilizacionCredito > 80 && !c.sobregirado);
    
    const promedioUtilizacion = clientesConCredito.length > 0 
      ? clientesConCredito.reduce((sum, c) => sum + c.utilizacionCredito, 0) / clientesConCredito.length 
      : 0;
    
    const totalLineaCredito = clientesConCredito.reduce((sum, c) => sum + c.lineaCredito, 0);
    const totalUtilizado = clientesConCredito.reduce((sum, c) => sum + c.totalDeuda, 0);
    
    return {
      ...riesgoBase,
      analisis: {
        ...riesgoBase.analisis,
        creditoInfo: {
          clientesConLinea: clientesConCredito.length,
          clientesSobregirados: clientesSobregirados.length,
          clientesAltaUtilizacion: clientesAltaUtilizacion.length,
          promedioUtilizacion: Math.round(promedioUtilizacion * 10) / 10,
          totalLineaCredito,
          totalUtilizado,
          utilizacionGlobal: totalLineaCredito > 0 ? (totalUtilizado / totalLineaCredito) * 100 : 0,
          topSobregirados: clientesSobregirados.slice(0, 5).map(c => ({
            cliente: c.cliente,
            deuda: c.totalDeuda,
            lineaCredito: c.lineaCredito,
            exceso: c.totalDeuda - c.lineaCredito,
            utilizacion: c.utilizacionCredito
          }))
        }
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Valida si un cliente puede asumir nueva deuda basado en su línea de crédito
 * @param {string} rutCliente - RUT del cliente  
 * @param {string} nombreCliente - Nombre del cliente
 * @param {number} montoNuevaDeuda - Monto de la nueva operación
 * @returns {object} Análisis de capacidad crediticia
 */
function apiFinanzasValidarCapacidadCredito(rutCliente, nombreCliente, montoNuevaDeuda) {
  try {
    const creditoRes = apiFinanzasGetLineaCredito(rutCliente, nombreCliente);
    if (!creditoRes.ok) return { ok: false, error: 'No se pudo obtener línea de crédito' };
    
    const deudaRes = apiFinanzasGetDeudaDetalleCliente(nombreCliente);
    const deudaActual = deudaRes.ok ? (deudaRes.totales?.deudaTotal || 0) : 0;
    
    const lineaCredito = creditoRes.lineaCredito;
    const nuevaDeudaTotal = deudaActual + montoNuevaDeuda;
    const utilizacionActual = lineaCredito > 0 ? (deudaActual / lineaCredito) * 100 : 0;
    const nuevaUtilizacion = lineaCredito > 0 ? (nuevaDeudaTotal / lineaCredito) * 100 : 0;
    
    let recomendacion = 'APROBADO';
    let nivel = 'BAJO';
    let observaciones = [];
    
    if (lineaCredito === 0) {
      recomendacion = 'REVISAR';
      nivel = 'ALTO';
      observaciones.push('Cliente sin línea de crédito asignada');
    } else if (nuevaDeudaTotal > lineaCredito) {
      recomendacion = 'RECHAZADO';
      nivel = 'ALTO';
      observaciones.push(`Operación excede línea de crédito en ${toCLP(nuevaDeudaTotal - lineaCredito)}`);
    } else if (nuevaUtilizacion > 90) {
      recomendacion = 'REVISAR';
      nivel = 'ALTO';
      observaciones.push('Utilización superior al 90%');
    } else if (nuevaUtilizacion > 80) {
      recomendacion = 'APROBAR CON SEGUIMIENTO';
      nivel = 'MEDIO';
      observaciones.push('Utilización superior al 80%');
    }
    
    // Considerar deuda vencida
    if (deudaRes.ok && deudaRes.items) {
      const hoy = new Date();
      const deudaVencida = deudaRes.items.filter(item => {
        const fechaVenc = new Date(item.fechaVenc);
        return hoy > fechaVenc;
      }).reduce((sum, item) => sum + item.deuda, 0);
      
      if (deudaVencida > 0) {
        const pctVencida = (deudaVencida / deudaActual) * 100;
        if (pctVencida > 25) {
          recomendacion = 'RECHAZADO';
          nivel = 'ALTO';
          observaciones.push(`${pctVencida.toFixed(1)}% de deuda vencida`);
        } else if (pctVencida > 10) {
          if (recomendacion === 'APROBADO') recomendacion = 'REVISAR';
          if (nivel === 'BAJO') nivel = 'MEDIO';
          observaciones.push(`${pctVencida.toFixed(1)}% de deuda vencida - requiere seguimiento`);
        }
      }
    }
    
    return {
      ok: true,
      validacion: {
        cliente: nombreCliente,
        montoSolicitado: montoNuevaDeuda,
        deudaActual,
        lineaCredito,
        nuevaDeudaTotal,
        utilizacionActual: Math.round(utilizacionActual * 10) / 10,
        nuevaUtilizacion: Math.round(nuevaUtilizacion * 10) / 10,
        disponible: Math.max(lineaCredito - deudaActual, 0),
        excedente: Math.max(nuevaDeudaTotal - lineaCredito, 0),
        recomendacion,
        nivelRiesgo: nivel,
        observaciones
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Helper function para formatear montos en las nuevas funciones
function toCLP(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL');
}
/**
 * Trae crédito del cliente a partir de una NV y calcula utilización actual y post-NV
 * Devuelve: { ok, credito:{ cliente, rut, lineaCredito, deudaActual, disponible, utilizacion, montoNV, utilizacionPost, cabe } }
 */
function apiFinanzasGetCreditoForNV(numeroNV){
  try{
    const det = apiFinanzasGetDetalleNV(numeroNV);
    if(!det.ok) return det;

    const d = det.detalle || {};
    const rut    = d.cliente && d.cliente.rut    ? d.cliente.rut    : '';
    const nombre = d.cliente && d.cliente.nombre ? d.cliente.nombre : '';
    const montoNV = (d.totales && d.totales.total) ? Math.round(d.totales.total) : 0;

    const credito = apiFinanzasGetLineaCredito(rut, nombre);
    if(!credito.ok) return { ok:false, error: credito.error || 'No se pudo obtener línea de crédito' };

    const deudaDet    = apiFinanzasGetDeudaDetalleCliente(nombre);
    const deudaActual = deudaDet.ok ? Math.round((deudaDet.totales && deudaDet.totales.deudaTotal) || 0) : 0;

    const linea = Math.round(credito.lineaCredito || 0);
    const util  = linea>0 ? Math.round((deudaActual/linea)*1000)/10 : (deudaActual>0?100:0);
    const utilPost = linea>0 ? Math.round(((deudaActual+montoNV)/linea)*1000)/10 : ((deudaActual+montoNV)>0?100:0);
    const disponible = Math.max(linea - deudaActual, 0);
    const cabe = linea>0 ? (deudaActual + montoNV) <= linea : false;

    return {
      ok:true,
      credito:{
        cliente: credito.cliente || nombre,
        rut:     credito.rut || rut,
        lineaCredito: linea,
        deudaActual,
        disponible,
        utilizacion: util,
        montoNV,
        utilizacionPost: utilPost,
        cabe
      }
    };
  }catch(e){ return { ok:false, error: e.message }; }
}
/** Detalle NV con caché (rápido para el aprobador) */
function apiFinanzasGetDetalleNVFast(numeroNV){
  try{
    const cache = CacheService.getScriptCache();
    const key   = 'NVDET:' + String(numeroNV);
    const hit   = cache.get(key);
    if (hit){
      return JSON.parse(hit); // { ok, detalle:{} }
    }
    // Reutilizamos tu versión completa (ya probada)
    const res = apiFinanzasGetDetalleNV(numeroNV);
    if (res && res.ok){
      // guarda por 5 minutos
      cache.put(key, JSON.stringify(res), 60*5);
    }
    return res;
  }catch(e){
    return { ok:false, error:e.message };
  }
}
/**
 * Calcula DSO (Days Sales Outstanding) y métricas de cobranza
 * DSO = (Deuda Total / Ventas Diarias Promedio)
 */
function apiFinanzasGetDSO() {
  try {
    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.DEUDA);
    if (!sh) return { ok: false, error: 'Hoja Deuda no encontrada' };
    
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: true, dso: 0, deudaTotal: 0 };
    
    const H = data[0];
    const cDeu = _fz_find(H, ['No Documentado Ni Pagado', 'No documentado ni pagado', 'No Documentado/No Pagado']);
    if (cDeu === -1) return { ok: false, error: 'Columna deuda no encontrada' };
    
    let deudaTotal = 0;
    for (let i = 1; i < data.length; i++) {
      deudaTotal += _fz_abs(data[i][cDeu] || 0);
    }
    
    // Obtener ventas últimos 90 días para calcular promedio diario
    const nvSh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.NV_BASE);
    if (!nvSh) return { ok: false, error: 'NV_Base no encontrada' };
    
    const nvData = nvSh.getDataRange().getValues();
    const nvH = nvData[0];
    const cFec = _fz_find(nvH, ['Fecha NV', 'Fecha Nota de Venta', 'Fecha']);
    const cNeto = _fz_find(nvH, ['Neto', 'neto']);
    const cEst = _fz_find(nvH, ['Estado Nota Venta', 'Estado NV', 'Estado']);
    
    const hoy = new Date();
    const hace90 = new Date(hoy.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    let ventasUlt90 = 0;
    for (let i = 1; i < nvData.length; i++) {
      const f = _fz_date(nvData[i][cFec]);
      const est = cEst > -1 ? String(nvData[i][cEst] || '').toUpperCase() : '';
      
      if (f && f >= hace90 && f <= hoy && est === FINZ_CONFIG.ESTADOS.FACTURADO) {
        ventasUlt90 += _fz_num(nvData[i][cNeto] || 0);
      }
    }
    
    const ventasDiarias = ventasUlt90 / 90;
    const dso = ventasDiarias > 0 ? Math.round(deudaTotal / ventasDiarias) : 0;
    
    return {
      ok: true,
      dso,
      deudaTotal: Math.round(deudaTotal),
      ventasUlt90: Math.round(ventasUlt90),
      ventasDiarias: Math.round(ventasDiarias)
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Calcula Aging de Cartera (distribución de deuda por antigüedad)
 */
function apiFinanzasGetAging() {
  try {
    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.DEUDA);
    if (!sh) return { ok: false, error: 'Hoja Deuda no encontrada' };
    
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: true, aging: {} };
    
    const H = data[0];
    const cDeu = _fz_find(H, ['No Documentado Ni Pagado', 'No documentado ni pagado', 'No Documentado/No Pagado']);
    const cDias = _fz_find(H, ['Días Vencimiento', 'Dias Vencimiento']);
    const cVenc = _fz_find(H, ['Fecha Vencimiento de Pago', 'Fecha Vencimiento Pago', 'Fecha Vencimiento']);
    
    if (cDeu === -1) return { ok: false, error: 'Columna deuda no encontrada' };
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    const aging = {
      actual: 0,      // 0-30 días
      dias30: 0,      // 31-60 días
      dias60: 0,      // 61-90 días
      dias90: 0,      // +90 días
      porVencer: 0    // Aún no vencidas
    };
    
    for (let i = 1; i < data.length; i++) {
      const deuda = _fz_abs(data[i][cDeu] || 0);
      if (deuda === 0) continue;
      
      let dias = 0;
      
      // Intentar obtener días desde columna directa
      if (cDias > -1 && data[i][cDias]) {
        dias = _fz_num(data[i][cDias] || 0);
      } else if (cVenc > -1 && data[i][cVenc]) {
        // Calcular desde fecha de vencimiento
        const fVenc = _fz_date(data[i][cVenc]);
        if (fVenc) {
          fVenc.setHours(0, 0, 0, 0);
          dias = Math.floor((hoy - fVenc) / (1000 * 60 * 60 * 24));
        }
      }
      
      if (dias < 0) {
        aging.porVencer += deuda;
      } else if (dias <= 30) {
        aging.actual += deuda;
      } else if (dias <= 60) {
        aging.dias30 += deuda;
      } else if (dias <= 90) {
        aging.dias60 += deuda;
      } else {
        aging.dias90 += deuda;
      }
    }
    
    // Redondear
    aging.actual = Math.round(aging.actual);
    aging.dias30 = Math.round(aging.dias30);
    aging.dias60 = Math.round(aging.dias60);
    aging.dias90 = Math.round(aging.dias90);
    aging.porVencer = Math.round(aging.porVencer);
    
    const total = aging.actual + aging.dias30 + aging.dias60 + aging.dias90 + aging.porVencer;
    
    return {
      ok: true,
      aging,
      total,
      porcentajes: {
        actual: total > 0 ? Math.round((aging.actual / total) * 100) : 0,
        dias30: total > 0 ? Math.round((aging.dias30 / total) * 100) : 0,
        dias60: total > 0 ? Math.round((aging.dias60 / total) * 100) : 0,
        dias90: total > 0 ? Math.round((aging.dias90 / total) * 100) : 0,
        porVencer: total > 0 ? Math.round((aging.porVencer / total) * 100) : 0
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Proyección de flujo de caja para los próximos 90 días
 */
function apiFinanzasGetProyeccionFlujo() {
  try {
    const sh = _fz_ss().getSheetByName(FINZ_CONFIG.HOJAS.DEUDA);
    if (!sh) return { ok: false, error: 'Hoja Deuda no encontrada' };
    
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { ok: true, proyeccion: [] };
    
    const H = data[0];
    const cDeu = _fz_find(H, ['No Documentado Ni Pagado', 'No documentado ni pagado', 'No Documentado/No Pagado']);
    const cVenc = _fz_find(H, ['Fecha Vencimiento de Pago', 'Fecha Vencimiento Pago', 'Fecha Vencimiento']);
    
    if (cDeu === -1 || cVenc === -1) return { ok: false, error: 'Columnas necesarias no encontradas' };
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Agrupar por semanas (próximas 13 semanas = ~90 días)
    const semanas = Array(13).fill(0).map((_, i) => {
      const inicio = new Date(hoy.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
      const fin = new Date(inicio.getTime() + (7 * 24 * 60 * 60 * 1000));
      return {
        semana: `S${i + 1}`,
        fecha: inicio.toISOString().slice(0, 10),
        ingresosEsperados: 0,
        docs: 0
      };
    });
    
    for (let i = 1; i < data.length; i++) {
      const deuda = _fz_abs(data[i][cDeu] || 0);
      if (deuda === 0) continue;
      
      const fVenc = _fz_date(data[i][cVenc]);
      if (!fVenc) continue;
      fVenc.setHours(0, 0, 0, 0);
      
      // Encontrar en qué semana cae
      for (let s = 0; s < semanas.length; s++) {
        const inicio = new Date(semanas[s].fecha);
        const fin = new Date(inicio.getTime() + (7 * 24 * 60 * 60 * 1000));
        
        if (fVenc >= inicio && fVenc < fin) {
          semanas[s].ingresosEsperados += deuda;
          semanas[s].docs++;
          break;
        }
      }
    }
    
    // Calcular acumulado
    let acumulado = 0;
    semanas.forEach(s => {
      s.ingresosEsperados = Math.round(s.ingresosEsperados);
      acumulado += s.ingresosEsperados;
      s.acumulado = acumulado;
    });
    
    return {
      ok: true,
      proyeccion: semanas,
      totalEsperado: acumulado
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Top clientes con mayor riesgo (sobregiro + vencidos)
 */
function apiFinanzasGetTopRiesgo() {
  try {
    const deudaRes = apiFinanzasGetDeudaResumenConCredito();
    if (!deudaRes.ok) return deudaRes;
    
    const items = deudaRes.items || [];
    
    // Calcular score de riesgo
    const clientesConRiesgo = items.map(c => {
      let riesgoScore = 0;
      let razon = [];
      
      // Factor 1: Sobregiro
      if (c.sobregirado) {
        const exceso = c.totalDeuda - c.lineaCredito;
        riesgoScore += exceso;
        razon.push('Sobregiro');
      }
      
      // Factor 2: Alta utilización
      if (c.utilizacionCredito > 80 && !c.sobregirado) {
        riesgoScore += c.totalDeuda * 0.5;
        razon.push('Alta utilización');
      }
      
      // Factor 3: Días vencidos
      if (c.maxDias > 0) {
        riesgoScore += c.vencida || 0;
        razon.push(`${c.maxDias} días vencido`);
      }
      
      return {
        cliente: c.cliente,
        deuda: c.totalDeuda,
        linea: c.lineaCredito,
        vencida: c.vencida || 0,
        utilizacion: c.utilizacionCredito,
        maxDias: c.maxDias || 0,
        riesgoScore,
        razon: razon.join(', '),
        nivel: riesgoScore > c.lineaCredito ? 'CRÍTICO' : (riesgoScore > c.lineaCredito * 0.5 ? 'ALTO' : 'MEDIO')
      };
    }).filter(c => c.riesgoScore > 0);
    
    // Ordenar por score y tomar top 10
    clientesConRiesgo.sort((a, b) => b.riesgoScore - a.riesgoScore);
    const top10 = clientesConRiesgo.slice(0, 10);
    
    return {
      ok: true,
      items: top10,
      total: clientesConRiesgo.length
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
