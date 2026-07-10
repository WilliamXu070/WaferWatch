declare module "utif" {
  export type Ifd = {
    width?: number;
    height?: number;
    data?: Uint8Array;
    [tag: string]: unknown;
  };

  const UTIF: {
    decode(buffer: ArrayBuffer): Ifd[];
    decodeImage(buffer: ArrayBuffer, ifd: Ifd): void;
    toRGBA8(ifd: Ifd): Uint8Array;
    encodeImage(rgba: ArrayBuffer, width: number, height: number): ArrayBuffer;
  };

  export default UTIF;
}
