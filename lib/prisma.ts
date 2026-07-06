import { PrismaClient } from "@prisma/client";
import { bootstrapComplianceEnv } from "@/lib/env";

bootstrapComplianceEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
