import ReleaseReviewSubmission from "./ReleaseReviewSubmission";
import {
  releaseReviewPackets,
  type ReleaseReviewType,
} from "../lib/release-review-packets";

export default function ReleaseReviewForm({
  kind,
  manifestId,
  candidateSha256,
  evidenceSha256,
  recorded,
  finalized,
}: {
  kind: ReleaseReviewType;
  manifestId: string;
  candidateSha256: string;
  evidenceSha256: string;
  recorded?: { reviewer_name: string; attested_at: string } | null;
  finalized: boolean;
}) {
  const packet = releaseReviewPackets[kind];

  if (recorded)
    return (
      <section className="panel release-review recorded">
        <p className="eyebrow">Review recorded</p>
        <h2>{packet.title}</h2>
        <p>
          Signed by {recorded.reviewer_name} on{" "}
          {new Date(recorded.attested_at).toLocaleString("en-GB")}.
        </p>
        <p className="subtle">
          {finalized
            ? "Bound to the finalized release evidence."
            : "Awaiting final evidence binding to the release manifest."}
        </p>
      </section>
    );

  return (
    <ReleaseReviewSubmission
      kind={kind}
      manifestId={manifestId}
      candidateSha256={candidateSha256}
      evidenceSha256={evidenceSha256}
      checkKeys={packet.checks.map(([key]) => key)}
    >
      <p className="eyebrow">Named human review</p>
      <h2>{packet.title}</h2>
      <p>{packet.purpose}</p>
      <details>
        <summary>Evidence included in this review</summary>
        <ul>
          {packet.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="subtle">Evidence digest: {evidenceSha256}</p>
        <p className="subtle">Candidate digest: {candidateSha256}</p>
      </details>
      <fieldset>
        <legend>Confirm every check after you have completed it</legend>
        {packet.checks.map(([key, label]) => (
          <label key={key}>
            <input name={key} required type="checkbox" />
            {label}
          </label>
        ))}
      </fieldset>
      <label>
        Review notes
        <textarea
          name="notes"
          minLength={20}
          maxLength={4000}
          required
          placeholder="Record devices, browsers, assistive tools, findings and any remediation checked."
        />
      </label>
      <p className="notice">
        Signing records your authenticated name, exact candidate and evidence
        digests. Recent MFA is required. This does not deploy or publish KXRA.
      </p>
    </ReleaseReviewSubmission>
  );
}
