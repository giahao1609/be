// import { BadRequestException, Injectable } from '@nestjs/common';
// import * as crypto from 'crypto';
// import axios from 'axios';
// import { TransactionsRepository } from '../transactions/transactions.repository,'; 
// import { TypeTransaction } from 'src/enums/type-transaction.enum';
// import { PaymentMethod } from 'src/enums/paymentMethod.enum';
// import { StatusTransaction } from 'src/enums/status-transaction.enum';
// import { UsersRepository } from '../users/user.repository';
// import { CreateTransactionDto } from '../transactions/dto/create-transaction.dto';

// const moment = require('moment');

// @Injectable()
// export class ZalopayPaymentService {
//   private readonly config = {
//     app_id: '553',
//     key1: '9phuAOYhan4urywHTh0ndEXiV3pKHr5Q',
//     key2: 'Iyz2habzyr7AG8SgvoBCbKwKi3UzlLi3',
//     endpoint: 'https://sandbox.zalopay.com.vn/v001/tpe/createorder',

//     // anh chỉnh 2 cái dưới cho đúng với FE/BE của anh
//     redirectUrl: 'http://localhost:3000/payment-return',
//     callbackUrl: 'http://localhost:3001/api/v1/payments/zalopay/callback',
//   };

//   constructor(
//     private readonly transactionRepository: TransactionsRepository,
//     private readonly userRepository: UsersRepository,
//   ) {}

//   /**
//    * Tạo payment ZaloPay cho deposit
//    */
//   async createZaloPayPayment(amount: number, userId: string) {
//     const items = [{}];
//     const transID = Math.floor(Math.random() * 1000000);

//     // lưu transaction trước
//     const newPayment = await this.transactionRepository.createTransaction({
//       userId: userId,
//       amount: amount,
//       paymentMethod: PaymentMethod.ZALOPAY,
//       type: TypeTransaction.DEPOSIT,
//       rentalId: null,
//     });

//     const embed_data = {
//       redirecturl: this.config.redirectUrl,
//       transactionId: newPayment._id.toString(),
//     };

//     const order: any = {
//       app_id: this.config.app_id,
//       app_trans_id: `${moment().format('YYMMDD')}_${transID}`, // YYMMDD_xxxxxx
//       app_user: 'Bikey',
//       app_time: Date.now(), // miliseconds
//       item: JSON.stringify(items),
//       embed_data: JSON.stringify(embed_data),
//       amount: amount,
//       description: `Bikey - Payment for the deposit #${transID}`,
//       bank_code: '',
//       callback_url: this.config.callbackUrl,
//       mac: '',
//     };

//     // appid|app_trans_id|appuser|amount|apptime|embeddata|item
//     const data =
//       this.config.app_id +
//       '|' +
//       order.app_trans_id +
//       '|' +
//       order.app_user +
//       '|' +
//       order.amount +
//       '|' +
//       order.app_time +
//       '|' +
//       order.embed_data +
//       '|' +
//       order.item;

//     order.mac = this.createSecureHash(data, this.config.key1);

//     try {
//       const result = await axios.post(this.config.endpoint, null, {
//         params: order,
//       });
//       return result.data; // có order_url, zp_trans_token,...
//     } catch (error) {
//       console.error('ZaloPay create order error', error?.response?.data || error);
//       throw new BadRequestException('Failed to create ZaloPay order');
//     }
//   }

//   createSecureHash(notEncodeData: string, key: string) {
//     return crypto.createHmac('sha256', key).update(notEncodeData).digest('hex');
//   }

//   /**
//    * Callback từ ZaloPay
//    * - Verify MAC với key2
//    * - Update transaction status
//    * - Cộng tiền vào wallet user nếu success
//    */
//   async callBackZaloPay(req: any) {
//     let result = {
//       return_code: 1,
//       return_message: 'success',
//     };

//     let embedData: any;

//     try {
//       const dataStr = req.body.data;
//       const reqMac = req.body.mac;

//       const mac = this.createSecureHash(dataStr, this.config.key2);

//       const dataJson = JSON.parse(dataStr);
//       embedData = JSON.parse(dataJson['embed_data']);

//       // ví dụ payload:
//       // {
//       //   app_id: 2554,
//       //   app_trans_id: '250306_882955',
//       //   app_time: 1741277732805,
//       //   app_user: 'Bikey',
//       //   amount: 30000,
//       //   embed_data: '{"redirecturl":"http://localhost:3000/payment-return","transactionId":"..."}',
//       //   item: '[{}]',
//       //   zp_trans_id: 250306000021833,
//       //   ...
//       // }

//       // kiểm tra callback hợp lệ (đến từ ZaloPay server)
//       if (reqMac !== mac) {
//         console.log('mac not equal');
//         result.return_code = -1;
//         result.return_message = 'mac not equal';

//         // mark transaction FAILED
//         if (embedData?.transactionId) {
//           await this.transactionRepository.updateStatus(
//             embedData['transactionId'],
//             StatusTransaction.FAILED,
//           );
//         }

//         throw new BadRequestException('mac not equal');
//       } else {
//         // thanh toán thành công → update transaction + cộng tiền
//         const transaction = await this.transactionRepository.updateStatus(
//           embedData['transactionId'],
//           StatusTransaction.SUCCESS,
//         );
//         if (transaction) {
//           await this.userRepository.updateWallet(
//             transaction.userId.toString(),
//             transaction.amount,
//           );
//         }

//         result.return_code = 1;
//         result.return_message = 'success';
//       }
//     } catch (ex: any) {
//       console.error('ZaloPay callback error', ex);

//       result.return_code = 0; // ZaloPay server sẽ callback lại (tối đa 3 lần)
//       result.return_message = ex.message;

//       try {
//         const dataStr = req.body.data;
//         const dataJson = JSON.parse(dataStr);
//         embedData = JSON.parse(dataJson['embed_data']);
//         if (embedData?.transactionId) {
//           await this.transactionRepository.updateStatus(
//             embedData['transactionId'],
//             StatusTransaction.FAILED,
//           );
//         }
//       } catch (e) {
//         // ignore
//       }

//       return result;
//     }

//     // trả kết quả cho ZaloPay server
//     return result;
//   }
// }
