import { expect, test } from './fixtures/electronApp';

const successPath = '/users/customer-123/orders?trace=public';
const failurePath = '/health?region=jp';

test('選択した2件のAPI通信を比較し、差分と解除操作を確認できる', async ({ appWindow }) => {
  await expect(appWindow.getByText('API Inspector')).toBeVisible();
  await expect(appWindow.getByText(successPath, { exact: true })).toBeVisible();
  await expect(appWindow.getByText(failurePath, { exact: true })).toBeVisible();

  const comparisonDock = appWindow.getByRole('region', { name: 'API通信比較操作', exact: true });
  await expect(comparisonDock.getByText('0 / 2', { exact: true })).toBeVisible();

  await appWindow.getByText(successPath, { exact: true }).locator('..').click();
  await comparisonDock.getByRole('button', { name: '選択中の通信を比較対象へ追加', exact: true }).click();
  await expect(comparisonDock.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(comparisonDock.getByText(successPath, { exact: true })).toBeVisible();

  await appWindow.getByText(failurePath, { exact: true }).locator('..').click();
  await comparisonDock.getByRole('button', { name: '選択中の通信を比較対象へ追加', exact: true }).click();
  await expect(comparisonDock.getByText('2 / 2', { exact: true })).toBeVisible();
  await expect(comparisonDock.getByText(failurePath, { exact: true })).toBeVisible();

  await comparisonDock.getByRole('button', { name: '選択した2件のAPI通信を比較', exact: true }).click();

  const dialog = appWindow.getByRole('dialog', { name: 'API通信比較', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(successPath, { exact: true })).toBeVisible();
  await expect(dialog.getByText(failurePath, { exact: true })).toBeVisible();

  const methodRow = dialog.getByRole('row').filter({ hasText: 'Method' });
  await expect(methodRow.getByText('GET', { exact: true })).toBeVisible();
  await expect(methodRow.getByText('POST', { exact: true })).toBeVisible();
  await expect(methodRow.getByText('差分あり', { exact: true })).toBeVisible();

  const statusRow = dialog.getByRole('row').filter({ hasText: 'Status' });
  await expect(statusRow.getByText('200', { exact: true })).toBeVisible();
  await expect(statusRow.getByText('503', { exact: true })).toBeVisible();
  await expect(statusRow.getByText('差分あり', { exact: true })).toBeVisible();

  const retryHeader = dialog.getByText('retry-after', { exact: true }).locator('..');
  await expect(retryHeader.getByText('比較Bのみ', { exact: true })).toBeVisible();
  await expect(dialog.getByText('30', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: '比較Bから通信を解除', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(comparisonDock.getByText('1 / 2', { exact: true })).toBeVisible();
  await expect(comparisonDock.getByText('未選択', { exact: true })).toBeVisible();

  await comparisonDock.getByRole('button', { name: 'API通信の比較対象をすべて解除', exact: true }).click();
  await expect(comparisonDock.getByText('0 / 2', { exact: true })).toBeVisible();
  await expect(comparisonDock.getByText('未選択', { exact: true })).toHaveCount(2);
});
