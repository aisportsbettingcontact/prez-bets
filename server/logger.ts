/**
 * server/logger.ts — Production-grade structured logger
 *
 * Design goals:
 *   - Zero external dependencies (uses process.stdout directly)
 *   - Structured JSON lines in production (NODE_ENV=production)
 *   - Colorized, human-readable output in development
 *   - Namespaced loggers: createLogger('games.list') → [games.list]
 *   - Built-in timing helpers: logger.time('query') → logger.timeEnd('query')
 *   - Error context: logger.error(err, { context }) → full stack + metadata
 *   - Noise-free: DEBUG level suppressed in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

// ANSI color codes (dev only)
const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  neon:   '\x1b[92m', // bright green — used for neon #39FF14 equivalent
};

function levelColor(level: LogLevel): string {
  switch (level) {
    case 'debug': return C.gray;
    case 'info':  return C.neon;
    case 'warn':  return C.yellow;
    case 'error': return C.red;
  }
}

function formatDev(ns: string, level: LogLevel, msg: string, meta?: LogMeta): string {
  const ts    = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const lc    = levelColor(level);
  const lvl   = level.toUpperCase().padEnd(5);
  const metaStr = meta && Object.keys(meta).length > 0
    ? ' ' + C.dim + JSON.stringify(meta) + C.reset
    : '';
  return `${C.gray}${ts}${C.reset} ${lc}${lvl}${C.reset} ${C.cyan}[${ns}]${C.reset} ${msg}${metaStr}`;
}

function formatProd(ns: string, level: LogLevel, msg: string, meta?: LogMeta): string {
  return JSON.stringify({
    ts:    new Date().toISOString(),
    level,
    ns,
    msg,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  });
}

function emit(ns: string, level: LogLevel, msg: string, meta?: LogMeta): void {
  if (IS_TEST) return; // suppress all output during vitest runs
  if (level === 'debug' && IS_PROD) return; // suppress debug in production

  const line = IS_PROD
    ? formatProd(ns, level, msg, meta)
    : formatDev(ns, level, msg, meta);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, errOrMeta?: Error | LogMeta, meta?: LogMeta): void;
  /** Start a named timer. Returns elapsed ms when called again with same label. */
  time(label: string): () => number;
  /** Log a query result: rowCount, elapsedMs, optional filter summary */
  query(op: string, rowCount: number, elapsedMs: number, meta?: LogMeta): void;
  /** Log a tRPC procedure call with input summary */
  procedure(name: string, inputSummary: string, meta?: LogMeta): void;
}

/**
 * Create a namespaced logger.
 *
 * @example
 * const log = createLogger('games.list');
 * log.info('Fetching games', { sport: 'NBA', date: '2026-03-09' });
 * const done = log.time('db.query');
 * const rows = await db.select()...;
 * const ms = done();
 * log.query('listGames', rows.length, ms, { sport: 'NBA' });
 */
export function createLogger(namespace: string): Logger {
  return {
    debug(msg, meta) { emit(namespace, 'debug', msg, meta); },
    info(msg, meta)  { emit(namespace, 'info',  msg, meta); },
    warn(msg, meta)  { emit(namespace, 'warn',  msg, meta); },

    error(msg, errOrMeta?, meta?) {
      let finalMeta: LogMeta | undefined = meta;
      if (errOrMeta instanceof Error) {
        finalMeta = {
          ...(meta ?? {}),
          errorMessage: errOrMeta.message,
          errorName:    errOrMeta.name,
          stack:        errOrMeta.stack?.split('\n').slice(0, 6).join(' | '),
        };
      } else if (errOrMeta) {
        finalMeta = { ...(errOrMeta as LogMeta), ...(meta ?? {}) };
      }
      emit(namespace, 'error', msg, finalMeta);
    },

    time(label) {
      const start = Date.now();
      return () => {
        const ms = Date.now() - start;
        emit(namespace, 'debug', `⏱ ${label} completed`, { elapsedMs: ms });
        return ms;
      };
    },

    query(op, rowCount, elapsedMs, meta?) {
      const level: LogLevel = elapsedMs > 2000 ? 'warn' : 'debug';
      emit(namespace, level, `⚡ ${op}`, {
        rows: rowCount,
        ms:   elapsedMs,
        ...(meta ?? {}),
      });
    },

    procedure(name, inputSummary, meta?) {
      emit(namespace, 'info', `→ ${name}(${inputSummary})`, meta);
    },
  };
}

// ── Pre-built loggers for each server module ──────────────────────────────────
export const dbLog      = createLogger('db');
export const routerLog  = createLogger('router');
export const authLog    = createLogger('auth');
export const fileLog    = createLogger('files');
export const gamesLog   = createLogger('games');
export const refreshLog = createLogger('refresh');
