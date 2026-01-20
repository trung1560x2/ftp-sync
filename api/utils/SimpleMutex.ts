export class SimpleMutex {
    private promise: Promise<void> = Promise.resolve();

    public async run<T>(fn: () => Promise<T>): Promise<T> {
        let unlock: () => void;

        // Create a new lock promise
        const nextLock = new Promise<void>(resolve => unlock = resolve);

        // Get the current end of the chain
        const prevParams = this.promise;

        // Append our lock to the chain
        // We catch errors on prevParams so we run even if previous failed
        this.promise = this.promise.then(() => nextLock).catch(() => nextLock);

        // Wait for previous to finish (regardless of success/failure)
        try {
            await prevParams;
        } catch {
            // ignore previous error
        }

        try {
            return await fn();
        } finally {
            unlock!();
        }
    }
}
