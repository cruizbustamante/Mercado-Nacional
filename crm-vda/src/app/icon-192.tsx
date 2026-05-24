import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon192() {
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
          padding: 22,
        }}
      >
        <div
          style={{
            fontSize: 84,
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 18,
            width: "70%",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "#B8772D" }} />
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "1.5px solid #B8772D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 8px",
              background: "#1A1612",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="#B8772D">
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
