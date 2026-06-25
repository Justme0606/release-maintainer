import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { ReleaseProvider } from '../context/ReleaseContext'
import { DepGraphProvider } from '../context/DepGraphContext'

interface AllProvidersProps {
  children: ReactNode
}

/**
 * Wrapper component that provides all necessary contexts for testing.
 * Includes: Router, Auth, Release, and DepGraph contexts.
 */
function AllProviders({ children }: AllProvidersProps) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ReleaseProvider>
          <DepGraphProvider>
            {children}
          </DepGraphProvider>
        </ReleaseProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

/**
 * Custom render function that wraps components with all necessary providers.
 * Use this instead of the default render from @testing-library/react.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

/**
 * Factory function to create mock package data for testing.
 */
export function createMockPackage(overrides?: Partial<{
  name: string
  pick_version: string
  opam_version: string | null
  git_tag: string | null
  issue_url: string | null
  status: 'ready' | 'waiting' | 'blocked' | 'unknown'
  disabled: boolean
  disabled_reason: string | null
}>) {
  return {
    name: 'test-package',
    pick_version: '1.0.0',
    opam_version: '1.0.0',
    git_tag: 'v1.0.0',
    issue_url: 'https://github.com/org/repo/issues/1',
    status: 'ready' as const,
    disabled: false,
    disabled_reason: null,
    ...overrides,
  }
}

/**
 * Factory function to create mock release data for testing.
 */
export function createMockRelease(overrides?: Partial<{
  id: string
  name: string
  description: string
  header: any
  packages: any[]
  timeline: any[]
  activity: any[]
  last_refreshed_at: string
}>) {
  return {
    id: 'test-release',
    name: 'Test Release 2024.1',
    description: 'A test release for unit tests',
    header: {
      total_packages: 10,
      ready_packages: 7,
      waiting_packages: 2,
      blocked_packages: 1,
      disabled_packages: 0,
      progress: 70,
      ci_status: 'passing',
    },
    packages: [
      createMockPackage({ name: 'package-1', status: 'ready' }),
      createMockPackage({ name: 'package-2', status: 'waiting' }),
      createMockPackage({ name: 'package-3', status: 'blocked' }),
    ],
    timeline: [
      {
        date: '2024-01-15',
        events: [
          { type: 'package_ready', package: 'package-1', time: '10:00' }
        ]
      }
    ],
    activity: [
      {
        package: 'package-1',
        type: 'status_change',
        from: 'waiting',
        to: 'ready',
        timestamp: '2024-01-15T10:00:00Z'
      }
    ],
    last_refreshed_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory function to create mock user data for testing.
 */
export function createMockUser(overrides?: Partial<{
  username: string
  role: string
}>) {
  return {
    username: 'testuser',
    role: 'user',
    ...overrides,
  }
}

/**
 * Mock fetch response helper for testing API calls.
 */
export function mockFetchResponse(data: any, options?: { ok?: boolean; status?: number }) {
  return Promise.resolve({
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response)
}

/**
 * Mock fetch error helper for testing error handling.
 */
export function mockFetchError(message: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({ detail: message }),
    text: async () => JSON.stringify({ detail: message }),
  } as Response)
}
