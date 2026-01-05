// adminAuth.js
import basicAuth from "basic-auth";

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

export function adminAuth(req, res, next) {
  const user = basicAuth(req);

  if (
    !user ||
    user.name !== ADMIN_USER ||
    user.pass !== ADMIN_PASS
  ) {
    res.set("WWW-Authenticate", 'Basic realm="Guardião Admin"');
    return res.status(401).end("Unauthorized");
  }

  next();
}
