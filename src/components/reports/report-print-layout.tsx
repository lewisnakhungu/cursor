"use client";

import type { ReactNode } from "react";

type ReportPrintLayoutProps = {
  title: string;
  subtitle: string;
  facilityName: string;
  generatedAt: string;
  periodRange?: string;
  children: ReactNode;
};

function formatGenerated(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export function ReportPrintLayout({
  title,
  subtitle,
  facilityName,
  generatedAt,
  periodRange,
  children,
}: ReportPrintLayoutProps) {
  return (
    <div className="facility-report-print mx-auto max-w-[210mm] bg-white p-6 text-black md:p-8">
      <header className="report-print-header border-b-2 border-black pb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600">
          {facilityName}
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{title}</h1>
        <p className="mt-1 text-sm text-neutral-700">{subtitle}</p>
        {periodRange ? (
          <p className="mt-2 text-sm font-medium">Period: {periodRange}</p>
        ) : null}
        <p className="mt-1 text-xs text-neutral-600">
          Generated {formatGenerated(generatedAt)}
        </p>
      </header>
      <div className="report-print-body mt-6 space-y-6">{children}</div>
      <footer className="report-print-footer mt-8 border-t border-neutral-300 pt-3 text-center text-[10px] text-neutral-600">
        AfyaSmart-Stock · Confidential pharmacy report · {formatGenerated(generatedAt)}
      </footer>
    </div>
  );
}

export function ReportSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section break-inside-avoid">
      <h2 className="mb-3 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ReportKpiGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded border border-neutral-300 bg-neutral-50 p-3"
        >
          <p className="text-[10px] font-semibold uppercase text-neutral-600">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ReportTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="report-table w-full border-collapse text-xs">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="border border-neutral-400 bg-neutral-100 px-2 py-1.5 text-left font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="border border-neutral-300 px-2 py-4 text-center text-neutral-600"
              >
                No data for this period
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="break-inside-avoid">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="border border-neutral-300 px-2 py-1.5 align-top"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
