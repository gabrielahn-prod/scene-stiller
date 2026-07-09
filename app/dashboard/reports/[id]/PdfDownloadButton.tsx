"use client";

export function PdfDownloadButton() {
  return (
    <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()}>
      PDF 다운로드
    </button>
  );
}
