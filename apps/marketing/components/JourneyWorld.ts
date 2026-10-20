// A light architectural fallback. Perspective projection keeps forward/reverse scroll spatial.
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
  sky.addColorStop(0, "#ffffff");
  sky.addColorStop(1, "#e1e6e8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const camera = progress * 120,
    focal = Math.min(w, h) * 0.92,
    center = w * 0.7,
    horizon = h * 0.5;
  type Point = [number, number, number];
  const project = ([x, y, z]: Point) => [
    center +
      ((x - Math.sin(progress * Math.PI * 2) * 0.6) * focal) / (z - camera),
    horizon - ((y - 1.6) * focal) / (z - camera),
  ];
  const face = (points: Point[], fill: string) => {
    if (points.some((p) => p[2] - camera < 0.8)) return;
    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = project(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "#9ca8af55";
    ctx.lineWidth = 0.65;
    ctx.stroke();
  };
  const box = (
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color = "#f6f7f7",
  ) => {
    face(
      [
        [x, y, z],
        [x + width, y, z],
        [x + width, y + height, z],
        [x, y + height, z],
      ],
      color,
    );
    face(
      [
        [x + width, y, z],
        [x + width, y, z + depth],
        [x + width, y + height, z + depth],
        [x + width, y + height, z],
      ],
      "#c8cfd3",
    );
    face(
      [
        [x, y + height, z],
        [x + width, y + height, z],
        [x + width, y + height, z + depth],
        [x, y + height, z + depth],
      ],
      "#ffffff",
    );
  };
  ctx.fillStyle = "#dce2e5";
  ctx.fillRect(0, horizon, w, h - horizon);
  for (let room = 6; room >= 0; room--) {
    const z = 12 + room * 23;
    if (z - camera < 1) continue;
    face(
      [
        [-7, 0, z],
        [-7, 6, z],
        [-7, 6, z + 20],
        [-7, 0, z + 20],
      ],
      "#f6f8f8",
    );
    face(
      [
        [7, 0, z],
        [7, 6, z],
        [7, 6, z + 20],
        [7, 0, z + 20],
      ],
      "#e8edef",
    );
    box(-7, 0, z, 0.25, 6, 0.4, "#d2dade");
    box(6.75, 0, z, 0.25, 6, 0.4, "#d2dade");
    if (room % 3 === 1) {
      box(1.5, 0, z + 4, 3, 1.1, 2);
      box(2, 1.1, z + 4.3, 1.5, 1.7, 1.2, "#e7ecee");
      face(
        [
          [2, 2.8, z + 4.3],
          [3.5, 2.8, z + 4.3],
          [2.75, 3.5, z + 4.3],
        ],
        "#c63822",
      );
    } else if (room % 3 === 2) {
      for (let i = 0; i < 3; i++) {
        box(1 + i * 1.6, 0, z + 4 + i, 1, 1.3, 1);
        box(
          1.2 + i * 1.6,
          1.3,
          z + 4.2 + i,
          0.6,
          0.7,
          0.5,
          i === 1 ? "#c63822" : "#424c54",
        );
      }
    } else {
      box(1.3, 0.9, z + 5, 3, 0.18, 1.5, "#e7edef");
      box(1.5, 1.1, z + 5.7, 1.2, 1, 0.15, "#39454d");
      box(3.5, 0, z + 4.7, 0.2, 0.9, 0.2, "#747f87");
    }
    const [ax, ay] = project([-1.5, 0, z]),
      [bx, by] = project([-1.5, 0, z + 20]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = "#c6382270";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const fade = ctx.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, "#ffffff");
  fade.addColorStop(0.38, "#ffffffb0");
  fade.addColorStop(1, "#ffffff00");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
}
