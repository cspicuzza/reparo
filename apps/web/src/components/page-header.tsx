import type { ReactNode } from 'react';
import { PageTitle } from '@/components/page-title';
import { cn } from '@/lib/utils';

/** A page's title, a line about it, and its main action. Also names the browser tab. */
export function PageHeader({
  title,
  tabTitle,
  description,
  action,
  className,
}: {
  title: string;
  /** The tab's title parts when the page sits inside a section: ["Demo", "Jobs"]. */
  tabTitle?: string[];
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <PageTitle parts={tabTitle ?? [title]} />
      <div className="min-w-0">
        <h1 className="text-4xl break-words">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-prose text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
