/**
 * Validation de l'environnement au démarrage. Une variable obligatoire manquante
 * doit faire échouer le boot, pas la première requête.
 */
const REQUIRED = ['DATABASE_URL'] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement obligatoires manquantes : ${missing.join(', ')}`,
    );
  }

  return config;
}
