import { handleIrpAssessment } from "@/lib/irp-assessment";

export async function POST(req: Request) {
  return handleIrpAssessment(req);
}
