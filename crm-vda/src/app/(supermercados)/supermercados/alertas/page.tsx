export default function AlertasPage() {
  return (
    <div className="sm-empty">
      <div className="sm-empty-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 9v4M12 17h.01"/>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>
      </div>
      <div className="sm-empty-title">Alertas accionables</div>
      <p className="sm-empty-desc">
        OC vencidas sin facturar, SKU sin stock con OC abierta, cadena dormida,
        DUN sin mapear, caída de marca propia. Cada alerta con dueño y acción sugerida.
      </p>
    </div>
  );
}
