import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminB2bAgenda from './b2b-agenda';
import { isoDay } from './b2b-agenda-calendar';

const state = vi.hoisted(() => ({
  lang: 'ar' as 'ar' | 'en',
  loading: false,
  error: false,
  empty: false,
  view: true,
  many: false,
}));
vi.mock('@/hooks/use-language', () => ({ useLanguage: () => ({ lang: state.lang, t: (ar: string, en: string) => state.lang === 'ar' ? ar : en }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/permissions', () => ({ hasPermission: (_user: unknown, _module: string, action: string) => state.view || action !== 'view' ? state.view : false }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@workspace/api-client-react', () => ({
  useGetAdminMe: () => ({ data: { id: 1 }, isLoading: false }),
  getAdminGetB2bAnnualAgendaQueryKey: () => ['agenda'],
  useAdminGetB2bAnnualAgenda: ({ year }: { year: number }) => {
    const date = isoDay(year, new Date().getMonth(), new Date().getDate());
    return { data: state.empty ? [] : Array.from({ length: state.many ? 8 : 1 }, (_, index) => ({
      id: state.many ? index + 1 : 17, title: `Trade fair${state.many ? ` ${index + 1}` : ''}`, type: 'exhibition',
      startDate: date, endDate: date, recurrence: 'none', note: 'Hall B', source: 'custom', estimated: false,
    })), isLoading: state.loading, isError: state.error, refetch: vi.fn() };
  },
  useAdminCreateB2bAgendaEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminUpdateB2bAgendaEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminDeleteB2bAgendaEvent: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('B2B agenda frontend', () => {
  it.each(['ar', 'en'] as const)('renders annual and monthly calendars plus day and upcoming exhibitions in %s', lang => {
    state.lang = lang; state.loading = false; state.error = false; state.empty = false; state.view = true;
    const html = renderToStaticMarkup(<AdminB2bAgenda />);
    expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(html).toContain('data-testid="grid-agenda-year"');
    expect(html).toContain('data-testid="grid-agenda-month"');
    expect(html.indexOf('aria-label="Upcoming events"') >= 0 || html.indexOf('aria-label="الأحداث القادمة"') >= 0).toBe(true);
    const featuredStart = html.indexOf('class="ag-featured"');
    expect(featuredStart).toBeGreaterThan(html.indexOf('class="ag-toolbar"'));
    expect(featuredStart).toBeLessThan(html.indexOf('data-testid="grid-agenda-year"'));
    expect(html.indexOf('data-testid="grid-agenda-year"')).toBeLessThan(html.indexOf('data-testid="grid-agenda-month"'));
    expect(html).toContain('data-testid="button-agenda-month-1"');
    expect(html).toContain('data-testid="text-agenda-selected-day"');
    expect(html).toContain('data-testid="button-previous-agenda-month"');
    expect(html).toContain('data-testid="button-next-agenda-year"');
    expect(html).toContain('Trade fair');
    expect(html).toContain('Hall B');
    expect(html).toContain(lang === 'ar' ? 'المعارض القادمة' : 'Upcoming exhibitions');
    expect(html).toContain('data-testid="button-edit-agenda-17"');
    expect(html).toContain('data-testid="button-delete-agenda-17"');
  });

  it('renders loading, error and empty states independently', () => {
    state.view = true; state.lang = 'en';
    state.loading = true; state.error = false;
    expect(renderToStaticMarkup(<AdminB2bAgenda />)).toContain('Loading calendar');
    state.loading = false; state.error = true;
    expect(renderToStaticMarkup(<AdminB2bAgenda />)).toContain('button-retry-agenda');
    state.error = false; state.empty = true;
    expect(renderToStaticMarkup(<AdminB2bAgenda />)).toContain('No upcoming exhibitions');
    state.empty = false;
  });

  it('keeps all upcoming records in both featured lists instead of truncating them', () => {
    state.lang = 'en'; state.view = true; state.loading = false; state.error = false; state.empty = false; state.many = true;
    const html = renderToStaticMarkup(<AdminB2bAgenda />);
    expect(html).toContain('data-testid="row-agenda-upcoming-8"');
    expect(html).toContain('data-testid="row-agenda-exhibition-8"');
    expect(html.indexOf('class="ag-featured"')).toBeLessThan(html.indexOf('data-testid="grid-agenda-year"'));
    state.many = false;
  });

  it('respects view permission', () => {
    state.view = false;
    const html = renderToStaticMarkup(<AdminB2bAgenda />);
    expect(html).toContain('do not have access');
    expect(html).not.toContain('grid-agenda-month');
    state.view = true;
  });
});