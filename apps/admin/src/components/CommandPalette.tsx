'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Kbd } from './ui/primitives';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

/** Fuzzy-enough match: every typed word must appear in the label, group or keywords. */
function matches(c: Command, query: string): boolean {
  const hay = `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** ⌘K / Ctrl+K palette: jump to any page or run an action without touching the mouse. */
export function CommandPalette({ open, onOpenChange, commands }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => commands.filter((c) => matches(c, query)), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onOpenChange(false);
    c.run();
  };

  let lastGroup = '';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(36_10%_10%/0.4)] backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[14vh] z-50 w-[min(600px,94vw)] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-warm-lg animate-pop-in"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(results[active]);
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a page or run an action…"
              aria-label="Search commands"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={results[active] ? `cmd-${results[active]!.id}` : undefined}
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <Kbd>Esc</Kbd>
          </div>
          <ul id="command-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
            {results.length === 0 ? <li className="px-3 py-8 text-center text-sm text-muted-foreground">No matches for “{query}”</li> : null}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <li key={c.id} role="presentation">
                  {header ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{header}</p> : null}
                  <div
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(c)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                      i === active ? 'bg-secondary text-secondary-foreground' : 'text-foreground')}
                  >
                    <c.icon className="h-4 w-4 opacity-80" aria-hidden />
                    <span className="flex-1">{c.label}</span>
                    {i === active ? <CornerDownLeft className="h-3.5 w-3.5 opacity-60" aria-hidden /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> to open</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
