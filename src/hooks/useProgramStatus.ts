import { useEffect, useState } from 'react';
import { ProgramKey } from '../lib/program-config';
import { ProgramStatus, loadProgramStatus } from '../lib/programs';

/**
 * The live cohort state for a program page: next start date, size and places left.
 *
 * Returns null while loading and if the call fails, so the pages fall back to
 * their standing copy instead of breaking when the database is unreachable.
 */
export function useProgramStatus(program: ProgramKey): ProgramStatus | null {
  const [status, setStatus] = useState<ProgramStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadProgramStatus(program)
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [program]);
  return status;
}
