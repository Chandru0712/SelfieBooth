/**
 * ================================================================================
 * FILE: storageService.ts - INDEXEDDB STORAGE SERVICE
 * ================================================================================
 * 
 * Handles all IndexedDB operations for sessions, photos, and persistent storage
 * Phase 1 MVP Implementation (US-030, US-031, US-032)
 * 
 * STRUCTURE:
 * 1.0 DATABASE SETUP & CONSTANTS
 * 2.0 CLASS INITIALIZATION & DB SETUP
 * 3.0 DATABASE TRANSACTION HELPERS
 * 4.0 SESSION MANAGEMENT (CREATE, READ, UPDATE, DELETE)
 * 5.0 PHOTO MANAGEMENT (ADD, GET, DELETE)
 * 6.0 QUERY & FILTERING OPERATIONS
 * 7.0 STORAGE STATISTICS
 * 8.0 EXPORT
 * 
 * ================================================================================
 */

// ========== 1.0 DATABASE SETUP & CONSTANTS ==========
const DB_NAME = 'SelfieBooth';
const DB_VERSION = 1;

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  totalSize: number;
  [key: string]: any;
}

interface Photo {
  id: string;
  sessionId: string;
  blob: Blob;
  blobSize: number;
  createdAt: string;
  edited: boolean;
  [key: string]: any;
}

interface PhotoMetadata {
  id: string;
  sessionId: string;
  blobSize: number;
  createdAt: string;
  edited: boolean;
  [key: string]: any;
}

interface SessionWithPhotos {
  session: Session;
  photos: PhotoMetadata[];
}

interface StorageStats {
  sessions: number;
  photos: number;
  sizeBytes: number;
  sizeMB: string;
}

