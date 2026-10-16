import type { ReactNode } from 'react';
import { PageTitle } from '@/components/page-title';

/** A page's title, a line about it, and its main action. Also names the browser tab. */
export function PageHeader({
  title,
  tabTitle,
  description,
  action,
}: {
  title: string;
  /** The tab's title parts when the page sits inside a section: ["Demo", "Jobs"]. */
  tabTitle?: string[];
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <PageTitle parts={tabTitle ?? [title]} />
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
