import { Plus } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ConfirmRemove } from '@/components/confirm-remove';
import { useReturnFocus } from '@/lib/editor-focus';
import { useToasts } from '@/lib/toasts';
import { FormError, Input, Select } from '@/components/form';
import { LoadError } from '@/components/load-error';
import { Panel } from '@/components/panel';
import { LinesPlaceholder } from '@/components/placeholder';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc';
import { useRefreshShopping } from '@/lib/refresh';

/**
 * The admin's category list (M3, OD-52; Q21): add, rename, and merge one into another, which
 * moves its lines over. Starting fine and merging later is the cheap direction.
 */
export function CategoriesAdmin() {
  const trpc = useTRPC();
  const categories = useQuery(trpc.categories.list.queryOptions());
  const invalidate = useRefreshShopping();
  const [name, setName] = useState('');
  const create = useMutation(
    trpc.categories.create.mutationOptions({
      onSuccess: async () => {
        setName('');
        await invalidate();
      },
    }),
  );

  return (
    <Panel aria-labelledby="categories">
      <h2 id="categories" className="text-2xl">
        Categories
      </h2>
      <p className="mt-1 text-muted-foreground">
        Merging moves everything in it into the other category.
      </p>
      {categories.isPending ? (
        <LinesPlaceholder label="Loading categories" lines={4} className="mt-3" />
      ) : null}
      {categories.error ? (
        <LoadError
          what="the categories"
          error={categories.error}
          retry={[categories]}
          className="mt-3"
        />
      ) : null}
      {categories.data && categories.data.length === 0 ? (
        <p className="mt-3 text-muted-foreground">No categories yet.</p>
      ) : null}
      <ul className="mt-3 divide-y divide-border">
        {categories.data?.map((c) => (
          <li key={c.id} className="py-3">
            <CategoryRow
              category={c}
              others={categories.data.filter((o) => o.id !== c.id)}
              onChanged={invalidate}
            />
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name });
        }}
      >
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="new-category" className="block text-sm font-semibold">
            New category
          </label>
          <Input
            id="new-category"
            className="mt-1.5"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={create.isPending || name.trim() === ''}>
          <Plus aria-hidden absoluteStrokeWidth strokeWidth={2} />
          Add category
        </Button>
        {create.error ? <FormError className="w-full">{create.error.message}</FormError> : null}
      </form>
    </Panel>
  );
}

type Category = { id: string; name: string; lineCount: number };

function CategoryRow({
  category,
  others,
  onChanged,
}: {
  category: Category;
  others: Category[];
  onChanged: () => Promise<unknown>;
}) {
  const trpc = useTRPC();
  const toasts = useToasts();
  const [mode, setMode] = useState<'view' | 'rename' | 'merge'>('view');
  const [name, setName] = useState(category.name);
  // Merge starts on "Pick a category", never on whichever came first (OD-125, Q162).
  const [into, setInto] = useState('');
  // Opening focuses the field; closing hands focus back to the button that opened it (Q163).
  useReturnFocus(mode === 'view' ? null : `${mode}-${category.id}`);
  const nameField = useRef<HTMLInputElement>(null);
  const intoField = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (mode === 'rename') nameField.current?.focus();
    if (mode === 'merge') intoField.current?.focus();
  }, [mode]);
  const close = () => setMode('view');
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const rename = useMutation(
    trpc.categories.update.mutationOptions({
      onSuccess: async () => {
        await onChanged();
        close();
      },
    }),
  );
  const lines = `${category.lineCount} ${category.lineCount === 1 ? 'thing' : 'things'}`;
  const intoName = others.find((o) => o.id === into)?.name ?? '';
  const merge = useMutation(
    trpc.categories.merge.mutationOptions({
      onSuccess: async () => {
        await onChanged();
        toasts.add({
          title: `Merged ${category.name} into ${intoName}`,
          description: `Moved ${lines} and removed ${category.name}.`,
        });
      },
    }),
  );

  if (mode === 'rename') {
    const blank = name.trim() === '';
    return (
      <form
        className="flex flex-wrap items-end gap-3"
        onKeyDown={onEscape}
        onSubmit={(e) => {
          e.preventDefault();
          if (!blank) rename.mutate({ id: category.id, name });
        }}
      >
        <div className="min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto">
          <label htmlFor={`rename-${category.id}`} className="block text-sm font-semibold">
            New name for {category.name}
          </label>
          <Input
            ref={nameField}
            id={`rename-${category.id}`}
            className="mt-1.5"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {/* No saving a blank name (Q164). */}
        <Button type="submit" disabled={rename.isPending || blank}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        {rename.error ? <FormError className="w-full">{rename.error.message}</FormError> : null}
      </form>
    );
  }

  if (mode === 'merge') {
    return (
      <div className="flex flex-wrap items-end gap-3" onKeyDown={onEscape}>
        {/* On a phone the field has its own line (Q162). */}
        <div className="min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-auto">
          <label htmlFor={`merge-${category.id}`} className="block text-sm font-semibold">
            Merge {category.name} into
          </label>
          <Select
            ref={intoField}
            id={`merge-${category.id}`}
            className="mt-1.5"
            value={into}
            onChange={(e) => setInto(e.target.value)}
          >
            <option value="" disabled>
              Pick a category
            </option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        {/* Asks first, naming the whole consequence; there's no un-merge (Q162). */}
        <ConfirmRemove
          what={category.name}
          label="Merge"
          triggerVariant="outline"
          disabled={merge.isPending || into === ''}
          question={`Merge ${category.name} into ${intoName}: moves ${lines}, removes ${category.name}.`}
          confirmLabel="Yes, merge"
          keepLabel="Don't merge"
          onConfirm={() => merge.mutate({ id: category.id, intoId: into })}
        />
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        {merge.error ? <FormError className="w-full">{merge.error.message}</FormError> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="min-w-0">
        <span className="block font-semibold">{category.name}</span>
        <span className="block text-sm text-muted-foreground">{lines}</span>
      </span>
      <span className="-mr-3 flex gap-1">
        <Button
          type="button"
          variant="ghost"
          aria-label={`Rename ${category.name}`}
          data-return-focus={`rename-${category.id}`}
          onClick={() => {
            setName(category.name);
            rename.reset();
            setMode('rename');
          }}
        >
          Rename
        </Button>
        {others.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            aria-label={`Merge ${category.name} into another category`}
            data-return-focus={`merge-${category.id}`}
            onClick={() => {
              setInto('');
              merge.reset();
              setMode('merge');
            }}
          >
            Merge
          </Button>
        ) : null}
      </span>
    </div>
  );
}
