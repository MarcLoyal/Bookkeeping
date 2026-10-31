import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
          background: "#0f172a",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.02em" }}>Keep.Books</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              background: "rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "6px 16px",
            }}
          >
            Beta
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 32, color: "#cbd5e1" }}>Bookkeeping for the Philippines</div>
      </div>
    ),
    { ...size },
  );
}
