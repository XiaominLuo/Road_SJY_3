import { CustomLayer } from '../types';

const DB_NAME = 'GeoVisionDB';
const STORE_NAME = 'layers';
const DB_VERSION = 1;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// Helper to construct the virtual directory path for a user
const getUserDataPath = (userId: string) => `users_data/${userId}/`;

/**
 * Simulates checking/creating a user directory.
 * In IndexedDB, this acts as a verification step before operations.
 */
export const ensureUserDirectory = async (userId: string) => {
    await initDB();
    const path = getUserDataPath(userId);
    console.log(`[Storage] Verified user directory: ${path}`);
    return path;
};

/**
 * Load layers strictly from the user's virtual directory.
 * Uses IDBKeyRange to scan only keys starting with "users_data/{userId}/".
 */
export const loadLayersFromIndexedDB = async (userId: string): Promise<CustomLayer[]> => {
  if (!userId) return [];
  
  const db = await initDB();
  const userDir = getUserDataPath(userId);
  
  // Define range: Start at userDir, End at userDir + high char
  const range = IDBKeyRange.bound(userDir, userDir + '\uffff');

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll(range);
    
    request.onsuccess = () => {
        resolve(request.result || []);
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * Save layers to the user's virtual directory.
 * 1. Checks directory existence.
 * 2. Clears existing data in that directory (range delete).
 * 3. Writes new data to that directory.
 */
export const saveLayersToIndexedDB = async (userId: string, layers: CustomLayer[]) => {
  if (!userId) return;

  await ensureUserDirectory(userId);
  
  const db = await initDB();
  const userDir = getUserDataPath(userId);

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // 1. Clear "Directory" (Delete all keys in user's range)
    const range = IDBKeyRange.bound(userDir, userDir + '\uffff');
    const deleteReq = store.delete(range);

    deleteReq.onsuccess = () => {
        // 2. Write File
        let processed = 0;
        if (layers.length === 0) {
            resolve();
            return;
        }

        layers.forEach(layer => {
            // Note: Layer IDs should already have been formatted by App.tsx to include the path.
            // If not, we could enforce it here, but it would desync with React State.
            // We assume App.tsx follows the protocol.
            
            // Double check to ensure we don't accidentally write outside the dir due to bad ID
            if (!layer.id.startsWith(userDir)) {
                console.warn(`Layer ID ${layer.id} does not match user directory ${userDir}. Skipping to prevent leakage.`);
                processed++;
                if (processed === layers.length) resolve();
                return;
            }

            const putReq = store.put(layer);
            
            putReq.onsuccess = () => {
                processed++;
                if (processed === layers.length) resolve();
            };
            putReq.onerror = () => {
                 console.error("Failed to put layer", putReq.error);
                 processed++;
                 if (processed === layers.length) resolve();
            };
        });
    };

    deleteReq.onerror = () => reject(deleteReq.error);
  });
};

export const clearLayersFromIndexedDB = async () => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};