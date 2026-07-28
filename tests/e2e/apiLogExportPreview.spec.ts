import { expect, readSavedExport, test } from './fixtures/electronApp';

const fixtureUrl = 'https://api.example.test/users/customer-123/orders?trace=public';

test('path segmentを再プレビューへ反映し、確認済み成果物を保存できる', async ({
  appWindow,
  e2ePaths
}) => {
  await expect(appWindow).toHaveTitle('stackpilot');
  await expect(appWindow).toHaveURL(/^file:/);
  await expect(appWindow.getByText('API Inspector')).toBeVisible();
  await expect(appWindow.getByText('BrowserView領域はElectron側で描画')).toBeVisible();

  const jsonPreviewButton = appWindow.getByRole('button', { name: 'JSON確認' });
  await expect(jsonPreviewButton).toBeEnabled();
  await jsonPreviewButton.click();

  const dialog = appWindow.getByRole('dialog', { name: '保存前プレビュー' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(fixtureUrl, { exact: true })).toBeVisible();

  const sha256Value = dialog.getByText('SHA-256').locator('..').locator('p').nth(1);
  await expect(sha256Value).toHaveText(/^[a-f0-9]{64}$/);
  const initialSha256 = await sha256Value.innerText();

  const saveButton = dialog.getByRole('button', { name: 'この内容を保存' });
  await expect(saveButton).toBeEnabled();

  const pathSegmentGroup = dialog.getByLabel('GET通信のpath segment');
  await pathSegmentGroup.getByRole('button', { name: 'customer-123', exact: true }).click();

  await expect(dialog.getByLabel('URL path segment値（大文字小文字を区別）')).toHaveValue('customer-123');
  await expect(dialog.getByText('入力内容はまだ成果物へ反映されていません。')).toBeVisible();
  await expect(saveButton).toBeDisabled();

  await dialog.getByRole('button', { name: '追加ルールで再プレビュー' }).click();

  await expect(dialog.getByText('入力内容は現在のプレビューへ反映済みです。')).toBeVisible();
  await expect(saveButton).toBeEnabled();
  await expect(dialog.getByText('追加path segmentを伏字化').locator('..').getByText('2件')).toBeVisible();
  await expect(dialog.getByText(/%3Credacted-path%3E/).first()).toBeVisible();
  await expect(sha256Value).toHaveText(/^[a-f0-9]{64}$/);

  const updatedSha256 = await sha256Value.innerText();
  expect(updatedSha256).not.toBe(initialSha256);

  await saveButton.click();

  await expect(dialog).toBeHidden();
  await expect(
    appWindow.getByRole('status').filter({ hasText: '確認済みの内容で保存しました' })
  ).toBeVisible();

  const savedExport = await readSavedExport(e2ePaths);
  expect(savedExport.content).not.toContain('customer-123');
  expect(savedExport.content).toContain('%3Credacted-path%3E');
  expect(savedExport.sha256).toBe(updatedSha256);
});
