import { PrismaClient } from "@prisma/client";

const [email, role = "admin"] = process.argv.slice(2);
const roles = new Set(["customer", "admin"]);

if (!email || !roles.has(role)) {
  console.error("Usage: node scripts/set-user-role.mjs user@example.com admin|customer");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.update({
    where: { email },
    data: { role },
    select: { id: true, email: true, role: true }
  });
  console.log(`Updated ${user.email} to ${user.role}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
