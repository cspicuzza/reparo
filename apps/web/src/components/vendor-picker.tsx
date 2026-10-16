import { vendorCreateSchema, type VendorCreateInput } from '@reparo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Field, FormError, Input } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { useTRPC } from '@/lib/trpc';
import { matchesVendor, type VendorOption } from '@/lib/vendors';

type Props = {
  id: string;
  /** The picked vendor's id, or null for nobody yet. */
  value: string | null;
  onChange: (vendorId: string | null) => void;
  /** Live vendors, plus the job's own vendor if it was archived since. */
  vendors: VendorOption[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

/** A row in the list that offers to add what was typed as a new vendor. */
type AddRow = { id: `add:${string}`; name: string; trade: ''; archived: false; add: true };
type Row = VendorOption | AddRow;

/**
 * Pick who's doing a job (OD-47): type to search vendors by name or trade, or add a new one
 * without leaving the job. Clearing goes back to "Nobody yet".
 */
export function VendorPicker({ id, value, onChange, vendors, ...aria }: Props) {
  const [adding, setAdding] = useState<string | null>(null);
  const selected = vendors.find((v) => v.id === value) ?? null;
  // The input shows the picked vendor's name. It used to start empty, so a job with a vendor
  // showed "Nobody yet" (OD-86). When the value changes from outside, the text follows it, the
  // way the React docs adjust state from a prop:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [query, setQuery] = useState(selected?.name ?? '');
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setQuery(selected?.name ?? '');
  }

  const typed = query.trim();
  const exact = vendors.some((v) => v.name.toLowerCase() === typed.toLowerCase());
  // While a vendor is shown in the input, its name is the query; don't offer to add it again.
  const offerAdd = typed !== '' && !exact && typed !== selected?.name;
  const addRow: AddRow = { id: `add:${typed}`, name: typed, trade: '', archived: false, add: true };
  const rows: Row[] = offerAdd ? [...vendors, addRow] : vendors;

  return (
    <div>
      <Combobox<Row>
        items={rows}
        value={selected}
        onValueChange={(row) => {
          if (row && 'add' in row) {
            setAdding(row.name);
            return;
          }
          onChange(row ? row.id : null);
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        itemToStringLabel={(row) => row.name}
        isItemEqualToValue={(a, b) => a.id === b.id}
        filter={(row, text) => ('add' in row ? true : matchesVendor(row, text))}
      >
        <ComboboxInput id={id} placeholder="Nobody yet. Type to search or add" {...aria} />
        <ComboboxContent>
          <ComboboxEmpty>No vendor matches.</ComboboxEmpty>
          <ComboboxList>
            {(row: Row) => (
              <ComboboxItem key={row.id} value={row}>
                {'add' in row ? (
                  <span className="font-semibold">
                    Add &ldquo;{row.name}&rdquo; as a new vendor
                  </span>
                ) : (
                  <span className="min-w-0">
                    <span className="block">{row.name}</span>
                    {row.trade || row.archived ? (
                      <span className="block text-sm text-muted-foreground">
                        {[row.trade, row.archived ? 'Archived' : ''].filter(Boolean).join(', ')}
                      </span>
                    ) : null}
                  </span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {selected && adding === null ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 px-0 sm:px-3"
          onClick={() => {
            onChange(null);
            setQuery('');
          }}
        >
          Change to nobody yet
        </Button>
      ) : null}

      {adding !== null ? (
        <NewVendor
          idPrefix={`${id}-new`}
          name={adding}
          onAdded={(vendor) => {
            setAdding(null);
            setQuery(vendor.name);
            onChange(vendor.id);
          }}
          onCancel={() => setAdding(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The small "new vendor" form inside the job form. It isn't a <form> (forms can't nest), so it
 * validates with the shared schema itself and saves on its button.
 */
function NewVendor({
  idPrefix,
  name,
  onAdded,
  onCancel,
}: {
  idPrefix: string;
  name: string;
  onAdded: (vendor: { id: string; name: string }) => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<VendorCreateInput>({
    name,
    trade: '',
    phone: '',
    email: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof VendorCreateInput, string>>>({});
  const create = useMutation(trpc.vendors.create.mutationOptions());
  const id = (f: string) => `${idPrefix}-${f}`;
  const set = (key: keyof VendorCreateInput) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function save() {
    const parsed = vendorCreateSchema.safeParse(values);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof VendorCreateInput;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const vendor = await create.mutateAsync(parsed.data);
      await queryClient.invalidateQueries(trpc.vendors.pathFilter());
      onAdded(vendor);
    } catch {
      // shown below via create.error
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={id('title')}
      className="mt-3 grid gap-4 rounded-xl border border-border bg-background p-4"
      // Enter here adds the vendor rather than submitting the job form around it.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <p id={id('title')} className="font-semibold">
        New vendor
      </p>
      <div className="grid gap-4">
        <Field label="Name" htmlFor={id('name')} error={errors.name}>
          <Input id={id('name')} autoComplete="off" value={values.name} onChange={set('name')} />
        </Field>
        <Field
          label="What they do"
          htmlFor={id('trade')}
          hint="Like Plumber or Demo crew."
          error={errors.trade}
        >
          <Input
            id={id('trade')}
            autoComplete="off"
            value={values.trade ?? ''}
            onChange={set('trade')}
          />
        </Field>
        <Field label="Phone" htmlFor={id('phone')} error={errors.phone}>
          <Input
            id={id('phone')}
            type="tel"
            autoComplete="off"
            value={values.phone ?? ''}
            onChange={set('phone')}
          />
        </Field>
        <Field label="Email" htmlFor={id('email')} error={errors.email}>
          <Input
            id={id('email')}
            type="email"
            autoComplete="off"
            value={values.email ?? ''}
            onChange={set('email')}
          />
        </Field>
      </div>
      {create.error ? <FormError>{create.error.message}</FormError> : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={create.isPending} onClick={() => void save()}>
          Add vendor
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
