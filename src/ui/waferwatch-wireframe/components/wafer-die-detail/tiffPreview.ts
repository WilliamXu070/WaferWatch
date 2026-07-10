import UTIF from "utif";

export function isTiffImage(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.toLowerCase().split(";", 1)[0].trim();
  return normalizedMimeType === "image/tiff" || normalizedMimeType === "image/tif" || /\.tiff?$/i.test(fileName);
}

export function decodeTiffFirstPage(buffer: ArrayBuffer) {
  const [page] = UTIF.decode(buffer);
  if (!page) {
    throw new Error("The TIFF file does not contain a readable image.");
  }

  UTIF.decodeImage(buffer, page);
  const width = page.width ?? 0;
  const height = page.height ?? 0;
  if (!width || !height) {
    throw new Error("The TIFF image has invalid dimensions.");
  }

  return { width, height, rgba: UTIF.toRGBA8(page) };
}

export async function createTiffPngPreview(buffer: ArrayBuffer) {
  const { width, height, rgba } = decodeTiffFirstPage(buffer);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot render TIFF previews.");
  }

  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Unable to create a TIFF preview.");
  }

  return URL.createObjectURL(blob);
}
