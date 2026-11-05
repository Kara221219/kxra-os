"use client";
import dynamic from "next/dynamic";
const Console = dynamic(() => import("./EligibilityReviewConsole"), {
  ssr: false,
  loading: () => <p role="status">Loading review console…</p>,
});
export default function EligibilityReviewLoader() {
  return <Console />;
}
