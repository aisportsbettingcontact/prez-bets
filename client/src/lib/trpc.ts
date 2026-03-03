import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";

export type { AppRouter };
export const trpc = createTRPCReact<AppRouter>();
