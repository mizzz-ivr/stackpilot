import { expect, test } from './fixtures/electronApp';

const successPath = '/users/customer-123/orders?trace=public';
const failurePath = '/health?region=jp';
const editedReplayUrl = 'https://api.example.test/users/customer-123/orders?trace=edited&flag=';

test('GET通信のqueryを編集して安全に再実行し、POST通信は拒否する', async ({ appWindow }) => {
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

  const replayButton = dialog.getByRole('button', {
    name: '選択したAPI通信を安全に再実行',
    exact: true
  });
  const firstQueryName = dialog.getByRole('textbox', { name: 'Query名 1', exact: true });
  const firstQueryValue = dialog.getByRole('textbox', { name: 'Query値 1', exact: true });
  await expect(firstQueryName).toHaveValue('trace');
  await expect(firstQueryValue).toHaveValue('public');

  await firstQueryValue.fill('edited');
  await expect(dialog.getByText('1', { exact: true }).nth(1)).toBeVisible();
  await dialog.getByRole('button', { name: 'Query parameterを追加', exact: true }).click();

  await expect(replayButton).toBeDisabled();
  await expect(dialog.getByText('Query名は空にできません。', { exact: true })).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Query名 2', exact: true }).fill('flag');
  await expect(dialog.getByRole('textbox', { name: 'Query値 2', exact: true })).toHaveValue('');
  await expect(replayButton).toBeEnabled();
  await expect(dialog.getByText(editedReplayUrl, { exact: true })).toBeVisible();

  await replayButton.click();
  await expect(dialog.getByText(/再実行しました。HTTP 204 \/ 42ms/)).toBeVisible();
  await expect(dialog.getByText(/Query変更2件を適用しました/)).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(dialog).toBeHidden();

  await appWindow.getByText(failurePath, { exact: true }).locator('..').click();
  await expect(replayPreviewButton).toBeDisabled();
  await expect(appWindow.getByText('安全な再実行MVPではGET / HEADだけを再実行できます。', { exact: true })).toBeVisible();
});
