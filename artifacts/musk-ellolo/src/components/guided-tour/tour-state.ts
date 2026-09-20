export const ADMIN_TOUR_STORAGE_KEY = 'musk-ellolo-tour-admin-v1';
export const OWNER_TOUR_STORAGE_KEY = 'musk-ellolo-tour-owner-v1';

export type TourStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isTourComplete(storage: TourStorage, key: string) {
  return storage.getItem(key) === 'complete';
}

export function completeTour(storage: TourStorage, key: string) {
  storage.setItem(key, 'complete');
}

export function resetTour(storage: TourStorage, key: string) {
  storage.removeItem(key);
}