import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError, Input, Select } from '@/components/form';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/lib/trpc';

/**
 * The admin's category list (M3, OD-52; Q21): add, rename, and merge one into another, which
 * moves its lines over. Starting fine and merging later is the cheap direction.
 */
export function CategoriesAdmin() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const categories = useQuery(trpc.categories.list.queryOptions());
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.categories.pathFilter()),
      queryClient.invalidateQueries(trpc.shoppingLines.pathFilter()),
      queryClient.invalidateQueries(trpc.money.pathFilter()),
    ]);
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
        How the list is grouped and totalled. Merging moves every line into the other category.
      </p>
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
  const [mode, setMode] = useState<'view' | 'rename' | 'merge'>('view');
  const [name, setName] = useState(category.name);
  const [into, setInto] = useState(others[0]?.id ?? '');
  const done = async () => {
    await onChanged();
    setMode('view');
  };
  const rename = useMutation(trpc.categories.update.mutationOptions({ onSuccess: done }));
  const merge = useMutation(trpc.categories.merge.mutationOptions({ onSuccess: done }));
  const lines = `${category.lineCount} ${category.lineCount === 1 ? 'line' : 'lines'}`;
  const intoName = others.find((o) => o.id === into)?.name ?? '';

  if (mode === 'rename') {
    return (
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          rename.mutate({ id: category.id, name });
        }}
      >
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor={`rename-${category.id}`} className="block text-sm font-semibold">
            New name for {category.name}
          </label>
          <Input
            id={`rename-${category.id}`}
            className="mt-1.5"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={rename.isPending}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('view')}>
          Cancel
        </Button>
        {rename.error ? <FormError className="w-full">{rename.error.message}</FormError> : null}
      </form>
    );
  }

  if (mode === 'merge') {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor={`merge-${category.id}`} className="block text-sm font-semibold">
            Merge {category.name} into
          </label>
          <Select
            id={`merge-${category.id}`}
            className="mt-1.5"
            value={into}
            onChange={(e) => setInto(e.target.value)}
          >
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          disabled={merge.isPending || into === ''}
          onClick={() => merge.mutate({ id: category.id, intoId: into })}
        >
          Move {lines} to {intoName}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setMode('view')}>
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
          onClick={() => {
            setName(category.name);
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
            onClick={() => setMode('merge')}
          >
            Merge
          </Button>
        ) : null}
      </span>
    </div>
  );
}
