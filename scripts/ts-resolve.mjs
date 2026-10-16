/** Resolve extensionless relative imports to .ts/.tsx for node type-stripping. */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try {
          return await next(specifier + ext, context);
        } catch {
          /* try next */
        }
      }
    }
    throw e;
  }
}
