export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupMigrations } = await import("./lib/startup-migrations");
    runStartupMigrations();
  }
}
