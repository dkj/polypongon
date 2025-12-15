export const DEFAULT_PORT = 12122;

/**
 * Resolve the port for the server using environment variables.
 * Priority: PORT, then FLY_INTERNAL_PORT, finally DEFAULT_PORT.
 * Falls back to DEFAULT_PORT for invalid or unset values.
 * @param {NodeJS.ProcessEnv} env
 * @returns {number}
 */
export function resolvePort(env = process.env) {
  const candidate = env.PORT ?? env.FLY_INTERNAL_PORT;
  const parsed = Number(candidate);

  const isValidPort = Number.isInteger(parsed) && parsed > 0 && parsed < 65536;
  return isValidPort ? parsed : DEFAULT_PORT;
}
