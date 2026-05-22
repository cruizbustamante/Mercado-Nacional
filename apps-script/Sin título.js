/** Fuerza el correlativo para que la próxima NV sea EXACTAMENTE target. */
function admin_setNextNV(target) {
  if (!target || target < 1) throw new Error('Target inválido');
  const props = PropertiesService.getScriptProperties();
  // _getNextNV() hace current+1, por eso guardamos target-1
  props.setProperty(CONFIG.CORRELATIVO.PROP_KEY, String(target - 1));
  Logger.log('NV_COUNTER seteado a %s (próxima NV será %s)', target - 1, target);
}

// Atajo directo para tu caso:
function admin_setNextNV_11417() {
  admin_setNextNV(11417 );
}
function admin_getNVCounter(){
  const props = PropertiesService.getScriptProperties();
  const current = Number(props.getProperty(CONFIG.CORRELATIVO.PROP_KEY) || 0);
  Logger.log('NV_COUNTER actual: %s (próxima sería: %s)', current, current + 1);
  return { current, next: current + 1 };
}
