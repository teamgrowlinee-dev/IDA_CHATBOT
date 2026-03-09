import { clamp, computeDimensions } from "./shared.js";

export const createRoomShellEditor = ({ canvas, widthInput, lengthInput, heightInput, onChange }) => {
  const ctx = canvas.getContext("2d");
  const state = {
    dragging: null,
    dimensions: computeDimensions(
      Number(widthInput.value || 420),
      Number(lengthInput.value || 560),
      Number(heightInput.value || 260)
    )
  };

  const toShape = () => {
    const pad = 60;
    const drawW = canvas.clientWidth - pad * 2;
    const drawH = canvas.clientHeight - pad * 2;
    const scale = Math.min(drawW / state.dimensions.width_cm, drawH / state.dimensions.length_cm);
    const w = state.dimensions.width_cm * scale;
    const h = state.dimensions.length_cm * scale;
    const x = (canvas.clientWidth - w) / 2;
    const y = (canvas.clientHeight - h) / 2;
    return { x, y, w, h, scale };
  };

  const paint = () => {
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth || 760;
    const displayH = canvas.clientHeight || 320;
    if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
      canvas.width = Math.round(displayW * dpr);
      canvas.height = Math.round(displayH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, displayW, displayH);
    const shape = toShape();

    ctx.fillStyle = "#f9f8f5";
    ctx.fillRect(0, 0, displayW, displayH);

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#aaadb3";
    ctx.lineWidth = 2;
    ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);

    ctx.fillStyle = "#111";
    ctx.font = "14px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(state.dimensions.width_cm)} cm`, shape.x + shape.w / 2, shape.y - 14);

    ctx.save();
    ctx.translate(shape.x + shape.w + 18, shape.y + shape.h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`${Math.round(state.dimensions.length_cm)} cm`, 0, 0);
    ctx.restore();

    ctx.fillStyle = "#b3161b";
    const handleRadius = 8;
    ctx.beginPath();
    ctx.arc(shape.x + shape.w, shape.y + shape.h / 2, handleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(shape.x + shape.w / 2, shape.y + shape.h, handleRadius, 0, Math.PI * 2);
    ctx.fill();
  };

  const syncInputs = () => {
    widthInput.value = String(Math.round(state.dimensions.width_cm));
    lengthInput.value = String(Math.round(state.dimensions.length_cm));
    heightInput.value = String(Math.round(state.dimensions.height_cm));
    if (typeof onChange === "function") onChange(getDimensions());
  };

  const setDimensions = (next) => {
    state.dimensions = computeDimensions(
      clamp(next.width_cm, 120, 20000),
      clamp(next.length_cm, 120, 20000),
      clamp(next.height_cm, 180, 1000)
    );
    syncInputs();
    paint();
  };

  const getDimensions = () => ({ ...state.dimensions });

  const fromPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const hitHandle = (point) => {
    const shape = toShape();
    const handles = [
      { id: "width", x: shape.x + shape.w, y: shape.y + shape.h / 2 },
      { id: "length", x: shape.x + shape.w / 2, y: shape.y + shape.h }
    ];
    const found = handles.find((handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= 14);
    return found?.id ?? null;
  };

  canvas.addEventListener("pointerdown", (event) => {
    const point = fromPointer(event);
    const handle = hitHandle(point);
    if (!handle) return;
    state.dragging = { handle };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const point = fromPointer(event);
    const shape = toShape();

    if (state.dragging.handle === "width") {
      const nextWidth = ((point.x - shape.x) / shape.scale);
      setDimensions({ ...state.dimensions, width_cm: nextWidth });
      return;
    }

    if (state.dragging.handle === "length") {
      const nextLength = ((point.y - shape.y) / shape.scale);
      setDimensions({ ...state.dimensions, length_cm: nextLength });
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (state.dragging) {
      state.dragging = null;
      canvas.releasePointerCapture(event.pointerId);
    }
  });

  const handleInput = () => {
    setDimensions({
      width_cm: Number(widthInput.value || 420),
      length_cm: Number(lengthInput.value || 560),
      height_cm: Number(heightInput.value || 260)
    });
  };

  widthInput.addEventListener("input", handleInput);
  lengthInput.addEventListener("input", handleInput);
  heightInput.addEventListener("input", handleInput);
  window.addEventListener("resize", paint);

  paint();

  return {
    getDimensions,
    setDimensions,
    repaint: paint
  };
};
