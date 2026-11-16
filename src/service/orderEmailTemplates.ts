import { IOrder } from '../models/order.model';

/**
 * Formats numeric amounts strictly into Sri Lankan Rupees (LKR) standard format.
 * Example: 18500 -> "Rs. 18,500.00"
 */
export const formatLkr = (amount: number): string => {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `Rs. ${safeAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Common HTML email wrapper maintaining STRIDEX branding
 */
const renderEmailLayout = (title: string, bodyContent: string): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F2FAF4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #26352D;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F2FAF4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #FFFFFF; border: 1px solid #DCEBE0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 24px rgba(38, 53, 45, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 36px 20px; text-align: center; border-bottom: 1px solid #F2FAF4; background-color: #FFFFFF;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #26352D;">
                STRIDEX<span style="color: #72C98A;">.</span>
              </h1>
              <p style="margin: 6px 0 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #718078;">
                Step Into Your Style
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 36px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #F2FAF4; text-align: center; border-top: 1px solid #DCEBE0;">
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #26352D;">
                STRIDEX Footwear Sri Lanka
              </p>
              <p style="margin: 0; font-size: 11px; color: #718078; line-height: 16px;">
                Colombo Flagship Showroom & Fulfillment Center<br>
                For questions, visit our store or check your <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/orders" style="color: #72C98A; text-decoration: none; font-weight: 600;">My Orders</a> page.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * 1. ORDER CONFIRMATION EMAIL TEMPLATE
 */
export const generateOrderConfirmationEmail = (
  order: IOrder
): { subject: string; html: string; text: string } => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const orderDetailsUrl = `${frontendUrl}/orders`;
  const subject = `STRIDEX – Order Confirmed #${order.orderNumber}`;

  const customerName = order.customerDetails?.fullName || 'Valued Customer';
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Render items rows
  const itemsHtml = (order.items || [])
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #F2FAF4;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            ${
              item.image
                ? `<td width="64" valign="top" style="padding-right: 14px;">
                     <img src="${item.image}" alt="${item.name}" width="56" height="56" style="border-radius: 12px; object-fit: cover; border: 1px solid #DCEBE0; display: block;" />
                   </td>`
                : ''
            }
            <td valign="top">
              <strong style="color: #26352D; font-size: 14px; display: block; line-height: 18px;">${item.name}</strong>
              <span style="display: block; font-size: 12px; color: #718078; margin-top: 3px;">
                Size: <strong style="color: #26352D;">${item.size}</strong> &bull; Color: <strong style="color: #26352D;">${item.color}</strong> &bull; Qty: <strong style="color: #26352D;">${item.quantity}</strong>
              </span>
              <span style="font-size: 12px; color: #718078;">
                Unit: ${formatLkr(item.unitPrice)}
              </span>
            </td>
            <td width="90" align="right" valign="top" style="font-size: 14px; font-weight: 700; color: #26352D;">
              ${formatLkr(item.totalPrice)}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('');

  // Payment method badge text
  const paymentMethodLabel =
    order.paymentMethod === 'CASH_ON_DELIVERY'
      ? 'Cash on Delivery (COD)'
      : order.paymentMethod === 'BANK_TRANSFER'
      ? 'Direct Bank Transfer'
      : order.paymentMethod;

  // Bank transfer instructions block if applicable
  const bankInstructionsHtml =
    order.paymentMethod === 'BANK_TRANSFER'
      ? `<div style="background-color: #F2FAF4; border: 1px solid #BDECCB; border-radius: 14px; padding: 16px; margin: 20px 0 0;">
          <strong style="color: #26352D; font-size: 13px; display: block; margin-bottom: 6px;">
            🏦 Direct Bank Transfer Instructions:
          </strong>
          <p style="margin: 0 0 10px; font-size: 12px; color: #718078; line-height: 18px;">
            Please transfer <strong>${formatLkr(order.finalTotal)}</strong> using your Order Number <strong style="color: #26352D;">${order.orderNumber}</strong> as the payment reference.
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 11px; color: #26352D;">
            <tr>
              <td width="50%" style="padding-right: 8px;">
                <strong>Commercial Bank of Ceylon</strong><br>
                Acc: 1000-8492-3810<br>
                Name: STRIDEX Footwear Ltd
              </td>
              <td width="50%">
                <strong>Hatton National Bank (HNB)</strong><br>
                Acc: 0390-1029-4821<br>
                Name: STRIDEX Footwear Ltd
              </td>
            </tr>
          </table>
        </div>`
      : '';

  const bodyContent = `
    <!-- Greeting -->
    <div style="margin-bottom: 22px;">
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #72C98A; letter-spacing: 1.5px; display: block; margin-bottom: 4px;">
        Order Confirmation
      </span>
      <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #26352D;">
        Thank you for your order, ${customerName}!
      </h2>
      <p style="margin: 0; font-size: 14px; line-height: 22px; color: #718078;">
        We have received your order and allocated your footwear from our warehouse. Below is your complete order receipt.
      </p>
    </div>

    <!-- Order Meta Banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F2FAF4; border: 1px solid #DCEBE0; border-radius: 14px; padding: 14px 18px; margin-bottom: 24px;">
      <tr>
        <td width="50%">
          <span style="font-size: 11px; color: #718078; text-transform: uppercase; letter-spacing: 0.5px; display: block;">Order Number</span>
          <strong style="font-size: 15px; color: #26352D; font-family: monospace;">${order.orderNumber}</strong>
        </td>
        <td width="50%" align="right">
          <span style="font-size: 11px; color: #718078; text-transform: uppercase; letter-spacing: 0.5px; display: block;">Order Date</span>
          <strong style="font-size: 13px; color: #26352D;">${orderDate}</strong>
        </td>
      </tr>
    </table>

    <!-- Items Section -->
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #26352D;">
        Ordered Items
      </h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        ${itemsHtml}
      </table>
    </div>

    <!-- Pricing Summary -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F2FAF4; border-radius: 14px; padding: 16px 20px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 4px 0; font-size: 13px; color: #718078;">Total Item Subtotal</td>
        <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #26352D;">${formatLkr(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-size: 13px; color: #718078;">Delivery Charge</td>
        <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 600; color: #26352D;">
          ${order.deliveryFee === 0 ? '<span style="color: #72C98A; font-weight: 700;">FREE</span>' : formatLkr(order.deliveryFee)}
        </td>
      </tr>
      ${
        order.voucherDiscount && order.voucherDiscount > 0
          ? `<tr>
              <td style="padding: 4px 0; font-size: 13px; color: #72C98A; font-weight: 600;">
                Gift Voucher Discount (${order.voucherCode || 'Redeemed'})
              </td>
              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 700; color: #72C98A;">
                -${formatLkr(order.voucherDiscount)}
              </td>
            </tr>`
          : ''
      }
      <tr>
        <td colspan="2" style="padding: 8px 0 4px; border-bottom: 1px solid #DCEBE0;"></td>
      </tr>
      <tr>
        <td style="padding: 8px 0 0; font-size: 15px; font-weight: 800; color: #26352D;">Final Total</td>
        <td align="right" style="padding: 8px 0 0; font-size: 17px; font-weight: 800; color: #26352D;">${formatLkr(order.finalTotal)}</td>
      </tr>
    </table>

    <!-- Delivery & Payment Information -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
      <tr>
        <!-- Delivery Card -->
        <td width="50%" valign="top" style="padding-right: 8px;">
          <div style="border: 1px solid #DCEBE0; border-radius: 14px; padding: 16px; min-height: 120px;">
            <strong style="color: #26352D; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
              🚚 Delivery Details
            </strong>
            <p style="margin: 0; font-size: 12px; line-height: 18px; color: #718078;">
              <strong style="color: #26352D;">${order.customerDetails?.fullName}</strong><br>
              ${order.customerDetails?.deliveryAddress}<br>
              ${order.customerDetails?.city}, ${order.customerDetails?.postalCode}<br>
              Phone: ${order.customerDetails?.phone}
            </p>
          </div>
        </td>

        <!-- Payment Card -->
        <td width="50%" valign="top" style="padding-left: 8px;">
          <div style="border: 1px solid #DCEBE0; border-radius: 14px; padding: 16px; min-height: 120px;">
            <strong style="color: #26352D; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
              💳 Payment Information
            </strong>
            <p style="margin: 0; font-size: 12px; line-height: 18px; color: #718078;">
              Method: <strong style="color: #26352D;">${paymentMethodLabel}</strong><br>
              Status: <strong style="color: ${order.paymentStatus === 'PAID' ? '#72C98A' : '#C05621'};">${order.paymentStatus}</strong><br>
              Total Due: <strong style="color: #26352D;">${formatLkr(order.finalTotal)}</strong>
            </p>
          </div>
        </td>
      </tr>
    </table>

    ${bankInstructionsHtml}

    <!-- CTA Button -->
    <div style="text-align: center; margin: 32px 0 10px;">
      <a href="${orderDetailsUrl}" style="background-color: #72C98A; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; display: inline-block;">
        View Order Status Online &rarr;
      </a>
    </div>
  `;

  const html = renderEmailLayout(subject, bodyContent);

  const text = `STRIDEX – Order Confirmed #${order.orderNumber}
Thank you for your order, ${customerName}!

Order Number: ${order.orderNumber}
Order Date: ${orderDate}
Final Total: ${formatLkr(order.finalTotal)}
Payment Method: ${paymentMethodLabel}
Payment Status: ${order.paymentStatus}

Items:
${order.items.map((i) => `- ${i.name} | Size: ${i.size} | Color: ${i.color} | Qty: ${i.quantity} | Total: ${formatLkr(i.totalPrice)}`).join('\n')}

Subtotal: ${formatLkr(order.subtotal)}
Delivery Fee: ${formatLkr(order.deliveryFee)}
${order.voucherDiscount ? `Voucher Discount: -${formatLkr(order.voucherDiscount)} (${order.voucherCode})\n` : ''}Final Total: ${formatLkr(order.finalTotal)}

Delivery Address:
${order.customerDetails?.fullName}
${order.customerDetails?.deliveryAddress}, ${order.customerDetails?.city}
Phone: ${order.customerDetails?.phone}

View your order online: ${orderDetailsUrl}

Thank you,
STRIDEX Team
Step Into Your Style.`;

  return { subject, html, text };
};

