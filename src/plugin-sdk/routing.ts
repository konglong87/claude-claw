/**
 * Routing Utilities
 */

export type RouteMatch = {
  pattern: string
  handler: string
  priority?: number
}

export function matchRoute(text: string, routes: RouteMatch[]): RouteMatch | undefined {
  // Placeholder implementation
  return routes[0]
}