// ========== 2.0 CLASS INITIALIZATION & DB SETUP ==========
class StorageService {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('photos')) {
          const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
          photoStore.createIndex('sessionId', 'sessionId', { unique: false });
          photoStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('frames')) {
          db.createObjectStore('frames', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Create new session
   * US-030: Session Creation & Storage
   */
  async createSession(metadata: Record<string, any> = {}): Promise<Session> {
    if (!this.db) await this.init();

    const session: Session = {
      id: `session-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photoCount: 0,
      totalSize: 0,
      ...metadata,
    };

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.add(session);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(session);
    });
  }

  /**
   * Save photo to session
   */
  async savePhoto(sessionId: string, imageBlob: Blob, metadata: Record<string, any> = {}): Promise<PhotoMetadata> {
    if (!this.db) await this.init();

    const photo: Photo = {
      id: `photo-${Date.now()}`,
      sessionId,
      blob: imageBlob,
      blobSize: imageBlob.size,
      createdAt: new Date().toISOString(),
      edited: false,
      ...metadata,
    };

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['photos', 'sessions'], 'readwrite');

      // Save photo
      const photoStore = transaction.objectStore('photos');
      const photoRequest = photoStore.add(photo);

      // Update session count and size
      const sessionStore = transaction.objectStore('sessions');
      const getRequest = sessionStore.get(sessionId);

      getRequest.onsuccess = () => {
        const session = getRequest.result as Session;
        if (session) {
          session.photoCount = (session.photoCount || 0) + 1;
          session.totalSize = (session.totalSize || 0) + imageBlob.size;
          session.updatedAt = new Date().toISOString();
          sessionStore.put(session);
        }
      };

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        resolve({
          id: photo.id,
          sessionId: photo.sessionId,
          blobSize: photo.blobSize,
          createdAt: photo.createdAt,
          edited: photo.edited,
          ...metadata,
        });
      };
    });
  }

  /**
   * Get session with all photos
   */
  async getSession(sessionId: string): Promise<SessionWithPhotos> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['sessions', 'photos'], 'readonly');

      // Get session
      const sessionStore = transaction.objectStore('sessions');
      const sessionRequest = sessionStore.get(sessionId);

      // Get photos for session
      const photoStore = transaction.objectStore('photos');
      const photosIndex = photoStore.index('sessionId');
      const photosRequest = photosIndex.getAll(sessionId);

      const results: Partial<SessionWithPhotos> = {};

      sessionRequest.onsuccess = () => {
        results.session = sessionRequest.result as Session;
      };

      photosRequest.onsuccess = () => {
        const photosWithoutBlobs = (photosRequest.result as Photo[]).map((p) => ({
          id: p.id,
          sessionId: p.sessionId,
          blobSize: p.blobSize,
          createdAt: p.createdAt,
          edited: p.edited,
        } as PhotoMetadata));
        
        results.photos = photosWithoutBlobs;
      };

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(results as SessionWithPhotos);
    });
  }

  /**
   * Get all sessions (paginated)
   * US-031: Session History & Browsing
   */
  async getSessions(limit: number = 10, offset: number = 0): Promise<Session[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('createdAt');

      // Get in reverse order (newest first)
      const request = index.openCursor(null, 'prev');
      const sessions: Session[] = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (sessions.length < limit) {
            sessions.push(cursor.value as Session);
            cursor.continue();
          } else {
            transaction.oncomplete = () => resolve(sessions);
          }
        }
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        if (sessions.length < limit) {
          resolve(sessions);
        }
      };
    });
  }

  /**
   * Get photo blob
   */
  async getPhotoBlob(photoId: string): Promise<Blob | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['photos'], 'readonly');
      const store = transaction.objectStore('photos');
      const request = store.get(photoId);

      request.onsuccess = () => {
        const photo = request.result as Photo | undefined;
        resolve(photo?.blob);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete photo
   * US-032: Delete Photos & Sessions
   */
  async deletePhoto(photoId: string): Promise<boolean> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['photos', 'sessions'], 'readwrite');
      const photoStore = transaction.objectStore('photos');
      const getRequest = photoStore.get(photoId);

      getRequest.onsuccess = () => {
        const photo = getRequest.result as Photo | undefined;
        if (photo) {
          // Delete photo
          const deleteRequest = photoStore.delete(photoId);

          // Update session size
          const sessionStore = transaction.objectStore('sessions');
          const sessionGetRequest = sessionStore.get(photo.sessionId);

          sessionGetRequest.onsuccess = () => {
            const session = sessionGetRequest.result as Session | undefined;
            if (session) {
              session.photoCount = Math.max(0, (session.photoCount || 1) - 1);
              session.totalSize = Math.max(0, (session.totalSize || 0) - (photo.blobSize || 0));
              sessionStore.put(session);
            }
          };

          deleteRequest.onerror = () => reject(deleteRequest.error);
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
      transaction.oncomplete = () => resolve(true);
    });
  }

  /**
   * Clear all old sessions (before date)
   */
  async clearOldSessions(daysOld: number = 30): Promise<number> {
    if (!this.db) await this.init();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffISO = cutoffDate.toISOString();

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['sessions', 'photos'], 'readwrite');
      const sessionStore = transaction.objectStore('sessions');
      const index = sessionStore.index('createdAt');

      const range = IDBKeyRange.upperBound(cutoffISO);
      const request = index.openCursor(range);
      const deletedCount = { value: 0 };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          // Delete associated photos
          const photoStore = transaction.objectStore('photos');
          const photosIndex = photoStore.index('sessionId');
          const photosRequest = photosIndex.getAll((cursor.value as Session).id);

          photosRequest.onsuccess = () => {
            (photosRequest.result as Photo[]).forEach((photo) => {
              photoStore.delete(photo.id);
            });
            cursor.delete();
            deletedCount.value++;
            cursor.continue();
          };
        }
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(deletedCount.value);
    });
  }

  /**
   * Get storage usage stats
   */
  async getStorageStats(): Promise<StorageStats> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      
      const transaction = this.db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result as Session[];
        const totalSize = sessions.reduce((sum, s) => sum + (s.totalSize || 0), 0);
        const totalPhotos = sessions.reduce((sum, s) => sum + (s.photoCount || 0), 0);

        resolve({
          sessions: sessions.length,
          photos: totalPhotos,
          sizeBytes: totalSize,
          sizeMB: (totalSize / 1024 / 1024).toFixed(2),
        });
      };

      request.onerror = () => reject(request.error);
    });
  }
}

// ========== 8.0 EXPORT ==========
// Singleton instance
export const storageService = new StorageService();
