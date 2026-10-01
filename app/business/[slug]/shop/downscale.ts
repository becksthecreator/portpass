// Product photos are shrunk in the browser before upload, like the setup
// wizard's (phones produce 5-12 MB images; Vercel caps a body at 4.5 MB).
// Anything that can't be decoded, or is already small, goes up as-is.
export async function downscale(file: File): Promise<Blob> {
  if (file.size < 1_200_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 2048;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}
