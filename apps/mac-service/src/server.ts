import { buildApp } from "./app.js";

const port = Number(process.env.FILMBOARD_PORT ?? 43117);
const host = "127.0.0.1";
const app = buildApp({ logger: true });

await app.listen({ port, host });
console.log(`FilmBoard local service listening at http://${host}:${port}`);
