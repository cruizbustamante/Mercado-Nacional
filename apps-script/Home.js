/***** ========================================================
 *  HOME — BACKEND COMPLETO
 *  Sistema VDA - Viña de Aguirre
 *  Versión 3.1 - KPIs con Selector de Mes
 *  ====================================================== *****/

/* ============== CONFIGURACIÓN ============== */
const HOME_CACHE_TTL = 21600; // 6 horas para KPIs
const HOME_CACHE_DATOS_TTL = 21600; // 6 horas para datos crudos

/* ============== LIMPIAR CACHÉ (para botón admin) ============== */
/**
 * Limpia todo el caché del Home para forzar lectura de datos frescos
 * Disponible para: admin, ceo, cfo, jefe_ventas
 */
function apiHomeLimpiarCache() {
  try {
    const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
    const usuario = HOME_USUARIOS[email];
    
    // Verificar permisos
    const rolesPermitidos = ['admin', 'ceo', 'cfo', 'jefe_ventas'];
    if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
      return { ok: false, error: 'Sin permisos para esta acción' };
    }
    
    const cache = _hCache();
    
    // Limpiar caché de datos crudos
    _datosCache = null;
    
    // Limpiar cachés de KPIs por mes
    const keysToDelete = [
      'H_ULTIMO_MES',
      'H_MESES_DATOS',
      'H_DATOS_MAESTRO'
    ];
    
    // Agregar cachés por mes para cada rol
    for (let m = 1; m <= 12; m++) {
      keysToDelete.push('H_KPI_CEO_' + m);
      keysToDelete.push('H_KPI_CFO_' + m);
      keysToDelete.push('H_KPI_JEFE_' + m);
    }
    
    // Agregar cachés de vendedores
    EQUIPO_COMERCIAL.forEach(v => {
      const vendedorKey = (v.vendedor || '').replace(/\s/g, '_');
      for (let m = 1; m <= 12; m++) {
        keysToDelete.push('H_KPI_V_' + vendedorKey + '_' + m);
      }
    });
    
    // Agregar otros cachés
    keysToDelete.push('H_KPI_APROB', 'H_KPI_FACT', 'H_KPI_BOD');
    
    cache.removeAll(keysToDelete);
    
    Logger.log('🗑️ Caché limpiado por: ' + email + ' (' + keysToDelete.length + ' claves)');
    
    return { ok: true, message: 'Datos actualizados correctamente' };
    
  } catch(e) {
    Logger.log('Error limpiando caché: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/* ============== API: FACTURAS DEL MES (para vendedores) ============== */
function apiHomeGetFacturasMes(emailOverride, mes) {
  try {
    const emailReal = (Session.getActiveUser().getEmail() || '').toLowerCase();
    const emailActivo = emailOverride ? emailOverride.toLowerCase() : emailReal;
    const usuario = HOME_USUARIOS[emailActivo];
    
    if (!usuario) {
      return { ok: false, error: 'Usuario no encontrado' };
    }
    
    // Solo para vendedores
    if (usuario.rol !== 'vendedor') {
      return { ok: false, error: 'Solo disponible para vendedores' };
    }
    
    const mesNum = Number(mes);
    const facturas = _getFacturasMesVendedor(usuario.vendedor, mesNum);
    
    return {
      ok: true,
      facturas: facturas,
      mes: mesNum,
      nombreMes: _nombreMes(mesNum - 1)
    };
    
  } catch(e) {
    Logger.log('Error apiHomeGetFacturasMes: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/* ============== USUARIOS Y ROLES ============== */
const HOME_USUARIOS = {
  'cruizbusta@gmail.com': {
    nombre: 'Administrador',
    nombreCorto: 'Admin',
    rol: 'admin',
    grupo: 'direccion',
    vendedor: null,
    canal: null
  },
  'vdacruiz@gmail.com': {
    nombre: 'Administrador',
    nombreCorto: 'Admin',
    rol: 'admin',
    grupo: 'direccion',
    vendedor: null,
    canal: null
  },
  'vdardeaguirre@gmail.com': {
    nombre: 'Rodrigo de Aguirre',
    nombreCorto: 'Rodrigo',
    rol: 'ceo',
    grupo: 'direccion',
    vendedor: null,
    canal: null
  },
  'vdamsanchez@gmail.com': {
    nombre: 'Manuel Sánchez',
    nombreCorto: 'Manuel',
    rol: 'cfo',
    grupo: 'direccion',
    vendedor: null,
    canal: null
  },
    'vdacnavas@gmail.com': {
    nombre: 'Manuel Sánchez',
    nombreCorto: 'Manuel',
    rol: 'cfo',
    grupo: 'direccion',
    vendedor: null,
    canal: null
  },
  'vdasdeaguirre@gmail.com': {
    nombre: 'Sebastián de Aguirre',
    nombreCorto: 'Sebastián',
    rol: 'jefe_ventas',
    grupo: 'comercial',
    vendedor: 'SEBASTIAN DE AGUIRRE',
    canal: 'Supermercado + Mayorista'
  },
  'vdakgonzalez@gmail.com': {
    nombre: 'Krishna González',
    nombreCorto: 'Krishna',
    rol: 'aprobador',
    grupo: 'operaciones',
    vendedor: null,
    canal: null
  },
  'vdaimontenegro@gmail.com': {
    nombre: 'Iván Montenegro',
    nombreCorto: 'Iván',
    rol: 'aprobador',
    grupo: 'operaciones',
    vendedor: null,
    canal: null
  },
  'vdajmontenegro@gmail.com': {
    nombre: 'Juan Manuel Montenegro',
    nombreCorto: 'Juan Manuel',
    rol: 'vendedor',
    grupo: 'comercial',
    vendedor: 'JMMONTENEGRO',
    canal: 'MAYORISTA'
  },
  'vdacossa@gmail.com': {
    nombre: 'Carlos Ossa',
    nombreCorto: 'Carlos',
    rol: 'vendedor',
    grupo: 'comercial',
    vendedor: 'CARLOS OSSA',
    canal: 'MAYORISTA'
  },
  'vdadhernandez@gmail.com': {
    nombre: 'Daniel Hernández',
    nombreCorto: 'Daniel',
    rol: 'vendedor',
    grupo: 'comercial',
    vendedor: 'DHERNANDEZ',
    canal: 'MAYORISTA'
  },
  'vdacarce@gmail.com': {
    nombre: 'Cecilia Arce',
    nombreCorto: 'Cecilia',
    rol: 'facturador',
    grupo: 'operaciones',
    vendedor: null,
    canal: null
  },
  'vdaacallejas@gmail.com': {
    nombre: 'Bodega Villa Alegre',
    nombreCorto: 'Villa Alegre',
    rol: 'bodega',
    grupo: 'operaciones',
    vendedor: null,
    canal: null
  }
};

/* ============== EQUIPO COMERCIAL ============== */
const EQUIPO_COMERCIAL = [
  { email: 'vdasdeaguirre@gmail.com', vendedor: 'SEBASTIAN DE AGUIRRE', nombre: 'Sebastián', iniciales: 'SA', canal: 'Supermercado + Mayorista', color: '#0854A0' },
  { email: 'vdacossa@gmail.com', vendedor: 'CARLOS OSSA', nombre: 'Carlos', iniciales: 'CO', canal: 'MAYORISTA', color: '#1A9898' },
  { email: 'vdadhernandez@gmail.com', vendedor: 'DHERNANDEZ', nombre: 'Daniel', iniciales: 'DH', canal: 'MAYORISTA', color: '#C35500' },
  { email: 'vdajmontenegro@gmail.com', vendedor: 'JMMONTENEGRO', nombre: 'Juan Manuel', iniciales: 'JM', canal: 'MAYORISTA', color: '#5B738B' }
];

/* ============== MÓDULOS ============== */
const HOME_MODULOS_CONFIG = {
  emisor_nv: {
    titulo: 'Emisión NV',
    descripcion: 'Crear notas de venta',
    icono: 'document-text',
    color: '#0854A0'
  },
  aprobador: {
    titulo: 'Aprobador',
    descripcion: 'Validar notas de venta',
    icono: 'checklist',
    color: '#1A9898'
  },
  finanzas: {
    titulo: 'Finanzas',
    descripcion: 'Control de crédito',
    icono: 'money-bills',
    color: '#C35500'
  },
  facturador: {
    titulo: 'Facturador',
    descripcion: 'Emitir facturas',
    icono: 'receipt',
    color: '#5B738B'
  },
  comercial: {
    titulo: 'Comercial',
    descripcion: 'Análisis de ventas',
    icono: 'chart-line',
    color: '#0854A0'
  },
  deuda_clientes: {
    titulo: 'Deuda Clientes',
    descripcion: 'Cobranza y crédito',
    icono: 'credit-card',
    color: '#BB0000'
  },
  despacho: {
    titulo: 'Despacho',
    descripcion: 'Gestión de envíos',
    icono: 'truck',
    color: '#256F3A'
  },
  oc_supermercados: {
    titulo: 'OC Supermercados',
    descripcion: 'Órdenes de compra',
    icono: 'cart',
    color: '#1A9898'
  },
  stock: {
    titulo: 'Stock',
    descripcion: 'Control de inventario',
    icono: 'boxes',
    color: '#5B738B'
  },
  op_licores: {
    titulo: 'Op. Licores',
    descripcion: 'Análisis operacional',
    icono: 'analytics',
    color: '#840606'
  }
};

const HOME_MODULOS_POR_ROL = {
  admin: ['emisor_nv', 'aprobador', 'finanzas', 'facturador', 'comercial', 'deuda_clientes', 'despacho', 'oc_supermercados', 'stock', 'op_licores'],
  ceo: ['comercial', 'deuda_clientes', 'finanzas', 'despacho', 'op_licores', 'stock', 'oc_supermercados'],
  cfo: ['finanzas', 'deuda_clientes', 'comercial', 'despacho', 'op_licores', 'stock', 'oc_supermercados'],
  jefe_ventas: ['comercial', 'emisor_nv', 'deuda_clientes', 'despacho', 'oc_supermercados'],
  aprobador: ['aprobador', 'finanzas', 'comercial', 'emisor_nv', 'facturador', 'despacho', 'deuda_clientes', 'oc_supermercados', 'stock'],
  vendedor: ['emisor_nv', 'deuda_clientes', 'despacho', 'oc_supermercados', 'comercial'],
  facturador: ['facturador', 'despacho', 'oc_supermercados', 'stock'],
  bodega: ['despacho', 'oc_supermercados']
};

/* ============== CACHE ============== */
function _hCache() { return CacheService.getScriptCache(); }
function _hGet(k) { try { const c = _hCache().get('H_' + k); return c ? JSON.parse(c) : null; } catch(e) { return null; } }
function _hPut(k, d) { try { _hCache().put('H_' + k, JSON.stringify(d), HOME_CACHE_TTL); } catch(e) {} }

/* ============== API: CARGA COMBINADA (RÁPIDA) ============== */
function apiHomeLoad(emailOverride, mesSeleccionado) {
  const init = apiHomeInit(emailOverride);
  const kpis = apiHomeGetKPIs(emailOverride, mesSeleccionado);
  
  // Determinar si puede actualizar datos
  const rolesConRefresh = ['admin', 'ceo', 'cfo', 'jefe_ventas'];
  const puedeActualizar = rolesConRefresh.includes(init.usuario.rol);
  
  // Generar saludo contextual
  const saludoContexto = _generarSaludoContexto(init.usuario, kpis);
  
  return {
    // Datos de init
    emailReal: init.emailReal,
    emailActivo: init.emailActivo,
    isAdmin: init.isAdmin,
    isSimulando: init.isSimulando,
    usuario: init.usuario,
    fechaStr: init.fechaStr,
    saludoContexto: saludoContexto,
    mesActual: init.mesActual,
    anioActual: init.anioActual,
    modulos: init.modulos,
    listaUsuarios: init.listaUsuarios,
    mesesDisponibles: init.mesesDisponibles,
    puedeActualizar: puedeActualizar,
    // Datos de KPIs
    principales: kpis.principales,
    secundarios: kpis.secundarios,
    vendedores: kpis.vendedores,
    // Facturas del mes (solo para vendedores)
    facturasMes: kpis.facturasMes || [],
    mesFacturas: kpis.mesFacturas || null,
    esVendedor: init.usuario.rol === 'vendedor',
    rol: kpis.rol,
    mesSeleccionado: kpis.mesSeleccionado,
    anioSeleccionado: kpis.anioSeleccionado
  };
}

/* ============== SALUDO CONTEXTUAL ============== */
function _generarSaludoContexto(usuario, kpis) {
  try {
    const hora = new Date().getHours();
    let saludo = 'Hola';
    if (hora >= 5 && hora < 12) saludo = 'Buenos días';
    else if (hora >= 12 && hora < 19) saludo = 'Buenas tardes';
    else saludo = 'Buenas noches';
    
    const nombre = usuario.nombreCorto || usuario.nombre || 'Usuario';
    const rol = usuario.rol;
    
    // Buscar variación según rol
    let variacion = null;
    let mensaje = '';
    let emoji = '';
    
    if (rol === 'vendedor') {
      // Buscar KPI "Mi Venta del Mes" en principales
      const kpiVenta = (kpis.principales || []).find(k => k.id === 'mi-venta-mes');
      if (kpiVenta && kpiVenta.variacion !== null && kpiVenta.variacion !== undefined) {
        variacion = kpiVenta.variacion;
      }
    } else if (rol === 'jefe_ventas') {
      // Buscar KPI del equipo
      const kpiEquipo = (kpis.principales || []).find(k => k.id === 'equipo-mes');
      if (kpiEquipo && kpiEquipo.variacion !== null && kpiEquipo.variacion !== undefined) {
        variacion = kpiEquipo.variacion;
      }
    } else if (rol === 'ceo' || rol === 'cfo' || rol === 'admin') {
      // Buscar KPI de venta del mes en secundarios (para CEO/CFO es venta general)
      const kpiVenta = (kpis.secundarios || []).find(k => k.id === 'venta-mes');
      if (kpiVenta && kpiVenta.variacion !== null && kpiVenta.variacion !== undefined) {
        variacion = kpiVenta.variacion;
      }
    }
    
    // Generar mensaje según variación
    if (variacion !== null) {
      const varAbs = Math.abs(variacion).toFixed(1);
      if (variacion >= 20) {
        mensaje = '¡Excelente mes! Vas ↑' + varAbs + '% vs año anterior';
        emoji = '🚀';
      } else if (variacion >= 10) {
        mensaje = '¡Muy buen ritmo! Vas ↑' + varAbs + '% vs año anterior';
        emoji = '💪';
      } else if (variacion >= 0) {
        mensaje = 'Vas ↑' + varAbs + '% vs año anterior';
        emoji = '📈';
      } else if (variacion >= -10) {
        mensaje = 'Vas ↓' + varAbs + '% vs año anterior';
        emoji = '📊';
      } else if (variacion >= -20) {
        mensaje = 'Vas ↓' + varAbs + '% - ¡A recuperar terreno!';
        emoji = '💼';
      } else {
        mensaje = 'Vas ↓' + varAbs + '% - ¡Vamos con todo!';
        emoji = '🎯';
      }
    }
    
    return {
      saludo: saludo,
      nombre: nombre,
      mensaje: mensaje,
      emoji: emoji,
      tieneContexto: variacion !== null
    };
    
  } catch(e) {
    Logger.log('Error _generarSaludoContexto: ' + e.message);
    return {
      saludo: 'Hola',
      nombre: usuario.nombreCorto || 'Usuario',
      mensaje: '',
      emoji: '',
      tieneContexto: false
    };
  }
}

/* ============== API: DATOS INICIALES ============== */
function apiHomeInit(emailOverride) {
  const emailReal = (Session.getActiveUser().getEmail() || '').toLowerCase();
  const isAdmin = emailReal === 'cruizbusta@gmail.com';
  const emailActivo = (isAdmin && emailOverride) ? emailOverride.toLowerCase() : emailReal;
  
  const usuario = HOME_USUARIOS[emailActivo] || {
    nombre: emailActivo.split('@')[0],
    nombreCorto: emailActivo.split('@')[0],
    rol: 'visitante',
    grupo: 'visitante',
    vendedor: null,
    canal: null
  };
  
  // Fecha formateada
  const hoy = new Date();
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const fechaStr = dias[hoy.getDay()] + ' ' + hoy.getDate() + ' de ' + meses[hoy.getMonth()] + ', ' + hoy.getFullYear();
  
  // Módulos
  const modulosIds = HOME_MODULOS_POR_ROL[usuario.rol] || [];
  const modulos = modulosIds.map(id => ({
    id,
    ...HOME_MODULOS_CONFIG[id],
    url: getWebAppUrl() + '?page=' + id
  }));
  
  // Lista de usuarios para selector admin
  const listaUsuarios = isAdmin ? Object.entries(HOME_USUARIOS).map(([email, u]) => ({
    email,
    nombre: u.nombre,
    rol: u.rol
  })) : [];
  
  // Meses disponibles para selector (basado en datos reales)
  const mesesDisponibles = _getMesesConDatos();
  
  return {
    emailReal,
    emailActivo,
    isAdmin,
    isSimulando: isAdmin && emailOverride && emailOverride.toLowerCase() !== emailReal,
    usuario,
    fechaStr,
    mesActual: hoy.getMonth() + 1,
    anioActual: hoy.getFullYear(),
    modulos,
    listaUsuarios,
    mesesDisponibles
  };
}

/* ============== OBTENER MESES CON DATOS (con caché) ============== */
function _getMesesConDatos() {
  try {
    // Intentar obtener de caché primero
    const cached = _hGet('MESES_DATOS');
    if (cached && cached.length > 0) return cached;
    
    const year = new Date().getFullYear();
    const mesActual = new Date().getMonth() + 1;
    const { ok, data } = _c_readMaestroVenta();
    
    if (!ok || !data) {
      return _generarMesesHasta(mesActual);
    }
    
    // Filtrar solo el año actual
    const datosAnio = data.filter(i => i.year === year);
    
    // Obtener meses únicos con datos
    const mesesConDatos = new Set();
    datosAnio.forEach(i => {
      if (i.month >= 1 && i.month <= 12) {
        mesesConDatos.add(i.month);
      }
    });
    
    // Si no hay datos, retornar hasta mes actual
    if (mesesConDatos.size === 0) {
      return _generarMesesHasta(mesActual);
    }
    
    // Convertir a array ordenado
    const mesesArray = Array.from(mesesConDatos).sort((a, b) => a - b);
    
    // Generar lista con nombres
    const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    const result = mesesArray.map(m => ({
      valor: m,
      nombre: nombresMeses[m - 1],
      corto: nombresMeses[m - 1].slice(0, 3)
    }));
    
    // Guardar en caché
    _hPut('MESES_DATOS', result);
    
    return result;
    
  } catch(e) {
    Logger.log('Error _getMesesConDatos: ' + e.message);
    return _generarMesesHasta(new Date().getMonth() + 1);
  }
}

function _generarMesesHasta(hastaMes) {
  const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const result = [];
  for (let m = 1; m <= hastaMes; m++) {
    result.push({
      valor: m,
      nombre: nombresMeses[m - 1],
      corto: nombresMeses[m - 1].slice(0, 3)
    });
  }
  return result;
}

/* ============== API: KPIs POR ROL ============== */
function apiHomeGetKPIs(emailOverride, mesSeleccionado) {
  const init = apiHomeInit(emailOverride);
  const rol = init.usuario.rol;
  const vendedor = init.usuario.vendedor;
  const canal = init.usuario.canal;
  
  // Determinar mes a usar
  const mesReal = new Date().getMonth() + 1;
  const mes = mesSeleccionado ? Number(mesSeleccionado) : _getUltimoMesConDatos();
  
  let data = {};
  
  try {
    switch(rol) {
      case 'admin':
      case 'ceo':
        data = _buildKPIsCEO(mes);
        break;
      case 'cfo':
        data = _buildKPIsCFO(mes);
        break;
      case 'jefe_ventas':
        data = _buildKPIsJefeVentas(mes);
        break;
      case 'aprobador':
        data = _buildKPIsAprobador();
        break;
      case 'vendedor':
        data = _buildKPIsVendedor(vendedor, canal, mes);
        break;
      case 'facturador':
        data = _buildKPIsFacturador();
        break;
      case 'bodega':
        data = _buildKPIsBodega();
        break;
      default:
        data = { principales: [], secundarios: [], vendedores: [] };
    }
  } catch(e) {
    Logger.log('Error en apiHomeGetKPIs: ' + e.message);
    data = { principales: [], secundarios: [], vendedores: [], error: e.message };
  }
  
  return { 
    ...data, 
    rol, 
    usuario: init.usuario, 
    mesSeleccionado: mes,
    anioSeleccionado: new Date().getFullYear()
  };
}

/* ============== OBTENER ÚLTIMO MES CON DATOS (con caché) ============== */
function _getUltimoMesConDatos() {
  try {
    // Intentar obtener de caché primero
    const cached = _hGet('ULTIMO_MES');
    if (cached && cached.mes) return cached.mes;
    
    const year = new Date().getFullYear();
    const { ok, data } = _c_readMaestroVenta();
    
    if (!ok || !data) return new Date().getMonth() + 1;
    
    const datosAnio = data.filter(i => i.year === year);
    if (datosAnio.length === 0) return new Date().getMonth() + 1;
    
    // Encontrar el mes más alto con datos
    let maxMes = 1;
    datosAnio.forEach(i => {
      if (i.month > maxMes) maxMes = i.month;
    });
    
    // Guardar en caché por 15 minutos
    _hPut('ULTIMO_MES', { mes: maxMes });
    
    return maxMes;
  } catch(e) {
    return new Date().getMonth() + 1;
  }
}

/* ============== KPIs CEO (con margen integrado) ============== */
function _buildKPIsCEO(mesActual) {
  const cacheKey = 'KPI_CEO_' + mesActual;
  
  // Solo usar caché si es el mes con datos más reciente
  if (mesActual === _getUltimoMesConDatos()) {
    const cache = _hGet(cacheKey);
    if (cache) return cache;
  }
  
  const v = _calcVentasGlobal(mesActual);
  const d = _calcDeudaGlobal();
  const equipo = _calcVentasEquipo(mesActual);
  const year = new Date().getFullYear();
  
  // FILA 1: DEUDA (4 cards estrechas)
  const principales = [
    {
      id: 'deuda-total',
      titulo: 'Deuda Total',
      valor: d.total,
      formato: 'money',
      variacion: null,
      subtitulo: d.clientes + ' clientes activos',
      icono: 'wallet',
      estado: 'neutral',
      esVenta: false,
      esDeuda: true
    },
    {
      id: 'deuda-vencida',
      titulo: 'Deuda Vencida',
      valor: d.vencida,
      formato: 'money',
      variacion: null,
      subtitulo: Math.round(d.pctVencida) + '% del total',
      icono: 'alert-triangle',
      estado: d.pctVencida > 30 ? 'negative' : d.pctVencida > 15 ? 'warning' : 'positive',
      esVenta: false,
      esDeuda: true
    },
    {
      id: 'cheques-cartera',
      titulo: 'Cheques en Cartera',
      valor: d.chequesCartera,
      formato: 'money',
      variacion: null,
      subtitulo: 'Pendientes de cobro',
      icono: 'file-text',
      estado: 'neutral',
      esVenta: false,
      esDeuda: true
    },
    {
      id: 'deuda-no-doc',
      titulo: 'Deuda No Documentada',
      valor: d.deudaNoDocumentada,
      formato: 'money',
      variacion: null,
      subtitulo: 'Requiere formalización',
      icono: 'alert-circle',
      estado: d.deudaNoDocumentada > 0 ? 'warning' : 'positive',
      esVenta: false,
      esDeuda: true
    }
  ];
  
  // FILA 2: VENTAS (4 cards normales)
  const secundarios = [
    { 
      id: 'venta-mes', 
      titulo: 'Venta del Mes', 
      valor: v.ventaMes, 
      formato: 'money', 
      variacion: v.varMesYoY, 
      subtitulo: 'vs ' + _nombreMes(mesActual - 1) + ' ' + (year - 1),
      margen: v.margenMes,
      margenPct: v.margenPctMes,
      icono: 'chart-bar', 
      estado: v.varMesYoY >= 0 ? 'positive' : 'negative',
      esVenta: true 
    },
    { 
      id: 'venta-acum', 
      titulo: 'Venta Acumulada', 
      valor: v.ventaAcum, 
      formato: 'money', 
      variacion: v.varAcumYoY, 
      subtitulo: 'Ene - ' + _nombreMes(mesActual - 1) + ' ' + year,
      margen: v.margenAcum,
      margenPct: v.margenPctAcum,
      icono: 'trending-up', 
      estado: v.varAcumYoY >= 0 ? 'positive' : 'negative',
      esVenta: true 
    },
    { 
      id: 'mayorista-mes', 
      titulo: 'Mayorista (Mes)', 
      valor: v.mayoristaMes, 
      formato: 'money', 
      variacion: v.varMayMes, 
      icono: 'store',
      margen: v.margenMayMes,
      margenPct: v.margenPctMayMes,
      estado: v.varMayMes >= 0 ? 'positive' : 'negative',
      esVenta: true
    },
    { 
      id: 'super-mes', 
      titulo: 'Supermercado (Mes)', 
      valor: v.superMes, 
      formato: 'money', 
      variacion: v.varSuperMes, 
      icono: 'cart',
      margen: v.margenSuperMes,
      margenPct: v.margenPctSuperMes,
      estado: v.varSuperMes >= 0 ? 'positive' : 'negative',
      esVenta: true
    }
  ];
  
  // FILA 3: EQUIPO COMERCIAL
  const result = { principales, secundarios, vendedores: equipo };
  
  // Cachear
  if (mesActual === _getUltimoMesConDatos()) {
    _hPut(cacheKey, result);
  }
  
  return result;
}

/* ============== KPIs CFO ============== */
function _buildKPIsCFO(mesActual) {
  const cacheKey = 'KPI_CFO_' + mesActual;
  
  if (mesActual === _getUltimoMesConDatos()) {
    const cache = _hGet(cacheKey);
    if (cache) return cache;
  }
  
  const v = _calcVentasGlobal(mesActual);
  const d = _calcDeudaGlobal();
  const equipo = _calcVentasEquipo(mesActual);
  const year = new Date().getFullYear();
  
  // FILA 1: DEUDA (4 cards estrechas)
  const principales = [
    {
      id: 'deuda-total',
      titulo: 'Deuda Total',
      valor: d.total,
      formato: 'money',
      variacion: null,
      subtitulo: d.clientes + ' clientes activos',
      icono: 'wallet',
      estado: 'neutral',
      esVenta: false,
      esDeuda: true
    },
    {
      id: 'deuda-vencida',
      titulo: 'Deuda Vencida',
      valor: d.vencida,
      formato: 'money',
      variacion: null,
      subtitulo: Math.round(d.pctVencida) + '% del total',
      icono: 'alert-triangle',
      estado: d.pctVencida > 30 ? 'negative' : d.pctVencida > 15 ? 'warning' : 'positive',
      esVenta: false,
      esDeuda: true
    },
    {
      id: 'cheques-cartera',
      titulo: 'Cheques en Cartera',
      valor: d.chequesCartera,
      formato: 'money',
      variacion: null,
      subtitulo: 'Pendientes de cobro',
      icono: 'file-text',
      estado: 'neutral',
      esVenta: false,
      esDeuda: true
    },
    {
      id: 'deuda-no-doc',
      titulo: 'Deuda No Documentada',
      valor: d.deudaNoDocumentada,
      formato: 'money',
      variacion: null,
      subtitulo: 'Requiere formalización',
      icono: 'alert-circle',
      estado: d.deudaNoDocumentada > 0 ? 'warning' : 'positive',
      esVenta: false,
      esDeuda: true
    }
  ];
  
  // FILA 2: VENTAS (4 cards normales)
  const secundarios = [
    { 
      id: 'venta-mes', 
      titulo: 'Venta del Mes', 
      valor: v.ventaMes, 
      formato: 'money', 
      variacion: v.varMesYoY, 
      subtitulo: 'vs ' + _nombreMes(mesActual - 1) + ' ' + (year - 1),
      margen: v.margenMes,
      margenPct: v.margenPctMes,
      icono: 'chart-bar', 
      estado: v.varMesYoY >= 0 ? 'positive' : 'negative',
      esVenta: true 
    },
    { 
      id: 'venta-acum', 
      titulo: 'Venta Acumulada', 
      valor: v.ventaAcum, 
      formato: 'money', 
      variacion: v.varAcumYoY, 
      subtitulo: 'Ene - ' + _nombreMes(mesActual - 1) + ' ' + year,
      margen: v.margenAcum,
      margenPct: v.margenPctAcum,
      icono: 'trending-up', 
      estado: v.varAcumYoY >= 0 ? 'positive' : 'negative',
      esVenta: true 
    },
    { 
      id: 'mayorista-mes', 
      titulo: 'Mayorista (Mes)', 
      valor: v.mayoristaMes, 
      formato: 'money', 
      variacion: v.varMayMes, 
      icono: 'store',
      margen: v.margenMayMes,
      margenPct: v.margenPctMayMes,
      estado: v.varMayMes >= 0 ? 'positive' : 'negative',
      esVenta: true
    },
    { 
      id: 'super-mes', 
      titulo: 'Supermercado (Mes)', 
      valor: v.superMes, 
      formato: 'money', 
      variacion: v.varSuperMes, 
      icono: 'cart',
      margen: v.margenSuperMes,
      margenPct: v.margenPctSuperMes,
      estado: v.varSuperMes >= 0 ? 'positive' : 'negative',
      esVenta: true
    }
  ];
  
  // FILA 3: EQUIPO COMERCIAL
  const result = { principales, secundarios, vendedores: equipo };
  
  if (mesActual === _getUltimoMesConDatos()) {
    _hPut(cacheKey, result);
  }
  
  return result;
}

/* ============== KPIs JEFE DE VENTAS ============== */
function _buildKPIsJefeVentas(mesActual) {
  const cacheKey = 'KPI_JEFE_' + mesActual;
  
  if (mesActual === _getUltimoMesConDatos()) {
    const cache = _hGet(cacheKey);
    if (cache) return cache;
  }
  
  const equipo = _calcVentasEquipo(mesActual);
  const d = _calcDeudaGlobal();
  const year = new Date().getFullYear();
  
  // Totales del equipo
  let totalMes = 0, totalMesAnt = 0, totalAcum = 0, totalAcumAnt = 0;
  equipo.forEach(v => {
    totalMes += v.ventaMes;
    totalMesAnt += v.ventaMesAnt;
    totalAcum += v.ventaAcum;
    totalAcumAnt += v.ventaAcumAnt;
  });
  
  const varMes = totalMesAnt > 0 ? ((totalMes - totalMesAnt) / totalMesAnt) * 100 : 0;
  const varAcum = totalAcumAnt > 0 ? ((totalAcum - totalAcumAnt) / totalAcumAnt) * 100 : 0;
  
  const principales = [
    {
      id: 'equipo-mes',
      titulo: 'Venta Equipo',
      valor: totalMes,
      formato: 'money',
      variacion: varMes,
      subtitulo: _nombreMes(mesActual - 1) + ' ' + year,
      icono: 'users',
      estado: varMes >= 0 ? 'positive' : 'negative',
      esVenta: true
    },
    {
      id: 'equipo-acum',
      titulo: 'Acumulado Equipo',
      valor: totalAcum,
      formato: 'money',
      variacion: varAcum,
      subtitulo: 'Ene - ' + _nombreMes(mesActual - 1) + ' ' + year,
      icono: 'trending-up',
      estado: varAcum >= 0 ? 'positive' : 'negative',
      esVenta: true
    },
    {
      id: 'deuda-cartera',
      titulo: 'Deuda Cartera',
      valor: d.total,
      formato: 'money',
      variacion: null,
      subtitulo: d.clientes + ' clientes',
      icono: 'wallet',
      estado: 'neutral',
      esVenta: false
    },
    {
      id: 'deuda-vencida',
      titulo: 'Deuda Vencida',
      valor: d.vencida,
      formato: 'money',
      variacion: null,
      subtitulo: Math.round(d.pctVencida) + '% del total',
      icono: 'alert-triangle',
      estado: d.pctVencida > 30 ? 'negative' : 'warning',
      esVenta: false
    }
  ];
  
  const result = { principales, secundarios: [], vendedores: equipo };
  
  if (mesActual === _getUltimoMesConDatos()) {
    _hPut(cacheKey, result);
  }
  
  return result;
}

/* ============== KPIs VENDEDOR ============== */
function _buildKPIsVendedor(vendedor, canal, mesActual) {
  const cacheKey = 'KPI_V_' + (vendedor || 'x').replace(/\s/g, '_') + '_' + mesActual;
  
  if (mesActual === _getUltimoMesConDatos()) {
    const cache = _hGet(cacheKey);
    if (cache) return cache;
  }
  
  const v = _calcVentasVendedor(vendedor, canal, mesActual);
  const d = _calcDeudaVendedor(vendedor);
  const year = new Date().getFullYear();
  
  // Obtener facturas del mes actual (todas, no solo 5)
  const facturasMes = _getFacturasMesVendedor(vendedor, mesActual);
  
  const principales = [
    {
      id: 'mi-venta-mes',
      titulo: 'Mi Venta del Mes',
      valor: v.ventaMes,
      formato: 'money',
      variacion: v.varMesYoY,
      subtitulo: _nombreMes(mesActual - 1) + ' ' + year,
      icono: 'calendar',
      estado: v.varMesYoY >= 0 ? 'positive' : 'negative',
      esVenta: true
    },
    {
      id: 'mi-venta-acum',
      titulo: 'Mi Acumulado',
      valor: v.ventaAcum,
      formato: 'money',
      variacion: v.varAcumYoY,
      subtitulo: 'Ene - ' + _nombreMes(mesActual - 1) + ' ' + year,
      icono: 'trending-up',
      estado: v.varAcumYoY >= 0 ? 'positive' : 'negative',
      esVenta: true
    },
    {
      id: 'mi-deuda',
      titulo: 'Deuda Clientes',
      valor: d.total,
      formato: 'money',
      variacion: null,
      subtitulo: d.clientes + ' clientes',
      icono: 'wallet',
      estado: 'neutral',
      esVenta: false
    },
    {
      id: 'mi-cajas',
      titulo: 'Cajas del Mes',
      valor: v.cajasMes,
      formato: 'number',
      variacion: null,
      subtitulo: _nombreMes(mesActual - 1) + ' ' + year,
      icono: 'package',
      estado: 'neutral',
      esVenta: true
    }
  ];
  
  const secundarios = [
    { id: 'deuda-vencida', titulo: 'Deuda Vencida', valor: d.vencida, formato: 'money', icono: 'alert-triangle', estado: d.vencida > 0 ? 'negative' : 'positive', esVenta: false }
  ];
  
  const result = { 
    principales, 
    secundarios, 
    vendedores: [],
    facturasMes: facturasMes,
    mesFacturas: mesActual
  };
  
  if (mesActual === _getUltimoMesConDatos()) {
    _hPut(cacheKey, result);
  }
  
  return result;
}

/* ============== FACTURAS DEL MES PARA VENDEDOR ============== */
function _getFacturasMesVendedor(vendedor, mes) {
  try {
    const { ok, data } = _c_readMaestroVenta();
    if (!ok || !data) return [];
    
    const vLower = (vendedor || '').toLowerCase();
    const year = new Date().getFullYear();
    const mesActual = mes || (new Date().getMonth() + 1);
    
    // Filtrar por vendedor, año y mes
    const facturas = data.filter(i => 
      i.year === year && 
      i.month === mesActual &&
      (i.ejecutivo || '').toLowerCase() === vLower &&
      i.factura
    );
    
    // Agrupar por factura (puede haber múltiples líneas por factura)
    const facturasMap = {};
    facturas.forEach(f => {
      const key = f.factura;
      if (!facturasMap[key]) {
        facturasMap[key] = {
          factura: f.factura,
          nv: f.nv || '',
          fecha: f.fecha,
          cliente: f.cliente,
          neto: 0,
          cajas: 0
        };
      }
      facturasMap[key].neto += f.neto;
      facturasMap[key].cajas += f.cajas;
    });
    
    // Convertir a array y ordenar por NV descendente (más reciente primero)
    return Object.values(facturasMap)
      .sort((a, b) => {
        // Extraer número de NV para ordenar
        const nvA = String(a.nv || '').replace(/\D/g, '');
        const nvB = String(b.nv || '').replace(/\D/g, '');
        return Number(nvB) - Number(nvA);
      })
      .map(f => ({
        factura: f.factura,
        nv: f.nv,
        fecha: f.fecha,
        cliente: f.cliente,
        neto: Math.round(f.neto),
        cajas: Math.round(f.cajas)
      }));
      
  } catch(e) {
    Logger.log('Error _getFacturasMesVendedor: ' + e.message);
    return [];
  }
}

/* ============== KPIs APROBADOR ============== */
function _buildKPIsAprobador() {
  const cache = _hGet('KPI_APROB');
  if (cache) return cache;
  
  const nv = _calcNVPendientes();
  
  const principales = [
    {
      id: 'pendientes',
      titulo: 'NV Pendientes',
      valor: nv.pendientes,
      formato: 'number',
      variacion: null,
      subtitulo: 'Requieren aprobación',
      icono: 'clock',
      estado: nv.pendientes > 5 ? 'warning' : nv.pendientes > 0 ? 'neutral' : 'positive',
      esVenta: false
    },
    {
      id: 'vb-financiero',
      titulo: 'V°B° Financiero',
      valor: nv.vbFinanciero,
      formato: 'number',
      variacion: null,
      subtitulo: 'Bajo mínimo autorizado',
      icono: 'shield-check',
      estado: nv.vbFinanciero > 0 ? 'warning' : 'positive',
      esVenta: false
    },
    {
      id: 'aprobadas-hoy',
      titulo: 'Aprobadas Hoy',
      valor: nv.aprobadasHoy,
      formato: 'number',
      variacion: null,
      subtitulo: 'Procesadas',
      icono: 'check-circle',
      estado: 'positive',
      esVenta: false
    },
    {
      id: 'total-pend-facturar',
      titulo: 'Por Facturar',
      valor: nv.porFacturar,
      formato: 'number',
      variacion: null,
      subtitulo: 'Aprobadas, sin factura',
      icono: 'file-text',
      estado: 'neutral',
      esVenta: false
    }
  ];
  
  const result = { principales, secundarios: [], vendedores: [] };
  _hPut('KPI_APROB', result);
  return result;
}

/* ============== KPIs FACTURADOR ============== */
function _buildKPIsFacturador() {
  const cache = _hGet('KPI_FACT');
  if (cache) return cache;
  
  const nv = _calcNVPendientes();
  
  const principales = [
    {
      id: 'por-facturar',
      titulo: 'Por Facturar',
      valor: nv.porFacturar,
      formato: 'number',
      variacion: null,
      subtitulo: 'NV aprobadas',
      icono: 'file-text',
      estado: nv.porFacturar > 10 ? 'warning' : 'neutral',
      esVenta: false
    },
    {
      id: 'facturadas-hoy',
      titulo: 'Facturadas Hoy',
      valor: nv.facturadasHoy,
      formato: 'number',
      variacion: null,
      subtitulo: 'Procesadas',
      icono: 'check-circle',
      estado: 'positive',
      esVenta: false
    },
    {
      id: 'despachos-pend',
      titulo: 'Despachos Pend.',
      valor: nv.despachosPend,
      formato: 'number',
      variacion: null,
      subtitulo: 'Por enviar',
      icono: 'truck',
      estado: nv.despachosPend > 5 ? 'warning' : 'neutral',
      esVenta: false
    }
  ];
  
  const result = { principales, secundarios: [], vendedores: [] };
  _hPut('KPI_FACT', result);
  return result;
}

/* ============== KPIs BODEGA ============== */
function _buildKPIsBodega() {
  const cache = _hGet('KPI_BOD');
  if (cache) return cache;
  
  const nv = _calcNVPendientes();
  
  const principales = [
    {
      id: 'despachos-pend',
      titulo: 'Despachos Pendientes',
      valor: nv.despachosPend,
      formato: 'number',
      variacion: null,
      subtitulo: 'Por preparar y enviar',
      icono: 'truck',
      estado: nv.despachosPend > 10 ? 'warning' : nv.despachosPend > 0 ? 'neutral' : 'positive',
      esVenta: false
    },
    {
      id: 'despachados-hoy',
      titulo: 'Despachados Hoy',
      valor: nv.despachadosHoy,
      formato: 'number',
      variacion: null,
      subtitulo: 'Enviados',
      icono: 'check-circle',
      estado: 'positive',
      esVenta: false
    }
  ];
  
  const result = { principales, secundarios: [], vendedores: [] };
  _hPut('KPI_BOD', result);
  return result;
}

/* ============================================================
   FUNCIONES DE CÁLCULO
   ============================================================ */

function _calcVentasGlobal(mesActual) {
  try {
    const year = new Date().getFullYear();
    const mes = mesActual || (new Date().getMonth() + 1);
    const yearAnt = year - 1;
    
    const { ok, data } = _c_readMaestroVenta();
    if (!ok || !data) return _ventasVacias();
    
    const anio = data.filter(i => i.year === year);
    const anioAnt = data.filter(i => i.year === yearAnt);
    
    const sum = (arr, field) => arr.reduce((s, i) => s + (i[field] || 0), 0);
    
    // Mes seleccionado
    const datosMes = anio.filter(i => i.month === mes);
    const datosMesAnt = anioAnt.filter(i => i.month === mes);
    
    const ventaMes = sum(datosMes, 'neto');
    const ventaMesAnt = sum(datosMesAnt, 'neto');
    const margenMes = sum(datosMes, 'margen');
    const margenPctMes = ventaMes > 0 ? (margenMes / ventaMes) * 100 : 0;
    
    // Acumulado hasta el mes seleccionado
    const datosAcum = anio.filter(i => i.month <= mes);
    const datosAcumAnt = anioAnt.filter(i => i.month <= mes);
    
    const ventaAcum = sum(datosAcum, 'neto');
    const ventaAcumAnt = sum(datosAcumAnt, 'neto');
    const margenAcum = sum(datosAcum, 'margen');
    const margenPctAcum = ventaAcum > 0 ? (margenAcum / ventaAcum) * 100 : 0;
    
    // Mayorista Mes
    const mayMes = datosMes.filter(i => (i.clasificacion || '').toUpperCase() === 'MAYORISTA');
    const mayMesAnt = datosMesAnt.filter(i => (i.clasificacion || '').toUpperCase() === 'MAYORISTA');
    const mayoristaMes = sum(mayMes, 'neto');
    const mayoristaMesAnt = sum(mayMesAnt, 'neto');
    const margenMayMes = sum(mayMes, 'margen');
    const margenPctMayMes = mayoristaMes > 0 ? (margenMayMes / mayoristaMes) * 100 : 0;
    
    // Supermercado Mes
    const superMesData = datosMes.filter(i => (i.clasificacion || '').toUpperCase() === 'SUPERMERCADO');
    const superMesAntData = datosMesAnt.filter(i => (i.clasificacion || '').toUpperCase() === 'SUPERMERCADO');
    const superMes = sum(superMesData, 'neto');
    const superMesAnt = sum(superMesAntData, 'neto');
    const margenSuperMes = sum(superMesData, 'margen');
    const margenPctSuperMes = superMes > 0 ? (margenSuperMes / superMes) * 100 : 0;
    
    const cajasMes = sum(datosMes, 'cajas');
    
    return {
      ventaMes: Math.round(ventaMes),
      ventaMesAnt: Math.round(ventaMesAnt),
      varMesYoY: ventaMesAnt > 0 ? Math.round(((ventaMes - ventaMesAnt) / ventaMesAnt) * 1000) / 10 : 0,
      margenMes: Math.round(margenMes),
      margenPctMes: Math.round(margenPctMes * 10) / 10,
      
      ventaAcum: Math.round(ventaAcum),
      ventaAcumAnt: Math.round(ventaAcumAnt),
      varAcumYoY: ventaAcumAnt > 0 ? Math.round(((ventaAcum - ventaAcumAnt) / ventaAcumAnt) * 1000) / 10 : 0,
      margenAcum: Math.round(margenAcum),
      margenPctAcum: Math.round(margenPctAcum * 10) / 10,
      
      mayoristaMes: Math.round(mayoristaMes),
      varMayMes: mayoristaMesAnt > 0 ? Math.round(((mayoristaMes - mayoristaMesAnt) / mayoristaMesAnt) * 1000) / 10 : 0,
      margenMayMes: Math.round(margenMayMes),
      margenPctMayMes: Math.round(margenPctMayMes * 10) / 10,
      
      superMes: Math.round(superMes),
      varSuperMes: superMesAnt > 0 ? Math.round(((superMes - superMesAnt) / superMesAnt) * 1000) / 10 : 0,
      margenSuperMes: Math.round(margenSuperMes),
      margenPctSuperMes: Math.round(margenPctSuperMes * 10) / 10,
      
      cajasMes: Math.round(cajasMes)
    };
  } catch(e) {
    Logger.log('Error _calcVentasGlobal: ' + e.message);
    return _ventasVacias();
  }
}

function _calcVentasEquipo(mesActual) {
  try {
    const year = new Date().getFullYear();
    const mes = mesActual || (new Date().getMonth() + 1);
    const yearAnt = year - 1;
    
    const { ok, data } = _c_readMaestroVenta();
    if (!ok || !data) return [];
    
    const sum = (arr, field) => arr.reduce((s, i) => s + (i[field] || 0), 0);
    
    return EQUIPO_COMERCIAL.map(vendedor => {
      const filtro = data.filter(i => 
        (i.ejecutivo || '').toLowerCase() === vendedor.vendedor.toLowerCase()
      );
      
      // Año actual
      const anio = filtro.filter(i => i.year === year);
      const anioAnt = filtro.filter(i => i.year === yearAnt);
      
      // Mes seleccionado
      const datosMes = anio.filter(i => i.month === mes);
      const datosMesAnt = anioAnt.filter(i => i.month === mes);
      
      const ventaMes = sum(datosMes, 'neto');
      const ventaMesAnt = sum(datosMesAnt, 'neto');
      const margenMes = sum(datosMes, 'margen');
      
      // Acumulado hasta el mes seleccionado
      const datosAcum = anio.filter(i => i.month <= mes);
      const datosAcumAnt = anioAnt.filter(i => i.month <= mes);
      
      const ventaAcum = sum(datosAcum, 'neto');
      const ventaAcumAnt = sum(datosAcumAnt, 'neto');
      const margenAcum = sum(datosAcum, 'margen');
      
      return {
        nombre: vendedor.nombre,
        vendedor: vendedor.vendedor,
        iniciales: vendedor.iniciales,
        color: vendedor.color,
        canal: vendedor.canal,
        
        ventaMes: Math.round(ventaMes),
        ventaMesAnt: Math.round(ventaMesAnt),
        varMes: ventaMesAnt > 0 ? Math.round(((ventaMes - ventaMesAnt) / ventaMesAnt) * 1000) / 10 : 0,
        margenMes: Math.round(margenMes),
        margenPctMes: ventaMes > 0 ? Math.round((margenMes / ventaMes) * 1000) / 10 : 0,
        
        ventaAcum: Math.round(ventaAcum),
        ventaAcumAnt: Math.round(ventaAcumAnt),
        varAcum: ventaAcumAnt > 0 ? Math.round(((ventaAcum - ventaAcumAnt) / ventaAcumAnt) * 1000) / 10 : 0,
        margenAcum: Math.round(margenAcum),
        margenPctAcum: ventaAcum > 0 ? Math.round((margenAcum / ventaAcum) * 1000) / 10 : 0
      };
    }).sort((a, b) => b.ventaMes - a.ventaMes);
    
  } catch(e) {
    Logger.log('Error _calcVentasEquipo: ' + e.message);
    return [];
  }
}

function _calcVentasVendedor(vendedor, canal, mesActual) {
  try {
    const year = new Date().getFullYear();
    const mes = mesActual || (new Date().getMonth() + 1);
    const yearAnt = year - 1;
    const vLower = (vendedor || '').toLowerCase();
    
    const { ok, data } = _c_readMaestroVenta();
    if (!ok || !data) return _ventasVacias();
    
    let anio = data.filter(i => i.year === year && (i.ejecutivo || '').toLowerCase() === vLower);
    let anioAnt = data.filter(i => i.year === yearAnt && (i.ejecutivo || '').toLowerCase() === vLower);
    
    if (canal) {
      anio = anio.filter(i => (i.clasificacion || '').toUpperCase() === canal.toUpperCase());
      anioAnt = anioAnt.filter(i => (i.clasificacion || '').toUpperCase() === canal.toUpperCase());
    }
    
    const ventaMes = anio.filter(i => i.month === mes).reduce((s, i) => s + (i.neto || 0), 0);
    const ventaMesAnt = anioAnt.filter(i => i.month === mes).reduce((s, i) => s + (i.neto || 0), 0);
    const ventaAcum = anio.filter(i => i.month <= mes).reduce((s, i) => s + (i.neto || 0), 0);
    const ventaAcumAnt = anioAnt.filter(i => i.month <= mes).reduce((s, i) => s + (i.neto || 0), 0);
    const cajasMes = anio.filter(i => i.month === mes).reduce((s, i) => s + (i.cajas || 0), 0);
    
    return {
      ventaMes: Math.round(ventaMes),
      varMesYoY: ventaMesAnt > 0 ? Math.round(((ventaMes - ventaMesAnt) / ventaMesAnt) * 1000) / 10 : 0,
      ventaAcum: Math.round(ventaAcum),
      varAcumYoY: ventaAcumAnt > 0 ? Math.round(((ventaAcum - ventaAcumAnt) / ventaAcumAnt) * 1000) / 10 : 0,
      cajasMes: Math.round(cajasMes)
    };
  } catch(e) {
    return _ventasVacias();
  }
}

function _calcDeudaGlobal() {
  try {
    const result = apiDeudaGetResumen({ q: '', minDeuda: 0 });
    if (!result.ok) return { total: 0, vencida: 0, pctVencida: 0, clientes: 0, sobregirados: 0, creditoTotal: 0, creditoDisponible: 0, chequesCartera: 0, deudaNoDocumentada: 0 };
    
    const items = result.items || [];
    const kpis = result.kpis || {};
    
    return {
      total: Math.round(kpis.deudaTotal || 0),
      vencida: Math.round(kpis.vencida || 0),
      pctVencida: kpis.pctVencida || 0,
      clientes: kpis.clientes || items.length,
      clientesVencidos: kpis.buckets ? (kpis.buckets.d1_30 + kpis.buckets.d31_60 + kpis.buckets.d61_90 + kpis.buckets.d90p) : 0,
      sobregirados: kpis.sobregirados || kpis.sobregiro || 0,
      creditoTotal: Math.round(kpis.creditoTotal || 0),
      creditoDisponible: Math.round(kpis.disponibleTotal || 0),
      chequesCartera: Math.round(kpis.chequesCartera || 0),
      deudaNoDocumentada: Math.round(kpis.deudaNoDocumentada || 0)
    };
  } catch(e) {
    Logger.log('Error _calcDeudaGlobal: ' + e.message);
    return { total: 0, vencida: 0, pctVencida: 0, clientes: 0, sobregirados: 0, creditoTotal: 0, creditoDisponible: 0, chequesCartera: 0, deudaNoDocumentada: 0 };
  }
}

function _calcDeudaVendedor(vendedor) {
  try {
    const result = apiDeudaGetResumen({ q: '', minDeuda: 0 });
    if (!result.ok) return { total: 0, vencida: 0, clientes: 0 };
    
    let items = result.items || [];
    
    if (vendedor) {
      const vLower = vendedor.toLowerCase();
      items = items.filter(c => (c.canales || []).some(canal => canal.toLowerCase().includes(vLower)));
    }
    
    const total = items.reduce((s, c) => s + (c.totalDeuda || 0), 0);
    const vencida = items.reduce((s, c) => s + (c.vencida || 0), 0);
    
    return { total: Math.round(total), vencida: Math.round(vencida), clientes: items.length };
  } catch(e) {
    return { total: 0, vencida: 0, clientes: 0 };
  }
}

function _calcNVPendientes() {
  try {
    const sh = _getSheet().getSheetByName(CONFIG.HOJAS.NV_BASE);
    if (!sh) return { pendientes: 0, vbFinanciero: 0, porFacturar: 0, aprobadasHoy: 0, facturadasHoy: 0, despachosPend: 0, despachadosHoy: 0 };
    
    const data = sh.getDataRange().getValues();
    if (data.length < 2) return { pendientes: 0, vbFinanciero: 0, porFacturar: 0, aprobadasHoy: 0, facturadasHoy: 0, despachosPend: 0, despachadosHoy: 0 };
    
    const h = data[0];
    const colEstado = _findColumn(h, ['Estado Nota Venta', 'Estado']);
    const colVB = _findColumn(h, ['V°B° Financiero', 'VB Financiero']);
    const colFecha = _findColumn(h, ['Fecha NV', 'Fecha']);
    
    const hoy = new Date().toISOString().slice(0, 10);
    
    const nvPendientes = new Set();
    const nvVB = new Set();
    const nvPorFacturar = new Set();
    const nvAprobadasHoy = new Set();
    const nvFacturadasHoy = new Set();
    const nvDespachosPend = new Set();
    const nvDespachadosHoy = new Set();
    
    for (let i = 1; i < data.length; i++) {
      const nv = data[i][0];
      const estado = String(data[i][colEstado] || '').toUpperCase();
      const vb = colVB > -1 ? String(data[i][colVB] || '').toLowerCase() : '';
      const fecha = colFecha > -1 ? data[i][colFecha] : null;
      
      let fechaStr = '';
      if (fecha instanceof Date) fechaStr = fecha.toISOString().slice(0, 10);
      else if (fecha) fechaStr = String(fecha).slice(0, 10);
      
      if (estado === 'PENDIENTE') {
        nvPendientes.add(nv);
        if (vb.includes('requiere')) nvVB.add(nv);
      }
      
      if (estado === 'APROBADO' || estado === 'APROBADA') {
        nvPorFacturar.add(nv);
        if (fechaStr === hoy) nvAprobadasHoy.add(nv);
      }
      
      if (estado === 'FACTURADO' || estado === 'FACTURADA') {
        nvDespachosPend.add(nv);
        if (fechaStr === hoy) nvFacturadasHoy.add(nv);
      }
      
      if (estado === 'DESPACHADO' || estado === 'DESPACHADA' || estado === 'ENTREGADO') {
        if (fechaStr === hoy) nvDespachadosHoy.add(nv);
      }
    }
    
    return {
      pendientes: nvPendientes.size,
      vbFinanciero: nvVB.size,
      porFacturar: nvPorFacturar.size,
      aprobadasHoy: nvAprobadasHoy.size,
      facturadasHoy: nvFacturadasHoy.size,
      despachosPend: nvDespachosPend.size,
      despachadosHoy: nvDespachadosHoy.size
    };
  } catch(e) {
    Logger.log('Error _calcNVPendientes: ' + e.message);
    return { pendientes: 0, vbFinanciero: 0, porFacturar: 0, aprobadasHoy: 0, facturadasHoy: 0, despachosPend: 0, despachadosHoy: 0 };
  }
}

/* ============== HELPERS ============== */
function _ventasVacias() {
  return { 
    ventaMes: 0, varMesYoY: 0, margenMes: 0, margenPctMes: 0,
    ventaAcum: 0, varAcumYoY: 0, margenAcum: 0, margenPctAcum: 0,
    mayoristaMes: 0, varMayMes: 0, margenMayMes: 0, margenPctMayMes: 0,
    superMes: 0, varSuperMes: 0, margenSuperMes: 0, margenPctSuperMes: 0,
    cajasMes: 0
  };
}

function _nombreMes(m) {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return meses[m] || '';
}

function _fmtMoney(n) {
  if (n >= 1000000000) return Math.round(n / 1000000000) + 'B';
  if (n >= 1000000) return Math.round(n / 1000000) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return Math.round(n);
}

/* ============== EXPORTAR FACTURAS A EXCEL (.xlsx) ============== */
/**
 * Genera un archivo Excel con las facturas del mes para el vendedor
 * Retorna el archivo en base64 para descarga desde el frontend
 */
function apiHomeExportFacturasExcel(emailOverride, mes) {
  try {
    const emailReal = (Session.getActiveUser().getEmail() || '').toLowerCase();
    const emailActivo = emailOverride ? emailOverride.toLowerCase() : emailReal;
    const usuario = HOME_USUARIOS[emailActivo];
    
    if (!usuario) {
      return { ok: false, error: 'Usuario no encontrado' };
    }
    
    // Solo para vendedores
    if (usuario.rol !== 'vendedor') {
      return { ok: false, error: 'Solo disponible para vendedores' };
    }
    
    const mesNum = Number(mes) || (new Date().getMonth() + 1);
    const facturas = _getFacturasMesVendedor(usuario.vendedor, mesNum);
    
    if (!facturas || facturas.length === 0) {
      return { ok: false, error: 'No hay facturas para exportar' };
    }
    
    // Crear spreadsheet temporal
    const ss = SpreadsheetApp.create('Facturas_Temp_' + Date.now());
    const sheet = ss.getActiveSheet();
    sheet.setName('Facturas');
    
    // Nombres de meses
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = meses[mesNum - 1];
    const year = new Date().getFullYear();
    
    // Título
    sheet.getRange('A1').setValue('Facturas ' + usuario.nombreCorto + ' - ' + mesNombre + ' ' + year);
    sheet.getRange('A1:F1').merge().setFontWeight('bold').setFontSize(14);
    
    // Headers
    const headers = ['Factura', 'NV', 'Fecha', 'Cliente', 'Neto', 'Cajas'];
    sheet.getRange('A3:F3').setValues([headers])
      .setFontWeight('bold')
      .setBackground('#354A5F')
      .setFontColor('white');
    
    // Datos
    let totalNeto = 0, totalCajas = 0;
    const dataRows = facturas.map(f => {
      totalNeto += f.neto || 0;
      totalCajas += f.cajas || 0;
      return [
        f.factura || '',
        f.nv || '',
        f.fecha || '',
        f.cliente || '',
        f.neto || 0,
        f.cajas || 0
      ];
    });
    
    if (dataRows.length > 0) {
      sheet.getRange(4, 1, dataRows.length, 6).setValues(dataRows);
    }
    
    // Fila de totales
    const totalRow = 4 + dataRows.length;
    sheet.getRange(totalRow, 1, 1, 6).setValues([
      ['', '', '', 'TOTAL (' + facturas.length + ' facturas)', totalNeto, totalCajas]
    ]).setFontWeight('bold').setBackground('#F0F0F0');
    
    // Formato de números
    sheet.getRange(4, 5, dataRows.length + 1, 1).setNumberFormat('$#,##0');
    sheet.getRange(4, 6, dataRows.length + 1, 1).setNumberFormat('#,##0');
    
    // Ajustar anchos de columna
    sheet.setColumnWidth(1, 100); // Factura
    sheet.setColumnWidth(2, 80);  // NV
    sheet.setColumnWidth(3, 100); // Fecha
    sheet.setColumnWidth(4, 250); // Cliente
    sheet.setColumnWidth(5, 120); // Neto
    sheet.setColumnWidth(6, 80);  // Cajas
    
    // Bordes
    const dataRange = sheet.getRange(3, 1, dataRows.length + 2, 6);
    dataRange.setBorder(true, true, true, true, true, true);
    
    // Guardar cambios
    SpreadsheetApp.flush();
    
    // Exportar como Excel
    const fileId = ss.getId();
    const url = 'https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=xlsx';
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    const blob = response.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    
    // Eliminar spreadsheet temporal
    DriveApp.getFileById(fileId).setTrashed(true);
    
    return {
      ok: true,
      base64: base64,
      filename: 'Facturas_' + usuario.nombreCorto + '_' + mesNombre + '_' + year + '.xlsx'
    };
    
  } catch(e) {
    Logger.log('Error apiHomeExportFacturasExcel: ' + e.message);
    return { ok: false, error: e.message };
  }
}
/* ============================================================
 *  MÓDULO DE REPORTERÍA EJECUTIVA - VDA - VERSIÓN CORREGIDA
 *  ========================================================== */

function apiReporteEjecutivoExcel(params) {
  try {
    const emailReal = (Session.getActiveUser().getEmail() || '').toLowerCase();
    const usuario = HOME_USUARIOS[emailReal];
    
    const rolesPermitidos = ['admin', 'ceo', 'cfo'];
    if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
      return { ok: false, error: 'Sin permisos para generar reportes' };
    }
    
    const mes = params.mes || new Date().getMonth() + 1;
    const year = params.year || new Date().getFullYear();
    const incluirDetalle = params.incluirDetalle !== false;
    
    Logger.log('📊 Generando reporte: ' + _nombreMes(mes - 1) + ' ' + year);
    
    const ss = SpreadsheetApp.create('Reporte_VDA_Temp_' + Date.now());
    
    // Generar hojas
    _crearHojaResumenEjecutivo(ss, mes, year);
    _crearHojaVentasPorCanal(ss, mes, year);
    _crearHojaVentasPorCategoria(ss, mes, year);
    _crearHojaVentasPorCategoriaCanal(ss, mes, year); // NUEVA
    _crearHojaVentasPorMarca(ss, mes, year);
    _crearHojaVentasPorMarcaCanal(ss, mes, year); // NUEVA
    _crearHojaTopClientes(ss, mes, year);
    _crearHojaDesempenoEjecutivos(ss, mes, year);
    _crearHojaAnalisisLineaVino(ss, mes, year);
    _crearHojaPreciosMargen(ss, mes, year);
    
    if (incluirDetalle) {
      _crearHojaDetalleTransaccional(ss, mes, year);
    }
    
    const defaultSheet = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
    if (defaultSheet) ss.deleteSheet(defaultSheet);
    
    SpreadsheetApp.flush();
    
    const fileId = ss.getId();
    const url = 'https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=xlsx';
    const token = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    const blob = response.getBlob();
    const base64 = Utilities.base64Encode(blob.getBytes());
    
    DriveApp.getFileById(fileId).setTrashed(true);
    
    const nombreArchivo = 'Reporte_Ventas_VDA_' + _nombreMes(mes - 1) + '_' + year + '.xlsx';
    
    return {
      ok: true,
      base64: base64,
      filename: nombreArchivo,
      size: blob.getBytes().length
    };
    
  } catch(e) {
    Logger.log('❌ Error apiReporteEjecutivoExcel: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
 *  HOJA 1: RESUMEN EJECUTIVO - CORREGIDO
 *  ========================================================== */
function _crearHojaResumenEjecutivo(ss, mes, year) {
  const sheet = ss.insertSheet('📊 Resumen Ejecutivo', 0);
  
  const v = _calcVentasGlobal(mes);
  const d = _calcDeudaGlobal();
  const equipo = _calcVentasEquipo(mes);
  
  const mesAnterior = mes > 1 ? mes - 1 : 12;
  const yearAnterior = mes > 1 ? year : year - 1;
  const vMesAnt = _calcVentasGlobal(mesAnterior);
  
  // TÍTULO
  sheet.getRange('A1:I1').merge()
    .setValue('REPORTE EJECUTIVO DE VENTAS - VIÑA DE AGUIRRE')
    .setFontSize(16)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);
  
  sheet.getRange('A2:I2').merge()
    .setValue(_nombreMes(mes - 1) + ' ' + year)
    .setFontSize(12)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A3').setValue('');
  
  // KPIs PRINCIPALES
  sheet.getRange('A4').setValue('💼 KPIs PRINCIPALES')
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#F0F0F0');
  
  const kpisHeaders = ['Métrica', 'Mes Actual', 'Mes Anterior', 'Variación $', 'Variación %', 'Acumulado Año', 'Año Anterior', 'Var % YoY', 'Margen %'];
  sheet.getRange('A5:I5').setValues([kpisHeaders])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  const kpisData = [
    ['Venta Total', v.ventaMes, vMesAnt.ventaMes, v.ventaMes - vMesAnt.ventaMes, v.varMesYoY, v.ventaAcum, v.ventaAcumAnt, v.varAcumYoY, v.margenPctMes],
    ['Mayorista', v.mayoristaMes, 0, 0, v.varMayMes, 0, 0, 0, v.margenPctMayMes],
    ['Supermercado', v.superMes, 0, 0, v.varSuperMes, 0, 0, 0, v.margenPctSuperMes],
    ['Margen Total ($)', v.margenMes, 0, 0, 0, v.margenAcum, 0, 0, 0],
    ['Cajas Vendidas', v.cajasMes, 0, 0, 0, 0, 0, 0, 0]
  ];
  
  sheet.getRange(6, 1, kpisData.length, 9).setValues(kpisData);
  
  // FORMATO
  sheet.getRange('B6:D10').setNumberFormat('$#,##0');
  sheet.getRange('E6:E10').setNumberFormat('0.0"%"');
  sheet.getRange('F6:G10').setNumberFormat('$#,##0');
  sheet.getRange('H6:H10').setNumberFormat('0.0"%"');
  sheet.getRange('I6:I10').setNumberFormat('0.0"%"');
  
  // COMPARATIVO 2024 vs 2025 (NUEVO)
  sheet.getRange('A12').setValue('📊 COMPARATIVO ' + year + ' vs ' + (year - 1))
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#F0F0F0');
  
  const compHeaders = ['Período', 'Venta', 'Cajas', 'Margen $', 'Margen %'];
  sheet.getRange('A13:E13').setValues([compHeaders])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF');
  
  const compData = [
    [year + ' (Ene - ' + _nombreMes(mes - 1) + ')', v.ventaAcum, v.cajasAcum, v.margenAcum, v.margenPctAcum],
    [(year - 1) + ' (Ene - ' + _nombreMes(mes - 1) + ')', v.ventaAcumAnt, v.cajasAcumAnt, v.margenAcumAnt, v.margenPctAcumAnt],
    ['Diferencia', v.ventaAcum - v.ventaAcumAnt, v.cajasAcum - v.cajasAcumAnt, v.margenAcum - v.margenAcumAnt, v.margenPctAcum - v.margenPctAcumAnt]
  ];
  
  sheet.getRange(14, 1, 3, 5).setValues(compData);
  sheet.getRange('B14:D16').setNumberFormat('$#,##0');
  sheet.getRange('E14:E16').setNumberFormat('0.0"%"');
  sheet.getRange('A16:E16').setFontWeight('bold').setBackground('#F0F0F0');
  
  // DEUDA
  sheet.getRange('A18').setValue('💰 ANÁLISIS DE DEUDA')
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#F0F0F0');
  
  const deudaHeaders = ['Concepto', 'Monto', '% del Total'];
  sheet.getRange('A19:C19').setValues([deudaHeaders])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF');
  
  const deudaData = [
    ['Deuda Total', d.total, 100],
    ['Deuda Vencida', d.vencida, d.pctVencida],
    ['Cheques en Cartera', d.chequesCartera, d.total > 0 ? (d.chequesCartera / d.total) * 100 : 0],
    ['Deuda No Documentada', d.deudaNoDocumentada, d.total > 0 ? (d.deudaNoDocumentada / d.total) * 100 : 0],
    ['Crédito Disponible', d.creditoDisponible, d.creditoTotal > 0 ? (d.creditoDisponible / d.creditoTotal) * 100 : 0]
  ];
  
  sheet.getRange(20, 1, deudaData.length, 3).setValues(deudaData);
  sheet.getRange('B20:B24').setNumberFormat('$#,##0');
  sheet.getRange('C20:C24').setNumberFormat('0.0"%"');
  
  // RANKING VENDEDORES
  sheet.getRange('A26').setValue('🏆 RANKING VENDEDORES')
    .setFontWeight('bold')
    .setFontSize(11)
    .setBackground('#F0F0F0');
  
  const vendHeaders = ['#', 'Vendedor', 'Venta Mes', 'Var %', 'Venta Acum', 'Cajas Mes', 'Cajas Acum', 'Margen %'];
  sheet.getRange('A27:H27').setValues([vendHeaders])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF');
  
  let row = 28;
  equipo.forEach((v, i) => {
    sheet.getRange(row, 1, 1, 8).setValues([[
      i + 1,
      v.nombre,
      v.ventaMes,
      v.varMes,
      v.ventaAcum,
      v.cajasMes,
      v.cajasAcum,
      v.margenPctMes
    ]]);
    row++;
  });
  
  sheet.getRange(28, 3, equipo.length, 1).setNumberFormat('$#,##0');
  sheet.getRange(28, 4, equipo.length, 1).setNumberFormat('0.0"%"');
  sheet.getRange(28, 5, equipo.length, 1).setNumberFormat('$#,##0');
  sheet.getRange(28, 6, equipo.length, 2).setNumberFormat('#,##0');
  sheet.getRange(28, 8, equipo.length, 1).setNumberFormat('0.0"%"');
  
  // ANCHOS
  sheet.setColumnWidth(1, 150);
  for (let i = 2; i <= 9; i++) {
    sheet.setColumnWidth(i, 120);
  }
  
  // BORDES
  sheet.getRange('A5:I10').setBorder(true, true, true, true, true, true);
  sheet.getRange('A13:E16').setBorder(true, true, true, true, true, true);
  sheet.getRange('A19:C24').setBorder(true, true, true, true, true, true);
  sheet.getRange('A27:H' + (row - 1)).setBorder(true, true, true, true, true, true);
}

/* ============================================================
 *  HOJA 2: VENTAS POR CANAL - MEJORADO CON VENTAS MENSUALES
 *  ========================================================== */
function _crearHojaVentasPorCanal(ss, mes, year) {
  const sheet = ss.insertSheet('📈 Ventas por Canal');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const yearAnt = year - 1;
  const canales = ['MAYORISTA', 'SUPERMERCADO'];
  
  // TÍTULO
  sheet.getRange('A1:N1').merge()
    .setValue('ANÁLISIS DE VENTAS POR CANAL')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:N2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // SECCIÓN 1: RESUMEN ACUMULADO
  sheet.getRange('A4').setValue('📊 RESUMEN ACUMULADO')
    .setFontWeight('bold')
    .setBackground('#F0F0F0');
  
  const resumenHeaders = ['Canal', 'Venta ' + year, 'Venta ' + yearAnt, 'Var $', 'Var %', 'Cajas', 'Margen $', 'Margen %'];
  sheet.getRange('A5:H5').setValues([resumenHeaders])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF');
  
  let row = 6;
  let totalVenta = 0, totalVentaAnt = 0, totalCajas = 0, totalMargen = 0;
  
  canales.forEach(canal => {
    const datosAnio = data.filter(i => i.year === year && i.month <= mes && (i.clasificacion || '').toUpperCase() === canal);
    const datosAnioAnt = data.filter(i => i.year === yearAnt && i.month <= mes && (i.clasificacion || '').toUpperCase() === canal);
    
    const ventaActual = datosAnio.reduce((s, i) => s + (i.neto || 0), 0);
    const ventaAnterior = datosAnioAnt.reduce((s, i) => s + (i.neto || 0), 0);
    const cajas = datosAnio.reduce((s, i) => s + (i.cajas || 0), 0);
    const costo = datosAnio.reduce((s, i) => s + (i.costo || 0), 0);
    const margen = ventaActual - costo;
    
    const variacion = ventaAnterior > 0 ? ((ventaActual - ventaAnterior) / ventaAnterior) * 100 : 0;
    const pctMargen = ventaActual > 0 ? (margen / ventaActual) * 100 : 0;
    
    sheet.getRange(row, 1, 1, 8).setValues([[
      canal,
      ventaActual,
      ventaAnterior,
      ventaActual - ventaAnterior,
      variacion,
      cajas,
      margen,
      pctMargen
    ]]);
    
    totalVenta += ventaActual;
    totalVentaAnt += ventaAnterior;
    totalCajas += cajas;
    totalMargen += margen;
    row++;
  });
  
  // TOTAL
  const varTotal = totalVentaAnt > 0 ? ((totalVenta - totalVentaAnt) / totalVentaAnt) * 100 : 0;
  const pctMargenTotal = totalVenta > 0 ? (totalMargen / totalVenta) * 100 : 0;
  
  sheet.getRange(row, 1, 1, 8).setValues([[
    'TOTAL',
    totalVenta,
    totalVentaAnt,
    totalVenta - totalVentaAnt,
    varTotal,
    totalCajas,
    totalMargen,
    pctMargenTotal
  ]]).setFontWeight('bold').setBackground('#F0F0F0');
  
  // FORMATO SECCIÓN 1
  sheet.getRange('B6:D' + row).setNumberFormat('$#,##0');
  sheet.getRange('E6:E' + row).setNumberFormat('0.0"%"');
  sheet.getRange('F6:F' + row).setNumberFormat('#,##0');
  sheet.getRange('G6:G' + row).setNumberFormat('$#,##0');
  sheet.getRange('H6:H' + row).setNumberFormat('0.0"%"');
  
  sheet.getRange('A5:H' + row).setBorder(true, true, true, true, true, true);
  
  // SECCIÓN 2: VENTAS MENSUALES POR CANAL
  row += 2;
  sheet.getRange('A' + row).setValue('📅 VENTAS MENSUALES POR CANAL')
    .setFontWeight('bold')
    .setBackground('#F0F0F0');
  row++;
  
  const mesesHeaders = ['Canal', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Total'];
  sheet.getRange(row, 1, 1, 14).setValues([mesesHeaders])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF');
  row++;
  
  const startDataRow = row;
  
  canales.forEach(canal => {
    const ventasPorMes = [];
    let totalCanal = 0;
    
    for (let m = 1; m <= 12; m++) {
      const ventaMes = data
        .filter(i => i.year === year && i.month === m && (i.clasificacion || '').toUpperCase() === canal)
        .reduce((s, i) => s + (i.neto || 0), 0);
      ventasPorMes.push(ventaMes);
      totalCanal += ventaMes;
    }
    
    sheet.getRange(row, 1, 1, 14).setValues([[canal, ...ventasPorMes, totalCanal]]);
    row++;
  });
  
  // TOTAL POR MES
  const totalesMes = ['TOTAL'];
  let granTotal = 0;
  for (let m = 1; m <= 12; m++) {
    const totalMes = data
      .filter(i => i.year === year && i.month === m)
      .reduce((s, i) => s + (i.neto || 0), 0);
    totalesMes.push(totalMes);
    granTotal += totalMes;
  }
  totalesMes.push(granTotal);
  
  sheet.getRange(row, 1, 1, 14).setValues([totalesMes])
    .setFontWeight('bold')
    .setBackground('#F0F0F0');
  
  // FORMATO SECCIÓN 2
  sheet.getRange(startDataRow, 2, row - startDataRow + 1, 13).setNumberFormat('$#,##0');
  sheet.getRange(startDataRow - 1, 1, row - startDataRow + 2, 14).setBorder(true, true, true, true, true, true);
  
  // ANCHOS
  sheet.setColumnWidth(1, 150);
  for (let i = 2; i <= 14; i++) {
    sheet.setColumnWidth(i, 110);
  }
}

/* ============================================================
 *  HOJA 3: VENTAS POR CATEGORÍA GLOBAL
 *  ========================================================== */
function _crearHojaVentasPorCategoria(ss, mes, year) {
  const sheet = ss.insertSheet('🍷 Categorías Global');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const yearAnt = year - 1;
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  const datosAnioAnt = data.filter(i => i.year === yearAnt && i.month <= mes);
  
  const categoriasSet = new Set();
  data.forEach(i => { if (i.categoria) categoriasSet.add(i.categoria); });
  const categorias = Array.from(categoriasSet).sort();
  
  // TÍTULO
  sheet.getRange('A1:J1').merge()
    .setValue('ANÁLISIS DE VENTAS POR CATEGORÍA (GLOBAL)')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:J2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['Categoría', 'Venta ' + year, 'Venta ' + yearAnt, 'Var $', 'Var %', 'Cajas', 'Margen $', 'Margen %', 'Precio Prom/Caja', '% Part.'];
  sheet.getRange('A4:J4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  let row = 5;
  let totalVenta = 0;
  const datosResumen = [];
  
  categorias.forEach(cat => {
    const ventaActual = datosAnio.filter(i => i.categoria === cat).reduce((s, i) => s + (i.neto || 0), 0);
    const ventaAnterior = datosAnioAnt.filter(i => i.categoria === cat).reduce((s, i) => s + (i.neto || 0), 0);
    const cajas = datosAnio.filter(i => i.categoria === cat).reduce((s, i) => s + (i.cajas || 0), 0);
    const costo = datosAnio.filter(i => i.categoria === cat).reduce((s, i) => s + (i.costo || 0), 0);
    const margen = ventaActual - costo;
    
    const precioProm = cajas > 0 ? ventaActual / cajas : 0;
    const variacion = ventaAnterior > 0 ? ((ventaActual - ventaAnterior) / ventaAnterior) * 100 : 0;
    const pctMargen = ventaActual > 0 ? (margen / ventaActual) * 100 : 0;
    
    totalVenta += ventaActual;
    
    datosResumen.push({
      cat,
      ventaActual,
      ventaAnterior,
      variacion,
      cajas,
      margen,
      pctMargen,
      precioProm,
      participacion: 0
    });
  });
  
  datosResumen.forEach(d => {
    d.participacion = totalVenta > 0 ? (d.ventaActual / totalVenta) * 100 : 0;
  });
  
  datosResumen.sort((a, b) => b.ventaActual - a.ventaActual);
  
  datosResumen.forEach(d => {
    sheet.getRange(row, 1, 1, 10).setValues([[
      d.cat,
      d.ventaActual,
      d.ventaAnterior,
      d.ventaActual - d.ventaAnterior,
      d.variacion,
      d.cajas,
      d.margen,
      d.pctMargen,
      d.precioProm,
      d.participacion
    ]]);
    row++;
  });
  
  // FORMATO
  sheet.getRange('B5:D' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('E5:E' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('F5:F' + (row - 1)).setNumberFormat('#,##0');
  sheet.getRange('G5:G' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('H5:H' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('I5:I' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('J5:J' + (row - 1)).setNumberFormat('0.0"%"');
  
  sheet.getRange('A4:J' + (row - 1)).setBorder(true, true, true, true, true, true);
  
  sheet.setColumnWidth(1, 180);
  for (let i = 2; i <= 10; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

/* ============================================================
 *  HOJA 4: VENTAS POR CATEGORÍA Y CANAL - NUEVA
 *  ========================================================== */
function _crearHojaVentasPorCategoriaCanal(ss, mes, year) {
  const sheet = ss.insertSheet('🍷 Categorías x Canal');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  
  const categoriasSet = new Set();
  data.forEach(i => { if (i.categoria) categoriasSet.add(i.categoria); });
  const categorias = Array.from(categoriasSet).sort();
  const canales = ['MAYORISTA', 'SUPERMERCADO'];
  
  // TÍTULO
  sheet.getRange('A1:I1').merge()
    .setValue('ANÁLISIS DE VENTAS POR CATEGORÍA Y CANAL')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:I2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  let row = 4;
  
  categorias.forEach(cat => {
    // Header por categoría
    sheet.getRange('A' + row + ':I' + row).merge()
      .setValue('📦 ' + cat.toUpperCase())
      .setFontWeight('bold')
      .setBackground('#F0F0F0')
      .setFontSize(11);
    row++;
    
    const headers = ['Canal', 'Venta', 'Cajas', 'Margen $', 'Margen %', 'Precio Prom/Caja', 'Costo Prom/Caja', '% Part. Categoría', '% Part. Total'];
    sheet.getRange(row, 1, 1, 9).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#354A5F')
      .setFontColor('#FFFFFF');
    row++;
    
    const startRow = row;
    let totalCat = 0;
    
    canales.forEach(canal => {
      const datosCatCanal = datosAnio.filter(i => i.categoria === cat && (i.clasificacion || '').toUpperCase() === canal);
      
      const venta = datosCatCanal.reduce((s, i) => s + (i.neto || 0), 0);
      const cajas = datosCatCanal.reduce((s, i) => s + (i.cajas || 0), 0);
      const costo = datosCatCanal.reduce((s, i) => s + (i.costo || 0), 0);
      const margen = venta - costo;
      
      const precioProm = cajas > 0 ? venta / cajas : 0;
      const costoProm = cajas > 0 ? costo / cajas : 0;
      const pctMargen = venta > 0 ? (margen / venta) * 100 : 0;
      
      totalCat += venta;
      
      sheet.getRange(row, 1, 1, 9).setValues([[
        canal,
        venta,
        cajas,
        margen,
        pctMargen,
        precioProm,
        costoProm,
        0, // calcular después
        0  // calcular después
      ]]);
      row++;
    });
    
    // Calcular participaciones
    const totalGlobal = datosAnio.reduce((s, i) => s + (i.neto || 0), 0);
    for (let r = startRow; r < row; r++) {
      const venta = sheet.getRange(r, 2).getValue();
      const partCat = totalCat > 0 ? (venta / totalCat) * 100 : 0;
      const partTotal = totalGlobal > 0 ? (venta / totalGlobal) * 100 : 0;
      
      sheet.getRange(r, 8).setValue(partCat);
      sheet.getRange(r, 9).setValue(partTotal);
    }
    
    // FORMATO
    sheet.getRange(startRow, 2, row - startRow, 1).setNumberFormat('$#,##0');
    sheet.getRange(startRow, 3, row - startRow, 1).setNumberFormat('#,##0');
    sheet.getRange(startRow, 4, row - startRow, 1).setNumberFormat('$#,##0');
    sheet.getRange(startRow, 5, row - startRow, 1).setNumberFormat('0.0"%"');
    sheet.getRange(startRow, 6, row - startRow, 2).setNumberFormat('$#,##0');
    sheet.getRange(startRow, 8, row - startRow, 2).setNumberFormat('0.0"%"');
    
    sheet.getRange(startRow - 1, 1, row - startRow + 1, 9).setBorder(true, true, true, true, true, true);
    
    row++;
  });
  
  // ANCHOS
  sheet.setColumnWidth(1, 150);
  for (let i = 2; i <= 9; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

/* ============================================================
 *  HOJA 5: VENTAS POR MARCA GLOBAL
 *  ========================================================== */
function _crearHojaVentasPorMarca(ss, mes, year) {
  const sheet = ss.insertSheet('🏷️ Marcas Global');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const yearAnt = year - 1;
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  const datosAnioAnt = data.filter(i => i.year === yearAnt && i.month <= mes);
  
  const marcasSet = new Set();
  data.forEach(i => { if (i.marca) marcasSet.add(i.marca); });
  const marcas = Array.from(marcasSet).sort();
  
  // TÍTULO
  sheet.getRange('A1:J1').merge()
    .setValue('ANÁLISIS DE VENTAS POR MARCA (GLOBAL)')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:J2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['Marca', 'Venta ' + year, 'Venta ' + yearAnt, 'Var $', 'Var %', 'Cajas', 'Margen $', 'Margen %', 'Precio Prom/Caja', '% Part.'];
  sheet.getRange('A4:J4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  let row = 5;
  let totalVenta = 0;
  const datosResumen = [];
  
  marcas.forEach(marca => {
    const ventaActual = datosAnio.filter(i => i.marca === marca).reduce((s, i) => s + (i.neto || 0), 0);
    const ventaAnterior = datosAnioAnt.filter(i => i.marca === marca).reduce((s, i) => s + (i.neto || 0), 0);
    const cajas = datosAnio.filter(i => i.marca === marca).reduce((s, i) => s + (i.cajas || 0), 0);
    const costo = datosAnio.filter(i => i.marca === marca).reduce((s, i) => s + (i.costo || 0), 0);
    const margen = ventaActual - costo;
    
    const precioProm = cajas > 0 ? ventaActual / cajas : 0;
    const variacion = ventaAnterior > 0 ? ((ventaActual - ventaAnterior) / ventaAnterior) * 100 : 0;
    const pctMargen = ventaActual > 0 ? (margen / ventaActual) * 100 : 0;
    
    totalVenta += ventaActual;
    
    datosResumen.push({
      marca,
      ventaActual,
      ventaAnterior,
      variacion,
      cajas,
      margen,
      pctMargen,
      precioProm,
      participacion: 0
    });
  });
  
  datosResumen.forEach(d => {
    d.participacion = totalVenta > 0 ? (d.ventaActual / totalVenta) * 100 : 0;
  });
  
  datosResumen.sort((a, b) => b.ventaActual - a.ventaActual);
  
  datosResumen.forEach(d => {
    sheet.getRange(row, 1, 1, 10).setValues([[
      d.marca,
      d.ventaActual,
      d.ventaAnterior,
      d.ventaActual - d.ventaAnterior,
      d.variacion,
      d.cajas,
      d.margen,
      d.pctMargen,
      d.precioProm,
      d.participacion
    ]]);
    row++;
  });
  
  // FORMATO
  sheet.getRange('B5:D' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('E5:E' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('F5:F' + (row - 1)).setNumberFormat('#,##0');
  sheet.getRange('G5:G' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('H5:H' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('I5:I' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('J5:J' + (row - 1)).setNumberFormat('0.0"%"');
  
  sheet.getRange('A4:J' + (row - 1)).setBorder(true, true, true, true, true, true);
  
  sheet.setColumnWidth(1, 200);
  for (let i = 2; i <= 10; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

/* ============================================================
 *  HOJA 6: VENTAS POR MARCA Y CANAL - NUEVA
 *  ========================================================== */
function _crearHojaVentasPorMarcaCanal(ss, mes, year) {
  const sheet = ss.insertSheet('🏷️ Marcas x Canal');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  
  const marcasSet = new Set();
  data.forEach(i => { if (i.marca) marcasSet.add(i.marca); });
  const marcas = Array.from(marcasSet).sort();
  const canales = ['MAYORISTA', 'SUPERMERCADO'];
  
  // TÍTULO
  sheet.getRange('A1:I1').merge()
    .setValue('ANÁLISIS DE VENTAS POR MARCA Y CANAL')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:I2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  let row = 4;
  
  marcas.forEach(marca => {
    sheet.getRange('A' + row + ':I' + row).merge()
      .setValue('🏷️ ' + marca.toUpperCase())
      .setFontWeight('bold')
      .setBackground('#F0F0F0')
      .setFontSize(11);
    row++;
    
    const headers = ['Canal', 'Venta', 'Cajas', 'Margen $', 'Margen %', 'Precio Prom/Caja', 'Costo Prom/Caja', '% Part. Marca', '% Part. Total'];
    sheet.getRange(row, 1, 1, 9).setValues([headers])
      .setFontWeight('bold')
      .setBackground('#354A5F')
      .setFontColor('#FFFFFF');
    row++;
    
    const startRow = row;
    let totalMarca = 0;
    
    canales.forEach(canal => {
      const datosMarcaCanal = datosAnio.filter(i => i.marca === marca && (i.clasificacion || '').toUpperCase() === canal);
      
      const venta = datosMarcaCanal.reduce((s, i) => s + (i.neto || 0), 0);
      const cajas = datosMarcaCanal.reduce((s, i) => s + (i.cajas || 0), 0);
      const costo = datosMarcaCanal.reduce((s, i) => s + (i.costo || 0), 0);
      const margen = venta - costo;
      
      const precioProm = cajas > 0 ? venta / cajas : 0;
      const costoProm = cajas > 0 ? costo / cajas : 0;
      const pctMargen = venta > 0 ? (margen / venta) * 100 : 0;
      
      totalMarca += venta;
      
      sheet.getRange(row, 1, 1, 9).setValues([[
        canal,
        venta,
        cajas,
        margen,
        pctMargen,
        precioProm,
        costoProm,
        0,
        0
      ]]);
      row++;
    });
    
    const totalGlobal = datosAnio.reduce((s, i) => s + (i.neto || 0), 0);
    for (let r = startRow; r < row; r++) {
      const venta = sheet.getRange(r, 2).getValue();
      const partMarca = totalMarca > 0 ? (venta / totalMarca) * 100 : 0;
      const partTotal = totalGlobal > 0 ? (venta / totalGlobal) * 100 : 0;
      
      sheet.getRange(r, 8).setValue(partMarca);
      sheet.getRange(r, 9).setValue(partTotal);
    }
    
    sheet.getRange(startRow, 2, row - startRow, 1).setNumberFormat('$#,##0');
    sheet.getRange(startRow, 3, row - startRow, 1).setNumberFormat('#,##0');
    sheet.getRange(startRow, 4, row - startRow, 1).setNumberFormat('$#,##0');
    sheet.getRange(startRow, 5, row - startRow, 1).setNumberFormat('0.0"%"');
    sheet.getRange(startRow, 6, row - startRow, 2).setNumberFormat('$#,##0');
    sheet.getRange(startRow, 8, row - startRow, 2).setNumberFormat('0.0"%"');
    
    sheet.getRange(startRow - 1, 1, row - startRow + 1, 9).setBorder(true, true, true, true, true, true);
    
    row++;
  });
  
  sheet.setColumnWidth(1, 150);
  for (let i = 2; i <= 9; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

/* ============================================================
 *  HOJA 7: TOP 50 CLIENTES - CORREGIDO
 *  ========================================================== */
function _crearHojaTopClientes(ss, mes, year) {
  const sheet = ss.insertSheet('👥 Top Clientes');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  
  const clientesMap = {};
  
  datosAnio.forEach(i => {
    const cliente = i.cliente || 'SIN CLIENTE';
    if (!clientesMap[cliente]) {
      clientesMap[cliente] = { venta: 0, cajas: 0, costo: 0, facturas: new Set() };
    }
    clientesMap[cliente].venta += i.neto || 0;
    clientesMap[cliente].cajas += i.cajas || 0;
    clientesMap[cliente].costo += i.costo || 0;
    if (i.factura) clientesMap[cliente].facturas.add(i.factura);
  });
  
  const clientesArray = Object.entries(clientesMap).map(([cliente, datos]) => {
    const margen = datos.venta - datos.costo;
    return {
      cliente,
      venta: datos.venta,
      cajas: datos.cajas,
      margen: margen,
      pctMargen: datos.venta > 0 ? (margen / datos.venta) * 100 : 0,
      facturas: datos.facturas.size,
      ticketProm: datos.facturas.size > 0 ? datos.venta / datos.facturas.size : 0
    };
  }).sort((a, b) => b.venta - a.venta);
  
  const totalVenta = clientesArray.reduce((s, c) => s + c.venta, 0);
  const top50 = clientesArray.slice(0, 50);
  
  // TÍTULO
  sheet.getRange('A1:I1').merge()
    .setValue('TOP 50 CLIENTES POR VENTA')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:I2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['#', 'Cliente', 'Venta Total', '% Part.', 'Cajas', 'Margen $', 'Margen %', 'N° Facturas', 'Ticket Prom'];
  sheet.getRange('A4:I4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  let row = 5;
  top50.forEach((c, i) => {
    const participacion = totalVenta > 0 ? (c.venta / totalVenta) * 100 : 0;
    
    sheet.getRange(row, 1, 1, 9).setValues([[
      i + 1,
      c.cliente,
      c.venta,
      participacion,
      c.cajas,
      c.margen,
      c.pctMargen,
      c.facturas,
      c.ticketProm
    ]]);
    row++;
  });
  
  // FORMATO
  sheet.getRange('C5:C' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('D5:D' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('E5:E' + (row - 1)).setNumberFormat('#,##0');
  sheet.getRange('F5:F' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('G5:G' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('I5:I' + (row - 1)).setNumberFormat('$#,##0');
  
  sheet.getRange('A4:I' + (row - 1)).setBorder(true, true, true, true, true, true);
  
  sheet.setColumnWidth(1, 40);
  sheet.setColumnWidth(2, 300);
  for (let i = 3; i <= 9; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

/* ============================================================
 *  HOJA 8: DESEMPEÑO EJECUTIVOS - CORREGIDO (TODOS LOS CANALES)
 *  ========================================================== */
function _crearHojaDesempenoEjecutivos(ss, mes, year) {
  const sheet = ss.insertSheet('💼 Desempeño Ejecutivos');
  
  const equipo = _calcVentasEquipo(mes);
  
  // TÍTULO
  sheet.getRange('A1:J1').merge()
    .setValue('ANÁLISIS DE DESEMPEÑO POR EJECUTIVO DE VENTAS')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:J2').merge()
    .setValue(_nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['Ejecutivo', 'Canal', 'Venta Mes', 'Var % Mes', 'Venta Acum', 'Var % Acum', 'Cajas Mes', 'Cajas Acum', 'Margen $', '% Margen'];
  sheet.getRange('A4:J4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  let row = 5;
  equipo.forEach(v => {
    sheet.getRange(row, 1, 1, 10).setValues([[
      v.nombre,
      v.canal,
      v.ventaMes,
      v.varMes,
      v.ventaAcum,
      v.varAcum,
      v.cajasMes,
      v.cajasAcum,
      v.margenAcum,
      v.margenPctAcum
    ]]);
    row++;
  });
  
  // FORMATO
  sheet.getRange('C5:C' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('D5:D' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('E5:E' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('F5:F' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('G5:H' + (row - 1)).setNumberFormat('#,##0');
  sheet.getRange('I5:I' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('J5:J' + (row - 1)).setNumberFormat('0.0"%"');
  
  sheet.getRange('A4:J' + (row - 1)).setBorder(true, true, true, true, true, true);
  
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 180);
  for (let i = 3; i <= 10; i++) {
    sheet.setColumnWidth(i, 120);
  }
}

/* ============================================================
 *  HOJA 9: ANÁLISIS LÍNEA DE VINO - CORREGIDO
 *  ========================================================== */
function _crearHojaAnalisisLineaVino(ss, mes, year) {
  const sheet = ss.insertSheet('🍾 Análisis Líneas de Vino');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const yearAnt = year - 1;
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  const datosAnioAnt = data.filter(i => i.year === yearAnt && i.month <= mes);
  
  const lineasMap = {};
  
  datosAnio.forEach(i => {
    const linea = i.linea_vino || 'SIN LÍNEA';
    if (!lineasMap[linea]) {
      lineasMap[linea] = { venta: 0, cajas: 0, costo: 0 };
    }
    lineasMap[linea].venta += i.neto || 0;
    lineasMap[linea].cajas += i.cajas || 0;
    lineasMap[linea].costo += i.costo || 0;
  });
  
  const lineasMapAnt = {};
  datosAnioAnt.forEach(i => {
    const linea = i.linea_vino || 'SIN LÍNEA';
    if (!lineasMapAnt[linea]) {
      lineasMapAnt[linea] = { venta: 0 };
    }
    lineasMapAnt[linea].venta += i.neto || 0;
  });
  
  const lineasArray = Object.entries(lineasMap).map(([linea, datos]) => {
    const ventaAnt = lineasMapAnt[linea] ? lineasMapAnt[linea].venta : 0;
    const variacion = ventaAnt > 0 ? ((datos.venta - ventaAnt) / ventaAnt) * 100 : 0;
    const precioProm = datos.cajas > 0 ? datos.venta / datos.cajas : 0;
    const costoProm = datos.cajas > 0 ? datos.costo / datos.cajas : 0;
    const margen = datos.venta - datos.costo;
    const pctMargen = datos.venta > 0 ? (margen / datos.venta) * 100 : 0;
    const margenPorCaja = datos.cajas > 0 ? margen / datos.cajas : 0;
    
    return {
      linea,
      venta: datos.venta,
      variacion,
      cajas: datos.cajas,
      precioProm,
      costoProm,
      margen,
      pctMargen,
      margenPorCaja
    };
  }).sort((a, b) => b.venta - a.venta);
  
  // TÍTULO
  sheet.getRange('A1:J1').merge()
    .setValue('ANÁLISIS DETALLADO POR LÍNEA DE VINO')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:J2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['Línea de Vino', 'Venta Total', 'Var % YoY', 'Cajas', 'Precio Prom/Caja', 'Costo Prom/Caja', 'Margen Total', '% Margen', 'Margen/Caja'];
  sheet.getRange('A4:I4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  let row = 5;
  lineasArray.forEach(l => {
    sheet.getRange(row, 1, 1, 9).setValues([[
      l.linea,
      l.venta,
      l.variacion,
      l.cajas,
      l.precioProm,
      l.costoProm,
      l.margen,
      l.pctMargen,
      l.margenPorCaja
    ]]);
    row++;
  });
  
  // FORMATO
  sheet.getRange('B5:B' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('C5:C' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('D5:D' + (row - 1)).setNumberFormat('#,##0');
  sheet.getRange('E5:F' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('G5:G' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('H5:H' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('I5:I' + (row - 1)).setNumberFormat('$#,##0');
  
  sheet.getRange('A4:I' + (row - 1)).setBorder(true, true, true, true, true, true);
  
  sheet.setColumnWidth(1, 250);
  for (let i = 2; i <= 9; i++) {
    sheet.setColumnWidth(i, 130);
  }
}

/* ============================================================
 *  HOJA 10: PRECIOS Y MÁRGENES - CORREGIDO
 *  ========================================================== */
function _crearHojaPreciosMargen(ss, mes, year) {
  const sheet = ss.insertSheet('💰 Análisis Precios y Márgenes');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  const canales = ['MAYORISTA', 'SUPERMERCADO'];
  
  // TÍTULO
  sheet.getRange('A1:H1').merge()
    .setValue('ANÁLISIS DE PRECIOS Y MÁRGENES POR CANAL')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:H2').merge()
    .setValue('Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['Canal', 'Venta Total', 'Costo Total', 'Margen Total', '% Margen', 'Cajas', 'Precio Prom/Caja', 'Costo Prom/Caja'];
  sheet.getRange('A4:H4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  let row = 5;
  
  canales.forEach(canal => {
    const datosCanal = datosAnio.filter(i => (i.clasificacion || '').toUpperCase() === canal);
    
    const venta = datosCanal.reduce((s, i) => s + (i.neto || 0), 0);
    const costo = datosCanal.reduce((s, i) => s + (i.costo || 0), 0);
    const margen = venta - costo;
    const cajas = datosCanal.reduce((s, i) => s + (i.cajas || 0), 0);
    
    const pctMargen = venta > 0 ? (margen / venta) * 100 : 0;
    const precioProm = cajas > 0 ? venta / cajas : 0;
    const costoProm = cajas > 0 ? costo / cajas : 0;
    
    sheet.getRange(row, 1, 1, 8).setValues([[
      canal,
      venta,
      costo,
      margen,
      pctMargen,
      cajas,
      precioProm,
      costoProm
    ]]);
    row++;
  });
  
  // Espacio
  row++;
  
  // ANÁLISIS POR CATEGORÍA
  sheet.getRange('A' + row + ':H' + row).merge()
    .setValue('ANÁLISIS DE PRECIOS Y MÁRGENES POR CATEGORÍA')
    .setFontWeight('bold')
    .setFontSize(12)
    .setBackground('#F0F0F0')
    .setHorizontalAlignment('center');
  row++;
  
  sheet.getRange('A' + row + ':H' + row).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  row++;
  
  const categoriasSet = new Set();
  data.forEach(i => { if (i.categoria) categoriasSet.add(i.categoria); });
  const categorias = Array.from(categoriasSet).sort();
  
  const startRow = row;
  
  categorias.forEach(cat => {
    const datosCat = datosAnio.filter(i => i.categoria === cat);
    
    const venta = datosCat.reduce((s, i) => s + (i.neto || 0), 0);
    const costo = datosCat.reduce((s, i) => s + (i.costo || 0), 0);
    const margen = venta - costo;
    const cajas = datosCat.reduce((s, i) => s + (i.cajas || 0), 0);
    
    const pctMargen = venta > 0 ? (margen / venta) * 100 : 0;
    const precioProm = cajas > 0 ? venta / cajas : 0;
    const costoProm = cajas > 0 ? costo / cajas : 0;
    
    sheet.getRange(row, 1, 1, 8).setValues([[
      cat,
      venta,
      costo,
      margen,
      pctMargen,
      cajas,
      precioProm,
      costoProm
    ]]);
    row++;
  });
  
  // FORMATO
  sheet.getRange('B5:D6').setNumberFormat('$#,##0');
  sheet.getRange('E5:E6').setNumberFormat('0.0"%"');
  sheet.getRange('F5:F6').setNumberFormat('#,##0');
  sheet.getRange('G5:H6').setNumberFormat('$#,##0');
  
  sheet.getRange('B' + startRow + ':D' + (row - 1)).setNumberFormat('$#,##0');
  sheet.getRange('E' + startRow + ':E' + (row - 1)).setNumberFormat('0.0"%"');
  sheet.getRange('F' + startRow + ':F' + (row - 1)).setNumberFormat('#,##0');
  sheet.getRange('G' + startRow + ':H' + (row - 1)).setNumberFormat('$#,##0');
  
  // BORDES
  sheet.getRange('A4:H6').setBorder(true, true, true, true, true, true);
  sheet.getRange('A' + (startRow - 1) + ':H' + (row - 1)).setBorder(true, true, true, true, true, true);
  
  sheet.setColumnWidth(1, 180);
  for (let i = 2; i <= 8; i++) {
    sheet.setColumnWidth(i, 140);
  }
}

/* ============================================================
 *  HOJA 11: DETALLE TRANSACCIONAL
 *  ========================================================== */
function _crearHojaDetalleTransaccional(ss, mes, year) {
  const sheet = ss.insertSheet('📋 Detalle Transaccional');
  
  const { ok, data } = _c_readMaestroVenta();
  if (!ok || !data) return;
  
  const datosAnio = data.filter(i => i.year === year && i.month <= mes);
  const datosLimitados = datosAnio.slice(0, 5000);
  
  // TÍTULO
  sheet.getRange('A1:O1').merge()
    .setValue('DETALLE TRANSACCIONAL DE VENTAS')
    .setFontSize(14)
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  sheet.getRange('A2:O2').merge()
    .setValue('Primeros 5,000 registros - Período: Enero - ' + _nombreMes(mes - 1) + ' ' + year)
    .setFontSize(10)
    .setBackground('#EBF5FE')
    .setHorizontalAlignment('center');
  
  // HEADERS
  const headers = ['Fecha', 'Factura', 'NV', 'Cliente', 'Ejecutivo', 'Canal', 'Categoría', 'Marca', 'Línea Vino', 'Cajas', 'Neto', 'Costo', 'Margen', '% Margen'];
  sheet.getRange('A4:N4').setValues([headers])
    .setFontWeight('bold')
    .setBackground('#354A5F')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  
  // DATOS
  const datosTabla = datosLimitados.map(i => {
    const margen = (i.neto || 0) - (i.costo || 0);
    const pctMargen = i.neto > 0 ? (margen / i.neto) * 100 : 0;
    
    return [
      i.fecha || '',
      i.factura || '',
      i.nv || '',
      i.cliente || '',
      i.ejecutivo || '',
      i.clasificacion || '',
      i.categoria || '',
      i.marca || '',
      i.linea_vino || '',
      i.cajas || 0,
      i.neto || 0,
      i.costo || 0,
      margen,
      pctMargen
    ];
  });
  
  if (datosTabla.length > 0) {
    sheet.getRange(5, 1, datosTabla.length, 14).setValues(datosTabla);
    
    // FORMATO
    sheet.getRange(5, 10, datosTabla.length, 1).setNumberFormat('#,##0');
    sheet.getRange(5, 11, datosTabla.length, 3).setNumberFormat('$#,##0');
    sheet.getRange(5, 14, datosTabla.length, 1).setNumberFormat('0.0"%"');
  }
  
  // BORDES
  sheet.getRange('A4:N' + (4 + datosTabla.length)).setBorder(true, true, true, true, false, false);
  
  // ANCHOS
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 250);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 200);
  for (let i = 10; i <= 14; i++) {
    sheet.setColumnWidth(i, 110);
  }
  
  sheet.setFrozenRows(4);
}