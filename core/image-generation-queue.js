let tail = Promise.resolve();
let pending = 0;

/** Run opted-in image generations one at a time to protect ST's shared SD settings. */
export function enqueueImageGeneration(task) {
    pending++;
    const run = tail.then(task);
    tail = run.then(() => { pending--; }, () => { pending--; });
    return run;
}

export function imageGenerationPending() {
    return pending;
}
