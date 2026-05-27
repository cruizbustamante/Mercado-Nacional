"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export function OcModal({ id, children }: { id: string; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    const dlg = dialogRef.current;
    if (dlg?.open) dlg.close();
    // Volver a la lista preservando query params si vinimos de ahí;
    // si no hay historia (URL pegada directo), ir a /ordenes.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/supermercados/ordenes");
    }
  }, [router]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();

    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    dlg.addEventListener("cancel", onCancel);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      dlg.removeEventListener("cancel", onCancel);
      if (dlg.open) dlg.close();
      document.body.style.overflow = prev;
    };
  }, [close]);

  return (
    <dialog
      ref={dialogRef}
      className="oc-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="oc-modal-inner" onClick={(e) => e.stopPropagation()}>
        <div className="oc-modal-bar">
          <button type="button" className="oc-modal-close" onClick={close} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          {id && (
            <a
              href={`/supermercados/oc/${id}`}
              className="oc-modal-expand"
              title="Abrir en página completa"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
              Vista completa
            </a>
          )}
        </div>
        <div className="oc-modal-body">{children}</div>
      </div>
    </dialog>
  );
}