/**
 * 2. ORDER STATUS UPDATE EMAIL TEMPLATE
 */
export const generateOrderStatusUpdateEmail = (
  order: IOrder,
  previousStatus: string,
  note?: string
): { subject: string; html: string; text: string } => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const orderDetailsUrl = `${frontendUrl}/orders`;
  const subject = `STRIDEX – Order #${order.orderNumber} is now ${order.orderStatus}`;

  const customerName = order.customerDetails?.fullName || 'Valued Customer';

  // Customized status descriptions
  let statusBadgeColor = '#72C98A';
  let statusHeadline = `Your Order is now ${order.orderStatus}`;
  let statusExplanation = 'Your order status has been updated in our system.';

  switch (order.orderStatus) {
    case 'CONFIRMED':
      statusBadgeColor = '#72C98A';
      statusHeadline = 'Order Confirmed & Allocated';
      statusExplanation =
        'Your order has been verified and your footwear has been allocated directly from our warehouse stock.';
      break;
    case 'PROCESSING':
      statusBadgeColor = '#4299E1';
      statusHeadline = 'Order Processing in Warehouse';
      statusExplanation =
        'Our fulfillment team is carefully inspecting, packing, and preparing your footwear for courier pickup.';
      break;
    case 'SHIPPED':
      statusBadgeColor = '#ED8936';
      statusHeadline = 'Your Footwear is On The Way!';
      statusExplanation =
        'Your order has been handed over to our island-wide courier delivery partner. Expected delivery is 24–48h in Colombo, 2–4 days island-wide.';
      break;
    case 'DELIVERED':
      statusBadgeColor = '#38A169';
      statusHeadline = 'Order Delivered Successfully';
      statusExplanation =
        'Your STRIDEX footwear has been successfully delivered. Thank you for stepping into your style with us!';
      break;
    case 'CANCELLED':
      statusBadgeColor = '#E53E3E';
      statusHeadline = 'Order Cancelled';
      statusExplanation =
        'Your order has been cancelled. Any allocated inventory stock has been safely restored.';
      break;
  }

  const bodyContent = `
    <!-- Status Header -->
    <div style="margin-bottom: 24px;">
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${statusBadgeColor}; letter-spacing: 1.5px; display: block; margin-bottom: 4px;">
        Order Update
      </span>
      <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #26352D;">
        ${statusHeadline}
      </h2>
      <p style="margin: 0; font-size: 14px; line-height: 22px; color: #718078;">
        Hello ${customerName}, ${statusExplanation}
      </p>
    </div>

    <!-- Status Change Card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F2FAF4; border: 1px solid #DCEBE0; border-radius: 14px; padding: 18px 20px; margin-bottom: 24px;">
      <tr>
        <td width="35%">
          <span style="font-size: 11px; color: #718078; text-transform: uppercase; display: block;">Previous Status</span>
          <strong style="font-size: 13px; color: #718078;">${previousStatus}</strong>
        </td>
        <td width="10%" align="center" style="font-size: 16px; color: #72C98A;">
          &rarr;
        </td>
        <td width="55%" align="right">
          <span style="font-size: 11px; color: #718078; text-transform: uppercase; display: block;">New Status</span>
          <strong style="font-size: 15px; color: ${statusBadgeColor}; text-transform: uppercase; font-weight: 800;">
            ${order.orderStatus}
          </strong>
        </td>
      </tr>
      ${
        note
          ? `<tr>
              <td colspan="3" style="padding-top: 12px; border-top: 1px solid #DCEBE0; margin-top: 12px;">
                <span style="font-size: 11px; color: #718078; display: block;">Note from STRIDEX Team:</span>
                <span style="font-size: 13px; color: #26352D; font-style: italic;">"${note}"</span>
              </td>
            </tr>`
          : ''
      }
    </table>

    <!-- Order Summary Details -->
    <div style="border: 1px solid #DCEBE0; border-radius: 14px; padding: 18px; margin-bottom: 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; line-height: 20px;">
        <tr>
          <td style="color: #718078;">Order Number:</td>
          <td align="right"><strong style="color: #26352D; font-family: monospace;">${order.orderNumber}</strong></td>
        </tr>
        <tr>
          <td style="color: #718078;">Total Footwear Items:</td>
          <td align="right"><strong style="color: #26352D;">${order.items?.length || 0} pair(s)</strong></td>
        </tr>
        <tr>
          <td style="color: #718078;">Order Total:</td>
          <td align="right"><strong style="color: #26352D;">${formatLkr(order.finalTotal)}</strong></td>
        </tr>
        <tr>
          <td style="color: #718078;">Delivery Destination:</td>
          <td align="right"><span style="color: #26352D;">${order.customerDetails?.city || 'Sri Lanka'}</span></td>
        </tr>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 32px 0 10px;">
      <a href="${orderDetailsUrl}" style="background-color: #72C98A; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; display: inline-block;">
        Track Order on STRIDEX &rarr;
      </a>
    </div>
  `;

  const html = renderEmailLayout(subject, bodyContent);

  const text = `STRIDEX – Order Status Update #${order.orderNumber}
Hello ${customerName},

${statusHeadline}
${statusExplanation}

Previous Status: ${previousStatus}
New Status: ${order.orderStatus}
${note ? `Note: ${note}\n` : ''}
Order Total: ${formatLkr(order.finalTotal)}
Track your order: ${orderDetailsUrl}

Thank you,
STRIDEX Team
Step Into Your Style.`;

  return { subject, html, text };
};

