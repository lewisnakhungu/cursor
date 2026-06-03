/** Shared mark for ImageResponse PWA icons (inline styles only). */
export function logoIconMarkup(size: number) {
  const radius = Math.round(size * 0.25);
  const cross = Math.round(size * 0.22);
  const bar = Math.round(size * 0.08);
  const dot = Math.round(size * 0.11);
  const dotOffset = Math.round(size * 0.72);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1d8054",
        borderRadius: radius,
        position: "relative",
      }}
    >
      <div
        style={{
          width: cross,
          height: cross,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translateX(-50%)",
            width: bar,
            height: cross,
            background: "white",
            borderRadius: bar / 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: cross,
            height: bar,
            background: "white",
            borderRadius: bar / 2,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: dotOffset,
          top: dotOffset,
          width: dot,
          height: dot,
          borderRadius: "50%",
          background: "white",
        }}
      />
    </div>
  );
}
