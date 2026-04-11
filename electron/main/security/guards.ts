const DANGEROUS_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const shouldWarnForProdAccess = (url: string, prodDomains: string[]): boolean => {
  try {
    const hostname = new URL(url).hostname;
    return prodDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

export const shouldWarnDangerousMethod = (method: string): boolean => DANGEROUS_METHODS.has(method.toUpperCase());
