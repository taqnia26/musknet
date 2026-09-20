import { describe, expect, it } from 'vitest';
import { getAdminTourSteps, ownerTourSteps } from './tour-definitions';
import { completeTour, isTourComplete, resetTour } from './tour-state';
import { navStructure } from '@/components/admin/admin-layout';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

describe('guided tour definitions', () => {
  it('provides Arabic and English copy and stable targets for every owner step', () => {
    expect(ownerTourSteps.length).toBeGreaterThan(3);
    ownerTourSteps.forEach((step) => {
      expect(step.id).toBeTruthy();
      expect(step.target).toBeTruthy();
      expect(step.title.ar).toBeTruthy();
      expect(step.title.en).toBeTruthy();
      expect(step.description.ar).toBeTruthy();
      expect(step.description.en).toBeTruthy();
      expect(step.route).toBeTruthy();
    });
  });

  it('filters admin navigation steps by permissions', () => {
    const restricted = getAdminTourSteps(navStructure, { isSuperAdmin: false, permissions: ['customers:view'] });
    expect(restricted.some((step) => step.title.en === 'Individual Customers')).toBe(true);
    expect(restricted.some((step) => step.title.en === 'Inventory Overview')).toBe(false);
    expect(restricted.some((step) => step.title.en === 'Owner Credentials')).toBe(false);
    const superAdmin = getAdminTourSteps(navStructure, { isSuperAdmin: true, permissions: [] });
    expect(superAdmin.some((step) => step.title.en === 'Owner Credentials')).toBe(true);
  });

  it('persists completion and allows an explicit restart reset', () => {
    const storage = memoryStorage();
    expect(isTourComplete(storage, 'tour')).toBe(false);
    completeTour(storage, 'tour');
    expect(isTourComplete(storage, 'tour')).toBe(true);
    resetTour(storage, 'tour');
    expect(isTourComplete(storage, 'tour')).toBe(false);
  });
});
