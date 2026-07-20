import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAppearanceSnapshotsBySurfaceKey,
  getAppearanceAttachmentIds,
  getWaferStatusSurfaceMapKey,
  groupAuthorizedAppearanceAttachments
} from "./waferStatusAppearance";

const surfaces = [
  { projectId: "project-a", scopeKey: "wafer-a:A1", attachmentId: "attachment-a", version: 2 },
  { projectId: "project-a", scopeKey: "wafer-a:A2", attachmentId: "attachment-missing", version: 1 }
];

test("deduplicates appearance attachment ids before the user-scoped attachment query", () => {
  assert.deepEqual(getAppearanceAttachmentIds([...surfaces, surfaces[0]]), ["attachment-a", "attachment-missing"]);
});

test("groups only authorized attachment rows for batch signing", () => {
  const groups = groupAuthorizedAppearanceAttachments({
    surfaces,
    attachments: [
      { id: "attachment-a", projectId: "project-a", bucketName: "wafer-files", objectPath: "a.png" },
      { id: "attachment-missing", projectId: "project-b", bucketName: "wafer-files", objectPath: "private.png" },
      { id: "not-requested", projectId: "project-a", bucketName: "wafer-files", objectPath: "other.png" }
    ]
  });

  assert.deepEqual(groups.get("wafer-files"), [
    { id: "attachment-a", projectId: "project-a", bucketName: "wafer-files", objectPath: "a.png" }
  ]);
});

test("builds tile snapshots only from returned attachment rows", () => {
  const snapshots = buildAppearanceSnapshotsBySurfaceKey({
    surfaces,
    attachments: [
      { id: "attachment-a", projectId: "project-a", bucketName: "wafer-files", objectPath: "a.png" }
    ],
    signedUrlByAttachmentId: new Map([["attachment-a", "https://signed.example/a.png"]]),
    scopeType: "wireframe:wafer_die",
    fieldKey: "appearance_attachment_id"
  });

  assert.deepEqual(snapshots.get(getWaferStatusSurfaceMapKey({
    projectId: "project-a",
    scopeType: "wireframe:wafer_die",
    scopeKey: "wafer-a:A1",
    fieldKey: "appearance_attachment_id"
  })), {
    attachmentId: "attachment-a",
    imageUrl: "https://signed.example/a.png",
    version: 2
  });
  assert.equal(snapshots.size, 1);
});
