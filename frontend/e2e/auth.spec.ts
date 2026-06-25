import { test, expect } from '@playwright/test'

test.describe('Authentication', { tag: '@e2e' }, () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/username/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill in credentials
    await page.getByLabel(/username/i).fill('admin')
    await page.getByLabel(/password/i).fill('admin123')

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should redirect to app after successful login
    await expect(page).toHaveURL(/\/app/)

    // Should see authenticated content
    await expect(page.getByText(/releases/i)).toBeVisible()
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login')

    // Fill in invalid credentials
    await page.getByLabel(/username/i).fill('invalid')
    await page.getByLabel(/password/i).fill('wrong')

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click()

    // Should show error message
    await expect(page.getByText(/invalid credentials|login failed/i)).toBeVisible()

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing protected route', async ({ page }) => {
    // Try to access protected route without authentication
    await page.goto('/app/releases/test')

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('should persist session after page reload', async ({ page, context }) => {
    // Login first
    await page.goto('/login')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/app/)

    // Reload page
    await page.reload()

    // Should still be authenticated
    await expect(page).toHaveURL(/\/app/)
    await expect(page.getByText(/releases/i)).toBeVisible()
  })

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.getByLabel(/username/i).fill('admin')
    await page.getByLabel(/password/i).fill('admin123')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/app/)

    // Click logout button
    await page.getByRole('button', { name: /sign out|logout/i }).click()

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)

    // Try to access protected route
    await page.goto('/app')

    // Should be redirected back to login
    await expect(page).toHaveURL(/\/login/)
  })
})
