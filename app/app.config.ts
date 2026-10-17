import type { ConfigContext, ExpoConfig } from 'expo/config';

// Static config lives in app.json. This file only adds the per-person iOS signing
// values, read from app/.env.local, so four free Apple teams never share a bundle ID,
// and the optional escalation server URL (RG_SERVER_URL) for Swift's ServerClient.

export const BUNDLE_ID_BASE = 'com.raveguard';

const BUNDLE_SUFFIX_PATTERN = /^[a-z0-9-]+$/;
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const SETUP_HINT = 'Copy app/.env.example to app/.env.local and fill it in (see app/README.md).';

type Env = Record<string, string | undefined>;

interface IosSigning {
  bundleIdentifier: string;
  appleTeamId?: string;
}

export function resolveIosSigning(env: Env): IosSigning {
  const suffix = env.RG_BUNDLE_SUFFIX?.trim();
  if (!suffix || !BUNDLE_SUFFIX_PATTERN.test(suffix)) {
    throw new Error(
      `RG_BUNDLE_SUFFIX must be set to lowercase letters, digits or hyphens, e.g. "kean" ` +
        `(got "${suffix ?? ''}"). ${SETUP_HINT}`
    );
  }
  const bundleIdentifier = `${BUNDLE_ID_BASE}.${suffix}`;

  // Optional: without it, `expo run:ios --device` picks a team from the keychain.
  const teamId = env.RG_APPLE_TEAM_ID?.trim();
  if (!teamId) {
    return { bundleIdentifier };
  }
  if (!APPLE_TEAM_ID_PATTERN.test(teamId)) {
    throw new Error(
      `RG_APPLE_TEAM_ID must be 10 uppercase letters or digits (got "${teamId}"). ${SETUP_HINT}`
    );
  }
  return { bundleIdentifier, appleTeamId: teamId };
}

// Info.plist key the native module reads to choose ServerClient over the offline fake (J12).
export const SERVER_URL_PLIST_KEY = 'RGServerURL';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** RG_SERVER_URL, checked the way Swift's ServerClient checks it: HTTPS, or HTTP to loopback. */
export function resolveServerUrl(env: Env): string | undefined {
  const raw = env.RG_SERVER_URL?.trim();
  if (!raw) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`RG_SERVER_URL must be a URL like https://raveguard.example.com (got "${raw}"). ${SETUP_HINT}`);
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!secure) {
    throw new Error(`RG_SERVER_URL must use https:// (got "${raw}"). ${SETUP_HINT}`);
  }
  return raw.replace(/\/+$/, '');
}

export default function buildConfig({ config }: ConfigContext, env: Env = process.env): ExpoConfig {
  const { name, slug } = config;
  if (!name || !slug) {
    throw new Error('app.json must set expo.name and expo.slug.');
  }
  return {
    ...config,
    name,
    slug,
    ios: { ...config.ios, ...resolveIosSigning(env), infoPlist: infoPlist(config.ios?.infoPlist, env) },
  };
}

function infoPlist(base: Record<string, unknown> | undefined, env: Env): Record<string, unknown> {
  const serverUrl = resolveServerUrl(env);
  return serverUrl ? { ...base, [SERVER_URL_PLIST_KEY]: serverUrl } : { ...base };
}
