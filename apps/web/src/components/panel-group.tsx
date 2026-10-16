import type { ReactNode } from 'react';

/**
 * A labelled light card inside a side panel (OD-100, Q89): the panel body is the darker page
 * tone, so grouping fields on cards makes each group easy to find and read.
 */
export function PanelGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      <h3 id={id} className="text-lg">
        {title}
      </h3>
      {children}
    </section>
  );
}
