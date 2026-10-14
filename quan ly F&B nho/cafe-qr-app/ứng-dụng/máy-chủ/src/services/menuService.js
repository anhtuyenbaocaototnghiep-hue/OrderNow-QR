// Menu khách + theo dõi trạng thái "đặt được" để phát menu.availability_changed (AC-002-05, AC-010-02, ADR-003).
import * as menuRepo from '../repositories/menuRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';

let lastStates = null;
let chain = Promise.resolve();

export const getPublicMenu = () => menuRepo.publicMenu();

export async function initAvailability() {
  lastStates = await menuRepo.orderableStates();
}

/**
 * Gọi sau mỗi thay đổi có thể ảnh hưởng món còn/hết (gửi đơn, hoàn tất, hủy, điều chỉnh kho, sửa món/BOM).
 * Chạy tuần tự, so với trạng thái trước và chỉ phát phần thay đổi. Lỗi ở đây không làm hỏng request chính.
 */
export function refreshAvailability() {
  chain = chain.then(async () => {
    try {
      const states = await menuRepo.orderableStates();
      for (const [menuItemId, isAvailable] of states) {
        if (!lastStates || lastStates.get(menuItemId) !== isAvailable) {
          publish([ROOMS.public, ROOMS.staff], 'menu.availability_changed', { menuItemId, isAvailable });
        }
      }
      // Món đã bị xóa hẳn (ADR-004) không còn trong DB → báo khách là không đặt được nữa
      for (const [menuItemId, wasAvailable] of lastStates ?? []) {
        if (!states.has(menuItemId) && wasAvailable) publish([ROOMS.public, ROOMS.staff], 'menu.availability_changed', { menuItemId, isAvailable: false });
      }
      lastStates = states;
    } catch (err) {
      console.error('refreshAvailability:', err.message);
    }
  });
  return chain;
}
