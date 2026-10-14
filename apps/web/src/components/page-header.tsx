import type { ReactNode } from 'react';

/** A page's title, a line about it, and its main action. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-prose text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
