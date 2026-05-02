const DB_NAME = "bulkyfi-local-assets";
const LEGACY_DB_NAME = "easycertify-local-assets";
const DB_VERSION = 1;
const STORE_NAME = "templates";

const openAssetsDb = (name = DB_NAME) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const saveTemplateData = async (key: string, dataUrl: string) => {
  const db = await openAssetsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const loadTemplateData = async (key: string) => {
  const db = await openAssetsDb();
  const value = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (value) return value;

  const legacyDb = await openAssetsDb(LEGACY_DB_NAME);
  const legacyValue = await new Promise<string | undefined>((resolve, reject) => {
    const tx = legacyDb.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  legacyDb.close();
  return legacyValue;
};
