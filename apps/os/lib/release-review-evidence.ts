import "server-only";
import crypto from "node:crypto";
import {
  releaseReviewPackets,
  type ReleaseReviewType,
} from "./release-review-packets";

export function releaseReviewEvidenceSha256(kind: ReleaseReviewType) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(releaseReviewPackets[kind]), "utf8")
    .digest("hex");
}
