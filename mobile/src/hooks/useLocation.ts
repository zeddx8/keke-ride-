import { useState, useEffect, useCallback } from 'react';
import { Geolocation, type Position } from '@capacitor/geolocation';

export const useLocation = (watch = false) => {
  const [location, setLocation] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensurePermission = useCallback(async () => {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        const requested = await Geolocation.requestPermissions();
        if (requested.location !== 'granted') {
          throw new Error('Location permission is required.');
        }
      }
  }, []);

  const readCurrentLocation = useCallback(async () => {
    await ensurePermission();
    return Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
      });
  }, [ensurePermission]);

  const getCurrentLocation = useCallback(async () => {
    try {
      const position = await readCurrentLocation();
      setLocation(position);
      setError(null);
      return position;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
      return null;
    }
  }, [readCurrentLocation]);

  useEffect(() => {
    let isCancelled = false;

    void readCurrentLocation()
      .then((position) => {
        if (!isCancelled) {
          setLocation(position);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to get location');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [readCurrentLocation]);

  useEffect(() => {
    if (!watch) return;

    let watchId: string | null = null;
    let isCancelled = false;

    const startWatching = async () => {
      try {
        await ensurePermission();

        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true },
          (position, watchError) => {
            if (watchError) {
              setError(watchError.message || 'Failed to track your location');
              return;
            }
            if (position) {
              setLocation(position);
              setError(null);
            }
          },
        );

        if (isCancelled) {
          await Geolocation.clearWatch({ id });
        } else {
          watchId = id;
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to track your location');
        }
      }
    };

    void startWatching();

    return () => {
      isCancelled = true;
      if (watchId) void Geolocation.clearWatch({ id: watchId });
    };
  }, [ensurePermission, watch]);

  return { location, error, getCurrentLocation };
};