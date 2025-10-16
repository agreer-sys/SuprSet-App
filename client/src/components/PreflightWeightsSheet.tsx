import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ExerciseRow = { id: string; name: string };
type WeightUnit = 'lbs' | 'kg';

const KG_TO_LBS = 2.20462;
const LBS_TO_KG = 1 / KG_TO_LBS;

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
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const [planned, setPlanned] = useState<Record<string, number | undefined>>(() => ({ ...lastLoads }));

  const rows = useMemo(() => exercises, [exercises]);

  const toggleUnit = () => {
    const newUnit = unit === 'lbs' ? 'kg' : 'lbs';
    const conversion = unit === 'lbs' ? LBS_TO_KG : KG_TO_LBS;
    
    // Convert all existing values
    const converted: Record<string, number | undefined> = {};
    for (const [id, val] of Object.entries(planned)) {
      if (val !== undefined) {
        converted[id] = Math.round(val * conversion * 10) / 10; // Round to 1 decimal
      }
    }
    
    setPlanned(converted);
    setUnit(newUnit);
  };

  const setLoad = (id: string, v: string) => {
    const n = v === '' ? undefined : Number(v);
    setPlanned(p => ({ ...p, [id]: Number.isFinite(n!) ? n : undefined }));
  };

  const useLast = (id: string) => setPlanned(p => ({ ...p, [id]: lastLoads[id] }));

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Set your working weights</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleUnit}
            data-testid="toggle-weight-unit"
          >
            {unit === 'lbs' ? 'Switch to kg' : 'Switch to lbs'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-6 truncate">{r.name}</div>
            <div className="col-span-3">
              <Input
                inputMode="decimal"
                value={planned[r.id] ?? ''}
                placeholder={lastLoads[r.id] ? String(lastLoads[r.id]) : unit}
                onChange={e => setLoad(r.id, e.target.value)}
                data-testid={`input-weight-${r.id}`}
              />
            </div>
            <div className="col-span-3 flex justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => useLast(r.id)}
                data-testid={`button-use-last-${r.id}`}
              >
                Use last
              </Button>
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && <Button variant="ghost" onClick={onCancel} data-testid="button-cancel">Cancel</Button>}
          <Button onClick={() => onSave(planned)} data-testid="button-save-continue">Save & Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
}
