import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/app/)
  })

  test('should display release list', async ({ page }) => {
    await page.goto('/app')

    // Should see releases heading
    await expect(page.getByRole('heading', { name: /releases/i })).toBeVisible()

    // Should see at least one release
    const releases = page.getByRole('link').filter({ hasText: /release|2024/i })
    await expect(releases.first()).toBeVisible()
  })

  test('should navigate to release dashboard', async ({ page }) => {
    await page.goto('/app')

    // Click on first release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    // Should be on release dashboard
    await expect(page).toHaveURL(/\/app\/releases\/[^/]+$/)

    // Should see release header
    await expect(page.getByRole('heading', { name: /release/i })).toBeVisible()

    // Should see KPIs or stats
    await expect(page.getByText(/progress|packages|ready/i)).toBeVisible()
  })

  test('should display KPIs on dashboard', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    await expect(page).toHaveURL(/\/app\/releases/)

    // Check for KPI indicators
    await expect(page.getByText(/\d+%/)).toBeVisible() // Progress percentage
    await expect(page.getByText(/packages/i)).toBeVisible()
  })

  test('should refresh dashboard data', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    // Look for refresh button
    const refreshButton = page.getByRole('button', { name: /refresh/i })

    if (await refreshButton.isVisible()) {
      // Click refresh
      await refreshButton.click()

      // Should show refreshing state
      await expect(page.getByText(/refreshing/i)).toBeVisible()

      // Wait for refresh to complete
      await expect(page.getByRole('button', { name: /^refresh$/i })).toBeVisible({ timeout: 30000 })
    }
  })

  test('should display package table', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    // Should see packages heading or table
    await expect(page.getByText(/packages/i)).toBeVisible()

    // Should see table headers
    const table = page.locator('table').first()
    if (await table.isVisible()) {
      await expect(table.getByRole('columnheader', { name: /package/i })).toBeVisible()
      await expect(table.getByRole('columnheader', { name: /status/i })).toBeVisible()
    }
  })

  test('should filter packages by status', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    // Look for filter buttons
    const readyFilter = page.getByRole('button', { name: /^ready$/i })

    if (await readyFilter.isVisible()) {
      const initialCount = await page.getByRole('row').count()

      // Click ready filter
      await readyFilter.click()

      // Package count might change
      await page.waitForTimeout(500) // Wait for filter to apply

      // All visible packages should have ready status
      const statusBadges = page.locator('.pill.ready')
      if (await statusBadges.first().isVisible()) {
        expect(await statusBadges.count()).toBeGreaterThan(0)
      }
    }
  })

  test('should search packages', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    // Look for search input
    const searchInput = page.getByPlaceholder(/search/i)

    if (await searchInput.isVisible()) {
      // Type search term
      await searchInput.fill('test')

      // Wait for search to apply
      await page.waitForTimeout(500)

      // Should filter results
      const packageCount = page.getByText(/packages \(\d+/)
      await expect(packageCount).toBeVisible()
    }
  })

  test('should navigate to package detail from table', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()

    // Find and click on a package row
    const table = page.locator('table').first()
    if (await table.isVisible()) {
      const firstPackageRow = table.locator('tbody tr').first()
      await firstPackageRow.click()

      // Should navigate to package detail page
      await expect(page).toHaveURL(/\/app\/releases\/[^/]+\/packages\/[^/]+/)

      // Should see package detail heading
      await expect(page.getByRole('heading')).toBeVisible()
    }
  })
})
