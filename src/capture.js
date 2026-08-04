// ---------- Screen capture (getDisplayMedia → canvas upscale → PNG) ----------
// ---------- Clipboard read/write helpers ----------

/**
 * Grab a single frame from a chosen screen/window/tab and render it onto a
 * canvas at `scale`× the source resolution using high-quality smoothing.
 * Note: this *upscales* pixels for a crisper export — it can't add real
 * detail beyond what the display had, but it's sharper for zoom/print than
 * a raw 1:1 capture.
 * @param {number} scale 1, 2, or 4
 * @returns {Promise<{blob: Blob, width: number, height: number}>}
 */
// Most desktop browsers support canvases well beyond this, but some cap out
// lower; staying under 16384px per side keeps captures reliable even on a
// 4x-scaled ultrawide/5K display instead of failing at the toBlob() step.
const MAX_CANVAS_DIMENSION = 16384;

export async function captureScreen(scale = 4) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('Screen capture isn\u2019t supported in this browser.');
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
    const track = stream.getVideoTracks()[0];

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // Some browsers report 0×0 for a tick after play() resolves.
    await new Promise((resolve) => {
      if (video.videoWidth > 0) { resolve(); return; }
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 400);
    });

    const srcW = video.videoWidth || 1920;
    const srcH = video.videoHeight || 1080;
    const effectiveScale = Math.min(scale, MAX_CANVAS_DIMENSION / srcW, MAX_CANVAS_DIMENSION / srcH);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(srcW * effectiveScale);
    canvas.height = Math.round(srcH * effectiveScale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    track.stop();
    stream.getTracks().forEach((t) => t.stop());
    stream = null;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0));
    if (!blob) throw new Error('Could not encode the capture as PNG.');

    return { blob, width: canvas.width, height: canvas.height, scale: effectiveScale };
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
}

async function blobToPng(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close(); // release the decoded bitmap immediately rather than waiting on GC
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function copyBlobToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error('Clipboard image copy isn\u2019t supported in this browser.');
  }
  const pngBlob = await blobToPng(blob);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
}

/**
 * Read whatever image(s) are currently on the system clipboard.
 * @returns {Promise<Array<{blob: Blob, mime: string}>>}
 */
export async function readImagesFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    throw new Error('Clipboard reading isn\u2019t supported in this browser — try Ctrl/\u2318+V instead.');
  }
  const items = await navigator.clipboard.read();
  const found = [];
  for (const item of items) {
    const imgType = item.types.find((t) => t.startsWith('image/'));
    if (!imgType) continue;
    const blob = await item.getType(imgType);
    found.push({ blob, mime: imgType });
  }
  return found;
}
