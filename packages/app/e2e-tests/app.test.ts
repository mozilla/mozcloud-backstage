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
  // After sign-in `/` is mounted to the home plugin
  // (app-config.yaml `app.extensions: page:home: { config: { path: / } }`).
  await expect(
    page.getByRole('heading', { name: 'Welcome to Mozilla Backstage' }),
  ).toBeVisible();
}

test('App renders the welcome page and signs in', async ({ page }) => {
  await signInAsGuest(page);
});

test('Catalog page renders', async ({ page }) => {
  await signInAsGuest(page);
  await page.goto('/catalog');
  // Heading text is `<organization.name> Catalog` from app-config.yaml.
  await expect(page.getByRole('heading', { name: /Catalog$/ })).toBeVisible();
});

test('Sidebar exposes the core navigation items', async ({ page }) => {
  await signInAsGuest(page);
  // The new sidebar adds a separate Catalog item alongside Home.
  for (const label of ['Home', 'Catalog', 'APIs', 'Docs', 'Create...']) {
    await expect(page.getByRole('link', { name: label }).first()).toBeVisible();
  }
});

test('Scaffolder template list renders', async ({ page }) => {
  await signInAsGuest(page);
  await page.goto('/create');
  // The /alpha scaffolder plugin's index page header is just "Create";
  // Templates is the first tab.
  await expect(page.getByRole('heading', { name: 'Create' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Templates/i })).toBeVisible();
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
