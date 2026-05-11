/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect, Page } from '@playwright/test';

async function signInAsGuest(page: Page) {
  await page.goto('/');
  const enterButton = page.getByRole('button', { name: 'Enter' });
  await expect(enterButton).toBeVisible();
  await enterButton.click();
  // The legacy App.tsx redirects `/` to `/catalog`. Heading text is
  // `<organization.name> Catalog` from app-config.yaml.
  await expect(page.getByRole('heading', { name: /Catalog$/ })).toBeVisible();
}

test('App renders the welcome page and signs in', async ({ page }) => {
  await signInAsGuest(page);
});

test('Sidebar exposes the core navigation items', async ({ page }) => {
  await signInAsGuest(page);
  // Each sidebar item renders an <a> with the visible label as its name.
  for (const label of ['Home', 'APIs', 'Docs', 'Create...']) {
    await expect(page.getByRole('link', { name: label }).first()).toBeVisible();
  }
});

test('Scaffolder template list renders', async ({ page }) => {
  await signInAsGuest(page);
  await page.goto('/create');
  await expect(
    page.getByRole('heading', { name: /Create a New Component|Templates/i }),
  ).toBeVisible();
});

test('Settings page renders for guest user', async ({ page }) => {
  await signInAsGuest(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('API explorer page renders', async ({ page }) => {
  await signInAsGuest(page);
  await page.goto('/api-docs');
  await expect(page.getByRole('heading', { name: /APIs/ })).toBeVisible();
});
