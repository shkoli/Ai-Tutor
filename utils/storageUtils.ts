
import { TestResult } from '../types';

const STORAGE_KEY = 'heykoli_history_v1';
const USED_QUESTIONS_KEY = 'heykoli_used_questions_v1';
const AUDIO_DB_NAME = 'heykoli_audio_db';
const AUDIO_STORE_NAME = 'recordings';

// --- LocalStorage Logic for Metadata ---

export function getHistory(): TestResult[] {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error("Failed to load history", e);
    return [];
  }
}

export function saveTestResult(result: TestResult): TestResult[] {
  try {
    const currentHistory = getHistory();
    // Add new result to the beginning
    const newHistory = [result, ...currentHistory];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    return newHistory;
  } catch (e) {
    console.error("Failed to save history", e);
    return [];
  }
}

export function deleteTestResult(id: string): TestResult[] {
  try {
    const currentHistory = getHistory();
    
    // Find item to get audio ID before deleting
    const item = currentHistory.find(i => i.id === id);
    if (item && item.audioStorageId) {
      deleteAudioFromDB(item.audioStorageId);
    }

    const newHistory = currentHistory.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
    return newHistory;
  } catch (e) {
    console.error("Failed to delete history item", e);
    return [];
  }
}

export function clearHistory(): void {
  try {
    // Clear all audio
    const history = getHistory();
    history.forEach(item => {
      if (item.audioStorageId) {
        deleteAudioFromDB(item.audioStorageId);
      }
    });
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear history", e);
  }
}

export function getUsedCueCardIds(): string[] {
  try {
    const json = localStorage.getItem(USED_QUESTIONS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    return [];
  }
}

export function markCueCardAsUsed(id: string): void {
  try {
    const used = getUsedCueCardIds();
    if (!used.includes(id)) {
      const newUsed = [...used, id];
      localStorage.setItem(USED_QUESTIONS_KEY, JSON.stringify(newUsed));
    }
  } catch (e) {
    console.error("Failed to mark cue card as used", e);
  }
}

export function clearUsedQuestions(): void {
  localStorage.removeItem(USED_QUESTIONS_KEY);
}

// --- IndexedDB Logic for Audio Storage ---

const openAudioDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export async function saveAudioToDB(audioBlob: Blob): Promise<string> {
  const db = await openAudioDB();
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const request = store.put(audioBlob, id);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function getAudioFromDB(id: string): Promise<Blob | null> {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, 'readonly');
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAudioFromDB(id: string): Promise<void> {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
