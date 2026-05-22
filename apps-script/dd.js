function verificarNombrePestana() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheets = ss.getSheets();
  
  Logger.log('=== PESTAÑAS DISPONIBLES ===');
  sheets.forEach((sheet, i) => {
    const name = sheet.getName();
    Logger.log(`${i + 1}. "${name}" (${name.length} caracteres)`);
    // Ver caracteres ocultos
    Logger.log('   Códigos ASCII: ' + Array.from(name).map(c => c.charCodeAt(0)).join(', '));
  });
  Logger.log('==========================');
  
  // Buscar específicamente
  const obs = ss.getSheetByName('Observaciones Cobranza');
  if (obs) {
    Logger.log('✓ Hoja encontrada correctamente');
  } else {
    Logger.log('✗ Hoja NO encontrada - revisar nombre');
  }
}
function testSeguimientoCompleto() {
  Logger.log('=== TEST SEGUIMIENTO ===');
  
  // 1. Test de autenticación
  Logger.log('1. Test autenticación:');
  const auth = testAutenticacion();
  Logger.log(JSON.stringify(auth, null, 2));
  
  // 2. Test de inicialización de hoja
  Logger.log('\n2. Test inicialización hoja:');
  try {
    const sh = _initObservacionesSheet_();
    Logger.log('✓ Hoja inicializada: ' + sh.getName());
    Logger.log('  Filas: ' + sh.getLastRow());
    Logger.log('  Columnas: ' + sh.getLastColumn());
  } catch(err) {
    Logger.log('✗ Error: ' + err);
  }
  
  // 3. Test de obtener observaciones
  Logger.log('\n3. Test obtener observaciones:');
  const result = apiCobranzaGetObservaciones({});
  Logger.log('  OK: ' + result.ok);
  Logger.log('  Items: ' + (result.items ? result.items.length : 0));
  Logger.log('  Error: ' + result.error);
  if (result.items && result.items.length > 0) {
    Logger.log('  Primera obs:');
    Logger.log(JSON.stringify(result.items[0], null, 2));
  }
  
  Logger.log('\n======================');
  return result;
}