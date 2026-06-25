import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { ReactNode } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import { mockFetchResponse, mockFetchError, createMockUser } from '../test/utils'

describe('AuthContext', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  describe('Session restoration', () => {
    it('should restore user session on mount when authenticated', async () => {
      const mockUser = createMockUser({ username: 'john', role: 'admin' })
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockUser) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      expect(result.current.loading).toBe(true)
      expect(result.current.user).toBeNull()

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toEqual(mockUser)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/me',
        { credentials: 'include' }
      )
    })

    it('should set user to null when not authenticated', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not authenticated', 401) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
    })

    it('should handle network errors during session restoration', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.user).toBeNull()
    })
  })

  describe('Login', () => {
    it('should successfully login with valid credentials', async () => {
      const mockUser = createMockUser({ username: 'alice', role: 'user' })

      // Mock session restoration (initial mount)
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not authenticated', 401) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Mock login response
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockUser) as any
      )

      await result.current.login('alice', 'password123')

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })
      expect(global.fetch).toHaveBeenLastCalledWith(
        'http://localhost:8000/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: 'alice', password: 'password123' }),
        }
      )
    })

    it('should throw error on login failure with invalid credentials', async () => {
      // Mock session restoration
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not authenticated', 401) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Mock failed login
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Invalid credentials', 401) as any
      )

      await expect(
        result.current.login('wrong', 'password')
      ).rejects.toThrow('Invalid credentials')

      expect(result.current.user).toBeNull()
    })

    it('should handle login errors without detail field', async () => {
      // Mock session restoration
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not authenticated', 401) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Mock login error without json response
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Parse error')),
      } as any)

      await expect(
        result.current.login('user', 'pass')
      ).rejects.toThrow('Login failed')
    })
  })

  describe('Logout', () => {
    it('should successfully logout and clear user state', async () => {
      const mockUser = createMockUser()

      // Mock session restoration
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockUser) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Mock logout response
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse({}) as any
      )

      await result.current.logout()

      await waitFor(() => {
        expect(result.current.user).toBeNull()
      })
      expect(global.fetch).toHaveBeenLastCalledWith(
        'http://localhost:8000/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      )
    })

    it('should clear user state even if logout request fails', async () => {
      const mockUser = createMockUser()

      // Mock session restoration
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockUser) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Mock failed logout
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      // Logout should throw but still clear state
      await expect(result.current.logout()).rejects.toThrow()

      await waitFor(() => {
        expect(result.current.user).toBeNull()
      })
    })
  })

  describe('Context value memoization', () => {
    it('should memoize context value correctly', async () => {
      const mockUser = createMockUser()
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockUser) as any
      )

      const { result, rerender } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const firstValue = result.current

      // Rerender should not change the value if state hasn't changed
      rerender()

      expect(result.current).toBe(firstValue)
    })

    it('should update memoized value when user state changes', async () => {
      // Start unauthenticated
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchError('Not authenticated', 401) as any
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const beforeLogin = result.current

      // Login
      const mockUser = createMockUser()
      vi.mocked(global.fetch).mockResolvedValueOnce(
        mockFetchResponse(mockUser) as any
      )

      await result.current.login('user', 'pass')

      // Context value should have changed
      await waitFor(() => {
        expect(result.current).not.toBe(beforeLogin)
        expect(result.current.user).toEqual(mockUser)
      })
    })
  })
})
