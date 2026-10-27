// A screen that a later task builds (TASKS.md). Keeps navigation working until then.
export function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Coming in task {task}.</p>
    </>
  );
}
