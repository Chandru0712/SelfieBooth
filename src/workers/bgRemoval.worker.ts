// Runs entirely off the main thread — prevents "Page Unresponsive" dialog.
// Main thread sends { id, type: 'preload'|'remove', ... } and receives results back.

let removeBgFn: ((blob: Blob, config: any) => Promise<Blob>) | null = null;

const loadModule = async (): Promise<void> => {
  if (removeBgFn) return;
  const mod = await import('@imgly/background-removal') as any;
  removeBgFn = mod.default ?? mod.removeBackground ?? null;
  if (typeof removeBgFn !== 'function') {
    throw new Error('removeBackground not found in @imgly/background-removal');
  }
};

self.onmessage = async (e: MessageEvent) => {
  const { id, type } = e.data;

  if (type === 'preload') {
    try {
      await loadModule();
      const mod = await import('@imgly/background-removal') as any;
      if (typeof mod.preload === 'function') {
        await mod.preload({ model: e.data.model ?? 'medium', device: 'cpu' });
      }
      (self as any).postMessage({ id, type: 'preload_ok' });
    } catch (err) {
      (self as any).postMessage({ id, type: 'preload_err', error: String(err) });
    }
    return;
  }

  if (type === 'remove') {
    const { arrayBuffer, mimeType, config } = e.data as {
      arrayBuffer: ArrayBuffer;
      mimeType: string;
      config: any;
    };
    try {
      await loadModule();
      const blob = new Blob([arrayBuffer], { type: mimeType });
      const result = await removeBgFn!(blob, config);
      const resultBuffer = await result.arrayBuffer();
      (self as any).postMessage(
        { id, type: 'remove_ok', arrayBuffer: resultBuffer, mimeType: result.type },
        [resultBuffer],
      );
    } catch (err) {
      (self as any).postMessage({ id, type: 'remove_err', error: String(err) });
    }
  }
};
