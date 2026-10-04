import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Uses the real frontend adapter against the running backend. Only the
// temporary cases created by this check are removed in the finally block.
const apiUrl = process.env.TEST_API_URL ?? "http://localhost:4000/api";
const sourceUrl = new URL("../frontend/src/features/case-web/api.ts", import.meta.url);
const bundled = await build({
  stdin: {
    contents: (await readFile(sourceUrl, "utf8")) + "\nexport { HttpCaseWebApi, MockCaseWebApi };",
    resolveDir: fileURLToPath(new URL(".", sourceUrl)), loader: "ts",
  },
  bundle: true, write: false, platform: "node", format: "esm",
  define: { "import.meta.env": JSON.stringify({ VITE_API_URL: apiUrl }) },
});
const { HttpCaseWebApi, MockCaseWebApi } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const api = new HttpCaseWebApi();
const createdCaseIds = [];
try {
  const caseItem = await api.createCase({ name: `Data flow check ${Date.now()}` });
  createdCaseIds.push(caseItem.id);
  assert.deepEqual(await api.getSubjects(caseItem.id), []);
  assert.deepEqual(await api.getEvidence(caseItem.id), []);
  assert.deepEqual(await api.getCaseHistory(caseItem.id), []);
  const other = await api.createCase({ name: "Data flow isolation check" });
  createdCaseIds.push(other.id);
  const updated = await api.updateCase(caseItem.id, { name: "Edited check", description: "Saved description", status: "closed" });
  assert.equal(updated.status, "closed");
  const caseHistory = await api.getCaseHistory(caseItem.id);
  for (const property of ["case_name", "description", "case_status"]) {
    assert.ok(caseHistory.some((h) => h.property === property), `Missing case history: ${property}`);
  }
  await api.updateCase(caseItem.id, { name: "Edited check", description: "Saved description", status: "closed" });
  assert.equal((await api.getCaseHistory(caseItem.id)).length, caseHistory.length);
  const subject = await api.addSubject(caseItem.id, { name: "Check subject", kind: "person" });
  await api.updateSubject(caseItem.id, subject.id, { name: "Edited subject" });
  const party = await api.addSubject(caseItem.id, { name: "Witness", kind: "person" });
  const input = {
    subjectId: subject.id, evidenceType: "document",
    eventTime: "2026-10-03T10:00:00.000Z", earliestPossibleTime: "2026-10-03T09:55:00.000Z",
    latestPossibleTime: "2026-10-03T10:05:00.000Z", timeCertainty: "approximate",
    location: { name: "Check location", lat: 49.2, lng: -123 },
    event: "Initial account", source: "Check document", notes: "Check notes",
    involvedParties: [{ subjectId: party.id, role: "reported_by" }],
    attachments: [{ id: "check-upload", name: "check.txt", mimeType: "text/plain", size: 5, previewUrl: "data:text/plain;base64,aGVsbG8=" }],
  };
  const item = await api.addEvidence(caseItem.id, input);
  assert.match(item.id, /^[0-9a-f-]{36}$/i);
  assert.equal(item.attachments.length, 1);
  const file = await fetch(item.attachments[0].previewUrl);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), "hello");
  assert.deepEqual(await api.getEvidenceHistory(caseItem.id, item.id), []);
  await assert.rejects(api.removeSubject(caseItem.id, subject.id));
  const edited = await api.updateEvidence(caseItem.id, item.id, { ...item, event: "Updated account", notes: "Updated notes", source: "Updated source" });
  await api.setReliability(caseItem.id, item.id, "verified");
  const history = await api.getEvidenceHistory(caseItem.id, item.id);
  for (const property of ["description", "investigator_notes", "source", "reliability"]) {
    assert.ok(history.some((h) => h.property === property), `Missing evidence history: ${property}`);
  }
  assert.ok(history.every((h) => h.changedAt && h.changedBy));
  const freshApi = new HttpCaseWebApi();
  assert.ok((await freshApi.getCases()).some((c) => c.id === caseItem.id && c.name === "Edited check"));
  assert.ok((await freshApi.getSubjects(caseItem.id)).some((s) => s.id === subject.id && s.name === "Edited subject"));
  const saved = (await freshApi.getEvidence(caseItem.id)).find((e) => e.id === item.id);
  assert.equal(saved.event, "Updated account");
  assert.equal(saved.reliability, "verified");
  assert.equal(saved.earliestPossibleTime, input.earliestPossibleTime);
  assert.equal(saved.latestPossibleTime, input.latestPossibleTime);
  assert.deepEqual(saved.involvedParties, input.involvedParties);
  assert.equal(saved.attachments[0].id, edited.attachments[0].id);
  assert.deepEqual(await freshApi.getEvidence(other.id), []);
  await assert.rejects(api.getEvidenceHistory(other.id, item.id));
  await assert.rejects(api.updateEvidence(other.id, item.id, input));
  await api.removeEvidence(caseItem.id, item.id);
  assert.deepEqual(await freshApi.getEvidence(caseItem.id), []);
  await api.removeSubject(caseItem.id, subject.id);
  await api.removeSubject(caseItem.id, party.id);
  assert.deepEqual(await freshApi.getSubjects(caseItem.id), []);
  console.log("PASS: database case/subject/evidence creation, edits, history, attachments, fresh client reads, isolation, and deletion.");

  const mock = new MockCaseWebApi();
  const mockCase = await mock.createCase({ name: "Mock check" });
  const mockSubject = await mock.addSubject(mockCase.id, { name: "Mock subject", kind: "person" });
  const mockItem = await mock.addEvidence(mockCase.id, { ...input, subjectId: mockSubject.id, involvedParties: [] });
  assert.deepEqual(await mock.getEvidenceHistory(mockCase.id, mockItem.id), []);
  await mock.updateEvidence(mockCase.id, mockItem.id, { ...mockItem, event: "Mock edit" });
  await mock.setReliability(mockCase.id, mockItem.id, "verified");
  assert.deepEqual((await mock.getEvidenceHistory(mockCase.id, mockItem.id)).map((h) => h.property), ["reliability", "description"]);
  console.log("PASS: mock evidence history uses mock data and records edits.");
} finally {
  for (const id of createdCaseIds.reverse()) await api.deleteCase(id);
}
