import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ExerciseRow = { id: string; name: string };

export function PreflightWeightsSheet({
  exercises,
  lastLoads,
  onSave,
  onCancel
}: {
  exercises: ExerciseRow[];
  lastLoads: Record<string, number | undefined>;
  onSave: (planned: Record<string, number | undefined>) => void;
  onCancel?: () => void;
}) {
  const [planned, setPlanned] = useState<Record<string, number | undefined>>(() => ({ ...lastLoads }));

  const rows = useMemo(() => exercises, [exercises]);

  const setLoad = (id: string, v: string) => {
    const n = v === '' ? undefined : Number(v);
    setPlanned(p => ({ ...p, [id]: Number.isFinite(n!) ? n : undefined }));
  };

  const useLast = (id: string) => setPlanned(p => ({ ...p, [id]: lastLoads[id] }));

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Set your working weights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-6 truncate">{r.name}</div>
            <div className="col-span-3">
              <Input
                inputMode="decimal"
                value={planned[r.id] ?? ''}
                placeholder={lastLoads[r.id] ? String(lastLoads[r.id]) : 'kg'}
                onChange={e => setLoad(r.id, e.target.value)}
              />
            </div>
            <div className="col-span-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => useLast(r.id)}>Use last</Button>
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button onClick={() => onSave(planned)}>Save & Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
}
