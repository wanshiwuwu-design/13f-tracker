import { getSec13f } from "@/lib/sec13f";

// Development route; the deployed Worker supplies the persistent D1 cache.
export const GET = (request: Request) => getSec13f(request);
