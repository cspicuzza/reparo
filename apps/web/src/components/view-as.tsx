import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import type { ViewAs } from '@reparo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { SegmentedSwitch } from '@/components/segmented-switch';
import { knobStyle, SWITCH_KNOB, SWITCH_POSITION, SWITCH_TRACK } from '@/lib/switch';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { saveViewAs } from '@/lib/view-as';
import { cn } from '@/lib/utils';

/*
 * Previewing the app as another role (OD-133, Q194–Q197): for a real admin only, a three-way
 * switch (Admin, Editor, Viewer) in the account menu and the phone's Menu panel, and a bar
 * across the top while previewing with "Back to admin". All of it is shown from the member's
 * real role, so it never disappears mid-preview, and going back is local: nothing to refuse.
 */

type Choice = 'admin' | ViewAs;
const CHOICES: { value: Choice; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];
const LABEL: Record<ViewAs, string> = { editor: 'an editor', viewer: 'a viewer' };

/** Switch the preview, then refetch everything so each page redraws for that role. */
function useSwitchRole() {
  const queryClient = useQueryClient();
  return (choice: Choice) => {
    saveViewAs(choice === 'admin' ? null : choice);
    void queryClient.invalidateQueries();
  };
}

/** The menu's version is built from the menu's own radio items, so it borrows the switch's look. */
function Knob({ choice }: { choice: Choice }) {
  const index = CHOICES.findIndex((c) => c.value === choice);
  return <span aria-hidden className={SWITCH_KNOB} style={knobStyle(index, CHOICES.length)} />;
}

/** In the account menu on a laptop, built from the menu's own radio items (arrow keys work). */
export function ViewAsMenu() {
  const { isRealAdmin, viewAs } = useMe();
  const switchRole = useSwitchRole();
  if (!isRealAdmin) return null;
  const choice: Choice = viewAs ?? 'admin';
  return (
    <div className="px-3 py-1.5">
      <span className="block text-base">View as</span>
      <span className="block text-sm text-muted-foreground">See the app as each role sees it</span>
      <MenuPrimitive.RadioGroup
        value={choice}
        onValueChange={(v: Choice) => switchRole(v)}
        aria-label="View as"
        className={cn(SWITCH_TRACK, 'mt-1.5')}
      >
        <Knob choice={choice} />
        {CHOICES.map((c) => (
          <MenuPrimitive.RadioItem
            key={c.value}
            value={c.value}
            closeOnClick={false}
            className={cn(
              SWITCH_POSITION,
              'cursor-pointer outline-none data-highlighted:outline-2 data-highlighted:outline-ring data-highlighted:outline-solid',
              choice === c.value ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {c.label}
          </MenuPrimitive.RadioItem>
        ))}
      </MenuPrimitive.RadioGroup>
    </div>
  );
}

/** In the phone's Menu panel: real radio buttons. */
export function ViewAsSwitch({ className }: { className?: string }) {
  const { isRealAdmin, viewAs } = useMe();
  const switchRole = useSwitchRole();
  if (!isRealAdmin) return null;
  const choice: Choice = viewAs ?? 'admin';
  return (
    <fieldset className={className}>
      <legend className="text-base">View as</legend>
      <SegmentedSwitch
        name="view-as"
        value={choice}
        options={CHOICES}
        onChange={switchRole}
        className="mt-1.5"
      />
    </fieldset>
  );
}

/** Across the top of every page while previewing, in the other theme so it can't be missed. */
export function PreviewBar() {
  const { viewAs } = useMe();
  const switchRole = useSwitchRole();
  if (!viewAs) return null;
  return (
    <div className="ink border-b border-border bg-popover text-popover-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <p role="status">
          <span className="font-semibold">Viewing as {LABEL[viewAs]}.</span>{' '}
          <span className="text-muted-foreground">You see, and can do, only what they can.</span>
        </p>
        <Button type="button" onClick={() => switchRole('admin')}>
          Back to admin
        </Button>
      </div>
    </div>
  );
}
