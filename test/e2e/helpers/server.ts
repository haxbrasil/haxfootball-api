import { setupTestDatabase } from "@/test/e2e/helpers/helpers";

export type E2eServer = {
  baseUrl: string;
  stop(): void;
};

export async function startE2eServer(): Promise<E2eServer> {
  await setupTestDatabase();

  const { app } = await import("@/app");
  const port = 19_500 + Math.floor(Math.random() * 1_000);
  const server = app.listen({
    hostname: "127.0.0.1",
    port
  });

  return {
    baseUrl: `http://127.0.0.1:${server.server?.port ?? port}`,
    stop: () => server.stop()
  };
}
