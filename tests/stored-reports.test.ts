import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { deleteStoredReportPackage } from "../lib/stored-reports";

function transactionClient(options?: { missing?: boolean; shared?: boolean }) {
  const calls: Array<{ method: string; args: unknown }> = [];
  const client = {
    runQuote: {
      findFirst: async (args: unknown) => {
        calls.push({ method: "runQuote.findFirst", args });
        return options?.missing ? null : { id: "quote-owner", reportAssessmentIds: ["assessment-1"] };
      },
      updateMany: async (args: unknown) => {
        calls.push({ method: "runQuote.updateMany", args });
        return { count: 1 };
      },
      count: async (args: unknown) => {
        calls.push({ method: "runQuote.count", args });
        return options?.shared ? 1 : 0;
      }
    },
    assessment: {
      deleteMany: async (args: unknown) => {
        calls.push({ method: "assessment.deleteMany", args });
        return { count: 1 };
      }
    }
  } as unknown as Prisma.TransactionClient;
  return { client, calls };
}

test("report deletion scopes every read and write to the signed-in account", async () => {
  const { client, calls } = transactionClient();
  assert.equal(await deleteStoredReportPackage(client, "quote-owner", "account-owner"), true);

  const lookup = calls.find((call) => call.method === "runQuote.findFirst")?.args as any;
  const update = calls.find((call) => call.method === "runQuote.updateMany")?.args as any;
  const assessmentDelete = calls.find((call) => call.method === "assessment.deleteMany")?.args as any;
  assert.equal(lookup.where.accountId, "account-owner");
  assert.equal(lookup.where.status, "CONSUMED");
  assert.equal(update.where.accountId, "account-owner");
  assert.equal(update.where.status, "CONSUMED");
  assert.equal(assessmentDelete.where.accountId, "account-owner");
  assert.equal(update.data.reportEmailStatus, "DELETED");
  assert.deepEqual(update.data.reportAssessmentIds, []);
  assert.equal(update.data.networkResult, Prisma.DbNull);
});

test("a missing or foreign report cannot be changed", async () => {
  const { client, calls } = transactionClient({ missing: true });
  assert.equal(await deleteStoredReportPackage(client, "quote-foreign", "account-owner"), false);
  assert.equal(calls.some((call) => call.method === "runQuote.updateMany"), false);
  assert.equal(calls.some((call) => call.method === "assessment.deleteMany"), false);
});

test("shared assessment content remains while another report package references it", async () => {
  const { client, calls } = transactionClient({ shared: true });
  assert.equal(await deleteStoredReportPackage(client, "quote-owner", "account-owner"), true);
  assert.equal(calls.some((call) => call.method === "assessment.deleteMany"), false);
});
