import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import MemoryStore from "memorystore";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL("https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // Use memory store for development to avoid session persistence issues
  const MemoryStoreSession = MemoryStore(session);
  const sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000, // prune expired entries every 24h
  });
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: false, // Allow client-side access for debugging
      secure: false,
      maxAge: sessionTtl,
      sameSite: 'lax' // More compatible with Replit preview
    },
    name: 'connect.sid', // Use default session name
    proxy: true, // Trust proxy headers
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", true); // Trust all proxies for Replit
  const sessionMiddleware = getSession();
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Create strategies for all domains and a fallback strategy
  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }
  
  // Add fallback strategy for localhost and other development scenarios
  const fallbackStrategy = new Strategy(
    {
      name: "replitauth:fallback",
      config,
      scope: "openid email profile offline_access",
      callbackURL: `https://${process.env.REPLIT_DOMAINS!.split(",")[0]}/api/callback`,
    },
    verify,
  );
  passport.use(fallbackStrategy);

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    console.log("Login attempt, hostname:", req.hostname);
    console.log("Session ID:", req.sessionID);
    console.log("Is authenticated:", req.isAuthenticated());
    
    if (req.isAuthenticated()) {
      return res.redirect("/");
    }
    
    // Check if hostname strategy exists, otherwise use fallback
    const configuredDomains = process.env.REPLIT_DOMAINS!.split(",");
    const strategyName = configuredDomains.includes(req.hostname) 
      ? `replitauth:${req.hostname}` 
      : "replitauth:fallback";
    
    console.log(`Using strategy: ${strategyName}`);
    passport.authenticate(strategyName)(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    console.log("Callback received, hostname:", req.hostname);
    console.log("Session ID:", req.sessionID);
    console.log("Query params:", req.query);
    
    // Check if hostname strategy exists, otherwise use fallback
    const configuredDomains = process.env.REPLIT_DOMAINS!.split(",");
    const strategyName = configuredDomains.includes(req.hostname) 
      ? `replitauth:${req.hostname}` 
      : "replitauth:fallback";
    
    console.log(`Using strategy: ${strategyName}`);
    
    passport.authenticate(strategyName, (err: any, user: any, info: any) => {
      console.log("Auth result - err:", err, "user:", !!user, "info:", info);
      
      if (err) {
        console.error("Authentication error:", err);
        return res.redirect("/?error=auth_failed");
      }
      
      if (!user) {
        console.log("Authentication failed:", info);
        return res.redirect("/?error=auth_failed");
      }
      
      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.redirect("/?error=login_failed");
        }
        
        console.log("Successfully logged in user");
        return res.redirect("/");
      });
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  // TEMPORARY: Bypass auth in development for testing
  if (process.env.NODE_ENV === 'development') {
    // Set up mock user for development
    (req as any).user = {
      claims: {
        sub: 'dev-admin-user'
      }
    };
    return next();
  }

  // First verify authentication
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.expires_at) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }

  // Check admin status from database
  try {
    const userId = user.claims.sub;
    const dbUser = await storage.getUser(userId);
    
    if (!dbUser?.isAdmin) {
      return res.status(403).json({ message: "Forbidden - Admin access required" });
    }
    
    return next();
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};