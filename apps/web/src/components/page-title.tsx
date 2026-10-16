/**
 * The browser tab's title for a page, most specific first: "Kitchen, Rooms, Reparo" (OD-111,
 * Q123; WCAG 2.4.2). React 19 moves a `<title>` rendered anywhere into the document head.
 */
export function PageTitle({ parts }: { parts: string[] }) {
  return <title>{[...parts, 'Reparo'].join(', ')}</title>;
}