/**
 * 3. PAYMENT CONFIRMATION EMAIL TEMPLATE (Direct Bank Transfer Verified / COD Settled)
 */
export const generatePaymentConfirmationEmail = (
  order: IOrder,
  note?: string
): { subject: string; html: string; text: string } => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const orderDetailsUrl = `${frontendUrl}/orders`;
  const subject = `STRIDEX – Payment Received for Order #${order.orderNumber}`;

  const customerName = order.customerDetails?.fullName || 'Valued Customer';

  const bodyContent = `
    <!-- Header -->
    <div style="margin-bottom: 24px;">
      <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #72C98A; letter-spacing: 1.5px; display: block; margin-bottom: 4px;">
        Payment Confirmed
      </span>
      <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #26352D;">
        Payment Received Successfully!
      </h2>
      <p style="margin: 0; font-size: 14px; line-height: 22px; color: #718078;">
        Hello ${customerName}, your payment for order <strong>#${order.orderNumber}</strong> has been verified by the STRIDEX finance department.
      </p>
    </div>

    <!-- Payment Badge Card -->
    <div style="background-color: #F2FAF4; border: 1px solid #BDECCB; border-radius: 14px; padding: 20px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 12px; color: #718078; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Amount Verified</span>
      <strong style="font-size: 26px; font-weight: 800; color: #26352D; display: block; margin-bottom: 8px;">
        ${formatLkr(order.finalTotal)}
      </strong>
      <span style="background-color: #72C98A; color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; display: inline-block;">
        Payment Status: PAID
      </span>
      ${
        note
          ? `<p style="margin: 12px 0 0; font-size: 12px; color: #718078; font-style: italic;">
               Verification Note: "${note}"
             </p>`
          : ''
      }
    </div>

    <!-- Order Summary Recap -->
    <div style="border: 1px solid #DCEBE0; border-radius: 14px; padding: 18px; margin-bottom: 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; line-height: 20px;">
        <tr>
          <td style="color: #718078;">Order Number:</td>
          <td align="right"><strong style="color: #26352D; font-family: monospace;">${order.orderNumber}</strong></td>
        </tr>
        <tr>
          <td style="color: #718078;">Payment Method:</td>
          <td align="right"><strong style="color: #26352D;">${order.paymentMethod === 'BANK_TRANSFER' ? 'Direct Bank Transfer' : order.paymentMethod}</strong></td>
        </tr>
        <tr>
          <td style="color: #718078;">Current Order Status:</td>
          <td align="right"><strong style="color: #72C98A;">${order.orderStatus}</strong></td>
        </tr>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 32px 0 10px;">
      <a href="${orderDetailsUrl}" style="background-color: #72C98A; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; display: inline-block;">
        View My Order & Receipt &rarr;
      </a>
    </div>
  `;

  const html = renderEmailLayout(subject, bodyContent);

  const text = `STRIDEX – Payment Received for Order #${order.orderNumber}
Hello ${customerName},

Your payment of ${formatLkr(order.finalTotal)} for order #${order.orderNumber} has been verified successfully.
Payment Status: PAID
${note ? `Note: ${note}\n` : ''}
View your order details: ${orderDetailsUrl}

Thank you,
STRIDEX Team
Step Into Your Style.`;

  return { subject, html, text };
};
