import { useEffect, useState } from "react";

/**
 * False until the next macrotask after `open` becomes true, so a leftover
 * Enter/click from the control that opened a dialog cannot submit it.
 */
export function useArmedWhenOpen(open: boolean): boolean {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!open) {
      const id = window.setTimeout(() => setArmed(false), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setArmed(true), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  return armed;
}
