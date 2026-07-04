import type { AppSettings, QuizAttempt, QuizSet } from '../types';

const DB_NAME = 'news-context-quiz-db';
const DB_VERSION = 1;
const QUIZ_STORE = 'quizSets';
const ATTEMPT_STORE = 'attempts';
const SETTINGS_STORE = 'settings';

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUIZ_STORE)) db.createObjectStore(QUIZ_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ATTEMPT_STORE)) db.createObjectStore(ATTEMPT_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
  });

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function withStore<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await callback(store);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export const getQuizSets = () =>
  withStore(QUIZ_STORE, 'readonly', async (store) => {
    const items = (await requestAsPromise(store.getAll())) as QuizSet[];
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

export const putQuizSet = (quizSet: QuizSet) =>
  withStore(QUIZ_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.put(quizSet));
  });

export const deleteQuizSet = (id: string) =>
  withStore(QUIZ_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.delete(id));
  });

export const getAttempts = () =>
  withStore(ATTEMPT_STORE, 'readonly', async (store) => {
    const items = (await requestAsPromise(store.getAll())) as QuizAttempt[];
    return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  });

export const putAttempt = (attempt: QuizAttempt) =>
  withStore(ATTEMPT_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.put(attempt));
  });

export const deleteAttempt = (id: string) =>
  withStore(ATTEMPT_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.delete(id));
  });

export const getSettings = () =>
  withStore(SETTINGS_STORE, 'readonly', async (store) => {
    const result = await requestAsPromise(store.get('app')) as { key: string; value: AppSettings } | undefined;
    return result?.value;
  });

export const putSettings = (settings: AppSettings) =>
  withStore(SETTINGS_STORE, 'readwrite', async (store) => {
    await requestAsPromise(store.put({ key: 'app', value: settings }));
  });

export const exportAllData = async () => {
  const [quizSets, attempts, settings] = await Promise.all([getQuizSets(), getAttempts(), getSettings()]);
  return {
    exportedAt: new Date().toISOString(),
    app: 'News Context Quiz',
    schemaVersion: 1,
    quizSets,
    attempts,
    settings,
  };
};

export const importAllData = async (data: unknown) => {
  const payload = data as { quizSets?: QuizSet[]; attempts?: QuizAttempt[]; settings?: AppSettings };
  if (!Array.isArray(payload.quizSets) || !Array.isArray(payload.attempts)) {
    throw new Error('バックアップ形式が正しくありません。');
  }
  await Promise.all(payload.quizSets.map(putQuizSet));
  await Promise.all(payload.attempts.map(putAttempt));
  if (payload.settings) await putSettings(payload.settings);
};
