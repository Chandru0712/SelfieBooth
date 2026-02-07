/**
 * Storage Service - IndexedDB operations for sessions and photos
 * Phase 1 MVP Implementation (US-030, US-031, US-032)
 */

const DB_NAME = 'SelfieBooth';
const DB_VERSION = 1;

class StorageService {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

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
  async createSession(metadata = {}) {
    if (!this.db) await this.init();

    const session = {
      id: `session-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photoCount: 0,
      totalSize: 0,
      ...metadata,
    };

    return new Promise((resolve, reject) => {
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
  async savePhoto(sessionId, imageBlob, metadata = {}) {
    if (!this.db) await this.init();

    const photo = {
      id: `photo-${Date.now()}`,
      sessionId,
      blob: imageBlob,
      blobSize: imageBlob.size,
      createdAt: new Date().toISOString(),
      edited: false,
      ...metadata,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos', 'sessions'], 'readwrite');

      // Save photo
      const photoStore = transaction.objectStore('photos');
      const photoRequest = photoStore.add(photo);

      // Update session count and size
      const sessionStore = transaction.objectStore('sessions');
      const getRequest = sessionStore.get(sessionId);

      getRequest.onsuccess = () => {
        const session = getRequest.result;
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
          ...photo,
          blob: undefined, // Don't return full blob
        });
      };
    });
  }

  /**
   * Get session with all photos
   */
  async getSession(sessionId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions', 'photos'], 'readonly');

      // Get session
      const sessionStore = transaction.objectStore('sessions');
      const sessionRequest = sessionStore.get(sessionId);

      // Get photos for session
      const photoStore = transaction.objectStore('photos');
      const photosIndex = photoStore.index('sessionId');
      const photosRequest = photosIndex.getAll(sessionId);

      const results = {};

      sessionRequest.onsuccess = () => {
        results.session = sessionRequest.result;
      };

      photosRequest.onsuccess = () => {
        results.photos = photosRequest.result.map((p) => ({
          ...p,
          blob: undefined, // Exclude blob from listing
        }));
      };

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(results);
    });
  }

  /**
   * Get all sessions (paginated)
   * US-031: Session History & Browsing
   */
  async getSessions(limit = 10, offset = 0) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('createdAt');

      // Get in reverse order (newest first)
      const request = index.openCursor(null, 'prev');
      const sessions = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (sessions.length < limit) {
            sessions.push(cursor.value);
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
  async getPhotoBlob(photoId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos'], 'readonly');
      const store = transaction.objectStore('photos');
      const request = store.get(photoId);

      request.onsuccess = () => {
        resolve(request.result?.blob);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete photo
   * US-032: Delete Photos & Sessions
   */
  async deletePhoto(photoId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['photos', 'sessions'], 'readwrite');
      const photoStore = transaction.objectStore('photos');
      const getRequest = photoStore.get(photoId);

      getRequest.onsuccess = () => {
        const photo = getRequest.result;
        if (photo) {
          // Delete photo
          const deleteRequest = photoStore.delete(photoId);

          // Update session size
          const sessionStore = transaction.objectStore('sessions');
          const sessionGetRequest = sessionStore.get(photo.sessionId);

          sessionGetRequest.onsuccess = () => {
            const session = sessionGetRequest.result;
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
  async clearOldSessions(daysOld = 30) {
    if (!this.db) await this.init();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffISO = cutoffDate.toISOString();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions', 'photos'], 'readwrite');
      const sessionStore = transaction.objectStore('sessions');
      const index = sessionStore.index('createdAt');

      const range = IDBKeyRange.upperBound(cutoffISO);
      const request = index.openCursor(range);
      const deletedCount = { value: 0 };

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          // Delete associated photos
          const photoStore = transaction.objectStore('photos');
          const photosIndex = photoStore.index('sessionId');
          const photosRequest = photosIndex.getAll(cursor.value.id);

          photosRequest.onsuccess = () => {
            photosRequest.result.forEach((photo) => {
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
  async getStorageStats() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result;
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

// Singleton instance
export const storageService = new StorageService();
