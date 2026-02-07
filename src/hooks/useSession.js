/**
 * useSession Hook - React hook for session state management
 * Phase 1 MVP Implementation (US-030, US-031)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService';

export const useSession = () => {
  // State
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [storageStats, setStorageStats] = useState(null);

  // Ref to prevent state updates after unmount
  const isMountedRef = useRef(true);

  /**
   * Initialize storage on mount
   */
  useEffect(() => {
    const init = async () => {
      try {
        await storageService.init();
        if (isMountedRef.current) {
          await updateStorageStats();
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(`Storage initialization failed: ${err.message}`);
        }
      }
    };

    init();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Create new session
   * US-030: Session Creation
   */
  const createSession = useCallback(async (metadata = {}) => {
    try {
      setIsLoading(true);
      setError(null);

      const session = await storageService.createSession({
        frameCategory: metadata.category || 'none',
        ...metadata,
      });

      if (isMountedRef.current) {
        setCurrentSession(session);
      }

      return session;
    } catch (err) {
      const errorMsg = `Failed to create session: ${err.message}`;
      if (isMountedRef.current) {
        setError(errorMsg);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Save photo to current session
   */
  const savePhoto = useCallback(
    async (imageBlob, metadata = {}) => {
      try {
        if (!currentSession) {
          throw new Error('No active session. Create one first.');
        }

        setError(null);

        const photo = await storageService.savePhoto(currentSession.id, imageBlob, metadata);

        if (isMountedRef.current) {
          // Update session photo count
          setCurrentSession((prev) => ({
            ...prev,
            photoCount: (prev.photoCount || 0) + 1,
            totalSize: (prev.totalSize || 0) + imageBlob.size,
          }));

          // Update storage stats
          await updateStorageStats();
        }

        return photo;
      } catch (err) {
        const errorMsg = `Failed to save photo: ${err.message}`;
        if (isMountedRef.current) {
          setError(errorMsg);
        }
        throw err;
      }
    },
    [currentSession]
  );

  /**
   * Load session history
   * US-031: Session History
   */
  const loadHistory = useCallback(async (limit = 10, offset = 0) => {
    try {
      setIsLoading(true);
      setError(null);

      const sessions = await storageService.getSessions(limit, offset);

      if (isMountedRef.current) {
        setSessionHistory(sessions);
      }

      return sessions;
    } catch (err) {
      const errorMsg = `Failed to load history: ${err.message}`;
      if (isMountedRef.current) {
        setError(errorMsg);
      }
      throw err;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Delete photo
   * US-032: Delete Photos
   */
  const deletePhoto = useCallback(async (photoId) => {
    try {
      setError(null);

      await storageService.deletePhoto(photoId);

      if (isMountedRef.current) {
        if (currentSession) {
          setCurrentSession((prev) => ({
            ...prev,
            photoCount: Math.max(0, (prev.photoCount || 1) - 1),
          }));
        }

        // Update storage stats
        await updateStorageStats();
      }

      return true;
    } catch (err) {
      const errorMsg = `Failed to delete photo: ${err.message}`;
      if (isMountedRef.current) {
        setError(errorMsg);
      }
      throw err;
    }
  }, [currentSession]);

  /**
   * End current session
   */
  const endSession = useCallback(() => {
    if (isMountedRef.current) {
      setCurrentSession(null);
    }
  }, []);

  /**
   * Update storage stats
   */
  const updateStorageStats = useCallback(async () => {
    try {
      const stats = await storageService.getStorageStats();
      if (isMountedRef.current) {
        setStorageStats(stats);
      }
    } catch (err) {
      console.warn('Failed to update storage stats:', err);
    }
  }, []);

  return {
    // State
    currentSession,
    sessionHistory,
    isLoading,
    error,
    storageStats,

    // Methods
    createSession,
    savePhoto,
    loadHistory,
    deletePhoto,
    endSession,
    updateStorageStats,
  };
};
