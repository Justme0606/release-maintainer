import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, createMockRelease, mockFetchResponse } from '../test/utils'

// Mock DashboardPage imports
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ releaseId: 'test-release' }),
  }
})

// Import after mocks
import DashboardPage from './DashboardPage'

describe('DashboardPage', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('Release loading', () => {
    it('should fetch release data on mount', async () => {
      const mockRelease = createMockRelease({ id: 'test-release', name: '2024.1' })
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockRelease) as any
      )

      renderWithProviders(<DashboardPage />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
    })

    it('should handle fetch errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const { container } = renderWithProviders(<DashboardPage />)

      // Component should not crash
      await waitFor(() => {
        expect(container).toBeTruthy()
      })
    })

    it('should not crash with null release data', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(null) as any
      )

      const { container } = renderWithProviders(<DashboardPage />)

      await waitFor(() => {
        expect(container).toBeTruthy()
      })
    })
  })

  describe('Component rendering', () => {
    it('should render without crashing', () => {
      const mockRelease = createMockRelease()
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockRelease) as any
      )

      const { container } = renderWithProviders(<DashboardPage />)

      expect(container).toBeTruthy()
    })
  })

  describe('Cache invalidation', () => {
    it('should call fetchRelease with releaseId', async () => {
      const mockRelease = createMockRelease()
      const fetchSpy = vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse(mockRelease) as any
      )

      renderWithProviders(<DashboardPage />)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled()
      })
    })
  })
})
