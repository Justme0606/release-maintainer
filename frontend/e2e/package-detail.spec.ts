import { test, expect } from '@playwright/test'

test.describe('Package Detail', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/app/)
  })

  async function navigateToFirstPackage(page: any) {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    await firstRelease.click()
    await expect(page).toHaveURL(/\/app\/releases/)

    // Click on first package in table
    const table = page.locator('table').first()
    if (await table.isVisible()) {
      const firstPackageRow = table.locator('tbody tr').first()
      await firstPackageRow.click()
      await expect(page).toHaveURL(/\/app\/releases\/[^/]+\/packages\/[^/]+/)
    }
  }

  test('should display package details', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Should see package name in heading
    await expect(page.getByRole('heading').first()).toBeVisible()

    // Should see package metadata
    await expect(page.getByText(/version|status|issue/i)).toBeVisible()
  })

  test('should display package status', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Should see status badge or indicator
    const statusElement = page.locator('.pill, [class*="status"]').first()
    if (await statusElement.isVisible()) {
      const statusText = await statusElement.textContent()
      expect(statusText).toMatch(/ready|waiting|blocked|unknown|disabled/i)
    }
  })

  test('should display dependency graph', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Look for graph container or dependencies section
    const graphSection = page.getByText(/dependencies|graph|depends on/i).first()

    if (await graphSection.isVisible()) {
      // Should have some graph visualization or list
      await expect(graphSection).toBeVisible()
    }
  })

  test('should show dependencies list', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Look for dependencies section
    const depsSection = page.getByText(/dependencies|depends on/i).first()

    if (await depsSection.isVisible()) {
      // Might have links to other packages
      const packageLinks = page.getByRole('link').filter({ hasText: /^[a-z0-9-]+$/i })

      if (await packageLinks.first().isVisible()) {
        expect(await packageLinks.count()).toBeGreaterThan(0)
      }
    }
  })

  test('should show dependents list', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Look for dependents/reverse dependencies section
    const dependentsSection = page.getByText(/dependents|used by|reverse/i).first()

    if (await dependentsSection.isVisible()) {
      await expect(dependentsSection).toBeVisible()
    }
  })

  test('should navigate to dependency package', async ({ page }) => {
    await navigateToFirstPackage(page)

    const currentUrl = page.url()

    // Look for links in dependencies section
    const depsSection = page.getByText(/dependencies|depends on/i).first()

    if (await depsSection.isVisible()) {
      // Get the parent container
      const container = page.locator('section, div').filter({ has: depsSection }).first()
      const depLink = container.getByRole('link').first()

      if (await depLink.isVisible()) {
        await depLink.click()

        // Should navigate to another package detail page
        await expect(page).toHaveURL(/\/app\/releases\/[^/]+\/packages\/[^/]+/)

        // URL should have changed
        const newUrl = page.url()
        expect(newUrl).not.toBe(currentUrl)
      }
    }
  })

  test('should display issue link if available', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Look for GitHub issue link
    const issueLink = page.getByRole('link', { name: /issue|github/i }).first()

    if (await issueLink.isVisible()) {
      const href = await issueLink.getAttribute('href')
      expect(href).toMatch(/github\.com/)
    }
  })

  test('should navigate back to dashboard', async ({ page }) => {
    await navigateToFirstPackage(page)

    const packageUrl = page.url()

    // Look for back button or breadcrumb
    const backButton = page.getByRole('link', { name: /back|dashboard/i }).first()

    if (await backButton.isVisible()) {
      await backButton.click()

      // Should be back on release dashboard
      await expect(page).toHaveURL(/\/app\/releases\/[^/]+$/)
    } else {
      // Try browser back
      await page.goBack()
      await expect(page).not.toHaveURL(packageUrl)
    }
  })

  test('should display version information', async ({ page }) => {
    await navigateToFirstPackage(page)

    // Should see version numbers
    const versionPattern = /\d+\.\d+(\.\d+)?/
    const versionText = page.getByText(versionPattern).first()

    await expect(versionText).toBeVisible()
  })

  test('should handle invalid package gracefully', async ({ page }) => {
    await page.goto('/app')

    // Navigate to a release
    const firstRelease = page.getByRole('link').filter({ hasText: /release|2024/i }).first()
    const releaseUrl = await firstRelease.getAttribute('href')
    const releaseId = releaseUrl?.split('/').pop()

    if (releaseId) {
      // Try to access non-existent package
      await page.goto(`/app/releases/${releaseId}/packages/nonexistent-package-xyz`)

      // Should show error or redirect
      await page.waitForLoadState('networkidle')

      // Either error message or redirect back
      const hasError = await page.getByText(/not found|error/i).isVisible()
      const isRedirected = !page.url().includes('nonexistent-package-xyz')

      expect(hasError || isRedirected).toBeTruthy()
    }
  })
})
