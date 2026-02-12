let oauthReturnRoute: string | null = null;

export function setOAuthReturnRoute(route: string | null) {
  oauthReturnRoute = route;
}

export function consumeOAuthReturnRoute(): string | null {
  const route = oauthReturnRoute;
  oauthReturnRoute = null;
  return route;
}
