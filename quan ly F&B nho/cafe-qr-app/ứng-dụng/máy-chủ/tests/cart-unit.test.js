// Unit test (không cần CSDL) — giỏ hàng phía khách `js/cart.js`: F-081 (ADR-039 D-180) thêm món có ghi chú / số lượng từ bảng chọn,
// F-082 (ADR-040) sửa dòng trong giỏ (bấm món → bảng chọn → "Cập nhật"): thay tại chỗ, giữ vị trí, gộp khi trùng, giới hạn 50.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, lineKey, MAX_QTY, replaceLine, toOrderItems } from '../../giao-diện/public/js/cart.js';

const bacXiu = { id: 3, name: 'Bạc xỉu', price: 32000, itemType: 'ITEM' };
const water = { id: 7, name: 'Nước suối', price: 10000, itemType: 'ITEM' };
const sizeL = { optionIds: [12], optionLabels: ['Size L'], optionDelta: 5000 };
const sizeM = { optionIds: [11], optionLabels: ['Size M'], optionDelta: 0 };
const summary = (lines) => lines.map((l) => [l.key, l.name, l.optionLabels.join('+'), l.note, l.quantity, l.price]);

describe('Giỏ hàng — bảng chọn món và sửa món trong giỏ (F-081, F-082)', () => {
  test('AC-082-01: thêm từ bảng chọn — cùng món + tùy chọn + ghi chú cộng dồn, ghi chú khác thành dòng riêng (khóa key~n); quầy không truyền ghi chú vẫn cộng vào dòng cũ; sửa dòng giữ vị trí + khóa, đổi tùy chọn đổi khóa, trùng dòng khác thì gộp, tối đa 50, không còn dòng thì thêm mới', () => {
    const cart = [];
    addItem(cart, bacXiu, sizeL, { quantity: 2, note: 'Ít đá' });
    addItem(cart, bacXiu, sizeL, { quantity: 1, note: ' Ít đá ' }); // cùng ghi chú (bỏ khoảng trắng) → cộng dồn
    addItem(cart, bacXiu, sizeL, { quantity: 1, note: 'Không đường' }); // khác ghi chú → dòng riêng
    addItem(cart, water, {}); // "+" nhanh (không ghi chú)
    const base = lineKey(3, [12]);
    assert.deepEqual(summary(cart), [
      [base, 'Bạc xỉu', 'Size L', 'Ít đá', 3, 37000],
      [`${base}~1`, 'Bạc xỉu', 'Size L', 'Không đường', 1, 37000],
      ['7', 'Nước suối', '', '', 1, 10000],
    ]);
    // Quầy / "+" nhanh không truyền ghi chú → cộng vào dòng khóa gốc như trước F-081
    addItem(cart, bacXiu, sizeL);
    assert.equal(cart[0].quantity, 4);

    // Sửa dòng 2: chỉ đổi ghi chú + số lượng → giữ vị trí + khóa
    replaceLine(cart, `${base}~1`, bacXiu, sizeL, { quantity: 2, note: 'Không đường, Mang về' });
    assert.deepEqual(summary(cart)[1], [`${base}~1`, 'Bạc xỉu', 'Size L', 'Không đường, Mang về', 2, 37000]);
    // Sửa dòng 2: đổi sang Size M → khóa mới theo tùy chọn, vẫn ở vị trí 2
    replaceLine(cart, `${base}~1`, bacXiu, sizeM, { quantity: 2, note: 'Mang về' });
    assert.deepEqual(summary(cart)[1], [lineKey(3, [11]), 'Bạc xỉu', 'Size M', 'Mang về', 2, 32000]);
    assert.equal(cart.length, 3);
    // Sửa dòng 2 thành giống hệt dòng 1 (Size L, "Ít đá") → gộp vào dòng 1
    replaceLine(cart, lineKey(3, [11]), bacXiu, sizeL, { quantity: 2, note: 'Ít đá' });
    assert.deepEqual(summary(cart), [
      [base, 'Bạc xỉu', 'Size L', 'Ít đá', 6, 37000],
      ['7', 'Nước suối', '', '', 1, 10000],
    ]);
    // Gộp không vượt 50
    replaceLine(cart, '7', water, {}, { quantity: 49, note: '' });
    addItem(cart, water, {}, { quantity: 5, note: '' });
    assert.equal(cart[1].quantity, MAX_QTY);
    // Dòng đã bị bỏ (ví dụ máy khác vừa xóa) → thêm như dòng mới
    replaceLine(cart, 'không-còn', water, {}, { quantity: 1, note: 'Không lạnh' });
    assert.deepEqual(summary(cart)[2], ['7~1', 'Nước suối', '', 'Không lạnh', 1, 10000]);
    // Gửi đơn: mỗi dòng một mục, giữ ghi chú, tùy chọn
    assert.deepEqual(toOrderItems(cart), [
      { menuItemId: 3, quantity: 6, note: 'Ít đá', optionIds: [12] },
      { menuItemId: 7, quantity: 50, note: null },
      { menuItemId: 7, quantity: 1, note: 'Không lạnh' },
    ]);
  });
});
