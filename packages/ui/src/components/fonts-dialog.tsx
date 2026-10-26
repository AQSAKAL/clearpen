// The writing font (editor and title) and the reading font (reader mode).

import { useEffect, useState } from 'react';
import { DEFAULT_FONTS, FONTS, type FontSettings, fontStack } from '../fonts.ts';
import { useSettings } from '../settings.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Label } from './ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select.tsx';

const GROUPS = ['Serif', 'Sans', 'Mono'] as const;
const SAMPLE = 'The quick brown fox jumps over the lazy dog — 1,234 words, “quoted”.';

function FontPicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange(v: string): void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUPS.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {FONTS.filter((f) => f.group === g).map((f) => (
                <SelectItem key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p className="rounded-md border bg-card p-3 text-[17px] leading-relaxed" style={{ fontFamily: fontStack(value) }}>
        {SAMPLE}
      </p>
    </div>
  );
}

export function FontsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { settings, set } = useSettings();
  const [draft, setDraft] = useState<FontSettings>(settings.fonts);

  useEffect(() => {
    if (open) setDraft(settings.fonts);
  }, [open, settings.fonts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fonts</DialogTitle>
          <DialogDescription>Fonts come with Clearpen, so they work offline.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <FontPicker
            id="font-write"
            label="Writing — the editor and title"
            value={draft.write}
            onChange={(write) => setDraft({ ...draft, write })}
          />
          <FontPicker
            id="font-read"
            label="Reading — reader mode"
            value={draft.read}
            onChange={(read) => setDraft({ ...draft, read })}
          />
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft(DEFAULT_FONTS)}>
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                set('fonts', draft);
                onOpenChange(false);
              }}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
