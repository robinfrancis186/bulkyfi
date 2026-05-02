const DB_NAME = "bulkyfi-local-assets";
const LEGACY_DB_NAME = "easycertify-local-assets";
const DB_VERSION = 2;
const TEMPLATE_STORE = "templates";
const FONT_STORE = "fonts";

const openAssetsDb = (name = DB_NAME) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
        db.createObjectStore(TEMPLATE_STORE);
      }
      if (!db.objectStoreNames.contains(FONT_STORE)) {
        db.createObjectStore(FONT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const saveTemplateData = async (key: string, dataUrl: string) => {
  const db = await openAssetsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, "readwrite");
    tx.objectStore(TEMPLATE_STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const loadTemplateData = async (key: string) => {
  const db = await openAssetsDb();
  const value = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, "readonly");
    const request = tx.objectStore(TEMPLATE_STORE).get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (value) return value;

  const legacyDb = await openAssetsDb(LEGACY_DB_NAME);
  const legacyValue = await new Promise<string | undefined>((resolve, reject) => {
    const tx = legacyDb.transaction(TEMPLATE_STORE, "readonly");
    const request = tx.objectStore(TEMPLATE_STORE).get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  legacyDb.close();
  return legacyValue;
};

export const saveFontData = async (key: string, dataUrl: string) => {
  const db = await openAssetsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FONT_STORE, "readwrite");
    tx.objectStore(FONT_STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const loadFontData = async (key: string) => {
  const db = await openAssetsDb();
  const value = await new Promise<string | undefined>((resolve, reject) => {
    const tx = db.transaction(FONT_STORE, "readonly");
    const request = tx.objectStore(FONT_STORE).get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
};
