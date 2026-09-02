type IngestFn = () => Promise<void>;

const ingestFns = new Set<IngestFn>();

/** Capture runtimes register here so Notes refresh can pull immediately. */
export function registerCaptureIngest(fn: IngestFn): () => void {
  ingestFns.add(fn);
  return () => {
    ingestFns.delete(fn);
  };
}

/**
 * Run every active Pushbullet / ntfy ingest, then resolve.
 * No-op when nothing is connected. In-flight pulls are coalesced by each runtime.
 */
export async function requestCaptureRefresh(): Promise<void> {
  await Promise.all([...ingestFns].map((fn) => fn()));
}
