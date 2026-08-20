declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfResult = {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  };

  export default function parse(data: Buffer): Promise<PdfResult>;
}
