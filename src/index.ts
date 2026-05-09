import { app } from "@/app";
import { env } from "@/config/env";

app.listen({
  hostname: env.host,
  port: env.port
});

console.log(`API listening on http://${env.host}:${env.port}`);
console.log(`Swagger available at http://${env.host}:${env.port}/docs`);
