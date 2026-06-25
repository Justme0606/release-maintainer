import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ReactNode } from 'react'
import { ReleaseProvider, useRelease } from './ReleaseContext'
import { createMockRelease, mockFetchResponse, mockFetchError } from '../test/utils'

describe('ReleaseContext', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <ReleaseProvider>{children}</ReleaseProvider>
  )

  describe('Cache behavior', () => {
    it('should return null for uncached release', () => {
      const { result } = renderHook(() => useRelease(), { wrapper })

      expect(result.current.getRelease('release-1')).toBeNull()
    })

    it('should fetch and cache release data', async () => {
      const mockRelease = createMockRelease({ id: 'release-1' })
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockRelease) as any
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      const release = await result.current.fetchRelease('release-1')

      expect(release).toEqual(mockRelease)
      expect(result.current.getRelease('release-1')).toEqual(mockRelease)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/releases/release-1',
        { credentials: 'include' }
      )
    })

    it('should return cached release without refetching', async () => {
      const mockRelease = createMockRelease({ id: 'release-1' })
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockRelease) as any
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      // First fetch
      await result.current.fetchRelease('release-1')
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Second fetch should use cache
      const cachedRelease = await result.current.fetchRelease('release-1')
      expect(cachedRelease).toEqual(mockRelease)
      expect(global.fetch).toHaveBeenCalledTimes(1) // No additional fetch
    })

    it('should cache multiple releases independently', async () => {
      const mockRelease1 = createMockRelease({ id: 'release-1', name: 'Release 1' })
      const mockRelease2 = createMockRelease({ id: 'release-2', name: 'Release 2' })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchResponse(mockRelease1) as any)
        .mockResolvedValueOnce(mockFetchResponse(mockRelease2) as any)

      const { result } = renderHook(() => useRelease(), { wrapper })

      await result.current.fetchRelease('release-1')
      await result.current.fetchRelease('release-2')

      expect(result.current.getRelease('release-1')).toEqual(mockRelease1)
      expect(result.current.getRelease('release-2')).toEqual(mockRelease2)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('In-flight request deduplication', () => {
    it('should deduplicate concurrent requests for same release', async () => {
      const mockRelease = createMockRelease({ id: 'release-1' })

      // Simulate slow network response
      vi.mocked(global.fetch).mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve(mockFetchResponse(mockRelease) as any), 50)
        )
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      // Start three concurrent requests for the same release
      const promises = [
        result.current.fetchRelease('release-1'),
        result.current.fetchRelease('release-1'),
        result.current.fetchRelease('release-1'),
      ]

      const results = await Promise.all(promises)

      // All should return the same data
      expect(results[0]).toEqual(mockRelease)
      expect(results[1]).toEqual(mockRelease)
      expect(results[2]).toEqual(mockRelease)

      // But only one fetch should have been made
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should not deduplicate requests for different releases', async () => {
      const mockRelease1 = createMockRelease({ id: 'release-1' })
      const mockRelease2 = createMockRelease({ id: 'release-2' })

      vi.mocked(global.fetch)
        .mockImplementationOnce(() =>
          new Promise(resolve =>
            setTimeout(() => resolve(mockFetchResponse(mockRelease1) as any), 50)
          )
        )
        .mockImplementationOnce(() =>
          new Promise(resolve =>
            setTimeout(() => resolve(mockFetchResponse(mockRelease2) as any), 50)
          )
        )

      const { result } = renderHook(() => useRelease(), { wrapper })

      // Start concurrent requests for different releases
      const [result1, result2] = await Promise.all([
        result.current.fetchRelease('release-1'),
        result.current.fetchRelease('release-2'),
      ])

      expect(result1).toEqual(mockRelease1)
      expect(result2).toEqual(mockRelease2)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should clean up in-flight tracking after successful fetch', async () => {
      const mockRelease = createMockRelease({ id: 'release-1' })
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockRelease) as any
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      await result.current.fetchRelease('release-1')

      // After first fetch completes, second fetch should use cache
      await result.current.fetchRelease('release-1')

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should clean up in-flight tracking after failed fetch', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchError('Server error', 500) as any)
        .mockResolvedValueOnce(mockFetchError('Server error', 500) as any)

      const { result } = renderHook(() => useRelease(), { wrapper })

      await expect(result.current.fetchRelease('release-1')).rejects.toThrow()
      await expect(result.current.fetchRelease('release-1')).rejects.toThrow()

      // Should make two separate requests since both failed
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Cache invalidation', () => {
    it('should remove release from cache', async () => {
      const mockRelease = createMockRelease({ id: 'release-1' })
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockRelease) as any
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      await result.current.fetchRelease('release-1')
      expect(result.current.getRelease('release-1')).toEqual(mockRelease)

      result.current.invalidateRelease('release-1')

      expect(result.current.getRelease('release-1')).toBeNull()
    })

    it('should force refetch after invalidation', async () => {
      const mockRelease1 = createMockRelease({ id: 'release-1', name: 'Old' })
      const mockRelease2 = createMockRelease({ id: 'release-1', name: 'New' })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchResponse(mockRelease1) as any)
        .mockResolvedValueOnce(mockFetchResponse(mockRelease2) as any)

      const { result } = renderHook(() => useRelease(), { wrapper })

      // First fetch
      await result.current.fetchRelease('release-1')
      expect(result.current.getRelease('release-1')?.name).toBe('Old')

      // Invalidate
      result.current.invalidateRelease('release-1')

      // Second fetch should make a new request
      await result.current.fetchRelease('release-1')
      expect(result.current.getRelease('release-1')?.name).toBe('New')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should not affect other cached releases', async () => {
      const mockRelease1 = createMockRelease({ id: 'release-1' })
      const mockRelease2 = createMockRelease({ id: 'release-2' })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchResponse(mockRelease1) as any)
        .mockResolvedValueOnce(mockFetchResponse(mockRelease2) as any)

      const { result } = renderHook(() => useRelease(), { wrapper })

      await result.current.fetchRelease('release-1')
      await result.current.fetchRelease('release-2')

      // Invalidate only release-1
      result.current.invalidateRelease('release-1')

      expect(result.current.getRelease('release-1')).toBeNull()
      expect(result.current.getRelease('release-2')).toEqual(mockRelease2)
    })
  })

  describe('Error handling', () => {
    it('should throw error when fetch fails', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not found', 404) as any
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      await expect(
        result.current.fetchRelease('nonexistent')
      ).rejects.toThrow('Failed to fetch release: 404')
    })

    it('should not cache failed fetches', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchError('Server error', 500) as any)
        .mockResolvedValueOnce(
          mockFetchResponse(createMockRelease({ id: 'release-1' })) as any
        )

      const { result } = renderHook(() => useRelease(), { wrapper })

      // First attempt fails
      await expect(result.current.fetchRelease('release-1')).rejects.toThrow()
      expect(result.current.getRelease('release-1')).toBeNull()

      // Second attempt succeeds
      const release = await result.current.fetchRelease('release-1')
      expect(release).toBeDefined()
      expect(release.id).toBe('release-1')

      // Now it should be cached
      await waitFor(() => {
        expect(result.current.getRelease('release-1')).toBeTruthy()
      })
    })

    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() => useRelease(), { wrapper })

      await expect(
        result.current.fetchRelease('release-1')
      ).rejects.toThrow('Network error')
    })
  })
})
