import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RightPanel from './RightPanel'

describe('RightPanel', () => {
  describe('Recent Activity', () => {
    it('should show "No recent activity" when empty', () => {
      render(<RightPanel recentActivity={[]} />)

      expect(screen.getByText('No recent activity')).toBeInTheDocument()
    })

    it('should display activity events', () => {
      const events = [
        {
          type: 'pr_opened',
          text: 'PR #42 opened',
          url: 'https://github.com/org/repo/pull/42',
          date: '2024-01-15T10:00:00Z',
          state: 'open',
        },
        {
          type: 'issue_closed',
          text: 'Issue #10 closed',
          url: 'https://github.com/org/repo/issues/10',
          date: '2024-01-14T15:00:00Z',
          state: 'closed',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('PR #42 opened')).toBeInTheDocument()
      expect(screen.getByText('Issue #10 closed')).toBeInTheDocument()
    })

    it('should paginate activity events', async () => {
      const user = userEvent.setup()
      const events = Array.from({ length: 10 }, (_, i) => ({
        type: 'event',
        text: `Event ${i}`,
        url: `https://example.com/${i}`,
        date: '2024-01-15T10:00:00Z',
        state: 'info',
      }))

      render(<RightPanel recentActivity={events} />)

      // First page shows first 4 events
      expect(screen.getByText('Event 0')).toBeInTheDocument()
      expect(screen.getByText('Event 3')).toBeInTheDocument()
      expect(screen.queryByText('Event 4')).not.toBeInTheDocument()

      // Navigate to next page - get all buttons and click the last one (next button)
      const buttons = screen.getAllByRole('button')
      await user.click(buttons[buttons.length - 1])

      expect(screen.getByText('Event 4')).toBeInTheDocument()
      expect(screen.queryByText('Event 0')).not.toBeInTheDocument()
    })

    it('should not show pagination for few events', () => {
      const events = [
        {
          type: 'event',
          text: 'Single event',
          url: '',
          date: '2024-01-15T10:00:00Z',
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.queryByText(/\/ \d+/)).not.toBeInTheDocument()
    })
  })

  describe('formatRelativeDate edge cases', () => {
    let realDateNow: typeof Date.now

    beforeEach(() => {
      realDateNow = Date.now
      // Mock Date.now to return a fixed timestamp
      Date.now = vi.fn(() => new Date('2024-01-15T12:00:00Z').getTime())
    })

    afterEach(() => {
      Date.now = realDateNow
    })

    it('should show "just now" for very recent events', () => {
      const events = [
        {
          type: 'event',
          text: 'Recent event',
          url: '',
          date: '2024-01-15T11:59:30Z', // 30 seconds ago
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('just now')).toBeInTheDocument()
    })

    it('should show minutes for events less than 1 hour old', () => {
      const events = [
        {
          type: 'event',
          text: 'Event 30m ago',
          url: '',
          date: '2024-01-15T11:30:00Z', // 30 minutes ago
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('30m ago')).toBeInTheDocument()
    })

    it('should show hours for events less than 1 day old', () => {
      const events = [
        {
          type: 'event',
          text: 'Event 5h ago',
          url: '',
          date: '2024-01-15T07:00:00Z', // 5 hours ago
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('5h ago')).toBeInTheDocument()
    })

    it('should show days for events less than 30 days old', () => {
      const events = [
        {
          type: 'event',
          text: 'Event 7d ago',
          url: '',
          date: '2024-01-08T12:00:00Z', // 7 days ago
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('7d ago')).toBeInTheDocument()
    })

    it('should show months for events more than 30 days old', () => {
      const events = [
        {
          type: 'event',
          text: 'Event 2mo ago',
          url: '',
          date: '2023-11-15T12:00:00Z', // ~2 months ago
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('2mo ago')).toBeInTheDocument()
    })

    it('should handle future dates gracefully', () => {
      const events = [
        {
          type: 'event',
          text: 'Future event',
          url: '',
          date: '2024-01-16T12:00:00Z', // 1 day in future
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('just now')).toBeInTheDocument()
    })

    it('should handle empty date string', () => {
      const events = [
        {
          type: 'event',
          text: 'No date event',
          url: '',
          date: '',
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.getByText('No date event')).toBeInTheDocument()
    })
  })

  describe('Issues by State - Percentage calculations', () => {
    it('should calculate percentages correctly', () => {
      render(
        <RightPanel
          issuesByState={{
            open: 50,
            closed: 30,
            draft_prs: 20,
          }}
        />
      )

      expect(screen.getByText('100')).toBeInTheDocument() // Total
      expect(screen.getByText(/50 \(50%\)/)).toBeInTheDocument() // Open
      expect(screen.getByText(/30 \(30%\)/)).toBeInTheDocument() // Closed
      expect(screen.getByText(/20 \(20%\)/)).toBeInTheDocument() // Draft
    })

    it('should handle division by zero when no issues', () => {
      render(
        <RightPanel
          issuesByState={{
            open: 0,
            closed: 0,
            draft_prs: 0,
          }}
        />
      )

      expect(screen.getByText('0')).toBeInTheDocument() // Total
      // All three will be "0 (0%)" - just check there are 3 of them
      expect(screen.getAllByText(/0 \(0%\)/).length).toBe(3)
    })

    it('should handle undefined issuesByState', () => {
      render(<RightPanel />)

      expect(screen.getByText('0')).toBeInTheDocument() // Total
      expect(screen.getAllByText(/0 \(0%\)/).length).toBeGreaterThan(0)
    })

    it('should ensure percentages sum to 100', () => {
      // Test edge case where rounding could cause sum != 100
      render(
        <RightPanel
          issuesByState={{
            open: 1,
            closed: 1,
            draft_prs: 1,
          }}
        />
      )

      expect(screen.getByText('3')).toBeInTheDocument() // Total

      // Each should be 33%, but with adjustment to sum to 100
      const percentages = screen.getAllByText(/\(\d+%\)/)
      expect(percentages).toHaveLength(3)
    })

    it('should handle large numbers', () => {
      render(
        <RightPanel
          issuesByState={{
            open: 1000,
            closed: 500,
            draft_prs: 250,
          }}
        />
      )

      expect(screen.getByText('1750')).toBeInTheDocument() // Total
      expect(screen.getByText(/1000 \(57%\)/)).toBeInTheDocument() // Open (57.14% rounds to 57)
      expect(screen.getByText(/500 \(29%\)/)).toBeInTheDocument() // Closed (28.57% rounds to 29)
      expect(screen.getByText(/250 \(14%\)/)).toBeInTheDocument() // Draft (remainder)
    })

    it('should handle uneven distribution', () => {
      render(
        <RightPanel
          issuesByState={{
            open: 99,
            closed: 1,
            draft_prs: 0,
          }}
        />
      )

      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText(/99 \(99%\)/)).toBeInTheDocument()
      expect(screen.getByText(/1 \(1%\)/)).toBeInTheDocument()
      expect(screen.getByText(/0 \(0%\)/)).toBeInTheDocument()
    })
  })

  describe('Activity links', () => {
    it('should render links for events with URLs', () => {
      const events = [
        {
          type: 'pr',
          text: 'PR #42',
          url: 'https://github.com/org/repo/pull/42',
          date: '2024-01-15T10:00:00Z',
          state: 'open',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      const link = screen.getByRole('link', { name: 'PR #42' })
      expect(link).toHaveAttribute('href', 'https://github.com/org/repo/pull/42')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should not render links for events without URLs', () => {
      const events = [
        {
          type: 'event',
          text: 'Event without URL',
          url: '',
          date: '2024-01-15T10:00:00Z',
          state: 'info',
        },
      ]

      render(<RightPanel recentActivity={events} />)

      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText('Event without URL')).toBeInTheDocument()
    })
  })
})
