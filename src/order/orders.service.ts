// src/pre-order/orders.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { MarkPaidDto, RequestDepositDto, UpdatePreOrderStatusDto } from './dto/update-status.dto';
import {
  PreOrder,
  PreOrderDocument,
  PreOrderStatus,
} from './schema/order.schema';
import {
  MenuItem,
  MenuItemDocument,
  Money,
} from 'src/menu/schema/menu.schema';
import { User, UserDocument } from 'src/users/schema/user.schema';
import { CreatePreOrderDto } from './dto/create-order.dto';
import {
  Restaurant,
  RestaurantDocument,
} from 'src/restaurants/schema/restaurant.schema';
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
  async createForUser(
    userId: string,
    dto: CreatePreOrderDto,
  ): Promise<PreOrder> {
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
      const mi = menuItems.find(
        (m) => m._id.toString() === itemDto.menuItemId,
      );
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
      depositPercent: undefined,
      requiredDepositAmount: undefined,
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
  // OWNER YÊU CẦU CỌC X% / THANH TOÁN TRƯỚC
  //  - Nếu depositPercent = 0 => CONFIRMED, thanh toán tiền mặt khi tới
  //  - Nếu depositPercent > 0 => AWAITING_PAYMENT, gửi email yêu cầu thanh toán
  // =========================================================
  async requestDeposit(
    ownerId: string,
    preOrderId: string,
    dto: RequestDepositDto,
  ): Promise<PreOrder> {
    const _id = this.toObjectId(preOrderId);
    const ownerObjectId = this.toObjectId(ownerId);

    const preOrder = await this.preOrderModel.findById(_id).exec();
    if (!preOrder) {
      throw new NotFoundException('PRE_ORDER_NOT_FOUND');
    }

    const restaurant = await this.restaurantModel
      .findById(preOrder.restaurantId)
      .exec();
    if (!restaurant) {
      throw new NotFoundException('RESTAURANT_NOT_FOUND');
    }

    if (!restaurant.ownerId.equals(ownerObjectId)) {
      throw new BadRequestException('NOT_RESTAURANT_OWNER');
    }

    if (preOrder.status !== 'PENDING') {
      throw new BadRequestException('ONLY_PENDING_CAN_REQUEST_DEPOSIT');
    }

    const depositPercent = dto.depositPercent ?? 0;
    if (depositPercent < 0 || depositPercent > 100) {
      throw new BadRequestException('INVALID_DEPOSIT_PERCENT');
    }

    const totalAmount = preOrder.totalAmount?.amount ?? 0;
    const currency = preOrder.totalAmount?.currency ?? 'VND';

    const requiredAmount = depositPercent > 0
      ? Math.round(totalAmount * depositPercent) / 100
      : 0;

    preOrder.depositPercent = depositPercent;
    preOrder.requiredDepositAmount = {
      currency,
      amount: requiredAmount,
    };
    preOrder.paymentEmailSentAt = new Date();

    if (depositPercent <= 0) {
      // Không cần thanh toán trước, xác nhận luôn
      preOrder.status = 'CONFIRMED';
    } else {
      // Cần thanh toán trước
      preOrder.status = 'AWAITING_PAYMENT';
    }

    const saved = await preOrder.save();

    const shouldSendEmail = dto.sendEmail !== false; // default: true
    if (shouldSendEmail) {
      await this.notifyUserPreOrderStatus(saved, {
        overrideEmail: dto.overrideEmail,
        extraNote: dto.emailNote,
      });
    }

    return saved;
  }

  // =========================================================
  // ĐÁNH DẤU ĐÃ THANH TOÁN (WEBHOOK / OWNER)
  //  - Chỉ cho phép khi đang AWAITING_PAYMENT
  //  - set status = PAID
  // =========================================================
  async markPaid(
    actorId: string,
    preOrderId: string,
    dto: MarkPaidDto,
  ): Promise<PreOrder> {
    // actorId dùng nếu ông muốn log lại, ở đây t chưa check role
    const _id = this.toObjectId(preOrderId);

    const preOrder = await this.preOrderModel.findById(_id).exec();
    if (!preOrder) {
      throw new NotFoundException('PRE_ORDER_NOT_FOUND');
    }

    if (preOrder.status !== 'AWAITING_PAYMENT') {
      throw new BadRequestException('ONLY_AWAITING_PAYMENT_CAN_BE_PAID');
    }

    preOrder.status = 'PAID';
    preOrder.paidAt = new Date();
    if (dto.paymentReference) {
      preOrder.paymentReference = dto.paymentReference;
    }

    const saved = await preOrder.save();

    await this.notifyUserPreOrderStatus(saved);

    return saved;
  }

  // =========================================================
  // OWNER CONFIRM ĐẶT CHỖ
  //  - Nếu depositPercent > 0 => phải PAID trước
  //  - Nếu depositPercent = 0 => cho phép từ PENDING
  // =========================================================
  async confirm(ownerId: string, preOrderId: string): Promise<PreOrder> {
    const _id = this.toObjectId(preOrderId);
    const ownerObjectId = this.toObjectId(ownerId);

    const preOrder = await this.preOrderModel.findById(_id).exec();
    if (!preOrder) {
      throw new NotFoundException('PRE_ORDER_NOT_FOUND');
    }

    const restaurant = await this.restaurantModel
      .findById(preOrder.restaurantId)
      .exec();
    if (!restaurant) {
      throw new NotFoundException('RESTAURANT_NOT_FOUND');
    }

    if (!restaurant.ownerId.equals(ownerObjectId)) {
      throw new BadRequestException('NOT_RESTAURANT_OWNER');
    }

    const depositPercent = preOrder.depositPercent ?? 0;

    if (depositPercent > 0 && preOrder.status !== 'PAID') {
      throw new BadRequestException(
        'MUST_BE_PAID_BEFORE_CONFIRM',
      );
    }

    if (depositPercent <= 0 && preOrder.status !== 'PENDING') {
      // không cọc trước mà lại không ở PENDING thì hơi lạ
      throw new BadRequestException(
        'CAN_ONLY_CONFIRM_PENDING_WITHOUT_DEPOSIT',
      );
    }

    preOrder.status = 'CONFIRMED';
    const saved = await preOrder.save();

    await this.notifyUserPreOrderStatus(saved);

    return saved;
  }

  // =========================================================
  // UPDATE STATUS CHUNG:
  //  - CANCELLED: user/owner hủy
  //  - REJECTED: owner từ chối
  // (các trạng thái AWAITING_PAYMENT / PAID / CONFIRMED dùng route riêng)
  // =========================================================
  async updateStatus(
    actorId: string,
    preOrderId: string,
    dto: UpdatePreOrderStatusDto,
  ): Promise<PreOrder> {
    const _id = this.toObjectId(preOrderId);
    const actorObjectId = this.toObjectId(actorId);

    const preOrder = await this.preOrderModel.findById(_id).exec();
    if (!preOrder) {
      throw new NotFoundException('PRE_ORDER_NOT_FOUND');
    }

    const restaurant = await this.restaurantModel
      .findById(preOrder.restaurantId)
      .exec();
    if (!restaurant) {
      throw new NotFoundException('RESTAURANT_NOT_FOUND');
    }

    const isUser = preOrder.userId.equals(actorObjectId);
    const isOwner = restaurant.ownerId.equals(actorObjectId);

    const nextStatus = dto.status as PreOrderStatus;
    if (nextStatus !== 'CANCELLED' && nextStatus !== 'REJECTED') {
      throw new BadRequestException(
        'STATUS_NOT_ALLOWED_IN_THIS_ENDPOINT',
      );
    }

    if (nextStatus === 'CANCELLED') {
      // cho phép user hủy khi còn PENDING / AWAITING_PAYMENT
      if (!isUser && !isOwner) {
        throw new BadRequestException('NOT_ALLOWED_TO_CANCEL');
      }
      if (
        preOrder.status !== 'PENDING' &&
        preOrder.status !== 'AWAITING_PAYMENT'
      ) {
        throw new BadRequestException(
          'ONLY_PENDING_OR_AWAITING_PAYMENT_CAN_BE_CANCELLED',
        );
      }
    }

    if (nextStatus === 'REJECTED') {
      // chỉ owner được reject
      if (!isOwner) {
        throw new BadRequestException('ONLY_OWNER_CAN_REJECT');
      }
      if (preOrder.status !== 'PENDING') {
        throw new BadRequestException('ONLY_PENDING_CAN_BE_REJECTED');
      }
    }

    preOrder.status = nextStatus;
    if (dto.ownerNote !== undefined) {
      preOrder.ownerNote = dto.ownerNote;
    }

    const saved = await preOrder.save();

    await this.notifyUserPreOrderStatus(saved);

    return saved;
  }

  // =========================================================
  // GỬI EMAIL CHO USER KHI STATUS ĐỔI / YÊU CẦU CỌC / THANH TOÁN
  // =========================================================
  private async notifyUserPreOrderStatus(
    preOrder: PreOrderDocument,
    opts?: { overrideEmail?: string; extraNote?: string },
  ) {
    const [user, restaurant] = await Promise.all([
      this.userModel.findById(preOrder.userId).exec(),
      this.restaurantModel.findById(preOrder.restaurantId).exec(),
    ]);

    if (!user) return;

    const toEmail = opts?.overrideEmail || user.email;
    if (!toEmail) {
      return; // không có email -> bỏ qua
    }

    const { subject, html, text } = this.buildPreOrderEmailContent(
      preOrder,
      user,
      restaurant ?? null,
      opts?.extraNote,
    );

    await this.mailer.sendMail({
      to: toEmail,
      subject,
      html,
      text,
    });
  }

  // =========================================================
  // FORMAT HELPERS
  // =========================================================
  private formatMoney(
    amount:
      | Money
      | { currency?: string; amount: number }
      | null
      | undefined,
  ): string {
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
  //  - Cover hết status: PENDING, AWAITING_PAYMENT, PAID, CONFIRMED, REJECTED, CANCELLED
  //  - Nếu depositPercent = 0 => ghi rõ thanh toán tiền mặt khi tới
  //  - Nếu depositPercent > 0 => ghi rõ cọc X% / số tiền + mã thanh toán
  // =========================================================
  private buildPreOrderEmailContent(
    preOrder: PreOrderDocument,
    user: UserDocument,
    restaurant: RestaurantDocument | null,
    extraNote?: string,
  ): { subject: string; html: string; text: string } {
    const status = preOrder.status as PreOrderStatus;
    const restoName = restaurant?.name ?? 'nhà hàng';
    const arrivalStr = this.formatDateTime(preOrder.arrivalTime);
    const totalStr = this.formatMoney(preOrder.totalAmount);

    const paymentCode = preOrder._id?.toString?.() ?? '';

    const depositPercent = preOrder.depositPercent ?? 0;
    const totalAmount = preOrder.totalAmount?.amount ?? 0;
    const currency = preOrder.totalAmount?.currency ?? 'VND';

    const depositAmount =
      preOrder.requiredDepositAmount?.amount ??
      (depositPercent > 0 ? (totalAmount * depositPercent) / 100 : 0);

    const remainAmount =
      depositPercent > 0 ? totalAmount - depositAmount : totalAmount;

    const depositStr =
      depositPercent > 0
        ? `${depositPercent}% (~${this.formatMoney({
            currency,
            amount: depositAmount,
          })})`
        : '0% (thanh toán tại quán)';

    const statusLabelMap: Record<PreOrderStatus, string> = {
      PENDING: 'đang chờ nhà hàng xử lý',
      AWAITING_PAYMENT: 'đang chờ bạn thanh toán',
      PAID: 'đã thanh toán, chờ nhà hàng xác nhận',
      CONFIRMED: 'đã được xác nhận',
      REJECTED: 'bị từ chối',
      CANCELLED: 'đã bị hủy',
    };

    const statusLabel = statusLabelMap[status] ?? status;

    // ===== ITEMS TABLE =====
    const itemsRowsHtml = (preOrder.items ?? [])
      .map((it) => {
        const lineTotalStr = this.formatMoney(it.lineTotal);
        const unitStr = this.formatMoney(it.unitPrice);
        return `
          <tr>
            <td style="padding:4px 8px;">${it.menuItemName ?? ''}</td>
            <td style="padding:4px 8px; text-align:center;">${
              it.quantity
            }</td>
            <td style="padding:4px 8px; text-align:right;">${unitStr}</td>
            <td style="padding:4px 8px; text-align:right;">${lineTotalStr}</td>
          </tr>`;
      })
      .join('');

    const itemsRowsText = (preOrder.items ?? [])
      .map((it) => {
        const lineTotalStr = this.formatMoney(it.lineTotal);
        const unitStr = this.formatMoney(it.unitPrice);
        return `- ${it.menuItemName ?? ''} x ${
          it.quantity
        } (${unitStr}/phần) = ${lineTotalStr}`;
      })
      .join('\n');

    // ===== PAYMENT METHODS (BANK / WALLET) =====
    let paymentMethodsHtml = '';
    let paymentMethodsText = '';

    if (restaurant?.paymentConfig) {
      const cfg = restaurant.paymentConfig;

      const bankLinesHtml =
        cfg.allowBankTransfer &&
        cfg.bankTransfers &&
        cfg.bankTransfers.length
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
        cfg.allowBankTransfer &&
        cfg.bankTransfers &&
        cfg.bankTransfers.length
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
        cfg.allowEWallet && cfg.eWallets && cfg.eWallets.length
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
        cfg.allowEWallet && cfg.eWallets && cfg.eWallets.length
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

      const cashHtml = cfg.allowCash
        ? '<p>✓ Chấp nhận thanh toán tiền mặt tại nhà hàng.</p>'
        : '';
      const cashText = cfg.allowCash
        ? '- Thanh toán tiền mặt tại quán'
        : '';

      paymentMethodsHtml = `
        ${cashHtml}
        ${
          bankLinesHtml
            ? `<p><strong>Chuyển khoản ngân hàng:</strong></p><ul>${bankLinesHtml}</ul>`
            : ''
        }
        ${
          walletLinesHtml
            ? `<p><strong>Ví điện tử:</strong></p><ul>${walletLinesHtml}</ul>`
            : ''
        }
        ${cfg.generalNote ? `<p><em>${cfg.generalNote}</em></p>` : ''}
      `;

      paymentMethodsText = [
        cashText,
        bankLinesText ? `- Chuyển khoản ngân hàng:\n  ${bankLinesText}` : '',
        walletLinesText ? `- Ví điện tử:\n  ${walletLinesText}` : '',
        cfg.generalNote ? `Ghi chú: ${cfg.generalNote}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // ===== SUBJECT & INTRO MESSAGE THEO STATUS =====
    let subject = `[${restoName}] Đơn đặt chỗ của bạn ${statusLabel}`;
    let intro = `Đơn đặt chỗ của bạn tại ${restoName} hiện đang ở trạng thái: ${statusLabel}.`;

    if (status === 'AWAITING_PAYMENT' && depositPercent > 0) {
      subject = `[${restoName}] Vui lòng thanh toán trước ${depositStr} để giữ chỗ`;
      intro = `Nhà hàng yêu cầu thanh toán trước ${depositStr} (tương đương ${this.formatMoney(
        { currency, amount: depositAmount },
      )}) để giữ chỗ. Vui lòng thanh toán và ghi MÃ THANH TOÁN: ${paymentCode} trong nội dung.`;
    } else if (status === 'PAID') {
      subject = `[${restoName}] Đã nhận thanh toán đặt chỗ của bạn`;
      intro = `Nhà hàng đã nhận được khoản thanh toán của bạn (mã thanh toán: ${paymentCode}). Đơn đặt chỗ đang chờ xác nhận cuối cùng.`;
    } else if (status === 'CONFIRMED') {
      if (depositPercent > 0) {
        subject = `[${restoName}] Đơn đặt chỗ đã được xác nhận`;
        intro = `Đơn đặt chỗ của bạn đã được xác nhận. Nhà hàng đã ghi nhận khoản thanh toán trước ${depositStr}. Mã thanh toán/đặt chỗ của bạn là: ${paymentCode}.`;
      } else {
        subject = `[${restoName}] Đơn đặt chỗ đã được xác nhận`;
        intro = `Đơn đặt chỗ của bạn đã được xác nhận. Bạn sẽ thanh toán trực tiếp tại nhà hàng. Mã đặt chỗ của bạn là: ${paymentCode}.`;
      }
    } else if (status === 'REJECTED') {
      subject = `[${restoName}] Đơn đặt chỗ bị từ chối`;
      intro = `Rất tiếc, đơn đặt chỗ của bạn đã bị nhà hàng từ chối.`;
    } else if (status === 'CANCELLED') {
      subject = `[${restoName}] Đơn đặt chỗ đã bị hủy`;
      intro = `Đơn đặt chỗ của bạn đã bị hủy.`;
    }

    if (extraNote) {
      intro += `\n\n${extraNote}`;
    }

    // ===== PAYMENT SECTION (HTML & TEXT) =====
    let paymentHtml = '';
    let paymentText = '';

    if (
      (status === 'AWAITING_PAYMENT' ||
        status === 'PAID' ||
        status === 'CONFIRMED') &&
      restaurant?.paymentConfig
    ) {
      if (depositPercent > 0) {
        paymentHtml = `
          <h3>Thông tin thanh toán</h3>
          <p>Tổng tiền dự kiến: <strong>${totalStr}</strong></p>
          <p>Tiền cần thanh toán trước: <strong>${this.formatMoney({
            currency,
            amount: depositAmount,
          })}</strong> (${depositPercent}%)</p>
          <p>Phần còn lại dự kiến: <strong>${this.formatMoney({
            currency,
            amount: remainAmount,
          })}</strong> (thanh toán tại quán nếu có phát sinh).</p>
          <p>Mã thanh toán/đặt chỗ của bạn: <strong>${paymentCode}</strong></p>
          ${paymentMethodsHtml}
        `;

        paymentText = [
          `Tổng tiền dự kiến: ${totalStr}`,
          `Thanh toán trước: ${this.formatMoney({
            currency,
            amount: depositAmount,
          })} (${depositPercent}%)`,
          `Phần còn lại dự kiến: ${this.formatMoney({
            currency,
            amount: remainAmount,
          })}`,
          `Mã thanh toán/đặt chỗ: ${paymentCode}`,
          paymentMethodsText,
        ]
          .filter(Boolean)
          .join('\n');
      } else {
        // không cọc, thanh toán toàn bộ khi đến quán
        paymentHtml = `
          <h3>Thanh toán</h3>
          <p>Tổng tiền dự kiến: <strong>${totalStr}</strong></p>
          <p>Bạn sẽ thanh toán toàn bộ tại nhà hàng.</p>
          ${paymentMethodsHtml}
        `;

        paymentText = [
          `Tổng tiền dự kiến: ${totalStr}`,
          `Bạn sẽ thanh toán toàn bộ tại nhà hàng.`,
          paymentMethodsText,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }

    // ===== HTML BODY =====
    const html = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; font-size:14px; color:#222;">
        <p>Xin chào ${user.displayName || user.email},</p>
        <p>${intro}</p>

        <h3>Thông tin đặt chỗ</h3>
        <ul>
          <li>Nhà hàng: <strong>${restoName}</strong></li>
          <li>Thời gian đến dự kiến: <strong>${arrivalStr}</strong></li>
          <li>Số khách: <strong>${preOrder.guestCount}</strong></li>
          <li>Người liên hệ: <strong>${preOrder.contactName}</strong> (${
      preOrder.contactPhone
    })</li>
          <li>Tổng tiền dự kiến: <strong>${totalStr}</strong></li>
          <li>Tỉ lệ thanh toán trước: <strong>${depositStr}</strong></li>
          <li>Mã thanh toán/đặt chỗ: <strong>${paymentCode}</strong></li>
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

        ${paymentHtml || ''}

        <p style="margin-top:16px;">Cảm ơn bạn đã đặt chỗ tại <strong>${restoName}</strong>.</p>
      </div>
    `;

    // ===== TEXT BODY =====
    const textLines: string[] = [];

    textLines.push(
      `Xin chào ${user.displayName || user.email},`,
      ``,
      intro,
      ``,
      `Nhà hàng: ${restoName}`,
      `Thời gian đến dự kiến: ${arrivalStr}`,
      `Số khách: ${preOrder.guestCount}`,
      `Người liên hệ: ${preOrder.contactName} (${preOrder.contactPhone})`,
      `Tổng tiền dự kiến: ${totalStr}`,
      `Tỉ lệ thanh toán trước: ${depositStr}`,
      `Mã thanh toán/đặt chỗ: ${paymentCode}`,
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

    if (paymentText) {
      textLines.push(`Thông tin thanh toán:`, paymentText, ``);
    }

    textLines.push(`Cảm ơn bạn đã đặt chỗ tại ${restoName}.`);

    const text = textLines.join('\n');

    return { subject, html, text };
  }
}
