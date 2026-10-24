'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button, EmptyState, Skeleton } from './ui/primitives';

/** Server-paginated table (TanStack Table in manual mode) with a sticky header, skeleton rows and a real empty state. */
export function DataTable<T>({
  columns,
  data,
  page,
  totalPages,
  totalElements,
  onPageChange,
  loading,
  caption,
  emptyTitle = 'Nothing to show',
  emptyDescription = 'Try a different filter or date.',
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  page: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  caption: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, pageCount: totalPages });
  const showSkeleton = loading && data.length === 0;
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-warm">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-card/95 text-left backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} scope="col"
                      className="whitespace-nowrap border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: 6 }, (_, r) => (
                  <tr key={`s-${r}`}>
                    {columns.map((_, c) => (
                      <td key={c} className="border-b px-4 py-3.5">
                        <Skeleton className={c === 0 ? 'h-4 w-32' : 'h-4 w-20'} />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="group transition-colors hover:bg-muted/45">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="border-b border-border/70 px-4 py-3 align-middle group-last:border-b-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {data.length === 0 && !loading ? <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} /> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5 text-[13px] text-muted-foreground">
        <span aria-live="polite" className="tabular">
          {loading ? 'Loading…' : `${totalElements.toLocaleString('en-IN')} ${totalElements === 1 ? 'result' : 'results'}`}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="tabular mr-2">Page {totalPages === 0 ? 0 : page + 1} of {totalPages}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 0} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page + 1 >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
