import { PageHeader } from '@/components/page-header';
import { useMe } from '@/lib/me';
import { CategoriesAdmin } from './categories-admin';
import { PanelPlaceholder } from '@/components/placeholder';

/**
 * The admin's lists (Workflow polish, OD-70): settings that change rarely and shape the rest of
 * the app, kept off the everyday pages. Shopping categories for now; stores are fixed in place
 * from a shopping line, so they don't need a page here.
 */
export function ManageLists() {
  const { isAdmin, member } = useMe();
  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Manage lists"
        description="How things are grouped across the house. Only the admin changes these."
      />
      {member === undefined ? (
        <PanelPlaceholder label="Loading" lines={5} />
      ) : isAdmin ? (
        <CategoriesAdmin />
      ) : (
        <p>Only the admin manages these lists.</p>
      )}
    </section>
  );
}
