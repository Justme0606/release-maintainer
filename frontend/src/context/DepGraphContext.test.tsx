import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ReactNode } from 'react'
import { DepGraphProvider, useDepGraph, FullGraph } from './DepGraphContext'
import { mockFetchResponse, mockFetchError } from '../test/utils'

function createMockGraph(overrides?: Partial<FullGraph>): FullGraph {
  return {
    nodes: [
      { name: 'pkg-a', status: 'ready', depth: 0 },
      { name: 'pkg-b', status: 'waiting', depth: 1 },
      { name: 'pkg-c', status: 'blocked', depth: 2 },
    ],
    edges: [
      { from: 'pkg-a', to: 'pkg-b' },
      { from: 'pkg-b', to: 'pkg-c' },
    ],
    ...overrides,
  }
}

describe('DepGraphContext', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <DepGraphProvider>{children}</DepGraphProvider>
  )

  describe('Graph caching', () => {
    it('should return null for uncached graph', () => {
      const { result } = renderHook(() => useDepGraph(), { wrapper })

      expect(result.current.getGraph('release-1')).toBeNull()
    })

    it('should fetch and cache graph data', async () => {
      const mockGraph = createMockGraph()
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockGraph) as any
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      const graph = await result.current.fetchGraph('release-1')

      expect(graph).toEqual(mockGraph)
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph)
      })
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/releases/release-1/dependency-graph',
        { credentials: 'include' }
      )
    })

    it('should return cached graph without refetching', async () => {
      const mockGraph = createMockGraph()
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockGraph) as any
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      // First fetch
      await result.current.fetchGraph('release-1')
      expect(global.fetch).toHaveBeenCalledTimes(1)

      // Wait for cache to be populated
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph)
      })

      // Second fetch should use cache
      const cachedGraph = await result.current.fetchGraph('release-1')
      expect(cachedGraph).toEqual(mockGraph)
      expect(global.fetch).toHaveBeenCalledTimes(1) // No additional fetch
    })

    it('should cache graphs for multiple releases independently', async () => {
      const mockGraph1 = createMockGraph({
        nodes: [{ name: 'pkg-1', status: 'ready', depth: 0 }],
        edges: [],
      })
      const mockGraph2 = createMockGraph({
        nodes: [{ name: 'pkg-2', status: 'ready', depth: 0 }],
        edges: [],
      })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchResponse(mockGraph1) as any)
        .mockResolvedValueOnce(mockFetchResponse(mockGraph2) as any)

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await result.current.fetchGraph('release-1')
      await result.current.fetchGraph('release-2')

      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph1)
        expect(result.current.getGraph('release-2')).toEqual(mockGraph2)
      })
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should handle missing nodes/edges in response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse({}) as any
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      const graph = await result.current.fetchGraph('release-1')

      expect(graph).toEqual({ nodes: [], edges: [] })
    })
  })

  describe('Deduplication of concurrent requests', () => {
    it('should deduplicate concurrent requests for same graph', async () => {
      const mockGraph = createMockGraph()

      // Simulate slow network response
      vi.mocked(global.fetch).mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve(mockFetchResponse(mockGraph) as any), 50)
        )
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      // Start three concurrent requests for the same graph
      const promises = [
        result.current.fetchGraph('release-1'),
        result.current.fetchGraph('release-1'),
        result.current.fetchGraph('release-1'),
      ]

      const results = await Promise.all(promises)

      // All should return the same data
      expect(results[0]).toEqual(mockGraph)
      expect(results[1]).toEqual(mockGraph)
      expect(results[2]).toEqual(mockGraph)

      // But only one fetch should have been made
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should not deduplicate requests for different releases', async () => {
      const mockGraph1 = createMockGraph()
      const mockGraph2 = createMockGraph()

      vi.mocked(global.fetch)
        .mockImplementationOnce(() =>
          new Promise(resolve =>
            setTimeout(() => resolve(mockFetchResponse(mockGraph1) as any), 50)
          )
        )
        .mockImplementationOnce(() =>
          new Promise(resolve =>
            setTimeout(() => resolve(mockFetchResponse(mockGraph2) as any), 50)
          )
        )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      // Start concurrent requests for different releases
      const [result1, result2] = await Promise.all([
        result.current.fetchGraph('release-1'),
        result.current.fetchGraph('release-2'),
      ])

      expect(result1).toEqual(mockGraph1)
      expect(result2).toEqual(mockGraph2)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should clean up in-flight tracking after successful fetch', async () => {
      const mockGraph = createMockGraph()
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockGraph) as any
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await result.current.fetchGraph('release-1')

      // Wait for cache to be populated
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph)
      })

      // After first fetch completes, second fetch should use cache
      await result.current.fetchGraph('release-1')

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should clean up in-flight tracking after failed fetch', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchError('Server error', 500) as any)
        .mockResolvedValueOnce(mockFetchError('Server error', 500) as any)

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await expect(result.current.fetchGraph('release-1')).rejects.toThrow()
      await expect(result.current.fetchGraph('release-1')).rejects.toThrow()

      // Should make two separate requests since both failed
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Cache invalidation', () => {
    it('should remove graph from cache', async () => {
      const mockGraph = createMockGraph()
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockGraph) as any
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await result.current.fetchGraph('release-1')
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph)
      })

      result.current.invalidateGraph('release-1')

      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toBeNull()
      })
    })

    it('should force refetch after invalidation', async () => {
      const mockGraph1 = createMockGraph({
        nodes: [{ name: 'pkg-old', status: 'ready', depth: 0 }],
        edges: [],
      })
      const mockGraph2 = createMockGraph({
        nodes: [{ name: 'pkg-new', status: 'ready', depth: 0 }],
        edges: [],
      })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchResponse(mockGraph1) as any)
        .mockResolvedValueOnce(mockFetchResponse(mockGraph2) as any)

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      // First fetch
      await result.current.fetchGraph('release-1')
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph1)
      })

      // Invalidate
      result.current.invalidateGraph('release-1')

      // Wait for invalidation to complete
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toBeNull()
      })

      // Second fetch should make a new request
      await result.current.fetchGraph('release-1')
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toEqual(mockGraph2)
      })
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should not affect other cached graphs', async () => {
      const mockGraph1 = createMockGraph()
      const mockGraph2 = createMockGraph()

      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchResponse(mockGraph1) as any)
        .mockResolvedValueOnce(mockFetchResponse(mockGraph2) as any)

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await result.current.fetchGraph('release-1')
      await result.current.fetchGraph('release-2')

      // Invalidate only release-1
      result.current.invalidateGraph('release-1')

      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toBeNull()
        expect(result.current.getGraph('release-2')).toEqual(mockGraph2)
      })
    })
  })

  describe('Error handling', () => {
    it('should throw error when fetch fails', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not found', 404) as any
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await expect(
        result.current.fetchGraph('nonexistent')
      ).rejects.toThrow('Failed to fetch graph: 404')
    })

    it('should not cache failed fetches', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce(mockFetchError('Server error', 500) as any)
        .mockResolvedValueOnce(mockFetchResponse(createMockGraph()) as any)

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      // First attempt fails
      await expect(result.current.fetchGraph('release-1')).rejects.toThrow()
      expect(result.current.getGraph('release-1')).toBeNull()

      // Second attempt succeeds
      const graph = await result.current.fetchGraph('release-1')
      expect(graph).toBeTruthy()
      await waitFor(() => {
        expect(result.current.getGraph('release-1')).toBeTruthy()
      })
    })

    it('should handle network errors', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() => useDepGraph(), { wrapper })

      await expect(
        result.current.fetchGraph('release-1')
      ).rejects.toThrow('Network error')
    })
  })
})
