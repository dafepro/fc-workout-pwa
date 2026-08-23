const PLAYER_ROUTES = [
  { method: "GET", pattern: /^v1\/me\/training-entries$/ },
  { method: "GET", pattern: /^v1\/me\/training-dashboard$/ },
  { method: "POST", pattern: /^v1\/me\/training-entries$/ },
  { method: "GET", pattern: /^v1\/me\/reaction-badges$/ },
  { method: "POST", pattern: /^v1\/reactions$/ },
  { method: "PUT", pattern: /^v1\/me\/avatar$/ },
  { method: "GET", pattern: /^v1\/training-entries\/[^/]+$/ },
  { method: "DELETE", pattern: /^v1\/training-entries\/[^/]+$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/activity$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/leaderboards$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/reward$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/reward-media\/[^/]+$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/canvas$/ },
  { method: "POST", pattern: /^v1\/teams\/[^/]+\/canvas\/rest$/ },
  { method: "PUT", pattern: /^v1\/teams\/[^/]+\/canvas\/avatar$/ },
  { method: "POST", pattern: /^v1\/teams\/[^/]+\/canvas\/pieces$/ },
  { method: "PUT", pattern: /^v1\/teams\/[^/]+\/canvas\/pieces\/[^/]+$/ },
  {
    method: "DELETE",
    pattern: /^v1\/teams\/[^/]+\/canvas\/pieces\/[^/]+$/,
  },
  { method: "PUT", pattern: /^v1\/teams\/[^/]+\/canvas\/dev-settings$/ },
  { method: "GET", pattern: /^v1\/teams\/[^/]+\/canvas\/events$/ },
  {
    method: "POST",
    pattern: /^v1\/teams\/[^/]+\/canvas\/socket-ticket$/,
  },
];

export function allowsPlayerRoute(method: string, path: string): boolean {
  return PLAYER_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path),
  );
}
