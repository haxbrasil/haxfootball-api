export function sleep(
  milliseconds: number,
  input: { signal?: AbortSignal } = {}
): Promise<void> {
  if (input.signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    const stop = () => {
      clearTimeout(timeout);
      resolve();
    };

    input.signal?.addEventListener("abort", stop, { once: true });
  });
}
