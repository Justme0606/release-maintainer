import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import { AuthProvider } from '../context/AuthContext'
import { mockFetchResponse, mockFetchError, createMockUser } from '../test/utils'

// Helper to render with auth context and router
function renderWithAuth(
  ui: React.ReactElement,
  { fetchMock = null as any } = {}
) {
  if (fetchMock) {
    global.fetch = vi.fn().mockResolvedValue(fetchMock)
  }

  return render(
    <BrowserRouter>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </BrowserRouter>
  )
}

describe('ProtectedRoute', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('Loading state', () => {
    it('should show loading spinner while checking auth', () => {
      // Simulate slow auth check
      global.fetch = vi.fn(() => new Promise(() => {}))

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      // Loading spinner should be visible (svg element)
      const spinners = document.querySelectorAll('svg')
      expect(spinners.length).toBeGreaterThan(0)
    })
  })

  describe('Authentication checks', () => {
    it('should render children when user is authenticated', async () => {
      const mockUser = createMockUser()

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should not render children when user is not authenticated', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchError('Not authenticated', 401) }
      )

      await waitFor(() => {
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { container } = renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(container).toBeTruthy()
      })

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })

  describe('Role-based access control', () => {
    it('should allow access when user has required role', async () => {
      const mockUser = createMockUser({ role: 'admin' })

      renderWithAuth(
        <ProtectedRoute requiredRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })
    })

    it('should not render when user lacks required role', async () => {
      const mockUser = createMockUser({ role: 'user' })

      renderWithAuth(
        <ProtectedRoute requiredRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
      })
    })

    it('should allow access when no role is required', async () => {
      const mockUser = createMockUser({ role: 'user' })

      renderWithAuth(
        <ProtectedRoute>
          <div>Any User Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('Any User Content')).toBeInTheDocument()
      })
    })
  })

  describe('State transitions', () => {
    it('should transition from loading to authenticated', async () => {
      const mockUser = createMockUser()

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      // Initially loading (svg present)
      const initialSpinners = document.querySelectorAll('svg')
      expect(initialSpinners.length).toBeGreaterThan(0)

      // Then authenticated
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should transition from loading to unauthenticated', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchError('Not authenticated', 401) }
      )

      // Initially loading
      const initialSpinners = document.querySelectorAll('svg')
      expect(initialSpinners.length).toBeGreaterThan(0)

      // Then not showing protected content
      await waitFor(() => {
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })
  })
})
