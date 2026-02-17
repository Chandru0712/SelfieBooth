/**
 * ================================================================================
 * FILE: useSession.ts - SESSION STATE MANAGEMENT HOOK
 * ================================================================================
 * 
 * React hook for managing session state, storage, and image history
 * Phase 1 MVP Implementation (US-030, US-031)
 * 
 * STRUCTURE:
 * 1.0 IMPORTS & EXPORTS
 * 2.0 STATE & REF MANAGEMENT
 * 3.0 STORAGE INITIALIZATION (ON MOUNT)
 * 4.0 STORAGE STATISTICS & MONITORING
 * 5.0 SESSION MANAGEMENT (CREATE, LOAD, SAVE)
 * 6.0 IMAGE MANAGEMENT (ADD, GET, DELETE)
 * 7.0 SESSION PLAYBACK & EXPORT
 * 8.0 HOOK RETURN
 * 
 * ================================================================================
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { storageService } from '../services/storageService';

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  totalSize: number;
  [key: string]: any;
}

interface StorageStats {
  sessions: number;
  photos: number;
  sizeBytes: number;
  sizeMB: string;
}

interface UseSessionReturn {
  currentSession: Session | null;
  sessionHistory: Session[];
  isLoading: boolean;
  error: string | null;
  storageStats: StorageStats | null;
  createSession: (metadata?: Record<string, any>) => Promise<Session>;
  savePhoto: (imageBlob: Blob, metadata?: Record<string, any>) => Promise<any>;
  loadHistory: (limit?: number, offset?: number) => Promise<Session[]>;
  deletePhoto: (photoId: string) => Promise<boolean>;
  endSession: () => void;
  updateStorageStats: () => Promise<void>;
}

// ========== 1.0 & 2.0 COMPONENT IMPLEMENTATION ==========
export const useSession = (): UseSessionReturn => {
  // ========== STATE & REFS ==========
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [sessionHistory, setSessionHistory] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);

  // Ref to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // ========== 3.0 STORAGE INITIALIZATION (ON MOUNT) ==========
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
      } catch (err: any) {
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
  const createSession = useCallback(async (metadata: Record<string, any> = {}): Promise<Session> => {
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
    } catch (err: any) {
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
    async (imageBlob: Blob, metadata: Record<string, any> = {}): Promise<any> => {
      try {
        if (!currentSession) {
          throw new Error('No active session. Create one first.');
        }

        setError(null);

        const photo = await storageService.savePhoto(currentSession.id, imageBlob, metadata);

        if (isMountedRef.current) {
          // Update session photo count
          setCurrentSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              photoCount: (prev.photoCount || 0) + 1,
              totalSize: (prev.totalSize || 0) + imageBlob.size,
            };
          });

          // Update storage stats
          await updateStorageStats();
        }

        return photo;
      } catch (err: any) {
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
  const loadHistory = useCallback(async (limit: number = 10, offset: number = 0): Promise<Session[]> => {
    try {
      setIsLoading(true);
      setError(null);

      const sessions = await storageService.getSessions(limit, offset);

      if (isMountedRef.current) {
        setSessionHistory(sessions);
      }

      return sessions;
    } catch (err: any) {
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
  const deletePhoto = useCallback(async (photoId: string): Promise<boolean> => {
    try {
      setError(null);

      await storageService.deletePhoto(photoId);

      if (isMountedRef.current) {
        if (currentSession) {
          setCurrentSession((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              photoCount: Math.max(0, (prev.photoCount || 1) - 1),
            };
          });
        }

        // Update storage stats
        await updateStorageStats();
      }

      return true;
    } catch (err: any) {
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

  // ========== 4.0 STORAGE STATISTICS & MONITORING ==========
  /**
   * Update storage stats
   */
  const updateStorageStats = useCallback(async () => {
    try {
      const stats = await storageService.getStorageStats();
      if (isMountedRef.current) {
        setStorageStats(stats);
      }
    } catch (err: any) {
      console.warn('Failed to update storage stats:', err);
    }
  }, []);

  // ========== 8.0 HOOK RETURN ==========
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
