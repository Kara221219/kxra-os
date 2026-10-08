// A deterministic architectural world. Scroll moves the camera, not a video file.
export function drawJourneyWorld(canvas: HTMLCanvasElement, progress: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  if (
    canvas.width !== Math.round(w * ratio) ||
    canvas.height !== Math.round(h * ratio)
  ) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, "#07111f");
  sky.addColorStop(0.65, "#142438");
  sky.addColorStop(1, "#635039");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const camera = progress * 126;
  const focal = Math.min(w, h) * 0.93;
  const horizon = h * 0.51;
  const vanishingX = w * (w < 700 ? 0.6 : 0.7);
  const drift = Math.sin(progress * Math.PI * 2) * 1.4;
  type Point = [number, number, number];
  const project = ([x, y, z]: Point) => {
    const depth = z - camera;
    return [
      vanishingX + ((x - drift) * focal) / depth,
      horizon - ((y - 2.4) * focal) / depth,
    ];
  };
  const polygon = (
    points: Point[],
    fill: string,
    stroke = "rgba(219,185,125,.28)",
  ) => {
    if (points.some((point) => point[2] - camera < 0.8)) return;
    ctx.beginPath();
    points.forEach((point, i) => {
      const [x, y] = project(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  };
  // Far-to-near opaque facades, with a clear central route through the city.
  for (let row = 25; row >= 0; row--) {
    const z = 10 + row * 8;
    const depth = z - camera;
    if (depth < 1) continue;
    for (const side of [-1, 1]) {
      const x = side * (5.8 + (row % 3) * 1.9);
      const height = 5 + ((row * 7 + (side + 1) * 3) % 13);
      const width = 2.6 + (row % 2);
      const left = x - width / 2,
        right = x + width / 2;
      polygon(
        [
          [left, 0, z],
          [right, 0, z],
          [right, height, z],
          [left, height, z],
        ],
        row % 2 ? "#122032" : "#1b2938",
      );
      polygon(
        [
          [right, 0, z],
          [right, 0, z + 4],
          [right, height, z + 4],
          [right, height, z],
        ],
        "#091422",
      );
      polygon(
        [
          [left, height, z],
          [right, height, z],
          [right, height, z + 4],
          [left, height, z + 4],
        ],
        "#344151",
      );
      for (let level = 1; level < height; level += 1.3) {
        const a = project([left + 0.25, level, z]),
          b = project([right - 0.25, level, z]);
        ctx.strokeStyle =
          level % 3 < 1.5 ? "rgba(240,205,143,.65)" : "rgba(149,176,194,.17)";
        ctx.lineWidth = Math.max(0.5, (focal / depth) * 0.025);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
  }
  // Gold architectural ribs and floor rails establish the forward camera motion.
  for (let i = 19; i >= 0; i--) {
    const z = 7 + i * 11;
    if (z - camera < 1) continue;
    const points: Point[] = [
      [-4.5, 0, z],
      [-4.5, 6.8, z],
      [-3.4, 8, z],
      [3.4, 8, z],
      [4.5, 6.8, z],
      [4.5, 0, z],
    ];
    ctx.beginPath();
    points.forEach((point, index) => {
      const [x, y] = project(point);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = `rgba(232,195,125,${Math.min(0.8, 14 / (z - camera))})`;
    ctx.lineWidth = Math.min(3, 25 / (z - camera));
    ctx.stroke();
  }
  for (const x of [-4.5, -3.8, 3.8, 4.5]) {
    const a = project([x, 0, camera + 1]),
      b = project([x, 0, camera + 180]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = "rgba(230,189,113,.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const shade = ctx.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, "rgba(5,12,22,.97)");
  shade.addColorStop(0.38, "rgba(5,12,22,.86)");
  shade.addColorStop(0.75, "rgba(5,12,22,.05)");
  shade.addColorStop(1, "rgba(5,12,22,.12)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
}
