// tests/login.spec.js
import { test, expect } from '@playwright/test';

test.describe('Login page E2E tests', () => {
  test('user login redirects to dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173/login');

    await page.getByLabel('Email address').fill('alex.demo@example.com');
    await page.getByLabel('Password').fill('DemoMeals123!');

    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Welcome to FoodForThought' })).toBeVisible();
  });

  test('admin login redirects to admin dashboard', async ({ page }) => {
    await page.goto('http://localhost:5173/login');

    await page.getByLabel('Email address').fill('admin@foodforthought.com');
    await page.getByLabel('Password').fill('AdminPass123!');

    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/admindashboard/);
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  });

  test('invalid login shows an error', async ({ page }) => {
    await page.goto('http://localhost:5173/login');

    await page.getByLabel('Email address').fill('user@example.com');
    await page.getByLabel('Password').fill('wrongpassword');

    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i);
  });
});