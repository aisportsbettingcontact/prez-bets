import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  deleteModelFile,
  getModelFileById,
  insertGames,
  insertModelFile,
  listGames,
  listModelFiles,
  updateModelFileStatus,
} from "./db";
import { storagePut } from "./storage";
import { parseFileBuffer, detectSportFromFilename, detectDateFromFilename } from "./fileParser";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Files ─────────────────────────────────────────────────────────────────
  files: router({
    /**
     * Upload a CSV or XLSX model file to S3 and ingest rows into the games table.
     * Accepts base64-encoded file content from the frontend.
     */
    upload: protectedProcedure
      .input(
        z.object({
          filename: z.string().min(1).max(255),
          contentBase64: z.string(),
          sizeBytes: z.number().int().positive(),
          sport: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const sport = input.sport ?? detectSportFromFilename(input.filename);
        const gameDate = detectDateFromFilename(input.filename);

        const buffer = Buffer.from(input.contentBase64, "base64");
        const suffix = nanoid(10);
        const fileKey = `model-files/${ctx.user.id}/${suffix}-${input.filename}`;

        // Upload to S3
        const mimeType = input.filename.toLowerCase().endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv";
        const { url: fileUrl } = await storagePut(fileKey, buffer, mimeType);

        // Insert file record as "processing"
        await insertModelFile({
          uploadedBy: ctx.user.id,
          filename: input.filename,
          fileKey,
          fileUrl,
          mimeType,
          sizeBytes: input.sizeBytes,
          sport,
          gameDate: gameDate ?? undefined,
          status: "processing",
          rowsImported: 0,
        });

        // Get the inserted file ID
        const files = await listModelFiles(ctx.user.id);
        const fileRecord = files.find((f) => f.fileKey === fileKey);
        if (!fileRecord) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "File record not found after insert",
          });
        }

        try {
          const gameRows = parseFileBuffer(buffer, input.filename, fileRecord.id, sport);
          if (gameRows.length > 0) {
            await insertGames(gameRows);
          }
          await updateModelFileStatus(fileRecord.id, "done", gameRows.length);

          return {
            success: true,
            fileId: fileRecord.id,
            filename: input.filename,
            sport,
            rowsImported: gameRows.length,
            fileUrl,
          };
        } catch (err) {
          await updateModelFileStatus(fileRecord.id, "error", 0);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `File uploaded but parsing failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }),

    /**
     * List all model files uploaded by the current user.
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      return listModelFiles(ctx.user.id);
    }),

    /**
     * Delete a model file and its associated game rows.
     */
    delete: protectedProcedure
      .input(z.object({ fileId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const file = await getModelFileById(input.fileId);
        if (!file) {
          throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        }
        if (file.uploadedBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your file" });
        }
        await deleteModelFile(input.fileId);
        return { success: true };
      }),
  }),

  // ─── Games ─────────────────────────────────────────────────────────────────
  games: router({
    /**
     * List all games, optionally filtered by sport and/or date.
     * Public so unauthenticated users can view projections.
     */
    list: publicProcedure
      .input(
        z
          .object({
            sport: z.string().optional(),
            gameDate: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return listGames(input ?? {});
      }),
  }),
});

export type AppRouter = typeof appRouter;
