/** Minimal typed event bus used to decouple simulation from presentation (audio, VFX, UI). */
export type Listener<T> = (payload: T) => void;

export class EventBus<M extends { [K in keyof M]: unknown }> {
  private listeners: { [K in keyof M]?: Listener<M[K]>[] } = {};
  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    (this.listeners[type] ??= []).push(fn);
    return () => {
      const arr = this.listeners[type];
      if (arr) arr.splice(arr.indexOf(fn), 1);
    };
  }
  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const arr = this.listeners[type];
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) arr[i](payload);
  }
}
