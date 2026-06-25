import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReleaseHeader from './ReleaseHeader'

describe('ReleaseHeader', () => {
  describe('Progress calculation', () => {
    it('should calculate progress correctly', () => {
      render(
        <ReleaseHeader
          release={{
            name: 'Test Release',
            description: 'Test description',
            summary: {
              packages: 10,
              ready: 7,
              waiting: 2,
              blocked: 1,
            },
          }}
        />
      )

      expect(screen.getByText('70%')).toBeInTheDocument()
      expect(screen.getByText('7 / 10 packages ready')).toBeInTheDocument()
    })

    it('should handle division by zero when no packages', () => {
      render(
        <ReleaseHeader
          release={{
            name: 'Empty Release',
            summary: {
              packages: 0,
              ready: 0,
              waiting: 0,
              blocked: 0,
            },
          }}
        />
      )

      expect(screen.getByText('0%')).toBeInTheDocument()
      expect(screen.getByText('0 / 0 packages ready')).toBeInTheDocument()
    })

    it('should handle missing summary data', () => {
      render(
        <ReleaseHeader
          release={{
            name: 'Test Release',
          }}
        />
      )

      expect(screen.getByText('0%')).toBeInTheDocument()
      expect(screen.getByText('0 / 0 packages ready')).toBeInTheDocument()
    })

    it('should round progress to nearest integer', () => {
      render(
        <ReleaseHeader
          release={{
            name: 'Test Release',
            summary: {
              packages: 3,
              ready: 2,
              waiting: 1,
              blocked: 0,
            },
          }}
        />
      )

      // 2/3 = 0.666... should round to 67%
      expect(screen.getByText('67%')).toBeInTheDocument()
    })
  })

  describe('CI status mapping', () => {
    it('should display CI status as "In progress" for running workflows', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          ciStatus={[
            {
              name: 'Build',
              status: 'in_progress',
              conclusion: null,
              html_url: 'https://github.com/org/repo/actions/runs/1',
            },
          ]}
        />
      )

      expect(screen.getByText('In progress')).toBeInTheDocument()
    })

    it('should display CI status as "Passing" for successful workflows', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          ciStatus={[
            {
              name: 'Tests',
              status: 'completed',
              conclusion: 'success',
              html_url: 'https://github.com/org/repo/actions/runs/2',
            },
          ]}
        />
      )

      expect(screen.getByText('Passing')).toBeInTheDocument()
    })

    it('should display CI status as "Failing" for failed workflows', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          ciStatus={[
            {
              name: 'Lint',
              status: 'completed',
              conclusion: 'failure',
              html_url: 'https://github.com/org/repo/actions/runs/3',
            },
          ]}
        />
      )

      expect(screen.getByText('Failing')).toBeInTheDocument()
    })

    it('should handle multiple CI workflows', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          ciStatus={[
            {
              name: 'Build',
              status: 'completed',
              conclusion: 'success',
            },
            {
              name: 'Tests',
              status: 'in_progress',
              conclusion: null,
            },
            {
              name: 'Lint',
              status: 'completed',
              conclusion: 'failure',
            },
          ]}
        />
      )

      expect(screen.getByText('Build')).toBeInTheDocument()
      expect(screen.getByText('Tests')).toBeInTheDocument()
      expect(screen.getByText('Lint')).toBeInTheDocument()
      expect(screen.getByText('Passing')).toBeInTheDocument()
      expect(screen.getByText('In progress')).toBeInTheDocument()
      expect(screen.getByText('Failing')).toBeInTheDocument()
    })

    it('should show "No CI data" when ciStatus is empty', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          ciStatus={[]}
        />
      )

      expect(screen.getByText('No CI data')).toBeInTheDocument()
    })

    it('should show "No CI data" when ciStatus is undefined', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
        />
      )

      expect(screen.getByText('No CI data')).toBeInTheDocument()
    })
  })

  describe('Refresh functionality', () => {
    it('should call onRefresh when refresh button is clicked', async () => {
      const user = userEvent.setup()
      const handleRefresh = vi.fn()

      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          onRefresh={handleRefresh}
        />
      )

      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      await user.click(refreshButton)

      expect(handleRefresh).toHaveBeenCalledTimes(1)
    })

    it('should disable refresh button when refreshing', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          onRefresh={vi.fn()}
          refreshing={true}
        />
      )

      const refreshButton = screen.getByRole('button', { name: /refreshing/i })
      expect(refreshButton).toBeDisabled()
      expect(refreshButton).toHaveTextContent('Refreshing...')
    })

    it('should enable refresh button when not refreshing', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          onRefresh={vi.fn()}
          refreshing={false}
        />
      )

      const refreshButton = screen.getByRole('button', { name: /refresh/i })
      expect(refreshButton).not.toBeDisabled()
      expect(refreshButton).toHaveTextContent('Refresh')
    })

    it('should not show refresh button when onRefresh is not provided', () => {
      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
        />
      )

      expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
    })

    it('should display last refreshed timestamp', () => {
      const timestamp = '2024-01-15T10:00:00Z'

      render(
        <ReleaseHeader
          release={{ name: 'Test Release' }}
          lastRefreshedAt={timestamp}
        />
      )

      expect(screen.getByText(/Last updated:/)).toBeInTheDocument()
    })
  })

  describe('Release information display', () => {
    it('should display release name and description', () => {
      render(
        <ReleaseHeader
          release={{
            name: '2024.1',
            description: 'First release of 2024',
          }}
        />
      )

      expect(screen.getByText('Release 2024.1')).toBeInTheDocument()
      expect(screen.getByText('First release of 2024')).toBeInTheDocument()
    })

    it('should show loading state when release is null', () => {
      render(<ReleaseHeader release={null} />)

      expect(screen.getByText('Release Loading...')).toBeInTheDocument()
      expect(screen.getByText('Loading release information...')).toBeInTheDocument()
    })

    it('should display published date when available', () => {
      render(
        <ReleaseHeader
          release={{
            name: '2024.1',
            published_at: '2024-01-15T00:00:00Z',
          }}
        />
      )

      expect(screen.getByText(/Published/)).toBeInTheDocument()
    })

    it('should not display published date when unavailable', () => {
      render(
        <ReleaseHeader
          release={{
            name: '2024.1',
          }}
        />
      )

      expect(screen.queryByText(/Published/)).not.toBeInTheDocument()
    })
  })
})
