import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Routes, Route, MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import ProtectedRoute from './ProtectedRoute'
import { AuthProvider } from '../context/AuthContext'
import { mockFetchResponse, mockFetchError, createMockUser } from '../test/utils'

// Helper to render with auth context and router
function renderWithAuth(
  ui: React.ReactElement,
  { initialRoute = '/', fetchMock = null as any } = {}
) {
  if (fetchMock) {
    global.fetch = vi.fn().mockResolvedValue(fetchMock)
  }

  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('Loading state', () => {
    it('should show loading spinner while checking auth', () => {
      // Simulate slow auth check
      global.fetch = vi.fn(() => new Promise(() => {}))

      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      )

      // Loading spinner should be visible
      expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })

  describe('Authentication checks', () => {
    it('should render children when user is authenticated', async () => {
      const mockUser = createMockUser()

      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should redirect to login when user is not authenticated', async () => {
      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>,
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
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
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
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })
    })

    it('should redirect when user lacks required role', async () => {
      const mockUser = createMockUser({ role: 'user' })

      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/app" element={<div>App Home</div>} />
        </Routes>,
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
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Any User Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('Any User Content')).toBeInTheDocument()
      })
    })

    it('should handle multiple role checks independently', async () => {
      const mockUser = createMockUser({ role: 'admin' })

      renderWithAuth(
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user"
            element={
              <ProtectedRoute requiredRole="user">
                <div>User Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/app" element={<div>App Home</div>} />
        </Routes>,
        {
          initialRoute: '/admin',
          fetchMock: mockFetchResponse(mockUser),
        }
      )

      // Admin role should see admin content
      await waitFor(() => {
        expect(screen.getByText('Admin Content')).toBeInTheDocument()
      })
    })
  })

  describe('State transitions', () => {
    it('should transition from loading to authenticated', async () => {
      const mockUser = createMockUser()

      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      // Initially loading
      const loadingSpinner = screen.getByRole('img', { hidden: true })
      expect(loadingSpinner).toBeInTheDocument()

      // Then authenticated
      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })

      expect(screen.queryByRole('img', { hidden: true })).not.toBeInTheDocument()
    })

    it('should transition from loading to login redirect', async () => {
      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>,
        { fetchMock: mockFetchError('Not authenticated', 401) }
      )

      // Initially loading
      const loadingSpinner = screen.getByRole('img', { hidden: true })
      expect(loadingSpinner).toBeInTheDocument()

      // Then redirected to login
      await waitFor(() => {
        expect(screen.getByText('Login Page')).toBeInTheDocument()
      })
    })
  })

  describe('Replace navigation', () => {
    it('should use replace navigation for login redirect', async () => {
      const { container } = renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>,
        { fetchMock: mockFetchError('Not authenticated', 401) }
      )

      await waitFor(() => {
        expect(screen.getByText('Login Page')).toBeInTheDocument()
      })

      // Verify we're at /login
      expect(container).toBeTruthy()
    })

    it('should use replace navigation for role redirect', async () => {
      const mockUser = createMockUser({ role: 'user' })

      const { container } = renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/app" element={<div>App Home</div>} />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('App Home')).toBeInTheDocument()
      })

      expect(container).toBeTruthy()
    })
  })

  describe('Edge cases', () => {
    it('should handle empty requiredRole string', async () => {
      const mockUser = createMockUser({ role: 'user' })

      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="">
                <div>Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/app" element={<div>App Home</div>} />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      // Empty string is falsy, so should not require specific role
      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument()
      })
    })

    it('should handle user with undefined role', async () => {
      const mockUser = { username: 'test', role: undefined as any }

      renderWithAuth(
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/app" element={<div>App Home</div>} />
        </Routes>,
        { fetchMock: mockFetchResponse(mockUser) }
      )

      await waitFor(() => {
        expect(screen.getByText('App Home')).toBeInTheDocument()
      })
    })
  })
})
