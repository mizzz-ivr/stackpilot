import { expect, test } from './fixtures/electronApp';

const successPath = '/users/customer-123/orders?trace=public';
const failurePath = '/health?region=jp';
const editedReplayUrl = 'https://api.example.test/users/customer-123/orders?trace=edited&flag=';
const editedReplayPath = '/users/customer-123/orders?trace=edited&flag=';

test('GET通信のqueryを編集して再実行後に元通信との比較を自動表示し、POST通信は拒否する', async ({ appWindow }) => {
  await expect(appWindow.getByText('API Inspector')).toBeVisible();

  await appWindow.getByText(successPath, { exact: true }).locator('..').click();
  const replayPreviewButton = appWindow.getByRole('button', {
    name: '選択中のAPI通信のRequest Replayを確認',
    exact: true
  });
  await expect(replayPreviewButton).toBeEnabled();
  await replayPreviewButton.click();

  const dialog = appWindow.getByRole('dialog', { name: 'Request Replay', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('GET', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Authorization、Cookie、custom headerはコピーしません/)).toBeVisible();
  await expect(dialog.getByText(/originとpathは元ログからmain processが再構築/)).toBeVisible();
  await expect(dialog.getByText(/現在のブラウザセッションCookie/)).toBeVisible();
  await expect(dialog.getByText(/元通信との比較画面を自動で開きます/)).toBeVisible();

  const replayButton = dialog.getByRole('button', {
    name: '選択したAPI通信を安全に再実行',
    exact: true
  });
  const firstQueryName = dialog.getByRole('textbox', { name: 'Query名 1', exact: true });
  const firstQueryValue = dialog.getByRole('textbox', { name: 'Query値 1', exact: true });
  await expect(firstQueryName).toHaveValue('trace');
  await expect(firstQueryValue).toHaveValue('public');

  await firstQueryValue.fill('edited');
  const changedSummary = dialog.getByText('変更', { exact: true }).locator('..');
  await expect(changedSummary.getByText('1', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Query parameterを追加', exact: true }).click();

  await expect(replayButton).toBeDisabled();
  await expect(dialog.getByText('Query名は空にできません。', { exact: true })).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Query名 2', exact: true }).fill('flag');
  await expect(dialog.getByRole('textbox', { name: 'Query値 2', exact: true })).toHaveValue('');
  await expect(replayButton).toBeEnabled();
  await expect(dialog.getByText(editedReplayUrl, { exact: true })).toBeVisible();

  const addedSummary = dialog.getByText('追加', { exact: true }).locator('..');
  await expect(addedSummary.getByText('1', { exact: true })).toBeVisible();
  await expect(changedSummary.getByText('1', { exact: true })).toBeVisible();

  await replayButton.click();
  await expect(dialog).toBeHidden();

  const comparisonDialog = appWindow.getByRole('dialog', { name: 'API通信比較', exact: true });
  await expect(comparisonDialog).toBeVisible();
  await expect(comparisonDialog.getByText('比較A', { exact: true }).first()).toBeVisible();
  await expect(comparisonDialog.getByText('比較B', { exact: true }).first()).toBeVisible();
  await expect(comparisonDialog.getByText(successPath, { exact: true }).first()).toBeVisible();
  await expect(comparisonDialog.getByText(editedReplayPath, { exact: true }).first()).toBeVisible();
  await expect(comparisonDialog.getByRole('table', { name: '通信概要の比較', exact: true })).toBeVisible();

  await comparisonDialog.getByRole('button', { name: 'API通信比較を閉じる', exact: true }).click();
  await expect(comparisonDialog).toBeHidden();

  await appWindow.getByText(failurePath, { exact: true }).locator('..').click();
  await expect(replayPreviewButton).toBeDisabled();
  await expect(appWindow.getByText('安全な再実行MVPではGET / HEADだけを再実行できます。', { exact: true })).toBeVisible();
});