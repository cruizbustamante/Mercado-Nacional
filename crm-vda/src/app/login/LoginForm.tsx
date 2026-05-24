"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <form action={formAction} noValidate>
      {state.error && (
        <div className="login-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          {state.error}
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor="email">Correo electrónico</label>
        <div className="field-input-wrap">
          <input
            id="email"
            name="email"
            type="email"
            className="field-input"
            placeholder="tu@empresa.cl"
            autoComplete="username"
            required
          />
          <svg className="field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22 6 12 13 2 6"/>
          </svg>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="password">Contraseña</label>
        <div className="field-input-wrap">
          <input
            id="password"
            name="password"
            type={showPw ? "text" : "password"}
            className="field-input"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <svg className="field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <button
            type="button"
            className="toggle-pw"
            aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="remember-row">
        <label className="remember-check">
          <input
            type="checkbox"
            className="cb-custom"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Mantener sesión iniciada</span>
        </label>
        <span className="persist-hint">
          <span className="dot" style={{ background: remember ? "var(--success)" : "var(--text-4)" }} />
          <span>{remember ? "30 días" : "sólo esta vez"}</span>
        </span>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-submit" disabled={pending}>
      {pending ? "Verificando…" : "Iniciar sesión"}
      {!pending && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 12h14M13 6l6 6-6 6"/>
        </svg>
      )}
    </button>
  );
}
