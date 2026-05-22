/***** ========================================================
 *  MODIFICADOR DE NOTAS DE VENTA — BACKEND (Google Apps Script)
 *  ====================================================== *****/

// ——— Config local (respeta CONFIG si ya existe en el proyecto)
const MODIF_CONFIG = {
  SPREADSHEET_ID: (typeof CONFIG !== 'undefined' && CONFIG.SPREADSHEET_ID) 
                    ? CONFIG.SPREADSHEET_ID 
                    : '122wOtGhIuSDrfrROiCVSr3Ddx6ZXSryHMtssvx7DQc0',
  HOJAS: {
    NV_BASE: (typeof CONFIG !== 'undefined' && CONFIG.HOJAS && CONFIG.HOJAS.NV_BASE) ? CONFIG.HOJAS.NV_BASE : 'NV_Base',
    PRODUCTOS: (typeof CONFIG !== 'undefined' && CONFIG.HOJAS && CONFIG.HOJAS.PRODUCTOS) ? CONFIG.HOJAS.PRODUCTOS : 'Lista Productos'
  },
  LOGISTICO: {
    NETO_UNITARIO: (typeof CONFIG !== 'undefined' && CONFIG.LOGISTICO) ? CONFIG.LOGISTICO.NETO_UNITARIO : 360,
    IVA_PCT: (typeof CONFIG !== 'undefined' && CONFIG.LOGISTICO) ? CONFIG.LOGISTICO.IVA_PCT : 0.19
  }
};

