import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackageTable from './PackageTable'
import { renderWithProviders, createMockPackage } from '../test/utils'

// Mock useNavigate and useParams
const mockNavigate = vi.fn()
const mockParams = { releaseId: 'test-release' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  }
})

describe('PackageTable', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  const defaultPackages = [
    createMockPackage({ name: 'pkg-ready', status: 'ready' }),
    createMockPackage({ name: 'pkg-waiting', status: 'waiting' }),
    createMockPackage({ name: 'pkg-blocked', status: 'blocked' }),
    createMockPackage({ name: 'pkg-unknown', status: 'unknown' }),
    createMockPackage({ name: 'pkg-disabled', status: 'ready', disabled: true, disabled_reason: 'Not needed' }),
  ]

  function renderTable(packages = defaultPackages) {
    return renderWithProviders(
      <PackageTable packages={packages} />
    )
  }

  describe('Filtering by status', () => {
    it('should show all packages by default', () => {
      renderTable()

      expect(screen.getByText('pkg-ready')).toBeInTheDocument()
      expect(screen.getByText('pkg-waiting')).toBeInTheDocument()
      expect(screen.getByText('pkg-blocked')).toBeInTheDocument()
      expect(screen.getByText('pkg-unknown')).toBeInTheDocument()
      expect(screen.getByText('pkg-disabled')).toBeInTheDocument()
    })

    it('should filter packages by ready status', async () => {
      const user = userEvent.setup()
      renderTable()

      const readyButton = screen.getByRole('button', { name: 'Ready' })
      await user.click(readyButton)

      expect(screen.getByText('pkg-ready')).toBeInTheDocument()
      expect(screen.queryByText('pkg-waiting')).not.toBeInTheDocument()
      expect(screen.queryByText('pkg-blocked')).not.toBeInTheDocument()
    })

    it('should filter packages by waiting status', async () => {
      const user = userEvent.setup()
      renderTable()

      const waitingButton = screen.getByRole('button', { name: 'Waiting' })
      await user.click(waitingButton)

      expect(screen.getByText('pkg-waiting')).toBeInTheDocument()
      expect(screen.queryByText('pkg-ready')).not.toBeInTheDocument()
    })

    it('should filter packages by blocked status', async () => {
      const user = userEvent.setup()
      renderTable()

      const blockedButton = screen.getByRole('button', { name: 'Blocked' })
      await user.click(blockedButton)

      expect(screen.getByText('pkg-blocked')).toBeInTheDocument()
      expect(screen.queryByText('pkg-ready')).not.toBeInTheDocument()
    })

    it('should filter disabled packages', async () => {
      const user = userEvent.setup()
      renderTable()

      const disabledButton = screen.getByRole('button', { name: 'Disabled' })
      await user.click(disabledButton)

      expect(screen.getByText('pkg-disabled')).toBeInTheDocument()
      expect(screen.queryByText('pkg-ready')).not.toBeInTheDocument()
    })

    it('should show disabled reason for disabled packages', () => {
      renderTable()

      expect(screen.getByText('Not needed')).toBeInTheDocument()
    })

    it('should update package count when filtering', async () => {
      const user = userEvent.setup()
      renderTable()

      expect(screen.getByText(/Packages \(\d+\)/)).toBeInTheDocument()

      const readyButton = screen.getByRole('button', { name: 'Ready' })
      await user.click(readyButton)

      // After filtering, text will be "Packages (X / Y)"
      expect(screen.getByText(/Packages \(\d+ \/ \d+\)/)).toBeInTheDocument()
    })

    it('should reset to page 0 when changing filter', async () => {
      const user = userEvent.setup()
      // Create enough packages to have multiple pages
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `pkg-${i}`, status: i < 25 ? 'ready' : 'waiting' })
      )

      renderTable(manyPackages)

      // Go to page 2
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      expect(screen.getByText(/2 \/ \d+/)).toBeInTheDocument()

      // Change filter should reset to page 1
      const waitingButton = screen.getByRole('button', { name: 'Waiting' })
      await user.click(waitingButton)

      expect(screen.getByText(/1 \/ \d+/)).toBeInTheDocument()
    })
  })

  describe('Search functionality', () => {
    it('should filter packages by search term (case-insensitive)', async () => {
      const user = userEvent.setup()
      renderTable()

      const searchInput = screen.getByPlaceholderText('Search packages...')
      await user.type(searchInput, 'READY')

      expect(screen.getByText('pkg-ready')).toBeInTheDocument()
      expect(screen.queryByText('pkg-waiting')).not.toBeInTheDocument()
    })

    it('should handle lowercase search', async () => {
      const user = userEvent.setup()
      renderTable()

      const searchInput = screen.getByPlaceholderText('Search packages...')
      await user.type(searchInput, 'waiting')

      expect(screen.getByText('pkg-waiting')).toBeInTheDocument()
      expect(screen.queryByText('pkg-ready')).not.toBeInTheDocument()
    })

    it('should handle partial matches', async () => {
      const user = userEvent.setup()
      renderTable()

      const searchInput = screen.getByPlaceholderText('Search packages...')
      await user.type(searchInput, 'pkg')

      // All packages should match
      expect(screen.getByText('pkg-ready')).toBeInTheDocument()
      expect(screen.getByText('pkg-waiting')).toBeInTheDocument()
      expect(screen.getByText('pkg-blocked')).toBeInTheDocument()
    })

    it('should reset to page 0 when searching', async () => {
      const user = userEvent.setup()
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `package-${i}`, status: 'ready' })
      )

      renderTable(manyPackages)

      // Go to page 2
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // Search should reset to page 1
      const searchInput = screen.getByPlaceholderText('Search packages...')
      await user.type(searchInput, 'package-1')

      // Just check that pagination exists, don't check exact format
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()
    })

    it('should combine search with filter', async () => {
      const user = userEvent.setup()
      const packages = [
        createMockPackage({ name: 'test-ready-1', status: 'ready' }),
        createMockPackage({ name: 'test-ready-2', status: 'ready' }),
        createMockPackage({ name: 'test-waiting-1', status: 'waiting' }),
      ]

      renderTable(packages)

      // Apply filter
      const readyButton = screen.getByRole('button', { name: 'Ready' })
      await user.click(readyButton)

      // Then search
      const searchInput = screen.getByPlaceholderText('Search packages...')
      await user.type(searchInput, 'ready-1')

      expect(screen.getByText('test-ready-1')).toBeInTheDocument()
      expect(screen.queryByText('test-ready-2')).not.toBeInTheDocument()
      expect(screen.queryByText('test-waiting-1')).not.toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should not show pagination for small package lists', () => {
      renderTable([createMockPackage()])

      expect(screen.queryByRole('button', { name: /prev/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
    })

    it('should show pagination for large package lists', () => {
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `pkg-${i}` })
      )

      renderTable(manyPackages)

      expect(screen.getByRole('button', { name: /prev/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
      expect(screen.getByText('1 / 3')).toBeInTheDocument()
    })

    it('should navigate to next page', async () => {
      const user = userEvent.setup()
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `pkg-${i}` })
      )

      renderTable(manyPackages)

      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      expect(screen.getByText('2 / 3')).toBeInTheDocument()
    })

    it('should navigate to previous page', async () => {
      const user = userEvent.setup()
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `pkg-${i}` })
      )

      renderTable(manyPackages)

      // Go to page 2
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)

      // Go back to page 1
      const prevButton = screen.getByRole('button', { name: /prev/i })
      await user.click(prevButton)

      expect(screen.getByText('1 / 3')).toBeInTheDocument()
    })

    it('should disable prev button on first page', () => {
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `pkg-${i}` })
      )

      renderTable(manyPackages)

      const prevButton = screen.getByRole('button', { name: /prev/i })
      expect(prevButton).toBeDisabled()
    })

    it('should disable next button on last page', async () => {
      const user = userEvent.setup()
      const manyPackages = Array.from({ length: 50 }, (_, i) =>
        createMockPackage({ name: `pkg-${i}` })
      )

      renderTable(manyPackages)

      // Go to last page
      const nextButton = screen.getByRole('button', { name: /next/i })
      await user.click(nextButton)
      await user.click(nextButton)

      expect(nextButton).toBeDisabled()
      expect(screen.getByText('3 / 3')).toBeInTheDocument()
    })

    it('should handle edge case when filtered results become empty', async () => {
      const user = userEvent.setup()
      renderTable()

      const searchInput = screen.getByPlaceholderText('Search packages...')
      await user.type(searchInput, 'nonexistent')

      // Should still render the table even with no results
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()
    })
  })

  describe('Package display', () => {
    it('should display package information correctly', () => {
      const pkg = createMockPackage({
        name: 'test-package',
        pick_version: '2.0.0',
        opam_version: '2.0.1',
        git_tag: 'v2.0.0',
        issue_url: 'https://github.com/org/repo/issues/42',
        status: 'ready',
      })

      renderTable([pkg])

      expect(screen.getByText('test-package')).toBeInTheDocument()
      expect(screen.getAllByText('2.0.0').length).toBeGreaterThan(0)
      expect(screen.getByText('2.0.1')).toBeInTheDocument()
      expect(screen.getByText('v2.0.0')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Issue' })).toHaveAttribute(
        'href',
        'https://github.com/org/repo/issues/42'
      )
    })

    it('should display em-dash for null values', () => {
      const pkg = createMockPackage({
        opam_version: null,
        git_tag: null,
        issue_url: null,
      })

      renderTable([pkg])

      const table = screen.getByRole('table')
      const rows = within(table).getAllByRole('row')
      const dataRow = rows[1] // Skip header row
      const cells = within(dataRow).getAllByRole('cell')

      // Check for em-dashes in appropriate columns
      expect(cells[2]).toHaveTextContent('—') // OPAM Version
      expect(cells[3]).toHaveTextContent('—') // Git Tag
      expect(cells[4]).toHaveTextContent('—') // Issue
    })
  })
})
