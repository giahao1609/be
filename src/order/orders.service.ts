// src/orders/orders.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  Model,
  Types,
} from 'mongoose';
import { Order, OrderDocument } from './schema/order.schema';

import { CreateOrderDto } from './dto/create-order.dto';
import { MenuItem, MenuItemDocument } from 'src/menu/schema/menu.schema';
import { Restaurant, RestaurantDocument } from 'src/restaurants/schema/restaurant.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Restaurant.name)
    private readonly restaurantModel: Model<RestaurantDocument>,
    private readonly httpService: HttpService,
  ) {}

  // helper tính tiền (VND)
  private money(amount: number) {
    return { currency: 'VND', amount };
  }

  // ===== CREATE ORDER + ZALOPAY =====
  async createForUser(userId: string, dto: CreateOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('Order must have at least 1 item');
    }

    const userObj = new Types.ObjectId(userId);
    const restObj = new Types.ObjectId(dto.restaurantId);

    const restaurant = await this.restaurantModel.findById(restObj).lean();
    if (!restaurant || restaurant.isActive === false) {
      throw new BadRequestException('Restaurant not found or inactive');
    }

    const itemIds = dto.items.map((i) => new Types.ObjectId(i.menuItemId));
    const menuDocs = await this.menuItemModel
      .find({ _id: { $in: itemIds }, restaurantId: restObj })
      .lean();

    const menuMap = new Map<string, any>();
    for (const m of menuDocs) {
      menuMap.set(String(m._id), m);
    }

    let subtotalAmount = 0;
    const orderItems = dto.items.map((i) => {
      const doc = menuMap.get(i.menuItemId);
      if (!doc) {
        throw new BadRequestException(`Menu item not found: ${i.menuItemId}`);
      }
      const unitPrice = Number(doc.basePrice?.amount ?? 0);
      const lineTotal = unitPrice * i.quantity;
      subtotalAmount += lineTotal;

      return {
        menuItemId: new Types.ObjectId(i.menuItemId),
        name: doc.name,
        unitPrice: this.money(unitPrice),
        quantity: i.quantity,
        selectedOptions: i.selectedOptions ?? [],
        lineTotal: this.money(lineTotal),
      };
    });

    const subtotal = this.money(subtotalAmount);
    const total = this.money(subtotalAmount); // nếu sau này có phí ship, mã giảm giá thì cộng/trừ ở đây

    // tạo order PENDING trong DB
    const created = await this.orderModel.create({
      userId: userObj,
      restaurantId: restObj,
      items: orderItems,
      subtotal,
      total,
      note: dto.note,
      status: 'PENDING',
      paymentMethod: 'ZALOPAY',
      paymentMetadata: {},
    });

    // gọi ZaloPay để tạo payment
    const paymentInfo = await this.createZaloPayOrder(created, dto.returnUrl);

    // cập nhật lại order với metadata ZaloPay
    created.paymentMetadata = paymentInfo.metadata;
    created.status = 'CREATED';
    await created.save();

    return {
      orderId: String(created._id),
      status: created.status,
      total,
      paymentUrl: paymentInfo.checkoutUrl,
      zaloPayData: paymentInfo.raw, // nếu FE cần
    };
  }

  // ===== LẤY DETAIL ORDER =====
  async getDetail(orderId: string, userId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid orderId');
    }
    const doc = await this.orderModel
      .findOne({ _id: orderId, userId: new Types.ObjectId(userId) })
      .lean();
    if (!doc) {
      throw new NotFoundException('Order not found');
    }
    return doc;
  }

  // ===== HANDLE CALLBACK ZALOPAY =====
  async handleZaloPayCallback(payload: any) {
    // payload theo spec của ZaloPay (zp_trans_id, app_trans_id, status...)
    // Anh đọc docs ZaloPay rồi map vào đây
    const appTransId = payload.app_trans_id;
    const resultCode = payload.result; // ví dụ 1 = success (tuỳ spec)

    if (!appTransId) {
      throw new BadRequestException('Missing app_trans_id');
    }

    const order = await this.orderModel.findOne({
      'paymentMetadata.appTransId': appTransId,
    });
    if (!order) {
      throw new NotFoundException('Order not found for this app_trans_id');
    }

    if (resultCode === 1 || resultCode === 0) {
      // thành công (tuỳ spec)
      order.status = 'PAID';
    } else {
      order.status = 'FAILED';
    }

    order.paymentMetadata = {
      ...(order.paymentMetadata ?? {}),
      callbackPayload: payload,
    };

    await order.save();

    // ZaloPay yêu cầu trả về JSON với return_code/return_message
    return {
      return_code: 1,
      return_message: 'OK',
    };
  }

  // ===== PRIVATE: gọi API ZaloPay tạo order =====
  private async createZaloPayOrder(order: OrderDocument, returnUrl?: string) {
    // TODO: đọc từ env
    const endpoint = process.env.ZALOPAY_ENDPOINT ?? 'https://sandbox.zalopay.com.vn/v001/tpe/createorder';
    const appId = process.env.ZALOPAY_APP_ID ?? 'your-app-id';
    const key1 = process.env.ZALOPAY_KEY1 ?? 'your-key1';
    const appUser = String(order.userId);
    const amount = order.total.amount;

    // tạo app_trans_id unique
    const appTransId = `${new Date().getFullYear()}_${order._id}`;

    const embedData = {
      redirecturl: returnUrl ?? process.env.ZALOPAY_DEFAULT_RETURN_URL,
    };

    const items = order.items.map((it) => ({
      itemid: String(it.menuItemId),
      itemname: it.name,
      itemprice: it.unitPrice.amount,
      itemquantity: it.quantity,
    }));

    const payload = {
      app_id: appId,
      app_user: appUser,
      app_time: Date.now(),
      amount,
      app_trans_id: appTransId,
      embed_data: JSON.stringify(embedData),
      item: JSON.stringify(items),
      description: `Thanh toan don hang #${order._id}`,
      bank_code: '',
      callback_url:
        process.env.ZALOPAY_CALLBACK_URL ??
        'https://your-domain.com/api/v1/orders/zalopay/callback',
    };

    // TÍNH MAC theo docs ZaloPay (anh implement thật theo spec)
    // ví dụ: const mac = createHmac('sha256', key1).update(data).digest('hex');
    const dataToSign = `${appId}|${appTransId}|${appUser}|${amount}|${payload.app_time}`;
    const mac = this.makeMac(key1, dataToSign);

    const body = {
      ...payload,
      mac,
    };

    let respData: any;
    try {
      const resp$ = this.httpService.post(endpoint, body);
      const resp = await firstValueFrom(resp$);
      respData = resp.data;
    } catch (e) {
      throw new BadRequestException('Failed to create ZaloPay order');
    }

    const checkoutUrl = respData?.order_url ?? respData?.zp_trans_token ?? '';

    return {
      checkoutUrl,
      metadata: {
        provider: 'ZALOPAY',
        appId,
        appTransId,
        amount,
        zaloResponse: respData,
      },
      raw: respData,
    };
  }

  private makeMac(key: string, data: string): string {
    // TODO: tự implement theo crypto Node.js
    // giữ stub cho compile:
    return data; // thay bằng HMAC thực tế
  }
}
