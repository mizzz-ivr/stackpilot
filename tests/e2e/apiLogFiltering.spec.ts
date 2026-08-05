import { expect, test } from './fixtures/electronApp';

const fixturePath = '/users/customer-123/orders?trace=public';

test('API通信を検索・絞り込み・ピン留めできる', async ({ appWindow }) => {
  await expect(appWindow.getByText('API Inspector')).toBeVisible();
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();
  await expect(appWindow.getByText('1 / 1件')).toBeVisible();

  const searchInput = appWindow.getByRole('searchbox', { name: 'API通信を検索', exact: true });
  await searchInput.fill('customer-123');
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();

  await searchInput.fill('accept');
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();

  await searchInput.fill('一致しないキーワード');
  await expect(appWindow.getByText('検索・絞り込み条件に一致する通信はありません。')).toBeVisible();
  await expect(appWindow.getByText('0 / 1件')).toBeVisible();

  await appWindow.getByRole('button', { name: '検索キーワードを消去', exact: true }).click();
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();

  const pinButton = appWindow.getByRole('button', { name: '通信をピン留め', exact: true });
  await pinButton.click();
  await expect(appWindow.getByRole('button', { name: '通信のピン留めを解除', exact: true })).toBeVisible();

  const pinnedOnlyButton = appWindow.getByRole('button', { name: 'ピン 1', exact: true });
  await expect(pinnedOnlyButton).toBeEnabled();
  await pinnedOnlyButton.click();
  await expect(pinnedOnlyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();

  await appWindow.getByLabel('methodで絞り込み', { exact: true }).selectOption('POST');
  await expect(appWindow.getByText('検索・絞り込み条件に一致する通信はありません。')).toBeVisible();

  await appWindow.getByRole('button', { name: '検索・絞り込み条件を解除', exact: true }).click();
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();
  await expect(appWindow.getByRole('button', { name: 'ピン 1', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await appWindow.getByLabel('statusで絞り込み', { exact: true }).selectOption('server-error');
  await expect(appWindow.getByText('検索・絞り込み条件に一致する通信はありません。')).toBeVisible();
  await appWindow.getByLabel('statusで絞り込み', { exact: true }).selectOption('success');
  await expect(appWindow.getByText(fixturePath, { exact: true })).toBeVisible();
});
