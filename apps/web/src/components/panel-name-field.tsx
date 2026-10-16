import { AutoSaveField } from '@/components/auto-save-field';

/**
 * The thing's name as the side panel's heading, editable in place (OD-82 Q39; shared by every
 * panel in OD-89/OD-93). It looks like the heading until hovered or focused, saves when you
 * leave it, and shows its save state beside it.
 */
export function PanelNameField({
  id,
  initial,
  what,
  validate,
  onSave,
}: {
  id: string;
  initial: string;
  /** Read out with the save's result, e.g. "Name of Brian". */
  what: string;
  validate: (value: string) => string | null;
  onSave: (value: string) => Promise<unknown>;
}) {
  return (
    <AutoSaveField
      id={id}
      label="Name"
      labelClassName="sr-only"
      initial={initial}
      what={what}
      // A faint underline at rest says it can be edited; hover and focus show the full field
      // (OD-114, Q132).
      inputClassName="-mx-2 border-transparent border-b-border bg-transparent px-2 text-2xl [font-stretch:74%] font-[640] tracking-[-0.01em] hover:border-input focus:border-input"
      validate={validate}
      onSave={onSave}
    />
  );
}
