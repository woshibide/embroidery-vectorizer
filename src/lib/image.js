const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/pjpeg"]);
const SUPPORTED_IMAGE_EXTENSION = /\.(?:png|jpe?g)$/i;

export function isSupportedImage(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  const typeIsUnknown = !type || type === "application/octet-stream";
  return SUPPORTED_IMAGE_TYPES.has(type) || (typeIsUnknown && SUPPORTED_IMAGE_EXTENSION.test(file.name));
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.readAsDataURL(file);
  });
}

// Decodes an image src (data URL or regular URL) into raw RGBA pixel data via
// an offscreen 2D canvas. No state/DOM side effects beyond the transient
// decode canvas — the caller owns what happens with the result.
export function decodeImageSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ image: img, pixels: data.data, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = src;
  });
}

// Accepts a File from a drop/browse event: validates type, reads it, decodes
// it. Throws with a user-facing message on invalid/unreadable input.
export async function loadImageFile(file) {
  if (!isSupportedImage(file)) {
    throw new Error("Please choose a PNG or JPG file");
  }
  const src = await readFileAsDataURL(file);
  const decoded = await decodeImageSource(src);
  return { ...decoded, src, name: file.name };
}
