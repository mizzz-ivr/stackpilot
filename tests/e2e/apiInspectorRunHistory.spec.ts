import { expect, test } from './fixtures/electronApp';

const sourcePath = '/users/customer-123/orders?trace=public';
const resultPath = '/users/customer-123/orders?trace=edited&flag=';
const uncapturedResultPath = '/users/customer-123/orders?trace=fallback&__stackpilotE2eCapture=miss';

test('再実行履歴をピン留めし、Query条件と比較対象を復元できる', async ({ appWindow }) => {
  await expect(appWindow.getByText('API Inspector')).toBeVisible();

  await appWindow.getByText(sourcePath, { exact: true }).locator('..').click();
  await appWindow.getByRole('button', { name: /Replayを確認/ }).click();

  const runDialog = appWindow.getByRole('dialog', { name: /Request Replay/ });
  const firstQueryValue = runDialog.getByRole('textbox', { name: 'Query値 1', exact: true });
  await firstQueryValue.fill('edited');
  await runDialog.getByRole('button', { name: 'Query parameterを追加', exact: true }).click();
  await runDialog.getByRole('textbox', { name: 'Query名 2', exact: true }).fill('flag');
  await runDialog.getByRole('button', { name: /安全に再実行/ }).click();

  const comparisonDialog = appWindow.getByRole('dialog', { name: 'API通信比較', exact: true });
  await expect(comparisonDialog).toBeVisible();
  await comparisonDialog.getByRole('button', { name: 'API通信比較を閉じる', exact: true }).click();

  const comparisonControls = appWindow.getByRole('region', { name: 'API通信比較操作', exact: true });
  await comparisonControls.getByRole('button', { name: 'API通信の比較対象をすべて解除', exact: true }).click();

  const historyControls = appWindow.getByRole('region', { name: 'API Inspector実行履歴', exact: true });
  await historyControls.getByRole('button', { name: '再実行履歴を開く', exact: true }).click();

  const historyRegion = appWindow.getByRole('region', { name: '再実行履歴', exact: true });
  await expect(historyRegion.getByText(resultPath, { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('HTTP 204', { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('Query 2件', { exact: true })).toBeVisible();

  const pinButton = historyRegion.getByRole('button', { name: '再実行履歴をピン留め', exact: true });
  await expect(pinButton).toHaveAttribute('aria-pressed', 'false');
  await pinButton.click();
  const unpinButton = historyRegion.getByRole('button', { name: '再実行履歴のピン留めを解除', exact: true });
  await expect(unpinButton).toHaveAttribute('aria-pressed', 'true');

  await historyRegion.getByRole('button', {
    name: '履歴のQuery条件をRequest Replayへ復元',
    exact: true
  }).click();

  await expect(runDialog).toBeVisible();
  await expect(runDialog.getByRole('status')).toContainText('再実行履歴のQuery条件2件をプレビューへ復元しました');
  await expect(runDialog.getByRole('textbox', { name: 'Query名 1', exact: true })).toHaveValue('trace');
  await expect(runDialog.getByRole('textbox', { name: 'Query値 1', exact: true })).toHaveValue('edited');
  await expect(runDialog.getByRole('textbox', { name: 'Query名 2', exact: true })).toHaveValue('flag');
  await expect(runDialog.getByRole('textbox', { name: 'Query値 2', exact: true })).toHaveValue('');
  await expect(runDialog.getByLabel('Replay URL', { exact: true })).toContainText(resultPath);
  await runDialog.getByRole('button', { name: '閉じる', exact: true }).click();

  await expect(historyRegion).toBeVisible();
  await expect(unpinButton).toHaveAttribute('aria-pressed', 'true');
  await unpinButton.click();
  await expect(historyRegion.getByRole('button', {
    name: '再実行履歴をピン留め',
    exact: true
  })).toHaveAttribute('aria-pressed', 'false');

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

test('結果ログを捕捉できなくても成功Replayを履歴へ残しQuery条件を復元できる', async ({ appWindow }) => {
  await expect(appWindow.getByText('API Inspector')).toBeVisible();

  await appWindow.getByText(sourcePath, { exact: true }).locator('..').click();
  await appWindow.getByRole('button', { name: /Replayを確認/ }).click();

  const runDialog = appWindow.getByRole('dialog', { name: /Request Replay/ });
  await runDialog.getByRole('textbox', { name: 'Query値 1', exact: true }).fill('fallback');
  await runDialog.getByRole('button', { name: 'Query parameterを追加', exact: true }).click();
  await runDialog.getByRole('textbox', { name: 'Query名 2', exact: true }).fill('__stackpilotE2eCapture');
  await runDialog.getByRole('textbox', { name: 'Query値 2', exact: true }).fill('miss');
  await runDialog.getByRole('button', { name: /安全に再実行/ }).click();

  await expect(runDialog.getByRole('status')).toContainText('再実行条件は履歴に残しました');
  await expect(runDialog.getByRole('status')).toContainText('HTTP 202');
  await runDialog.getByRole('button', { name: '閉じる', exact: true }).click();

  const historyControls = appWindow.getByRole('region', { name: 'API Inspector実行履歴', exact: true });
  await historyControls.getByRole('button', { name: '再実行履歴を開く', exact: true }).click();
  const historyRegion = appWindow.getByRole('region', { name: '再実行履歴', exact: true });

  await expect(historyRegion.getByText(uncapturedResultPath, { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('HTTP 202', { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('Query 2件', { exact: true })).toBeVisible();
  await expect(historyRegion.getByText('結果ログ未捕捉', { exact: true })).toBeVisible();
  await expect(historyRegion.getByRole('button', {
    name: '履歴の元通信と結果通信を比較対象へ復元',
    exact: true
  })).toBeDisabled();

  await historyRegion.getByRole('button', {
    name: '履歴のQuery条件をRequest Replayへ復元',
    exact: true
  }).click();

  await expect(runDialog).toBeVisible();
  await expect(runDialog.getByRole('textbox', { name: 'Query名 1', exact: true })).toHaveValue('trace');
  await expect(runDialog.getByRole('textbox', { name: 'Query値 1', exact: true })).toHaveValue('fallback');
  await expect(runDialog.getByRole('textbox', { name: 'Query名 2', exact: true })).toHaveValue('__stackpilotE2eCapture');
  await expect(runDialog.getByRole('textbox', { name: 'Query値 2', exact: true })).toHaveValue('miss');
  await expect(runDialog.getByLabel('Replay URL', { exact: true })).toContainText(uncapturedResultPath);
});
