import { clamp } from "./shared.js";

const WALL_MARGIN_CM = 8;
const GRID_CM = 5;
const ROTATION_STEP_DEG = 15;
const OPENING_SOFT_CLEARANCE_CM = 25;

const roundToGrid = (value) => Math.round(value / GRID_CM) * GRID_CM;

const cloneObjects = (objects) =>
  objects.map((item) => ({
    ...item,
    dims_cm: { ...item.dims_cm },
    pose: { ...item.pose },
    attach: item.attach ? { ...item.attach } : undefined
  }));

export const createScene2DEditor = ({
  canvas,
  getRoomShell,
  setRoomShellDimensions,
  getObjects,
  setObjects,
  getMode,
  onSelect,
  onWarning
}) => {
  const ctx = canvas.getContext("2d");
  const state = {
    dragging: null,
    warningKey: ""
  };

  const notify = (message, kind = "info") => {
    const key = `${kind}:${message}`;
    if (state.warningKey === key) return;
    state.warningKey = key;
    onWarning(message, kind);
  };

  const itemRect = (item, pose = item.pose) => {
    const halfW = item.dims_cm.w / 2;
    const halfD = item.dims_cm.d / 2;
    return {
      minX: pose.x_cm - halfW,
      maxX: pose.x_cm + halfW,
      minZ: pose.z_cm - halfD,
      maxZ: pose.z_cm + halfD
    };
  };

  const intersects = (a, b) => !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);

  const getFixedRects = () => {
    const roomShell = getRoomShell();
    const fixed = Array.isArray(roomShell?.fixed_elements) ? roomShell.fixed_elements : [];
    return fixed.map((entry) =>
      itemRect({
        dims_cm: entry.dims_cm,
        pose: {
          x_cm: entry.pose.x_cm,
          z_cm: entry.pose.z_cm
        }
      })
    );
  };

  const openingClearanceWarning = (item, pose) => {
    const roomShell = getRoomShell();
    const openings = Array.isArray(roomShell?.openings) ? roomShell.openings : [];
    if (!openings.length) return "";

    const box = itemRect(item, pose);
    const room = roomShell.dimensions;
    const clearance = Number.isFinite(item.clearance_cm) ? Number(item.clearance_cm) : OPENING_SOFT_CLEARANCE_CM;

    for (const opening of openings) {
      const openingStart = opening.offset_cm;
      const openingEnd = opening.offset_cm + opening.width_cm;

      if (opening.wall === "north" || opening.wall === "south") {
        const overlapX = !(box.maxX < openingStart || box.minX > openingEnd);
        if (!overlapX) continue;
        const wallDistance = opening.wall === "north" ? box.minZ : room.length_cm - box.maxZ;
        if (wallDistance < clearance) {
          return "Objekt on avausele liiga ligidal (clearance hoiatus).";
        }
      } else {
        const overlapZ = !(box.maxZ < openingStart || box.minZ > openingEnd);
        if (!overlapZ) continue;
        const wallDistance = opening.wall === "west" ? box.minX : room.width_cm - box.maxX;
        if (wallDistance < clearance) {
          return "Objekt on avausele liiga ligidal (clearance hoiatus).";
        }
      }
    }

    return "";
  };

  const canPlace = (item, pose) => {
    const room = getRoomShell().dimensions;
    const box = itemRect(item, pose);

    const within =
      box.minX >= WALL_MARGIN_CM &&
      box.maxX <= room.width_cm - WALL_MARGIN_CM &&
      box.minZ >= WALL_MARGIN_CM &&
      box.maxZ <= room.length_cm - WALL_MARGIN_CM;
    if (!within) return false;

    const objects = getObjects().filter((entry) => entry.id !== item.id);
    if (objects.some((other) => intersects(box, itemRect(other, other.pose)))) return false;

    const fixedRects = getFixedRects();
    if (fixedRects.some((fixed) => intersects(box, fixed))) return false;

    return true;
  };

  const applySnapPose = (item, pose) => {
    const snap = item.attach?.snap ?? "none";
    if (snap === "none") return pose;

    const room = getRoomShell().dimensions;
    const halfW = item.dims_cm.w / 2;
    const halfD = item.dims_cm.d / 2;
    const minX = WALL_MARGIN_CM + halfW;
    const maxX = room.width_cm - WALL_MARGIN_CM - halfW;
    const minZ = WALL_MARGIN_CM + halfD;
    const maxZ = room.length_cm - WALL_MARGIN_CM - halfD;

    const next = {
      x_cm: clamp(pose.x_cm, minX, maxX),
      z_cm: clamp(pose.z_cm, minZ, maxZ),
      rotation_deg: pose.rotation_deg
    };

    if (snap === "corner") {
      const corners = [
        { x_cm: minX, z_cm: minZ },
        { x_cm: maxX, z_cm: minZ },
        { x_cm: minX, z_cm: maxZ },
        { x_cm: maxX, z_cm: maxZ }
      ];
      let best = corners[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const corner of corners) {
        const distance = Math.hypot(next.x_cm - corner.x_cm, next.z_cm - corner.z_cm);
        if (distance < bestDistance) {
          best = corner;
          bestDistance = distance;
        }
      }
      return { ...next, x_cm: best.x_cm, z_cm: best.z_cm };
    }

    if (snap === "wall") {
      const distances = [
        { wall: "north", value: next.z_cm - minZ },
        { wall: "south", value: maxZ - next.z_cm },
        { wall: "west", value: next.x_cm - minX },
        { wall: "east", value: maxX - next.x_cm }
      ];
      distances.sort((left, right) => left.value - right.value);
      const nearestWall = distances[0]?.wall ?? "north";

      if (nearestWall === "north") return { ...next, z_cm: minZ };
      if (nearestWall === "south") return { ...next, z_cm: maxZ };
      if (nearestWall === "west") return { ...next, x_cm: minX };
      return { ...next, x_cm: maxX };
    }

    return next;
  };

  const getTransform = () => {
    const room = getRoomShell().dimensions;
    const pad = 22;
    const width = canvas.clientWidth || 560;
    const height = canvas.clientHeight || 380;
    const scale = Math.min((width - pad * 2) / room.width_cm, (height - pad * 2) / room.length_cm);
    return { scale, originX: pad, originY: pad, room };
  };

  const cmToCanvas = (xCm, zCm, t) => ({
    x: t.originX + xCm * t.scale,
    y: t.originY + zCm * t.scale
  });

  const canvasToCm = (xPx, yPx, t) => ({
    x: (xPx - t.originX) / t.scale,
    z: (yPx - t.originY) / t.scale
  });

  const drawRotatedRect = (x, y, w, h, angleRad, fill, stroke, lineWidth = 1.2) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleRad);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const resizeIfNeeded = () => {
    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.clientWidth || 560;
    const displayH = canvas.clientHeight || 380;
    if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
      canvas.width = Math.round(displayW * dpr);
      canvas.height = Math.round(displayH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };

  const render = (selectedId = "") => {
    resizeIfNeeded();
    const t = getTransform();

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.fillStyle = "#f5f5f2";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const roomW = t.room.width_cm * t.scale;
    const roomH = t.room.length_cm * t.scale;

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#c8c8c8";
    ctx.lineWidth = 2;
    ctx.fillRect(t.originX, t.originY, roomW, roomH);
    ctx.strokeRect(t.originX, t.originY, roomW, roomH);

    const openings = getRoomShell().openings || [];
    for (const opening of openings) {
      const width = opening.width_cm * t.scale;
      let x = t.originX;
      let y = t.originY;
      let w = width;
      let h = 6;

      if (opening.wall === "north") {
        x += opening.offset_cm * t.scale;
      }
      if (opening.wall === "south") {
        x += opening.offset_cm * t.scale;
        y += roomH - 3;
      }
      if (opening.wall === "west") {
        y += opening.offset_cm * t.scale;
        w = 6;
        h = width;
      }
      if (opening.wall === "east") {
        x += roomW - 3;
        y += opening.offset_cm * t.scale;
        w = 6;
        h = width;
      }

      ctx.fillStyle = opening.type === "door" ? "#2f8f46" : "#3d74b8";
      ctx.fillRect(x, y, w, h);
    }

    const fixedElements = getRoomShell().fixed_elements || [];
    for (const fixed of fixedElements) {
      const center = cmToCanvas(fixed.pose.x_cm, fixed.pose.z_cm, t);
      drawRotatedRect(
        center.x,
        center.y,
        fixed.dims_cm.w * t.scale,
        fixed.dims_cm.d * t.scale,
        ((fixed.pose.rotation_deg || 0) * Math.PI) / 180,
        "rgba(95,95,95,0.32)",
        "#555",
        1.2
      );
      ctx.fillStyle = "#4f4f4f";
      ctx.font = "11px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText((fixed.label || fixed.type || "fixed").slice(0, 18), center.x, center.y + 3);
    }

    const objects = getObjects();
    for (const item of objects) {
      const center = cmToCanvas(item.pose.x_cm, item.pose.z_cm, t);
      const selected = selectedId === item.id;
      const fill = item.source === "cart" ? "rgba(200,154,91,0.58)" : "rgba(177,183,191,0.58)";
      const stroke = selected ? "#b3161b" : "#4d4d4d";

      drawRotatedRect(
        center.x,
        center.y,
        item.dims_cm.w * t.scale,
        item.dims_cm.d * t.scale,
        (item.pose.rotation_deg * Math.PI) / 180,
        fill,
        stroke,
        selected ? 2 : 1.1
      );

      ctx.fillStyle = "#111";
      ctx.font = "12px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(item.title.slice(0, 24), center.x, center.y + 4);

      if (selected) {
        const angle = (item.pose.rotation_deg * Math.PI) / 180;
        const handleX = center.x + Math.cos(angle) * ((item.dims_cm.w * t.scale) / 2 + 12);
        const handleY = center.y + Math.sin(angle) * ((item.dims_cm.w * t.scale) / 2 + 12);
        ctx.fillStyle = "#b3161b";
        ctx.beginPath();
        ctx.arc(handleX, handleY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (getMode() === "edit-room") {
      ctx.fillStyle = "#b3161b";
      ctx.beginPath();
      ctx.arc(t.originX + roomW, t.originY + roomH / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.originX + roomW / 2, t.originY + roomH, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#666";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText(
      `${Math.round(t.room.width_cm)} × ${Math.round(t.room.length_cm)} × ${Math.round(t.room.height_cm)} cm`,
      12,
      canvas.clientHeight - 10
    );
  };

  const pointInObject = (item, xCm, zCm) => {
    const dx = xCm - item.pose.x_cm;
    const dz = zCm - item.pose.z_cm;
    const theta = (-item.pose.rotation_deg * Math.PI) / 180;
    const localX = dx * Math.cos(theta) - dz * Math.sin(theta);
    const localZ = dx * Math.sin(theta) + dz * Math.cos(theta);
    return Math.abs(localX) <= item.dims_cm.w / 2 && Math.abs(localZ) <= item.dims_cm.d / 2;
  };

  const pickObject = (xCm, zCm) => {
    const objects = getObjects();
    for (let i = objects.length - 1; i >= 0; i -= 1) {
      if (pointInObject(objects[i], xCm, zCm)) return objects[i];
    }
    return null;
  };

  const hitRoomHandle = (point) => {
    const t = getTransform();
    const roomW = t.room.width_cm * t.scale;
    const roomH = t.room.length_cm * t.scale;
    const handles = [
      { id: "width", x: t.originX + roomW, y: t.originY + roomH / 2 },
      { id: "length", x: t.originX + roomW / 2, y: t.originY + roomH }
    ];
    const hit = handles.find((handle) => Math.hypot(point.x - handle.x, point.y - handle.y) <= 14);
    return hit?.id ?? null;
  };

  const toPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("pointerdown", (event) => {
    const t = getTransform();
    const point = toPoint(event);

    if (getMode() === "edit-room") {
      const handle = hitRoomHandle(point);
      if (handle) {
        state.dragging = { type: "room", handle };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }

    const roomPoint = canvasToCm(point.x, point.y, t);
    const picked = pickObject(roomPoint.x, roomPoint.z);
    if (!picked) return;

    onSelect(picked.id);

    if (getMode() === "furnish") {
      if (picked.locked) {
        notify("Objekt on lukustatud. Ava inspectoris lukustus, et liigutada.", "warn");
        return;
      }

      setObjects(cloneObjects(getObjects()), true);

      if (event.button === 2) {
        state.dragging = {
          type: "rotate",
          objectId: picked.id,
          startX: point.x,
          startRotation: picked.pose.rotation_deg
        };
      } else {
        state.dragging = {
          type: "object",
          objectId: picked.id,
          offsetX: picked.pose.x_cm - roomPoint.x,
          offsetZ: picked.pose.z_cm - roomPoint.z
        };
      }
      canvas.setPointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;

    const t = getTransform();
    const point = toPoint(event);

    if (state.dragging.type === "room") {
      const room = getRoomShell().dimensions;
      if (state.dragging.handle === "width") {
        const nextWidth = clamp((point.x - t.originX) / t.scale, 120, 20000);
        setRoomShellDimensions({
          width_cm: roundToGrid(nextWidth),
          length_cm: room.length_cm,
          height_cm: room.height_cm
        });
        notify("Seina laius muudetud.", "ok");
        return;
      }

      const nextLength = clamp((point.y - t.originY) / t.scale, 120, 20000);
      setRoomShellDimensions({
        width_cm: room.width_cm,
        length_cm: roundToGrid(nextLength),
        height_cm: room.height_cm
      });
      notify("Seina pikkus muudetud.", "ok");
      return;
    }

    const objects = getObjects();
    const object = objects.find((item) => item.id === state.dragging.objectId);
    if (!object) return;

    if (state.dragging.type === "rotate") {
      const deltaX = point.x - state.dragging.startX;
      const rawRotation = state.dragging.startRotation + deltaX * 0.45;
      const nextRotation = event.shiftKey
        ? rawRotation
        : Math.round(rawRotation / ROTATION_STEP_DEG) * ROTATION_STEP_DEG;
      const nextObjects = objects.map((item) =>
        item.id === object.id
          ? {
              ...item,
              pose: {
                ...item.pose,
                rotation_deg: nextRotation
              }
            }
          : item
      );
      setObjects(nextObjects, false);
      notify(event.shiftKey ? "Sujuv poore aktiivne." : "Poore samm 15°.", "ok");
      return;
    }

    const roomPoint = canvasToCm(point.x, point.y, t);
    const freePose = {
      x_cm: roundToGrid(roomPoint.x + state.dragging.offsetX),
      z_cm: roundToGrid(roomPoint.z + state.dragging.offsetZ),
      rotation_deg: object.pose.rotation_deg
    };
    const snappedPose = applySnapPose(object, freePose);

    if (!canPlace(object, snappedPose)) {
      notify("Kokkuporge teise objekti/fixed elemendiga voi ruumist valjas.", "err");
      return;
    }

    const nextObjects = objects.map((item) =>
      item.id === object.id ? { ...item, pose: { ...snappedPose } } : item
    );
    setObjects(nextObjects, false);

    const clearanceMessage = openingClearanceWarning(object, snappedPose);
    if (clearanceMessage) {
      notify(clearanceMessage, "warn");
      return;
    }
    notify("Objekti asukoht uuendatud.", "ok");
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!state.dragging) return;
    state.dragging = null;
    state.warningKey = "";
    canvas.releasePointerCapture(event.pointerId);
  });

  return {
    render,
    resize() {
      render();
    }
  };
};
