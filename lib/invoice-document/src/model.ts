export type InvoiceLanguage = "ar" | "en";
/** Invoice facts only: the design contract cannot supply any of these values. */
export type InvoiceFacts = {
  invoiceNumber: string; historical?: string; originalInvoiceNumber?: string | null;
  orderNumber?: string | null; distributorName?: string | null; distributorId?: number | null;
  contractId?: number | null; uploadedContractFileId?: number | null;
  contractNumber?: string | null; contractType?: string | null;
  paymentTerm?: string | null; paymentDays?: number | null; exhibitionName?: string | null;
  sellerName: string; sellerVatNumber: string; buyerName: string | null; buyerPhone?: string | null;
  buyerAddress: string | null; buyerTaxNumber: string | null; buyerCommercialRegistrationNumber: string | null;
  issueDatetime: Date | string; dueDate: string | null;
  subtotal: number; discountAmount?: number; shippingAmount?: number;
  vatAmount: number; taxTreatment?: string | null; vatRate?: number | null;
  contractDiscountPercent?: number | null; invoiceDiscountPercent?: number | null;
  discountOverrideReason?: string | null; discountOverrideByAdminId?: number | null;
  discountOverrideAt?: string | Date | null;
  couponCode?: string | null; couponDiscountAmount?: number | null;
  manualDiscountPercent?: number | null; manualDiscountAmount?: number | null;
  totalAmount: number; paidAmount: number; outstandingAmount: number;
  cancelledAt?: string | Date | null; cancellationReason?: string | null;
  cancelledByName?: string | null; cancelledByAdminId?: number | null;
  showShipping?: boolean;
  shippingDetails?: string | null; notes?: string | null;
  qrCodeData?: string;
  items: Array<{ productName: string; productNameEn?: string | null; quantity: number; unitPrice: number; totalAmount?: number }>;
};
export type TotalRow = { ar: string; en: string; value: number };
export const businessDate = (date: Date | string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh", year:"numeric",month:"2-digit",day:"2-digit",
}).format(new Date(date));
export function invoiceTotalRows(i: InvoiceFacts): TotalRow[] {
  const rows: TotalRow[] = [], push = (ar: string,en: string,value: number) => rows.push({ar,en,value});
  const rate = i.vatRate ?? (i.taxTreatment === "international" ? 0 : 15);
  const vatAr = i.vatAmount > 0 && rate <= 0 ? "ضريبة القيمة المضافة (مبلغ تاريخي)" : `ضريبة القيمة المضافة (${rate}%)`;
  const vatEn = i.vatAmount > 0 && rate <= 0 ? "VAT (historical amount)" : `VAT (${rate}%)`;
  const sale = i.couponDiscountAmount != null || i.manualDiscountAmount != null;
  const contract = Boolean(i.contractId || i.uploadedContractFileId || i.contractNumber || i.contractDiscountPercent != null || i.invoiceDiscountPercent != null) && !i.orderNumber;
  const inclusive = Boolean(i.orderNumber) && Math.round(i.subtotal*100)+Math.round(i.vatAmount*100) === Math.round(i.totalAmount*100);
  const international = i.taxTreatment === "international" && i.vatAmount === 0;
  if (sale) {
    push("إجمالي المنتجات قبل الخصم (شامل الضريبة)","Products before discounts (VAT included)",i.totalAmount-(i.shippingAmount??0)+(i.discountAmount??0));
    if (i.couponDiscountAmount != null) push(`خصم الكوبون${i.couponCode ? ` (${i.couponCode})`:""}`,`Coupon${i.couponCode ? ` (${i.couponCode})`:""}`,-i.couponDiscountAmount);
    if (i.manualDiscountAmount != null) push(`خصم يدوي (${i.manualDiscountPercent??i.invoiceDiscountPercent??0}%)`,`Manual discount (${i.manualDiscountPercent??i.invoiceDiscountPercent??0}%)`,-i.manualDiscountAmount);
    if ((i.shippingAmount??0)>0) push("الشحن / رسوم الاستلام (دون خصم)","Delivery / pickup (VAT included)",i.shippingAmount!);
    push("صافي المجموع الفرعي بعد الخصم","Net subtotal after discounts",i.subtotal); push(vatAr,vatEn,i.vatAmount);
  } else if (i.historical === "yes") {
    push("صافي المبلغ الأصلي","Original net (after discount)",i.subtotal);
    push(i.invoiceDiscountPercent!=null ? `خصم استثنائي للتسجيل (${i.invoiceDiscountPercent}%)` : i.contractDiscountPercent!=null ? `الخصم المحتسب من مرجع العقد (${i.contractDiscountPercent}%)` : "الخصم الأصلي (ضمن الصافي)",
      i.invoiceDiscountPercent!=null ? `Prior override (${i.invoiceDiscountPercent}%)` : i.contractDiscountPercent!=null ? `Contract ref. discount (${i.contractDiscountPercent}%)` : "Original discount (already included)",i.discountAmount??0);
    push("الضريبة الأصلية","Original VAT",i.vatAmount);
  } else if (contract) {
    push(international ? "الإجمالي قبل الخصم" : "الإجمالي قبل الخصم (شامل الضريبة)",international?"Gross before discount":"Gross before discount (VAT included)",i.items.reduce((s,r)=>s+r.unitPrice*r.quantity,0));
    push(i.invoiceDiscountPercent!=null ? `خصم استثنائي لهذه الفاتورة (${i.invoiceDiscountPercent}%)` : `خصم العقد (${i.contractDiscountPercent??0}%)`,
      i.invoiceDiscountPercent!=null ? `Invoice override (${i.invoiceDiscountPercent}%)` : `Contract discount (${i.contractDiscountPercent??0}%)`,-(i.discountAmount??0));
    push("صافي المجموع الفرعي بعد الخصم","Net subtotal after discount",i.subtotal); push(vatAr,vatEn,i.vatAmount);
  } else {
    push("المجموع الفرعي","Subtotal",i.subtotal); push(vatAr,vatEn,i.vatAmount);
  }
  if ((i.shippingAmount??0)>0 && !inclusive && !sale) push("الشحن","Shipping",i.shippingAmount!);
  if(i.historical!=="yes" && !inclusive && !contract && !sale) push("الخصم","Discount",-(i.discountAmount??0));
  if(i.paidAmount>0 && i.paidAmount<i.totalAmount) {
    push("المبلغ المدفوع","Amount Paid",i.paidAmount);
    if(i.outstandingAmount>0 && i.outstandingAmount<i.totalAmount) push("الرصيد المستحق","Amount Due",i.outstandingAmount);
  }
  return rows;
}
export function sampleInvoice(long = false): InvoiceFacts {
  return {
    invoiceNumber:"M-000123", sellerName:"مسك اللولو", sellerVatNumber:"300000000000003",
    buyerName:"عميل تجريبي — شركة العطور", buyerPhone:"+966500000000",
    buyerAddress:"الرياض · العنوان الوطني RAAA1234",buyerTaxNumber:"310000000000003",buyerCommercialRegistrationNumber:"1010000000",
    issueDatetime:"2026-10-03T09:00:00.000Z",dueDate:"2026-10-31",
    subtotal:200,vatAmount:30,vatRate:15,totalAmount:230,paidAmount:0,outstandingAmount:230,
    items:Array.from({length:long?55:2},(_,n)=>({productName:long?`عطر مسك اللولو — وصف طويل للمنتج ورائحة مميزة رقم ${n+1}`:"عطر مسك اللولو", productNameEn:"Musk Ellolo perfume", quantity:1,unitPrice:115,totalAmount:115})),
    notes:"شكراً لاختياركم مسك اللولو. هذه بيانات معاينة فقط وليست فاتورة صادرة.",
  };
}