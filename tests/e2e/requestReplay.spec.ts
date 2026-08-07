import { expect, test } from './fixtures/electronApp';

const successPath = '/users/customer-123/orders?trace=public';
const failurePath = '/health?region=jp';

test('GET通信をプレビューして安全に再実行し、POST通信は拒否する', async ({ appWindow }) => {
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
  await expect(dialog.getByText(/現在のブラウザセッションCookie/)).toBeVisible();

  await dialog.getByRole('button', { name: '選択したAPI通信を安全に再実行', exact: true }).click();
  await expect(dialog.getByText(/再実行しました。HTTP 204 \/ 42ms/)).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(dialog).toBeHidden();

  await appWindow.getByText(failurePath, { exact: true }).locator('..').click();
  await expect(replayPreviewButton).toBeDisabled();
  await expect(appWindow.getByText('安全な再実行MVPではGET / HEADだけを再実行できます。', { exact: true })).toBeVisible();
});
