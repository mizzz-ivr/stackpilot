import { expect, test } from './fixtures/electronApp';

const sourcePath = '/users/customer-123/orders?trace=public';
const resultPath = '/users/customer-123/orders?trace=history&flag=';

test('再実行結果を履歴へ記録し、比較対象へ復元できる', async ({ appWindow }) => {
  await expect(appWindow.getByText('API Inspector')).toBeVisible();

  await appWindow.getByText(sourcePath, { exact: true }).locator('..').click();
  await appWindow.getByRole('button', { name: /Replayを確認/ }).click();

  const runDialog = appWindow.getByRole('dialog', { name: /Request Replay/ });
  const firstQueryValue = runDialog.getByRole('textbox', { name: 'Query値 1', exact: true });
  await firstQueryValue.fill('history');
  await runDialog.getByRole('button', { name: 'Query parameterを追加', exact: true }).click();
  await runDialog.getByRole('textbox', { name: 'Query名 2', exact: true }).fill('flag');
  await runDialog.getByRole('button', { name: /安全に再実行/ }).click();

  const comparisonDialog = appWindow.getByRole('dialog', { name: 'API通信比較', exact: true });
  await expect(comparisonDialog).toBeVisible();
  await comparisonDialog.getByRole('button', { name: 'API通信比較を閉じる', exact: true }).click();

  const comparisonControls = appWindow.getByRole('region', { name: 'API通信比較操作', exact: true });
  await comparisonControls.getByRole('button', { name: 'API通信の比較対象をすべて解除', exact: true }).click();

  const historyControls = appWindow.getByRole('region', { name: 'API Inspector実行履歴', exact: true });
  await historyControls.getByRole('button', { name: '▸ 再実行履歴', exact: true }).click();

  const historyRegion = appWindow.getByRole('region', { name: '再実行履歴', exact: true });
  await expect(historyRegion.getByText(resultPath, { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('HTTP 204', { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('Query 2件', { exact: true })).toBeVisible();

  await historyRegion.getByRole('button', {
    name: '履歴の元通信と結果通信を比較対象へ復元',
    exact: true
  }).click();

  await expect(comparisonControls.getByText(sourcePath, { exact: true })).toBeVisible();
  await expect(comparisonControls.getByText(resultPath, { exact: true })).toBeVisible();
  await comparisonControls.getByRole('button', {
    name: '選択した2件のAPI通信を比較',
    exact: true
  }).click();

  await expect(comparisonDialog).toBeVisible();
  await expect(comparisonDialog.getByText(sourcePath, { exact: true }).first()).toBeVisible();
  await expect(comparisonDialog.getByText(resultPath, { exact: true }).first()).toBeVisible();
});