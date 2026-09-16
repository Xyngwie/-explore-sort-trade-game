/**
 * Phase-0 geolocation: acquire + permission flow only.
 * Game rules (hub bonuses, map seeds, check-ins) come later.
 */

export type GeoPermission =
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported"
  | "unavailable";

export type GeoFix = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  speedMps: number | null;
  timestamp: number;
};

export type GeoFailureReason =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported"
  | "unknown";

export type GeoResult =
  | { ok: true; permission: "granted"; fix: GeoFix }
  | {
      ok: false;
      permission: GeoPermission;
      reason: GeoFailureReason;
      message: string;
    };

export type GeoRequestOptions = {
  /** Defaults true for a one-shot acquire. */
  enableHighAccuracy?: boolean;
  /** ms, default 10000 */
  timeoutMs?: number;
  /** ms, default 60_000 */
  maximumAgeMs?: number;
};

/** ~1.1km cells at equator; good default privacy coarsening. */
export const DEFAULT_GEO_GRID_DEGREES = 0.01;

export function isGeolocationSupported(
  nav: Pick<Navigator, "geolocation"> | null | undefined = typeof navigator !==
    "undefined"
    ? navigator
    : null,
): boolean {
  return Boolean(nav && typeof nav.geolocation?.getCurrentPosition === "function");
}

export function toGeoFix(position: GeolocationPosition): GeoFix {
  const { coords, timestamp } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    altitudeMeters:
      coords.altitude != null && Number.isFinite(coords.altitude)
        ? coords.altitude
        : null,
    headingDegrees:
      coords.heading != null && Number.isFinite(coords.heading)
        ? coords.heading
        : null,
    speedMps:
      coords.speed != null && Number.isFinite(coords.speed) ? coords.speed : null,
    timestamp,
  };
}

export function coarsenFix(
  fix: GeoFix,
  gridDegrees: number = DEFAULT_GEO_GRID_DEGREES,
): Pick<GeoFix, "latitude" | "longitude"> & { gridDegrees: number } {
  const g = gridDegrees > 0 ? gridDegrees : DEFAULT_GEO_GRID_DEGREES;
  return {
    latitude: Math.round(fix.latitude / g) * g,
    longitude: Math.round(fix.longitude / g) * g,
    gridDegrees: g,
  };
}

function mapPositionError(err: GeolocationPositionError): {
  permission: GeoPermission;
  reason: GeoFailureReason;
  message: string;
} {
  // 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
  if (err.code === 1) {
    return {
      permission: "denied",
      reason: "permission_denied",
      message: err.message || "Geolocation permission denied",
    };
  }
  if (err.code === 3) {
    return {
      permission: "unavailable",
      reason: "timeout",
      message: err.message || "Geolocation timed out",
    };
  }
  return {
    permission: "unavailable",
    reason: "position_unavailable",
    message: err.message || "Geolocation unavailable",
  };
}

/**
 * One-shot browser geolocation. Does not persist.
 * Call from a user gesture when possible (mobile browsers).
 */
export function requestBrowserGeolocation(
  options: GeoRequestOptions = {},
  nav: Pick<Navigator, "geolocation"> | null | undefined = typeof navigator !==
    "undefined"
    ? navigator
    : null,
): Promise<GeoResult> {
  if (!isGeolocationSupported(nav)) {
    return Promise.resolve({
      ok: false,
      permission: "unsupported",
      reason: "unsupported",
      message: "Geolocation API is not available in this environment",
    });
  }

  const opts: PositionOptions = {
    enableHighAccuracy: options.enableHighAccuracy ?? true,
    timeout: options.timeoutMs ?? 10_000,
    maximumAge: options.maximumAgeMs ?? 60_000,
  };

  return new Promise((resolve) => {
    nav!.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          permission: "granted",
          fix: toGeoFix(position),
        });
      },
      (error) => {
        const mapped = mapPositionError(error);
        resolve({
          ok: false,
          permission: mapped.permission,
          reason: mapped.reason,
          message: mapped.message,
        });
      },
      opts,
    );
  });
}

/** Optional Permissions API probe (not available everywhere). */
export async function queryGeolocationPermission(
  perms: Pick<Permissions, "query"> | null | undefined = typeof navigator !==
    "undefined"
    ? navigator.permissions
    : null,
): Promise<"prompt" | "granted" | "denied" | "unknown"> {
  if (!perms?.query) return "unknown";
  try {
    const status = await perms.query({
      name: "geolocation" as PermissionName,
    });
    if (
      status.state === "granted" ||
      status.state === "denied" ||
      status.state === "prompt"
    ) {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}
