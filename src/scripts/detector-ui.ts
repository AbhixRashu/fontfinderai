// Font Finder AI — Detector UI controller. Wires the engine to the DOM.
import {
  getIndex,
  processImage,
  readLetters,
  detect,
  isJoined,
  rotateImageToCanvas,
  warpQuadToRect,
  type LoadedImage,
  type DetectResult,
  type QuadPoint,
} from "./detector";
import { commercialLookalikes } from "./commercial-data";
import { pairingSlugs, pairingLabel } from "./pairing-data";

interface State {
  crop: { x: number; y: number; w: number; h: number } | null;
  loaded: LoadedImage | null;
  activeWord: number;
  labels: Map<number, string[]>;
  result: DetectResult | null;
  preview: string;
  identified: boolean;
  rotation: number;
  warpQuad: QuadPoint[] | null;
  warpApplied: boolean;
}

const DEFAULT_PREVIEW = "The quick brown fox jumps over the lazy dog";

function q<K extends HTMLElement>(root: ParentNode, sel: string): K | null {
  return root.querySelector(sel) as K | null;
}

function qa<T extends Element>(root: ParentNode, sel: string): T[] {
  return [...root.querySelectorAll<T>(sel)];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const bigint = parseInt(h, 16);
  if (Number.isNaN(bigint)) return `rgba(99, 102, 241, ${alpha})`;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function accent(alpha = 1): string {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--accent-link").trim();
  const base = hex || "#6366f1";
  return alpha >= 1 ? base : hexToRgba(base, alpha);
}

export function initDetector(root: HTMLElement): void {
  if (root.dataset.detectorInit === "1") return;
  root.dataset.detectorInit = "1";
  const state: State = {
    crop: null,
    loaded: null,
    activeWord: 0,
    labels: new Map(),
    result: null,
    preview: DEFAULT_PREVIEW,
    identified: false,
    rotation: 0,
    warpQuad: null,
    warpApplied: false,
  };

  // ---- stage helpers -------------------------------------------------------
  const stageIdle = q(root, "[data-stage-idle]")!;
  const stageLoading = q(root, "[data-stage-loading]")!;
  const stageCrop = q(root, "[data-stage-crop]")!;
  const stageLabel = q(root, "[data-stage-label]")!;
  const stageWorking = q(root, "[data-stage-working]")!;
  const stageResults = q(root, "[data-stage-results]")!;

  const errorBox = q(root, "[data-error]")!;
  const errorMessage = q(root, "[data-error-message]")!;
  const loadingLabel = q(root, "[data-loading-label]")!;
  const loadingBar = q(root, "[data-loading-bar]")!;
  const workingBar = q(root, "[data-progress-bar]")!;
  const workingLabel = q(root, "[data-progress-label]")!;

  const stages = [stageIdle, stageLoading, stageCrop, stageLabel, stageWorking, stageResults];
  function showStage(name: string): void {
    stages.forEach((s) => s.classList.toggle("hidden", !s.matches(`[data-stage-${name}]`)));
  }

  function setError(msg: string | null): void {
    errorBox.classList.toggle("hidden", !msg);
    if (msg) errorMessage.textContent = msg;
  }

  function setLoading(msg: string, pct: number): void {
    loadingLabel.textContent = msg;
    loadingBar.style.width = `${pct}%`;
  }

  // ---- image lifecycle -----------------------------------------------------
  let objectUrl = "";
  let hasImage = false;

  function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be decoded."));
      img.src = src;
    });
  }

  function resetState(): void {
    state.crop = null;
    state.loaded = null;
    state.labels.clear();
    state.result = null;
    state.identified = false;
    state.activeWord = 0;
    state.rotation = 0;
    state.warpQuad = null;
    state.warpApplied = false;
    buffer = null;
    drag = null;
    if (rotateRange) rotateRange.value = "0";
    if (rotateVal) rotateVal.textContent = "0°";
  }

  // Reprocess the current source with the live rotation + perspective warp,
  // then (optionally) continue to the next stage.
  async function reprocess(next?: () => void): Promise<void> {
    if (!hasImage) return;
    setError(null);
    showStage("loading");
    setLoading("Preparing your image…", 12);
    try {
      const img = await loadImageElement(objectUrl);
      let canvas = rotateImageToCanvas(img, state.rotation);
      if (state.warpApplied && state.warpQuad) {
        canvas = warpQuadToRect(canvas, state.warpQuad);
      }
      setLoading("Detecting text…", 55);
      const dataUrl = canvas.toDataURL("image/png");
      const working = await loadImageElement(dataUrl);
      state.loaded = processImage(working, state.crop);
      buffer = null;
      renderCropFrame();
      if (next) {
        next();
      } else {
        showStage("crop");
        requestAnimationFrame(() => renderCropFrame());
      }
    } catch (e) {
      setError(`Could not process the image: ${e instanceof Error ? e.message : String(e)}`);
      showStage("idle");
    }
  }

  async function loadFile(file: File): Promise<void> {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError("Please use an image smaller than 12 MB.");
      return;
    }
    if (objectUrl && objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    hasImage = true;
    resetState();
    setLoading("Preparing your image…", 15);
    showStage("loading");
    await reprocess();
  }

  // ---- crop canvas ---------------------------------------------------------
  const cropCanvas = q<HTMLCanvasElement>(root, "[data-crop-canvas]")!;
  const cropApply = q<HTMLButtonElement>(root, "[data-crop-done]")!;
  const cropClear = q<HTMLButtonElement>(root, "[data-crop-clear]")!;
  const cropHint = q(root, "[data-crop-hint]")!;
  const cropCount = q(root, "[data-crop-count]")!;
  const rotateRange = q<HTMLInputElement>(root, "[data-rotate]")!;
  const rotateVal = q(root, "[data-rotate-val]");
  const rotate90 = q<HTMLButtonElement>(root, "[data-rotate-90]");
  const cropReset = q<HTMLButtonElement>(root, "[data-crop-reset]");
  const warpApply = q<HTMLButtonElement>(root, "[data-warp-apply]");
  const warpHint = q(root, "[data-warp-hint]");
  let buffer: HTMLCanvasElement | null = null;
  let drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let cornerDrag: number | null = null;

  function imageCorners(): QuadPoint[] {
    const { width, height } = state.loaded!.image;
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
  }

  function displayPoint(p: QuadPoint): { x: number; y: number } {
    const loaded = state.loaded!;
    const rect = cropCanvas.getBoundingClientRect();
    const dw = Math.max(1, Math.round(rect.width || 320));
    const dh = Math.max(1, Math.round(rect.height || 180));
    return {
      x: ((p.x - loaded.source.x) / loaded.scale) * (dw / loaded.image.width),
      y: ((p.y - loaded.source.y) / loaded.scale) * (dh / loaded.image.height),
    };
  }

  function makeBuffer(): void {
    if (!state.loaded) return;
    buffer = document.createElement("canvas");
    buffer.width = state.loaded.image.width;
    buffer.height = state.loaded.image.height;
    buffer.getContext("2d")!.putImageData(
      new ImageData(state.loaded.image.data, state.loaded.image.width, state.loaded.image.height),
      0,
      0
    );
  }

  function drawWarpOverlay(ctx: CanvasRenderingContext2D, _dw: number, _dh: number): void {
    const quad = state.warpQuad ?? imageCorners();
    const pts = quad.map(displayPoint);
    if (state.warpQuad) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = accent(0.08);
      ctx.fill();
      ctx.strokeStyle = accent(0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      warpHint?.classList.add("hidden");
    }
    const size = 10;
    pts.forEach((p) => {
      ctx.fillStyle = accent();
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    });
    if (state.warpQuad && !state.warpApplied) warpApply?.classList.remove("hidden");
    else warpApply?.classList.add("hidden");
  }

  function drawCropOverlay(ctx: CanvasRenderingContext2D, dw: number, dh: number): void {
    const loaded = state.loaded;
    const sel =
      state.crop ??
      (drag
        ? {
            x: Math.min(drag.x0, drag.x1),
            y: Math.min(drag.y0, drag.y1),
            w: Math.abs(drag.x1 - drag.x0),
            h: Math.abs(drag.y1 - drag.y0),
          }
        : null);
    if (!sel || !loaded) {
      ctx.strokeStyle = accent(0.9);
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(0, 0, dw, dh);
      ctx.setLineDash([]);
      return;
    }
    const toX = (nx: number) => ((nx - loaded.source.x) / loaded.scale) * (dw / loaded.image.width);
    const toY = (ny: number) => ((ny - loaded.source.y) / loaded.scale) * (dh / loaded.image.height);
    const rx = toX(sel.x);
    const ry = toY(sel.y);
    const rw = toX(sel.x + sel.w) - rx;
    const rh = toY(sel.y + sel.h) - ry;
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, dw, ry);
    ctx.fillRect(0, ry + rh, dw, dh - ry - rh);
    ctx.fillRect(0, ry, rx, rh);
    ctx.fillRect(rx + rw, ry, dw - rx - rw, rh);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([10, 6]);
    ctx.strokeStyle = accent(0.9);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    const size = 8;
    ctx.fillStyle = accent();
    const handles: [number, number][] = [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh],
      [rx + rw / 2, ry],
      [rx + rw / 2, ry + rh],
      [rx, ry + rh / 2],
      [rx + rw, ry + rh / 2],
    ];
    for (const [hx, hy] of handles) ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
  }

  function renderCropFrame(): void {
    if (!state.loaded) return;
    if (!buffer) makeBuffer();
    const ctx = cropCanvas.getContext("2d")!;
    const rect = cropCanvas.getBoundingClientRect();
    const dw = Math.max(1, Math.round(rect.width || 320));
    const dh = Math.max(1, Math.round(rect.height || 180));
    if (cropCanvas.width !== dw) cropCanvas.width = dw;
    if (cropCanvas.height !== dh) cropCanvas.height = dh;
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(buffer!, 0, 0, dw, dh);
    if (!state.warpQuad) drawCropOverlay(ctx, dw, dh);
    drawWarpOverlay(ctx, dw, dh);
    cropHint.classList.toggle("hidden", !!state.crop || !!drag);
    const words = state.loaded.words.length;
    cropCount.textContent = `${words} word${words === 1 ? "" : "s"} detected`;
  }

  function clientToImage(e: PointerEvent): { x: number; y: number } {
    const rect = cropCanvas.getBoundingClientRect();
    const loaded = state.loaded!;
    const px = (e.clientX - rect.left) * (loaded.image.width / rect.width);
    const py = (e.clientY - rect.top) * (loaded.image.height / rect.height);
    return {
      x: clamp(loaded.source.x + px / loaded.scale, 0, loaded.naturalWidth),
      y: clamp(loaded.source.y + py / loaded.scale, 0, loaded.naturalHeight),
    };
  }

  function cornerAt(e: PointerEvent): number | null {
    const quad = state.warpQuad ?? imageCorners();
    const p = clientToImage(e);
    const radius = 30;
    for (let i = 0; i < 4; i++) {
      const c = quad[i];
      if (Math.hypot(c.x - p.x, c.y - p.y) <= radius) return i;
    }
    return null;
  }

  cropCanvas.addEventListener("pointerdown", (e: PointerEvent) => {
    if (!state.loaded) return;
    const hit = cornerAt(e);
    if (hit !== null) {
      if (!state.warpQuad) state.warpQuad = imageCorners();
      if (state.warpApplied) {
        state.warpQuad = imageCorners();
        state.warpApplied = false;
      }
      cornerDrag = hit;
      cropCanvas.setPointerCapture(e.pointerId);
      return;
    }
    const p = clientToImage(e);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    cropCanvas.setPointerCapture(e.pointerId);
  });
  cropCanvas.addEventListener("pointermove", (e: PointerEvent) => {
    if (!state.loaded) return;
    if (cornerDrag !== null && state.warpQuad) {
      const p = clientToImage(e);
      state.warpQuad[cornerDrag] = p;
      renderCropFrame();
      return;
    }
    if (!drag) return;
    const p = clientToImage(e);
    drag.x1 = p.x;
    drag.y1 = p.y;
    renderCropFrame();
  });
  const endPointer = (e: PointerEvent) => {
    if (!state.loaded) return;
    if (cornerDrag !== null) {
      cornerDrag = null;
      renderCropFrame();
      return;
    }
    if (!drag) return;
    const p = clientToImage(e);
    drag.x1 = p.x;
    drag.y1 = p.y;
    const { x0, y0, x1, y1 } = drag;
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (w > 8 && h > 8) state.crop = { x, y, w, h };
    drag = null;
    renderCropFrame();
  };
  cropCanvas.addEventListener("pointerup", endPointer);
  cropCanvas.addEventListener("pointercancel", endPointer);

  // ---- rotation + perspective controls --------------------------------------
  const rotate = (deg: number): void => {
    state.rotation = ((state.rotation + deg) % 360 + 360) % 360;
    state.warpQuad = null;
    state.warpApplied = false;
    if (rotateRange) rotateRange.value = String(Math.round(state.rotation));
    if (rotateVal) rotateVal.textContent = `${Math.round(state.rotation)}°`;
    void reprocess();
  };

  let rotateTimer: ReturnType<typeof setTimeout> | null = null;
  rotateRange?.addEventListener("input", () => {
    state.rotation = parseInt(rotateRange.value || "0", 10);
    if (rotateVal) rotateVal.textContent = `${state.rotation}°`;
    state.warpQuad = null;
    state.warpApplied = false;
    if (rotateTimer) clearTimeout(rotateTimer);
    rotateTimer = setTimeout(() => void reprocess(), 140);
  });
  rotate90?.addEventListener("click", () => rotate(90));
  cropReset?.addEventListener("click", () => {
    if (state.rotation === 0 && !state.warpQuad && !state.warpApplied) return;
    state.rotation = 0;
    state.warpQuad = null;
    state.warpApplied = false;
    if (rotateRange) rotateRange.value = "0";
    if (rotateVal) rotateVal.textContent = "0°";
    void reprocess();
  });
  warpApply?.addEventListener("click", () => {
    if (!state.warpQuad) return;
    state.warpApplied = true;
    void reprocess();
  });

  function enterLabelStage(): void {
    state.activeWord = state.loaded!.primary;
    renderWordPicker();
    void renderLabelGrid().then(() => showStage("label"));
  }

  cropApply.addEventListener("click", () => {
    if (!state.loaded) return;
    setError(null);
    state.labels.clear();
    void reprocess(enterLabelStage);
  });
  cropClear.addEventListener("click", () => {
    state.crop = null;
    state.labels.clear();
    void reprocess(enterLabelStage);
  });

  // ---- word picker + labelling ---------------------------------------------
  const wordSection = q(root, "[data-word-section]");
  const wordPicker = q(root, "[data-word-picker]")!;
  const labelGrid = q(root, "[data-label-render]")!;
  const labelIdentify = q<HTMLButtonElement>(root, "[data-label-identify]")!;
  const labelCropBtn = q<HTMLButtonElement>(root, "[data-label-crop]");
  const labelResetBtn = q<HTMLButtonElement>(root, "[data-label-reset]");
  const labelSub = q(root, "[data-label-sub]")!;

  const scratchCanvas = document.createElement("canvas");

  function wordPreview(box: { x: number; y: number; w: number; h: number }): string {
    if (!buffer) makeBuffer();
    if (!buffer) return "";
    const pad = 4;
    const maxH = 40;
    const scale = Math.min(1, maxH / Math.max(1, box.h));
    const targetW = Math.max(28, Math.round(box.w * scale + pad * 2));
    const targetH = Math.max(28, Math.round(box.h * scale + pad * 2));

    scratchCanvas.width = targetW;
    scratchCanvas.height = targetH;
    const ctx = scratchCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.fillStyle = "#121215";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      buffer,
      Math.max(0, box.x),
      Math.max(0, box.y),
      box.w,
      box.h,
      pad,
      pad,
      targetW - pad * 2,
      targetH - pad * 2
    );
    return scratchCanvas.toDataURL("image/png");
  }

  function queryImagePreview(box: { x: number; y: number; w: number; h: number }): string {
    if (!buffer) makeBuffer();
    if (!buffer) return "";
    const pad = 8;
    scratchCanvas.width = box.w + pad * 2;
    scratchCanvas.height = box.h + pad * 2;
    const ctx = scratchCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      buffer,
      Math.max(0, box.x),
      Math.max(0, box.y),
      box.w,
      box.h,
      pad,
      pad,
      box.w,
      box.h
    );
    return scratchCanvas.toDataURL("image/png");
  }

  function renderWordPicker(): void {
    if (!state.loaded) return;
    const words = state.loaded.words;
    wordPicker.innerHTML = "";
    if (words.length <= 1) {
      wordSection?.classList.add("hidden");
    } else {
      wordSection?.classList.remove("hidden");
      words.forEach((word, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "word-chip" + (i === state.activeWord ? " word-chip-active" : "");
        btn.setAttribute("aria-label", `Select word ${i + 1}`);

        const img = document.createElement("img");
        img.src = wordPreview(word.bounds);
        img.alt = `Word ${i + 1}`;
        img.className = "word-chip-img";

        btn.appendChild(img);
        btn.addEventListener("click", () => {
          state.activeWord = i;
          renderWordPicker();
          renderLabelGrid();
        });
        wordPicker.append(btn);
      });
    }
  }

  function glyphPreview(box: { x: number; y: number; w: number; h: number }): string {
    if (!buffer) makeBuffer();
    if (!buffer) return "";
    const pad = 4;
    const gs = 56;
    scratchCanvas.width = gs;
    scratchCanvas.height = gs;
    const ctx = scratchCanvas.getContext("2d")!;
    ctx.fillStyle = "#141418";
    ctx.fillRect(0, 0, gs, gs);
    const scale = (gs - pad * 2) / Math.max(box.w, box.h, 1);
    const dw = box.w * scale;
    const dh = box.h * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffer, box.x, box.y, box.w, box.h, (gs - dw) / 2, (gs - dh) / 2, dw, dh);
    return scratchCanvas.toDataURL("image/png");
  }

  async function renderLabelGrid(): Promise<void> {
    if (!state.loaded) return;
    const words = state.loaded.words;
    if (!words.length) {
      labelGrid.innerHTML = `<p class="text-sm text-tone-mute">No text detected in this crop. Try a different crop, or ${state.crop ? "clear" : "re-upload"} a clearer image.</p>`;
      return;
    }
    const word = words[state.activeWord];
    const joined = isJoined(word.boxes);
    labelGrid.innerHTML = "";
    labelSub.textContent = joined
      ? "Connected script detected — type the text below to match whole word."
      : "Fix any that are wrong, and clear the box of anything that is not a letter.";

    if (joined) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "word-input-full";
      input.placeholder = "Type the text you see…";
      input.value = state.labels.get(state.activeWord)?.[0] ?? "";
      input.addEventListener("input", () => {
        const v = input.value.trim();
        state.labels.set(state.activeWord, v ? [v] : []);
      });
      labelGrid.append(input);
      return;
    }

    if (!state.labels.has(state.activeWord)) {
      try {
        const letters = await readLetters(word);
        state.labels.set(state.activeWord, letters);
      } catch {
        state.labels.set(state.activeWord, word.boxes.map(() => ""));
      }
    }

    const labels = state.labels.get(state.activeWord)!;
    word.boxes.forEach((box, i) => {
      const cell = document.createElement("div");
      cell.className = "glyph-cell";

      const img = document.createElement("img");
      img.alt = `letter ${i + 1}`;
      img.className = "glyph-img";
      img.src = glyphPreview(box);

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 1;
      input.className = "glyph-input";
      input.value = labels[i] ?? "";
      input.setAttribute("aria-label", `letter ${i + 1}`);
      input.addEventListener("input", () => {
        labels[i] = input.value.trim().toLowerCase() || "";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Tab") return;
        if (e.key.length === 1 || e.key === "Backspace" || e.key === "ArrowRight" || e.key === "ArrowLeft")
          return;
        e.preventDefault();
      });
      cell.append(img, input);
      labelGrid.append(cell);
    });
  }

  labelCropBtn?.addEventListener("click", () => {
    showStage("crop");
    requestAnimationFrame(() => renderCropFrame());
  });

  labelResetBtn?.addEventListener("click", () => resetAll());

  async function identify(typed: boolean): Promise<void> {
    if (!state.loaded || !state.loaded.words.length) return;
    const word = state.loaded.words[state.activeWord];
    const joined = isJoined(word.boxes);
    let letters: string[];
    if (typed && state.labels.has(state.activeWord)) {
      letters = state.labels.get(state.activeWord)!;
    } else {
      try {
        letters = await readLetters(word);
      } catch {
        letters = [];
      }
    }
    if (joined && !letters.join("").trim()) {
      setError("Type the text you see so we can match the lettering.");
      return;
    }
    setError(null);
    showStage("working");
    workingBar.style.width = "0%";
    workingLabel.textContent = "Identifying your font…";
    const indexCount = (await getIndex()).fonts.length;
    try {
      const result = await detect(
        state.loaded,
        state.activeWord,
        letters,
        (done, total) => {
          workingBar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
          workingLabel.textContent = `Matching against ${indexCount.toLocaleString()} fonts in your browser (${done}/${total})…`;
        }
      );
      state.result = result;
      state.identified = true;
      renderResults(result);
      showStage("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      showStage("label");
    }
  }

  labelIdentify.addEventListener("click", () => void identify(true));

  // ---- results -------------------------------------------------------------
  const resultsGrid = q(root, "[data-results]")!;
  const resultsNone = q(root, "[data-results-none]")!;
  const resultsCount = q(root, "[data-result-count]")!;
  const detailMethod = q(root, "[data-method]")!;
  const detailThinning = q(root, "[data-thinning]")!;
  const detailLetters = q(root, "[data-letters]")!;
  const commercialBox = q(root, "[data-results-commercial]")!;
  const queryImg = q<HTMLImageElement>(root, "[data-result-query-img]")!;

  const THINNING_LABEL = ["not thinned", "lightly thinned", "thinned", "heavily thinned"];

  function cssFor(slug: string, family: string, weight: string): string {
    const w = weight === "bold" ? "700" : "400";
    return `@import url('https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${w}&display=swap');\n\n.font-${slug} {\n  font-family: '${family}', sans-serif;\n  font-weight: ${w};\n}`;
  }

  async function copyCss(slug: string, family: string, weight: string, btn: HTMLElement): Promise<void> {
    const text = cssFor(slug, family, weight);
    try {
      await navigator.clipboard.writeText(text);
      const prev = btn.textContent;
      btn.textContent = "Copied ✓";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove("copied");
      }, 1800);
    } catch {
      btn.textContent = "Copy failed";
      setTimeout(() => (btn.textContent = "Copy CSS"), 1800);
    }
  }

  async function renderResults(result: DetectResult): Promise<void> {
    resultsGrid.innerHTML = "";
    if (!result.fonts.length) {
      resultsNone.classList.remove("hidden");
      resultsGrid.classList.add("hidden");
      resultsCount.textContent = "0";
    } else {
      resultsNone.classList.add("hidden");
      resultsGrid.classList.remove("hidden");
      resultsCount.textContent = String(result.fonts.length);
    }

    detailMethod.textContent =
      result.method === "render"
        ? "Whole-word rendering comparison"
        : "Letter shape matching + whole-word verification";
    detailThinning.textContent = THINNING_LABEL[Math.min(result.thinning, THINNING_LABEL.length - 1)];
    detailLetters.textContent = result.lettersUsed
      ? `${result.lettersUsed} letter${result.lettersUsed === 1 ? "" : "s"} used`
      : "word-level match";

    // Update query preview image
    if (state.loaded && state.loaded.words[state.activeWord]) {
      const activeWordBox = state.loaded.words[state.activeWord].bounds;
      if (queryImg) {
        queryImg.src = queryImagePreview(activeWordBox);
      }
    }

    // Default preview text to the detected word if not changed by user
    if (result.text && (!state.preview || state.preview === DEFAULT_PREVIEW)) {
      state.preview = result.text;
      previewInput.value = result.text;
    }

    // Commercial lookalikes
    commercialBox.innerHTML = "";
    const lookalikes = new Map<string, { name: string; foundry: string; buyUrl: string }[]>();
    for (const f of result.fonts.slice(0, 5)) {
      const hits = commercialLookalikes(f.slug);
      if (hits.length) lookalikes.set(f.slug, hits);
    }
    if (lookalikes.size) {
      commercialBox.classList.remove("hidden");
      for (const [slug, hits] of lookalikes) {
        const fam = result.fonts.find((f) => f.slug === slug);
        const section = document.createElement("div");
        section.className = "commercial-block";
        const head = document.createElement("h4");
        head.textContent = `A free alternative to commercial type`;
        const famLine = document.createElement("p");
        famLine.innerHTML = `<strong>${escapeHtml(fam?.family ?? slug)}</strong> can stand in for:`;
        section.append(head, famLine);
        const list = document.createElement("div");
        list.className = "commercial-list";
        for (const hit of hits) {
          const a = document.createElement("a");
          a.href = hit.buyUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = hit.name;
          a.title = `${hit.name} by ${hit.foundry}`;
          list.append(a);
        }
        section.append(list);
        commercialBox.append(section);
      }
    } else {
      commercialBox.classList.add("hidden");
    }

    // Ensure result fonts are available to render previews
    const index = await getIndex();
    const slugToFamily = new Map(index.fonts.map((slug, i) => [slug, index.families[i]]));
    const pairedFams = new Set<string>();
    for (const f of result.fonts.slice(0, 3)) {
      for (const s of pairingSlugs(f.slug, f.category)) {
        const fam = slugToFamily.get(s);
        if (fam) pairedFams.add(fam);
      }
    }
    await injectPreviewFonts([
      ...result.fonts,
      ...[...pairedFams].map((family) => ({ slug: "", family })),
    ]);

    const catLabel = (c: string) =>
      c === "sans-serif" ? "Sans-serif" : c.charAt(0).toUpperCase() + c.slice(1);

    const buildCard = (f: (typeof result.fonts)[number], rank: number) => {
      const card = document.createElement("article");
      const top = rank < 3;
      card.className =
        "result-card" +
        (top ? " result-top" : " result-rest") +
        (rank === 0 ? " result-top-first" : "");

      // Top Row: Badges / Title on Left, Match Score on Right
      const headerRow = document.createElement("div");
      headerRow.className = "card-header-row";

      const titleGroup = document.createElement("div");
      titleGroup.className = "card-title-group";

      const titleLine = document.createElement("div");
      titleLine.className = "card-title-line";

      if (rank === 0) {
        const badge = document.createElement("span");
        badge.className = "badge-best-match";
        badge.textContent = "Best match";
        titleLine.append(badge);
      } else if (rank < 4) {
        const rankBadge = document.createElement("span");
        rankBadge.className = "badge-rank";
        rankBadge.textContent = `#${rank + 1}`;
        titleLine.append(rankBadge);
      }

      const fontTitle = document.createElement("h3");
      fontTitle.className = "font-card-title";
      fontTitle.textContent = f.family;
      titleLine.append(fontTitle);

      const metaSub = document.createElement("p");
      metaSub.className = "font-meta-sub";
      metaSub.textContent = `${catLabel(f.category)} · Free - open licence`;

      // Match-score breakdown chips: category + weight
      const tagRow = document.createElement("div");
      tagRow.className = "match-tags";
      const catChip = document.createElement("span");
      catChip.className = "match-tag";
      catChip.textContent = catLabel(f.category);
      const weightChip = document.createElement("span");
      weightChip.className = "match-tag";
      weightChip.textContent = f.weight === "bold" ? "Bold weight" : "Regular weight";
      const scoreChip = document.createElement("span");
      scoreChip.className = "match-tag match-tag-score";
      scoreChip.textContent = `${f.confidence}% match`;
      tagRow.append(catChip, weightChip, scoreChip);

      titleGroup.append(titleLine, metaSub, tagRow);

      const scoreGroup = document.createElement("div");
      scoreGroup.className = "match-score-pill";
      scoreGroup.innerHTML = `<span class="score-val">${f.confidence}%</span><span class="score-lbl">shape match</span>`;
      const scoreBar = document.createElement("div");
      scoreBar.className = "score-bar";
      const scoreFill = document.createElement("div");
      scoreFill.className = "score-bar-fill";
      scoreFill.style.width = `${clamp(f.confidence, 2, 100)}%`;
      scoreBar.append(scoreFill);
      scoreGroup.append(scoreBar);

      headerRow.append(titleGroup, scoreGroup);

      // Specimen Box
      const specimenBox = document.createElement("div");
      specimenBox.className = "specimen-preview-box";
      const specimenText = document.createElement("div");
      specimenText.className = "result-preview";
      specimenText.dataset.family = f.family;
      specimenText.dataset.weight = f.weight === "bold" ? "700" : "400";
      specimenText.textContent = state.preview;
      specimenText.style.fontFamily = `'${f.family}', sans-serif`;
      specimenText.style.fontWeight = String(previewWeight);
      specimenText.style.fontSize = `${previewSize.value}px`;
      specimenText.style.letterSpacing = `${previewSpacing.value}px`;
      specimenBox.append(specimenText);

      card.append(headerRow, specimenBox);

      // Pairing suggestions (top results only)
      if (rank < 3) {
        const pairedSlugs = pairingSlugs(f.slug, f.category);
        const paired = pairedSlugs
          .map((s) => ({ slug: s, family: slugToFamily.get(s) ?? "" }))
          .filter((p) => p.family)
          .slice(0, 3);
        if (paired.length) {
          const pairBox = document.createElement("div");
          pairBox.className = "pairing-box";
          const pairLabel = document.createElement("span");
          pairLabel.className = "pairing-label";
          pairLabel.textContent = pairingLabel(f.category);
          const pairChips = document.createElement("div");
          pairChips.className = "pairing-chips";
          for (const p of paired) {
            const a = document.createElement("a");
            a.href = `/fonts/${p.slug}`;
            a.textContent = p.family;
            a.className = "pairing-chip";
            a.style.fontFamily = `'${p.family}', sans-serif`;
            a.setAttribute("data-specimen-font", p.family);
            pairChips.append(a);
          }
          pairBox.append(pairLabel, pairChips);
          card.append(pairBox);
        }
      }

      // Actions Row
      const actions = document.createElement("div");
      actions.className = "card-actions-row";

      const detailsLink = document.createElement("a");
      detailsLink.className = "btn-pill-subtle";
      detailsLink.href = `/fonts/${f.slug}`;
      detailsLink.textContent = "Font details";

      const downloadLink = document.createElement("a");
      downloadLink.className = "btn-pill-subtle";
      downloadLink.href = `https://fonts.google.com/specimen/${encodeURIComponent(f.family)}`;
      downloadLink.target = "_blank";
      downloadLink.rel = "noopener noreferrer";
      downloadLink.textContent = "View on Google Fonts";

      const cssBtn = document.createElement("button");
      cssBtn.type = "button";
      cssBtn.className = "btn-pill-subtle";
      cssBtn.textContent = "Copy CSS";
      cssBtn.addEventListener("click", () => void copyCss(f.slug, f.family, f.weight, cssBtn));

      actions.append(detailsLink, downloadLink, cssBtn);

      const commercialHits = commercialLookalikes(f.slug);
      if (commercialHits.length) {
        const altLink = document.createElement("a");
        altLink.className = "btn-pill-subtle btn-alt";
        altLink.href = `/tools/free-font-alternative-finder`;
        altLink.textContent = "Get free alternative";
        actions.append(altLink);
      }

      card.append(actions);
      return card;
    };

    result.fonts.forEach((f, i) => {
      resultsGrid.append(buildCard(f, i));
    });
  }

  let previewFontsLink: HTMLLinkElement | null = null;
  async function injectPreviewFonts(fonts: { slug: string; family: string }[]): Promise<void> {
    const text = encodeURIComponent([...new Set([...state.preview])].join(""));
    const fams = [...new Set(fonts.map((f) => f.family))];
    const href =
      "https://fonts.googleapis.com/css2?" +
      fams.map((f) => `family=${f.replace(/ /g, "+")}`).join("&") +
      `&text=${text}&display=block`;
    if (previewFontsLink) previewFontsLink.remove();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
    previewFontsLink = link;
    await Promise.all(fams.map((f) => document.fonts.load(`400 16px "${f}"`, state.preview).catch(() => [])));
  }

  // ---- preview controls ----------------------------------------------------
  const previewInput = q<HTMLInputElement>(root, "[data-preview-input]")!;
  const previewSize = q<HTMLInputElement>(root, "[data-preview-size]")!;
  const previewSizeVal = q(root, "[data-preview-size-val]");
  const previewSpacing = q<HTMLInputElement>(root, "[data-preview-spacing]")!;
  const previewSpacingVal = q(root, "[data-preview-spacing-val]");
  const weightBtns = qa<HTMLButtonElement>(root, "[data-weight-btn]");
  let previewWeight = 400;

  const applyPreviewStyle = () => {
    const size = `${previewSize.value}px`;
    const spacing = `${previewSpacing.value}px`;
    qa<HTMLElement>(resultsGrid, ".result-preview").forEach((p) => {
      p.style.fontSize = size;
      p.style.letterSpacing = spacing;
      p.style.fontWeight = String(previewWeight);
      p.style.fontFamily = `'${p.dataset.family ?? "sans-serif"}', sans-serif`;
    });
  };

  previewInput.addEventListener("input", () => {
    state.preview = previewInput.value || DEFAULT_PREVIEW;
    if (!state.identified) return;
    qa<HTMLElement>(resultsGrid, ".result-preview").forEach((p) => {
      p.textContent = state.preview;
    });
    applyPreviewStyle();
    void injectPreviewFonts(state.result?.fonts ?? []);
  });

  previewSize.addEventListener("input", () => {
    if (previewSizeVal) previewSizeVal.textContent = `${previewSize.value}px`;
    if (state.identified) applyPreviewStyle();
  });

  previewSpacing.addEventListener("input", () => {
    if (previewSpacingVal) previewSpacingVal.textContent = `${previewSpacing.value}px`;
    if (state.identified) applyPreviewStyle();
  });

  weightBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      previewWeight = parseInt(btn.dataset.weightBtn ?? "400", 10);
      weightBtns.forEach((b) => b.classList.toggle("active", b === btn));
      if (state.identified) applyPreviewStyle();
    });
  });

  // ---- upload controls -----------------------------------------------------
  const fileInput = q<HTMLInputElement>(root, "[data-file-input]")!;
  const loadButton = q<HTMLButtonElement>(root, "[data-load-file]")!;
  const cameraBtn = q<HTMLButtonElement>(root, "[data-camera]");
  const cameraInput = q<HTMLInputElement>(root, "[data-camera-input]");
  const urlForm = q<HTMLFormElement>(root, "[data-url-form]");
  const urlInput = q<HTMLInputElement>(root, "[data-url-input]");
  const dropZone = q(root, "[data-upload-drop]")!;
  const trySample = q<HTMLButtonElement>(root, "[data-try-sample]")!;
  const resetBtn = q<HTMLButtonElement>(root, "[data-reset]");

  loadButton.addEventListener("click", () => fileInput.click());
  cameraBtn?.addEventListener("click", () => cameraInput?.click());
  cameraInput?.addEventListener("change", () => {
    const file = cameraInput.files?.[0];
    if (file) void loadFile(file);
    cameraInput.value = "";
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
    fileInput.value = "";
  });
  urlForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = (urlInput?.value ?? "").trim();
    if (!url) return;
    void (async () => {
      setError(null);
      try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error(`the server responded ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) {
          const probe = await createImageBitmap(blob).catch(() => null);
          if (!probe) throw new Error("that URL did not return an image");
          probe.close();
        }
        const file = new File([blob], "remote-image", { type: blob.type || "image/png" });
        await loadFile(file);
      } catch {
        setError(
          "That URL blocked cross-origin access or isn't an image. Download the image and upload it instead."
        );
      }
    })();
  });
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
  window.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void loadFile(file);
    }
  });
  trySample.addEventListener("click", () => {
    if (objectUrl && objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    objectUrl = "/examples/specimen.png";
    hasImage = true;
    resetState();
    setLoading("Loading sample…", 30);
    void reprocess();
  });

  const resetAll = () => {
    if (objectUrl && objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    hasImage = false;
    state.crop = null;
    state.loaded = null;
    buffer = null;
    state.labels.clear();
    state.result = null;
    state.identified = false;
    state.activeWord = 0;
    state.rotation = 0;
    state.warpQuad = null;
    state.warpApplied = false;
    state.preview = DEFAULT_PREVIEW;
    previewInput.value = DEFAULT_PREVIEW;
    previewSize.value = "24";
    previewSpacing.value = "0";
    if (previewSizeVal) previewSizeVal.textContent = "24px";
    if (previewSpacingVal) previewSpacingVal.textContent = "0px";
    previewWeight = 400;
    weightBtns.forEach((b) => b.classList.toggle("active", b.dataset.weightBtn === "400"));
    setError(null);
    showStage("idle");
  };

  resetBtn?.addEventListener("click", resetAll);

  // ---- start ---------------------------------------------------------------
  if (hasImage) showStage("crop");
  else showStage("idle");
  void getIndex().catch(() => undefined);
}