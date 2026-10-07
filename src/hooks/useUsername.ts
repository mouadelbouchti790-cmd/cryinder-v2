import { useState, useEffect, useCallback, useRef } from 'react';
import {
  identify,
  setUsername as pbSetUsername,
  updateUsername as pbUpdateUsername,
  clearSession,
  cooldownDaysRemaining,
  type User as CryinderUser,
} from '../services/pocketbase';

export interface UsernameState {
  user: CryinderUser | null;
  loading: boolean;
  needsOnboarding: boolean;
  cooldownDaysLeft: number;
  error: string | null;
  errorStatus: number | null;
  setUsername: (username: string) => Promise<{ success: boolean; error?: string }>;
  updateUsername: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
  retry: () => void;
}

export function useUsername(walletAddress: string | null): UsernameState {
  // ✅ All hooks called unconditionally at the top
  const [user, setUser] = useState<CryinderUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const generationRef = useRef(0);

  const loadUser = useCallback(async () => {
    if (!walletAddress) {
      setUser(null);
      setLoading(false);
      setError(null);
      setErrorStatus(null);
      setNeedsOnboarding(false);
      return;
    }

    const gen = ++generationRef.current;
    setLoading(true);
    setError(null);
    setErrorStatus(null);

    try {
      const result = await identify(walletAddress);
      if (generationRef.current !== gen) return;
      setUser(result.user);
      setNeedsOnboarding(!result.user.usernameSet);
    } catch (e: any) {
      if (generationRef.current !== gen) return;
      setError(e.message || 'Failed to load user profile.');
      // HTTP status when available — App uses 403 to detect a failed human
      // verification and route back to a fresh captcha (all verification
      // failures, local and server-side, are 403).
      setErrorStatus(typeof e?.status === 'number' ? e.status : null);
      clearSession();
    } finally {
      if (generationRef.current === gen) {
        setLoading(false);
      }
    }
  }, [walletAddress]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const cooldownDaysLeft = user?.usernameSet
    ? cooldownDaysRemaining(user.usernameChangedAt)
    : 0;

  const handleSetUsername = useCallback(
    async (username: string) => {
      if (!user) return { success: false, error: 'No user found. Connect wallet first.' };

      try {
        const updatedUser = await pbSetUsername(user.id, username);
        setUser(updatedUser);
        setNeedsOnboarding(false);
        return { success: true, user: updatedUser };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    [user],
  );

  const handleUpdateUsername = useCallback(
    async (newUsername: string) => {
      if (!user) return { success: false, error: 'No user found. Connect wallet first.' };

      try {
        const updatedUser = await pbUpdateUsername(user.id, newUsername);
        setUser(updatedUser);
        return { success: true, user: updatedUser };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
    [user],
  );

  return {
    user,
    loading,
    needsOnboarding,
    cooldownDaysLeft,
    error,
    errorStatus,
    setUsername: handleSetUsername,
    updateUsername: handleUpdateUsername,
    retry: loadUser,
  };
}
