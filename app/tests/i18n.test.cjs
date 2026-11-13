const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

test('i18n translates exact strings, parameterized templates, and mixed JSX primitive arrays in Vietnamese mode', () => {
  const load = createLoader();
  const {
    getLanguage,
    getLocale,
    setLanguage,
    setLanguageForTests,
    onLanguageChange,
    t,
    translateText,
    translateNode,
    localizeServerMessage,
    localizedNotificationText,
  } = load('src/shared/i18n.ts');

  // Default in non-Vietnamese environment is English
  assert.equal(getLanguage(), 'en');
  assert.equal(getLocale(), 'en-US');
  assert.equal(t('Sign In'), 'Sign In');
  assert.equal(translateText('Autonomous Fleet Operator Console'), 'Autonomous Fleet Operator Console');

  const events = [];
  const unsubscribe = onLanguageChange((lang) => events.push(lang));

  setLanguage('vi');
  assert.equal(getLanguage(), 'vi');
  assert.equal(getLocale(), 'vi-VN');
  assert.deepEqual(events, ['vi']);

  // Exact lookup
  assert.equal(t('Sign In'), 'Đăng nhập');
  assert.equal(t('Appearance'), 'Giao diện');
  assert.equal(t('Language'), 'Ngôn ngữ');
  assert.equal(translateText('Autonomous Fleet Operator Console'), 'Bảng điều khiển vận hành đội robot tự hành');

  // Leading/trailing whitespace preserved
  assert.equal(translateText('  Sign Out  '), '  Đăng xuất  ');

  // Parameterized t() lookup
  assert.equal(
    t('Signed in as {name} ({zone})', { name: 'Alex Tran', zone: t('Inbound Dock 01') }),
    'Đã đăng nhập: Alex Tran (Cửa nhập 01)',
  );

  // Automatic template pattern matching via translateText()
  assert.equal(
    translateText('Showing 5 of 20 matching containers. Narrow the search to find other containers.'),
    'Hiển thị 5 / 20 container khớp. Hãy thu hẹp tìm kiếm để tìm các container khác.',
  );
  assert.equal(
    translateText('Container 2 Of 8'),
    'Container 2 / 8',
  );
  assert.equal(
    translateText('3 selected · 12 matching containers'),
    'Đã chọn 3 · 12 container khớp',
  );
  assert.equal(translateText('1 container'), '1 container');
  assert.equal(translateText('Reference (Optional)'), 'Số tham chiếu (Tùy chọn)');
  assert.equal(translateText('Note (Optional)'), 'Ghi chú (Tùy chọn)');
  assert.equal(translateText('Back To Vouchers'), 'Quay lại danh sách phiếu');
  assert.equal(translateText('No Published Warehouse'), 'Chưa có kho phát hành bản đồ');
  assert.equal(
    translateText('The published warehouse has changed. Return to Stock Vouchers before creating a new draft.'),
    'Kho có bản đồ phát hành đã thay đổi. Quay lại danh sách phiếu kho trước khi tạo phiếu nháp mới.',
  );
  assert.equal(t('Increase Container Count'), 'Tăng số lượng thùng');
  assert.equal(t('Decrease Container Count'), 'Giảm số lượng thùng');

  // Mixed JSX primitive array children via translateNode()
  assert.equal(
    translateNode(['Showing ', 5, ' of ', 20, ' matching containers. Narrow the search to find other containers.']),
    'Hiển thị 5 / 20 container khớp. Hãy thu hẹp tìm kiếm để tìm các container khác.',
  );
  assert.equal(
    translateNode([4, ' codes allocated · ', 10, ' requested']),
    'Đã cấp 4 mã · yêu cầu 10',
  );

  // Server error code localization
  assert.equal(
    localizeServerMessage('current_password_incorrect', 'Current password is incorrect.'),
    'Mật khẩu tạm không đúng.',
  );
  assert.equal(
    localizeServerMessage('container_not_eligible', "Container 'CNT-104' is not eligible for transport."),
    "Container 'CNT-104' không đủ điều kiện để vận chuyển.",
  );

  // Notification localization
  const n1 = localizedNotificationText({
    title: 'Job JOB-1042 is waiting for a person',
    content: 'The step "Confirm Load" needs someone to confirm it and has waited 12 min.',
  });
  assert.equal(n1.title, 'Công việc JOB-1042 đang chờ người thao tác');
  assert.equal(n1.content, 'Bước "Confirm Load" cần có người xác nhận và đã chờ 12 phút.');

  const n2 = localizedNotificationText({
    title: 'Issue ISS-204 was assigned to you',
    content: 'Robot AMR-01 reported an error',
  });
  assert.equal(n2.title, 'Sự cố ISS-204 đã được giao cho bạn');
  assert.equal(n2.content, 'Robot AMR-01 báo lỗi');

  unsubscribe();
  setLanguageForTests('en');
});

test('saveStoredLanguage and getStoredLanguage persist and validate language preferences', async () => {
  const memoryStore = new Map();
  const load = createLoader({
    'react-native': { Platform: { OS: 'ios' } },
    'expo-secure-store': {
      getItemAsync: async (key) => memoryStore.get(key) ?? null,
      setItemAsync: async (key, val) => { memoryStore.set(key, val); },
      deleteItemAsync: async (key) => { memoryStore.delete(key); },
    },
  });
  const { getStoredLanguage, saveStoredLanguage, LANGUAGE_KEY } = load('src/shared/api/secureStore.ts');

  assert.equal(await getStoredLanguage(), null);

  await saveStoredLanguage('vi');
  assert.equal(await getStoredLanguage(), 'vi');

  await saveStoredLanguage('en');
  assert.equal(await getStoredLanguage(), 'en');

  memoryStore.set(LANGUAGE_KEY, 'invalid-lang');
  assert.equal(await getStoredLanguage(), null);
});
