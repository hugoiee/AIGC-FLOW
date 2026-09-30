type PersistenceStatus = "saved" | "saving" | "error";

/** Coalesce callers, serialize writes, and read again after each completed write. */
export class SaveQueue<T> {
  saved: T;
  private pending: Promise<boolean> | undefined;
  constructor(
    initial: T,
    private snapshot: () => T,
    private persist: (value: T) => Promise<void>,
    private matches: (left: T, right: T) => boolean,
    private onStatus: (status: PersistenceStatus) => void,
  ) {
    this.saved = initial;
  }

  get saving() {
    return this.pending !== undefined;
  }

  flush(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.pending = Promise.resolve()
      .then(async () => {
        let current = this.snapshot();
        while (!this.matches(current, this.saved)) {
          this.onStatus("saving");
          await this.persist(current);
          this.saved = current;
          current = this.snapshot();
        }
        this.onStatus("saved");
        return true;
      })
      .catch(() => {
        this.onStatus("error");
        return false;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
}
