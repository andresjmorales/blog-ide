/** Paths BlogIDE is allowed to forward to api.pushbullet.com. */
export function isAllowedPushbulletProxyPath(parts: string[]): boolean {
  if (parts.length === 2 && parts[0] === "users" && parts[1] === "me") {
    return true;
  }
  if (parts.length === 1 && (parts[0] === "devices" || parts[0] === "pushes")) {
    return true;
  }
  if (
    parts.length === 2 &&
    parts[0] === "devices" &&
    /^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    return true;
  }
  return false;
}
