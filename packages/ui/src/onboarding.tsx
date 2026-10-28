// The goal step: "What will you write?" Asked once, on the first run, after
// the model is set up, and again from ⋯ → Start from an example…. The answer
// opens the example article for that kind of piece — a short real piece with
// blanks to fill and a tour of what Clearpen does — and becomes the kind new
// articles start as (the genre: which checks run, who the review reads for).

import { GOALS, type Goal } from '@clearpen/core';
import { useEffect, useState } from 'react';
import { Button } from './components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog.tsx';
import { Label } from './components/ui/label.tsx';
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group.tsx';
import { cn } from './lib/utils.ts';

export const GOAL_TITLE = 'What will you write?';

export function GoalDialog({
  open,
  firstRun,
  goal,
  onOpenChange,
  onChoose,
}: {
  open: boolean;
  /** The first run: no article yet, so the step can be skipped but not clicked away. */
  firstRun: boolean;
  /** The goal chosen before, preselected. */
  goal: string | null;
  onOpenChange(open: boolean): void;
  onChoose(goal: Goal): void;
}) {
  const [choice, setChoice] = useState(goal ?? GOALS[0].id);
  useEffect(() => {
    if (open) setChoice(goal ?? GOALS[0].id);
  }, [open, goal]);
  const chosen = GOALS.find((g) => g.id === choice) ?? GOALS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => firstRun && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{GOAL_TITLE}</DialogTitle>
          <DialogDescription>
            Clearpen opens a short example of that kind of piece, with the checks and edits to try on it, and new
            articles start as that kind. Any one article can be changed later under Insights → What this is.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={setChoice} aria-label="What you will write">
          {GOALS.map((g) => (
            <Label
              key={g.id}
              htmlFor={`goal-${g.id}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal',
                choice === g.id && 'border-primary bg-muted/40',
              )}
            >
              <RadioGroupItem id={`goal-${g.id}`} value={g.id} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="font-medium">{g.label}</span>
                <span className="text-xs leading-snug text-muted-foreground">{g.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {firstRun ? 'Not now' : 'Cancel'}
          </Button>
          <Button onClick={() => onChoose(chosen)}>Open the example</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
