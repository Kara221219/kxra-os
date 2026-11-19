"use client";
import React, { useEffect, useRef, type ReactNode } from "react";
import { installDirectoryDocumentLifecycle } from "./DirectoryDocumentBoundary";
export default function EnquiryDocumentBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (content.current && status.current)
      return installDirectoryDocumentLifecycle(
        window,
        content.current,
        status.current,
      );
  }, []);
  return (
    <>
      <p ref={status} role="status">
        Checking current enquiry access. JavaScript is required to display this
        private inbox safely. If this message remains, JavaScript may be
        disabled or failed to load. Enable it and reload the page.
      </p>
      <div ref={content} data-enquiry-document style={{ visibility: "hidden" }}>
        {children}
      </div>
    </>
  );
}
