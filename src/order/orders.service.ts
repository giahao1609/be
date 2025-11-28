import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { UpdatePreOrderStatusDto } from './dto/update-status.dto';
import { PreOrder, PreOrderDocument, PreOrderStatus } from './schema/order.schema';
import { MenuItem, MenuItemDocument, Money } from 'src/menu/schema/menu.schema';
import { User, UserDocument } from 'src/users/schema/user.schema';
import { CreatePreOrderDto } from './dto/create-order.dto';
import { Restaurant, RestaurantDocument } from 'src/restaurants/schema/restaurant.schema';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class PreOrderService {
  constructor(
    @InjectModel(PreOrder.name)
    private readonly preOrderModel: Model<PreOrderDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    private readonly mailer: MailerService,
  ) {}

  private toObjectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }

  // =========================================================
  // CREATE PRE-ORDER CHO USER
  // =========================================================
  async createForUser(userId: string, dto: CreatePreOrderDto): Promise<PreOrder> {
    const userObjectId = this.toObjectId(userId);
    const restaurantObjectId = this.toObjectId(dto.restaurantId);

    const user = await this.userModel.findById(userObjectId).lean().exec();
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    const arrivalTime = new Date(dto.arrivalTime);
    if (Number.isNaN(arrivalTime.getTime())) {
      throw new BadRequestException('INVALID_ARRIVAL_TIME');
    }

    const now = new Date();
    if (arrivalTime.getTime() < now.getTime()) {
      throw new BadRequestException('ARRIVAL_TIME_MUST_BE_IN_FUTURE');
    }

    const menuItemIds = dto.items.map((i) => this.toObjectId(i.menuItemId));

    const menuItems = await this.menuItemModel
      .find({
        _id: { $in: menuItemIds },
        restaurantId: restaurantObjectId,
        isAvailable: true,
      })
      .lean()
      .exec();

    if (menuItems.length !== dto.items.length) {
      throw new BadRequestException('SOME_ITEMS_NOT_FOUND_OR_UNAVAILABLE');
    }

    // Tạo items + tính tổng tiền (dùng basePrice cho đơn giản)
    const items = dto.items.map((itemDto) => {
      const mi = menuItems.find((m) => m._id.toString() === itemDto.menuItemId);
      if (!mi) {
        throw new BadRequestException(
          `MENU_ITEM_NOT_FOUND: ${itemDto.menuItemId}`,
        );
      }

      const basePrice: Money = mi.basePrice ?? {
        currency: 'VND',
        amount: 0,
      };
      const lineTotalAmount = basePrice.amount * itemDto.quantity;

      return {
        menuItemId: mi._id,
        menuItemName: mi.name,
        unitPrice: {
          currency: basePrice.currency,
          amount: basePrice.amount,
        },
        quantity: itemDto.quantity,
        lineTotal: {
          currency: basePrice.currency,
          amount: lineTotalAmount,
        },
        note: itemDto.note,
      };
    });

    const currency = items[0]?.unitPrice?.currency || 'VND';
    const totalAmount = items.reduce(
      (sum, it) => sum + (it.lineTotal?.amount ?? 0),
      0,
    );

    const doc = new this.preOrderModel({
      userId: userObjectId,
      restaurantId: restaurantObjectId,
      items,
      totalAmount: {
        currency,
        amount: totalAmount,
      },
      guestCount: dto.guestCount,
      arrivalTime,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      note: dto.note,
      status: 'PENDING',
    });

    return await doc.save();
  }

  // =========================================================
  // USER XEM LỊCH SỬ ĐẶT MÓN
  // =========================================================
  async listForUser(userId: string): Promise<PreOrder[]> {
    const userObjectId = this.toObjectId(userId);
    return this.preOrderModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // =========================================================
  // OWNER XEM ĐƠN CỦA 1 RESTAURANT
  // =========================================================
  async listForRestaurant(
    restaurantId: string,
    status?: string,
  ): Promise<PreOrder[]> {
    const restaurantObjectId = this.toObjectId(restaurantId);
    const filter: any = { restaurantId: restaurantObjectId };
    if (status) {
      filter.status = status;
    }
    return this.preOrderModel
      .find(filter)
      .sort({ arrivalTime: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  // =========================================================
  // OWNER UPDATE STATUS + GỬI EMAIL
  // PENDING -> CONFIRMED / REJECTED / CANCELLED => gửi mail
  // =========================================================
  async updateStatus(
    preOrderId: string,
    dto: UpdatePreOrderStatusDto,
  ): Promise<PreOrder> {
    const _id = this.toObjectId(preOrderId);

    const preOrder = await this.preOrderModel.findById(_id).exec();
    if (!preOrder) {
      throw new NotFoundException('PRE_ORDER_NOT_FOUND');
    }

    const prevStatus = preOrder.status;
    const nextStatus: PreOrderStatus = dto.status;

    preOrder.status = nextStatus;
    if (dto.ownerNote !== undefined) {
      preOrder.ownerNote = dto.ownerNote;
    }

    const saved = await preOrder.save();

    const shouldNotify =
      prevStatus === 'PENDING' &&
      (nextStatus === 'CONFIRMED' ||
        nextStatus === 'REJECTED' ||
        nextStatus === 'CANCELLED');

    if (shouldNotify) {
      await this.notifyUserPreOrderStatus(saved);
    }

    return saved;
  }

  // =========================================================
  // GỬI EMAIL CHO USER KHI STATUS ĐỔI
  // =========================================================
  private async notifyUserPreOrderStatus(preOrder: PreOrderDocument) {
    const [user, restaurant] = await Promise.all([
      this.userModel.findById(preOrder.userId).exec(),
      this.restaurantModel.findById(preOrder.restaurantId).exec(),
    ]);

    if (!user || !user.email) {
      return; // không có email -> bỏ qua
    }

    const { subject, html, text } = this.buildPreOrderEmailContent(
      preOrder,
      user,
      restaurant ?? null,
    );

    await this.mailer.sendMail({
      to: user.email,
      subject,
      html,
      text,
    });
  }

  // =========================================================
  // FORMAT HELPERS
  // =========================================================
  private formatMoney(amount: Money | { currency?: string; amount: number } | null | undefined): string {
    if (!amount) return '0';
    const currency = amount.currency || 'VND';
    const val = amount.amount ?? 0;

    try {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency,
        maximumFractionDigits: currency === 'VND' ? 0 : 2,
      }).format(val);
    } catch {
      return `${val.toLocaleString('vi-VN')} ${currency}`;
    }
  }

  private formatDateTime(dt: Date) {
    return dt.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // =========================================================
  // BUILD NỘI DUNG EMAIL (HTML + TEXT)
  // =========================================================
  private buildPreOrderEmailContent(
    preOrder: PreOrderDocument,
    user: UserDocument,
    restaurant: RestaurantDocument | null,
  ): { subject: string; html: string; text: string } {
    const status = preOrder.status;
    const restoName = restaurant?.name ?? 'nhà hàng';
    const arrivalStr = this.formatDateTime(preOrder.arrivalTime);
    const totalStr = this.formatMoney(preOrder.totalAmount);

    const statusLabelMap: Record<PreOrderStatus, string> = {
      PENDING: 'đang chờ xác nhận',
      CONFIRMED: 'đã được xác nhận',
      REJECTED: 'bị từ chối',
      CANCELLED: 'đã bị hủy',
    };

    const statusLabel = statusLabelMap[status];

    // ===== ITEMS TABLE =====
    const itemsRowsHtml = (preOrder.items ?? [])
      .map((it) => {
        const lineTotalStr = this.formatMoney(it.lineTotal);
        const unitStr = this.formatMoney(it.unitPrice);
        return `
          <tr>
            <td style="padding:4px 8px;">${it.menuItemName ?? ''}</td>
            <td style="padding:4px 8px; text-align:center;">${it.quantity}</td>
            <td style="padding:4px 8px; text-align:right;">${unitStr}</td>
            <td style="padding:4px 8px; text-align:right;">${lineTotalStr}</td>
          </tr>`;
      })
      .join('');

    const itemsRowsText = (preOrder.items ?? [])
      .map((it) => {
        const lineTotalStr = this.formatMoney(it.lineTotal);
        const unitStr = this.formatMoney(it.unitPrice);
        return `- ${it.menuItemName ?? ''} x ${it.quantity} (${unitStr}/phần) = ${lineTotalStr}`;
      })
      .join('\n');

    // ===== PAYMENT (CONFIRMED) =====
    let paymentHtml = '';
    let paymentText = '';

    if (status === 'CONFIRMED' && restaurant?.paymentConfig) {
      const cfg = restaurant.paymentConfig;

      const bankLinesHtml =
        cfg.bankTransfers && cfg.bankTransfers.length
          ? cfg.bankTransfers
              .map((b) => {
                const qrPart = b.qr?.imageUrl
                  ? `<div>QR: <a href="${b.qr.imageUrl}" target="_blank">${b.qr.imageUrl}</a></div>`
                  : '';
                const desc = b.qr?.description
                  ? `<div>${b.qr.description}</div>`
                  : '';
                return `
                  <li>
                    <div><strong>${b.bankName ?? ''}</strong> - ${
                  b.accountName ?? ''
                }</div>
                    <div>Số tài khoản: <strong>${
                      b.accountNumber ?? ''
                    }</strong></div>
                    ${b.branch ? `<div>Chi nhánh: ${b.branch}</div>` : ''}
                    ${qrPart}
                    ${desc}
                  </li>
                `;
              })
              .join('')
          : '';

      const bankLinesText =
        cfg.bankTransfers && cfg.bankTransfers.length
          ? cfg.bankTransfers
              .map((b) => {
                const lines = [
                  `${b.bankName ?? ''} - ${b.accountName ?? ''}`,
                  `Số TK: ${b.accountNumber ?? ''}`,
                  b.branch ? `Chi nhánh: ${b.branch}` : '',
                  b.qr?.imageUrl ? `QR: ${b.qr.imageUrl}` : '',
                  b.qr?.description ?? '',
                ].filter(Boolean);
                return lines.join(' | ');
              })
              .join('\n  ')
          : '';

      const walletLinesHtml =
        cfg.eWallets && cfg.eWallets.length
          ? cfg.eWallets
              .map((w) => {
                const qrPart = w.qr?.imageUrl
                  ? `<div>QR: <a href="${w.qr.imageUrl}" target="_blank">${w.qr.imageUrl}</a></div>`
                  : '';
                const desc = w.qr?.description
                  ? `<div>${w.qr.description}</div>`
                  : '';
                return `
                  <li>
                    <div><strong>${w.provider ?? ''}</strong> - ${
                  w.displayName ?? ''
                }</div>
                    ${w.phoneNumber ? `<div>SĐT: ${w.phoneNumber}</div>` : ''}
                    ${w.accountId ? `<div>ID: ${w.accountId}</div>` : ''}
                    ${qrPart}
                    ${desc}
                  </li>
                `;
              })
              .join('')
          : '';

      const walletLinesText =
        cfg.eWallets && cfg.eWallets.length
          ? cfg.eWallets
              .map((w) => {
                const lines = [
                  `${w.provider ?? ''} - ${w.displayName ?? ''}`,
                  w.phoneNumber ? `SĐT: ${w.phoneNumber}` : '',
                  w.accountId ? `ID: ${w.accountId}` : '',
                  w.qr?.imageUrl ? `QR: ${w.qr.imageUrl}` : '',
                  w.qr?.description ?? '',
                ].filter(Boolean);
                return lines.join(' | ');
              })
              .join('\n  ')
          : '';

      paymentHtml = `
        <h3>Thông tin thanh toán</h3>
        <p>Tổng tiền dự kiến: <strong>${totalStr}</strong></p>
        ${
          cfg.allowCash
            ? '<p>✓ Chấp nhận thanh toán tiền mặt tại nhà hàng.</p>'
            : ''
        }
        ${
          cfg.allowBankTransfer && bankLinesHtml
            ? `<p><strong>Chuyển khoản ngân hàng:</strong></p><ul>${bankLinesHtml}</ul>`
            : ''
        }
        ${
          cfg.allowEWallet && walletLinesHtml
            ? `<p><strong>Ví điện tử:</strong></p><ul>${walletLinesHtml}</ul>`
            : ''
        }
        ${cfg.generalNote ? `<p><em>${cfg.generalNote}</em></p>` : ''}
      `;

      const cashText = cfg.allowCash ? `- Thanh toán tiền mặt tại quán` : '';
      const bankText =
        cfg.allowBankTransfer && bankLinesText
          ? `- Chuyển khoản ngân hàng:\n  ${bankLinesText}`
          : '';
      const walletText =
        cfg.allowEWallet && walletLinesText
          ? `- Ví điện tử:\n  ${walletLinesText}`
          : '';

      paymentText = [
        `Tổng tiền dự kiến: ${totalStr}`,
        cashText,
        bankText,
        walletText,
        cfg.generalNote ? `Ghi chú: ${cfg.generalNote}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // ===== SUBJECT THEO STATUS =====
    let subject = `[${restoName}] Đơn đặt chỗ của bạn ${statusLabel}`;
    if (status === 'CONFIRMED') {
      subject = `[${restoName}] Đơn đặt chỗ đã được xác nhận`;
    } else if (status === 'REJECTED') {
      subject = `[${restoName}] Đơn đặt chỗ bị từ chối`;
    } else if (status === 'CANCELLED') {
      subject = `[${restoName}] Đơn đặt chỗ đã bị hủy`;
    }

    // ===== HTML BODY =====
    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; font-size:14px; color:#222;">
        <p>Xin chào ${user.displayName || user.email},</p>
        <p>Đơn đặt chỗ của bạn tại <strong>${restoName}</strong> hiện đang ở trạng thái: <strong>${statusLabel}</strong>.</p>

        <h3>Thông tin đặt chỗ</h3>
        <ul>
          <li>Thời gian đến dự kiến: <strong>${arrivalStr}</strong></li>
          <li>Số khách: <strong>${preOrder.guestCount}</strong></li>
          <li>Người liên hệ: <strong>${preOrder.contactName}</strong> (${preOrder.contactPhone})</li>
          <li>Tổng tiền dự kiến: <strong>${totalStr}</strong></li>
        </ul>

        ${
          preOrder.note
            ? `<p><strong>Ghi chú của bạn:</strong> ${preOrder.note}</p>`
            : ''
        }
        ${
          preOrder.ownerNote
            ? `<p><strong>Ghi chú từ nhà hàng:</strong> ${preOrder.ownerNote}</p>`
            : ''
        }

        <h3>Chi tiết món</h3>
        <table style="border-collapse:collapse; width:100%; max-width:640px;">
          <thead>
            <tr>
              <th style="border-bottom:1px solid #ccc; text-align:left; padding:4px 8px;">Món</th>
              <th style="border-bottom:1px solid #ccc; text-align:center; padding:4px 8px;">SL</th>
              <th style="border-bottom:1px solid #ccc; text-align:right; padding:4px 8px;">Đơn giá</th>
              <th style="border-bottom:1px solid #ccc; text-align:right; padding:4px 8px;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>

        ${status === 'CONFIRMED' && paymentHtml ? paymentHtml : ''}

        <p style="margin-top:16px;">Cảm ơn bạn đã đặt chỗ tại <strong>${restoName}</strong>.</p>
      </div>
    `;

    // ===== TEXT BODY =====
    const textLines: string[] = [];

    textLines.push(
      `Xin chào ${user.displayName || user.email},`,
      ``,
      `Đơn đặt chỗ của bạn tại ${restoName} hiện đang ở trạng thái: ${statusLabel}.`,
      ``,
      `Thời gian đến dự kiến: ${arrivalStr}`,
      `Số khách: ${preOrder.guestCount}`,
      `Người liên hệ: ${preOrder.contactName} (${preOrder.contactPhone})`,
      `Tổng tiền dự kiến: ${totalStr}`,
      ``,
    );

    if (preOrder.note) {
      textLines.push(`Ghi chú của bạn: ${preOrder.note}`, ``);
    }
    if (preOrder.ownerNote) {
      textLines.push(`Ghi chú từ nhà hàng: ${preOrder.ownerNote}`, ``);
    }

    if (itemsRowsText) {
      textLines.push(`Chi tiết món:`, itemsRowsText, ``);
    }

    if (status === 'CONFIRMED' && paymentText) {
      textLines.push(`Thông tin thanh toán:`, paymentText, ``);
    }

    textLines.push(`Cảm ơn bạn đã đặt chỗ tại ${restoName}.`);

    const text = textLines.join('\n');

    return { subject, html, text };
  }
}
