import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { demoAssessment } from "../lib/analysis/engine";
import { buildNetworkReport } from "../lib/network-report";
import {
  buildPortableIrpReport,
  importPortableIrpReport,
  parsePortableIrpReport,
  ReportImportError
} from "../lib/report-import";

test("legacy individual JSON exports remain importable", () => {
  const result = demoAssessment("", "health-center");
  const report = parsePortableIrpReport(JSON.stringify(result));
  assert.equal(report.scope, "self");
  assert.equal(report.assessments.length, 1);
  assert.equal(report.assessments[0].orgName, "Johnson Community Health Center");
  assert.equal(report.networkReport, null);
});

test("portable report packages preserve organization and network reports", () => {
  const first = demoAssessment("Center Alpha", "health-center");
  const second = demoAssessment("Center Beta", "health-center");
  const network = buildNetworkReport("Hawaii Care Network", [
    { assessmentId: "one", orgName: "Center Alpha", result: first },
    { assessmentId: "two", orgName: "Center Beta", result: second }
  ]);
  const portable = buildPortableIrpReport({
    scope: "network",
    parentOrgName: "Hawaii Care Network",
    assessments: [{ orgName: "Center Alpha", result: first }, { orgName: "Center Beta", result: second }],
    networkReport: network
  });
  const parsed = parsePortableIrpReport(JSON.stringify(portable));
  assert.equal(parsed.scope, "network");
  assert.equal(parsed.parentOrgName, "Hawaii Care Network");
  assert.deepEqual(parsed.assessments.map((assessment) => assessment.orgName), ["Center Alpha", "Center Beta"]);
  assert.equal(parsed.networkReport?.network_name, "Hawaii Care Network");
});

test("unsupported JSON cannot be imported as a report", () => {
  assert.throws(() => parsePortableIrpReport(JSON.stringify({ organization_name: "Not enough fields" })), ReportImportError);
  assert.throws(() => parsePortableIrpReport("not-json"), ReportImportError);
});

test("import persistence is account-scoped and does not write billing usage", async () => {
  const calls: Array<{ method: string; args: any }> = [];
  const tx = {
    runQuote: {
      findFirst: async (args: any) => {
        calls.push({ method: "runQuote.findFirst", args });
        return null;
      },
      create: async (args: any) => {
        calls.push({ method: "runQuote.create", args });
        return { id: "quote-imported" };
      }
    },
    assessment: {
      create: async (args: any) => {
        calls.push({ method: "assessment.create", args });
        return { id: "assessment-imported" };
      }
    }
  } as unknown as Prisma.TransactionClient;
  const report = parsePortableIrpReport(JSON.stringify(demoAssessment("Imported Center", "health-center")));
  const imported = await importPortableIrpReport(tx, "account-owner", report);

  assert.deepEqual(imported, { quoteId: "quote-imported", duplicate: false });
  assert.equal(calls.find((call) => call.method === "runQuote.findFirst")?.args.where.accountId, "account-owner");
  assert.equal(calls.find((call) => call.method === "assessment.create")?.args.data.accountId, "account-owner");
  const quoteData = calls.find((call) => call.method === "runQuote.create")?.args.data;
  assert.equal(quoteData.accountId, "account-owner");
  assert.equal(quoteData.status, "CONSUMED");
  assert.equal(quoteData.reportEmailStatus, "IMPORTED");
  assert.equal(calls.some((call) => call.method.includes("usageLedger")), false);
});

test("importing the same report reopens its existing account-owned package", async () => {
  const tx = {
    runQuote: { findFirst: async () => ({ id: "existing-quote" }) },
    assessment: { create: async () => { throw new Error("assessment should not be duplicated"); } }
  } as unknown as Prisma.TransactionClient;
  const report = parsePortableIrpReport(JSON.stringify(demoAssessment("Imported Center", "health-center")));
  assert.deepEqual(await importPortableIrpReport(tx, "account-owner", report), { quoteId: "existing-quote", duplicate: true });
});