// === Helpers namespaced (para no chocar con funciones globales) ===
function MODIF_ss(){ return SpreadsheetApp.openById(MODIF_CONFIG.SPREADSHEET_ID); }
function MODIF_fmtNum(v){
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/\s+/g,'').replace(/\./g,'').replace(/,/g,'.');
  const n = parseFloat(s.replace(/[^\d.\-]/g,'')); 
  return isNaN(n) ? 0 : n;
}
function MODIF_fmtCLP(n){ return Math.round(MODIF_fmtNum(n)); }
function MODIF_norm(t){ return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
function MODIF_find(headers, names){
  const map={}; headers.forEach((h,i)=> map[MODIF_norm(h)] = i);
  for (const nm of names){ const k = MODIF_norm(nm); if (map[k] !== undefined) return map[k]; }
  return -1;
}
function MODIF_asPct(v, fb){ const x = (v===undefined||v===null) ? fb : MODIF_fmtNum(v); return x>1 ? x/100 : x; }

// === Mapa de productos (para IVA/ILA/mínimos) ===
function MODIF_buildProductoMap(){
  const sh = MODIF_ss().getSheetByName(MODIF_CONFIG.HOJAS.PRODUCTOS);
  if(!sh) return {};
  const data = sh.getDataRange().getValues();
  if(data.length<2) return {};
  const H = data[0];
  const cSKU  = MODIF_find(H,['SKU','Codigo','Código','Cód Producto','Cod Producto']);
  const cBxC  = MODIF_find(H,['Bxc','Un x Caja','Un x caja','Unidades por caja']);
  const cNeto = MODIF_find(H,['Neto U','Precio Neto Unitario','Precio Neto']);
  const cBrut = MODIF_find(H,['Bruto U','Precio Bruto Unitario','Precio Bruto']);
  const cIVA  = MODIF_find(H,['IVA %','IVA%','IVA']);
  const cILA  = MODIF_find(H,['ILA %','ILA%','ILA']);
  const cMin  = MODIF_find(H,[
    'Precio Min Neto','Precio Mín Neto','Precio Minimo Neto','Precio Mínimo Neto',
    'Min Neto','Min Neto U','Min Neto Unidad','Precio Min Neto U','P.Min Neto'
  ]);
  const cCat  = MODIF_find(H,['Categoria','Categoría','Category']);
  const cMar  = MODIF_find(H,['Marca','Brand']);

  const map = {};
  for (let i=1;i<data.length;i++){
    const r = data[i];
    const sku = String(r[cSKU]||'').replace(/\s+/g,'');
    if(!sku) continue;
    map[sku] = {
      sku,
      nombre: String(r[0]||sku),
      bxc: MODIF_fmtNum(r[cBxC]||12),
      precioNetoUnitario: MODIF_fmtNum(r[cNeto]||0),
      precioBrutoUnitario: MODIF_fmtNum(r[cBrut]||0),
      ivaPorcentaje: MODIF_asPct(r[cIVA] ?? 0.19, 0.19),
      ilaPorcentaje: MODIF_asPct(r[cILA] ?? 0.00, 0.00),
      minNetoUnitario: MODIF_fmtNum(cMin>-1 ? r[cMin] : 0),
      categoria: cCat>-1 ? String(r[cCat]||'') : '',
      marca:     cMar>-1 ? String(r[cMar]||'') : ''
    };
  }
  return map;
}

// === Cargar NV para modificar ===
function apiModifGetNV(numeroNV){
  try{
    const sh = MODIF_ss().getSheetByName(MODIF_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {ok:false, msg:'Hoja NV_Base no encontrada'};
    const data = sh.getDataRange().getValues();
    if(data.length<2) return {ok:false, msg:'NV_Base sin datos'};

    const H = data[0];
    const cNV    = MODIF_find(H,['Nota Venta']); if(cNV===-1) return {ok:false, msg:'Columna "Nota Venta" no encontrada'};
    const cFec   = MODIF_find(H,['Fecha NV','Fecha']);
    const cRut   = MODIF_find(H,['RUT CLIENTE']);
    const cCli   = MODIF_find(H,['Nombre Cliente']);
    const cCom   = MODIF_find(H,['Comuna']);
    const cCiu   = MODIF_find(H,['Ciudad']);
    const cEje   = MODIF_find(H,['Ejecutivo']);
    const cFP    = MODIF_find(H,['Forma de Pago']);
    const cSKU   = MODIF_find(H,['Cód. Producto','Cod. Producto','Codigo Producto']);
    const cDesc  = MODIF_find(H,['Descripción Producto','Descripcion Producto']);
    const cBxC   = MODIF_find(H,['Un x Caja','Un x caja']);
    const cCaj   = MODIF_find(H,['Cajas']);
    const cUni   = MODIF_find(H,['Unidades']);
    const cVB    = MODIF_find(H,['V°B° Financiero','V°B°','VB Financiero']);
    const cNb    = MODIF_find(H,['Neto U Base']);
    const cBb    = MODIF_find(H,['Bruto U Base']);
    const cNf    = MODIF_find(H,['Neto U Final']);
    const cBf    = MODIF_find(H,['Bruto U Final']);
    const cDesL  = MODIF_find(H,['Descuento Línea','Descuento Linea']);
    const cNet   = MODIF_find(H,['Neto']);
    const cIVA   = MODIF_find(H,['IVA']);
    const cILA   = MODIF_find(H,['ILA']);
    const cLog   = MODIF_find(H,['Costo Logístico','Costo Logistico']);
    const cTot   = MODIF_find(H,['Total']);
    const cEst   = MODIF_find(H,['Estado Nota Venta']);
    const cFac   = MODIF_find(H,['N° Factura']);
    const cDD    = MODIF_find(H,['Despachar Desde']);
    const cDir   = MODIF_find(H,['Dirección Despacho','Direccion Despacho']);
    const cHor   = MODIF_find(H,['Horario Despacho']);
    const cObs   = MODIF_find(H,['Observaciones']);

    const prodMap = MODIF_buildProductoMap();

    let header = null;
    const items = [];
    for (let i=1;i<data.length;i++){
      const row = data[i];
      if(String(row[cNV]) !== String(numeroNV)) continue;

      if(!header){
        const f = row[cFec];
        const fechaStr = (f instanceof Date) ? f.toISOString().slice(0,10) : String(f).slice(0,10);
        header = {
          numeroNV: String(numeroNV),
          fecha: fechaStr,
          cliente: {
            nombre: String(row[cCli]||''),
            rut:    String(row[cRut]||''),
            comuna: String(row[cCom]||''),
            ciudad: String(row[cCiu]||'')
          },
          vendedor: String(row[cEje]||''),
          formaPago: String(row[cFP]||''),
          despacharDesde: String(row[cDD]||''),
          direccionDespacho: String(row[cDir]||''),
          horarioDespacho: String(row[cHor]||''),
          observaciones: String(row[cObs]||''),
          estado: String(row[cEst]||'PENDIENTE'),
          numeroFactura: String(row[cFac]||'')
        };
      }

      const sku = String(row[cSKU]||'').replace(/\s+/g,'');
      const pm = prodMap[sku] || {};
      items.push({
        sku,
        nombre: String(row[cDesc]||pm.nombre||''),
        bxc: MODIF_fmtNum(row[cBxC]||pm.bxc||0),
        cajas: MODIF_fmtNum(row[cCaj]||0),
        unidades: MODIF_fmtNum(row[cUni]||0),
        vbFinanciero: String(row[cVB]||''),
        precios: {
          netoBase: MODIF_fmtNum(row[cNb]||pm.precioNetoUnitario||0),
          brutoBase: MODIF_fmtNum(row[cBb]||0),
          netoFinal: MODIF_fmtNum(row[cNf]||0),
          brutoFinal: MODIF_fmtNum(row[cBf]||0)
        },
        ivaPct: MODIF_asPct(pm.ivaPorcentaje, 0.19),
        ilaPct: MODIF_asPct(pm.ilaPorcentaje, 0.00),
        minNetoUnitario: MODIF_fmtNum(pm.minNetoUnitario||0),
        totales:{
          descuento: MODIF_fmtNum(row[cDesL]||0),
          neto: MODIF_fmtNum(row[cNet]||0),
          iva: MODIF_fmtNum(row[cIVA]||0),
          ila: MODIF_fmtNum(row[cILA]||0),
          logistico: MODIF_fmtNum(row[cLog]||0),
          total: MODIF_fmtNum(row[cTot]||0)
        }
      });
    }

    if(!header) return {ok:false, msg:'NV no encontrada'};

    const totales = items.reduce((a,it)=>({
      neto:a.neto+it.totales.neto,
      descuento:a.descuento+it.totales.descuento,
      iva:a.iva+it.totales.iva,
      ila:a.ila+it.totales.ila,
      logistico:a.logistico+it.totales.logistico,
      total:a.total+it.totales.total,
      cajas:a.cajas+it.cajas,
      unidades:a.unidades+it.unidades
    }),{neto:0,descuento:0,iva:0,ila:0,logistico:0,total:0,cajas:0,unidades:0});

    return {ok:true, ...header, items, totales};
  }catch(e){
    return {ok:false, msg:'Error al cargar NV: '+e.message};
  }
}

// === Guardar modificación (misma lógica del Emisor) ===
function apiModifGuardar(numeroNV, itemsFront, notaCredito){
  try{
    if(!numeroNV) return {success:false, message:'NV inválida'};
    const ss = MODIF_ss();
    const sh = ss.getSheetByName(MODIF_CONFIG.HOJAS.NV_BASE);
    if(!sh) return {success:false, message:'Hoja NV_Base no encontrada'};
    const data = sh.getDataRange().getValues();
    if(data.length<2) return {success:false, message:'NV_Base vacía'};
    const H = data[0];

    const cNV    = MODIF_find(H,['Nota Venta']);
    const cFec   = MODIF_find(H,['Fecha NV','Fecha']);
    const cRut   = MODIF_find(H,['RUT CLIENTE']);
    const cCli   = MODIF_find(H,['Nombre Cliente']);
    const cCom   = MODIF_find(H,['Comuna']);
    const cCiu   = MODIF_find(H,['Ciudad']);
    const cEje   = MODIF_find(H,['Ejecutivo']);
    const cFP    = MODIF_find(H,['Forma de Pago']);
    const cSKU   = MODIF_find(H,['Cód. Producto','Cod. Producto','Codigo Producto']);
    const cDesc  = MODIF_find(H,['Descripción Producto','Descripcion Producto']);
    const cBxC   = MODIF_find(H,['Un x Caja','Un x caja']);
    const cCaj   = MODIF_find(H,['Cajas']);
    const cUni   = MODIF_find(H,['Unidades']);
    const cVB    = MODIF_find(H,['V°B° Financiero','V°B°','VB Financiero']);
    const cNb    = MODIF_find(H,['Neto U Base']);
    const cBb    = MODIF_find(H,['Bruto U Base']);
    const cNf    = MODIF_find(H,['Neto U Final']);
    const cBf    = MODIF_find(H,['Bruto U Final']);
    const cDesL  = MODIF_find(H,['Descuento Línea','Descuento Linea']);
    const cNet   = MODIF_find(H,['Neto']);
    const cIVA   = MODIF_find(H,['IVA']);
    const cILA   = MODIF_find(H,['ILA']);
    const cLog   = MODIF_find(H,['Costo Logístico','Costo Logistico']);
    const cTot   = MODIF_find(H,['Total']);
    const cEst   = MODIF_find(H,['Estado Nota Venta']);
    const cFac   = MODIF_find(H,['N° Factura']);
    const cDD    = MODIF_find(H,['Despachar Desde']);
    const cDir   = MODIF_find(H,['Dirección Despacho','Direccion Despacho']);
    const cHor   = MODIF_find(H,['Horario Despacho']);
    const cObs   = MODIF_find(H,['Observaciones']);

    // asegurar columna Nota de Crédito
    let cNC = MODIF_find(H,['N° Nota de Crédito','N° Nota Credito','Nota de Crédito','Nota de Credito','NC','N° NC']);
    if (cNC === -1){
      const last = sh.getLastColumn();
      sh.insertColumnAfter(last);
      sh.getRange(1, last+1).setValue('N° Nota de Crédito');
      cNC = last; // 0-based
    }

    // localizar bloque de filas de la NV y capturar cabecera/estado
    let firstRow=-1, lastRow=-1, header=null;
    for (let i=1;i<data.length;i++){
      if(String(data[i][cNV])===String(numeroNV)){
        if(firstRow===-1) firstRow=i+1;
        lastRow=i+1;
        if(!header){
          header = {
            fecha: data[i][cFec],
            rut: data[i][cRut], cliente: data[i][cCli],
            comuna: data[i][cCom], ciudad: data[i][cCiu],
            ejecutivo: data[i][cEje], formaPago: data[i][cFP],
            estado: data[i][cEst], factura: data[i][cFac],
            despDesde: data[i][cDD], dir: data[i][cDir],
            hor: data[i][cHor], obs: data[i][cObs],
            notaCredito: cNC>-1 ? (data[i][cNC]||'') : ''
          };
        }
      }
    }
    if(firstRow===-1) return {success:false, message:'NV no encontrada'};

    const estadoUpper = String(header.estado||'').toUpperCase();
    if (estadoUpper === 'FACTURADO' && !String(notaCredito||'').trim()){
      return {success:false, message:'Debe indicar el N° de Nota de Crédito para modificar una NV facturada.'};
    }
    const ncFinal = String(notaCredito || header.notaCredito || '').trim();

    // ——— Lógica de cálculo IDENTICA al Emisor pero aplicada a edición ———
    const filas = [];
    const numCols = sh.getLastColumn();
    let sumN=0,sumIVA=0,sumILA=0,sumLOG=0,sumTot=0,sumCajas=0,sumDesc=0;

    const logNetoU = MODIF_CONFIG.LOGISTICO.NETO_UNITARIO;
    const logIvaPct = MODIF_CONFIG.LOGISTICO.IVA_PCT;
    const logBrutoU = logNetoU * (1+logIvaPct);

    itemsFront.forEach(it=>{
      const cajas = MODIF_fmtNum(it.cajas||0);
      const bxc   = MODIF_fmtNum(it.bxc||0);
      const unidades = cajas*bxc;

      const ivaPct = MODIF_asPct(it.ivaPct ?? it.ivaPorcentaje, 0.19);
      const ilaPct = MODIF_asPct(it.ilaPct ?? it.ilaPorcentaje, 0.00);

      const netoU_base  = MODIF_fmtNum(it.netoBase || it.netoUnitarioBase || 0);
      const brutoU_base = MODIF_fmtNum(it.brutoBase || it.brutoUnitarioBase || 0);
      const brutoU_final= MODIF_fmtNum(it.puBrutoFinal || it.brutoUnitarioFinal || it.brutoFinal || 0);

      // back-out producto (restar logístico bruto y dividir impuestos)
      const brutoProductoU = Math.max(0, brutoU_final - logBrutoU);
      const netoU_final = brutoProductoU / (1 + ivaPct + ilaPct);

      // descuento vs base (si no hay base, no descuenta)
      const descU   = Math.max(0, (netoU_base>0 ? netoU_base : netoU_final) - netoU_final);
      const descLin = descU * unidades;

      const minU = MODIF_fmtNum(it.minNetoUnitario || 0);
      const minComp = (minU>0 ? minU : netoU_base);
      const vb = (minComp>0 && netoU_final < minComp) ? 'Requiere V°B° Financiero' : 'Sin V°B° Financiero';

      const netoProd = netoU_final * unidades;
      const logNeto  = logNetoU * unidades;
      const netoLin  = netoProd + logNeto;

      const ivaLin   = (netoProd * ivaPct) + (logNeto * logIvaPct);
      const ilaLin   = (netoProd * ilaPct);
      const totLin   = netoLin + ivaLin + ilaLin;

      sumN+=netoLin; sumIVA+=ivaLin; sumILA+=ilaLin; sumLOG+=logNeto; sumTot+=totLin; sumCajas+=cajas; sumDesc+=descLin;

      const row = new Array(numCols).fill('');
      if(cNV>-1)   row[cNV]=String(numeroNV);
      if(cFec>-1)  row[cFec]=header.fecha;
      if(cRut>-1)  row[cRut]=header.rut;
      if(cCli>-1)  row[cCli]=header.cliente;
      if(cCom>-1)  row[cCom]=header.comuna;
      if(cCiu>-1)  row[cCiu]=header.ciudad;
      if(cEje>-1)  row[cEje]=header.ejecutivo;
      if(cFP>-1)   row[cFP]=header.formaPago;

      if(cSKU>-1)  row[cSKU]=String(it.sku||'');
      if(cDesc>-1) row[cDesc]=String(it.nombre||'');
      if(cBxC>-1)  row[cBxC]=bxc;
      if(cCaj>-1)  row[cCaj]=cajas;
      if(cUni>-1)  row[cUni]=unidades;

      if(cVB>-1)   row[cVB]=vb;

      if(cNb>-1)   row[cNb]=MODIF_fmtCLP(netoU_base);
      if(cBb>-1)   row[cBb]=MODIF_fmtCLP(brutoU_base);
      if(cNf>-1)   row[cNf]=MODIF_fmtCLP(netoU_final);
      if(cBf>-1)   row[cBf]=MODIF_fmtCLP(brutoU_final);

      if(cDesL>-1) row[cDesL]=MODIF_fmtCLP(descLin);
      if(cNet>-1)  row[cNet]=MODIF_fmtCLP(netoLin);
      if(cIVA>-1)  row[cIVA]=MODIF_fmtCLP(ivaLin);
      if(cILA>-1)  row[cILA]=MODIF_fmtCLP(ilaLin);
      if(cLog>-1)  row[cLog]=MODIF_fmtCLP(logNeto);
      if(cTot>-1)  row[cTot]=MODIF_fmtCLP(totLin);

      if(cEst>-1)  row[cEst]=header.estado;      // no cambia
      if(cFac>-1)  row[cFac]=header.factura;     // no cambia
      if(cNC>-1)   row[cNC]=ncFinal;             // solo registra si corresponde
      if(cDD>-1)   row[cDD]=header.despDesde;
      if(cDir>-1)  row[cDir]=header.dir;
      if(cHor>-1)  row[cHor]=header.hor;
      if(cObs>-1)  row[cObs]=header.obs;

      filas.push(row);
    });

    // reemplazar bloque en NV_Base
    const oldCount = lastRow - firstRow + 1;
    if(oldCount>0) sh.deleteRows(firstRow, oldCount);
    sh.insertRowsBefore(firstRow, filas.length);
    sh.getRange(firstRow, 1, filas.length, sh.getLastColumn()).setValues(filas);

    return {success:true, totales:{
      neto:MODIF_fmtCLP(sumN), descuento:MODIF_fmtCLP(sumDesc), iva:MODIF_fmtCLP(sumIVA),
      ila:MODIF_fmtCLP(sumILA), logistico:MODIF_fmtCLP(sumLOG), total:MODIF_fmtCLP(sumTot), cajas:sumCajas
    }};
  }catch(e){
    return {success:false, message:'Error al guardar modificación: '+e.message};
  }
}
