// heic-decode ships no types. It turns a HEIC/HEIF file into raw RGBA
// pixels (lib/imageProcess.ts hands them to sharp).
declare module "heic-decode" {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  const decode: (input: { buffer: Uint8Array }) => Promise<Decoded>;
  export default decode;
}
