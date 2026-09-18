type TokenGetter = (opts?: { skipCache?: boolean }) => Promise<string | null>

let _getToken: TokenGetter | null = null

/** Called once the identity provider is ready, so the client can authorise requests. */
export function setTokenGetter(getter: TokenGetter | null) {
  _getToken = getter
}

export function getAuthToken(opts?: { skipCache?: boolean }): Promise<string | null> {
  return _getToken ? _getToken(opts) : Promise.resolve(null)
}
