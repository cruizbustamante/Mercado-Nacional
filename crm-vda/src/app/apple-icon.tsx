import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#1A1612",
          color: "#FFFFFF",
          fontFamily: "serif",
          padding: "20px",
        }}
      >
        {/* VDA letras */}
        <div
          style={{
            fontSize: 78,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "#FFFFFF",
            fontFamily: "Georgia, 'Times New Roman', serif",
            display: "flex",
          }}
        >
          VDA
        </div>

        {/* Línea + rosa de los vientos */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 16,
            width: "70%",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "#B8772D" }} />
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "1.5px solid #B8772D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 8px",
              background: "#1A1612",
            }}
          >
            {/* Estrella 4 puntas */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#B8772D">
              <polygon points="10,1 12,9 19,10 12,11 10,19 8,11 1,10 8,9" />
            </svg>
          </div>
          <div style={{ flex: 1, height: 1, background: "#B8772D" }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
