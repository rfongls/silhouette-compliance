import JSZip from "jszip";

type PdfPackageFile = {
  name: string;
  data: Buffer;
};

export async function buildPdfPackage(files: PdfPackageFile[]) {
  const archive = new JSZip();
  for (const file of files) archive.file(file.name, file.data);
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
