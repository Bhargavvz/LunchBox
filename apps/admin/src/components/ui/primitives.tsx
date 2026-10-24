'use client';

/* shadcn/ui-style primitives (copied-in source, as shadcn intends), restyled for the Tiffin palette. */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background-color,box-shadow,transform,color] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.12),0_1px_2px_hsl(var(--shadow-color)/0.2)] hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-card text-foreground shadow-[0_1px_1px_hsl(var(--shadow-color)/0.04)] hover:border-foreground/25 hover:bg-muted/60',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/75',
        ghost: 'text-foreground hover:bg-muted',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-10 px-4', sm: 'h-8 rounded-md px-3 text-[13px]', lg: 'h-11 px-6 text-[15px]', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ComponentPropsWithoutRef<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

const field =
  'w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-[inset_0_1px_2px_hsl(var(--shadow-color)/0.05)] transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 hover:border-foreground/30 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

export const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, 'flex h-10 py-2', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, 'flex min-h-24 py-2.5 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      field,
      'h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9',
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236E675D' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export const Label = forwardRef<HTMLLabelElement, ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-[13px] font-semibold leading-none text-foreground/90', className)} {...props} />
));
Label.displayName = 'Label';

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1 text-xs font-medium text-destructive">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border bg-card p-5 text-card-foreground shadow-warm', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('flex items-center gap-2 text-[15px] font-semibold tracking-tight', className)} {...props} />;
}

export function CardHeader({ title, description, actions, icon: Glyph }: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Glyph ? (
          <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-md bg-muted text-muted-foreground">
            <Glyph className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const badgeTone = {
  default: 'bg-muted text-muted-foreground ring-foreground/5',
  success: 'bg-secondary text-secondary-foreground ring-primary/10',
  danger: 'bg-destructive-soft text-destructive-soft-foreground ring-destructive/15',
  warning: 'bg-accent-soft text-accent-soft-foreground ring-accent/20',
  info: 'bg-info-soft text-info-soft-foreground ring-info/10',
} as const;

const dotTone = {
  default: 'bg-muted-foreground/60',
  success: 'bg-primary',
  danger: 'bg-destructive',
  warning: 'bg-accent',
  info: 'bg-info',
} as const;

export function Badge({ tone = 'default', dot, children, className }: {
  tone?: keyof typeof badgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
      badgeTone[tone], className)}>
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', dotTone[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Alert({ tone = 'danger', title, children }: { tone?: 'danger' | 'info' | 'success'; title?: string; children: ReactNode }) {
  const cls = {
    danger: 'border-destructive/25 bg-destructive-soft text-destructive-soft-foreground',
    info: 'border-info/20 bg-info-soft text-info-soft-foreground',
    success: 'border-primary/20 bg-secondary text-secondary-foreground',
  }[tone];
  const Glyph = { danger: CircleAlert, info: Info, success: CircleCheck }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm', cls)}>
      <Glyph className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5 opacity-90' : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

export function EmptyState({ icon: Glyph, title, description, action }: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Glyph ? (
        <span className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Glyph className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <p className="font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] font-semibold text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]', className)}>
      {children}
    </kbd>
  );
}

const AVATAR_TONES = [
  'bg-secondary text-secondary-foreground',
  'bg-accent-soft text-accent-soft-foreground',
  'bg-info-soft text-info-soft-foreground',
  'bg-destructive-soft text-destructive-soft-foreground',
];

/** Initials on a tint chosen from the name, matching the mobile Avatar so a person keeps their colour everywhere. */
export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.4 }}
          className={cn('inline-grid shrink-0 place-items-center rounded-[38%] font-display', AVATAR_TONES[hash % AVATAR_TONES.length], className)}>
      {initials}
    </span>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[hsl(36_10%_10%/0.45)] backdrop-blur-[2px] animate-fade-in" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(640px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-warm-lg animate-pop-in">
        <DialogPrimitive.Title className="font-display text-xl font-semibold tracking-tight">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : null}
        <div className="mt-5 space-y-4">{children}</div>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close">
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
