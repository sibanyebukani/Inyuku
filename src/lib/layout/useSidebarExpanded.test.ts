// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarExpanded } from './useSidebarExpanded';

const KEY = 'inyuku_merchant_sidebar_expanded';

describe('useSidebarExpanded', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to expanded with no stored preference', () => {
    const { result } = renderHook(() => useSidebarExpanded());
    expect(result.current.expanded).toBe(true);
  });

  it('reads a stored collapsed preference on mount', () => {
    localStorage.setItem(KEY, 'false');
    const { result } = renderHook(() => useSidebarExpanded());
    expect(result.current.expanded).toBe(false);
  });

  it('toggle() flips state and persists across remount', () => {
    const { result, rerender } = renderHook(() => useSidebarExpanded());
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');

    rerender();
    expect(result.current.expanded).toBe(false);
  });
});
