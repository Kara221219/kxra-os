import { notFound } from "next/navigation";
// Never let an extra segment fall back to the historical inline inbox.
export default function InvalidEnquiryRoute(): never {
  notFound();
}
