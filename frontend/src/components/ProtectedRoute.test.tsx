import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/app" element={<div>App Home</div>} />
        </Routes>
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

    it('should redirect to login when user is not authenticated', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchError('Not authenticated', 401) }
      )

      await waitFor(() => {
        expect(screen.getByText('Login Page')).toBeInTheDocument()
      })

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should handle network errors by redirecting to login', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Login Page')).toBeInTheDocument()
      })
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

    it('should redirect when user lacks required role', async () => {
      const mockUser = createMockUser({ role: 'user' })

      renderWithAuth(
        <ProtectedRoute requiredRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('App Home')).toBeInTheDocument()
      })

      expect(screen.queryByText('Admin Content')).not.toBeInTheDocument()
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

    it('should transition from loading to login redirect', async () => {
      renderWithAuth(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>,
        { fetchMock: mockFetchError('Not authenticated', 401) }
      )

      // Initially loading
      const initialSpinners = document.querySelectorAll('svg')
      expect(initialSpinners.length).toBeGreaterThan(0)

      // Then redirected to login
      await waitFor(() => {
        expect(screen.getByText('Login Page')).toBeInTheDocument()
      })
    })
  })
})
